import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { ApiForbiddenError, ApiNotFoundError, ApiUnauthorizedError } from './api-errors.js';
import {
  ApiDatabaseRepository,
  type ResourceKind,
  type ResourceOwner,
  type TeamComparisonSummary,
} from './api-database.repository.js';
import { AuthService } from './auth.service.js';
import type { AuthIdentity, RequestWithAuth } from './auth.types.js';

/** Header carrying an anonymous resource's edit key (ADR-0001 §3.4). */
export const WRITE_KEY_HEADER = 'x-polycost-write-key';

/** Who is calling: a signed-in identity and/or an anonymous edit key. */
export interface Actor {
  identity?: AuthIdentity;
  writeKey?: string;
}

/** What the caller wants to do with a resource. */
export type AccessMode = 'read' | 'write' | 'admin';

/** A freshly issued edit key: the raw value is returned once, only the hash is stored. */
export interface IssuedWriteKey {
  writeKey: string;
  writeKeyHash: string;
}

/**
 * What the caller may do with a comparison or workload, for the web app's
 * ownership badge and its edit/claim controls (ADR-0001 §3.7). Advisory only:
 * every change route still enforces access itself.
 */
export interface ResourceOwnership {
  owner: 'team' | 'anonymous';
  teamId: string | null;
  teamName: string | null;
  /** When anonymous data expires (P2-1c); null for team-owned data. */
  expiresAt: string | null;
  /** The caller's role in the owning team; null for anonymous data. */
  role: string | null;
  /** Team role allows changes, or the edit key sent matches. */
  canChange: boolean;
  /** Anonymous, the edit key matches, and the caller can write in their active team. */
  canClaim: boolean;
}

const WRITE_ROLES = new Set(['owner', 'admin', 'member']);
const ADMIN_ROLES = new Set(['owner', 'admin']);

const NOT_FOUND: Record<ResourceKind, string> = {
  comparison: 'Comparison was not found',
  workload: 'Workload was not found',
  alert: 'Alert was not found',
  shareLink: 'Share link was not found',
};

/**
 * The single enforcement point for core-data ownership (ADR-0001).
 *
 * A resource is either team-owned (team_id set when a signed-in member created
 * it) or anonymous (team_id NULL, a capability URL). Team-owned resources are
 * visible to members of that team only; everyone else gets 404 rather than 403,
 * so the existence of another team's data never leaks. Viewers may read but not
 * change. Anonymous resources are readable by anyone holding the id; changing
 * them needs the edit key issued at creation. With ANONYMOUS_MODE=disabled
 * every core route requires a session.
 */
@Injectable()
export class ResourceAccessService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly authService: AuthService,
    private readonly repository: ApiDatabaseRepository,
  ) {}

  /**
   * Resolve the caller. A bearer token, when sent, must be valid (401
   * otherwise) - a stale token silently falling back to anonymous would create
   * data the user then cannot see in their team.
   */
  async actor(request: RequestWithAuth | undefined): Promise<Actor> {
    const writeKey = headerValue(request, WRITE_KEY_HEADER);
    // Optional authentication by design (CodeQL js/user-controlled-bypass is a
    // reviewed false positive here): leaving the header out can only make the
    // caller anonymous, which has strictly fewer rights - team-owned resources
    // still demand membership in assert(), and ANONYMOUS_MODE=disabled turns
    // the anonymous path into a 401 below.
    if (hasAuthorization(request)) {
      return {
        identity: await this.authService.authenticateRequest(request),
        ...(writeKey ? { writeKey } : {}),
      };
    }
    if (!this.anonymousEnabled()) {
      throw new ApiUnauthorizedError('Sign in to use PolyCost on this deployment');
    }
    return writeKey ? { writeKey } : {};
  }

  /**
   * The team that will own a new resource: the caller's active team, or null
   * (anonymous) when signed out or not yet in a team.
   */
  ownerForCreate(actor: Actor): string | null {
    const teamId = actor.identity?.teamId ?? null;
    if (!teamId && !this.anonymousEnabled()) {
      throw new ApiForbiddenError('Create or join a team before creating comparisons');
    }
    return teamId;
  }

  /** An edit key for a new anonymous resource; null for team-owned ones. */
  writeKeyFor(ownerTeamId: string | null): IssuedWriteKey | null {
    if (ownerTeamId !== null) {
      return null;
    }
    const writeKey = randomBytes(32).toString('base64url');
    return { writeKey, writeKeyHash: hashWriteKey(writeKey) };
  }

  /**
   * Allow the call or throw. Returns the owner so callers can carry it onto
   * derived resources (a live refresh creates a new comparison).
   */
  async assert(
    kind: ResourceKind,
    id: string,
    actor: Actor,
    mode: AccessMode,
  ): Promise<ResourceOwner> {
    const owner = await this.repository.getResourceOwner(kind, id);
    if (!owner) {
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }

    if (owner.teamId === null) {
      // Anonymous: holding the id is enough to read; changing needs the key.
      if (mode !== 'read' && !writeKeyMatches(actor.writeKey, owner.writeKeyHash)) {
        throw new ApiForbiddenError(
          owner.writeKeyHash
            ? 'This anonymous resource can only be changed with its edit key'
            : 'This anonymous resource predates edit keys and is read-only; sign in and create it in a team to change it',
        );
      }
      return owner;
    }

    const role = actor.identity
      ? await this.repository.getTeamRole(actor.identity.accountId, owner.teamId)
      : undefined;
    if (!role) {
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }
    if (mode === 'write' && !WRITE_ROLES.has(role)) {
      throw new ApiForbiddenError('Viewers can read team data but not change it');
    }
    if (mode === 'admin' && !ADMIN_ROLES.has(role)) {
      throw new ApiForbiddenError('Only a team owner or admin can do this');
    }
    return owner;
  }

  /**
   * ADR-0001 §3.5: move an anonymous comparison or workload into the caller's
   * active team. Needs a session, a non-viewer role in that team, and the
   * resource's edit key - read access alone can never claim.
   */
  async claim(
    kind: 'comparison' | 'workload',
    id: string,
    actor: Actor,
  ): Promise<{ teamId: string }> {
    const teamId = actor.identity?.teamId;
    if (!actor.identity || !teamId) {
      throw new ApiUnauthorizedError('Sign in with a team to claim this');
    }
    const role = await this.repository.getTeamRole(actor.identity.accountId, teamId);
    if (!role || !WRITE_ROLES.has(role)) {
      throw new ApiForbiddenError('Viewers cannot claim data into a team');
    }

    const owner = await this.repository.getResourceOwner(kind, id);
    if (!owner) {
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }
    if (owner.teamId !== null) {
      // Already team-owned: indistinguishable from missing for outsiders.
      if (owner.teamId === teamId) return { teamId };
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }
    if (!writeKeyMatches(actor.writeKey, owner.writeKeyHash)) {
      throw new ApiForbiddenError('Claiming needs the edit key issued when this was created');
    }
    if (!(await this.repository.claimResource(kind, id, teamId))) {
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }
    return { teamId };
  }

  /** Ownership as the caller sees it. Same 404 rules as reading the resource. */
  async ownership(
    kind: 'comparison' | 'workload',
    id: string,
    actor: Actor,
  ): Promise<ResourceOwnership> {
    const owner = await this.assert(kind, id, actor, 'read');
    const details = await this.repository.getOwnershipDetails(kind, id);
    if (!details) {
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }

    if (owner.teamId !== null) {
      // assert() has already proved membership, so a role is present.
      const role = actor.identity
        ? ((await this.repository.getTeamRole(actor.identity.accountId, owner.teamId)) ?? null)
        : null;
      return {
        owner: 'team',
        teamId: owner.teamId,
        teamName: details.teamName,
        expiresAt: null,
        role,
        canChange: role !== null && WRITE_ROLES.has(role),
        canClaim: false,
      };
    }

    const keyMatches = writeKeyMatches(actor.writeKey, owner.writeKeyHash);
    const activeTeam = actor.identity?.teamId;
    const activeRole =
      keyMatches && actor.identity && activeTeam
        ? await this.repository.getTeamRole(actor.identity.accountId, activeTeam)
        : undefined;
    return {
      owner: 'anonymous',
      teamId: null,
      teamName: null,
      expiresAt: details.expiresAt,
      role: null,
      canChange: keyMatches,
      canClaim: activeRole !== undefined && WRITE_ROLES.has(activeRole),
    };
  }

  /** ADR-0001 §3.7: the comparisons of the caller's active team, any role. */
  async teamComparisons(actor: Actor, limit = 50): Promise<TeamComparisonSummary[]> {
    const teamId = actor.identity?.teamId;
    if (!actor.identity) {
      throw new ApiUnauthorizedError('Sign in to see your team comparisons');
    }
    if (!teamId) {
      throw new ApiForbiddenError('Create or join a team to see team comparisons');
    }
    if (!(await this.repository.getTeamRole(actor.identity.accountId, teamId))) {
      throw new ApiForbiddenError('You are no longer a member of this team');
    }
    return this.repository.listTeamComparisons(teamId, limit);
  }

  private anonymousEnabled(): boolean {
    return this.configService.get('ANONYMOUS_MODE', { infer: true }) !== 'disabled';
  }
}

export function hashWriteKey(writeKey: string): string {
  return createHash('sha256').update(writeKey, 'utf8').digest('hex');
}

function writeKeyMatches(writeKey: string | undefined, expectedHash: string | null): boolean {
  if (!writeKey || !expectedHash) {
    return false;
  }
  const candidate = Buffer.from(hashWriteKey(writeKey), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function headerValue(request: RequestWithAuth | undefined, name: string): string | undefined {
  const value = request?.headers?.[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function hasAuthorization(request: RequestWithAuth | undefined): request is RequestWithAuth {
  const value = request?.headers?.authorization ?? request?.headers?.Authorization;
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Pre-ADR behaviour (everything anonymous and changeable), for controllers
 * constructed directly in unit tests. Nest always injects the real service:
 * the parameter is not @Optional, so a missing provider fails at boot.
 */
export const OPEN_ACCESS = {
  actor: async (): Promise<Actor> => ({}),
  ownerForCreate: (): string | null => null,
  writeKeyFor: (): IssuedWriteKey | null => null,
  assert: async (): Promise<ResourceOwner> => ({ teamId: null, writeKeyHash: null }),
  claim: async (): Promise<{ teamId: string }> => ({ teamId: '' }),
  ownership: async (): Promise<ResourceOwnership> => ({
    owner: 'anonymous',
    teamId: null,
    teamName: null,
    expiresAt: null,
    role: null,
    canChange: true,
    canClaim: false,
  }),
  teamComparisons: async (): Promise<TeamComparisonSummary[]> => [],
} as unknown as ResourceAccessService;
