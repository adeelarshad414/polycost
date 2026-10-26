import { describe, it, expect, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { env } from 'node:process';
import { discoverRoutes } from '../testing/route-discovery.js';

// ADR-0001 §7: "With ANONYMOUS_MODE=disabled, every core route returns 401
// without a session." scripts/ci-e2e.mjs restarts the Compose API with
// anonymous mode off and runs only this file; in the normal run it skips.
// Routes come from the controllers themselves, so a new core route is swept
// here without anyone listing it.

const API_ORIGIN = env.POLYCOST_API_ORIGIN ?? `http://localhost:${env.API_PORT ?? '3001'}`;
const describeDisabled = env.POLYCOST_E2E_ANONYMOUS_MODE === 'disabled' ? describe : describe.skip;

jest.setTimeout(120_000);

describeDisabled('ANONYMOUS_MODE=disabled (ADR-0001)', () => {
  it('answers 401 on every core route without a session', async () => {
    const core = (await discoverRoutes()).filter((route) => route.access === 'core');
    expect(core.length).toBeGreaterThan(20);

    const unexpected: string[] = [];
    for (const route of core) {
      // Any id will do: the session check must come before the lookup.
      const url = `${API_ORIGIN}${route.path.replace(/:[A-Za-z]+/g, randomUUID())}`;
      const hasBody = route.method !== 'GET' && route.method !== 'HEAD';
      const response = await fetch(url, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        ...(hasBody ? { body: '{}' } : {}),
      });
      if (response.status !== 401) {
        unexpected.push(`${route.route} -> ${response.status}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  it('keeps public routes public and lets a signed-in member work', async () => {
    expect((await fetch(`${API_ORIGIN}/health`)).status).toBe(200);
    expect((await fetch(`${API_ORIGIN}/api/v1/regions`)).status).toBe(200);

    const suffix = randomUUID().slice(0, 8);
    const registered = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `disabled-${suffix}@example.com`,
        password: 'correct horse battery staple',
        teamName: `Disabled mode ${suffix}`,
      }),
    });
    expect(registered.status).toBe(201);
    const { token } = (await registered.json()) as { token: string };

    const workload = await fetch(`${API_ORIGIN}/api/v1/workloads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        instanceFamily: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        region: 'us-east',
        instanceCount: 1,
        hoursPerMonth: 730,
        storageGb: 50,
        storageTier: 'standard',
        egressGbPerMonth: 10,
      }),
    });
    expect(workload.status).toBe(201);
    // Team-owned, so no edit key is issued.
    expect(((await workload.json()) as { writeKey?: string }).writeKey).toBeUndefined();
  });
});
