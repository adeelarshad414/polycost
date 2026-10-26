import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { ROUTE_ACCESS_KEY, type RouteAccessKind } from '../api/route-access.js';
import { SessionAuthGuard } from '../api/session-auth.guard.js';

// Test support (not built, not in coverage): every HTTP route the API declares,
// read from the controllers' own metadata. Shared by the ADR-0001 contract
// test and the ANONYMOUS_MODE=disabled end-to-end sweep, so both see exactly
// the same surface and a new route is covered by both without anyone listing it.

type Ctor = { new (...args: never[]): unknown; name: string; prototype: Record<string, unknown> };

export interface DiscoveredRoute {
  /** "GET /api/v1/comparisons/:id" */
  route: string;
  method: string;
  /** "/api/v1/comparisons/:id" */
  path: string;
  controller: Ctor;
  handler: string;
  access: RouteAccessKind | undefined;
  guarded: boolean;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

/** `srcDir` is apps/api/src; Jest runs with apps/api as its root directory. */
export async function discoverRoutes(
  srcDir = path.resolve(process.cwd(), 'src'),
): Promise<DiscoveredRoute[]> {
  const routes: DiscoveredRoute[] = [];
  for (const file of controllerFiles(srcDir)) {
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
        const routePath = `/${[base, sub].filter((p) => p && p !== '/').join('/')}`;
        routes.push({
          route: `${RequestMethod[method]} ${routePath}`,
          method: RequestMethod[method],
          path: routePath,
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
