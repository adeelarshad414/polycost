import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';

export interface TracingOptions {
  /** OTLP/HTTP traces endpoint, e.g. http://collector:4318/v1/traces. */
  endpoint: string;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  /** 0..1. Applied to root spans only; children follow the parent's decision. */
  sampleRatio?: number;
  /** Injected by tests so spans can be asserted without a collector. */
  exporter?: SpanExporter;
}

/** Health and metrics endpoints are polled constantly and would swamp traces. */
const UNTRACED_PATHS = ['/health', '/health/live', '/health/ready', '/health/deep', '/metrics'];

let sdk: NodeSDK | undefined;

/**
 * Starts OpenTelemetry tracing.
 *
 * Deliberately takes explicit options rather than reading the environment: this
 * module must be importable by tests, and everything under apps/api/src is
 * barred from reading environment variables directly, so that the only
 * configuration surface is the validated schema. The deployment entry point
 * (apps/api/otel-register.cjs) owns that read and calls in here.
 *
 * Must run before anything requires pg, fastify or ioredis, because
 * instrumentation works by patching those modules as they load.
 */
export function startTracing(options: TracingOptions): NodeSDK | undefined {
  if (sdk) {
    return sdk;
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName ?? 'polycost-api',
      ...(options.serviceVersion ? { [ATTR_SERVICE_VERSION]: options.serviceVersion } : {}),
      ...(options.environment ? { [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: options.environment } : {}),
    }),
    traceExporter: options.exporter ?? new OTLPTraceExporter({ url: options.endpoint }),
    sampler: buildSampler(options.sampleRatio),
    instrumentations: [
      new HttpInstrumentation({
        // Without this every readiness probe and Prometheus scrape becomes a
        // trace, burying real requests and inflating export volume.
        ignoreIncomingRequestHook: (request) => isUntracedPath(request.url),
      }),
      new FastifyInstrumentation(),
      new PgInstrumentation({
        // Statement text can embed literals; the operation and table are on the
        // span already. Kept off so traces cannot leak row data.
        enhancedDatabaseReporting: false,
      }),
      new IORedisInstrumentation(),
      // Provider adapters call global fetch, which is undici - not the http
      // module - so without this every outbound pricing call is invisible.
      new UndiciInstrumentation(),
    ],
  });

  sdk.start();
  return sdk;
}

export function isUntracedPath(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  const path = url.split('?')[0];
  return UNTRACED_PATHS.includes(path);
}

/**
 * Parent-based so a sampled upstream request stays sampled end to end. Sampling
 * children independently would produce broken traces with missing spans.
 */
export function buildSampler(sampleRatio: number | undefined) {
  const ratio = sampleRatio === undefined || !Number.isFinite(sampleRatio) ? 1 : sampleRatio;
  const clamped = Math.min(1, Math.max(0, ratio));

  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(clamped) });
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }

  const active = sdk;
  sdk = undefined;
  await active.shutdown();
}

/** Test seam: the module-level SDK is process-wide state. */
export function resetTracingForTests(): void {
  sdk = undefined;
}
