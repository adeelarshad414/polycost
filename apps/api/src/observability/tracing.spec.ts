import { describe, it, expect, afterEach, afterAll } from '@jest/globals';
import { SpanStatusCode, context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { buildSampler, isUntracedPath } from './tracing.js';
import { withSpan } from './span.js';
import { StructuredLogger } from './structured-logger.js';

describe('trace sampling', () => {
  it('samples everything by default', () => {
    expect(buildSampler(undefined).toString()).toContain('1');
  });

  it('clamps a ratio outside 0..1 rather than throwing', () => {
    // The value arrives from an environment variable, so it is not trusted.
    expect(() => buildSampler(5)).not.toThrow();
    expect(() => buildSampler(-1)).not.toThrow();
    expect(buildSampler(Number.NaN).toString()).toContain('1');
  });

  it('is parent-based so a sampled request stays sampled end to end', () => {
    // Sampling children independently produces traces with holes in them.
    expect(buildSampler(0.1).toString()).toContain('ParentBased');
  });
});

describe('isUntracedPath', () => {
  it.each(['/health', '/health/live', '/health/ready', '/health/deep', '/metrics'])(
    'excludes %s, which is polled constantly',
    (path) => {
      expect(isUntracedPath(path)).toBe(true);
    },
  );

  it('ignores the query string when matching', () => {
    expect(isUntracedPath('/metrics?format=text')).toBe(true);
  });

  it('traces real endpoints', () => {
    expect(isUntracedPath('/api/v1/comparisons')).toBe(false);
    expect(isUntracedPath('/api/v1/health-report')).toBe(false);
  });

  it('handles a missing url', () => {
    expect(isUntracedPath(undefined)).toBe(false);
  });
});

// The context manager has to be installed as well as the provider: without it
// startActiveSpan cannot propagate and every span comes out parentless.
// NodeSDK does both in production; BasicTracerProvider.register() was removed
// in SDK 2.x, so it is done explicitly here.
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);
trace.setGlobalTracerProvider(provider);

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
});

describe('withSpan', () => {
  it('records a named span with its attributes', async () => {
    await withSpan(
      'pricing_etl.refresh_provider',
      { 'polycost.provider': 'aws' },
      async () => 'ok',
    );

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('pricing_etl.refresh_provider');
    expect(span.attributes['polycost.provider']).toBe('aws');
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it('returns the wrapped value', async () => {
    await expect(withSpan('work', {}, async () => 42)).resolves.toBe(42);
  });

  it('marks the span failed and rethrows', async () => {
    await expect(
      withSpan('work', {}, async () => {
        throw new Error('provider down');
      }),
    ).rejects.toThrow('provider down');

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe('provider down');
    expect(span.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('ends the span even when the work throws', async () => {
    await expect(
      withSpan('work', {}, async () => Promise.reject(new Error('x'))),
    ).rejects.toThrow();

    // An unended span is never exported, so a failing code path would go
    // missing from the trace entirely.
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  it('nests child spans under the active parent', async () => {
    await withSpan('parent', {}, async () => {
      await withSpan('child', {}, async () => undefined);
    });

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((span) => span.name === 'parent');
    const child = spans.find((span) => span.name === 'child');

    expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
    expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
  });
});

describe('log and trace correlation', () => {
  function captureLogs() {
    const lines: Record<string, unknown>[] = [];
    const logger = new StructuredLogger({
      destination: {
        write(chunk: string) {
          lines.push(JSON.parse(chunk) as Record<string, unknown>);
        },
      },
    });

    return { logger, lines };
  }

  it('stamps the active trace and span id onto log lines', async () => {
    const { logger, lines } = captureLogs();

    await withSpan('parent', {}, async () => {
      logger.log('refreshing pricing');
    });

    // Without a shared key, an operator has to correlate logs and traces by
    // timestamp.
    const [line] = lines;
    const [span] = exporter.getFinishedSpans();
    expect(line.traceId).toBe(span.spanContext().traceId);
    expect(line.spanId).toBe(span.spanContext().spanId);
  });

  it('omits the fields entirely when no span is active', () => {
    const { logger, lines } = captureLogs();

    context.with(trace.deleteSpan(context.active()), () => {
      logger.log('outside any request');
    });

    // Deployments without a collector must keep their existing log shape.
    expect(lines[0]).not.toHaveProperty('traceId');
    expect(lines[0]).not.toHaveProperty('spanId');
  });

  it('still redacts secrets on a traced line', async () => {
    const { logger, lines } = captureLogs();

    await withSpan('parent', {}, async () => {
      logger.log({ message: 'auth', token: 'super-secret-value' });
    });

    expect(lines[0].traceId).toEqual(expect.any(String));
    expect(lines[0].token).toBe('[redacted]');
    expect(JSON.stringify(lines[0])).not.toContain('super-secret-value');
  });
});
