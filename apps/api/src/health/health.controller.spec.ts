import { HealthController } from './health.controller';
import { HealthService } from './health.service';

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
