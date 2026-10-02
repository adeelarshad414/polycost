import { describe, it, expect, jest } from '@jest/globals';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

const configService = {
  get: jest.fn((key: string) => {
    switch (key) {
      case 'DB_HOST':
        return 'postgres';
      case 'DB_PORT':
        return 5432;
      case 'REDIS_HOST':
        return 'redis';
      case 'REDIS_PORT':
        return 6379;
      default:
        return undefined;
    }
  }),
};

const freshDataHealth = {
  generatedAt: '2026-07-05T00:00:00.000Z',
  freshnessPolicyHours: 48,
  overallStatus: 'fresh',
  alertCount: 0,
  alerts: [],
  providers: [],
};

describe('HealthController', () => {
  it('returns process liveness without probing dependencies', () => {
    const service = new HealthService(configService as never, async () => {
      throw new Error('should not probe dependencies for liveness');
    });
    const controller = new HealthController(service);

    expect(controller.getLiveHealth()).toEqual({
      status: 'ok',
      service: 'polycost-api',
    });
    expect(controller.getApiLiveHealth()).toEqual({
      status: 'ok',
      service: 'polycost-api',
    });
  });

  it('returns a stable health payload with dependency status', async () => {
    const controller = new HealthController(
      new HealthService(configService as never, async (host, port) => ({
        status: 'ok',
        host,
        port,
        latencyMs: 3,
      })),
    );

    await expect(controller.getHealth()).resolves.toEqual({
      status: 'ok',
      ready: true,
      service: 'polycost-api',
      dependencies: {
        db: {
          status: 'ok',
          host: 'postgres',
          port: 5432,
          latencyMs: 3,
        },
        cache: {
          status: 'ok',
          host: 'redis',
          port: 6379,
          latencyMs: 3,
        },
      },
    });
    await expect(controller.getReadyHealth()).resolves.toEqual({
      status: 'ok',
      ready: true,
      service: 'polycost-api',
      dependencies: {
        db: {
          status: 'ok',
          host: 'postgres',
          port: 5432,
          latencyMs: 3,
        },
        cache: {
          status: 'ok',
          host: 'redis',
          port: 6379,
          latencyMs: 3,
        },
      },
    });
  });

  it('marks the service degraded when a dependency probe fails', async () => {
    const controller = new HealthController(
      new HealthService(configService as never, async (host, port) => ({
        status: host === 'redis' ? 'degraded' : 'ok',
        host,
        port,
        latencyMs: 500,
        ...(host === 'redis' ? { error: 'timeout' } : {}),
      })),
    );

    await expect(controller.getHealth()).resolves.toMatchObject({
      status: 'degraded',
      service: 'polycost-api',
      dependencies: {
        cache: {
          status: 'degraded',
          error: 'timeout',
        },
      },
    });
  });

  it('returns deep health with pricing data freshness and dependency status', async () => {
    const controller = new HealthController(
      new HealthService(
        configService as never,
        async (host, port) => ({
          status: 'ok',
          host,
          port,
          latencyMs: 3,
        }),
        {
          ping: jest.fn(async () => undefined),
          getDataHealth: jest.fn(async () => freshDataHealth),
        } as never,
      ),
    );

    await expect(controller.getDeepHealth()).resolves.toMatchObject({
      status: 'healthy',
      service: 'polycost-api',
      dependencies: {
        db: {
          status: 'ok',
          host: 'postgres',
          port: 5432,
        },
        cache: {
          status: 'ok',
          host: 'redis',
          port: 6379,
        },
      },
      pricingData: freshDataHealth,
    });
  });

  it('marks deep health critical when pricing data has failed providers', async () => {
    const controller = new HealthController(
      new HealthService(
        configService as never,
        async (host, port) => ({
          status: 'ok',
          host,
          port,
          latencyMs: 3,
        }),
        {
          ping: jest.fn(async () => undefined),
          getDataHealth: jest.fn(async () => ({
            ...freshDataHealth,
            overallStatus: 'degraded',
            alertCount: 1,
            alerts: [
              {
                providerId: 'gcp',
                severity: 'critical',
                message: 'Latest provider sync failed; use cached data with caution.',
              },
            ],
            providers: [
              {
                providerId: 'gcp',
                status: 'failed',
                freshness: 'failed',
                recordsUpdated: 0,
                recordsRejected: 0,
                recordsSkipped: 0,
                cache: {
                  catalogRows: 0,
                  currentRateRows: 0,
                  freshness: 'missing',
                  syncStatusCounts: {
                    success: 0,
                    partial: 0,
                    failed: 1,
                  },
                },
                message: 'Latest provider sync failed; use cached data with caution.',
              },
            ],
          })),
        } as never,
      ),
    );

    await expect(controller.getDeepHealth()).resolves.toMatchObject({
      status: 'critical',
      pricingData: expect.objectContaining({
        overallStatus: 'degraded',
        alertCount: 1,
      }),
    });
  });
});

describe('HealthController readiness status codes', () => {
  function controllerWith(status: 'ok' | 'degraded', ready = status === 'ok') {
    const service = {
      getHealth: jest.fn(async () => ({
        status,
        ready,
        service: 'polycost-api',
        dependencies: {
          db: { status: status === 'ok' ? 'ok' : 'degraded', host: 'postgres', port: 5432 },
          cache: { status: 'ok', host: 'redis', port: 6379 },
        },
      })),
      getLiveHealth: jest.fn(() => ({ status: 'ok', service: 'polycost-api' })),
    };

    return {
      controller: new HealthController(service as never),
      response: { status: jest.fn() },
    };
  }

  it('leaves a healthy readiness response at 200', async () => {
    const { controller, response } = controllerWith('ok');

    await controller.getReadyHealth(response);

    expect(response.status).not.toHaveBeenCalled();
  });

  it('answers 503 when a dependency is degraded', async () => {
    const { controller, response } = controllerWith('degraded');

    const body = await controller.getReadyHealth(response);

    // Kubernetes reads the status code and ignores the body. Returning 200
    // here marks the pod Ready and routes traffic to it with an unreachable
    // database - observed on a real cluster before this was fixed.
    expect(response.status).toHaveBeenCalledWith(503);
    expect(body.status).toBe('degraded');
  });

  it('applies the same rule to the versioned alias', async () => {
    const { controller, response } = controllerWith('degraded');

    await controller.getApiReadyHealth(response);

    expect(response.status).toHaveBeenCalledWith(503);
  });

  // M-09: without Redis the API still serves (in-process rate-limit counters,
  // jobs wait), so a Redis blip must not pull every replica out of service.
  it('stays ready at 200 when only the cache is down', async () => {
    const { controller, response } = controllerWith('degraded', true);

    const body = await controller.getReadyHealth(response);

    expect(response.status).not.toHaveBeenCalled();
    expect(body.status).toBe('degraded');
  });

  it('keeps liveness at 200 while degraded', () => {
    const { controller } = controllerWith('degraded');

    // Restarting the process cannot fix a dependency, so liveness must not
    // fail with it - that turns a database blip into a restart loop.
    expect(controller.getLiveHealth()).toEqual({ status: 'ok', service: 'polycost-api' });
  });

  it('works when no response object is supplied', async () => {
    const { controller } = controllerWith('degraded');

    await expect(controller.getReadyHealth()).resolves.toMatchObject({ status: 'degraded' });
  });
});

// M-09: the database probe is a real query, so wrong credentials or an
// exhausted pool fail readiness; a TCP connect passed both.
describe('HealthService database probe', () => {
  const cacheOk = async (host: string, port: number) => ({
    status: 'ok' as const,
    host,
    port,
    latencyMs: 1,
  });

  it('runs SELECT 1 through the app pool and is ready when it answers', async () => {
    const ping = jest.fn(async () => undefined);
    const service = new HealthService(configService as never, cacheOk, { ping } as never);

    await expect(service.getHealth()).resolves.toMatchObject({
      status: 'ok',
      ready: true,
      dependencies: { db: { status: 'ok' } },
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('is not ready when the query fails even though the port is open', async () => {
    const service = new HealthService(configService as never, cacheOk, {
      ping: jest.fn(async () => {
        throw new Error('password authentication failed for user "polycost_app"');
      }),
    } as never);

    await expect(service.getHealth()).resolves.toMatchObject({
      status: 'degraded',
      ready: false,
      dependencies: {
        db: { status: 'degraded', error: expect.stringContaining('password authentication') },
      },
    });
  });

  it('is not ready when the query hangs past the probe timeout', async () => {
    jest.useFakeTimers();
    const service = new HealthService(configService as never, cacheOk, {
      ping: jest.fn(() => new Promise<void>(() => undefined)),
    } as never);

    const pending = service.getHealth();
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({
      ready: false,
      dependencies: { db: { error: expect.stringContaining('timed out') } },
    });
    jest.useRealTimers();
  });
});
