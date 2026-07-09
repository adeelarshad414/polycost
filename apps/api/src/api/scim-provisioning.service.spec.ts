import { ApiDatabaseRepository } from './api-database.repository';
import { ApiForbiddenError, ApiUnauthorizedError, ApiValidationError } from './api-errors';
import { AuthIdentity, TeamScimUserRecord } from './auth.types';
import { ScimProvisioningService } from './scim-provisioning.service';

describe('ScimProvisioningService', () => {
  const teamId = '22222222-2222-4222-8222-222222222222';
  const identity: AuthIdentity = {
    accountId: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    teamId,
    role: 'owner',
    sessionId: '33333333-3333-4333-8333-333333333333',
    expiresAt: '2026-07-10T00:00:00.000Z',
  };
  const scimIdentity = {
    teamId,
    tokenId: '44444444-4444-4444-8444-444444444444',
    tokenPrefix: 'pc_scim_testprefix',
    displayName: 'Okta production',
  };
  const request = {
    headers: {
      authorization: 'Bearer pc_scim_test-token',
    },
  };

  it('creates one-time SCIM tokens while storing only a hash and display prefix', async () => {
    const repository = repositoryMock();
    repository.createTeamScimToken.mockImplementation(async (input) => ({
      id: '55555555-5555-4555-8555-555555555555',
      teamId: input.teamId,
      displayName: input.displayName,
      tokenPrefix: input.tokenPrefix,
      createdByAccountId: input.createdByAccountId,
      createdAt: '2026-07-09T00:00:00.000Z',
    }));
    const service = new ScimProvisioningService(repository as never);

    const created = await service.createToken(
      teamId,
      { displayName: 'Okta production', expiresAt: '2027-01-01T00:00:00.000Z' },
      identity,
    );

    expect(created.token).toMatch(/^pc_scim_/);
    expect(created.tokenPrefix).toBe(created.token.slice(0, 18));
    expect(repository.createTeamScimToken).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        displayName: 'Okta production',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        tokenPrefix: created.tokenPrefix,
        createdByAccountId: identity.accountId,
        audit: expect.objectContaining({
          actorAccountId: identity.accountId,
          action: 'team.scim_token.created',
          targetType: 'scim_token',
        }),
      }),
    );
    expect(JSON.stringify(repository.createTeamScimToken.mock.calls[0][0])).not.toContain(
      created.token,
    );
  });

  it('requires team owner or admin access for SCIM token administration', async () => {
    const repository = repositoryMock();
    const service = new ScimProvisioningService(repository as never);

    await expect(
      service.createToken(
        teamId,
        { displayName: 'Okta production' },
        { ...identity, role: 'member' },
      ),
    ).rejects.toThrow(ApiForbiddenError);
    expect(repository.createTeamScimToken).not.toHaveBeenCalled();
  });

  it('lists SCIM users through bearer-token authentication with standard list response shape', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    repository.listTeamScimUsers.mockResolvedValue([scimUserRecord()]);
    const service = new ScimProvisioningService(repository as never);

    const response = await service.listUsers(request);

    expect(response).toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'engineer@example.com',
          active: true,
        },
      ],
    });
    expect(repository.resolveTeamScimToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('upserts SCIM users as member-scoped external identities and audits the token actor', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    repository.upsertTeamScimUser.mockResolvedValue(scimUserRecord());
    const service = new ScimProvisioningService(repository as never);

    const response = await service.createUser(
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        externalId: 'idp-user-123',
        userName: 'Engineer@Example.com',
        name: {
          formatted: 'Platform Engineer',
        },
        active: true,
      },
      request,
    );

    expect(response.userName).toBe('engineer@example.com');
    expect(repository.upsertTeamScimUser).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        externalId: 'idp-user-123',
        externalSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userName: 'engineer@example.com',
        displayName: 'Platform Engineer',
        active: true,
        audit: expect.objectContaining({
          action: 'team.scim.user_upserted',
          targetType: 'scim_user',
          metadata: {
            tokenId: scimIdentity.tokenId,
            tokenPrefix: scimIdentity.tokenPrefix,
          },
        }),
      }),
    );
  });

  it('deactivates SCIM users on active=false patches without disabling unrelated accounts globally', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    repository.getTeamScimUser.mockResolvedValue(scimUserRecord());
    repository.deactivateTeamScimUser.mockResolvedValue(scimUserRecord({ active: false }));
    const service = new ScimProvisioningService(repository as never);

    const response = await service.patchUser(
      '66666666-6666-4666-8666-666666666666',
      {
        Operations: [
          {
            op: 'Replace',
            path: 'active',
            value: false,
          },
        ],
      },
      request,
    );

    expect(response.active).toBe(false);
    expect(repository.deactivateTeamScimUser).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        userId: '66666666-6666-4666-8666-666666666666',
        audit: expect.objectContaining({
          action: 'team.scim.user_deactivated',
          targetType: 'scim_user',
        }),
      }),
    );
  });

  it('rejects malformed SCIM input and invalid bearer tokens', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(undefined);
    const service = new ScimProvisioningService(repository as never);

    await expect(service.listUsers({ headers: {} })).rejects.toThrow(ApiUnauthorizedError);
    await expect(service.listUsers(request)).rejects.toThrow(ApiUnauthorizedError);

    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    await expect(
      service.createUser(
        {
          userName: 'not-an-email',
          active: true,
        },
        request,
      ),
    ).rejects.toThrow(ApiValidationError);
  });

  it('does not reactivate accounts that were disabled outside SCIM', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    repository.upsertTeamScimUser.mockResolvedValue(undefined);
    const service = new ScimProvisioningService(repository as never);

    await expect(
      service.createUser(
        {
          userName: 'disabled@example.com',
          active: true,
        },
        request,
      ),
    ).rejects.toThrow(ApiForbiddenError);
  });
});

function scimUserRecord(overrides: Partial<TeamScimUserRecord> = {}): TeamScimUserRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    teamId: '22222222-2222-4222-8222-222222222222',
    externalId: 'idp-user-123',
    accountId: '77777777-7777-4777-8777-777777777777',
    userName: 'engineer@example.com',
    displayName: 'Platform Engineer',
    active: true,
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    ...overrides,
  };
}

function repositoryMock() {
  return {
    getTeamMembership: jest.fn(),
    createTeamScimToken: jest.fn(),
    listTeamScimTokens: jest.fn(),
    revokeTeamScimToken: jest.fn(),
    resolveTeamScimToken: jest.fn(),
    listTeamScimUsers: jest.fn(),
    getTeamScimUser: jest.fn(),
    upsertTeamScimUser: jest.fn(),
    deactivateTeamScimUser: jest.fn(),
  } as unknown as jest.Mocked<ApiDatabaseRepository>;
}
