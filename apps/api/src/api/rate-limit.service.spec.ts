import { ApiRateLimitService, RateLimitRedis } from './rate-limit.service';
import { RateLimitExceededError } from './api-errors';

// The limiter guards auth, comparisons and the paid refresh-live path. Backing
// it with Redis is what makes the limit shared: with per-process counters, N
// replicas silently allow N times the configured limit.

/** In-memory stand-in that runs the same INCR/PEXPIRE/PTTL semantics as Redis. */
function fakeRedis(): RateLimitRedis {
  const counts = new Map<string, number>();
  const expiries = new Map<string, number>();

  return {
    async eval(_script: string, _numKeys: number, ...args: (string | number)[]) {
      const key = String(args[0]);
      const windowMs = Number(args[1]);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);

      if (next === 1) {
        expiries.set(key, windowMs);
      }

      return [next, expiries.get(key) ?? -1];
    },
  };
}

describe('ApiRateLimitService', () => {
  describe('with Redis', () => {
    it('shares the counter across service instances', async () => {
      // Two services, one Redis: this is the multi-replica case. Each instance
      // has its own in-process Map, so if the counter were not shared the third
      // call would be allowed.
      const redis = fakeRedis();
      const instanceA = new ApiRateLimitService(() => 0, redis);
      const instanceB = new ApiRateLimitService(() => 0, redis);

      await instanceA.consume('auth_login', '203.0.113.1', 2);
      await instanceB.consume('auth_login', '203.0.113.1', 2);

      await expect(instanceB.consume('auth_login', '203.0.113.1', 2)).rejects.toThrow(
        RateLimitExceededError,
      );
    });

    it('reports remaining and reset from the shared window', async () => {
      const redis = fakeRedis();
      const service = new ApiRateLimitService(() => 0, redis);

      await expect(service.consume('parse', 'ip', 3)).resolves.toEqual({
        limit: 3,
        remaining: 2,
        resetSeconds: 60,
      });
      await expect(service.consume('parse', 'ip', 3)).resolves.toMatchObject({ remaining: 1 });
    });

    it('scopes counters separately per scope and identity', async () => {
      const redis = fakeRedis();
      const service = new ApiRateLimitService(() => 0, redis);

      await service.consume('scope-a', 'ip-1', 1);
      // Different scope and different identity must each get a fresh window.
      await expect(service.consume('scope-b', 'ip-1', 1)).resolves.toMatchObject({ remaining: 0 });
      await expect(service.consume('scope-a', 'ip-2', 1)).resolves.toMatchObject({ remaining: 0 });
      await expect(service.consume('scope-a', 'ip-1', 1)).rejects.toThrow(RateLimitExceededError);
    });

    it('surfaces a retry-after derived from the live TTL', async () => {
      const redis = fakeRedis();
      const service = new ApiRateLimitService(() => 0, redis);

      await service.consume('parse', 'ip', 1);

      await expect(service.consume('parse', 'ip', 1)).rejects.toMatchObject({
        retryAfterSeconds: 60,
      });
    });
  });

  describe('when Redis is unavailable', () => {
    it('falls back to per-process counters rather than failing the request', async () => {
      // Availability over strictness: an outage must not take the API down. The
      // fallback is degraded (per-instance) and the service logs that once.
      const redis: RateLimitRedis = {
        eval: async () => {
          throw new Error('ECONNREFUSED');
        },
      };
      const service = new ApiRateLimitService(() => 0, redis);

      await expect(service.consume('parse', 'ip', 2)).resolves.toMatchObject({ remaining: 1 });
      await expect(service.consume('parse', 'ip', 2)).resolves.toMatchObject({ remaining: 0 });
      await expect(service.consume('parse', 'ip', 2)).rejects.toThrow(RateLimitExceededError);
    });
  });

  describe('without Redis configured', () => {
    it('still enforces limits in-process and resets after the window', async () => {
      let now = 0;
      const service = new ApiRateLimitService(() => now);

      await service.consume('parse', 'ip', 1);
      await expect(service.consume('parse', 'ip', 1)).rejects.toThrow(RateLimitExceededError);

      now = 60_000;
      await expect(service.consume('parse', 'ip', 1)).resolves.toMatchObject({ limit: 1 });
    });
  });
});
