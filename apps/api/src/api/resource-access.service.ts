import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { ApiForbiddenError, ApiNotFoundError, ApiUnauthorizedError } from './api-errors.js';
import { ApiDatabaseRepository, type ResourceKind } from './api-database.repository.js';
import { AuthService } from './auth.service.js';
import type { AuthIdentity, RequestWithAuth } from './auth.types.js';

/** Who is calling: a signed-in identity, or nobody (anonymous). */
export interface Actor {
  identity?: AuthIdentity;
}

/** What the caller wants to do with a resource. */
export type AccessMode = 'read' | 'write' | 'admin';

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
 * change. Anonymous resources keep today's capability behaviour (write keys
 * arrive in P2-1b). With ANONYMOUS_MODE=disabled every core route requires a
 * session.
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
    // Optional authentication by design (CodeQL js/user-controlled-bypass is a
    // reviewed false positive here): leaving the header out can only make the
    // caller anonymous, which has strictly fewer rights - team-owned resources
    // still demand membership in assert(), and ANONYMOUS_MODE=disabled turns
    // the anonymous path into a 401 below.
    if (hasAuthorization(request)) {
      return { identity: await this.authService.authenticateRequest(request) };
    }
    if (!this.anonymousEnabled()) {
      throw new ApiUnauthorizedError('Sign in to use PolyCost on this deployment');
    }
    return {};
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

  /**
   * Allow the call or throw. Returns the owning team so callers can stamp it on
   * derived resources (e.g. a live refresh creates a new comparison).
   */
  async assert(
    kind: ResourceKind,
    id: string,
    actor: Actor,
    mode: AccessMode,
  ): Promise<string | null> {
    const owner = await this.repository.getResourceOwner(kind, id);
    if (!owner) {
      throw new ApiNotFoundError(NOT_FOUND[kind]);
    }
    if (owner.teamId === null) {
      // Anonymous capability: holding the id is the access (ADR-0001 §3.6).
      return null;
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
    return owner.teamId;
  }

  private anonymousEnabled(): boolean {
    return this.configService.get('ANONYMOUS_MODE', { infer: true }) !== 'disabled';
  }
}

function hasAuthorization(request: RequestWithAuth | undefined): request is RequestWithAuth {
  const value = request?.headers?.authorization ?? request?.headers?.Authorization;
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Today's behaviour (everything anonymous), for controllers constructed
 * directly in unit tests. Nest always injects the real service: the parameter
 * is not @Optional, so a missing provider fails at boot rather than opening up.
 */
export const OPEN_ACCESS = {
  actor: async (): Promise<Actor> => ({}),
  ownerForCreate: (): string | null => null,
  assert: async (): Promise<string | null> => null,
} as unknown as ResourceAccessService;
