import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config.schema.js';

/**
 * Redis connection options shared by every client (audit M-05).
 *
 * The BullMQ queues, workers and the rate-limit client each built
 * `{ host, port }` on their own, so a Redis that requires AUTH or TLS - every
 * managed Redis - could not be used at all.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function redisConnectionOptions(
  configService: Pick<ConfigService<AppConfig, true>, 'get'>,
): RedisConnectionOptions {
  const username = configService.get('REDIS_USERNAME', { infer: true });
  const password = configService.get('REDIS_PASSWORD', { infer: true });

  return {
    host: configService.get('REDIS_HOST', { infer: true }),
    port: configService.get('REDIS_PORT', { infer: true }),
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(configService.get('REDIS_TLS', { infer: true }) ? { tls: {} } : {}),
  };
}

/**
 * BullMQ requires `maxRetriesPerRequest: null` on worker connections: a
 * blocking command that gives up after N retries would silently stop the
 * worker from receiving jobs.
 */
export function bullmqConnection(configService: Pick<ConfigService<AppConfig, true>, 'get'>) {
  return { ...redisConnectionOptions(configService), maxRetriesPerRequest: null };
}
