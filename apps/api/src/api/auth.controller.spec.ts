import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthIdentity, RequestWithAuth } from './auth.types';

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
    const controller = new AuthController(service);
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
    expect(controller.ssoStatus(request)).toBe('sso-status');
    expect(controller.configureSsoProvider('team-1', body, request)).toBe('sso-configure');
    expect(controller.testSsoConnection('team-1', body, request)).toBe('sso-test');

    expect(service.updateProfile).toHaveBeenCalledWith(body, identity);
    expect(service.changePassword).toHaveBeenCalledWith(body, identity);
    expect(service.deleteAccount).toHaveBeenCalledWith(body, identity);
    expect(service.createTeam).toHaveBeenCalledWith(body, identity);
    expect(service.updateTeamSettings).toHaveBeenCalledWith('team-1', body, identity);
    expect(service.updateTeamMemberRole).toHaveBeenCalledWith(
      'team-1',
      'account-1',
      body,
      identity,
    );
    expect(service.revokeTeamInvitation).toHaveBeenCalledWith('team-1', 'invite-1', identity);
    expect(service.configureSsoProvider).toHaveBeenCalledWith('team-1', body, identity);
    expect(service.testSsoConnection).toHaveBeenCalledWith('team-1', body, identity);
  });

  it('omits missing request metadata for anonymous register/login calls', () => {
    const service = createAuthServiceMock();
    const controller = new AuthController(service);

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
});

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
    createTeam: jest.fn(() => 'create-team'),
    updateTeamSettings: jest.fn(() => 'team-settings'),
    listTeamMembers: jest.fn(() => 'members'),
    inviteTeamMember: jest.fn(() => 'invite'),
    listTeamInvitations: jest.fn(() => 'invitations'),
    revokeTeamInvitation: jest.fn(() => 'revoke-invite'),
    acceptInvitation: jest.fn(() => 'accept-invite'),
    updateTeamMemberRole: jest.fn(() => 'member-role'),
    removeTeamMember: jest.fn(() => 'remove-member'),
    ssoStatus: jest.fn(() => 'sso-status'),
    configureSsoProvider: jest.fn(() => 'sso-configure'),
    testSsoConnection: jest.fn(() => 'sso-test'),
  } as unknown as AuthService;
}
