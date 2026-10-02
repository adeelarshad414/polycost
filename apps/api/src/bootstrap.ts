import fastifyHelmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestContext,
} from './observability/request-context.js';
import { MetricsService, normalizeRoute } from './observability/metrics.service.js';

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
  logger?: { log(message: unknown, context?: string): void },
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

    const method = request.method ?? 'UNKNOWN';
    const route = request.routeOptions?.url ?? normalizeRoute(request.url ?? '/');
    const status = reply.statusCode ?? 0;

    metrics.observeRequest({ method, route, status, durationSeconds });

    // One access line per request. Until this existed the service logged only
    // at startup and from background jobs, so requestId and traceId had almost
    // nothing to correlate and an incident left no per-request trail at all.
    //
    // Probes and scrapes are skipped: they are polled constantly and would be
    // the overwhelming majority of the log volume, for the same reason they are
    // excluded from tracing.
    if (logger && !isProbeRoute(route)) {
      logger.log(
        {
          event: 'http_request',
          method,
          // The normalised route, never the raw URL - it can carry ids and
          // query values into the log sink.
          route,
          status,
          durationMs: Math.round(durationSeconds * 1000),
        },
        'HttpRequest',
      );
    }

    done();
  });
}

const PROBE_ROUTES = new Set([
  '/metrics',
  '/health',
  '/health/live',
  '/health/ready',
  '/health/deep',
  '/api/v1/health/live',
  '/api/v1/health/ready',
  '/api/v1/health/deep',
]);

export function isProbeRoute(route: string): boolean {
  return PROBE_ROUTES.has(route);
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

/**
 * Unauthenticated credential routes that carry a few short strings. The global
 * body limit is sized for diagram uploads (8 MB), which let anyone post 8 MB of
 * JSON at login before any validation ran (audit H-03).
 */
export const CREDENTIAL_ROUTE_BODY_LIMIT_BYTES = 16 * 1024;
const CREDENTIAL_ROUTES = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/password',
  '/api/v1/auth/invitations/accept',
]);

interface RouteOptionsLike {
  url?: string;
  bodyLimit?: number;
}

/**
 * Lowers the body limit on credential routes. Must be installed before Nest
 * registers routes, i.e. before app.init()/listen(), because onRoute only sees
 * routes added after it.
 */
export function registerCredentialBodyLimits(instance: {
  addHook(name: 'onRoute', handler: (route: RouteOptionsLike) => void): unknown;
}): void {
  instance.addHook('onRoute', (route) => {
    if (route.url && CREDENTIAL_ROUTES.has(route.url)) {
      route.bodyLimit = CREDENTIAL_ROUTE_BODY_LIMIT_BYTES;
    }
  });
}

export async function configureApp(
  app: ConfigurableApp,
  allowedOrigins: string[],
  metrics?: MetricsService,
  requestLogger?: { log(message: unknown, context?: string): void },
): Promise<void> {
  const httpInstance = (
    app.getHttpAdapter() as { getInstance(): Parameters<typeof registerRequestContext>[0] }
  ).getInstance();

  registerRequestContext(httpInstance);
  registerCredentialBodyLimits(httpInstance as never);

  if (metrics) {
    registerMetricsHook(httpInstance as never, metrics, requestLogger);
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
