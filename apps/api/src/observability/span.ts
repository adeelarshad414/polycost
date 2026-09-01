import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';

const tracer = trace.getTracer('polycost-api');

/**
 * Runs work inside a named span.
 *
 * Auto-instrumentation already covers HTTP, Postgres, Redis and outbound fetch.
 * This is for the spans it cannot name: a pricing refresh is one logical unit
 * made of many calls, and without a parent span the trace is a flat list of
 * requests with no indication of which provider they belonged to.
 *
 * When tracing is disabled the OTel API supplies a no-op tracer, so this stays
 * a thin pass-through rather than something callers must guard.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  work: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await work();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Recorded before rethrowing so the span carries the failure even though
      // the caller handles the error itself.
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
