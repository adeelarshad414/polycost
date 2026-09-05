import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { AppConfig } from '../config/config.schema.js';
import { ApiForbiddenError, ApiUnauthorizedError, ApiValidationError } from './api-errors.js';
import {
  AccountSessionPrincipal,
  ApiDatabaseRepository,
  LocalAccountWithPassword,
} from './api-database.repository.js';
import {
  AccountProfileResponse,
  AccountSessionRecord,
  AuthIdentity,
  AuthMeResponse,
  AuthSessionResponse,
  RequestWithAuth,
  SsoCallbackResponse,
  SsoConnectionTestResult,
  SsoConfigurationStatus,
  SsoStartResponse,
  TeamAuditEventRecord,
  TeamSettingsRecord,
  TeamSwitchResponse,
  TeamInvitationRecord,
  TeamInvitationPreview,
  TeamMemberRecord,
  TeamRole,
} from './auth.types.js';
import { InvitationDeliveryService } from './invitation-delivery.service.js';
import { hashPassword, verifyPassword } from './password-hash.js';

interface AuthRequestMetadata {
  ip?: string;
  userAgent?: string;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TEAM_ADMIN_ROLES = new Set<TeamRole>(['owner', 'admin']);
const TEAM_OWNER_ROLE: TeamRole = 'owner';
const INVITABLE_ROLES: Array<Exclude<TeamRole, 'owner'>> = ['admin', 'member'];
const TEAM_ROLES: TeamRole[] = ['owner', 'admin', 'member'];
const INVITATION_TTL_DAYS = 7;
const SSO_STATE_TTL_MINUTES = 10;

interface SsoStatePayload {
  providerType: 'oidc';
  teamId: string;
  issuerUrl: string;
  expiresAt: string;
  nonce: string;
  loginHint?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly configService: ConfigService<AppConfig, true>,
    @Optional()
    @Inject(InvitationDeliveryService)
    private readonly invitationDeliveryService: InvitationDeliveryService = new InvitationDeliveryService(
      configService,
    ),
    @Optional() private readonly domainMetrics?: DomainMetricsService,
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
      this.domainMetrics?.recordAuthAttempt('invalid_credentials');
      throw new ApiUnauthorizedError('Invalid email or password');
    }

    if (account.lockedUntil && Date.parse(account.lockedUntil) > Date.now()) {
      // Counted separately from a bad password: a spike of 'locked' means an
      // attack is already being throttled, while a spike of
      // 'invalid_credentials' means it is still in progress.
      this.domainMetrics?.recordAuthAttempt('locked');
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

      this.domainMetrics?.recordAuthAttempt('invalid_credentials');
      if (lockedUntil) {
        this.domainMetrics?.recordAuthLockout();
      }

      throw new ApiUnauthorizedError('Invalid email or password');
    }

    await this.repository.resetFailedLogin(account.accountId);
    this.domainMetrics?.recordAuthAttempt('success');

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

  async switchActiveTeam(body: unknown, identity: AuthIdentity): Promise<TeamSwitchResponse> {
    const input = parseTeamSwitchBody(body);
    const switched = await this.repository.updateSessionTeam({
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      teamId: input.teamId,
      now: new Date().toISOString(),
    });

    if (!switched) {
      throw new ApiForbiddenError('Team membership is required to switch active workspace');
    }

    return switched;
  }

  async updateProfile(body: unknown, identity: AuthIdentity): Promise<AccountProfileResponse> {
    const input = parseProfileBody(body, identity);

    if (input.email !== identity.email) {
      await this.verifyCurrentPassword(identity, input.currentPassword);
    }

    const updated = await this.repository.updateAccountProfile({
      accountId: identity.accountId,
      email: input.email,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      externalSubjectHash: sha256(`local:${input.email}`),
    });

    if (!updated) {
      throw new ApiUnauthorizedError('Session account is no longer active');
    }

    return updated;
  }

  async changePassword(body: unknown, identity: AuthIdentity): Promise<{ changed: true }> {
    const input = parsePasswordChangeBody(
      body,
      this.configService.get('AUTH_PASSWORD_MIN_LENGTH', { infer: true }),
    );

    await this.verifyCurrentPassword(identity, input.currentPassword);

    const changed = await this.repository.updateAccountPassword({
      accountId: identity.accountId,
      passwordHash: hashPassword(input.newPassword),
      changedAt: new Date().toISOString(),
    });

    if (!changed) {
      throw new ApiUnauthorizedError('Local password credential was not found');
    }

    return { changed: true };
  }

  async deleteAccount(body: unknown, identity: AuthIdentity): Promise<{ deleted: true }> {
    const input = parseAccountDeletionBody(body);

    await this.verifyCurrentPassword(identity, input.currentPassword);

    const deactivated = await this.repository.deactivateAccount({
      accountId: identity.accountId,
      deactivatedAt: new Date().toISOString(),
    });

    if (!deactivated) {
      throw new ApiUnauthorizedError('Session account is no longer active');
    }

    return { deleted: true };
  }

  async createTeam(body: unknown, identity: AuthIdentity): Promise<TeamSettingsRecord> {
    const input = parseTeamSettingsBody(body);

    const created = await this.repository.createTeamForAccount({
      accountId: identity.accountId,
      teamName: input.teamName,
      teamSlug: teamSlug(input.teamName, `${identity.email}:${Date.now()}`),
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.created',
        targetType: 'team',
        metadata: {
          teamName: input.teamName,
        },
      },
    });

    return created;
  }

  async updateTeamSettings(
    teamId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<TeamSettingsRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const input = parseTeamSettingsBody(body);
    const updated = await this.repository.updateTeamSettings({
      teamId,
      teamName: input.teamName,
      actorAccountId: identity.accountId,
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.settings.updated',
        targetType: 'team',
        metadata: {
          teamName: input.teamName,
        },
      },
    });

    if (!updated) {
      throw new ApiForbiddenError('Team membership is required to update team settings');
    }

    return updated;
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
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.invitation.created',
        targetType: 'invitation',
        metadata: {
          email: input.email,
          role: input.role,
        },
      },
    });

    const delivered = await this.withInvitationDelivery(
      invitation,
      inviteToken,
      identity,
      'created',
    );

    return delivered;
  }

  async listTeamInvitations(
    teamId: string,
    identity: AuthIdentity,
  ): Promise<TeamInvitationRecord[]> {
    await this.requireTeamAdmin(identity, teamId);

    return this.repository.listTeamInvitations(teamId);
  }

  async revokeTeamInvitation(
    teamId: string,
    invitationId: string,
    identity: AuthIdentity,
  ): Promise<TeamInvitationRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const revoked = await this.repository.revokeTeamInvitation({
      teamId,
      invitationId,
      revokedAt: new Date().toISOString(),
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.invitation.revoked',
        targetType: 'invitation',
      },
    });

    if (!revoked) {
      throw new ApiValidationError('Invitation was not found or is no longer pending', [
        {
          field: 'invitationId',
          issue: 'must reference a pending invitation',
        },
      ]);
    }

    return revoked;
  }

  async resendTeamInvitation(
    teamId: string,
    invitationId: string,
    identity: AuthIdentity,
  ): Promise<TeamInvitationRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const inviteToken = randomBytes(32).toString('base64url');
    const invitation = await this.repository.resendTeamInvitation({
      teamId,
      invitationId,
      tokenHash: sha256(inviteToken),
      invitedByAccountId: identity.accountId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.invitation.resent',
        targetType: 'invitation',
      },
    });

    if (!invitation) {
      throw new ApiValidationError('Invitation was not found or cannot be resent', [
        {
          field: 'invitationId',
          issue: 'must reference a pending or expired invitation',
        },
      ]);
    }

    const delivered = await this.withInvitationDelivery(
      invitation,
      inviteToken,
      identity,
      'resent',
    );

    return delivered;
  }

  async previewInvitation(token: string): Promise<TeamInvitationPreview> {
    const invitation = await this.repository.findInvitationByTokenHash(sha256(token));

    if (!invitation) {
      return {
        status: 'invalid',
        message: 'Invitation token was not found.',
      };
    }

    const now = Date.now();
    const expiresAt = Date.parse(invitation.expiresAt);
    const status =
      invitation.status === 'pending' && Number.isFinite(expiresAt) && expiresAt <= now
        ? 'expired'
        : invitation.status;

    return {
      status,
      email: invitation.email,
      role: invitation.role,
      teamId: invitation.teamId,
      expiresAt: invitation.expiresAt,
      ...(invitation.acceptedAt ? { acceptedAt: invitation.acceptedAt } : {}),
      ...(invitation.revokedAt ? { revokedAt: invitation.revokedAt } : {}),
      message: invitationPreviewMessage(status),
    };
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

    const accepted = await this.repository.acceptTeamInvitation({
      invitationId: invitation.id,
      accountId: identity.accountId,
      acceptedAt: new Date().toISOString(),
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.invitation.accepted',
        targetType: 'invitation',
      },
    });

    return accepted;
  }

  async updateTeamMemberRole(
    teamId: string,
    accountId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<TeamMemberRecord> {
    const actor = await this.requireTeamOwner(identity, teamId);
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
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.member.role_updated',
        targetType: 'member',
        targetId: accountId,
        metadata: {
          fromRole: target.role,
        },
      },
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

    await this.repository.removeTeamMember({
      teamId,
      accountId,
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.member.removed',
        targetType: 'member',
        targetId: accountId,
        metadata: {
          role: target.role,
        },
      },
    });

    return { removed: true };
  }

  async listTeamAuditEvents(
    teamId: string,
    identity: AuthIdentity,
    limit?: number,
  ): Promise<TeamAuditEventRecord[]> {
    await this.requireTeamAdmin(identity, teamId);

    return this.repository.listTeamAuditEvents(teamId, limit ?? 25);
  }

  async ssoStatus(identity: AuthIdentity): Promise<SsoConfigurationStatus> {
    if (!identity.teamId) {
      throw new ApiForbiddenError('An active team is required to view SSO configuration');
    }

    const baseUrl = this.publicBaseUrl();
    const configuredProviders = await this.repository.listSsoProviderConfigs(identity.teamId);

    return {
      localLoginEnabled: this.configService.get('AUTH_LOCAL_REGISTRATION_ENABLED', { infer: true }),
      oidcConfigured:
        Boolean(this.configService.get('AUTH_OIDC_ISSUER_URL', { infer: true })) ||
        configuredProviders.some((provider) => provider.providerType === 'oidc'),
      samlConfigured:
        Boolean(this.configService.get('AUTH_SAML_ENTITY_ID', { infer: true })) ||
        configuredProviders.some((provider) => provider.providerType === 'saml'),
      configuredProviders,
      callbackUrls: {
        oidc: `${baseUrl}/api/v1/auth/sso/oidc/callback`,
        saml: `${baseUrl}/api/v1/auth/sso/saml/acs`,
      },
    };
  }

  // SEC-4: the mock OIDC start/authorize/callback flow is a development-only
  // verification aid — it derives the authenticated email from an unsigned query
  // param and issues a real session. It MUST be disabled in staging/production so
  // it cannot be used to mint sessions as an arbitrary email for any OIDC team.
  private assertMockSsoEnabled(): void {
    const env = this.configService.get('NODE_ENV', { infer: true });
    if (env === 'production' || env === 'staging') {
      throw new ApiForbiddenError('Mock SSO is disabled in this environment');
    }
  }

  async startMockOidcLogin(body: unknown): Promise<SsoStartResponse> {
    this.assertMockSsoEnabled();
    const input = parseSsoStartBody(body);
    const provider = await this.resolveOidcProvider(input.teamId);
    const baseUrl = this.publicBaseUrl();
    const expiresAt = new Date(Date.now() + SSO_STATE_TTL_MINUTES * 60_000).toISOString();
    const state = signSsoState(
      {
        providerType: 'oidc',
        teamId: input.teamId,
        issuerUrl: provider.issuerUrl,
        expiresAt,
        nonce: randomBytes(16).toString('base64url'),
        ...(input.email ? { loginHint: input.email } : {}),
      },
      this.ssoStateSecret(),
    );
    const authorizationUrl = new URL(`${baseUrl}/api/v1/auth/sso/mock/oidc/authorize`);

    authorizationUrl.searchParams.set('state', state);
    if (input.email) {
      authorizationUrl.searchParams.set('email', input.email);
    }

    return {
      providerType: 'oidc',
      mode: 'mock',
      authorizationUrl: authorizationUrl.toString(),
      callbackUrl: `${baseUrl}/api/v1/auth/sso/oidc/callback`,
      state,
      expiresAt,
    };
  }

  mockOidcAuthorize(query: unknown): { redirectUrl: string; state: string; email: string } {
    this.assertMockSsoEnabled();
    const input = parseSsoAuthorizeQuery(query);
    const statePayload = verifySsoState(input.state, this.ssoStateSecret());
    const email = input.email ?? statePayload.loginHint;

    if (!email) {
      throw new ApiValidationError('email is required for mock OIDC authorization', [
        {
          field: 'email',
          issue: 'is required',
        },
      ]);
    }

    const callbackUrl = new URL(`${this.publicBaseUrl()}/api/v1/auth/sso/oidc/callback`);
    callbackUrl.searchParams.set('state', input.state);
    callbackUrl.searchParams.set('email', normalizeEmail(email));

    return {
      redirectUrl: callbackUrl.toString(),
      state: input.state,
      email: normalizeEmail(email),
    };
  }

  async completeMockOidcCallback(
    query: unknown,
    metadata: AuthRequestMetadata = {},
  ): Promise<SsoCallbackResponse> {
    this.assertMockSsoEnabled();
    const input = parseSsoCallbackQuery(query);
    const statePayload = verifySsoState(input.state, this.ssoStateSecret());
    const email = normalizeEmail(input.email ?? statePayload.loginHint);
    const subjectHash = sha256(`oidc:${statePayload.issuerUrl}:${email}`);
    const principal = await this.repository.upsertExternalAccountForTeam({
      email,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      authProvider: 'oidc',
      externalSubjectHash: subjectHash,
      teamId: statePayload.teamId,
      defaultRole: 'member',
    });

    if (!principal || principal.status !== 'active') {
      throw new ApiUnauthorizedError('SSO account is not active');
    }

    const session = await this.issueSession(principal, metadata);

    return {
      ...session,
      sso: {
        providerType: 'oidc',
        issuerUrl: statePayload.issuerUrl,
        subjectHash,
        stateVerified: true,
      },
    };
  }

  async configureSsoProvider(
    teamId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<SsoConfigurationStatus['configuredProviders'][number]> {
    await this.requireTeamAdmin(identity, teamId);
    const input = parseSsoProviderBody(body);

    const configured = await this.repository.upsertSsoProviderConfig({
      teamId,
      providerType: input.providerType,
      displayName: input.displayName,
      issuerUrl: input.issuerUrl,
      ...(input.clientId ? { clientIdHint: clientIdHint(input.clientId) } : {}),
      createdByAccountId: identity.accountId,
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.sso.configured',
        targetType: 'sso_provider',
      },
    });

    return configured;
  }

  async testSsoConnection(
    teamId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<SsoConnectionTestResult> {
    await this.requireTeamAdmin(identity, teamId);
    const input = parseSsoProviderBody(body);

    return {
      ok: true,
      providerType: input.providerType,
      issuerUrl: input.issuerUrl,
      checkedAt: new Date().toISOString(),
      message:
        input.providerType === 'oidc'
          ? 'Mock OIDC discovery endpoint accepted the issuer URL shape.'
          : 'Mock SAML metadata probe accepted the issuer URL shape.',
    };
  }

  private async resolveOidcProvider(teamId: string): Promise<{
    issuerUrl: string;
  }> {
    const configured = await this.repository.listSsoProviderConfigs(teamId);
    const storedProvider = configured.find(
      (provider) => provider.providerType === 'oidc' && provider.status === 'configured',
    );
    const envIssuer = this.configService.get('AUTH_OIDC_ISSUER_URL', { infer: true });

    if (storedProvider) {
      return {
        issuerUrl: storedProvider.issuerUrl,
      };
    }

    if (envIssuer) {
      return {
        issuerUrl: envIssuer,
      };
    }

    throw new ApiValidationError('OIDC provider is not configured for this team', [
      {
        field: 'teamId',
        issue: 'must reference a team with OIDC configuration',
      },
    ]);
  }

  private publicBaseUrl(): string {
    return this.configService.get('AUTH_PUBLIC_BASE_URL', { infer: true }).replace(/\/$/, '');
  }

  private async withInvitationDelivery(
    invitation: TeamInvitationRecord,
    inviteToken: string,
    identity: AuthIdentity,
    action: 'created' | 'resent',
  ): Promise<TeamInvitationRecord> {
    const inviteUrl = `${this.publicBaseUrl()}/?invite_token=${encodeURIComponent(inviteToken)}`;
    const delivery = await this.invitationDeliveryService.deliverTeamInvitation({
      invitation,
      inviteUrl,
      invitedBy: {
        accountId: identity.accountId,
        email: identity.email,
      },
      action,
    });

    return {
      ...invitation,
      delivery,
      ...(delivery.tokenExposedInResponse ? { inviteToken, inviteUrl } : {}),
    };
  }

  private ssoStateSecret(): string {
    return this.configService.get('AUTH_SSO_STATE_SECRET', { infer: true });
  }

  private async issueSession(
    account: AccountSessionPrincipal | LocalAccountWithPassword,
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

  private async requireTeamOwner(
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

    if (!membership || membership.role !== TEAM_OWNER_ROLE) {
      throw new ApiForbiddenError('Team owner access is required');
    }

    return membership;
  }

  private async assertOwnerWillRemain(teamId: string): Promise<void> {
    const ownerCount = await this.repository.countTeamOwners(teamId);

    if (ownerCount <= 1) {
      throw new ApiForbiddenError('At least one team owner must remain');
    }
  }

  private async verifyCurrentPassword(identity: AuthIdentity, currentPassword: string) {
    const account = await this.repository.findLocalAccountByEmail(identity.email);

    if (!account || account.accountId !== identity.accountId) {
      throw new ApiUnauthorizedError('Local password credential was not found');
    }

    if (!verifyPassword(currentPassword, account.passwordHash)) {
      throw new ApiUnauthorizedError('Current password is invalid');
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

function parseProfileBody(
  body: unknown,
  identity: AuthIdentity,
): {
  email: string;
  displayName?: string;
  currentPassword: string;
} {
  const record = requireRecord(body, 'Profile update request body must be an object');
  const email = record.email === undefined ? identity.email : normalizeEmail(record.email);
  const displayName =
    record.displayName === undefined
      ? identity.displayName
      : optionalTrimmedString(record.displayName, 120);
  const emailChanged = email !== identity.email;

  return {
    email,
    ...(displayName ? { displayName } : {}),
    currentPassword: emailChanged
      ? requiredString(record.currentPassword, 'currentPassword')
      : typeof record.currentPassword === 'string'
        ? record.currentPassword
        : '',
  };
}

function parsePasswordChangeBody(
  body: unknown,
  minimumPasswordLength: number,
): {
  currentPassword: string;
  newPassword: string;
} {
  const record = requireRecord(body, 'Password change request body must be an object');

  return {
    currentPassword: requiredString(record.currentPassword, 'currentPassword'),
    newPassword: parsePassword(record.newPassword, minimumPasswordLength),
  };
}

function parseAccountDeletionBody(body: unknown): {
  currentPassword: string;
} {
  const record = requireRecord(body, 'Account deletion request body must be an object');
  const confirmation = requiredString(record.confirmation, 'confirmation');

  if (confirmation !== 'DELETE') {
    throw new ApiValidationError('confirmation must be DELETE', [
      {
        field: 'confirmation',
        issue: 'must exactly match DELETE',
      },
    ]);
  }

  return {
    currentPassword: requiredString(record.currentPassword, 'currentPassword'),
  };
}

function parseTeamSettingsBody(body: unknown): { teamName: string } {
  const record = requireRecord(body, 'Team settings request body must be an object');
  const teamName = optionalTrimmedString(record.teamName ?? record.name, 120);

  if (!teamName) {
    throw new ApiValidationError('teamName is required', [
      {
        field: 'teamName',
        issue: 'is required',
      },
    ]);
  }

  return { teamName };
}

function parseTeamSwitchBody(body: unknown): { teamId: string } {
  const record = requireRecord(body, 'Team switch request body must be an object');

  return {
    teamId: requiredString(record.teamId, 'teamId'),
  };
}

function parseInviteBody(body: unknown): { email: string; role: Exclude<TeamRole, 'owner'> } {
  const record = requireRecord(body, 'Team invitation request body must be an object');
  const role = record.role;

  if (!INVITABLE_ROLES.includes(role as Exclude<TeamRole, 'owner'>)) {
    throw new ApiValidationError('role is invalid for invitations', [
      {
        field: 'role',
        issue: 'must be admin or member',
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
        issue: 'must be owner, admin, or member',
      },
    ]);
  }

  return record.role as TeamRole;
}

function parseSsoProviderBody(body: unknown): {
  providerType: 'oidc' | 'saml';
  displayName: string;
  issuerUrl: string;
  clientId?: string;
} {
  const record = requireRecord(body, 'SSO provider request body must be an object');
  const providerType = requiredString(record.providerType, 'providerType').toLowerCase();
  const displayName = optionalTrimmedString(record.displayName, 120) ?? providerType.toUpperCase();
  const issuerUrl = requiredString(record.issuerUrl, 'issuerUrl');
  const clientId = optionalTrimmedString(record.clientId, 160);

  if (providerType !== 'oidc' && providerType !== 'saml') {
    throw new ApiValidationError('providerType is invalid', [
      {
        field: 'providerType',
        issue: 'must be oidc or saml',
      },
    ]);
  }

  if (!issuerUrl.startsWith('https://')) {
    throw new ApiValidationError('issuerUrl must use https', [
      {
        field: 'issuerUrl',
        issue: 'must start with https://',
      },
    ]);
  }

  return {
    providerType,
    displayName,
    issuerUrl,
    ...(clientId ? { clientId } : {}),
  };
}

function parseSsoStartBody(body: unknown): { teamId: string; email?: string } {
  const record = requireRecord(body, 'SSO start request body must be an object');
  const teamId = requiredString(record.teamId, 'teamId');
  const email = record.email === undefined ? undefined : normalizeEmail(record.email);

  return {
    teamId,
    ...(email ? { email } : {}),
  };
}

function parseSsoAuthorizeQuery(query: unknown): { state: string; email?: string } {
  const record = requireRecord(query, 'Mock OIDC authorization query must be an object');
  const email = record.email === undefined ? undefined : normalizeEmail(record.email);

  return {
    state: requiredString(record.state, 'state'),
    ...(email ? { email } : {}),
  };
}

function parseSsoCallbackQuery(query: unknown): {
  state: string;
  email?: string;
  displayName?: string;
} {
  const record = requireRecord(query, 'OIDC callback query must be an object');
  const email = record.email === undefined ? undefined : normalizeEmail(record.email);
  const displayName = optionalTrimmedString(record.displayName, 120);

  return {
    state: requiredString(record.state, 'state'),
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

function signSsoState(payload: SsoStatePayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function verifySsoState(state: string, secret: string): SsoStatePayload {
  const [encodedPayload, signature] = state.split('.');

  if (!encodedPayload || !signature) {
    throw new ApiValidationError('state is invalid', [
      {
        field: 'state',
        issue: 'must include payload and signature',
      },
    ]);
  }

  const expected = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new ApiValidationError('state signature is invalid', [
      {
        field: 'state',
        issue: 'must be signed by this deployment',
      },
    ]);
  }

  let payload: Partial<SsoStatePayload>;

  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<SsoStatePayload>;
  } catch {
    throw new ApiValidationError('state payload is invalid', [
      {
        field: 'state',
        issue: 'must decode to valid JSON',
      },
    ]);
  }

  if (
    payload.providerType !== 'oidc' ||
    typeof payload.teamId !== 'string' ||
    typeof payload.issuerUrl !== 'string' ||
    typeof payload.expiresAt !== 'string' ||
    typeof payload.nonce !== 'string'
  ) {
    throw new ApiValidationError('state payload is invalid', [
      {
        field: 'state',
        issue: 'must contain OIDC provider, team, issuer, expiry, and nonce',
      },
    ]);
  }

  const expiresAtMs = Date.parse(payload.expiresAt);

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new ApiValidationError('state is expired', [
      {
        field: 'state',
        issue: 'must be used before expiry',
      },
    ]);
  }

  return {
    providerType: 'oidc',
    teamId: payload.teamId,
    issuerUrl: payload.issuerUrl,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
    ...(payload.loginHint ? { loginHint: payload.loginHint } : {}),
  };
}

function invitationPreviewMessage(status: TeamInvitationPreview['status']): string {
  switch (status) {
    case 'pending':
      return 'Invitation is ready to accept after sign-in.';
    case 'expired':
      return 'Invitation has expired. Ask a team owner or admin for a new invite.';
    case 'accepted':
      return 'Invitation has already been accepted.';
    case 'revoked':
      return 'Invitation was revoked by a team owner or admin.';
    case 'invalid':
      return 'Invitation token was not found.';
  }
}

function clientIdHint(clientId: string): string {
  if (clientId.length <= 12) {
    return clientId;
  }

  return `${clientId.slice(0, 6)}...${clientId.slice(-4)}`;
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
