import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { ApiDatabaseRepository } from './api-database.repository.js';
import { ApiForbiddenError, ApiUnauthorizedError, ApiValidationError } from './api-errors.js';
import { AuthIdentity, TeamScimUserRecord } from './auth.types.js';
import { ScimProvisioningService } from './scim-provisioning.service.js';

const OKTA_USER_CREATE_FIXTURE = JSON.parse(
  readFileSync('../../fixtures/scim/okta-user-create.json', 'utf8'),
) as Record<string, unknown>;
const ENTRA_USER_CREATE_FIXTURE = JSON.parse(
  readFileSync('../../fixtures/scim/entra-user-create.json', 'utf8'),
) as Record<string, unknown>;
const DEACTIVATE_USER_PATCH_FIXTURE = JSON.parse(
  readFileSync('../../fixtures/scim/deactivate-user-patch.json', 'utf8'),
) as Record<string, unknown>;

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

  it('lists provisioned SCIM users for team owners and admins without exposing bearer tokens', async () => {
    const repository = repositoryMock();
    repository.listTeamScimUsers.mockResolvedValue([scimUserRecord()]);
    const service = new ScimProvisioningService(repository as never);

    await expect(service.listProvisionedUsers(teamId, identity)).resolves.toEqual([
      expect.objectContaining({
        userName: 'engineer@example.com',
        active: true,
      }),
    ]);
    expect(repository.listTeamScimUsers).toHaveBeenCalledWith(teamId);

    await expect(
      service.listProvisionedUsers(teamId, { ...identity, role: 'member' }),
    ).rejects.toThrow(ApiForbiddenError);
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

  it('exposes SCIM discovery metadata only to valid SCIM bearer tokens', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    const service = new ScimProvisioningService(repository as never);

    await expect(service.listSchemas({ headers: {} })).rejects.toThrow(ApiUnauthorizedError);

    await expect(service.listSchemas(request)).resolves.toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          attributes: expect.arrayContaining([
            expect.objectContaining({ name: 'userName', required: true }),
            expect.objectContaining({ name: 'active', type: 'boolean' }),
          ]),
        },
      ],
    });
    await expect(
      service.getSchema(encodeURIComponent('urn:ietf:params:scim:schemas:core:2.0:User'), request),
    ).resolves.toMatchObject({
      id: 'urn:ietf:params:scim:schemas:core:2.0:User',
      name: 'User',
    });
    await expect(service.listResourceTypes(request)).resolves.toMatchObject({
      totalResults: 1,
      Resources: [
        {
          id: 'User',
          endpoint: '/Users',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        },
      ],
    });
    await expect(service.getResourceType('User', request)).resolves.toMatchObject({
      id: 'User',
      endpoint: '/Users',
    });
    await expect(service.getResourceType('Group', request)).rejects.toThrow(
      'SCIM resource type was not found',
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

  it('accepts representative Okta and Entra SCIM user-create fixtures', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    repository.upsertTeamScimUser.mockImplementation(async (input) =>
      scimUserRecord({
        externalId: input.externalId,
        userName: input.userName,
        displayName: input.displayName,
      }),
    );
    const service = new ScimProvisioningService(repository as never);

    await expect(service.createUser(OKTA_USER_CREATE_FIXTURE, request)).resolves.toEqual(
      expect.objectContaining({
        externalId: 'okta-00u-platform-engineer',
        userName: 'platform.engineer@example.com',
        displayName: 'Platform Engineer',
      }),
    );
    await expect(service.createUser(ENTRA_USER_CREATE_FIXTURE, request)).resolves.toEqual(
      expect.objectContaining({
        externalId: 'entra-8f77-platform-owner',
        userName: 'platform.owner@example.com',
        displayName: 'Platform Owner',
      }),
    );
    expect(repository.upsertTeamScimUser).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(repository.upsertTeamScimUser.mock.calls)).not.toContain(
      'pc_scim_test-token',
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

  it('accepts representative IdP deactivation patch fixtures', async () => {
    const repository = repositoryMock();
    repository.resolveTeamScimToken.mockResolvedValue(scimIdentity);
    repository.getTeamScimUser.mockResolvedValue(scimUserRecord());
    repository.deactivateTeamScimUser.mockResolvedValue(scimUserRecord({ active: false }));
    const service = new ScimProvisioningService(repository as never);

    await expect(
      service.patchUser(
        '66666666-6666-4666-8666-666666666666',
        DEACTIVATE_USER_PATCH_FIXTURE,
        request,
      ),
    ).resolves.toEqual(expect.objectContaining({ active: false }));
    expect(repository.deactivateTeamScimUser).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        userId: '66666666-6666-4666-8666-666666666666',
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
    getTeamMembership: jest.fn<ApiDatabaseRepository['getTeamMembership']>(),
    createTeamScimToken: jest.fn<ApiDatabaseRepository['createTeamScimToken']>(),
    listTeamScimTokens: jest.fn<ApiDatabaseRepository['listTeamScimTokens']>(),
    revokeTeamScimToken: jest.fn<ApiDatabaseRepository['revokeTeamScimToken']>(),
    resolveTeamScimToken: jest.fn<ApiDatabaseRepository['resolveTeamScimToken']>(),
    listTeamScimUsers: jest.fn<ApiDatabaseRepository['listTeamScimUsers']>(),
    getTeamScimUser: jest.fn<ApiDatabaseRepository['getTeamScimUser']>(),
    upsertTeamScimUser: jest.fn<ApiDatabaseRepository['upsertTeamScimUser']>(),
    deactivateTeamScimUser: jest.fn<ApiDatabaseRepository['deactivateTeamScimUser']>(),
  } as unknown as jest.Mocked<ApiDatabaseRepository>;
}
