import 'reflect-metadata';
import fastifyHelmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const config = app.get(ConfigService<AppConfig, true>);
  const allowedOrigins = config
    .get('CORS_ALLOWED_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(fastifyHelmet);
  app.enableCors({
    origin: allowedOrigins,
  });

  await app.listen({ port: config.get('PORT', { infer: true }), host: '0.0.0.0' });
}

void bootstrap();
