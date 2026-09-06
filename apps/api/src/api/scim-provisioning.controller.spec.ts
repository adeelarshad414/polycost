import { describe, it, expect, jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { AuthIdentity, RequestWithAuth } from './auth.types.js';
import { ScimProvisioningController } from './scim-provisioning.controller.js';
import { ScimProvisioningService } from './scim-provisioning.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';

describe('ScimProvisioningController', () => {
  const identity: AuthIdentity = {
    accountId: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    teamId: '22222222-2222-4222-8222-222222222222',
    role: 'owner',
    sessionId: '33333333-3333-4333-8333-333333333333',
    expiresAt: '2026-07-10T00:00:00.000Z',
  };
  const request: RequestWithAuth = {
    auth: identity,
    headers: {
      authorization: 'Bearer pc_scim_test-token',
    },
  };

  it('delegates SCIM token admin and provisioning endpoints to ScimProvisioningService', () => {
    const service = createServiceMock();
    const controller = new ScimProvisioningController(service);
    const body = { userName: 'engineer@example.com' };

    expect(controller.listTokens('team-1', request)).toBe('tokens');
    expect(controller.listProvisionedUsers('team-1', request)).toBe('provisioned-users');
    expect(controller.createToken('team-1', body, request)).toBe('create-token');
    expect(controller.revokeToken('team-1', 'token-1', request)).toBe('revoke-token');
    expect(controller.serviceProviderConfig(request)).toBe('service-provider-config');
    expect(controller.listSchemas(request)).toBe('schemas');
    expect(controller.getSchema('User', request)).toBe('schema');
    expect(controller.listResourceTypes(request)).toBe('resource-types');
    expect(controller.getResourceType('User', request)).toBe('resource-type');
    expect(controller.listUsers(request)).toBe('users');
    expect(controller.createUser(body, request)).toBe('create-user');
    expect(controller.getUser('user-1', request)).toBe('get-user');
    expect(controller.replaceUser('user-1', body, request)).toBe('replace-user');
    expect(controller.patchUser('user-1', body, request)).toBe('patch-user');
    expect(controller.deactivateUser('user-1', request)).toBe('deactivate-user');

    expect(service.listTokens).toHaveBeenCalledWith('team-1', identity);
    expect(service.listProvisionedUsers).toHaveBeenCalledWith('team-1', identity);
    expect(service.createToken).toHaveBeenCalledWith('team-1', body, identity);
    expect(service.revokeToken).toHaveBeenCalledWith('team-1', 'token-1', identity);
    expect(service.listSchemas).toHaveBeenCalledWith(request);
    expect(service.getSchema).toHaveBeenCalledWith('User', request);
    expect(service.listResourceTypes).toHaveBeenCalledWith(request);
    expect(service.getResourceType).toHaveBeenCalledWith('User', request);
    expect(service.createUser).toHaveBeenCalledWith(body, request);
    expect(service.replaceUser).toHaveBeenCalledWith('user-1', body, request);
    expect(service.patchUser).toHaveBeenCalledWith('user-1', body, request);
  });

  it('keeps SCIM token administration behind session auth while SCIM endpoints use bearer-token auth', () => {
    const sessionProtectedHandlers = [
      ScimProvisioningController.prototype.listTokens,
      ScimProvisioningController.prototype.listProvisionedUsers,
      ScimProvisioningController.prototype.createToken,
      ScimProvisioningController.prototype.revokeToken,
    ];
    const bearerProtectedHandlers = [
      ScimProvisioningController.prototype.serviceProviderConfig,
      ScimProvisioningController.prototype.listSchemas,
      ScimProvisioningController.prototype.getSchema,
      ScimProvisioningController.prototype.listResourceTypes,
      ScimProvisioningController.prototype.getResourceType,
      ScimProvisioningController.prototype.listUsers,
      ScimProvisioningController.prototype.createUser,
      ScimProvisioningController.prototype.getUser,
      ScimProvisioningController.prototype.replaceUser,
      ScimProvisioningController.prototype.patchUser,
      ScimProvisioningController.prototype.deactivateUser,
    ];

    for (const handler of sessionProtectedHandlers) {
      expect(guardMetadataFor(handler)).toContain(SessionAuthGuard);
    }

    for (const handler of bearerProtectedHandlers) {
      expect(guardMetadataFor(handler)).not.toContain(SessionAuthGuard);
    }
  });
});

function createServiceMock(): ScimProvisioningService {
  return {
    listTokens: jest.fn<ScimProvisioningService['listTokens']>(() => 'tokens' as never),
    listProvisionedUsers: jest.fn<ScimProvisioningService['listProvisionedUsers']>(
      () => 'provisioned-users' as never,
    ),
    createToken: jest.fn<ScimProvisioningService['createToken']>(() => 'create-token' as never),
    revokeToken: jest.fn<ScimProvisioningService['revokeToken']>(() => 'revoke-token' as never),
    serviceProviderConfig: jest.fn<ScimProvisioningService['serviceProviderConfig']>(
      () => 'service-provider-config' as never,
    ),
    listSchemas: jest.fn<ScimProvisioningService['listSchemas']>(() => 'schemas' as never),
    getSchema: jest.fn<ScimProvisioningService['getSchema']>(() => 'schema' as never),
    listResourceTypes: jest.fn<ScimProvisioningService['listResourceTypes']>(
      () => 'resource-types' as never,
    ),
    getResourceType: jest.fn<ScimProvisioningService['getResourceType']>(
      () => 'resource-type' as never,
    ),
    listUsers: jest.fn<ScimProvisioningService['listUsers']>(() => 'users' as never),
    createUser: jest.fn<ScimProvisioningService['createUser']>(() => 'create-user' as never),
    getUser: jest.fn<ScimProvisioningService['getUser']>(() => 'get-user' as never),
    replaceUser: jest.fn<ScimProvisioningService['replaceUser']>(() => 'replace-user' as never),
    patchUser: jest.fn<ScimProvisioningService['patchUser']>(() => 'patch-user' as never),
    deactivateUser: jest.fn<ScimProvisioningService['deactivateUser']>(
      () => 'deactivate-user' as never,
    ),
  } as unknown as ScimProvisioningService;
}

function guardMetadataFor(handler: (...args: never[]) => unknown): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}
