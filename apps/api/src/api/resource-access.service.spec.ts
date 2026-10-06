import { describe, it, expect, jest } from '@jest/globals';
import { ApiForbiddenError, ApiNotFoundError, ApiUnauthorizedError } from './api-errors.js';
import type { ResourceKind } from './api-database.repository.js';
import type { AuthIdentity } from './auth.types.js';
import { ResourceAccessService, hashWriteKey, type Actor } from './resource-access.service.js';

// ADR-0001 enforcement, branch by branch.

const TEAM_A = '11111111-1111-4111-8111-111111111111';
const TEAM_B = '22222222-2222-4222-8222-222222222222';
const RESOURCE = '33333333-3333-4333-8333-333333333333';

function identity(teamId: string | undefined, accountId = 'acct-a'): AuthIdentity {
  return {
    accountId,
    email: 'a@example.com',
    teamId,
    sessionId: 's',
    expiresAt: '',
  } as AuthIdentity;
}

function service(options: {
  anonymousMode?: 'enabled' | 'disabled';
  owner?: { teamId: string | null; writeKeyHash?: string | null };
  claimed?: boolean;
  roles?: Record<string, string>;
  authenticate?: () => Promise<AuthIdentity>;
}) {
  const repository = {
    getResourceOwner: jest.fn<(kind: ResourceKind, id: string) => Promise<typeof options.owner>>(
      async () => (options.owner ? { writeKeyHash: null, ...options.owner } : undefined),
    ),
    getTeamRole: jest.fn(
      async (accountId: string, teamId: string) => options.roles?.[`${accountId}:${teamId}`],
    ),
  };
  Object.assign(repository, {
    claimResource: jest.fn(async () => options.claimed ?? true),
  });
  const auth = {
    authenticateRequest: jest.fn(options.authenticate ?? (async () => identity(TEAM_A))),
  };
  const config = { get: () => options.anonymousMode ?? 'enabled' };
  return {
    access: new ResourceAccessService(config as never, auth as never, repository as never),
    repository,
    auth,
  };
}

const bearer = { headers: { authorization: 'Bearer token' } };

describe('ResourceAccessService.actor', () => {
  it('lets anonymous callers through while anonymous mode is enabled', async () => {
    await expect(service({}).access.actor({ headers: {} })).resolves.toEqual({});
  });

  it('requires a session when anonymous mode is disabled', async () => {
    await expect(
      service({ anonymousMode: 'disabled' }).access.actor({ headers: {} }),
    ).rejects.toThrow(ApiUnauthorizedError);
  });

  it('rejects a stale token instead of silently treating the caller as anonymous', async () => {
    const { access } = service({
      authenticate: async () => {
        throw new ApiUnauthorizedError('Session is expired or invalid');
      },
    });
    await expect(access.actor(bearer)).rejects.toThrow(ApiUnauthorizedError);
  });

  it('resolves a signed-in caller', async () => {
    await expect(service({}).access.actor(bearer)).resolves.toEqual({ identity: identity(TEAM_A) });
  });
});

describe('ResourceAccessService.ownerForCreate', () => {
  it("stamps the caller's active team, or null when anonymous", () => {
    const { access } = service({});
    expect(access.ownerForCreate({ identity: identity(TEAM_A) })).toBe(TEAM_A);
    expect(access.ownerForCreate({})).toBeNull();
    expect(access.ownerForCreate({ identity: identity(undefined) })).toBeNull();
  });

  it('requires a team when anonymous mode is disabled', () => {
    const { access } = service({ anonymousMode: 'disabled' });
    expect(() => access.ownerForCreate({ identity: identity(undefined) })).toThrow(
      ApiForbiddenError,
    );
  });
});

describe('ResourceAccessService.assert', () => {
  it('404s a resource that does not exist', async () => {
    const { access } = service({ owner: undefined });
    await expect(access.assert('comparison', RESOURCE, {}, 'read')).rejects.toThrow(
      ApiNotFoundError,
    );
  });

  it('reads anonymous resources by id (capability URL)', async () => {
    const { access, repository } = service({ owner: { teamId: null, writeKeyHash: 'x' } });
    await expect(access.assert('workload', RESOURCE, {}, 'read')).resolves.toMatchObject({
      teamId: null,
    });
    expect(repository.getTeamRole).not.toHaveBeenCalled();
  });

  // ADR-0001 §3.4: changing anonymous data needs the edit key.
  it.each([
    ['no key', undefined, false],
    ['a wrong key', 'wrong-key', false],
    ['the right key', 'right-key', true],
  ])('changes an anonymous resource with %s: %s', async (_label, writeKey, allowed) => {
    const { access } = service({
      owner: { teamId: null, writeKeyHash: hashWriteKey('right-key') },
    });
    const call = access.assert('alert', RESOURCE, writeKey ? { writeKey } : {}, 'write');
    if (allowed) {
      await expect(call).resolves.toMatchObject({ teamId: null });
    } else {
      await expect(call).rejects.toThrow(ApiForbiddenError);
    }
  });

  it('keeps legacy anonymous rows (no key) read-only', async () => {
    const { access } = service({ owner: { teamId: null, writeKeyHash: null } });
    await expect(
      access.assert('workload', RESOURCE, { writeKey: 'anything' }, 'write'),
    ).rejects.toThrow('predates edit keys');
  });

  it.each([
    ['an anonymous caller', {}],
    ['a member of another team', { identity: identity(TEAM_B, 'acct-b') }],
  ])('404s (not 403) a team-owned resource for %s', async (_label, actor) => {
    const { access } = service({
      owner: { teamId: TEAM_A },
      roles: { [`acct-b:${TEAM_B}`]: 'owner' },
    });
    await expect(access.assert('comparison', RESOURCE, actor, 'read')).rejects.toThrow(
      ApiNotFoundError,
    );
  });

  it('checks membership of the owning team, not just the active team', async () => {
    // Active team is B, but the caller is also a member of A, the owner.
    const { access } = service({
      owner: { teamId: TEAM_A },
      roles: { [`acct-a:${TEAM_A}`]: 'member' },
    });
    await expect(
      access.assert('comparison', RESOURCE, { identity: identity(TEAM_B) }, 'read'),
    ).resolves.toMatchObject({ teamId: TEAM_A });
  });

  it.each([
    ['viewer', 'read', true],
    ['viewer', 'write', false],
    ['member', 'write', true],
    ['member', 'admin', false],
    ['admin', 'admin', true],
    ['owner', 'admin', true],
  ] as const)('a %s may %s: %s', async (role, mode, allowed) => {
    const { access } = service({
      owner: { teamId: TEAM_A },
      roles: { [`acct-a:${TEAM_A}`]: role },
    });
    const call = access.assert('alert', RESOURCE, { identity: identity(TEAM_A) }, mode);
    if (allowed) {
      await expect(call).resolves.toMatchObject({ teamId: TEAM_A });
    } else {
      await expect(call).rejects.toThrow(ApiForbiddenError);
    }
  });
});

describe('ResourceAccessService.writeKeyFor', () => {
  it('issues a 256-bit key for anonymous data and stores only its hash', () => {
    const issued = service({}).access.writeKeyFor(null);
    expect(issued?.writeKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued?.writeKeyHash).toBe(hashWriteKey(issued?.writeKey ?? ''));
    expect(service({}).access.writeKeyFor(TEAM_A)).toBeNull();
  });
});

// ADR-0001 §3.5: claiming moves anonymous data into the caller's team.
describe('ResourceAccessService.claim', () => {
  const key = 'right-key';
  const member = { identity: identity(TEAM_A), writeKey: key };
  const roles = { [`acct-a:${TEAM_A}`]: 'member' };

  it('claims with a session, a team role and the edit key', async () => {
    const { access, repository } = service({
      owner: { teamId: null, writeKeyHash: hashWriteKey(key) },
      roles,
    });
    await expect(access.claim('workload', RESOURCE, member)).resolves.toEqual({ teamId: TEAM_A });
    expect(
      (repository as unknown as { claimResource: jest.Mock }).claimResource,
    ).toHaveBeenCalledWith('workload', RESOURCE, TEAM_A);
  });

  it.each<[string, Actor, new (...args: never[]) => Error, string]>([
    ['without a session', { writeKey: key }, ApiUnauthorizedError, 'member'],
    ['without the edit key', { identity: identity(TEAM_A) }, ApiForbiddenError, 'member'],
    ['as a viewer', member, ApiForbiddenError, 'viewer'],
  ])('refuses %s', async (_label, actor, error, role) => {
    const { access } = service({
      owner: { teamId: null, writeKeyHash: hashWriteKey(key) },
      roles: { [`acct-a:${TEAM_A}`]: role },
    });
    await expect(access.claim('comparison', RESOURCE, actor)).rejects.toThrow(error);
  });

  it("404s another team's resource", async () => {
    const { access } = service({ owner: { teamId: TEAM_B }, roles });
    await expect(access.claim('comparison', RESOURCE, member)).rejects.toThrow(ApiNotFoundError);
  });
});
