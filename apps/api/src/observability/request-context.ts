import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  /** Correlates every log line emitted while handling one request. */
  requestId: string;
}

/**
 * Request-scoped context.
 *
 * AsyncLocalStorage rather than a Nest request-scoped provider: the logger is
 * used from services, repositories and background helpers that are singletons,
 * and making them request-scoped would force Nest to re-instantiate the whole
 * dependency chain per request.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export const REQUEST_ID_HEADER = 'x-request-id';

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Reuses an inbound correlation id when a proxy or upstream service supplies
 * one, so a single id can span services. Falls back to a fresh UUID.
 *
 * The inbound value is length-capped and stripped of anything outside a safe
 * charset: it is attacker-controlled and ends up in log output, where a newline
 * would let a caller forge extra log lines.
 */
export function resolveRequestId(headerValue: unknown): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof candidate === 'string') {
    const sanitized = candidate.trim().replace(/[^A-Za-z0-9._-]/g, '');

    if (sanitized.length > 0) {
      return sanitized.slice(0, 128);
    }
  }

  return randomUUID();
}
