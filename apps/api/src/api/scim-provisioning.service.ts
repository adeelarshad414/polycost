import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiDatabaseRepository } from './api-database.repository.js';
import {
  ApiForbiddenError,
  ApiNotFoundError,
  ApiUnauthorizedError,
  ApiValidationError,
} from './api-errors.js';
import {
  AuthIdentity,
  CreatedTeamScimTokenRecord,
  RequestWithAuth,
  TeamScimIdentity,
  TeamScimTokenRecord,
  TeamScimUserRecord,
} from './auth.types.js';

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA =
  'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
const SCIM_SCHEMA_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Schema';
const SCIM_RESOURCE_TYPE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType';
const TOKEN_PREFIX_LENGTH = 18;
const SCIM_TOKEN_PREFIX = 'pc_scim_';

interface ScimUserInput {
  externalId: string;
  userName: string;
  displayName?: string;
  active: boolean;
  rawProfile: Record<string, unknown>;
}

export interface ScimUserResponse {
  schemas: [typeof SCIM_USER_SCHEMA];
  id: string;
  externalId: string;
  userName: string;
  displayName?: string;
  active: boolean;
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
  };
}

export interface ScimListUsersResponse {
  schemas: [typeof SCIM_LIST_RESPONSE_SCHEMA];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimUserResponse[];
}

interface ScimSchemaAttribute {
  name: string;
  type: 'string' | 'boolean' | 'complex';
  multiValued: boolean;
  description: string;
  required: boolean;
  caseExact: boolean;
  mutability: 'readWrite' | 'readOnly' | 'immutable';
  returned: 'always' | 'default' | 'never';
  uniqueness: 'none' | 'server' | 'global';
  subAttributes?: ScimSchemaAttribute[];
}

interface ScimSchemaResponse {
  schemas: [typeof SCIM_SCHEMA_SCHEMA];
  id: typeof SCIM_USER_SCHEMA;
  name: 'User';
  description: string;
  attributes: ScimSchemaAttribute[];
  meta: {
    resourceType: 'Schema';
    location: '/api/v1/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User';
  };
}

interface ScimResourceTypeResponse {
  schemas: [typeof SCIM_RESOURCE_TYPE_SCHEMA];
  id: 'User';
  name: 'User';
  endpoint: '/Users';
  description: string;
  schema: typeof SCIM_USER_SCHEMA;
  schemaExtensions: [];
  meta: {
    resourceType: 'ResourceType';
    location: '/api/v1/scim/v2/ResourceTypes/User';
  };
}

export interface ScimListSchemasResponse {
  schemas: [typeof SCIM_LIST_RESPONSE_SCHEMA];
  totalResults: 1;
  startIndex: 1;
  itemsPerPage: 1;
  Resources: [ScimSchemaResponse];
}

export interface ScimListResourceTypesResponse {
  schemas: [typeof SCIM_LIST_RESPONSE_SCHEMA];
  totalResults: 1;
  startIndex: 1;
  itemsPerPage: 1;
  Resources: [ScimResourceTypeResponse];
}

@Injectable()
export class ScimProvisioningService {
  constructor(private readonly repository: ApiDatabaseRepository) {}

  async listTokens(teamId: string, identity: AuthIdentity): Promise<TeamScimTokenRecord[]> {
    await this.requireTeamAdmin(identity, teamId);

    return this.repository.listTeamScimTokens(teamId);
  }

  async listProvisionedUsers(
    teamId: string,
    identity: AuthIdentity,
  ): Promise<TeamScimUserRecord[]> {
    await this.requireTeamAdmin(identity, teamId);

    return this.repository.listTeamScimUsers(teamId);
  }

  async createToken(
    teamId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<CreatedTeamScimTokenRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const input = parseScimTokenBody(body);
    const token = `${SCIM_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const record = await this.repository.createTeamScimToken({
      teamId,
      displayName: input.displayName,
      tokenHash: sha256(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
      createdByAccountId: identity.accountId,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.scim_token.created',
        targetType: 'scim_token',
        metadata: {
          displayName: input.displayName,
          hasExpiry: Boolean(input.expiresAt),
        },
      },
    });

    return {
      ...record,
      token,
    };
  }

  async revokeToken(
    teamId: string,
    tokenId: string,
    identity: AuthIdentity,
  ): Promise<TeamScimTokenRecord> {
    await this.requireTeamAdmin(identity, teamId);
    const revoked = await this.repository.revokeTeamScimToken({
      teamId,
      tokenId,
      revokedAt: new Date().toISOString(),
      audit: {
        actorAccountId: identity.accountId,
        action: 'team.scim_token.revoked',
        targetType: 'scim_token',
      },
    });

    if (!revoked) {
      throw new ApiNotFoundError('SCIM token was not found or is already revoked');
    }

    return revoked;
  }

  async serviceProviderConfig(request: RequestWithAuth): Promise<Record<string, unknown>> {
    await this.authenticateScimRequest(request);

    return {
      schemas: [SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: false, maxResults: 0 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'Bearer token',
          description: 'Use the one-time SCIM bearer token generated by a team owner or admin.',
        },
      ],
    };
  }

  async listSchemas(request: RequestWithAuth): Promise<ScimListSchemasResponse> {
    await this.authenticateScimRequest(request);

    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: 1,
      startIndex: 1,
      itemsPerPage: 1,
      Resources: [scimUserSchema()],
    };
  }

  async getSchema(schemaId: string, request: RequestWithAuth): Promise<ScimSchemaResponse> {
    await this.authenticateScimRequest(request);

    if (decodeURIComponent(schemaId) !== SCIM_USER_SCHEMA) {
      throw new ApiNotFoundError('SCIM schema was not found');
    }

    return scimUserSchema();
  }

  async listResourceTypes(request: RequestWithAuth): Promise<ScimListResourceTypesResponse> {
    await this.authenticateScimRequest(request);

    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: 1,
      startIndex: 1,
      itemsPerPage: 1,
      Resources: [scimUserResourceType()],
    };
  }

  async getResourceType(
    resourceTypeId: string,
    request: RequestWithAuth,
  ): Promise<ScimResourceTypeResponse> {
    await this.authenticateScimRequest(request);

    if (resourceTypeId.toLowerCase() !== 'user') {
      throw new ApiNotFoundError('SCIM resource type was not found');
    }

    return scimUserResourceType();
  }

  async listUsers(request: RequestWithAuth): Promise<ScimListUsersResponse> {
    const identity = await this.authenticateScimRequest(request);
    const users = await this.repository.listTeamScimUsers(identity.teamId);
    const resources = users.map(toScimUserResponse);

    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: resources.length,
      startIndex: resources.length > 0 ? 1 : 0,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  async getUser(userId: string, request: RequestWithAuth): Promise<ScimUserResponse> {
    const identity = await this.authenticateScimRequest(request);
    const user = await this.repository.getTeamScimUser({
      teamId: identity.teamId,
      userId,
    });

    if (!user) {
      throw new ApiNotFoundError('SCIM user was not found');
    }

    return toScimUserResponse(user);
  }

  async createUser(body: unknown, request: RequestWithAuth): Promise<ScimUserResponse> {
    const identity = await this.authenticateScimRequest(request);
    const input = parseScimUserBody(body);
    const user = await this.upsertUser(identity, input);

    return toScimUserResponse(user);
  }

  async replaceUser(
    userId: string,
    body: unknown,
    request: RequestWithAuth,
  ): Promise<ScimUserResponse> {
    const identity = await this.authenticateScimRequest(request);
    const existing = await this.repository.getTeamScimUser({
      teamId: identity.teamId,
      userId,
    });

    if (!existing) {
      throw new ApiNotFoundError('SCIM user was not found');
    }

    const input = parseScimUserBody(body, existing.externalId);
    const user = await this.upsertUser(identity, input, userId);

    return toScimUserResponse(user);
  }

  async patchUser(
    userId: string,
    body: unknown,
    request: RequestWithAuth,
  ): Promise<ScimUserResponse> {
    const identity = await this.authenticateScimRequest(request);
    const existing = await this.repository.getTeamScimUser({
      teamId: identity.teamId,
      userId,
    });

    if (!existing) {
      throw new ApiNotFoundError('SCIM user was not found');
    }

    const active = parseScimPatchActive(body);
    if (active === false) {
      return this.deactivateUserWithIdentity(identity, userId);
    }

    const user = await this.upsertUser(
      identity,
      {
        externalId: existing.externalId,
        userName: existing.userName,
        ...(existing.displayName ? { displayName: existing.displayName } : {}),
        active: true,
        rawProfile: {
          schemas: [SCIM_USER_SCHEMA],
          externalId: existing.externalId,
          userName: existing.userName,
          active: true,
        },
      },
      userId,
    );

    return toScimUserResponse(user);
  }

  async deactivateUser(userId: string, request: RequestWithAuth): Promise<ScimUserResponse> {
    const identity = await this.authenticateScimRequest(request);

    return this.deactivateUserWithIdentity(identity, userId);
  }

  private async upsertUser(
    identity: TeamScimIdentity,
    input: ScimUserInput,
    existingUserId?: string,
  ): Promise<TeamScimUserRecord> {
    const user = await this.repository.upsertTeamScimUser({
      teamId: identity.teamId,
      externalId: input.externalId,
      externalSubjectHash: sha256(`scim:${identity.teamId}:${input.externalId}`),
      userName: input.userName,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      active: input.active,
      rawProfile: input.rawProfile,
      audit: {
        action: input.active ? 'team.scim.user_upserted' : 'team.scim.user_deactivated',
        targetType: 'scim_user',
        ...(existingUserId ? { targetId: existingUserId } : {}),
        metadata: {
          tokenId: identity.tokenId,
          tokenPrefix: identity.tokenPrefix,
        },
      },
    });

    if (!user) {
      throw new ApiForbiddenError('SCIM cannot reactivate a disabled account');
    }

    return user;
  }

  private async deactivateUserWithIdentity(
    identity: TeamScimIdentity,
    userId: string,
  ): Promise<ScimUserResponse> {
    const user = await this.repository.deactivateTeamScimUser({
      teamId: identity.teamId,
      userId,
      audit: {
        action: 'team.scim.user_deactivated',
        targetType: 'scim_user',
        targetId: userId,
        metadata: {
          tokenId: identity.tokenId,
          tokenPrefix: identity.tokenPrefix,
        },
      },
    });

    if (!user) {
      throw new ApiNotFoundError('SCIM user was not found');
    }

    return toScimUserResponse(user);
  }

  private async authenticateScimRequest(request: RequestWithAuth): Promise<TeamScimIdentity> {
    const token = bearerToken(request.headers);

    if (!token || !token.startsWith(SCIM_TOKEN_PREFIX)) {
      throw new ApiUnauthorizedError('SCIM bearer token is required');
    }

    const identity = await this.repository.resolveTeamScimToken({
      tokenHash: sha256(token),
      now: new Date().toISOString(),
    });

    if (!identity) {
      throw new ApiUnauthorizedError('SCIM token is expired, revoked, or invalid');
    }

    return identity;
  }

  private async requireTeamAdmin(identity: AuthIdentity, teamId: string): Promise<void> {
    const membership =
      identity.teamId === teamId && identity.role
        ? { role: identity.role }
        : await this.repository.getTeamMembership({
            accountId: identity.accountId,
            teamId,
          });

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new ApiForbiddenError('Team admin access is required');
    }
  }
}

function parseScimTokenBody(body: unknown): {
  displayName: string;
  expiresAt?: string;
} {
  const record = requireRecord(body, 'SCIM token request body must be an object');
  const displayName = optionalTrimmedString(record.displayName ?? record.name, 120);
  const expiresAt = parseOptionalFutureIsoDate(record.expiresAt);

  if (!displayName) {
    throw new ApiValidationError('displayName is required', [
      {
        field: 'displayName',
        issue: 'is required',
      },
    ]);
  }

  return {
    displayName,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function parseScimUserBody(body: unknown, forcedExternalId?: string): ScimUserInput {
  const record = requireRecord(body, 'SCIM user request body must be an object');
  const userName = normalizeEmail(record.userName);
  const externalId = forcedExternalId ?? optionalTrimmedString(record.externalId, 200) ?? userName;
  const displayName = optionalTrimmedString(
    record.displayName ?? displayNameFromName(record.name),
    120,
  );
  const active = record.active === undefined ? true : requiredBoolean(record.active, 'active');

  if (!externalId) {
    throw new ApiValidationError('externalId is required', [
      {
        field: 'externalId',
        issue: 'is required',
      },
    ]);
  }

  return {
    externalId,
    userName,
    ...(displayName ? { displayName } : {}),
    active,
    rawProfile: sanitizeScimRawProfile(record, {
      externalId,
      userName,
      ...(displayName ? { displayName } : {}),
      active,
    }),
  };
}

function parseScimPatchActive(body: unknown): boolean {
  const record = requireRecord(body, 'SCIM patch request body must be an object');

  if (record.active !== undefined) {
    return requiredBoolean(record.active, 'active');
  }

  if (Array.isArray(record.Operations)) {
    for (const operation of record.Operations) {
      if (!operation || typeof operation !== 'object') {
        continue;
      }
      const operationRecord = operation as Record<string, unknown>;
      const path = optionalTrimmedString(operationRecord.path, 80)?.toLowerCase();

      if (path === 'active') {
        return requiredBoolean(operationRecord.value, 'Operations.value');
      }

      if (operationRecord.value && typeof operationRecord.value === 'object') {
        const value = operationRecord.value as Record<string, unknown>;
        if (value.active !== undefined) {
          return requiredBoolean(value.active, 'Operations.value.active');
        }
      }
    }
  }

  throw new ApiValidationError('SCIM patch must set active', [
    {
      field: 'active',
      issue: 'must be supplied directly or in an Operations entry',
    },
  ]);
}

function toScimUserResponse(user: TeamScimUserRecord): ScimUserResponse {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.externalId,
    userName: user.userName,
    ...(user.displayName ? { displayName: user.displayName } : {}),
    active: user.active,
    meta: {
      resourceType: 'User',
      created: user.createdAt,
      lastModified: user.updatedAt,
    },
  };
}

function scimUserSchema(): ScimSchemaResponse {
  return {
    schemas: [SCIM_SCHEMA_SCHEMA],
    id: SCIM_USER_SCHEMA,
    name: 'User',
    description: 'PolyCost supports the core SCIM User attributes needed for IdP provisioning.',
    attributes: [
      {
        name: 'id',
        type: 'string',
        multiValued: false,
        description: 'PolyCost SCIM user identifier.',
        required: false,
        caseExact: true,
        mutability: 'readOnly',
        returned: 'always',
        uniqueness: 'server',
      },
      {
        name: 'externalId',
        type: 'string',
        multiValued: false,
        description: 'Identity provider stable user identifier.',
        required: false,
        caseExact: true,
        mutability: 'readWrite',
        returned: 'default',
        uniqueness: 'none',
      },
      {
        name: 'userName',
        type: 'string',
        multiValued: false,
        description: 'Email-style username used to attach the user to a PolyCost account.',
        required: true,
        caseExact: false,
        mutability: 'readWrite',
        returned: 'default',
        uniqueness: 'server',
      },
      {
        name: 'name',
        type: 'complex',
        multiValued: false,
        description: 'Optional display-name container accepted from common IdPs.',
        required: false,
        caseExact: false,
        mutability: 'readWrite',
        returned: 'default',
        uniqueness: 'none',
        subAttributes: [
          {
            name: 'formatted',
            type: 'string',
            multiValued: false,
            description: 'Human-readable display name.',
            required: false,
            caseExact: false,
            mutability: 'readWrite',
            returned: 'default',
            uniqueness: 'none',
          },
        ],
      },
      {
        name: 'displayName',
        type: 'string',
        multiValued: false,
        description: 'Optional human-readable display name.',
        required: false,
        caseExact: false,
        mutability: 'readWrite',
        returned: 'default',
        uniqueness: 'none',
      },
      {
        name: 'active',
        type: 'boolean',
        multiValued: false,
        description: 'Whether the IdP-managed team membership is active.',
        required: false,
        caseExact: false,
        mutability: 'readWrite',
        returned: 'default',
        uniqueness: 'none',
      },
      {
        name: 'emails',
        type: 'complex',
        multiValued: true,
        description: 'Optional email values accepted for profile retention evidence.',
        required: false,
        caseExact: false,
        mutability: 'readWrite',
        returned: 'default',
        uniqueness: 'none',
        subAttributes: [
          {
            name: 'value',
            type: 'string',
            multiValued: false,
            description: 'Email address value.',
            required: false,
            caseExact: false,
            mutability: 'readWrite',
            returned: 'default',
            uniqueness: 'none',
          },
          {
            name: 'primary',
            type: 'boolean',
            multiValued: false,
            description: 'Whether this email is the primary IdP email.',
            required: false,
            caseExact: false,
            mutability: 'readWrite',
            returned: 'default',
            uniqueness: 'none',
          },
        ],
      },
    ],
    meta: {
      resourceType: 'Schema',
      location: '/api/v1/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User',
    },
  };
}

function scimUserResourceType(): ScimResourceTypeResponse {
  return {
    schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
    id: 'User',
    name: 'User',
    endpoint: '/Users',
    description: 'PolyCost team-member provisioning through the SCIM core User resource.',
    schema: SCIM_USER_SCHEMA,
    schemaExtensions: [],
    meta: {
      resourceType: 'ResourceType',
      location: '/api/v1/scim/v2/ResourceTypes/User',
    },
  };
}

function bearerToken(headers: Record<string, unknown> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  const value = headers.authorization ?? headers.Authorization;
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== 'string') {
    return undefined;
  }

  const match = raw.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(value: unknown): string {
  const email = requiredString(value, 'userName').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiValidationError('userName must be an email address', [
      {
        field: 'userName',
        issue: 'must be a valid email address',
      },
    ]);
  }

  return email;
}

function parseOptionalFutureIsoDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = requiredString(value, 'expiresAt');
  const parsed = Date.parse(raw);

  if (!Number.isFinite(parsed) || parsed <= Date.now()) {
    throw new ApiValidationError('expiresAt must be a future ISO date', [
      {
        field: 'expiresAt',
        issue: 'must be a future ISO timestamp',
      },
    ]);
  }

  return new Date(parsed).toISOString();
}

function displayNameFromName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return optionalTrimmedString(record.formatted, 120);
}

function sanitizeScimRawProfile(
  record: Record<string, unknown>,
  normalized: Record<string, unknown>,
): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    schemas: Array.isArray(record.schemas) ? record.schemas.slice(0, 5) : [SCIM_USER_SCHEMA],
    ...normalized,
  };

  if (record.name && typeof record.name === 'object') {
    profile.name = record.name;
  }
  if (Array.isArray(record.emails)) {
    profile.emails = record.emails.slice(0, 5);
  }

  return profile;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiValidationError(`${field} is required`, [
      {
        field,
        issue: 'must be a non-empty string',
      },
    ]);
  }

  return value.trim();
}

function optionalTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiValidationError(`${field} must be boolean`, [
      {
        field,
        issue: 'must be true or false',
      },
    ]);
  }

  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiValidationError(message, [
      {
        issue: 'body must be an object',
      },
    ]);
  }

  return value as Record<string, unknown>;
}
