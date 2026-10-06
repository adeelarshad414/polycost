import { SetMetadata } from '@nestjs/common';

/**
 * ADR-0001: every HTTP route declares who may call it. A contract test
 * (route-access.spec.ts) fails if a route has no declaration, so a new route
 * cannot ship without someone deciding its access class.
 *
 *   public     reference data, health, auth entry points, share-token reads
 *   core       comparisons, workloads, budgets, alerts, share-link management,
 *              parsing and generation: checked by ResourceAccessService
 *              (team-owned vs anonymous, ANONYMOUS_MODE)
 *   session    SessionAuthGuard; team checks inside the service
 *   admin-key  AdminApiKeyGuard
 *   scim-token a team SCIM bearer token, checked by the SCIM service
 */
export type RouteAccessKind = 'public' | 'core' | 'session' | 'admin-key' | 'scim-token';

export const ROUTE_ACCESS_KEY = 'polycost:route-access';

/** Declare a route's (or a whole controller's) access class. */
export const RouteAccess = (kind: RouteAccessKind) => SetMetadata(ROUTE_ACCESS_KEY, kind);
