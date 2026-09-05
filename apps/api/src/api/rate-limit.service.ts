import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RateLimitExceededError } from './api-errors.js';

interface Bucket {
  windowStartedAtMs: number;
  count: number;
}

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitHeaderResponse {
  header(name: string, value: string): void;
}

/**
 * Minimal slice of the Redis client this service needs, so the service can be
 * unit-tested without a live server and without depending on ioredis' full type
 * surface.
 */
export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export const RATE_LIMIT_REDIS = Symbol('RATE_LIMIT_REDIS');

const WINDOW_MS = 60_000;

// Fixed-window counter, applied atomically.
//
// INCR followed by a separate EXPIRE has a real failure mode: if the process
// dies between the two, the key never expires and that identity is locked out
// permanently. Doing both inside one script removes that window, and returns the
// live TTL so the caller can report an accurate reset time.
const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class ApiRateLimitService {
  private readonly logger = new Logger(ApiRateLimitService.name);
  /**
   * Per-process fallback. Only used when Redis is unavailable: a degraded limit
   * is better than no limit, but it is per-instance, so it is not the primary
   * path.
   */
  private readonly buckets = new Map<string, Bucket>();
  private redisUnavailableLogged = false;

  constructor(
    private readonly now: () => number = () => Date.now(),
    @Optional() @Inject(RATE_LIMIT_REDIS) private readonly redis?: RateLimitRedis,
  ) {}

  async consume(scope: string, identity: string, limitPerMinute: number): Promise<RateLimitState> {
    const limit = Math.max(1, limitPerMinute);
    const key = `ratelimit:${scope}:${identity}`;

    if (this.redis) {
      let counter: { count: number; ttlMs: number } | undefined;

      // Only the Redis round-trip is guarded. Evaluating the result must happen
      // OUTSIDE this try: RateLimitExceededError is the success case for a
      // blocked request, and catching it here would treat a legitimate 429 as a
      // Redis outage and then let the request through on the fallback counter.
      try {
        counter = await this.consumeFromRedis(key);
      } catch (error) {
        // Never let a Redis outage take the API down; fall back to the
        // per-process counter and say so once, loudly.
        if (!this.redisUnavailableLogged) {
          this.redisUnavailableLogged = true;
          this.logger.error(
            `Rate limiting fell back to per-process counters because Redis is unavailable: ${
              error instanceof Error ? error.message : 'unknown error'
            }. Limits are no longer shared across instances.`,
          );
        }
      }

      if (counter) {
        return this.evaluate(limit, counter);
      }
    }

    return this.consumeFromMemory(key, limit);
  }

  private async consumeFromRedis(key: string): Promise<{ count: number; ttlMs: number }> {
    const raw = (await this.redis!.eval(CONSUME_SCRIPT, 1, key, WINDOW_MS)) as [number, number];
    const [count, ttlMs] = raw;

    return { count: Number(count), ttlMs: Number(ttlMs) };
  }

  private evaluate(limit: number, result: { count: number; ttlMs: number }): RateLimitState {
    // A missing or already-expired TTL means the window just rolled; report a
    // full window rather than a negative reset.
    const resetSeconds =
      result.ttlMs > 0 ? Math.ceil(result.ttlMs / 1000) : Math.ceil(WINDOW_MS / 1000);

    if (result.count > limit) {
      throw new RateLimitExceededError(
        'Rate limit exceeded. Try again after the current one-minute window resets.',
        resetSeconds,
      );
    }

    return {
      limit,
      remaining: Math.max(0, limit - result.count),
      resetSeconds,
    };
  }

  private consumeFromMemory(key: string, limit: number): RateLimitState {
    const nowMs = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || nowMs - bucket.windowStartedAtMs >= WINDOW_MS) {
      this.buckets.set(key, { windowStartedAtMs: nowMs, count: 1 });

      return { limit, remaining: limit - 1, resetSeconds: WINDOW_MS / 1000 };
    }

    const resetSeconds = Math.ceil((WINDOW_MS - (nowMs - bucket.windowStartedAtMs)) / 1000);

    if (bucket.count >= limit) {
      throw new RateLimitExceededError(
        'Rate limit exceeded. Try again after the current one-minute window resets.',
        resetSeconds,
      );
    }

    bucket.count += 1;

    return { limit, remaining: limit - bucket.count, resetSeconds };
  }
}

export function writeRateLimitHeaders(
  response: RateLimitHeaderResponse | undefined,
  state: RateLimitState,
): void {
  if (!response) {
    return;
  }

  response.header('X-RateLimit-Limit', state.limit.toString());
  response.header('X-RateLimit-Remaining', state.remaining.toString());
  response.header('X-RateLimit-Reset', state.resetSeconds.toString());
}

export function requestIdentity(request: {
  ip?: string;
  headers?: Record<string, unknown>;
}): string {
  const forwardedFor = request.headers?.['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.ip ?? 'unknown';
}
