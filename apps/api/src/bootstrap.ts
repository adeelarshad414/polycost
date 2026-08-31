import fastifyHelmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestContext,
} from './observability/request-context';
import { MetricsService, normalizeRoute } from './observability/metrics.service';

/**
 * Runtime wiring applied to an already-created Nest application.
 *
 * Kept out of main.ts so it can be tested without importing AppModule, which
 * validates the environment schema at import time.
 */
export type ConfigurableApp = Pick<
  NestFastifyApplication,
  'register' | 'enableCors' | 'enableShutdownHooks' | 'getHttpAdapter'
>;

interface RequestLike {
  headers?: Record<string, unknown>;
}

interface ReplyLike {
  header(name: string, value: string): unknown;
}

/**
 * Establishes a correlation id for the lifetime of each request and echoes it
 * back, so a caller reporting a problem can quote the id and it can be found in
 * the logs.
 *
 * Registered as an onRequest hook wrapping the rest of the lifecycle in
 * AsyncLocalStorage; every log line emitted downstream picks the id up
 * automatically.
 */
interface TimedRequest extends RequestLike {
  method?: string;
  url?: string;
  routeOptions?: { url?: string };
}

interface TimedReply {
  statusCode?: number;
}

/**
 * Records RED metrics for every request.
 *
 * Uses Fastify's onResponse hook so the status code and full duration are known.
 * The route template is preferred over the raw URL to keep label cardinality
 * bounded.
 */
export function registerMetricsHook(
  instance: {
    addHook(
      name: 'onRequest' | 'onResponse',
      handler: (req: TimedRequest, reply: TimedReply, done: () => void) => void,
    ): unknown;
  },
  metrics: MetricsService,
): void {
  const startTimes = new WeakMap<TimedRequest, bigint>();

  instance.addHook('onRequest', (request, _reply, done) => {
    startTimes.set(request, process.hrtime.bigint());
    done();
  });

  instance.addHook('onResponse', (request, reply, done) => {
    const startedAt = startTimes.get(request);
    const durationSeconds =
      startedAt === undefined ? 0 : Number(process.hrtime.bigint() - startedAt) / 1e9;

    metrics.observeRequest({
      method: request.method ?? 'UNKNOWN',
      route: request.routeOptions?.url ?? normalizeRoute(request.url ?? '/'),
      status: reply.statusCode ?? 0,
      durationSeconds,
    });
    done();
  });
}

export function registerRequestContext(instance: {
  addHook(
    name: 'onRequest',
    handler: (req: RequestLike, reply: ReplyLike, done: () => void) => void,
  ): unknown;
}): void {
  instance.addHook('onRequest', (request, reply, done) => {
    const requestId = resolveRequestId(request.headers?.[REQUEST_ID_HEADER]);
    reply.header(REQUEST_ID_HEADER, requestId);
    runWithRequestContext({ requestId }, done);
  });
}

export async function configureApp(
  app: ConfigurableApp,
  allowedOrigins: string[],
  metrics?: MetricsService,
): Promise<void> {
  const httpInstance = (
    app.getHttpAdapter() as { getInstance(): Parameters<typeof registerRequestContext>[0] }
  ).getInstance();

  registerRequestContext(httpInstance);

  if (metrics) {
    registerMetricsHook(httpInstance as never, metrics);
  }

  await app.register(fastifyHelmet);
  app.enableCors({
    origin: allowedOrigins,
  });

  // Nest disables shutdown hooks by default. Without this call none of the
  // onModuleDestroy implementations run on SIGTERM, which is what a container
  // orchestrator sends on every deploy, restart and scale-down. That would leave
  // Postgres pools unclosed and - more damaging - BullMQ workers undrained, so
  // in-flight jobs could be lost, or redelivered and processed twice.
  app.enableShutdownHooks();
}

export function corsOriginsFromConfig(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
