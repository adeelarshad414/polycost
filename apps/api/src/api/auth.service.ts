import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { ApiForbiddenError, ApiUnauthorizedError, ApiValidationError } from './api-errors';
import { ApiDatabaseRepository, LocalAccountWithPassword } from './api-database.repository';
import { AuthIdentity, AuthMeResponse, AuthSessionResponse, RequestWithAuth } from './auth.types';
import { hashPassword, verifyPassword } from './password-hash';

interface AuthRequestMetadata {
  ip?: string;
  userAgent?: string;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
