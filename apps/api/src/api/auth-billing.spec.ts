import { ConfigService } from '@nestjs/config';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { ApiForbiddenError, ApiUnauthorizedError } from './api-errors';
import { ApiDatabaseRepository, LocalAccountWithPassword } from './api-database.repository';
import { AuthService } from './auth.service';
import { AuthIdentity, TeamRole } from './auth.types';
import { BillingService } from './billing.service';
import { hashPassword } from './password-hash';

const account: LocalAccountWithPassword = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'architect@example.com',
  displayName: 'Architect',
  status: 'active',
  passwordHash:
    'scrypt:v1:16384:8:1:YXJjaGl0ZWN0LXNhbHQ:td9vzKxxq6s6gQ5rObkzT7Hd49DPw_WBqJXarDD_K_c',
  failedAttempts: 0,
  defaultTeam: {
    teamId: '22222222-2222-4222-8222-222222222222',
    teamName: 'Architecture team',
    role: 'owner',
  },
};

const identity: AuthIdentity = {
  accountId: account.accountId,
  email: account.email,
  displayName: account.displayName,
  teamId: account.defaultTeam?.teamId,
  role: 'owner',
  sessionId: '33333333-3333-4333-8333-333333333333',
  expiresAt: '2026-07-07T00:00:00.000Z',
};

const comparisonResult: ComparisonResult = {
  comparisonId: '44444444-4444-4444-8444-444444444444',
  pricingAsOf: '2026-07-06T00:00:00.000Z',
  cheapestProviderId: 'aws',
  providers: [
    {
      providerId: 'aws',
      lineItems: [
        {
          category: 'compute',
          description: 'web compute',
          baseMonthlyCostUsd: 100,
          isApproximate: false,
          skuId: 'sku-compute',
          pricingTrace: {
            providerId: 'aws',
            serviceCategory: 'compute',
            source: 'pricing_rates',
            sourceRecordKey: 'aws:sku-compute:us-east-1:on-demand',
            sourceSkuId: 'sku-compute',
            isApproximate: false,
            isEstimate: false,
          },
        },
      ],
      totals: {
        daily: 3.29,
        weekly: 23.01,
        monthly: 100,
        quarterly: 300,
        yearly: 1200,
      },
    },
  ],
};

describe('AuthService', () => {
  it('registers a local account and returns a bearer token without storing raw secrets', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue(undefined);
    repository.createLocalAccountWithTeam.mockImplementation(async (input) => ({
      ...account,
      email: input.email,
      passwordHash: input.passwordHash,
      defaultTeam: {
        teamId: account.defaultTeam!.teamId,
        teamName: input.teamName,
        role: 'owner',
      },
    }));
    repository.createSession.mockResolvedValue({
      sessionId: identity.sessionId,
      expiresAt: identity.expiresAt,
    });
    const service = new AuthService(repository as never, configService());

    const session = await service.register(
      {
        email: 'Architect@Example.com',
        password: 'correct horse battery staple',
        displayName: 'Architect',
        teamName: 'Architecture team',
      },
      {
        ip: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(session.token).toEqual(expect.any(String));
    expect(session.token).not.toContain('correct horse');
    expect(repository.createLocalAccountWithTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'architect@example.com',
        externalSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        passwordHash: expect.stringMatching(/^scrypt:v1:/),
      }),
    );
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userAgentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        ipHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects invalid login attempts and records lockout-ready failures', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...account,
      passwordHash:
        'scrypt:v1:16384:8:1:Tm90VGhlUmlnaHRTYWx0:Os6fRvczjT_AZljxB0T2YRrNEKv5szyK7b57lFb2_iA',
      failedAttempts: 4,
    });
    const service = new AuthService(repository as never, configService());

    await expect(
      service.login({
        email: 'architect@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(ApiUnauthorizedError);
    expect(repository.recordFailedLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: account.accountId,
        failedAttempts: 5,
        lockedUntil: expect.any(String),
      }),
    );
  });

  it('hydrates the current session and account teams from bearer auth', async () => {
    const repository = repositoryMock();
    repository.resolveSession.mockResolvedValue(identity);
    repository.listAccountTeams.mockResolvedValue([account.defaultTeam!]);
    repository.updateSessionTeam.mockResolvedValue({
      activeTeam: {
        id: account.defaultTeam!.teamId,
        name: account.defaultTeam!.teamName,
        role: 'owner',
      },
      session: {
        id: identity.sessionId,
        expiresAt: identity.expiresAt,
      },
    });
    const service = new AuthService(repository as never, configService());
    const current = await service.authenticateRequest({
      headers: {
        authorization: 'Bearer session-token',
      },
    });

    await expect(service.me(current)).resolves.toMatchObject({
      account: {
        id: account.accountId,
        email: account.email,
      },
      activeTeam: {
        id: account.defaultTeam?.teamId,
        role: 'owner',
      },
      session: {
        id: identity.sessionId,
      },
    });
    await expect(
      service.switchActiveTeam({ teamId: account.defaultTeam!.teamId }, identity),
    ).resolves.toMatchObject({
      activeTeam: {
        id: account.defaultTeam!.teamId,
        role: 'owner',
      },
      session: {
        id: identity.sessionId,
      },
    });
    expect(repository.updateSessionTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: identity.sessionId,
        accountId: identity.accountId,
        teamId: account.defaultTeam!.teamId,
        now: expect.any(String),
      }),
    );
  });

  it('rejects switching the active workspace to a team outside the account membership', async () => {
    const repository = repositoryMock();
    repository.updateSessionTeam.mockResolvedValue(undefined);
    const service = new AuthService(repository as never, configService());

    await expect(
      service.switchActiveTeam(
        {
          teamId: '99999999-9999-4999-8999-999999999999',
        },
        identity,
      ),
    ).rejects.toThrow(ApiForbiddenError);
    expect(repository.updateSessionTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: identity.sessionId,
        accountId: identity.accountId,
        teamId: '99999999-9999-4999-8999-999999999999',
      }),
    );
  });

  it('creates hashed team invitations without leaking raw token storage', async () => {
    const repository = repositoryMock();
    repository.createTeamInvitation.mockImplementation(async (input) => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: input.teamId,
      email: input.email,
      role: input.role,
      status: 'pending',
      invitedByAccountId: input.invitedByAccountId,
      expiresAt: input.expiresAt,
      createdAt: '2026-07-06T00:00:00.000Z',
    }));
    const service = new AuthService(repository as never, configService());

    const invitation = await service.inviteTeamMember(
      account.defaultTeam!.teamId,
      {
        email: 'FinOps@Example.com',
        role: 'member',
      },
      identity,
    );

    expect(invitation.inviteToken).toEqual(expect.any(String));
    expect(invitation.inviteUrl).toContain('/?invite_token=');
    expect(repository.createTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'finops@example.com',
        role: 'member',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(repository.createTeamInvitation.mock.calls[0][0].tokenHash).not.toBe(
      invitation.inviteToken,
    );

    repository.resendTeamInvitation.mockImplementation(async (input) => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: input.teamId,
      email: 'finops@example.com',
      role: 'member',
      status: 'pending',
      invitedByAccountId: input.invitedByAccountId,
      expiresAt: input.expiresAt,
      createdAt: '2026-07-06T00:05:00.000Z',
    }));

    const resent = await service.resendTeamInvitation(
      account.defaultTeam!.teamId,
      '88888888-8888-4888-8888-888888888888',
      identity,
    );

    expect(resent.inviteToken).toEqual(expect.any(String));
    expect(resent.inviteUrl).toContain('/?invite_token=');
    expect(repository.resendTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationId: '88888888-8888-4888-8888-888888888888',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        invitedByAccountId: identity.accountId,
      }),
    );
    expect(repository.resendTeamInvitation.mock.calls[0][0].tokenHash).not.toBe(resent.inviteToken);
  });

  it('previews invalid and expired invitation landing states without accepting them', async () => {
    const repository = repositoryMock();
    const service = new AuthService(repository as never, configService());

    repository.findInvitationByTokenHash.mockResolvedValueOnce(undefined);
    await expect(service.previewInvitation('missing-token')).resolves.toEqual({
      status: 'invalid',
      message: 'Invitation token was not found.',
    });

    repository.findInvitationByTokenHash.mockResolvedValueOnce({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: account.defaultTeam!.teamId,
      email: 'finops@example.com',
      role: 'member',
      status: 'pending',
      invitedByAccountId: account.accountId,
      expiresAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2025-12-25T00:00:00.000Z',
    });

    await expect(service.previewInvitation('expired-token')).resolves.toMatchObject({
      status: 'expired',
      email: 'finops@example.com',
      message: expect.stringContaining('expired'),
    });
  });

  it('updates account profile, changes password, and deactivates account with current password checks', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...account,
      passwordHash: hashPassword('correct horse battery staple'),
    });
    repository.updateAccountProfile.mockResolvedValue({
      id: account.accountId,
      email: 'lead@example.com',
      displayName: 'Lead Architect',
      status: 'active',
    });
    repository.updateAccountPassword.mockResolvedValue(true);
    repository.deactivateAccount.mockResolvedValue({
      id: account.accountId,
      email: account.email,
      displayName: account.displayName,
      status: 'disabled',
    });
    const service = new AuthService(repository as never, configService());

    await expect(
      service.updateProfile(
        {
          email: 'lead@example.com',
          displayName: 'Lead Architect',
          currentPassword: 'correct horse battery staple',
        },
        identity,
      ),
    ).resolves.toMatchObject({
      email: 'lead@example.com',
      displayName: 'Lead Architect',
    });
    expect(repository.updateAccountProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: account.accountId,
        email: 'lead@example.com',
        externalSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );

    await expect(
      service.changePassword(
        {
          currentPassword: 'correct horse battery staple',
          newPassword: 'new correct horse battery staple',
        },
        identity,
      ),
    ).resolves.toEqual({ changed: true });
    expect(repository.updateAccountPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: account.accountId,
        passwordHash: expect.stringMatching(/^scrypt:v1:/),
      }),
    );

    await expect(
      service.deleteAccount(
        {
          currentPassword: 'correct horse battery staple',
          confirmation: 'DELETE',
        },
        identity,
      ),
    ).resolves.toEqual({ deleted: true });
    expect(repository.deactivateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: account.accountId,
      }),
    );
  });

  it('creates teams, updates team settings, revokes invites, and configures mock-tested SSO', async () => {
    const repository = repositoryMock();
    repository.createTeamForAccount.mockResolvedValue({
      teamId: '55555555-5555-4555-8555-555555555555',
      teamName: 'Platform team',
      plan: 'oss',
      role: 'owner',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });
    repository.updateTeamSettings.mockResolvedValue({
      teamId: account.defaultTeam!.teamId,
      teamName: 'Architecture platform',
      plan: 'oss',
      role: 'owner',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });
    repository.revokeTeamInvitation.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: account.defaultTeam!.teamId,
      email: 'finops@example.com',
      role: 'member',
      status: 'revoked',
      invitedByAccountId: account.accountId,
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:00:00.000Z',
      revokedAt: '2026-07-06T00:05:00.000Z',
    });
    repository.upsertSsoProviderConfig.mockResolvedValue({
      providerType: 'oidc',
      displayName: 'Corporate OIDC',
      issuerUrl: 'https://idp.example.com',
      status: 'configured',
    });
    const service = new AuthService(repository as never, configService());

    await expect(
      service.createTeam({ teamName: 'Platform team' }, identity),
    ).resolves.toMatchObject({
      teamName: 'Platform team',
      role: 'owner',
    });
    await expect(
      service.updateTeamSettings(
        account.defaultTeam!.teamId,
        { teamName: 'Architecture platform' },
        identity,
      ),
    ).resolves.toMatchObject({
      teamName: 'Architecture platform',
    });
    await expect(
      service.revokeTeamInvitation(
        account.defaultTeam!.teamId,
        '88888888-8888-4888-8888-888888888888',
        identity,
      ),
    ).resolves.toMatchObject({
      status: 'revoked',
    });
    await expect(
      service.configureSsoProvider(
        account.defaultTeam!.teamId,
        {
          providerType: 'oidc',
          displayName: 'Corporate OIDC',
          issuerUrl: 'https://idp.example.com',
          clientId: 'polycost-client-id',
          clientSecret: 'CHANGE_ME_DEV_ONLY',
        },
        identity,
      ),
    ).resolves.toMatchObject({
      providerType: 'oidc',
      status: 'configured',
    });
    await expect(
      service.testSsoConnection(
        account.defaultTeam!.teamId,
        {
          providerType: 'oidc',
          displayName: 'Corporate OIDC',
          issuerUrl: 'https://idp.example.com',
        },
        identity,
      ),
    ).resolves.toMatchObject({
      ok: true,
      providerType: 'oidc',
    });
  });

  it('protects the final team owner from accidental demotion', async () => {
    const repository = repositoryMock();
    repository.getTeamMembership.mockResolvedValue(account.defaultTeam!);
    repository.countTeamOwners.mockResolvedValue(1);
    const service = new AuthService(repository as never, configService());

    await expect(
      service.updateTeamMemberRole(
        account.defaultTeam!.teamId,
        account.accountId,
        {
          role: 'admin',
        },
        identity,
      ),
    ).rejects.toThrow(ApiForbiddenError);
    expect(repository.updateTeamMemberRole).not.toHaveBeenCalled();
  });

  it('requires owner access for role changes', async () => {
    const repository = repositoryMock();
    repository.getTeamMembership.mockResolvedValue({
      teamId: account.defaultTeam!.teamId,
      teamName: account.defaultTeam!.teamName,
      role: 'admin',
    });
    const service = new AuthService(repository as never, configService());
    const adminIdentity: AuthIdentity = {
      ...identity,
      role: 'admin',
    };

    await expect(
      service.updateTeamMemberRole(
        account.defaultTeam!.teamId,
        account.accountId,
        {
          role: 'member',
        },
        adminIdentity,
      ),
    ).rejects.toThrow(ApiForbiddenError);
    expect(repository.updateTeamMemberRole).not.toHaveBeenCalled();
  });

  it('reports SSO readiness from environment and stored team provider configs', async () => {
    const repository = repositoryMock();
    repository.listSsoProviderConfigs.mockResolvedValue([
      {
        providerType: 'oidc',
        displayName: 'Corporate OIDC',
        issuerUrl: 'https://idp.example.com',
        status: 'configured',
      },
    ]);
    const service = new AuthService(repository as never, configService());

    await expect(service.ssoStatus(identity)).resolves.toMatchObject({
      localLoginEnabled: true,
      oidcConfigured: true,
      samlConfigured: false,
      configuredProviders: [
        {
          providerType: 'oidc',
          displayName: 'Corporate OIDC',
        },
      ],
      callbackUrls: {
        oidc: 'http://localhost:3001/api/v1/auth/sso/oidc/callback',
        saml: 'http://localhost:3001/api/v1/auth/sso/saml/acs',
      },
    });
  });

  it('runs the mock OIDC start, authorize, and callback flow through server sessions', async () => {
    const repository = repositoryMock();
    repository.listSsoProviderConfigs.mockResolvedValue([
      {
        providerType: 'oidc',
        displayName: 'Corporate OIDC',
        issuerUrl: 'https://idp.example.com',
        status: 'configured',
      },
    ]);
    repository.upsertExternalAccountForTeam.mockResolvedValue({
      accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'sso.user@example.com',
      displayName: 'SSO User',
      status: 'active',
      defaultTeam: {
        teamId: account.defaultTeam!.teamId,
        teamName: account.defaultTeam!.teamName,
        role: 'member',
      },
    });
    repository.createSession.mockResolvedValue({
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expiresAt: '2026-07-07T00:00:00.000Z',
    });
    const service = new AuthService(repository as never, configService());

    const start = await service.startMockOidcLogin({
      teamId: account.defaultTeam!.teamId,
      email: 'sso.user@example.com',
    });
    expect(start.authorizationUrl).toContain('/api/v1/auth/sso/mock/oidc/authorize');

    const authorize = service.mockOidcAuthorize({
      state: start.state,
      email: 'sso.user@example.com',
    });
    expect(authorize.redirectUrl).toContain('/api/v1/auth/sso/oidc/callback');

    const callback = await service.completeMockOidcCallback(
      {
        state: start.state,
        email: 'sso.user@example.com',
        displayName: 'SSO User',
      },
      {
        ip: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(callback.token).toEqual(expect.any(String));
    expect(callback.account.email).toBe('sso.user@example.com');
    expect(callback.team?.role).toBe('member');
    expect(callback.sso).toMatchObject({
      providerType: 'oidc',
      issuerUrl: 'https://idp.example.com',
      stateVerified: true,
    });
    expect(repository.upsertExternalAccountForTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        authProvider: 'oidc',
        defaultRole: 'member',
        externalSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        teamId: account.defaultTeam!.teamId,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('lists active account sessions and revokes other devices without touching current session', async () => {
    const repository = repositoryMock();
    repository.listAccountSessions.mockResolvedValue([
      {
        id: identity.sessionId,
        current: true,
        createdAt: '2026-07-06T00:00:00.000Z',
        lastSeenAt: '2026-07-06T00:10:00.000Z',
        expiresAt: identity.expiresAt,
        hasUserAgent: true,
        hasIp: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999999',
        current: false,
        createdAt: '2026-07-05T00:00:00.000Z',
        lastSeenAt: '2026-07-05T00:10:00.000Z',
        expiresAt: identity.expiresAt,
        hasUserAgent: true,
        hasIp: false,
      },
    ]);
    repository.revokeOtherSessions.mockResolvedValue(1);
    const service = new AuthService(repository as never, configService());

    await expect(service.listSessions(identity)).resolves.toEqual([
      expect.objectContaining({
        id: identity.sessionId,
        current: true,
        hasUserAgent: true,
        hasIp: true,
      }),
      expect.objectContaining({
        current: false,
      }),
    ]);
    await expect(service.revokeOtherSessions(identity)).resolves.toEqual({ revoked: 1 });
    expect(repository.revokeOtherSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: identity.accountId,
        currentSessionId: identity.sessionId,
        revokedAt: expect.any(String),
      }),
    );
  });

  it('enforces the team RBAC matrix for member, admin, and owner actions', async () => {
    const repository = repositoryMock();
    repository.listTeamMembers.mockResolvedValue([
      {
        accountId: account.accountId,
        email: account.email,
        displayName: account.displayName,
        role: 'owner',
        createdAt: '2026-07-06T00:00:00.000Z',
      },
      {
        accountId: '99999999-9999-4999-8999-999999999999',
        email: 'member@example.com',
        role: 'member',
        createdAt: '2026-07-06T00:00:00.000Z',
      },
    ]);
    repository.updateTeamSettings.mockImplementation(async (input) => ({
      teamId: input.teamId,
      teamName: input.teamName,
      plan: 'oss',
      role: 'admin',
      updatedAt: '2026-07-06T00:00:00.000Z',
    }));
    repository.createTeamInvitation.mockImplementation(async (input) => ({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: input.teamId,
      email: input.email,
      role: input.role,
      status: 'pending',
      invitedByAccountId: input.invitedByAccountId,
      expiresAt: input.expiresAt,
      createdAt: '2026-07-06T00:00:00.000Z',
    }));
    repository.revokeTeamInvitation.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: account.defaultTeam!.teamId,
      email: 'finops@example.com',
      role: 'member',
      status: 'revoked',
      invitedByAccountId: account.accountId,
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:00:00.000Z',
      revokedAt: '2026-07-06T00:05:00.000Z',
    });
    repository.upsertSsoProviderConfig.mockResolvedValue({
      providerType: 'oidc',
      displayName: 'Corporate OIDC',
      issuerUrl: 'https://idp.example.com',
      status: 'configured',
    });
    repository.getTeamMembership.mockImplementation(async ({ accountId }) => ({
      teamId: account.defaultTeam!.teamId,
      teamName: account.defaultTeam!.teamName,
      role: accountId === account.accountId ? 'owner' : 'member',
    }));
    repository.updateTeamMemberRole.mockImplementation(async (input) => ({
      accountId: input.accountId,
      email: 'member@example.com',
      role: input.role,
      createdAt: '2026-07-06T00:00:00.000Z',
    }));
    repository.resendTeamInvitation.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      teamId: account.defaultTeam!.teamId,
      email: 'new@example.com',
      role: 'member',
      status: 'pending',
      invitedByAccountId: account.accountId,
      expiresAt: '2026-07-13T00:00:00.000Z',
      createdAt: '2026-07-06T00:05:00.000Z',
    });
    repository.removeTeamMember.mockResolvedValue(true);
    repository.countTeamOwners.mockResolvedValue(2);
    const service = new AuthService(repository as never, configService());
    const memberIdentity = identityWithRole('member');
    const adminIdentity = identityWithRole('admin');
    const ownerIdentity = identityWithRole('owner');

    await expectForbidden(
      service.updateTeamSettings(
        account.defaultTeam!.teamId,
        { teamName: 'Member edit' },
        memberIdentity,
      ),
      'Team admin access is required',
    );
    await expectForbidden(
      service.listTeamMembers(account.defaultTeam!.teamId, memberIdentity),
      'Team admin access is required',
    );
    await expectForbidden(
      service.inviteTeamMember(
        account.defaultTeam!.teamId,
        { email: 'new@example.com', role: 'member' },
        memberIdentity,
      ),
      'Team admin access is required',
    );
    await expectForbidden(
      service.resendTeamInvitation(
        account.defaultTeam!.teamId,
        '88888888-8888-4888-8888-888888888888',
        memberIdentity,
      ),
      'Team admin access is required',
    );
    await expectForbidden(
      service.configureSsoProvider(
        account.defaultTeam!.teamId,
        {
          providerType: 'oidc',
          displayName: 'Corporate OIDC',
          issuerUrl: 'https://idp.example.com',
        },
        memberIdentity,
      ),
      'Team admin access is required',
    );

    await expect(
      service.updateTeamSettings(
        account.defaultTeam!.teamId,
        { teamName: 'Admin edit' },
        adminIdentity,
      ),
    ).resolves.toMatchObject({ teamName: 'Admin edit' });
    await expect(
      service.listTeamMembers(account.defaultTeam!.teamId, adminIdentity),
    ).resolves.toHaveLength(2);
    await expect(
      service.inviteTeamMember(
        account.defaultTeam!.teamId,
        { email: 'new@example.com', role: 'member' },
        adminIdentity,
      ),
    ).resolves.toMatchObject({ email: 'new@example.com', role: 'member' });
    await expect(
      service.revokeTeamInvitation(
        account.defaultTeam!.teamId,
        '88888888-8888-4888-8888-888888888888',
        adminIdentity,
      ),
    ).resolves.toMatchObject({ status: 'revoked' });
    await expect(
      service.resendTeamInvitation(
        account.defaultTeam!.teamId,
        '88888888-8888-4888-8888-888888888888',
        adminIdentity,
      ),
    ).resolves.toMatchObject({ status: 'pending', inviteToken: expect.any(String) });
    await expect(
      service.testSsoConnection(
        account.defaultTeam!.teamId,
        {
          providerType: 'oidc',
          displayName: 'Corporate OIDC',
          issuerUrl: 'https://idp.example.com',
        },
        adminIdentity,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      service.removeTeamMember(
        account.defaultTeam!.teamId,
        '99999999-9999-4999-8999-999999999999',
        adminIdentity,
      ),
    ).resolves.toEqual({ removed: true });

    await expectForbidden(
      service.updateTeamMemberRole(
        account.defaultTeam!.teamId,
        '99999999-9999-4999-8999-999999999999',
        { role: 'admin' },
        adminIdentity,
      ),
      'Team owner access is required',
    );
    await expectForbidden(
      service.removeTeamMember(account.defaultTeam!.teamId, account.accountId, adminIdentity),
      'Only team owners can remove owners',
    );

    await expect(
      service.updateTeamMemberRole(
        account.defaultTeam!.teamId,
        '99999999-9999-4999-8999-999999999999',
        { role: 'admin' },
        ownerIdentity,
      ),
    ).resolves.toMatchObject({ role: 'admin' });
    await expect(
      service.removeTeamMember(account.defaultTeam!.teamId, account.accountId, ownerIdentity),
    ).resolves.toEqual({ removed: true });
  });
});

describe('BillingService', () => {
  it('imports normalized invoice rows with source and line-item hashes', async () => {
    const repository = repositoryMock();
    repository.createBillingImport.mockImplementation(async (input) => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        sourceType: input.importInput.sourceType,
        status: 'completed',
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256,
        rowsReceived: input.rows.length,
        rowsAccepted: input.rows.length,
        rowsRejected: 0,
        totalCostUsd: 107,
        createdByAccountId: identity.accountId,
        createdAt: '2026-07-06T00:00:00.000Z',
        completedAt: '2026-07-06T00:00:01.000Z',
      },
      lineItems: input.rows.map((row, index) => ({
        id: `line-${index}`,
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        ...row,
        createdAt: '2026-07-06T00:00:01.000Z',
      })),
    }));
    const service = new BillingService(repository as never);

    const result = await service.importActuals(
      {
        provider: 'aws',
        sourceType: 'aws-cur',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        rows: [
          {
            serviceName: 'AmazonEC2',
            skuId: 'sku-compute',
            costUsd: 107,
            tags: {
              cost_center: 'engineering',
            },
          },
        ],
      },
      identity,
    );

    expect(result.importRun.originalFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.lineItems[0].lineItemHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createBillingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: identity.teamId,
        createdByAccountId: identity.accountId,
      }),
    );
  });

  it('imports AWS CUR provider exports through the native mapper', async () => {
    const repository = repositoryMock();
    repository.createBillingImport.mockImplementation(async (input) => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        sourceType: input.importInput.sourceType,
        status: 'completed',
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256,
        rowsReceived: input.rows.length,
        rowsAccepted: input.rows.length,
        rowsRejected: 0,
        totalCostUsd: 107,
        createdByAccountId: identity.accountId,
        createdAt: '2026-07-06T00:00:00.000Z',
        completedAt: '2026-07-06T00:00:01.000Z',
      },
      lineItems: input.rows.map((row, index) => ({
        id: `line-${index}`,
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        ...row,
        createdAt: '2026-07-06T00:00:01.000Z',
      })),
    }));
    const service = new BillingService(repository as never);

    const result = await service.importProviderExport(
      {
        provider: 'aws',
        sourceType: 'aws-cur',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        content: [
          'lineItem/ProductCode,product/sku,lineItem/UsageStartDate,lineItem/UsageAmount,pricing/unit,lineItem/NetUnblendedCost,lineItem/CurrencyCode,product/region,lineItem/ResourceId,resourceTags/user:cost_center',
          'AmazonEC2,sku-compute,2026-06-01T00:00:00Z,730,Hrs,107.00,USD,us-east-1,i-demo,engineering',
        ].join('\n'),
      },
      identity,
    );

    expect(result.importRun.originalFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createBillingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        importInput: expect.objectContaining({
          provider: 'aws',
          sourceType: 'aws-cur',
        }),
        rows: [
          expect.objectContaining({
            serviceName: 'AmazonEC2',
            skuId: 'sku-compute',
            region: 'us-east-1',
            costUsd: 107,
            tags: {
              cost_center: 'engineering',
            },
            rawPayload: expect.objectContaining({
              _polycost: expect.objectContaining({
                provider: 'aws',
                sourceRowFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
                recognizedColumns: expect.arrayContaining([
                  'lineItem/NetUnblendedCost',
                  'lineItem/ProductCode',
                  'product/sku',
                ]),
                missingRecommendedFields: ['usageEnd'],
                normalizationStatus: 'partial-provider-export',
              }),
            }),
          }),
        ],
      }),
    );
  });

  it('imports Azure Cost Management exports through the native mapper', async () => {
    const repository = repositoryMock();
    repository.createBillingImport.mockImplementation(async (input) => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        sourceType: input.importInput.sourceType,
        status: 'completed',
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256,
        rowsReceived: input.rows.length,
        rowsAccepted: input.rows.length,
        rowsRejected: 0,
        totalCostUsd: 42.25,
        createdByAccountId: identity.accountId,
        createdAt: '2026-07-06T00:00:00.000Z',
        completedAt: '2026-07-06T00:00:01.000Z',
      },
      lineItems: input.rows.map((row, index) => ({
        id: `line-${index}`,
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        ...row,
        createdAt: '2026-07-06T00:00:01.000Z',
      })),
    }));
    const service = new BillingService(repository as never);

    await service.importProviderExport(
      {
        provider: 'azure',
        sourceType: 'azure-cost-management',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        content: [
          'ServiceName,MeterId,ResourceLocation,ResourceId,UsageDateTime,UsageEndDate,Quantity,UnitOfMeasure,CostInBillingCurrency,BillingCurrencyCode,Tags',
          'Virtual Machines,meter-compute,eastus,/subscriptions/demo/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/app,2026-06-01T00:00:00Z,2026-06-01T01:00:00Z,1,Hours,42.25,USD,"{""cost_center"":""platform"",""env"":""prod""}"',
        ].join('\n'),
      },
      identity,
    );

    expect(repository.createBillingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        importInput: expect.objectContaining({
          provider: 'azure',
          sourceType: 'azure-cost-management',
        }),
        rows: [
          expect.objectContaining({
            serviceName: 'Virtual Machines',
            skuId: 'meter-compute',
            region: 'eastus',
            resourceId:
              '/subscriptions/demo/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/app',
            costUsd: 42.25,
            currency: 'USD',
            tags: {
              cost_center: 'platform',
              env: 'prod',
            },
            rawPayload: expect.objectContaining({
              _polycost: expect.objectContaining({
                provider: 'azure',
                recognizedColumns: expect.arrayContaining([
                  'BillingCurrencyCode',
                  'CostInBillingCurrency',
                  'MeterId',
                  'ServiceName',
                  'Tags',
                ]),
                normalizationStatus: 'provider-export-audit-ready',
              }),
            }),
          }),
        ],
      }),
    );
  });

  it('imports nested GCP Billing Export JSON through the native mapper', async () => {
    const repository = repositoryMock();
    repository.createBillingImport.mockImplementation(async (input) => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        sourceType: input.importInput.sourceType,
        status: 'completed',
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256,
        rowsReceived: input.rows.length,
        rowsAccepted: input.rows.length,
        rowsRejected: 0,
        totalCostUsd: 19.84,
        createdByAccountId: identity.accountId,
        createdAt: '2026-07-06T00:00:00.000Z',
        completedAt: '2026-07-06T00:00:01.000Z',
      },
      lineItems: input.rows.map((row, index) => ({
        id: `line-${index}`,
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        ...row,
        createdAt: '2026-07-06T00:00:01.000Z',
      })),
    }));
    const service = new BillingService(repository as never);

    await service.importProviderExport(
      {
        provider: 'gcp',
        sourceType: 'gcp-billing-export',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        content: JSON.stringify([
          {
            service: {
              description: 'Compute Engine',
              id: '6F81-5844-456A',
            },
            sku: {
              id: 'gcp-n2-standard-4',
              description: 'N2 Instance Core running in Americas',
            },
            location: {
              region: 'us-east1',
            },
            project: {
              id: 'demo-project',
              labels: {
                cost_center: 'platform',
                env: 'prod',
              },
            },
            usage_start_time: '2026-06-01T00:00:00Z',
            usage_end_time: '2026-06-01T01:00:00Z',
            usage: {
              amount: 4,
              unit: 'h',
            },
            cost: 19.84,
            currency: 'USD',
          },
        ]),
      },
      identity,
    );

    expect(repository.createBillingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        importInput: expect.objectContaining({
          provider: 'gcp',
          sourceType: 'gcp-billing-export',
        }),
        rows: [
          expect.objectContaining({
            serviceName: 'Compute Engine',
            skuId: 'gcp-n2-standard-4',
            region: 'us-east1',
            resourceId: 'demo-project',
            usageQuantity: 4,
            usageUnit: 'h',
            costUsd: 19.84,
            tags: {
              cost_center: 'platform',
              env: 'prod',
            },
            rawPayload: expect.objectContaining({
              _polycost: expect.objectContaining({
                provider: 'gcp',
                recognizedColumns: expect.arrayContaining([
                  'cost',
                  'currency',
                  'location.region',
                  'project.id',
                  'project.labels',
                  'service.description',
                  'sku.id',
                  'usage.amount',
                  'usage.unit',
                  'usage_end_time',
                  'usage_start_time',
                ]),
                normalizationStatus: 'provider-export-audit-ready',
              }),
            }),
          }),
        ],
      }),
    );
  });

  it('reconciles imported actuals against comparison totals with trace evidence', async () => {
    const repository = repositoryMock();
    repository.getBillingImport.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      teamId: identity.teamId,
      provider: 'aws',
      sourceType: 'aws-cur',
      status: 'completed',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-06-30',
      originalFileSha256: 'a'.repeat(64),
      rowsReceived: 1,
      rowsAccepted: 1,
      rowsRejected: 0,
      totalCostUsd: 107,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    repository.listInvoiceLineItems.mockResolvedValue([
      {
        id: 'line-1',
        importRunId: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: 'aws',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        serviceName: 'AmazonEC2',
        skuId: 'sku-compute',
        region: 'us-east-1',
        resourceId: 'i-demo',
        usageStart: '2026-06-01T00:00:00.000Z',
        usageEnd: '2026-06-30T23:59:59.000Z',
        costUsd: 107,
        currency: 'USD',
        tags: {},
        rawPayload: {
          _polycost: {
            sourceRowFingerprint: 'c'.repeat(64),
            missingRecommendedFields: [],
          },
        },
        lineItemHash: 'b'.repeat(64),
        createdAt: '2026-07-06T00:00:01.000Z',
      },
    ]);
    repository.getComparison.mockResolvedValue({
      nwsSnapshot: {} as never,
      resultSnapshot: comparisonResult,
    });
    repository.saveInvoiceReconciliation.mockImplementation(async (input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      createdAt: '2026-07-06T00:00:02.000Z',
      ...input,
    }));
    const service = new BillingService(repository as never);

    await expect(
      service.reconcile(
        '55555555-5555-4555-8555-555555555555',
        {
          comparisonId: comparisonResult.comparisonId,
        },
        identity,
      ),
    ).resolves.toMatchObject({
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: expect.objectContaining({
        invoiceLineItemHashes: ['b'.repeat(64)],
        invoiceSourceRowFingerprints: ['c'.repeat(64)],
        invoiceCoverage: expect.objectContaining({
          rowCount: 1,
          rowsWithSkuId: 1,
          rowsWithRegion: 1,
          rowsWithResourceId: 1,
          rowsWithUsageWindow: 1,
          rowsWithSourceFingerprint: 1,
          sourceFingerprintPercent: 100,
        }),
        invoiceMatchSummary: expect.objectContaining({
          readiness: 'audit-ready-with-caveats',
          caveats: [
            'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
          ],
        }),
        comparisonTraceKeys: expect.any(Array),
      }),
    });
  });

  it('blocks reconciliation across active team boundaries', async () => {
    const repository = repositoryMock();
    repository.getBillingImport.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      teamId: '77777777-7777-4777-8777-777777777777',
      provider: 'aws',
      sourceType: 'aws-cur',
      status: 'completed',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-06-30',
      originalFileSha256: 'a'.repeat(64),
      rowsReceived: 1,
      rowsAccepted: 1,
      rowsRejected: 0,
      totalCostUsd: 107,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    const service = new BillingService(repository as never);

    await expect(
      service.reconcile(
        '55555555-5555-4555-8555-555555555555',
        {
          comparisonId: comparisonResult.comparisonId,
        },
        identity,
      ),
    ).rejects.toThrow(ApiForbiddenError);
  });

  it('requires owner or admin access for billing imports and reconciliation reads', async () => {
    const repository = repositoryMock();
    const service = new BillingService(repository as never);
    const memberIdentity = identityWithRole('member');

    await expectForbidden(
      service.importActuals(
        {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          rows: [
            {
              serviceName: 'AmazonEC2',
              costUsd: 107,
            },
          ],
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.importProviderExport(
        {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          content: 'lineItem/ProductCode,lineItem/NetUnblendedCost\nAmazonEC2,107.00',
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.reconcile(
        '55555555-5555-4555-8555-555555555555',
        {
          comparisonId: comparisonResult.comparisonId,
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.listReconciliations('55555555-5555-4555-8555-555555555555', memberIdentity),
      'Team admin access is required for billing reconciliation',
    );

    expect(repository.createBillingImport).not.toHaveBeenCalled();
    expect(repository.getBillingImport).not.toHaveBeenCalled();
    expect(repository.listInvoiceReconciliations).not.toHaveBeenCalled();
  });
});

function repositoryMock() {
  return {
    findLocalAccountByEmail: jest.fn(),
    createLocalAccountWithTeam: jest.fn(),
    updateAccountProfile: jest.fn(),
    updateAccountPassword: jest.fn(),
    deactivateAccount: jest.fn(),
    createSession: jest.fn(),
    listAccountSessions: jest.fn(),
    revokeOtherSessions: jest.fn(),
    updateSessionTeam: jest.fn(),
    recordFailedLogin: jest.fn(),
    resetFailedLogin: jest.fn(),
    resolveSession: jest.fn(),
    listAccountTeams: jest.fn(),
    createTeamForAccount: jest.fn(),
    updateTeamSettings: jest.fn(),
    getTeamMembership: jest.fn(),
    listTeamMembers: jest.fn(),
    createTeamInvitation: jest.fn(),
    listTeamInvitations: jest.fn(),
    revokeTeamInvitation: jest.fn(),
    resendTeamInvitation: jest.fn(),
    findInvitationByTokenHash: jest.fn(),
    findPendingInvitationByTokenHash: jest.fn(),
    acceptTeamInvitation: jest.fn(),
    countTeamOwners: jest.fn(),
    updateTeamMemberRole: jest.fn(),
    removeTeamMember: jest.fn(),
    listSsoProviderConfigs: jest.fn(),
    upsertSsoProviderConfig: jest.fn(),
    upsertExternalAccountForTeam: jest.fn(),
    createBillingImport: jest.fn(),
    getBillingImport: jest.fn(),
    listInvoiceLineItems: jest.fn(),
    getComparison: jest.fn(),
    saveInvoiceReconciliation: jest.fn(),
    listInvoiceReconciliations: jest.fn(),
  } as unknown as jest.Mocked<ApiDatabaseRepository>;
}

function identityWithRole(role: TeamRole): AuthIdentity {
  return {
    ...identity,
    role,
  };
}

async function expectForbidden(promise: Promise<unknown>, message: string): Promise<void> {
  await expect(promise).rejects.toThrow(ApiForbiddenError);
  await expect(promise).rejects.toThrow(message);
}

function configService(): ConfigService<AppConfig, true> {
  return {
    get: jest.fn((key: keyof AppConfig) => {
      switch (key) {
        case 'AUTH_SESSION_TTL_HOURS':
          return 12;
        case 'AUTH_PASSWORD_MIN_LENGTH':
          return 12;
        case 'AUTH_MAX_FAILED_LOGIN_ATTEMPTS':
          return 5;
        case 'AUTH_LOCKOUT_MINUTES':
          return 15;
        case 'AUTH_LOCAL_REGISTRATION_ENABLED':
          return true;
        case 'AUTH_PUBLIC_BASE_URL':
          return 'http://localhost:3001';
        case 'AUTH_SSO_STATE_SECRET':
          return 'test-sso-state-secret-value';
        case 'AUTH_OIDC_ISSUER_URL':
          return 'https://idp.example.com';
        case 'AUTH_SAML_ENTITY_ID':
          return undefined;
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService<AppConfig, true>;
}
