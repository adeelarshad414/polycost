import fastifyHelmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestContext,
} from './observability/request-context';

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

export async function configureApp(app: ConfigurableApp, allowedOrigins: string[]): Promise<void> {
  registerRequestContext(
    (
      app.getHttpAdapter() as { getInstance(): Parameters<typeof registerRequestContext>[0] }
    ).getInstance(),
  );

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
