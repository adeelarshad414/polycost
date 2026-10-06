import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { ResourceAccessService } from './resource-access.service.js';
import { ROUTE_ACCESS_KEY, type RouteAccessKind } from './route-access.js';
import { SessionAuthGuard } from './session-auth.guard.js';

// ADR-0001 definition of done: every route is classified. This test discovers
// every *.controller.ts under src, so a new route - or a new controller - fails
// CI until someone decides who may call it.

type Ctor = { new (...args: never[]): unknown; name: string; prototype: Record<string, unknown> };

interface Route {
  route: string;
  controller: Ctor;
  handler: string;
  access: RouteAccessKind | undefined;
  guarded: boolean;
}

// Jest runs with apps/api as its root directory.
const SRC = path.resolve(process.cwd(), 'src');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

async function discoverRoutes(): Promise<Route[]> {
  const routes: Route[] = [];
  for (const file of controllerFiles(SRC)) {
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const exported of Object.values(module)) {
      if (typeof exported !== 'function') continue;
      const controller = exported as Ctor;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
      if (base === undefined) continue;
      const classAccess = Reflect.getMetadata(ROUTE_ACCESS_KEY, controller) as RouteAccessKind;
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[];

      for (const handler of Object.getOwnPropertyNames(controller.prototype)) {
        const fn = controller.prototype[handler];
        if (typeof fn !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
        if (method === undefined) continue;
        const sub = Reflect.getMetadata(PATH_METADATA, fn) as string;
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, fn) ?? []) as unknown[]),
        ];
        routes.push({
          route: `${RequestMethod[method]} /${[base, sub].filter((p) => p && p !== '/').join('/')}`,
          controller,
          handler,
          access: (Reflect.getMetadata(ROUTE_ACCESS_KEY, fn) as RouteAccessKind) ?? classAccess,
          guarded: guards.includes(SessionAuthGuard),
        });
      }
    }
  }
  return routes;
}

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
