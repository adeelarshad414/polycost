/**
 * OpenTelemetry bootstrap, loaded with `node --require ./otel-register.cjs`.
 *
 * Two reasons this lives outside src rather than being an import in main.ts:
 *
 * 1. Instrumentation patches pg, fastify and ioredis as they are required, so
 *    it has to run before the application graph loads. --require guarantees
 *    that; an import only happens to work because the API is CommonJS.
 * 2. apps/api/src is barred from reading process.env directly, so that the only
 *    configuration surface is the validated zod schema. Deciding whether
 *    tracing is on is a deployment concern, and this is the deployment edge.
 *
 * Tracing is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set. Defaulting it on
 * would make every deployment without a collector retry exports forever.
 */
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!endpoint) {
  return;
}

if (String(process.env.OTEL_SDK_DISABLED).toLowerCase() === 'true') {
  return;
}

const sampleRatio = Number.parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? '');

try {
  // Resolved relative to this file so it works from any working directory.
  const { startTracing } = require('./dist/observability/tracing');

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

// Spans are batched, so they are flushed from the app's Nest shutdown hook in
// src/main.ts rather than from a signal handler here - two handlers racing the
// same SIGTERM would risk exiting before the export completed.
