import { describe, it, expect, jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { RateLimitExceededError } from './api-errors.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthIdentity, RequestWithAuth } from './auth.types.js';
import { ApiRateLimitService } from './rate-limit.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';

describe('AuthController', () => {
  const identity: AuthIdentity = {
    accountId: '11111111-1111-4111-8111-111111111111',
    email: 'architect@example.com',
    teamId: '22222222-2222-4222-8222-222222222222',
    role: 'owner',
    sessionId: '33333333-3333-4333-8333-333333333333',
    expiresAt: '2026-07-07T00:00:00.000Z',
  };
  const request: RequestWithAuth = {
    auth: identity,
    headers: {
      'user-agent': 'jest',
    },
    ip: '127.0.0.1',
  };

  it('delegates account, session, team, invite, and SSO endpoints to AuthService', async () => {
    const service = createAuthServiceMock();
    const controller = authController(service);
    const body = { email: 'architect@example.com' };

    await expect(controller.register(body, request)).resolves.toBe('register');
    expect(service.register).toHaveBeenCalledWith(body, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    await expect(controller.login(body, request)).resolves.toBe('login');
    expect(service.login).toHaveBeenCalledWith(body, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(controller.me(request)).toBe('me');
    expect(controller.logout(request)).toBe('logout');
    expect(controller.updateProfile(body, request)).toBe('profile');
    expect(controller.changePassword(body, request)).toBe('password');
    expect(controller.deleteAccount(body, request)).toBe('account');
    expect(controller.listSessions(request)).toBe('sessions');
    expect(controller.revokeOtherSessions(request)).toBe('revoke-other');
    expect(controller.switchActiveTeam(body, request)).toBe('switch-team');
    expect(controller.createTeam(body, request)).toBe('create-team');
    expect(controller.updateTeamSettings('team-1', body, request)).toBe('team-settings');
    expect(controller.listTeamMembers('team-1', request)).toBe('members');
    expect(controller.updateTeamMemberRole('team-1', 'account-1', body, request)).toBe(
      'member-role',
    );
    expect(controller.removeTeamMember('team-1', 'account-1', request)).toBe('remove-member');
    expect(controller.inviteTeamMember('team-1', body, request)).toBe('invite');
    expect(controller.listTeamInvitations('team-1', request)).toBe('invitations');
    expect(controller.listTeamAuditEvents('team-1', request, '12')).toBe('audit-events');
    expect(controller.revokeTeamInvitation('team-1', 'invite-1', request)).toBe('revoke-invite');
    expect(controller.resendTeamInvitation('team-1', 'invite-1', request)).toBe('resend-invite');
    expect(controller.acceptInvitation(body, request)).toBe('accept-invite');
    await expect(controller.previewInvitation('invite-token')).resolves.toBe('preview-invite');
    expect(controller.ssoStatus(request)).toBe('sso-status');
    await expect(controller.startMockOidcLogin(body)).resolves.toBe('sso-start');
    await expect(controller.mockOidcAuthorize(body)).resolves.toBe('sso-authorize');
    await expect(controller.completeMockOidcCallback(body, request)).resolves.toBe('sso-callback');
    expect(controller.configureSsoProvider('team-1', body, request)).toBe('sso-configure');
    await expect(controller.testSsoConnection('team-1', body, request)).resolves.toBe('sso-test');

    expect(service.updateProfile).toHaveBeenCalledWith(body, identity);
    expect(service.changePassword).toHaveBeenCalledWith(body, identity);
    expect(service.deleteAccount).toHaveBeenCalledWith(body, identity);
    expect(service.switchActiveTeam).toHaveBeenCalledWith(body, identity);
    expect(service.createTeam).toHaveBeenCalledWith(body, identity);
    expect(service.updateTeamSettings).toHaveBeenCalledWith('team-1', body, identity);
    expect(service.updateTeamMemberRole).toHaveBeenCalledWith(
      'team-1',
      'account-1',
      body,
      identity,
    );
    expect(service.revokeTeamInvitation).toHaveBeenCalledWith('team-1', 'invite-1', identity);
    expect(service.listTeamAuditEvents).toHaveBeenCalledWith('team-1', identity, 12);
    expect(service.resendTeamInvitation).toHaveBeenCalledWith('team-1', 'invite-1', identity);
    expect(service.previewInvitation).toHaveBeenCalledWith('invite-token');
    expect(service.startMockOidcLogin).toHaveBeenCalledWith(body);
    expect(service.mockOidcAuthorize).toHaveBeenCalledWith(body);
    expect(service.completeMockOidcCallback).toHaveBeenCalledWith(body, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(service.configureSsoProvider).toHaveBeenCalledWith('team-1', body, identity);
    expect(service.testSsoConnection).toHaveBeenCalledWith('team-1', body, identity);
  });

  it('omits missing request metadata for anonymous register/login calls', async () => {
    const service = createAuthServiceMock();
    const controller = authController(service);

    await controller.register({}, undefined);
    await controller.login(
      {},
      {
        headers: {
          'User-Agent': ['first-agent', 'second-agent'],
        },
      },
    );

    expect(service.register).toHaveBeenCalledWith({}, {});
    expect(service.login).toHaveBeenCalledWith(
      {},
      {
        userAgent: 'first-agent',
      },
    );
  });

  it('rate limits public auth entry points by request identity', async () => {
    const service = createAuthServiceMock();
    const controller = authController(service, 2);
    const response = {
      header: jest.fn(),
    };
    const request: RequestWithAuth = {
      ip: '203.0.113.10',
      headers: {},
    };

    await controller.login({ email: 'architect@example.com' }, request, response);
    await controller.login({ email: 'architect@example.com' }, request, response);
    await expect(
      controller.login({ email: 'architect@example.com' }, request, response),
    ).rejects.toThrow(RateLimitExceededError);
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Limit', '2');

    await controller.startMockOidcLogin({ teamId: 'team-1' }, request, response);
    await controller.startMockOidcLogin({ teamId: 'team-1' }, request, response);
    await expect(
      controller.startMockOidcLogin({ teamId: 'team-1' }, request, response),
    ).rejects.toThrow(RateLimitExceededError);
  });

  it('keeps workspace account/team endpoints behind the session guard', () => {
    const protectedHandlers = [
      AuthController.prototype.me,
      AuthController.prototype.logout,
      AuthController.prototype.updateProfile,
      AuthController.prototype.changePassword,
      AuthController.prototype.deleteAccount,
      AuthController.prototype.listSessions,
      AuthController.prototype.revokeOtherSessions,
      AuthController.prototype.switchActiveTeam,
      AuthController.prototype.createTeam,
      AuthController.prototype.updateTeamSettings,
      AuthController.prototype.listTeamMembers,
      AuthController.prototype.updateTeamMemberRole,
      AuthController.prototype.removeTeamMember,
      AuthController.prototype.inviteTeamMember,
      AuthController.prototype.listTeamInvitations,
      AuthController.prototype.listTeamAuditEvents,
      AuthController.prototype.revokeTeamInvitation,
      AuthController.prototype.resendTeamInvitation,
      AuthController.prototype.acceptInvitation,
      AuthController.prototype.ssoStatus,
      AuthController.prototype.configureSsoProvider,
      AuthController.prototype.testSsoConnection,
    ];
    const anonymousHandlers = [
      AuthController.prototype.register,
      AuthController.prototype.login,
      AuthController.prototype.previewInvitation,
      AuthController.prototype.startMockOidcLogin,
      AuthController.prototype.mockOidcAuthorize,
      AuthController.prototype.completeMockOidcCallback,
    ];

    for (const handler of protectedHandlers) {
      expect(guardMetadataFor(handler)).toContain(SessionAuthGuard);
    }

    for (const handler of anonymousHandlers) {
      expect(guardMetadataFor(handler)).not.toContain(SessionAuthGuard);
    }
  });
});

function authController(service: AuthService, limitPerMinute = 10): AuthController {
  return new AuthController(service, new ApiRateLimitService(() => 0), {
    get: jest.fn<ConfigService['get']>((key: keyof AppConfig) => {
      if (key === 'RATE_LIMIT_AUTH_PER_MINUTE') {
        return limitPerMinute;
      }

      return undefined;
    }),
  } as unknown as ConfigService<AppConfig, true>);
}

function guardMetadataFor(handler: (...args: never[]) => unknown): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

/*
  Delegation doubles. Each returns a unique sentinel so a test can prove the
  controller handed back the service's value unchanged - `resolves.toBe(
  'register')` is the assertion, and replacing the sentinels with fabricated
  response objects would destroy exactly what it proves.

  The signature is still the real one, because 21 assertions here check the
  arguments the controller forwarded. So the parameters are type-checked and
  only the return is cast: `as never` is assignable to any return type, and
  the cast marks the one place the double deliberately departs from the
  contract.
*/
function createAuthServiceMock(): AuthService {
  return {
    register: jest.fn<AuthService['register']>(() => 'register' as never),
    login: jest.fn<AuthService['login']>(() => 'login' as never),
    authenticateRequest: jest.fn<AuthService['authenticateRequest']>(),
    me: jest.fn<AuthService['me']>(() => 'me' as never),
    logout: jest.fn<AuthService['logout']>(() => 'logout' as never),
    updateProfile: jest.fn<AuthService['updateProfile']>(() => 'profile' as never),
    changePassword: jest.fn<AuthService['changePassword']>(() => 'password' as never),
    deleteAccount: jest.fn<AuthService['deleteAccount']>(() => 'account' as never),
    listSessions: jest.fn<AuthService['listSessions']>(() => 'sessions' as never),
    revokeOtherSessions: jest.fn<AuthService['revokeOtherSessions']>(() => 'revoke-other' as never),
    switchActiveTeam: jest.fn<AuthService['switchActiveTeam']>(() => 'switch-team' as never),
    createTeam: jest.fn<AuthService['createTeam']>(() => 'create-team' as never),
    updateTeamSettings: jest.fn<AuthService['updateTeamSettings']>(() => 'team-settings' as never),
    listTeamMembers: jest.fn<AuthService['listTeamMembers']>(() => 'members' as never),
    inviteTeamMember: jest.fn<AuthService['inviteTeamMember']>(() => 'invite' as never),
    listTeamInvitations: jest.fn<AuthService['listTeamInvitations']>(() => 'invitations' as never),
    listTeamAuditEvents: jest.fn<AuthService['listTeamAuditEvents']>(() => 'audit-events' as never),
    revokeTeamInvitation: jest.fn<AuthService['revokeTeamInvitation']>(
      () => 'revoke-invite' as never,
    ),
    resendTeamInvitation: jest.fn<AuthService['resendTeamInvitation']>(
      () => 'resend-invite' as never,
    ),
    acceptInvitation: jest.fn<AuthService['acceptInvitation']>(() => 'accept-invite' as never),
    previewInvitation: jest.fn<AuthService['previewInvitation']>(() => 'preview-invite' as never),
    updateTeamMemberRole: jest.fn<AuthService['updateTeamMemberRole']>(
      () => 'member-role' as never,
    ),
    removeTeamMember: jest.fn<AuthService['removeTeamMember']>(() => 'remove-member' as never),
    ssoStatus: jest.fn<AuthService['ssoStatus']>(() => 'sso-status' as never),
    startMockOidcLogin: jest.fn<AuthService['startMockOidcLogin']>(() => 'sso-start' as never),
    mockOidcAuthorize: jest.fn<AuthService['mockOidcAuthorize']>(() => 'sso-authorize' as never),
    completeMockOidcCallback: jest.fn<AuthService['completeMockOidcCallback']>(
      () => 'sso-callback' as never,
    ),
    configureSsoProvider: jest.fn<AuthService['configureSsoProvider']>(
      () => 'sso-configure' as never,
    ),
    testSsoConnection: jest.fn<AuthService['testSsoConnection']>(() => 'sso-test' as never),
  } as unknown as AuthService;
}
