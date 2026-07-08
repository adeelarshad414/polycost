import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { RateLimitExceededError } from './api-errors';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthIdentity, RequestWithAuth } from './auth.types';
import { ApiRateLimitService } from './rate-limit.service';
import { SessionAuthGuard } from './session-auth.guard';

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

  it('delegates account, session, team, invite, and SSO endpoints to AuthService', () => {
    const service = createAuthServiceMock();
    const controller = authController(service);
    const body = { email: 'architect@example.com' };

    expect(controller.register(body, request)).toBe('register');
    expect(service.register).toHaveBeenCalledWith(body, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(controller.login(body, request)).toBe('login');
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
    expect(controller.revokeTeamInvitation('team-1', 'invite-1', request)).toBe('revoke-invite');
    expect(controller.acceptInvitation(body, request)).toBe('accept-invite');
    expect(controller.previewInvitation('invite-token')).toBe('preview-invite');
    expect(controller.ssoStatus(request)).toBe('sso-status');
    expect(controller.startMockOidcLogin(body)).toBe('sso-start');
    expect(controller.mockOidcAuthorize(body)).toBe('sso-authorize');
    expect(controller.completeMockOidcCallback(body, request)).toBe('sso-callback');
    expect(controller.configureSsoProvider('team-1', body, request)).toBe('sso-configure');
    expect(controller.testSsoConnection('team-1', body, request)).toBe('sso-test');

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

  it('omits missing request metadata for anonymous register/login calls', () => {
    const service = createAuthServiceMock();
    const controller = authController(service);

    controller.register({}, undefined);
    controller.login(
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

  it('rate limits public auth entry points by request identity', () => {
    const service = createAuthServiceMock();
    const controller = authController(service, 2);
    const response = {
      header: jest.fn(),
    };
    const request: RequestWithAuth = {
      ip: '203.0.113.10',
      headers: {},
    };

    controller.login({ email: 'architect@example.com' }, request, response);
    controller.login({ email: 'architect@example.com' }, request, response);
    expect(() => controller.login({ email: 'architect@example.com' }, request, response)).toThrow(
      RateLimitExceededError,
    );
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Limit', '2');

    controller.startMockOidcLogin({ teamId: 'team-1' }, request, response);
    controller.startMockOidcLogin({ teamId: 'team-1' }, request, response);
    expect(() => controller.startMockOidcLogin({ teamId: 'team-1' }, request, response)).toThrow(
      RateLimitExceededError,
    );
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
      AuthController.prototype.revokeTeamInvitation,
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
    get: jest.fn((key: keyof AppConfig) => {
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

function createAuthServiceMock(): AuthService {
  return {
    register: jest.fn(() => 'register'),
    login: jest.fn(() => 'login'),
    authenticateRequest: jest.fn(),
    me: jest.fn(() => 'me'),
    logout: jest.fn(() => 'logout'),
    updateProfile: jest.fn(() => 'profile'),
    changePassword: jest.fn(() => 'password'),
    deleteAccount: jest.fn(() => 'account'),
    listSessions: jest.fn(() => 'sessions'),
    revokeOtherSessions: jest.fn(() => 'revoke-other'),
    switchActiveTeam: jest.fn(() => 'switch-team'),
    createTeam: jest.fn(() => 'create-team'),
    updateTeamSettings: jest.fn(() => 'team-settings'),
    listTeamMembers: jest.fn(() => 'members'),
    inviteTeamMember: jest.fn(() => 'invite'),
    listTeamInvitations: jest.fn(() => 'invitations'),
    revokeTeamInvitation: jest.fn(() => 'revoke-invite'),
    acceptInvitation: jest.fn(() => 'accept-invite'),
    previewInvitation: jest.fn(() => 'preview-invite'),
    updateTeamMemberRole: jest.fn(() => 'member-role'),
    removeTeamMember: jest.fn(() => 'remove-member'),
    ssoStatus: jest.fn(() => 'sso-status'),
    startMockOidcLogin: jest.fn(() => 'sso-start'),
    mockOidcAuthorize: jest.fn(() => 'sso-authorize'),
    completeMockOidcCallback: jest.fn(() => 'sso-callback'),
    configureSsoProvider: jest.fn(() => 'sso-configure'),
    testSsoConnection: jest.fn(() => 'sso-test'),
  } as unknown as AuthService;
}
