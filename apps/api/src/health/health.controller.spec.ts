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

describe('HealthController', () => {
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
});
