import { trace } from '@opentelemetry/api';
import { currentRequestId } from './request-context.js';

/**
 * Reports unhandled exceptions to a self-hosted GlitchTip instance.
 *
 * Written against GlitchTip's Sentry-compatible envelope endpoint rather than
 * using @sentry/node, for two concrete reasons:
 *
 * 1. @sentry/node bundles its own OpenTelemetry SDK plus
 *    import-in-the-middle. This service already runs an OTel SDK, and a second
 *    one would double-instrument and can break the traces we have. The
 *    ESM loader hook is also exactly the kind of thing K-11 is about.
 * 2. This payload leaves the box. Hand-writing it means the redaction rules are
 *    visible in one place and testable, rather than trusting an SDK's defaults
 *    to match ours.
 *
 * The trade-off is that we implement only what we need: exception grouping with
 * a stack trace, tagged with the request and trace ids. No breadcrumbs, no
 * source maps, no performance data - traces already cover the last of those.
 */

export interface ErrorReporterOptions {
  /** GlitchTip/Sentry DSN. Reporting is disabled when absent. */
  dsn?: string;
  environment?: string;
  release?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Bounds how long a report may block the response path. */
  timeoutMs?: number;
  onError?: (error: Error) => void;
}

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

/** Keys whose values are never sent, matched case-insensitively at any depth. */
const REDACTED_KEYS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'accesskey',
  'access_token',
  'refresh_token',
  'passwordhash',
  'sessionid',
  'email',
];

const REDACTED = '[redacted]';
const MAX_DEPTH = 4;

/**
 * A DSN looks like https://<publicKey>@host/<projectId>. The ingest URL is
 * derived from it, which is why this parses rather than taking a URL directly.
 */
export function parseDsn(dsn: string): ParsedDsn | undefined {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');

    if (!url.username || !projectId) {
      return undefined;
    }

    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return undefined;
  }
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redactValue(entry, depth + 1));
  }

  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = REDACTED_KEYS.includes(key.toLowerCase())
      ? REDACTED
      : redactValue(entry, depth + 1);
  }

  return output;
}

function frames(stack: string | undefined): Array<{ filename: string; function?: string }> {
  if (!stack) {
    return [];
  }

  // Sentry orders frames oldest-first; Node stacks are newest-first.
  return stack
    .split('\n')
    .slice(1, 51)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .map((line) => {
      const match = /^at\s+(.+?)\s+\((.+)\)$/.exec(line) ?? /^at\s+(.+)$/.exec(line);
      return match && match[2]
        ? { function: match[1], filename: match[2] }
        : { filename: match?.[1] ?? line };
    })
    .reverse();
}

export class ErrorReporter {
  private readonly dsn?: ParsedDsn;

  constructor(private readonly options: ErrorReporterOptions = {}) {
    this.dsn = options.dsn ? parseDsn(options.dsn) : undefined;
  }

  get enabled(): boolean {
    return this.dsn !== undefined;
  }

  /**
   * Builds the event body. Split out from sending so the redaction rules can be
   * asserted directly rather than through a fake HTTP server.
   */
  buildEvent(exception: unknown, context: Record<string, unknown> = {}): Record<string, unknown> {
    const error = exception instanceof Error ? exception : undefined;
    const spanContext = trace.getActiveSpan()?.spanContext();
    const requestId = currentRequestId();

    return {
      event_id: randomEventId(),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: 'error',
      logger: 'api-exception-filter',
      ...(this.options.environment ? { environment: this.options.environment } : {}),
      ...(this.options.release ? { release: this.options.release } : {}),
      exception: {
        values: [
          {
            type: error?.name ?? typeof exception,
            value: error?.message ?? String(exception),
            stacktrace: { frames: frames(error?.stack) },
          },
        ],
      },
      tags: {
        ...(requestId ? { request_id: requestId } : {}),
        // Links the grouped error straight to the trace that produced it.
        ...(spanContext && trace.isSpanContextValid(spanContext)
          ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
          : {}),
      },
      extra: redactValue(context) as Record<string, unknown>,
    };
  }

  /**
   * Sends an event. Never throws and never rejects: a failure to report an
   * error must not itself become an error on the response path.
   */
  async report(exception: unknown, context: Record<string, unknown> = {}): Promise<void> {
    if (!this.dsn) {
      return;
    }

    const event = this.buildEvent(exception, context);
    const envelope = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 2_000);
    timer.unref?.();

    try {
      const send = this.options.fetchImpl ?? fetch;
      await send(this.dsn.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${this.dsn.publicKey}, sentry_client=polycost/1`,
        },
        body: envelope,
        signal: controller.signal,
      } as RequestInit);
    } catch (error) {
      this.options.onError?.(error as Error);
    } finally {
      clearTimeout(timer);
    }
  }
}

function randomEventId(): string {
  // 32 hex characters, no dashes, per the Sentry event id format.
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
