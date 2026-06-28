import { Injectable } from '@nestjs/common';
import { RateLimitExceededError } from './api-errors';

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

const WINDOW_MS = 60_000;

@Injectable()
export class ApiRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  consume(scope: string, identity: string, limitPerMinute: number): RateLimitState {
    const limit = Math.max(1, limitPerMinute);
    const nowMs = this.now();
    const key = `${scope}:${identity}`;
    const bucket = this.buckets.get(key);

    if (!bucket || nowMs - bucket.windowStartedAtMs >= WINDOW_MS) {
      this.buckets.set(key, {
        windowStartedAtMs: nowMs,
        count: 1,
      });
      return {
        limit,
        remaining: limit - 1,
        resetSeconds: WINDOW_MS / 1000,
      };
    }

    const resetSeconds = Math.ceil((WINDOW_MS - (nowMs - bucket.windowStartedAtMs)) / 1000);

    if (bucket.count >= limit) {
      throw new RateLimitExceededError(
        'Rate limit exceeded. Try again after the current one-minute window resets.',
        resetSeconds,
      );
    }

    bucket.count += 1;

    return {
      limit,
      remaining: limit - bucket.count,
      resetSeconds,
    };
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
