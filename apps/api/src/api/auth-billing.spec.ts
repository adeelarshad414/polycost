import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ComparisonResult } from '../comparison/comparison.types.js';
import { AppConfig } from '../config/config.schema.js';
import { ApiForbiddenError, ApiUnauthorizedError, ApiValidationError } from './api-errors.js';
import { ApiDatabaseRepository, LocalAccountWithPassword } from './api-database.repository.js';
import { AuthService } from './auth.service.js';
import { AuthIdentity, TeamRole } from './auth.types.js';
import { BillingService } from './billing.service.js';
import { InvoiceArtifactGovernanceService } from './invoice-artifact-governance.service.js';
import { InvoiceArtifactStorageService } from './invoice-artifact-storage.service.js';
import { InvoiceEvidenceNotaryService } from './invoice-evidence-notary.service.js';
import { hashPassword } from './password-hash.js';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { MetricsService } from '../observability/metrics.service.js';

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
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.invitation.created',
          targetType: 'invitation',
          metadata: {
            email: 'finops@example.com',
            role: 'member',
          },
        }),
      }),
    );
    expect(repository.createTeamInvitation.mock.calls[0][0].tokenHash).not.toBe(
      invitation.inviteToken,
    );
    expect(repository.createTeamInvitation.mock.calls[0][0].audit?.metadata).toEqual(
      expect.not.objectContaining({
        inviteToken: expect.any(String),
        inviteUrl: expect.any(String),
      }),
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
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.invitation.resent',
          targetType: 'invitation',
        }),
      }),
    );
    expect(repository.resendTeamInvitation.mock.calls[0][0].tokenHash).not.toBe(resent.inviteToken);
    expect(repository.recordTeamAuditEvent).not.toHaveBeenCalled();
  });

  it('omits raw invitation tokens from API responses when webhook delivery is active', async () => {
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
    const deliveryService = {
      deliverTeamInvitation: jest.fn(async () => ({
        mode: 'webhook' as const,
        status: 'accepted' as const,
        message: 'Invite delivery webhook accepted the invitation.',
        tokenExposedInResponse: false,
        deliveredAt: '2026-07-06T00:00:01.000Z',
      })),
    };
    const service = new AuthService(repository as never, configService(), deliveryService as never);

    const invitation = await service.inviteTeamMember(
      account.defaultTeam!.teamId,
      {
        email: 'FinOps@Example.com',
        role: 'admin',
      },
      identity,
    );

    expect(invitation.inviteToken).toBeUndefined();
    expect(invitation.inviteUrl).toBeUndefined();
    expect(invitation.delivery).toMatchObject({
      mode: 'webhook',
      status: 'accepted',
      tokenExposedInResponse: false,
    });
    expect(repository.createTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(deliveryService.deliverTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteUrl: expect.stringContaining('/?invite_token='),
        action: 'created',
        invitedBy: {
          accountId: identity.accountId,
          email: identity.email,
        },
      }),
    );
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
    repository.listTeamAuditEvents.mockResolvedValue([
      {
        id: '99999999-9999-4999-8999-999999999999',
        teamId: account.defaultTeam!.teamId,
        actorAccountId: identity.accountId,
        actorEmail: identity.email,
        action: 'team.sso.configured',
        targetType: 'sso_provider',
        targetId: 'oidc:https://idp.example.com',
        metadata: {},
        createdAt: '2026-07-06T00:00:01.000Z',
      },
    ]);
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
    await expect(
      service.listTeamAuditEvents(account.defaultTeam!.teamId, identity, 10),
    ).resolves.toHaveLength(1);

    expect(repository.createTeamForAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.created',
          targetType: 'team',
        }),
      }),
    );
    expect(repository.updateTeamSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.settings.updated',
          targetType: 'team',
        }),
      }),
    );
    expect(repository.revokeTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.invitation.revoked',
          targetType: 'invitation',
        }),
      }),
    );
    expect(repository.upsertSsoProviderConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.sso.configured',
          targetType: 'sso_provider',
        }),
      }),
    );
    expect(repository.recordTeamAuditEvent).not.toHaveBeenCalled();
    expect(repository.listTeamAuditEvents).toHaveBeenCalledWith(account.defaultTeam!.teamId, 10);
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

  it('SEC-4: disables the mock OIDC flow in production (no session minting)', async () => {
    const repository = repositoryMock();
    const service = new AuthService(repository as never, configService({ NODE_ENV: 'production' }));

    await expect(
      service.startMockOidcLogin({ teamId: account.defaultTeam!.teamId, email: 'a@b.com' }),
    ).rejects.toThrow(/disabled in this environment/i);
    expect(() => service.mockOidcAuthorize({ state: 'x', email: 'a@b.com' })).toThrow(
      /disabled in this environment/i,
    );
    await expect(
      service.completeMockOidcCallback({ state: 'x', email: 'a@b.com' }),
    ).rejects.toThrow(/disabled in this environment/i);
    // No account/session was created via the bypass.
    expect(repository.upsertExternalAccountForTeam).not.toHaveBeenCalled();
    expect(repository.createSession).not.toHaveBeenCalled();
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
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'billing.import.created',
          targetType: 'billing_import',
        }),
      }),
    );
    expect(repository.recordTeamAuditEvent).not.toHaveBeenCalled();
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
          'lineItem/ProductCode,lineItem/LineItemType,product/sku,lineItem/UsageStartDate,lineItem/UsageAmount,pricing/unit,lineItem/NetUnblendedCost,lineItem/CurrencyCode,product/region,lineItem/ResourceId,resourceTags/user:cost_center',
          'AmazonEC2,Usage,sku-compute,2026-06-01T00:00:00Z,730,Hrs,107.00,USD,us-east-1,i-demo,engineering',
          'Tax,Tax,tax-sku,2026-06-01T00:00:00Z,0,USD,8.50,USD,us-east-1,,finance',
          'AWSComputeSavingsPlans,SavingsPlanNegation,sp-negation-sku,2026-06-01T00:00:00Z,730,Hrs,-12.50,USD,us-east-1,,finance',
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
                invoiceAdjustmentClassification: expect.objectContaining({
                  category: 'usage',
                  isAdjustment: false,
                }),
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
          expect.objectContaining({
            serviceName: 'Tax',
            costUsd: 8.5,
            rawPayload: expect.objectContaining({
              _polycost: expect.objectContaining({
                invoiceAdjustmentClassification: expect.objectContaining({
                  category: 'tax',
                  isAdjustment: true,
                }),
              }),
            }),
          }),
          expect.objectContaining({
            serviceName: 'AWSComputeSavingsPlans',
            costUsd: -12.5,
            rawPayload: expect.objectContaining({
              _polycost: expect.objectContaining({
                invoiceAdjustmentClassification: expect.objectContaining({
                  category: 'commitment-discount',
                  isAdjustment: true,
                  commitmentEvidence: expect.objectContaining({
                    kind: 'savings-plan',
                    treatment: 'discount',
                    requiresProviderInventory: true,
                    requiresAmortizationPeriod: false,
                    requiresAllocationEvidence: true,
                  }),
                }),
              }),
            }),
          }),
        ],
      }),
    );
  });

  it('Phase 1: parses provider costs with thousands separators instead of truncating at the comma', async () => {
    const repository = repositoryMock();
    repository.createBillingImport.mockImplementation(async (input) => ({
      importRun: {
        id: '55555555-5555-4555-8555-555555555555',
        teamId: identity.teamId,
        provider: input.importInput.provider,
        sourceType: input.importInput.sourceType,
        status: 'completed' as const,
        billingPeriodStart: input.importInput.billingPeriodStart,
        billingPeriodEnd: input.importInput.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256,
        rowsReceived: input.rows.length,
        rowsAccepted: input.rows.length,
        rowsRejected: 0,
        totalCostUsd: 1234.56,
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
        provider: 'aws',
        sourceType: 'aws-cur',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        content: [
          'lineItem/ProductCode,lineItem/LineItemType,product/sku,lineItem/UsageStartDate,lineItem/UsageAmount,pricing/unit,lineItem/NetUnblendedCost,lineItem/CurrencyCode,product/region,lineItem/ResourceId,resourceTags/user:cost_center',
          // Cost is written with a US thousands separator, e.g. from an
          // Excel-massaged export. Number.parseFloat would stop at the comma and
          // read this $1,234.56 charge as $1.
          'AmazonEC2,Usage,sku-compute,2026-06-01T00:00:00Z,730,Hrs,"1,234.56",USD,us-east-1,i-demo,engineering',
        ].join('\n'),
      },
      identity,
    );

    expect(repository.createBillingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            serviceName: 'AmazonEC2',
            costUsd: 1234.56,
          }),
        ],
      }),
    );
  });

  it('Phase 1: rejects a non-USD provider export instead of reconciling it as USD', async () => {
    const repository = repositoryMock();
    const service = new BillingService(repository as never);

    await expect(
      service.importProviderExport(
        {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          content: [
            'lineItem/ProductCode,lineItem/NetUnblendedCost,lineItem/CurrencyCode',
            'AmazonEC2,107.00,EUR',
          ].join('\n'),
        },
        identity,
      ),
    ).rejects.toThrow(/not in USD|currency/i);
    expect(repository.createBillingImport).not.toHaveBeenCalled();
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
      evidenceHash: 'a'.repeat(32),
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
        invoiceAdjustmentSummary: expect.objectContaining({
          grossInvoiceTotalUsd: 107,
          estimateComparableUsageCostUsd: 107,
          adjustmentCostUsd: 0,
          usageLineItemCount: 1,
          adjustmentLineItemCount: 0,
          estimateComparableVarianceUsd: 7,
          categories: [
            expect.objectContaining({
              category: 'usage',
              rowCount: 1,
              totalCostUsd: 107,
            }),
          ],
        }),
        comparisonTraceKeys: expect.any(Array),
      }),
    });
    expect(repository.saveInvoiceReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          teamId: identity.teamId,
          actorAccountId: identity.accountId,
          action: 'billing.reconciliation.created',
          targetType: 'billing_reconciliation',
        }),
      }),
    );
    expect(repository.recordTeamAuditEvent).not.toHaveBeenCalled();
  });

  it('separates taxes, credits, support, and marketplace rows from usage variance evidence', async () => {
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
      rowsReceived: 5,
      rowsAccepted: 5,
      rowsRejected: 0,
      totalCostUsd: 137,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    repository.listInvoiceLineItems.mockResolvedValue([
      invoiceLineItem('AmazonEC2', 'sku-compute', 100, 'usage'),
      invoiceLineItem('Tax', 'tax-sku', 8, 'tax'),
      invoiceLineItem('Promotional Credit', 'credit-sku', -3, 'credit'),
      invoiceLineItem('AWS Support Business', 'support-sku', 12, 'support'),
      invoiceLineItem('AWS Marketplace private offer', 'marketplace-sku', 20, 'marketplace'),
    ]);
    repository.getComparison.mockResolvedValue({
      nwsSnapshot: {} as never,
      resultSnapshot: comparisonResult,
    });
    repository.saveInvoiceReconciliation.mockImplementation(async (input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      createdAt: '2026-07-06T00:00:02.000Z',
      evidenceHash: 'a'.repeat(32),
      ...input,
    }));
    const service = new BillingService(repository as never);

    await service.reconcile(
      '55555555-5555-4555-8555-555555555555',
      {
        comparisonId: comparisonResult.comparisonId,
      },
      identity,
    );

    expect(repository.saveInvoiceReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        invoicedTotalUsd: 137,
        varianceUsd: 37,
        variancePercent: 37,
        status: 'variance-critical',
        evidence: expect.objectContaining({
          invoiceAdjustmentSummary: expect.objectContaining({
            grossInvoiceTotalUsd: 137,
            estimateComparableUsageCostUsd: 100,
            adjustmentCostUsd: 37,
            usageLineItemCount: 1,
            adjustmentLineItemCount: 4,
            estimateComparableVarianceUsd: 0,
            estimateComparableVariancePercent: 0,
            categories: expect.arrayContaining([
              expect.objectContaining({ category: 'usage', rowCount: 1, totalCostUsd: 100 }),
              expect.objectContaining({ category: 'marketplace', rowCount: 1, totalCostUsd: 20 }),
              expect.objectContaining({ category: 'support', rowCount: 1, totalCostUsd: 12 }),
              expect.objectContaining({ category: 'tax', rowCount: 1, totalCostUsd: 8 }),
              expect.objectContaining({ category: 'credit', rowCount: 1, totalCostUsd: -3 }),
            ]),
          }),
          invoiceMatchSummary: expect.objectContaining({
            caveats: expect.arrayContaining([
              '4 non-usage invoice adjustment row(s) were separated from estimate-comparable usage.',
            ]),
          }),
        }),
      }),
    );
  });

  it('separates commitment discount, fee, and amortization semantics from usage variance', async () => {
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
      rowsReceived: 5,
      rowsAccepted: 5,
      rowsRejected: 0,
      totalCostUsd: 98,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    repository.listInvoiceLineItems.mockResolvedValue([
      invoiceLineItem('AmazonEC2', 'sku-compute', 100, 'usage'),
      invoiceLineItem('SavingsPlanCoveredUsage', 'sp-covered-sku', 0, 'commitment-covered-usage'),
      invoiceLineItem('SavingsPlanNegation', 'sp-negation-sku', -25, 'commitment-discount'),
      invoiceLineItem('RIFee', 'ri-fee-sku', 20, 'commitment-fee'),
      invoiceLineItem('UnusedReservation', 'ri-unused-sku', 3, 'commitment-amortization'),
    ]);
    repository.getComparison.mockResolvedValue({
      nwsSnapshot: {} as never,
      resultSnapshot: comparisonResult,
    });
    repository.saveInvoiceReconciliation.mockImplementation(async (input) => ({
      id: '66666666-6666-4666-8666-666666666666',
      createdAt: '2026-07-06T00:00:02.000Z',
      evidenceHash: 'a'.repeat(32),
      ...input,
    }));
    const service = new BillingService(repository as never);

    await service.reconcile(
      '55555555-5555-4555-8555-555555555555',
      {
        comparisonId: comparisonResult.comparisonId,
      },
      identity,
    );

    expect(repository.saveInvoiceReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        invoicedTotalUsd: 98,
        varianceUsd: -2,
        variancePercent: -2,
        status: 'matched',
        evidence: expect.objectContaining({
          invoiceAdjustmentSummary: expect.objectContaining({
            grossInvoiceTotalUsd: 98,
            estimateComparableUsageCostUsd: 100,
            adjustmentCostUsd: -2,
            usageLineItemCount: 2,
            adjustmentLineItemCount: 3,
            commitmentLineItemCount: 4,
            commitmentNetCostUsd: -2,
            commitmentEvidence: expect.objectContaining({
              status: 'provider-inventory-required',
              rowsRequiringProviderInventory: 4,
              rowsRequiringAmortizationPeriod: 2,
              rowsRequiringAllocationEvidence: 4,
              categories: expect.arrayContaining([
                expect.objectContaining({
                  kind: 'savings-plan',
                  treatment: 'covered-usage',
                  rowCount: 1,
                  totalCostUsd: 0,
                }),
                expect.objectContaining({
                  kind: 'savings-plan',
                  treatment: 'discount',
                  rowCount: 1,
                  totalCostUsd: -25,
                }),
                expect.objectContaining({
                  kind: 'reserved-capacity',
                  treatment: 'fee',
                  rowCount: 1,
                  totalCostUsd: 20,
                }),
                expect.objectContaining({
                  kind: 'reserved-capacity',
                  treatment: 'unused',
                  rowCount: 1,
                  totalCostUsd: 3,
                }),
              ]),
              caveats: expect.arrayContaining([
                'Provider commitment inventory is required before treating this as invoice-grade amortization evidence.',
                'Amortization period and unused commitment allocation must be proven by provider/account data.',
              ]),
            }),
            estimateComparableVarianceUsd: 0,
            estimateComparableVariancePercent: 0,
            categories: expect.arrayContaining([
              expect.objectContaining({ category: 'usage', rowCount: 1, totalCostUsd: 100 }),
              expect.objectContaining({
                category: 'commitment-covered-usage',
                rowCount: 1,
                totalCostUsd: 0,
              }),
              expect.objectContaining({
                category: 'commitment-discount',
                rowCount: 1,
                totalCostUsd: -25,
              }),
              expect.objectContaining({
                category: 'commitment-fee',
                rowCount: 1,
                totalCostUsd: 20,
              }),
              expect.objectContaining({
                category: 'commitment-amortization',
                rowCount: 1,
                totalCostUsd: 3,
              }),
            ]),
          }),
          invoiceGradeReadiness: expect.objectContaining({
            status: 'invoice-grade-blocked',
            missingCount: expect.any(Number),
            blockers: expect.arrayContaining([
              'Provider invoice control total',
              'Commitment amortization evidence',
              'Private pricing and discount proof',
            ]),
            checks: expect.arrayContaining([
              expect.objectContaining({
                id: 'provider-invoice-control',
                status: 'missing',
                requiredArtifact: expect.stringContaining('AWS invoice PDF'),
              }),
              expect.objectContaining({
                id: 'commitment-amortization',
                status: 'missing',
                evidence: '4 commitment row(s); 2 require amortization-period proof.',
              }),
              expect.objectContaining({
                id: 'private-pricing',
                status: 'missing',
                evidence: '1 private-pricing, discount, or enterprise-adjustment row(s) detected.',
              }),
              expect.objectContaining({
                id: 'allocation-evidence',
                status: 'present',
              }),
            ]),
          }),
          invoiceMatchSummary: expect.objectContaining({
            caveats: expect.arrayContaining([
              '4 commitment, reservation, or savings-plan row(s) were classified separately; amortization remains provider-specific evidence.',
              '2 commitment row(s) require amortization-period and unused-commitment allocation proof from provider/account inventory.',
              '3 non-usage invoice adjustment row(s) were separated from estimate-comparable usage.',
            ]),
          }),
        }),
      }),
    );
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

  it('registers invoice-grade artifact metadata without marking evidence verified', async () => {
    const repository = repositoryMock();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 3,
          blockers: ['Provider invoice control total'],
          checks: [
            {
              id: 'provider-invoice-control',
              label: 'Provider invoice control total',
              status: 'missing',
              evidence:
                'PolyCost has normalized provider export rows, not the provider invoice of record.',
              requiredArtifact:
                'AWS invoice PDF/tax invoice, CUR manifest, payer-account billing period, and Cost Explorer control total.',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceReconciliationEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.registerInvoiceGradeArtifact(
      '66666666-6666-4666-8666-666666666666',
      {
        type: 'provider-invoice',
        displayName: 'June AWS invoice control packet',
        reference: 's3://billing-audit/2026-06/aws-invoice.pdf',
        sha256: 'b'.repeat(64),
        controlTotalUsd: 107,
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        notes: 'Metadata registered during demo readiness hardening.',
      },
      identity,
    );

    expect(result.evidence).toEqual(
      expect.objectContaining({
        invoiceGradeReadiness: expect.objectContaining({
          status: 'invoice-grade-blocked',
          artifactRegisterStatus: 'metadata-registered-not-verified',
          registeredArtifactCount: 1,
          checks: [
            expect.objectContaining({
              id: 'provider-invoice-control',
              status: 'missing',
              artifactRegisterStatus: 'metadata-registered-not-verified',
              registeredArtifactCount: 1,
              verifiedArtifactCount: 0,
            }),
          ],
        }),
        invoiceGradeArtifactRegister: expect.objectContaining({
          status: 'metadata-registered-not-verified',
          provider: 'aws',
          registeredCount: 1,
          verifiedCount: 0,
          artifactCountsByType: {
            'provider-invoice': 1,
          },
          artifacts: [
            expect.objectContaining({
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 's3://billing-audit/2026-06/aws-invoice.pdf',
              verificationStatus: 'registered',
              registeredByAccountId: identity.accountId,
            }),
          ],
          controlTotalDeltas: [
            expect.objectContaining({
              controlTotalUsd: 107,
              reconciliationInvoicedTotalUsd: 107,
              deltaUsd: 0,
            }),
          ],
        }),
      }),
    );
    expect(repository.updateInvoiceReconciliationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        audit: expect.objectContaining({
          teamId: identity.teamId,
          actorAccountId: identity.accountId,
          action: 'billing.reconciliation.artifact_registered',
          targetType: 'billing_reconciliation',
          targetId: '66666666-6666-4666-8666-666666666666',
          metadata: expect.objectContaining({
            artifactType: 'provider-invoice',
            verificationStatus: 'registered',
          }),
        }),
      }),
    );
  });

  it('verifies registered invoice-grade artifact evidence with checksum controls', async () => {
    const repository = repositoryMock();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          missingCount: 2,
          blockers: ['Provider invoice control total', 'Private pricing and discount proof'],
          requiredArtifacts: [
            'AWS invoice PDF/tax invoice, CUR manifest, payer-account billing period, and Cost Explorer control total.',
            'Private rate card, enterprise agreement, EDP/EA terms, discount schedule, or provider contract extract.',
          ],
          checks: [
            {
              id: 'provider-invoice-control',
              label: 'Provider invoice control total',
              status: 'missing',
              evidence:
                'PolyCost has normalized provider export rows, not the provider invoice of record.',
              requiredArtifact:
                'AWS invoice PDF/tax invoice, CUR manifest, payer-account billing period, and Cost Explorer control total.',
            },
            {
              id: 'private-pricing',
              label: 'Private pricing and discount proof',
              status: 'missing',
              evidence: '1 private-pricing, discount, or enterprise-adjustment row(s) detected.',
              requiredArtifact:
                'Private rate card, enterprise agreement, EDP/EA terms, discount schedule, or provider contract extract.',
            },
          ],
        },
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          provider: 'aws',
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 's3://billing-audit/2026-06/aws-invoice.pdf',
              sha256: 'b'.repeat(64),
              controlTotalUsd: 107,
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              registeredByAccountId: identity.accountId,
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceReconciliationEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.verifyInvoiceGradeArtifact(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        verificationStatus: 'verified',
        evidenceReference: 'review://controls/aws-invoice-2026-06',
        sha256: 'b'.repeat(64),
        controlTotalUsd: 107,
        notes: 'Reviewed invoice checksum and control total.',
      },
      identity,
    );

    expect(result.evidence).toEqual(
      expect.objectContaining({
        invoiceGradeReadiness: expect.objectContaining({
          status: 'invoice-grade-blocked',
          missingCount: 1,
          presentCount: 1,
          blockers: ['Private pricing and discount proof'],
          checks: [
            expect.objectContaining({
              id: 'provider-invoice-control',
              status: 'present',
              artifactRegisterStatus: 'verified-artifact-present',
              verifiedArtifactCount: 1,
              verifiedArtifactTypes: ['provider-invoice', 'control-total'],
              missingAcceptedArtifactTypes: [],
            }),
            expect.objectContaining({
              id: 'private-pricing',
              status: 'missing',
            }),
          ],
        }),
        invoiceGradeArtifactRegister: expect.objectContaining({
          status: 'registered-with-verified-artifacts',
          registeredCount: 1,
          verifiedCount: 1,
          artifacts: [
            expect.objectContaining({
              id: 'artifact-1',
              verificationStatus: 'verified',
              verificationEvidenceReference: 'review://controls/aws-invoice-2026-06',
              verifiedByAccountId: identity.accountId,
              verifiedSha256: 'b'.repeat(64),
              verificationControlTotalUsd: 107,
              verificationControlTotalDeltaUsd: 0,
            }),
          ],
        }),
      }),
    );
    expect(repository.updateInvoiceReconciliationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          action: 'billing.reconciliation.artifact_verified',
          targetType: 'billing_reconciliation',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            artifactType: 'provider-invoice',
            verificationStatus: 'verified',
          }),
        }),
      }),
    );
  });

  it('validates invoice control packets against reconciliation and import totals', async () => {
    const repository = repositoryMock();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeArtifactRegister: {
          status: 'registered-with-verified-artifacts',
          provider: 'aws',
          registeredCount: 1,
          verifiedCount: 1,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 's3://billing-audit/2026-06/aws-invoice.pdf',
              sha256: 'b'.repeat(64),
              controlTotalUsd: 107,
              billingPeriodStart: '2026-06-01',
              billingPeriodEnd: '2026-06-30',
              verificationStatus: 'verified',
              verificationEvidenceReference: 'review://controls/aws-invoice-2026-06',
              verificationControlTotalUsd: 107,
              registeredAt: '2026-07-06T00:00:03.000Z',
              registeredByAccountId: identity.accountId,
              verifiedAt: '2026-07-06T00:00:04.000Z',
              verifiedByAccountId: identity.accountId,
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 7,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: identity.accountId,
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceReconciliationEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.validateInvoiceControlPacket(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        acceptedVarianceUsd: 0.01,
        evidenceReference: 'invoice-control://controls/artifact-1',
        notes: 'Provider control packet total matched imported actuals and reconciliation.',
      },
      identity,
    );
    const evidenceRegister = result.evidence.invoiceGradeArtifactRegister as {
      invoiceControlMatchedCount: number;
      invoiceControlNotRunCount: number;
      artifacts: Array<Record<string, unknown>>;
    };

    expect(evidenceRegister.invoiceControlMatchedCount).toBe(1);
    expect(evidenceRegister.invoiceControlNotRunCount).toBe(0);
    expect(evidenceRegister.artifacts[0]).toMatchObject({
      id: 'artifact-1',
      invoiceControlValidationStatus: 'matched',
      invoiceControlAcceptedVarianceUsd: 0.01,
      invoiceControlTotalDeltaUsd: 0,
      invoiceControlImportDeltaUsd: 0,
      invoiceControlPeriodMatched: true,
      invoiceControlEvidenceReference: 'invoice-control://controls/artifact-1',
      invoiceControlValidatedByAccountId: identity.accountId,
    });
    expect(repository.updateInvoiceReconciliationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        audit: expect.objectContaining({
          action: 'billing.reconciliation.invoice_control_validated',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            artifactType: 'provider-invoice',
            validationStatus: 'matched',
            controlTotalUsd: 107,
            controlTotalDeltaUsd: 0,
            importTotalDeltaUsd: 0,
            acceptedVarianceUsd: 0.01,
            periodMatched: true,
            evidenceReference: 'invoice-control://controls/artifact-1',
          }),
        }),
      }),
    );
  });

  it('builds metadata-only invoice evidence packets for reconciliation review', async () => {
    const repository = repositoryMock();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeReadiness: {
          status: 'invoice-grade-review-ready',
          presentCount: 9,
          missingCount: 0,
          partialCount: 0,
          blockers: [],
        },
        invoiceMatchSummary: {
          readiness: 'audit-ready-with-caveats',
          caveats: ['Provider invoice rendering remains outside PolyCost.'],
        },
        invoiceGradeArtifactRegister: {
          status: 'registered-with-verified-artifacts',
          provider: 'aws',
          registeredCount: 1,
          verifiedCount: 1,
          reviewApprovedCount: 1,
          policyExceptionApprovedCount: 0,
          policyExceptionExpiredCount: 0,
          invoiceControlMatchedCount: 1,
          invoiceControlVarianceWarningCount: 0,
          invoiceControlMismatchCount: 0,
          invoiceControlNotRunCount: 0,
          caveats: ['Stored artifacts are metadata-only in reconciliation evidence.'],
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 's3://billing-audit/2026-06/aws-invoice.pdf',
              sha256: 'b'.repeat(64),
              controlTotalUsd: 107,
              verificationControlTotalUsd: 107,
              verificationStatus: 'verified',
              reviewStatus: 'approved',
              invoiceControlValidationStatus: 'matched',
              invoiceControlTotalDeltaUsd: 0,
              invoiceControlImportDeltaUsd: 0,
              invoiceControlPeriodMatched: true,
              registeredAt: '2026-07-06T00:00:03.000Z',
              registeredByAccountId: identity.accountId,
              verifiedAt: '2026-07-06T00:00:04.000Z',
              verifiedByAccountId: identity.accountId,
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 210,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: identity.accountId,
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    const service = new BillingService(repository as never);

    const packet = await service.exportInvoiceEvidencePacket(
      '66666666-6666-4666-8666-666666666666',
      identity,
    );

    expect(packet).toEqual(
      expect.objectContaining({
        packetVersion: 'invoice-evidence-packet/v1',
        packetStatus: 'review-ready',
        reconciliation: expect.objectContaining({
          id: '66666666-6666-4666-8666-666666666666',
          invoicedTotalUsd: 107,
        }),
        importRun: expect.objectContaining({
          totalCostUsd: 107,
          originalFileSha256: 'a'.repeat(64),
        }),
        controls: expect.objectContaining({
          registeredCount: 1,
          verifiedCount: 1,
          storedCount: 1,
          reviewApprovedCount: 1,
          invoiceControlMatchedCount: 1,
          invoiceControlMismatchCount: 0,
        }),
        artifactGovernance: expect.objectContaining({
          schemaVersion: 'invoice-evidence-governance/v1',
          accessControls: expect.objectContaining({
            requiresBillingAdmin: true,
            teamScoped: true,
            rawArtifactBytesExcluded: true,
            packetExportAuditAction: 'billing.reconciliation.evidence_packet_exported',
            artifactDownloadAuditAction: 'billing.reconciliation.artifact_blob_downloaded',
          }),
          storagePosture: expect.objectContaining({
            storageBackends: ['database-bytea'],
            storedArtifactCount: 1,
            governanceManifestCount: 0,
            databaseStoredCount: 1,
            missingKmsCount: 1,
          }),
          productionGates: expect.objectContaining({
            packetIntegrityReady: true,
            auditTrailReady: true,
            externalObjectStorageReady: false,
          }),
          gaps: expect.arrayContaining([
            'one or more stored artifacts are missing governance manifests',
          ]),
        }),
        receipt: expect.objectContaining({
          schemaVersion: 'invoice-evidence-receipt/v1',
          mode: 'metadata-only',
          status: 'metadata-only',
          subject: {
            reconciliationId: '66666666-6666-4666-8666-666666666666',
            importRunId: '55555555-5555-4555-8555-555555555555',
            comparisonId: comparisonResult.comparisonId,
            provider: 'aws',
          },
          basePayloadDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          basePayloadByteLength: expect.any(Number),
          wormReadiness: expect.objectContaining({
            retentionMode: 'not-configured',
            configured: false,
            signedReceiptConfigured: false,
            gaps: expect.arrayContaining(['signed evidence receipt is not configured']),
          }),
        }),
        artifacts: [
          expect.objectContaining({
            id: 'artifact-1',
            stored: true,
            reviewed: true,
            invoiceControlValidationStatus: 'matched',
            storedBlob: expect.objectContaining({
              contentSha256: 'd'.repeat(64),
              contentSizeBytes: 210,
            }),
          }),
        ],
      }),
    );
    expect(packet.disclaimers).toEqual(
      expect.arrayContaining([
        'This packet is metadata-only and intentionally excludes raw invoice artifact bytes.',
      ]),
    );
    const { integrity, ...packetPayload } = packet;
    const canonicalPayload = stableJson(packetPayload);

    expect(integrity).toEqual(
      expect.objectContaining({
        schemaVersion: 'invoice-evidence-packet-integrity/v1',
        canonicalization: 'stable-json:v1',
        digestAlgorithm: 'sha256',
        payloadDigestSha256: sha256Hex(canonicalPayload),
        payloadByteLength: Buffer.byteLength(canonicalPayload, 'utf8'),
        subject: {
          reconciliationId: '66666666-6666-4666-8666-666666666666',
          importRunId: '55555555-5555-4555-8555-555555555555',
          comparisonId: comparisonResult.comparisonId,
          provider: 'aws',
        },
        artifactCount: 1,
        storedArtifactCount: 1,
        verifiedArtifactCount: 1,
        disclaimerCount: packet.disclaimers.length,
        generatedAt: packet.generatedAt,
      }),
    );
    expect(JSON.stringify(packet)).not.toContain('contentBase64');
    expect(JSON.stringify(packet)).not.toContain('aW52b2ljZQ==');
    expect(repository.recordTeamAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: identity.teamId,
        actorAccountId: identity.accountId,
        action: 'billing.reconciliation.evidence_packet_exported',
        targetType: 'billing_reconciliation',
        targetId: '66666666-6666-4666-8666-666666666666',
        metadata: expect.objectContaining({
          importRunId: '55555555-5555-4555-8555-555555555555',
          comparisonId: comparisonResult.comparisonId,
          provider: 'aws',
          packetStatus: 'review-ready',
          payloadDigestSha256: packet.integrity.payloadDigestSha256,
          receiptStatus: 'metadata-only',
          receiptMode: 'metadata-only',
          receiptSigned: false,
          wormRetentionMode: 'not-configured',
          notaryDeliveryStatus: 'skipped',
          notaryDeliveryMode: 'disabled',
          artifactCount: 1,
          storedArtifactCount: 1,
          verifiedArtifactCount: 1,
          governanceGapCount: packet.artifactGovernance.gaps.length,
          storageBackends: ['database-bytea'],
        }),
      }),
    );
  });

  it('lets artifact-level provider retention proof satisfy the evidence packet gate', async () => {
    const repository = repositoryMock();
    const objectStore = {
      bucketOrContainer: 'polycost-invoice-artifacts',
      prefix: 'invoice-artifacts',
      region: 'us-east-1',
      key: 'invoice-artifacts/team/reconciliation/artifact.txt',
      uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
      version: 'v1',
    };
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeReadiness: {
          checks: [],
        },
        invoiceMatchSummary: {
          caveats: [],
        },
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 1,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'verified',
              registeredAt: '2026-07-06T00:00:03.000Z',
              verifiedAt: '2026-07-06T00:00:04.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'aws-s3',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 7,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                governance: {
                  storageProfile: {
                    storageBackend: 'aws-s3',
                    encryptionStatus: 'customer-managed-kms',
                    objectStore,
                    kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
                    kmsKeyRequiredForProduction: false,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  providerRetentionProof: {
                    schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
                    status: 'provider-verified',
                    evidenceSource: 'provider-control-plane',
                    storageBackend: 'aws-s3',
                    checkedAt: '2026-07-06T01:00:00.000Z',
                    retentionMode: 'provider-object-lock',
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    legalHold: false,
                    objectStore,
                    proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
                    proofDigestSha256: 'f'.repeat(64),
                    caveats: [],
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(
      repository as never,
      new InvoiceArtifactGovernanceService(
        configService({
          INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
          INVOICE_ARTIFACT_OBJECT_STORE_NAME: 'polycost-invoice-artifacts',
          INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
          INVOICE_ARTIFACT_OBJECT_STORE_PREFIX: 'invoice-artifacts',
          INVOICE_ARTIFACT_KMS_KEY_REFERENCE: 'arn:aws:kms:us-east-1:111122223333:key/demo',
        }),
      ),
    );

    const packet = await service.exportInvoiceEvidencePacket(
      '66666666-6666-4666-8666-666666666666',
      identity,
    );

    expect(packet.artifactGovernance.productionGates.providerRetentionProofReady).toBe(true);
    expect(packet.artifactGovernance.storagePosture).toMatchObject({
      externalObjectStoreCount: 1,
      providerRetentionProofVerifiedCount: 1,
      providerRetentionProofMissingCount: 0,
      providerRetentionProofDeclaredCount: 0,
    });
    expect(packet.artifactGovernance.gaps).not.toEqual(
      expect.arrayContaining([
        'provider object-lock WORM retention mode is not configured',
        'provider retention proof is not captured from the provider control plane',
      ]),
    );
    expect(packet.artifactGovernance.gaps).toEqual(
      expect.arrayContaining([
        'malware scanning is limited to the local EICAR signature hook',
        'retention enforcement is report-only and will not purge expired artifacts',
      ]),
    );
  });

  it('adds signed external receipt readiness when evidence receipt controls are configured', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeReadiness: {
          status: 'invoice-grade-blocked',
          checks: [],
        },
        invoiceMatchSummary: {
          caveats: [],
        },
        invoiceGradeArtifactRegister: {
          registeredCount: 0,
          verifiedCount: 0,
          artifacts: [],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const receiptConfig = configService({
      INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
      INVOICE_ARTIFACT_OBJECT_STORE_NAME: 'polycost-invoice-artifacts',
      INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
      INVOICE_ARTIFACT_KMS_KEY_REFERENCE: 'arn:aws:kms:us-east-1:111122223333:key/demo',
      INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: 'http-webhook',
      INVOICE_ARTIFACT_MALWARE_SCANNER_URL: 'https://scanner.example.com/polycost/artifacts',
      INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET: 'production-scanner-webhook-secret',
      INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE: 'delete-expired',
      AUTH_AUDIT_EXPORT_MODE: 'webhook',
      AUTH_AUDIT_EXPORT_WEBHOOK_URL: 'https://siem.example.com/polycost/audit-events',
      INVOICE_EVIDENCE_RECEIPT_MODE: 'external-webhook',
      INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE:
        'arn:aws:kms:us-east-1:111122223333:alias/polycost-evidence-receipts',
      INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: 'production-evidence-receipt-signing-secret',
      INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL: 'https://worm.example.com/polycost/evidence-receipts',
      INVOICE_EVIDENCE_WORM_RETENTION_MODE: 'external-worm-receiver',
    });
    const notaryFetcher = jest.fn(async () => new Response('', { status: 202 }));
    const service = new BillingService(
      repository as never,
      new InvoiceArtifactGovernanceService(receiptConfig),
      new InvoiceArtifactStorageService(),
      receiptConfig,
      new InvoiceEvidenceNotaryService(
        receiptConfig,
        notaryFetcher,
        () => new Date('2026-07-09T10:00:00.000Z'),
      ),
    );

    const packet = await service.exportInvoiceEvidencePacket(
      '66666666-6666-4666-8666-666666666666',
      identity,
    );

    expect(packet.receipt).toMatchObject({
      schemaVersion: 'invoice-evidence-receipt/v1',
      mode: 'external-webhook',
      status: 'external-notary-ready',
      basePayloadDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      signature: expect.objectContaining({
        algorithm: 'hmac-sha256',
        keyReference: 'arn:aws:kms:us-east-1:111122223333:alias/polycost-evidence-receipts',
        signedPayloadDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        signature: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      notary: expect.objectContaining({
        deliveryMode: 'api-webhook',
        urlHost: 'worm.example.com',
        urlSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        deliveryEvidence: 'accepted-by-api',
        attemptedAt: '2026-07-09T10:00:00.000Z',
        requestDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        acceptedSubjectDigestSha256: packet.receipt.basePayloadDigestSha256,
        responseStatusCode: 202,
      }),
      wormReadiness: expect.objectContaining({
        retentionMode: 'external-worm-receiver',
        configured: true,
        objectStorageConfigured: true,
        customerManagedKmsConfigured: true,
        scannerWebhookConfigured: true,
        retentionDeleteExpiredConfigured: true,
        auditExportWebhookConfigured: true,
        signedReceiptConfigured: true,
        gaps: [],
      }),
    });
    expect(notaryFetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(packet)).not.toContain('production-evidence-receipt-signing-secret');
    expect(repository.recordTeamAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.reconciliation.evidence_packet_exported',
        metadata: expect.objectContaining({
          receiptStatus: 'external-notary-ready',
          receiptMode: 'external-webhook',
          receiptSigned: true,
          wormRetentionMode: 'external-worm-receiver',
          notaryDeliveryStatus: 'accepted',
          notaryDeliveryMode: 'external-webhook',
          notaryDeliveryEvidence: 'accepted-by-api',
          notaryRequestDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          notaryResponseStatusCode: 202,
        }),
      }),
    );
  });

  it('stores invoice artifact blobs with checksum metadata without exposing bytes in evidence', async () => {
    const repository = repositoryMock();
    const artifactContent = [
      'PolyCost invoice artifact control packet',
      'reconciliation_id=66666666-6666-4666-8666-666666666666',
      'provider=aws',
      'invoiced_total_usd=107',
    ].join('\n');
    const contentSha256 = sha256Hex(artifactContent);
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeReadiness: {
          checks: [],
        },
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          provider: 'aws',
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              registeredByAccountId: identity.accountId,
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.saveInvoiceArtifactBlobAndUpdateEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.uploadInvoiceArtifactBlob(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        fileName: 'aws-invoice-control.txt',
        mimeType: 'text/plain',
        content: artifactContent,
        encoding: 'text',
        sha256: contentSha256,
        retentionDays: 730,
        legalHold: true,
        kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
      },
      identity,
    );
    const evidenceRegister = result.evidence.invoiceGradeArtifactRegister as {
      artifacts: Array<Record<string, unknown>>;
    };
    const storedArtifact = evidenceRegister.artifacts[0];
    const storedBlob = storedArtifact.storedBlob as Record<string, unknown>;

    expect(storedArtifact).not.toHaveProperty('content');
    expect(storedArtifact).not.toHaveProperty('contentBase64');
    expect(storedArtifact).toMatchObject({
      id: 'artifact-1',
      sha256: contentSha256,
    });
    expect(storedBlob).toMatchObject({
      storageStatus: 'stored',
      storageMode: 'database-bytea',
      fileName: 'aws-invoice-control.txt',
      mimeType: 'text/plain',
      contentSha256,
      contentSizeBytes: Buffer.byteLength(artifactContent),
      uploadedByAccountId: identity.accountId,
      governance: expect.objectContaining({
        storageProfile: expect.objectContaining({
          storageBackend: 'database-bytea',
          encryptionStatus: 'database-managed',
          kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
          kmsKeyRequiredForProduction: false,
        }),
        retentionPolicy: expect.objectContaining({
          retentionDays: 730,
          legalHold: true,
        }),
        providerRetentionProof: expect.objectContaining({
          status: 'not-applicable',
          evidenceSource: 'not-required',
          storageBackend: 'database-bytea',
          legalHold: true,
        }),
        malwareScan: expect.objectContaining({
          status: 'passed',
          scanner: 'polycost-eicar-signature-v1',
          findings: [],
        }),
      }),
    });
    expect(repository.saveInvoiceArtifactBlobAndUpdateEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        artifactId: 'artifact-1',
        teamId: identity.teamId,
        fileName: 'aws-invoice-control.txt',
        mimeType: 'text/plain',
        contentSha256,
        contentSizeBytes: Buffer.byteLength(artifactContent),
        storageBackend: 'database-bytea',
        content: Buffer.from(artifactContent, 'utf8'),
        uploadedByAccountId: identity.accountId,
        kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
        retentionUntil: expect.any(String),
        legalHold: true,
        malwareScanCheckedAt: expect.any(String),
        audit: expect.objectContaining({
          action: 'billing.reconciliation.artifact_blob_uploaded',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            contentSha256,
            contentSizeBytes: Buffer.byteLength(artifactContent),
            storageBackend: 'database-bytea',
            kmsKeyConfigured: true,
            retentionUntil: expect.any(String),
            legalHold: true,
            malwareScanStatus: 'passed',
            malwareScanScanner: 'polycost-eicar-signature-v1',
          }),
        }),
      }),
    );
  });

  it('updates invoice artifact legal hold state in row storage and reconciliation evidence', async () => {
    const repository = repositoryMock();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeArtifactRegister: {
          status: 'metadata-registered-not-verified',
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 7,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: identity.accountId,
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceArtifactLegalHoldAndEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.setInvoiceArtifactLegalHold(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        legalHold: true,
        reason: 'retention review',
      },
      identity,
    );
    const evidenceRegister = result.evidence.invoiceGradeArtifactRegister as {
      artifacts: Array<Record<string, unknown>>;
    };
    const storedBlob = evidenceRegister.artifacts[0]?.storedBlob as Record<string, unknown>;

    expect(storedBlob).toMatchObject({
      legalHoldUpdatedByAccountId: identity.accountId,
      legalHoldReason: 'retention review',
      governance: expect.objectContaining({
        retentionPolicy: expect.objectContaining({
          legalHold: true,
        }),
      }),
    });
    expect(storedBlob.legalHoldUpdatedAt).toEqual(expect.any(String));
    expect(repository.updateInvoiceArtifactLegalHoldAndEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        artifactId: 'artifact-1',
        legalHold: true,
        audit: expect.objectContaining({
          action: 'billing.reconciliation.artifact_legal_hold_updated',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            legalHold: true,
            reason: 'retention review',
          }),
        }),
      }),
    );
  });

  it('attaches provider retention proof to an externally stored invoice artifact', async () => {
    const repository = repositoryMock();
    const objectStore = {
      bucketOrContainer: 'polycost-invoice-artifacts',
      prefix: 'invoice-artifacts',
      region: 'us-east-1',
      key: 'invoice-artifacts/team/reconciliation/artifact.txt',
      uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
      version: 'v1',
    };
    const governance = {
      storageProfile: {
        storageBackend: 'aws-s3' as const,
        encryptionStatus: 'customer-managed-kms' as const,
        objectStore,
        kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
        kmsKeyRequiredForProduction: false,
      },
      retentionPolicy: {
        retentionUntil: '2027-07-06T00:00:05.000Z',
        retentionDays: 365,
        legalHold: false,
      },
      providerRetentionProof: {
        schemaVersion: 'invoice-artifact-provider-retention-proof/v1' as const,
        status: 'missing' as const,
        evidenceSource: 'local-config' as const,
        storageBackend: 'aws-s3' as const,
        checkedAt: '2026-07-06T00:00:05.000Z',
        retentionMode: 'not-configured' as const,
        retentionUntil: '2027-07-06T00:00:05.000Z',
        legalHold: false,
        objectStore,
        caveats: ['provider retention proof is not captured from the provider control plane'],
      },
      malwareScan: {
        status: 'passed' as const,
        scanner: 'polycost-eicar-signature-v1',
        checkedAt: '2026-07-06T00:00:05.000Z',
        findings: [],
      },
    };
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'aws-s3',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 7,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: identity.accountId,
                governance,
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceArtifactProviderRetentionProofAndEvidence.mockImplementation(
      async (input) => ({
        ...reconciliationRecord,
        evidence: input.evidence,
      }),
    );
    const service = new BillingService(repository as never);

    const result = await service.attachInvoiceArtifactProviderRetentionProof(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
        proofDigestSha256: 'f'.repeat(64),
        checkedAt: '2026-07-06T01:00:00.000Z',
        notes: 'captured by release operator',
      },
      identity,
    );
    const artifacts = (
      result.evidence.invoiceGradeArtifactRegister as { artifacts: Array<Record<string, unknown>> }
    ).artifacts;
    const storedBlob = artifacts[0]?.storedBlob as { governance?: Record<string, unknown> };
    const updatedGovernance = storedBlob.governance as Record<string, unknown>;

    expect(updatedGovernance.providerRetentionProof).toMatchObject({
      status: 'provider-verified',
      evidenceSource: 'provider-control-plane',
      storageBackend: 'aws-s3',
      retentionMode: 'provider-object-lock',
      proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
      proofDigestSha256: 'f'.repeat(64),
      checkedAt: '2026-07-06T01:00:00.000Z',
      objectStore,
    });
    expect(repository.updateInvoiceArtifactProviderRetentionProofAndEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        artifactId: 'artifact-1',
        providerRetentionProof: expect.objectContaining({
          status: 'provider-verified',
          evidenceSource: 'provider-control-plane',
          proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
          proofDigestSha256: 'f'.repeat(64),
        }),
        audit: expect.objectContaining({
          action: 'billing.reconciliation.artifact_provider_retention_proof_attached',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
            proofDigestSha256: 'f'.repeat(64),
            objectStoreUri:
              's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
          }),
        }),
      }),
    );
  });

  it('rejects provider retention proof references with embedded signed-url credentials', async () => {
    const repository = repositoryMock();
    const service = new BillingService(repository as never);

    await expect(
      service.attachInvoiceArtifactProviderRetentionProof(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          proofReference: 'https://storage.example.com/proof.json?sig=secret',
          proofDigestSha256: 'f'.repeat(64),
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.getInvoiceReconciliation).not.toHaveBeenCalled();
    expect(repository.updateInvoiceReconciliationEvidence).not.toHaveBeenCalled();
    expect(
      repository.updateInvoiceArtifactProviderRetentionProofAndEvidence,
    ).not.toHaveBeenCalled();
  });

  it('lists invoice artifact review queue rows for an imported billing run', async () => {
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
    repository.listInvoiceReconciliations.mockResolvedValue([
      {
        evidenceHash: 'a'.repeat(32),
        id: '66666666-6666-4666-8666-666666666666',
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws',
        estimatedTotalUsd: 100,
        invoicedTotalUsd: 107,
        varianceUsd: 7,
        variancePercent: 7,
        status: 'variance-warning',
        evidence: {
          invoiceGradeArtifactRegister: {
            registeredCount: 1,
            verifiedCount: 0,
            artifacts: [
              {
                id: 'artifact-1',
                provider: 'aws',
                type: 'provider-invoice',
                displayName: 'June AWS invoice control packet',
                reference: 'demo://invoice-control',
                verificationStatus: 'registered',
                registeredAt: '2026-07-06T00:00:03.000Z',
                reviewStatus: 'pending',
                reviewReviewer: 'finance-review@example.com',
                reviewDueAt: '2026-07-10T00:00:00.000Z',
                reviewRequestedAt: '2026-07-06T00:00:06.000Z',
                storedBlob: {
                  storageStatus: 'stored',
                  storageMode: 'database-bytea',
                  fileName: 'aws-invoice-control.txt',
                  mimeType: 'text/plain',
                  contentSha256: 'd'.repeat(64),
                  contentSizeBytes: 7,
                  uploadedAt: '2026-07-06T00:00:05.000Z',
                  governance: {
                    storageProfile: {
                      storageBackend: 'database-bytea',
                      encryptionStatus: 'database-managed',
                      kmsKeyRequiredForProduction: true,
                    },
                    retentionPolicy: {
                      retentionUntil: '2027-07-06T00:00:05.000Z',
                      retentionDays: 365,
                      legalHold: true,
                    },
                    malwareScan: {
                      status: 'passed',
                      scanner: 'polycost-eicar-signature-v1',
                      checkedAt: '2026-07-06T00:00:05.000Z',
                      findings: [],
                    },
                  },
                },
              },
            ],
          },
        },
        createdAt: '2026-07-06T00:00:02.000Z',
      },
    ]);
    const service = new BillingService(repository as never);

    await expect(
      service.listInvoiceArtifactReviews('55555555-5555-4555-8555-555555555555', identity),
    ).resolves.toEqual([
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        artifactId: 'artifact-1',
        reviewStatus: 'pending',
        reviewer: 'finance-review@example.com',
        artifactBlobStored: true,
        legalHold: true,
      }),
    ]);
  });

  it('lists invoice artifact policy exception queue rows for an imported billing run', async () => {
    const repository = repositoryMock();
    // Relative to now so an approved-but-time-boxed exception stays "approved"
    // rather than rotting to "expired" as wall-clock time passes the fixture date.
    const futureExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
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
    repository.listInvoiceReconciliations.mockResolvedValue([
      {
        evidenceHash: 'a'.repeat(32),
        id: '66666666-6666-4666-8666-666666666666',
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws',
        estimatedTotalUsd: 100,
        invoicedTotalUsd: 107,
        varianceUsd: 7,
        variancePercent: 7,
        status: 'variance-warning',
        evidence: {
          invoiceGradeArtifactRegister: {
            registeredCount: 1,
            verifiedCount: 0,
            artifacts: [
              {
                id: 'artifact-1',
                provider: 'aws',
                type: 'provider-invoice',
                displayName: 'June AWS invoice control packet',
                reference: 'demo://invoice-control',
                verificationStatus: 'registered',
                registeredAt: '2026-07-06T00:00:03.000Z',
                reviewStatus: 'approved',
                policyExceptionStatus: 'approved',
                policyExceptionReviewer: 'risk-review@example.com',
                policyExceptionReason: 'Time-boxed risk acceptance.',
                policyExceptionExpiresAt: futureExpiresAt,
                policyExceptionRequestedAt: '2026-07-06T00:00:06.000Z',
                storedBlob: {
                  storageStatus: 'stored',
                  storageMode: 'database-bytea',
                  fileName: 'aws-invoice-control.txt',
                  mimeType: 'text/plain',
                  contentSha256: 'd'.repeat(64),
                  contentSizeBytes: 7,
                  uploadedAt: '2026-07-06T00:00:05.000Z',
                  governance: {
                    storageProfile: {
                      storageBackend: 'database-bytea',
                      encryptionStatus: 'database-managed',
                      kmsKeyRequiredForProduction: true,
                    },
                    retentionPolicy: {
                      retentionUntil: '2027-07-06T00:00:05.000Z',
                      retentionDays: 365,
                      legalHold: false,
                    },
                    malwareScan: {
                      status: 'passed',
                      scanner: 'polycost-eicar-signature-v1',
                      checkedAt: '2026-07-06T00:00:05.000Z',
                      findings: [],
                    },
                  },
                },
              },
            ],
          },
        },
        createdAt: '2026-07-06T00:00:02.000Z',
      },
    ]);
    const service = new BillingService(repository as never);

    await expect(
      service.listInvoiceArtifactPolicyExceptions('55555555-5555-4555-8555-555555555555', identity),
    ).resolves.toEqual([
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        artifactId: 'artifact-1',
        reviewStatus: 'approved',
        exceptionStatus: 'approved',
        reviewer: 'risk-review@example.com',
        expiresAt: futureExpiresAt,
        artifactBlobStored: true,
      }),
    ]);
  });

  it('updates invoice artifact review workflow state without marking the artifact verified', async () => {
    const repository = repositoryMock();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 7,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: identity.accountId,
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceReconciliationEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.updateInvoiceArtifactReview(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        reviewStatus: 'approved',
        reviewer: 'finance-review@example.com',
        evidenceReference: 'review://controls/artifact-1/approved',
        notes: 'Finance review approved stored artifact packet.',
      },
      identity,
    );
    const evidenceRegister = result.evidence.invoiceGradeArtifactRegister as {
      reviewApprovedCount: number;
      artifacts: Array<Record<string, unknown>>;
    };

    expect(evidenceRegister.reviewApprovedCount).toBe(1);
    expect(evidenceRegister.artifacts[0]).toMatchObject({
      id: 'artifact-1',
      verificationStatus: 'registered',
      reviewStatus: 'approved',
      reviewReviewer: 'finance-review@example.com',
      reviewEvidenceReference: 'review://controls/artifact-1/approved',
      reviewedByAccountId: identity.accountId,
    });
    expect(repository.updateInvoiceReconciliationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        audit: expect.objectContaining({
          action: 'billing.reconciliation.artifact_review_updated',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            reviewStatus: 'approved',
            reviewer: 'finance-review@example.com',
            evidenceReference: 'review://controls/artifact-1/approved',
          }),
        }),
      }),
    );
  });

  it('updates invoice artifact policy exception state without marking the artifact verified', async () => {
    const repository = repositoryMock();
    // Must be in the future relative to now: the service rejects an approved
    // exception whose expiry is already past, so a hardcoded date silently rots.
    const futureExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
              policyExceptionStatus: 'requested',
              policyExceptionReason: 'Provider control total packet pending.',
              policyExceptionRequestedAt: '2026-07-06T00:00:06.000Z',
              policyExceptionRequestedByAccountId: identity.accountId,
              storedBlob: {
                storageStatus: 'stored',
                storageMode: 'database-bytea',
                fileName: 'aws-invoice-control.txt',
                mimeType: 'text/plain',
                contentSha256: 'd'.repeat(64),
                contentSizeBytes: 7,
                uploadedAt: '2026-07-06T00:00:05.000Z',
                uploadedByAccountId: identity.accountId,
                governance: {
                  storageProfile: {
                    storageBackend: 'database-bytea',
                    encryptionStatus: 'database-managed',
                    kmsKeyRequiredForProduction: true,
                  },
                  retentionPolicy: {
                    retentionUntil: '2027-07-06T00:00:05.000Z',
                    retentionDays: 365,
                    legalHold: false,
                  },
                  malwareScan: {
                    status: 'passed',
                    scanner: 'polycost-eicar-signature-v1',
                    checkedAt: '2026-07-06T00:00:05.000Z',
                    findings: [],
                  },
                },
              },
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.updateInvoiceReconciliationEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const service = new BillingService(repository as never);

    const result = await service.updateInvoiceArtifactPolicyException(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        exceptionStatus: 'approved',
        reviewer: 'risk-review@example.com',
        reason: 'Time-boxed exception approved for demo governance review.',
        expiresAt: futureExpiresAt,
        evidenceReference: 'exception://controls/artifact-1/approved',
        notes: 'Risk owner approved exception without invoice-grade verification.',
      },
      identity,
    );
    const evidenceRegister = result.evidence.invoiceGradeArtifactRegister as {
      policyExceptionApprovedCount: number;
      artifacts: Array<Record<string, unknown>>;
    };

    expect(evidenceRegister.policyExceptionApprovedCount).toBe(1);
    expect(evidenceRegister.artifacts[0]).toMatchObject({
      id: 'artifact-1',
      verificationStatus: 'registered',
      policyExceptionStatus: 'approved',
      policyExceptionReviewer: 'risk-review@example.com',
      policyExceptionReason: 'Time-boxed exception approved for demo governance review.',
      policyExceptionExpiresAt: futureExpiresAt,
      policyExceptionEvidenceReference: 'exception://controls/artifact-1/approved',
      policyExceptionDecidedByAccountId: identity.accountId,
    });
    expect(repository.updateInvoiceReconciliationEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        audit: expect.objectContaining({
          action: 'billing.reconciliation.artifact_exception_updated',
          metadata: expect.objectContaining({
            artifactId: 'artifact-1',
            exceptionStatus: 'approved',
            reviewer: 'risk-review@example.com',
            reason: 'Time-boxed exception approved for demo governance review.',
            expiresAt: futureExpiresAt,
            evidenceReference: 'exception://controls/artifact-1/approved',
          }),
        }),
      }),
    );
  });

  it('rejects artifact review workflow changes before a file is stored', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.updateInvoiceArtifactReview(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          reviewStatus: 'pending',
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.updateInvoiceReconciliationEvidence).not.toHaveBeenCalled();
  });

  it('rejects policy exception changes before an invoice artifact file is stored', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.updateInvoiceArtifactPolicyException(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          exceptionStatus: 'requested',
          reason: 'Requesting risk acceptance before evidence exists.',
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.updateInvoiceReconciliationEvidence).not.toHaveBeenCalled();
  });

  it('rejects invoice control validation before the artifact is stored and verified', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              controlTotalUsd: 107,
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.validateInvoiceControlPacket(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          acceptedVarianceUsd: 0.01,
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.updateInvoiceReconciliationEvidence).not.toHaveBeenCalled();
  });

  it('rejects legal hold changes before an invoice artifact file is stored', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          registeredCount: 1,
          verifiedCount: 0,
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.setInvoiceArtifactLegalHold(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          legalHold: true,
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.updateInvoiceArtifactLegalHoldAndEvidence).not.toHaveBeenCalled();
  });

  it('stores invoice artifact blobs through external object storage without persisting DB bytes', async () => {
    const repository = repositoryMock();
    const artifactContent = 'PolyCost external artifact packet';
    const contentSha256 = sha256Hex(artifactContent);
    const reconciliationRecord = {
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws' as const,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning' as const,
      evidence: {
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    };
    repository.getInvoiceReconciliation.mockResolvedValue(reconciliationRecord);
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
    repository.saveInvoiceArtifactBlobAndUpdateEvidence.mockImplementation(async (input) => ({
      ...reconciliationRecord,
      evidence: input.evidence,
    }));
    const storageService = {
      store: jest.fn(async () => ({
        storageBackend: 'aws-s3' as const,
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreRegion: 'us-east-1',
        objectStoreKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreUri:
          's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreETag: '"etag"',
        objectStoreVersion: 'v1',
      })),
      read: jest.fn(),
    } as unknown as InvoiceArtifactStorageService;
    const service = new BillingService(
      repository as never,
      new InvoiceArtifactGovernanceService(
        configService({
          INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
          INVOICE_ARTIFACT_OBJECT_STORE_NAME: 'polycost-invoice-artifacts',
          INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
          INVOICE_ARTIFACT_OBJECT_STORE_PREFIX: 'invoice-artifacts',
          INVOICE_ARTIFACT_KMS_KEY_REFERENCE: 'arn:aws:kms:us-east-1:111122223333:key/demo',
          INVOICE_EVIDENCE_WORM_RETENTION_MODE: 'provider-object-lock',
          INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE: 'provider-control-plane',
          INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE:
            's3://polycost-invoice-artifacts/object-lock-proof.json',
          INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256: 'e'.repeat(64),
        }),
      ),
      storageService,
    );

    const result = await service.uploadInvoiceArtifactBlob(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      {
        fileName: 'aws-invoice-control.txt',
        mimeType: 'text/plain',
        content: artifactContent,
        encoding: 'text',
        sha256: contentSha256,
      },
      identity,
    );
    const savedInput = repository.saveInvoiceArtifactBlobAndUpdateEvidence.mock.calls[0]?.[0];
    const artifacts = (
      result.evidence.invoiceGradeArtifactRegister as { artifacts: Array<Record<string, unknown>> }
    ).artifacts;
    const storedBlob = artifacts[0]?.storedBlob as Record<string, unknown>;

    expect(storageService.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: Buffer.from(artifactContent),
        contentSha256,
      }),
    );
    expect(savedInput).toEqual(
      expect.objectContaining({
        storageBackend: 'aws-s3',
        contentSizeBytes: Buffer.byteLength(artifactContent),
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreUri:
          's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
      }),
    );
    expect(savedInput).not.toHaveProperty('content');
    expect(storedBlob).toMatchObject({
      storageMode: 'aws-s3',
      governance: expect.objectContaining({
        storageProfile: expect.objectContaining({
          storageBackend: 'aws-s3',
          objectStore: expect.objectContaining({
            uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
            version: 'v1',
          }),
        }),
        providerRetentionProof: expect.objectContaining({
          status: 'provider-verified',
          evidenceSource: 'provider-control-plane',
          proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
          proofDigestSha256: 'e'.repeat(64),
          objectStore: expect.objectContaining({
            uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
            version: 'v1',
          }),
        }),
      }),
    });
  });

  it('downloads stored invoice artifact blobs after team access is checked', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    repository.getInvoiceArtifactBlob.mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      reconciliationId: '66666666-6666-4666-8666-666666666666',
      artifactId: 'artifact-1',
      teamId: identity.teamId,
      fileName: 'aws-invoice-control.txt',
      mimeType: 'text/plain',
      contentSha256: 'd'.repeat(64),
      contentSizeBytes: 7,
      contentBase64: Buffer.from('invoice').toString('base64'),
      uploadedByAccountId: identity.accountId,
      uploadedAt: '2026-07-06T00:00:05.000Z',
      storageProfile: {
        storageBackend: 'database-bytea',
        encryptionStatus: 'database-managed',
        kmsKeyRequiredForProduction: true,
      },
      retentionPolicy: {
        retentionUntil: '2027-07-06T00:00:05.000Z',
        retentionDays: 365,
        legalHold: false,
      },
      providerRetentionProof: {
        schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
        status: 'not-applicable',
        evidenceSource: 'not-required',
        storageBackend: 'database-bytea',
        checkedAt: '2026-07-06T00:00:05.000Z',
        retentionMode: 'not-configured',
        retentionUntil: '2027-07-06T00:00:05.000Z',
        legalHold: false,
        caveats: [
          'database-bytea storage has no provider object-lock control plane; use external object storage for invoice-grade retention proof.',
        ],
      },
      malwareScan: {
        status: 'passed',
        scanner: 'polycost-eicar-signature-v1',
        checkedAt: '2026-07-06T00:00:05.000Z',
        findings: [],
      },
    });
    const service = new BillingService(repository as never);

    await expect(
      service.downloadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        identity,
      ),
    ).resolves.toMatchObject({
      fileName: 'aws-invoice-control.txt',
      contentBase64: Buffer.from('invoice').toString('base64'),
      malwareScan: expect.objectContaining({
        status: 'passed',
      }),
    });
    expect(repository.getInvoiceArtifactBlob).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
    );
    expect(repository.recordTeamAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: identity.teamId,
        actorAccountId: identity.accountId,
        action: 'billing.reconciliation.artifact_blob_downloaded',
        targetType: 'billing_reconciliation',
        targetId: '66666666-6666-4666-8666-666666666666',
        metadata: expect.objectContaining({
          importRunId: '55555555-5555-4555-8555-555555555555',
          comparisonId: comparisonResult.comparisonId,
          provider: 'aws',
          artifactId: 'artifact-1',
          fileName: 'aws-invoice-control.txt',
          contentSha256: 'd'.repeat(64),
          contentSizeBytes: 7,
          storageBackend: 'database-bytea',
          externalObjectFetched: false,
          checksumVerified: true,
          contentReturned: true,
          malwareScanStatus: 'passed',
        }),
      }),
    );
  });

  it('downloads external invoice artifact blobs through provider storage and validates checksum', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    repository.getInvoiceArtifactBlob.mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      reconciliationId: '66666666-6666-4666-8666-666666666666',
      artifactId: 'artifact-1',
      teamId: identity.teamId,
      fileName: 'aws-invoice-control.txt',
      mimeType: 'text/plain',
      contentSha256: sha256Hex('invoice'),
      contentSizeBytes: 7,
      uploadedByAccountId: identity.accountId,
      uploadedAt: '2026-07-06T00:00:05.000Z',
      storageProfile: {
        storageBackend: 'aws-s3',
        encryptionStatus: 'customer-managed-kms',
        objectStore: {
          bucketOrContainer: 'polycost-invoice-artifacts',
          prefix: 'invoice-artifacts',
          region: 'us-east-1',
          key: 'invoice-artifacts/team/reconciliation/artifact.txt',
          uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
        },
        kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
        kmsKeyRequiredForProduction: false,
      },
      retentionPolicy: {
        retentionUntil: '2027-07-06T00:00:05.000Z',
        retentionDays: 365,
        legalHold: false,
      },
      providerRetentionProof: {
        schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
        status: 'provider-verified',
        evidenceSource: 'provider-control-plane',
        storageBackend: 'aws-s3',
        checkedAt: '2026-07-06T00:00:05.000Z',
        retentionMode: 'provider-object-lock',
        retentionUntil: '2027-07-06T00:00:05.000Z',
        legalHold: false,
        objectStore: {
          bucketOrContainer: 'polycost-invoice-artifacts',
          prefix: 'invoice-artifacts',
          region: 'us-east-1',
          key: 'invoice-artifacts/team/reconciliation/artifact.txt',
          uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
        },
        proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
        proofDigestSha256: 'f'.repeat(64),
        caveats: [],
      },
      malwareScan: {
        status: 'passed',
        scanner: 'polycost-eicar-signature-v1',
        checkedAt: '2026-07-06T00:00:05.000Z',
        findings: [],
      },
    });
    const storageService = {
      store: jest.fn(),
      read: jest.fn(async () => Buffer.from('invoice')),
    } as unknown as InvoiceArtifactStorageService;
    const service = new BillingService(
      repository as never,
      new InvoiceArtifactGovernanceService(),
      storageService,
    );

    await expect(
      service.downloadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        identity,
      ),
    ).resolves.toMatchObject({
      fileName: 'aws-invoice-control.txt',
      contentBase64: Buffer.from('invoice').toString('base64'),
      storageProfile: expect.objectContaining({
        storageBackend: 'aws-s3',
      }),
    });
    expect(storageService.read).toHaveBeenCalledWith(
      expect.objectContaining({
        storageBackend: 'aws-s3',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
      }),
    );
    expect(repository.recordTeamAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.reconciliation.artifact_blob_downloaded',
        metadata: expect.objectContaining({
          artifactId: 'artifact-1',
          storageBackend: 'aws-s3',
          externalObjectFetched: true,
          checksumVerified: true,
          contentReturned: true,
          malwareScanScanner: 'polycost-eicar-signature-v1',
        }),
      }),
    );
  });

  it('reports invoice artifact storage readiness for billing admins', () => {
    const repository = repositoryMock();
    const service = new BillingService(repository as never);

    expect(service.getInvoiceArtifactStorageReadiness(identity)).toMatchObject({
      storageBackend: 'database-bytea',
      scannerMode: 'eicar-signature-only',
      retentionEnforcementMode: 'report-only',
      productionReady: false,
      gaps: expect.arrayContaining([
        'database-bytea keeps artifact bytes in Postgres and is not invoice-grade storage',
      ]),
    });
  });

  it('keeps invoice artifact retention enforcement report-only by default', async () => {
    const repository = repositoryMock();
    repository.summarizeInvoiceArtifactRetention.mockResolvedValue({
      expiredCandidates: 2,
      legalHoldSkipped: 1,
    });
    const service = new BillingService(repository as never);

    await expect(
      service.enforceInvoiceArtifactRetention({ dryRun: false }, identity),
    ).resolves.toMatchObject({
      mode: 'report-only',
      dryRun: true,
      expiredCandidates: 2,
      legalHoldSkipped: 1,
      deleted: 0,
      storageBackend: 'database-bytea',
    });
    expect(repository.deleteExpiredInvoiceArtifactBlobs).not.toHaveBeenCalled();
    expect(repository.listExpiredInvoiceArtifactBlobDeletionCandidates).not.toHaveBeenCalled();
    expect(repository.deleteInvoiceArtifactBlobsByIds).not.toHaveBeenCalled();
  });

  it('deletes expired non-held invoice artifacts when retention enforcement is enabled', async () => {
    const repository = repositoryMock();
    repository.summarizeInvoiceArtifactRetention.mockResolvedValue({
      expiredCandidates: 3,
      legalHoldSkipped: 2,
    });
    repository.listExpiredInvoiceArtifactBlobDeletionCandidates.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        storageBackend: 'database-bytea',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        storageBackend: 'database-bytea',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        storageBackend: 'database-bytea',
      },
    ]);
    repository.deleteInvoiceArtifactBlobsByIds.mockResolvedValue(3);
    const service = new BillingService(
      repository as never,
      new InvoiceArtifactGovernanceService(
        configService({
          INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE: 'delete-expired',
        }),
      ),
    );

    await expect(
      service.enforceInvoiceArtifactRetention({ dryRun: false }, identity),
    ).resolves.toMatchObject({
      mode: 'delete-expired',
      dryRun: false,
      expiredCandidates: 3,
      legalHoldSkipped: 2,
      deleted: 3,
    });
    // SEC-2: all retention work is scoped to the caller's team.
    expect(repository.summarizeInvoiceArtifactRetention).toHaveBeenCalledWith(
      expect.any(String),
      identity.teamId,
    );
    expect(repository.listExpiredInvoiceArtifactBlobDeletionCandidates).toHaveBeenCalledWith(
      expect.any(String),
      identity.teamId,
    );
    expect(repository.deleteInvoiceArtifactBlobsByIds).toHaveBeenCalledWith(
      [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ],
      expect.any(String),
      identity.teamId,
    );
    expect(repository.deleteExpiredInvoiceArtifactBlobs).not.toHaveBeenCalled();
  });

  it('purges external artifact objects before deleting expired retention rows', async () => {
    const repository = repositoryMock();
    repository.summarizeInvoiceArtifactRetention.mockResolvedValue({
      expiredCandidates: 2,
      legalHoldSkipped: 0,
    });
    repository.listExpiredInvoiceArtifactBlobDeletionCandidates.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        storageBackend: 'aws-s3',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreRegion: 'us-east-1',
        objectStoreKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreUri:
          's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreVersion: 'v1',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        storageBackend: 'database-bytea',
      },
    ]);
    repository.deleteInvoiceArtifactBlobsByIds.mockResolvedValue(2);
    const storageService = {
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoiceArtifactStorageService;
    const service = new BillingService(
      repository as never,
      new InvoiceArtifactGovernanceService(
        configService({
          INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE: 'delete-expired',
        }),
      ),
      storageService,
    );

    await expect(
      service.enforceInvoiceArtifactRetention({ dryRun: false }, identity),
    ).resolves.toMatchObject({
      mode: 'delete-expired',
      dryRun: false,
      expiredCandidates: 2,
      legalHoldSkipped: 0,
      deleted: 2,
    });
    expect(storageService.delete).toHaveBeenCalledTimes(1);
    expect(storageService.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        storageBackend: 'aws-s3',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreVersion: 'v1',
      }),
    );
    expect(repository.deleteInvoiceArtifactBlobsByIds).toHaveBeenCalledWith(
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      expect.any(String),
      identity.teamId,
    );
  });

  it('rejects artifact blob uploads when bytes do not match registered checksum metadata', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              sha256: 'b'.repeat(64),
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.uploadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          fileName: 'aws-invoice-control.txt',
          mimeType: 'text/plain',
          content: 'different-bytes',
          encoding: 'text',
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.saveInvoiceArtifactBlobAndUpdateEvidence).not.toHaveBeenCalled();
  });

  const wormReconciliation = (verificationStatus: string) => ({
    id: '66666666-6666-4666-8666-666666666666',
    evidenceHash: 'a'.repeat(32),
    importRunId: '55555555-5555-4555-8555-555555555555',
    comparisonId: comparisonResult.comparisonId,
    provider: 'aws' as const,
    estimatedTotalUsd: 100,
    invoicedTotalUsd: 107,
    varianceUsd: 7,
    variancePercent: 7,
    status: 'variance-warning' as const,
    evidence: {
      invoiceGradeArtifactRegister: {
        artifacts: [
          {
            id: 'artifact-1',
            provider: 'aws',
            type: 'provider-invoice',
            displayName: 'June AWS invoice control packet',
            reference: 'demo://invoice-control',
            verificationStatus,
            registeredAt: '2026-07-06T00:00:03.000Z',
          },
        ],
      },
    },
    createdAt: '2026-07-06T00:00:02.000Z',
  });
  const wormImport = {
    id: '55555555-5555-4555-8555-555555555555',
    teamId: identity.teamId,
    provider: 'aws' as const,
    sourceType: 'aws-cur' as const,
    status: 'completed' as const,
    billingPeriodStart: '2026-06-01',
    billingPeriodEnd: '2026-06-30',
    originalFileSha256: 'a'.repeat(64),
    rowsReceived: 1,
    rowsAccepted: 1,
    rowsRejected: 0,
    totalCostUsd: 107,
    createdAt: '2026-07-06T00:00:00.000Z',
  };
  const wormUpload = {
    fileName: 'aws-invoice-control.txt',
    mimeType: 'text/plain',
    content: 'invoice',
    encoding: 'text' as const,
  };

  it('SEC-3: rejects re-upload of an artifact under legal hold (no overwrite)', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue(wormReconciliation('registered'));
    repository.getBillingImport.mockResolvedValue(wormImport);
    repository.getInvoiceArtifactBlobLegalHold.mockResolvedValue(true);
    const service = new BillingService(repository as never);

    await expect(
      service.uploadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        wormUpload,
        identity,
      ),
    ).rejects.toThrow(/legal hold/i);
    expect(repository.saveInvoiceArtifactBlobAndUpdateEvidence).not.toHaveBeenCalled();
  });

  it('SEC-3: rejects re-upload of a verified (immutable) artifact', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue(wormReconciliation('verified'));
    repository.getBillingImport.mockResolvedValue(wormImport);
    const service = new BillingService(repository as never);

    await expect(
      service.uploadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        wormUpload,
        identity,
      ),
    ).rejects.toThrow(/immutable|verified/i);
    expect(repository.saveInvoiceArtifactBlobAndUpdateEvidence).not.toHaveBeenCalled();
  });

  it('rejects artifact blob uploads that trip the malware scan hook', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 'demo://invoice-control',
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.uploadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          fileName: 'eicar.txt',
          mimeType: 'text/plain',
          content: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
          encoding: 'text',
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.saveInvoiceArtifactBlobAndUpdateEvidence).not.toHaveBeenCalled();
  });

  it('rejects artifact verification when checksum evidence does not match metadata', async () => {
    const repository = repositoryMock();
    repository.getInvoiceReconciliation.mockResolvedValue({
      evidenceHash: 'a'.repeat(32),
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: comparisonResult.comparisonId,
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      evidence: {
        invoiceGradeReadiness: {
          checks: [],
        },
        invoiceGradeArtifactRegister: {
          artifacts: [
            {
              id: 'artifact-1',
              provider: 'aws',
              type: 'provider-invoice',
              displayName: 'June AWS invoice control packet',
              reference: 's3://billing-audit/2026-06/aws-invoice.pdf',
              sha256: 'b'.repeat(64),
              verificationStatus: 'registered',
              registeredAt: '2026-07-06T00:00:03.000Z',
            },
          ],
        },
      },
      createdAt: '2026-07-06T00:00:02.000Z',
    });
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
    const service = new BillingService(repository as never);

    await expect(
      service.verifyInvoiceGradeArtifact(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          verificationStatus: 'verified',
          evidenceReference: 'review://controls/aws-invoice-2026-06',
          sha256: 'c'.repeat(64),
        },
        identity,
      ),
    ).rejects.toThrow(ApiValidationError);
    expect(repository.updateInvoiceReconciliationEvidence).not.toHaveBeenCalled();
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
    await expectForbidden(
      service.listInvoiceArtifactReviews('55555555-5555-4555-8555-555555555555', memberIdentity),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.listInvoiceArtifactPolicyExceptions(
        '55555555-5555-4555-8555-555555555555',
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.exportInvoiceEvidencePacket('66666666-6666-4666-8666-666666666666', memberIdentity),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.registerInvoiceGradeArtifact(
        '66666666-6666-4666-8666-666666666666',
        {
          type: 'provider-invoice',
          displayName: 'Invoice control packet',
          reference: 'demo://invoice-control',
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.verifyInvoiceGradeArtifact(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          verificationStatus: 'verified',
          evidenceReference: 'review://controls/aws-invoice-2026-06',
          sha256: 'b'.repeat(64),
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.validateInvoiceControlPacket(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          acceptedVarianceUsd: 0.01,
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.uploadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          fileName: 'aws-invoice-control.txt',
          mimeType: 'text/plain',
          content: 'invoice',
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.setInvoiceArtifactLegalHold(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          legalHold: true,
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.updateInvoiceArtifactReview(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          reviewStatus: 'pending',
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.updateInvoiceArtifactPolicyException(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        {
          exceptionStatus: 'requested',
          reason: 'Requesting exception without team admin rights.',
        },
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );
    await expectForbidden(
      service.downloadInvoiceArtifactBlob(
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        memberIdentity,
      ),
      'Team admin access is required for billing reconciliation',
    );

    expect(repository.createBillingImport).not.toHaveBeenCalled();
    expect(repository.getBillingImport).not.toHaveBeenCalled();
    expect(repository.listInvoiceReconciliations).not.toHaveBeenCalled();
  });
});

function invoiceLineItem(serviceName: string, skuId: string, costUsd: number, category: string) {
  return {
    id: `line-${skuId}`,
    importRunId: '55555555-5555-4555-8555-555555555555',
    teamId: identity.teamId,
    provider: 'aws' as const,
    billingPeriodStart: '2026-06-01',
    billingPeriodEnd: '2026-06-30',
    serviceName,
    skuId,
    region: 'us-east-1',
    resourceId: `resource-${skuId}`,
    usageStart: '2026-06-01T00:00:00.000Z',
    usageEnd: '2026-06-30T23:59:59.000Z',
    costUsd,
    currency: 'USD',
    tags: {},
    rawPayload: {
      _polycost: {
        sourceRowFingerprint: 'c'.repeat(64),
        missingRecommendedFields: [],
        invoiceAdjustmentClassification: {
          category,
          isAdjustment: category !== 'usage' && category !== 'commitment-covered-usage',
          reason:
            category === 'usage'
              ? 'row appears to be estimate-comparable usage'
              : `row is marked as ${category}`,
          sourceSignals: [serviceName, skuId, category],
        },
      },
    },
    lineItemHash: `${skuId}`.padEnd(64, 'b').slice(0, 64),
    createdAt: '2026-07-06T00:00:01.000Z',
  };
}

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
    recordTeamAuditEvent: jest.fn(),
    listTeamAuditEvents: jest.fn(),
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
    getInvoiceReconciliation: jest.fn(),
    updateInvoiceReconciliationEvidence: jest.fn(),
    saveInvoiceArtifactBlobAndUpdateEvidence: jest.fn(),
    updateInvoiceArtifactLegalHoldAndEvidence: jest.fn(),
    updateInvoiceArtifactProviderRetentionProofAndEvidence: jest.fn(),
    getInvoiceArtifactBlob: jest.fn(),
    getInvoiceArtifactBlobLegalHold: jest.fn(),
    summarizeInvoiceArtifactRetention: jest.fn(),
    listExpiredInvoiceArtifactBlobDeletionCandidates: jest.fn(),
    deleteInvoiceArtifactBlobsByIds: jest.fn(),
    deleteExpiredInvoiceArtifactBlobs: jest.fn(),
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

function configService(overrides: Partial<AppConfig> = {}): ConfigService<AppConfig, true> {
  const overrideMap = new Map(Object.entries(overrides));

  return {
    get: jest.fn((key: keyof AppConfig) => {
      if (overrideMap.has(key)) {
        return overrideMap.get(key);
      }

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

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

describe('AuthService metrics', () => {
  const recorder = () => {
    const metrics = new MetricsService({ collectDefaults: false });
    return { domainMetrics: new DomainMetricsService(metrics), render: () => metrics.render() };
  };

  const wrongPasswordAccount = {
    ...account,
    passwordHash:
      'scrypt:v1:16384:8:1:Tm90VGhlUmlnaHRTYWx0:Os6fRvczjT_AZljxB0T2YRrNEKv5szyK7b57lFb2_iA',
  };

  it('counts a successful login', async () => {
    const repository = repositoryMock();
    // The shared `account` fixture's hash does not correspond to any known
    // plaintext, so derive one here rather than hardcoding a second digest.
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...account,
      passwordHash: hashPassword('correct horse battery staple'),
    });
    repository.createSession.mockResolvedValue({
      sessionId: identity.sessionId,
      expiresAt: identity.expiresAt,
    });
    const { domainMetrics, render } = recorder();
    const service = new AuthService(repository as never, configService(), undefined, domainMetrics);

    await service.login({ email: account.email, password: 'correct horse battery staple' });

    expect(await render()).toContain('auth_attempts_total{outcome="success"} 1');
  });

  it('counts an unknown email as invalid credentials', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue(undefined);
    const { domainMetrics, render } = recorder();
    const service = new AuthService(repository as never, configService(), undefined, domainMetrics);

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever-password' }),
    ).rejects.toThrow(ApiUnauthorizedError);

    expect(await render()).toContain('auth_attempts_total{outcome="invalid_credentials"} 1');
  });

  it('counts a lockout separately from the failed attempt that caused it', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...wrongPasswordAccount,
      failedAttempts: 4,
    });
    const { domainMetrics, render } = recorder();
    const service = new AuthService(repository as never, configService(), undefined, domainMetrics);

    await expect(
      service.login({ email: account.email, password: 'wrong-password' }),
    ).rejects.toThrow(ApiUnauthorizedError);

    const rendered = await render();
    expect(rendered).toContain('auth_attempts_total{outcome="invalid_credentials"} 1');
    expect(rendered).toContain('auth_lockouts_total 1');
  });

  it('does not count a lockout for a failed attempt below the threshold', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...wrongPasswordAccount,
      failedAttempts: 0,
    });
    const { domainMetrics, render } = recorder();
    const service = new AuthService(repository as never, configService(), undefined, domainMetrics);

    await expect(
      service.login({ email: account.email, password: 'wrong-password' }),
    ).rejects.toThrow(ApiUnauthorizedError);

    expect(await render()).toContain('auth_lockouts_total 0');
  });

  it('counts an attempt against an already-locked account as locked', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue({
      ...account,
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    const { domainMetrics, render } = recorder();
    const service = new AuthService(repository as never, configService(), undefined, domainMetrics);

    await expect(
      service.login({ email: account.email, password: 'correct horse battery staple' }),
    ).rejects.toThrow(ApiUnauthorizedError);

    // A spike of 'locked' means an attack is already being throttled; a spike
    // of 'invalid_credentials' means it is still in progress. Alerting wants
    // to tell those apart.
    const rendered = await render();
    expect(rendered).toContain('auth_attempts_total{outcome="locked"} 1');
    expect(rendered).not.toContain('auth_attempts_total{outcome="invalid_credentials"}');
  });

  it('never labels an auth metric with the email address', async () => {
    const repository = repositoryMock();
    repository.findLocalAccountByEmail.mockResolvedValue(undefined);
    const { domainMetrics, render } = recorder();
    const service = new AuthService(repository as never, configService(), undefined, domainMetrics);

    await expect(
      service.login({ email: 'victim@example.com', password: 'whatever-password' }),
    ).rejects.toThrow(ApiUnauthorizedError);

    // /metrics is unauthenticated: an email label would make it a user
    // enumeration endpoint, on top of being unbounded cardinality.
    expect(await render()).not.toContain('victim@example.com');
  });
});
