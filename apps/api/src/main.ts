import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { setProviderHttpDefaults } from './adapters/common/http-client';
import { configureApp, corsOriginsFromConfig } from './bootstrap';
import { MetricsService } from './observability/metrics.service';
import { StructuredLogger } from './observability/structured-logger';
import type { AppConfig } from './config/config.schema';
import { DIAGRAM_JSON_BODY_MAX_BYTES } from './diagram-parser/diagram-parser.types';

async function bootstrap() {
  // bufferLogs holds startup output until the configured logger is attached, so
  // nothing emitted during module init is lost. The logger needs ConfigService,
  // which only exists once the app is created - buffering resolves that ordering
  // without reading the environment directly.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: DIAGRAM_JSON_BODY_MAX_BYTES }),
    { bufferLogs: true },
  );
  const config = app.get(ConfigService<AppConfig, true>);

  app.useLogger(
    new StructuredLogger({
      level: config.get('LOG_LEVEL', { infer: true }),
      pretty: config.get('LOG_PRETTY', { infer: true }),
    }),
  );

  // Seed the outbound HTTP limits from validated config before anything can make
  // a provider call.
  setProviderHttpDefaults({
    timeoutMs: config.get('PROVIDER_HTTP_TIMEOUT_MS', { infer: true }),
    bodyTimeoutMs:
      config.get('PROVIDER_HTTP_BODY_TIMEOUT_MS', { infer: true }) ??
      config.get('PROVIDER_HTTP_TIMEOUT_MS', { infer: true }),
    maxResponseBytes: config.get('PROVIDER_HTTP_MAX_RESPONSE_BYTES', { infer: true }),
  });

  await configureApp(
    app,
    corsOriginsFromConfig(config.get('CORS_ALLOWED_ORIGINS', { infer: true })),
    app.get(MetricsService),
  );

  await app.listen({ port: config.get('PORT', { infer: true }), host: '0.0.0.0' });
}

void bootstrap();
