import { ResourceAccessService } from './resource-access.service.js';
import { discoverRoutes, type DiscoveredRoute as Route } from '../testing/route-discovery.js';

// ADR-0001 definition of done: every route is classified. Discovery reads every
// *.controller.ts under src, so a new route - or a new controller - fails CI
// until someone decides who may call it.

describe('route access classification (ADR-0001)', () => {
  let routes: Route[];

  beforeAll(async () => {
    routes = await discoverRoutes();
  });

  it('discovers the API surface', () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  it('classifies every route', () => {
    const unclassified = routes.filter((r) => !r.access).map((r) => r.route);
    expect(unclassified).toEqual([]);
  });

  it('runs every core route through ResourceAccessService', () => {
    const missing = routes
      .filter((r) => r.access === 'core')
      .filter((r) => {
        const params = (Reflect.getMetadata('design:paramtypes', r.controller) ?? []) as unknown[];
        return !params.includes(ResourceAccessService);
      })
      .map((r) => r.route);
    expect(missing).toEqual([]);
  });

  it('matches session routes to SessionAuthGuard', () => {
    const mismatched = routes
      .filter((r) => (r.access === 'session') !== r.guarded)
      .map((r) => `${r.route} (${r.access}, guarded=${r.guarded})`);
    expect(mismatched).toEqual([]);
  });

  it('keeps the core data surface core (comparisons, workloads, budgets, alerts, share-link management)', () => {
    const core = routes.filter((r) =>
      /^\w+ \/api\/v1\/(comparisons|workloads|budgets|alerts|share-links)(\/|$)/.test(r.route),
    );
    expect(core.length).toBeGreaterThan(10);
    expect(core.filter((r) => r.access !== 'core').map((r) => r.route)).toEqual([]);
  });
});
