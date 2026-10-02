import { describe, it, expect, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { SecretsReader } from '../secrets/secrets.service.js';
import { PostgresPricingRatesRepository } from '../pricing-models/pricing-rates.repository.js';
import { pgPoolTuning } from './pg-pool-options.js';

function config(values: Partial<Record<keyof AppConfig, unknown>>) {
  return { get: (key: keyof AppConfig) => values[key] } as ConfigService<AppConfig, true>;
}

// Audit M-06: pools used node-postgres defaults - 10 connections each, no
// timeouts, no TLS.
describe('pgPoolTuning', () => {
  it('bounds the pool and every statement by default', () => {
    expect(pgPoolTuning(config({}), 'api')).toEqual({
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      application_name: 'polycost-api',
    });
  });

  it('gives the ETL pool its longer statement timeout', () => {
    expect(
      pgPoolTuning(
        config({ DB_STATEMENT_TIMEOUT_MS: 10_000, DB_ETL_STATEMENT_TIMEOUT_MS: 600_000 }),
        'pricing_catalog',
      ),
    ).toMatchObject({ statement_timeout: 600_000, application_name: 'polycost-pricing_catalog' });
  });

  it.each([
    ['disable', undefined, undefined],
    ['require', undefined, { rejectUnauthorized: false }],
    ['verify-full', undefined, { rejectUnauthorized: true }],
    ['verify-full', 'PEM', { rejectUnauthorized: true, ca: 'PEM' }],
  ])('maps DB_SSL_MODE=%s (CA %s) to node-postgres ssl options', (mode, ca, expected) => {
    expect(pgPoolTuning(config({ DB_SSL_MODE: mode, DB_SSL_CA: ca }), 'api').ssl).toEqual(expected);
  });

  it('reaches the Pool a repository creates', async () => {
    const factory = jest.fn<(config: unknown) => unknown>(() => ({
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      end: jest.fn(),
    }));
    const secrets: SecretsReader = {
      getSecret: jest.fn<SecretsReader['getSecret']>(async () => 'secret'),
    };
    const repository = new PostgresPricingRatesRepository(
      config({ DB_HOST: 'db', DB_PORT: 5432, DB_NAME: 'polycost', DB_POOL_MAX: 7 }),
      secrets,
      factory as never,
    );

    await repository.findCurrentRate({
      provider: 'aws',
      service: 'compute',
      region: 'us-east-1',
      termCode: 'on_demand',
    });

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'db',
        max: 7,
        statement_timeout: 30_000,
        application_name: 'polycost-pricing_rates',
      }),
    );
  });
});
