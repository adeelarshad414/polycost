/**
 * OpenTelemetry bootstrap, loaded with `node --import ./otel-register.mjs`.
 *
 * Three reasons this lives outside src rather than being an import in main.ts:
 *
 * 1. Instrumentation patches pg, fastify and ioredis as they are loaded, so it
 *    has to run before the application graph does. --import guarantees that.
 * 2. apps/api/src is barred from reading process.env directly, so that the only
 *    configuration surface is the validated zod schema. Deciding whether
 *    tracing is on is a deployment concern, and this is the deployment edge.
 * 3. It must register the ESM loader hook, and that has to happen from a module
 *    that runs before everything else.
 *
 * The loader hook is the part that is easy to get wrong and impossible to
 * notice. ESM has no require cache for OpenTelemetry to monkey-patch, so
 * without `register('@opentelemetry/instrumentation/hook.mjs')` the SDK starts
 * cleanly, reports healthy, and instruments nothing at all. There is a test for
 * exactly that in tracing-esm.spec.ts.
 *
 * Tracing is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set. Defaulting it on
 * would make every deployment without a collector retry exports forever.
 */
import { register } from 'node:module';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const disabled = String(process.env.OTEL_SDK_DISABLED).toLowerCase() === 'true';

if (endpoint && !disabled) {
  const sampleRatio = Number.parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? '');

  try {
    // Must come before the SDK starts and before the app graph is imported:
    // this is what lets the instrumentations see ESM imports at all.
    register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

    // Resolved relative to this file so it works from any working directory.
    const { startTracing } = await import('./dist/observability/tracing.js');

    startTracing({
      endpoint: endpoint.endsWith('/v1/traces')
        ? endpoint
        : `${endpoint.replace(/\/$/, '')}/v1/traces`,
      serviceName: process.env.OTEL_SERVICE_NAME || 'polycost-api',
      serviceVersion: process.env.npm_package_version,
      environment: process.env.NODE_ENV,
      sampleRatio: Number.isFinite(sampleRatio) ? sampleRatio : undefined,
    });
  } catch (error) {
    // Never stop the service starting because telemetry could not initialise.
    // A silent boot failure here is far worse than missing traces.
    console.error('[otel] tracing failed to start; continuing without it:', error.message);
  }
}

// Spans are batched, so they are flushed from the app's Nest shutdown hook in
// src/main.ts rather than from a signal handler here - two handlers racing the
// same SIGTERM would risk exiting before the export completed.
