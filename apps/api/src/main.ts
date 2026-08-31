import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp, corsOriginsFromConfig } from './bootstrap';
import type { AppConfig } from './config/config.schema';
import { DIAGRAM_JSON_BODY_MAX_BYTES } from './diagram-parser/diagram-parser.types';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: DIAGRAM_JSON_BODY_MAX_BYTES }),
  );
  const config = app.get(ConfigService<AppConfig, true>);

  await configureApp(
    app,
    corsOriginsFromConfig(config.get('CORS_ALLOWED_ORIGINS', { infer: true })),
  );

  await app.listen({ port: config.get('PORT', { infer: true }), host: '0.0.0.0' });
}

void bootstrap();
