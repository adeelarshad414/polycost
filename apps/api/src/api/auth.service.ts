import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { ApiForbiddenError, ApiUnauthorizedError, ApiValidationError } from './api-errors';
import { ApiDatabaseRepository, LocalAccountWithPassword } from './api-database.repository';
import {
  AccountSessionRecord,
  AuthIdentity,
  AuthMeResponse,
  AuthSessionResponse,
  RequestWithAuth,
  SsoConfigurationStatus,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRole,
} from './auth.types';
import { hashPassword, verifyPassword } from './password-hash';

interface AuthRequestMetadata {
  ip?: string;
  userAgent?: string;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TEAM_ADMIN_ROLES = new Set<TeamRole>(['owner', 'admin']);
const TEAM_OWNER_ROLE: TeamRole = 'owner';
const INVITABLE_ROLES: Array<Exclude<TeamRole, 'owner'>> = ['admin', 'member', 'viewer'];
const TEAM_ROLES: TeamRole[] = ['owner', 'admin', 'member', 'viewer'];
const INVITATION_TTL_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async register(body: unknown, metadata: AuthRequestMetadata = {}): Promise<AuthSessionResponse> {
    if (!this.configService.get('AUTH_LOCAL_REGISTRATION_ENABLED', { infer: true })) {
      throw new ApiForbiddenError('Local registration is disabled for this deployment');
    }

    const input = parseRegisterBody(
      body,
      this.configService.get('AUTH_PASSWORD_MIN_LENGTH', { infer: true }),
    );
    const existing = await this.repository.findLocalAccountByEmail(input.email);

    if (existing) {
      throw new ApiValidationError('email is already registered', [
        {
          field: 'email',
          issue: 'must be unique',
        },
      ]);
    }

    const account = await this.repository.createLocalAccountWithTeam({
      email: input.email,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      externalSubjectHash: sha256(`local:${input.email}`),
      passwordHash: hashPassword(input.password),
      teamName: input.teamName,
      teamSlug: teamSlug(input.teamName, input.email),
    });

    return this.issueSession(account, metadata);
  }

  async login(body: unknown, metadata: AuthRequestMetadata = {}): Promise<AuthSessionResponse> {
    const input = parseLoginBody(body);
    const account = await this.repository.findLocalAccountByEmail(input.email);

    if (!account || account.status !== 'active') {
      throw new ApiUnauthorizedError('Invalid email or password');
    }

    if (account.lockedUntil && Date.parse(account.lockedUntil) > Date.now()) {
      throw new ApiUnauthorizedError('Account is temporarily locked');
    }

    if (!verifyPassword(input.password, account.passwordHash)) {
      const failedAttempts = account.failedAttempts + 1;
      const maxAttempts = this.configService.get('AUTH_MAX_FAILED_LOGIN_ATTEMPTS', {
        infer: true,
      });
      const lockedUntil =
        failedAttempts >= maxAttempts
          ? new Date(
              Date.now() + this.configService.get('AUTH_LOCKOUT_MINUTES', { infer: true }) * 60_000,
            ).toISOString()
          : undefined;

      await this.repository.recordFailedLogin({
        accountId: account.accountId,
        failedAttempts,
        ...(lockedUntil ? { lockedUntil } : {}),
      });
      throw new ApiUnauthorizedError('Invalid email or password');
    }

    await this.repository.resetFailedLogin(account.accountId);

    return this.issueSession(account, metadata);
  }

  async authenticateRequest(request: RequestWithAuth | undefined): Promise<AuthIdentity> {
    const token = bearerToken(request?.headers);

    if (!token) {
      throw new ApiUnauthorizedError('Bearer session token is required');
    }

    const identity = await this.repository.resolveSession(sha256(token), new Date().toISOString());

    if (!identity) {
      throw new ApiUnauthorizedError('Session is expired or invalid');
    }

    return identity;
  }

  async me(identity: AuthIdentity): Promise<AuthMeResponse> {
    const teams = await this.repository.listAccountTeams(identity.accountId);
    const activeTeam = identity.teamId
      ? teams.find((team) => team.teamId === identity.teamId)
      : undefined;

    return {
      account: {
        id: identity.accountId,
        email: identity.email,
        ...(identity.displayName ? { displayName: identity.displayName } : {}),
      },
      ...(activeTeam
        ? {
            activeTeam: {
              id: activeTeam.teamId,
              name: activeTeam.teamName,
              role: activeTeam.role,
            },
          }
        : {}),
      teams,
      session: {
        id: identity.sessionId,
        expiresAt: identity.expiresAt,
      },
    };
  }

  async logout(identity: AuthIdentity): Promise<{ revoked: true }> {
    await this.repository.revokeSession(identity.sessionId, new Date().toISOString());

    return {
      revoked: true,
    };
  }

  async listSessions(identity: AuthIdentity): Promise<AccountSessionRecord[]> {
    return this.repository.listAccountSessions(
      identity.accountId,
      identity.sessionId,
      new Date().toISOString(),
    );
  }

  async revokeOtherSessions(identity: AuthIdentity): Promise<{ revoked: number }> {
    const revoked = await this.repository.revokeOtherSessions({
      accountId: identity.accountId,
      currentSessionId: identity.sessionId,
      revokedAt: new Date().toISOString(),
    });

    return { revoked };
  }

  async listTeamMembers(teamId: string, identity: AuthIdentity): Promise<TeamMemberRecord[]> {
    await this.requireTeamAdmin(identity, teamId);

    return this.repository.listTeamMembers(teamId);
  }

  async inviteTeamMember(
    teamId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<TeamInvitationRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const input = parseInviteBody(body);
    const inviteToken = randomBytes(32).toString('base64url');
    const invitation = await this.repository.createTeamInvitation({
      teamId,
      email: input.email,
      role: input.role,
      tokenHash: sha256(inviteToken),
      invitedByAccountId: identity.accountId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
    });

    return {
      ...invitation,
      inviteToken,
    };
  }

  async listTeamInvitations(
    teamId: string,
    identity: AuthIdentity,
  ): Promise<TeamInvitationRecord[]> {
    await this.requireTeamAdmin(identity, teamId);

    return this.repository.listTeamInvitations(teamId);
  }

  async acceptInvitation(body: unknown, identity: AuthIdentity): Promise<TeamInvitationRecord> {
    const token = parseInvitationToken(body);
    const invitation = await this.repository.findPendingInvitationByTokenHash(
      sha256(token),
      new Date().toISOString(),
    );

    if (!invitation) {
      throw new ApiValidationError('Invitation is invalid or expired', [
        {
          field: 'token',
          issue: 'must reference a pending invitation',
        },
      ]);
    }

    if (invitation.email !== identity.email) {
      throw new ApiForbiddenError('Invitation belongs to a different account email');
    }

    return this.repository.acceptTeamInvitation({
      invitationId: invitation.id,
      accountId: identity.accountId,
      acceptedAt: new Date().toISOString(),
    });
  }

  async updateTeamMemberRole(
    teamId: string,
    accountId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<TeamMemberRecord> {
    const actor = await this.requireTeamAdmin(identity, teamId);
    const role = parseTeamRoleBody(body);
    const target = await this.repository.getTeamMembership({ accountId, teamId });

    if (!target) {
      throw new ApiValidationError('Team member was not found', [
        {
          field: 'accountId',
          issue: 'must belong to the selected team',
        },
      ]);
    }

    if (
      (target.role === TEAM_OWNER_ROLE || role === TEAM_OWNER_ROLE) &&
      actor.role !== TEAM_OWNER_ROLE
    ) {
      throw new ApiForbiddenError('Only team owners can manage owner roles');
    }

    if (target.role === TEAM_OWNER_ROLE && role !== TEAM_OWNER_ROLE) {
      await this.assertOwnerWillRemain(teamId);
    }

    const updated = await this.repository.updateTeamMemberRole({
      teamId,
      accountId,
      role,
    });

    if (!updated) {
      throw new ApiValidationError('Team member was not found', [
        {
          field: 'accountId',
          issue: 'must belong to the selected team',
        },
      ]);
    }

    return updated;
  }

  async removeTeamMember(
    teamId: string,
    accountId: string,
    identity: AuthIdentity,
  ): Promise<{ removed: true }> {
    const actor = await this.requireTeamAdmin(identity, teamId);
    const target = await this.repository.getTeamMembership({ accountId, teamId });

    if (!target) {
      throw new ApiValidationError('Team member was not found', [
        {
          field: 'accountId',
          issue: 'must belong to the selected team',
        },
      ]);
    }

    if (target.role === TEAM_OWNER_ROLE) {
      if (actor.role !== TEAM_OWNER_ROLE) {
        throw new ApiForbiddenError('Only team owners can remove owners');
      }

      await this.assertOwnerWillRemain(teamId);
    }

    await this.repository.removeTeamMember({ teamId, accountId });

    return { removed: true };
  }

  async ssoStatus(identity: AuthIdentity): Promise<SsoConfigurationStatus> {
    if (!identity.teamId) {
      throw new ApiForbiddenError('An active team is required to view SSO configuration');
    }

    const publicBaseUrl = this.configService.get('AUTH_PUBLIC_BASE_URL', { infer: true });
    const baseUrl = publicBaseUrl.replace(/\/$/, '');
    const configuredProviders = await this.repository.listSsoProviderConfigs(identity.teamId);

    return {
      localLoginEnabled: this.configService.get('AUTH_LOCAL_REGISTRATION_ENABLED', { infer: true }),
      oidcConfigured: Boolean(this.configService.get('AUTH_OIDC_ISSUER_URL', { infer: true })),
      samlConfigured: Boolean(this.configService.get('AUTH_SAML_ENTITY_ID', { infer: true })),
      configuredProviders,
      callbackUrls: {
        oidc: `${baseUrl}/api/v1/auth/sso/oidc/callback`,
        saml: `${baseUrl}/api/v1/auth/sso/saml/acs`,
      },
    };
  }

  private async issueSession(
    account: LocalAccountWithPassword,
    metadata: AuthRequestMetadata,
  ): Promise<AuthSessionResponse> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.configService.get('AUTH_SESSION_TTL_HOURS', { infer: true }) * 3_600_000,
    ).toISOString();
    const session = await this.repository.createSession({
      accountId: account.accountId,
      ...(account.defaultTeam ? { teamId: account.defaultTeam.teamId } : {}),
      tokenHash: sha256(token),
      expiresAt,
      ...(metadata.userAgent ? { userAgentHash: sha256(metadata.userAgent) } : {}),
      ...(metadata.ip ? { ipHash: sha256(metadata.ip) } : {}),
    });

    return {
      token,
      expiresAt: session.expiresAt,
      account: {
        id: account.accountId,
        email: account.email,
        ...(account.displayName ? { displayName: account.displayName } : {}),
      },
      ...(account.defaultTeam
        ? {
            team: {
              id: account.defaultTeam.teamId,
              name: account.defaultTeam.teamName,
              role: account.defaultTeam.role,
            },
          }
        : {}),
    };
  }

  private async requireTeamAdmin(
    identity: AuthIdentity,
    teamId: string,
  ): Promise<{ role: TeamRole }> {
    const membership =
      identity.teamId === teamId && identity.role
        ? { role: identity.role }
        : await this.repository.getTeamMembership({
            accountId: identity.accountId,
            teamId,
          });

    if (!membership || !TEAM_ADMIN_ROLES.has(membership.role)) {
      throw new ApiForbiddenError('Team admin access is required');
    }

    return membership;
  }

  private async assertOwnerWillRemain(teamId: string): Promise<void> {
    const ownerCount = await this.repository.countTeamOwners(teamId);

    if (ownerCount <= 1) {
      throw new ApiForbiddenError('At least one team owner must remain');
    }
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseRegisterBody(
  body: unknown,
  minimumPasswordLength: number,
): {
  email: string;
  password: string;
  displayName?: string;
  teamName: string;
} {
  const record = requireRecord(body, 'Registration request body must be an object');
  const email = normalizeEmail(record.email);
  const password = parsePassword(record.password, minimumPasswordLength);
  const displayName = optionalTrimmedString(record.displayName, 120);
  const teamName =
    optionalTrimmedString(record.teamName, 120) ??
    `${displayName ?? email.split('@')[0] ?? 'PolyCost'} team`;

  return {
    email,
    password,
    ...(displayName ? { displayName } : {}),
    teamName,
  };
}

function parseLoginBody(body: unknown): { email: string; password: string } {
  const record = requireRecord(body, 'Login request body must be an object');

  return {
    email: normalizeEmail(record.email),
    password: requiredString(record.password, 'password'),
  };
}

function parseInviteBody(body: unknown): { email: string; role: Exclude<TeamRole, 'owner'> } {
  const record = requireRecord(body, 'Team invitation request body must be an object');
  const role = record.role;

  if (!INVITABLE_ROLES.includes(role as Exclude<TeamRole, 'owner'>)) {
    throw new ApiValidationError('role is invalid for invitations', [
      {
        field: 'role',
        issue: 'must be admin, member, or viewer',
      },
    ]);
  }

  return {
    email: normalizeEmail(record.email),
    role: role as Exclude<TeamRole, 'owner'>,
  };
}

function parseTeamRoleBody(body: unknown): TeamRole {
  const record = requireRecord(body, 'Team role request body must be an object');

  if (!TEAM_ROLES.includes(record.role as TeamRole)) {
    throw new ApiValidationError('role is invalid', [
      {
        field: 'role',
        issue: 'must be owner, admin, member, or viewer',
      },
    ]);
  }

  return record.role as TeamRole;
}

function parseInvitationToken(body: unknown): string {
  const record = requireRecord(body, 'Invitation acceptance request body must be an object');

  return requiredString(record.token, 'token');
}

function parsePassword(value: unknown, minimumLength: number): string {
  const password = requiredString(value, 'password');

  if (password.length < minimumLength) {
    throw new ApiValidationError('password does not meet policy', [
      {
        field: 'password',
        issue: `must be at least ${minimumLength} characters`,
      },
    ]);
  }

  return password;
}

function normalizeEmail(value: unknown): string {
  const email = requiredString(value, 'email').toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiValidationError('email must be valid', [
      {
        field: 'email',
        issue: 'must be a valid email address',
      },
    ]);
  }

  return email;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiValidationError(`${field} is required`, [
      {
        field,
        issue: 'is required',
      },
    ]);
  }

  return value.trim();
}

function optionalTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function teamSlug(teamName: string, email: string): string {
  const base = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  const suffix = sha256(email).slice(0, 10);

  return `${base || 'polycost'}-${suffix}`;
}

function bearerToken(headers: Record<string, unknown> | undefined): string | undefined {
  const authorization = authorizationHeader(headers);

  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim();
}

function authorizationHeader(headers: Record<string, unknown> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  const value = headers.authorization ?? headers.Authorization;

  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiValidationError(message);
  }

  return value as Record<string, unknown>;
}
