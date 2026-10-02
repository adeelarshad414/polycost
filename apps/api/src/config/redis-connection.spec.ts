import { describe, it, expect } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config.schema.js';
import { bullmqConnection, redisConnectionOptions } from './redis-connection.js';

function config(values: Partial<Record<keyof AppConfig, unknown>>) {
  return { get: (key: keyof AppConfig) => values[key] } as ConfigService<AppConfig, true>;
}

// Audit M-05: every Redis client used host and port only, so a managed Redis
// with AUTH or TLS could not be used.
describe('redisConnectionOptions', () => {
  it('stays host and port for the local compose Redis', () => {
    expect(redisConnectionOptions(config({ REDIS_HOST: 'redis', REDIS_PORT: 6379 }))).toEqual({
      host: 'redis',
      port: 6379,
    });
  });

  it('adds ACL credentials and TLS when configured', () => {
    expect(
      redisConnectionOptions(
        config({
          REDIS_HOST: 'cache.example',
          REDIS_PORT: 6380,
          REDIS_USERNAME: 'polycost',
          REDIS_PASSWORD: 's3cret',
          REDIS_TLS: true,
        }),
      ),
    ).toEqual({
      host: 'cache.example',
      port: 6380,
      username: 'polycost',
      password: 's3cret',
      tls: {},
    });
  });

  it('gives BullMQ the unlimited-retry connection its workers require', () => {
    expect(bullmqConnection(config({ REDIS_HOST: 'redis', REDIS_PORT: 6379 }))).toEqual({
      host: 'redis',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });
});
