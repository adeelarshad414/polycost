import fastifyHelmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Runtime wiring applied to an already-created Nest application.
 *
 * Kept out of main.ts so it can be tested without importing AppModule, which
 * validates the environment schema at import time.
 */
export type ConfigurableApp = Pick<
  NestFastifyApplication,
  'register' | 'enableCors' | 'enableShutdownHooks'
>;

export async function configureApp(app: ConfigurableApp, allowedOrigins: string[]): Promise<void> {
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
