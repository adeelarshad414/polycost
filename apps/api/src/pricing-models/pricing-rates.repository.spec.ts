import { describe, it, expect, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { SecretsReader } from '../secrets/secrets.service.js';
import { PostgresPricingRatesRepository } from './pricing-rates.repository.js';

const configService = {
  get: jest.fn<ConfigService['get']>((key: keyof AppConfig) => {
    switch (key) {
      case 'DB_HOST':
        return 'postgres';
      case 'DB_PORT':
        return 5432;
      case 'DB_NAME':
        return 'polycost_dev';
      default:
        return undefined;
    }
  }),
} as unknown as ConfigService<AppConfig, true>;

const secretsReader: SecretsReader = {
  getSecret: jest.fn<SecretsReader['getSecret']>(async () => 'secret'),
};

describe('PostgresPricingRatesRepository', () => {
  it('uses distinct effective fallback rates for reserved payment options', async () => {
    const repository = new PostgresPricingRatesRepository(
      configService,
      secretsReader,
      () =>
        ({
          query: jest.fn(async () => ({
            rows: [],
            rowCount: 0,
          })),
          end: jest.fn(),
        }) as never,
    );

    const noUpfront = await repository.findCurrentRate({
      provider: 'aws',
      service: 'compute',
      region: 'us-east-1',
      termCode: 'reserved_3yr',
      paymentOptionCode: 'no_upfront',
    });
    const partialUpfront = await repository.findCurrentRate({
      provider: 'aws',
      service: 'compute',
      region: 'us-east-1',
      termCode: 'reserved_3yr',
      paymentOptionCode: 'partial_upfront',
    });
    const allUpfront = await repository.findCurrentRate({
      provider: 'aws',
      service: 'compute',
      region: 'us-east-1',
      termCode: 'reserved_3yr',
      paymentOptionCode: 'all_upfront',
    });

    expect(noUpfront?.hourlyRateUsd).toBeGreaterThan(partialUpfront?.hourlyRateUsd ?? 0);
    expect(partialUpfront?.hourlyRateUsd).toBeGreaterThan(allUpfront?.hourlyRateUsd ?? 0);
    expect(allUpfront).toMatchObject({
      isEstimate: true,
      source: 'modeled-estimate',
      unavailableReason: expect.stringContaining('No current pricing_rates row'),
    });
  });

  // H-07: a database outage used to return a modeled rate silently, stamped
  // with sourceFetchedAt = now, so it looked like a freshly fetched price.
  it('logs, counts and does not timestamp a fallback when the catalog is unreachable', async () => {
    const metrics = new MetricsService();
    const domainMetrics = new DomainMetricsService(metrics);
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const repository = new PostgresPricingRatesRepository(
      configService,
      secretsReader,
      () =>
        ({
          query: jest.fn(async () => {
            throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
          }),
          end: jest.fn(),
        }) as never,
      domainMetrics,
    );

    const rate = await repository.findCurrentRate({
      provider: 'gcp',
      service: 'compute',
      region: 'us-central1',
      termCode: 'on_demand',
    });

    expect(rate).toMatchObject({
      source: 'modeled-estimate',
      isEstimate: true,
      sourceFetchedAt: null,
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pricing_rate_fallback',
        reason: 'schema_or_connection_unavailable',
        provider: 'gcp',
        error: expect.stringContaining('ECONNREFUSED'),
      }),
    );
    expect(await metrics.registry.metrics()).toContain(
      'pricing_rate_fallbacks_total{provider="gcp",reason="schema_or_connection_unavailable"} 1',
    );
    errorLog.mockRestore();
  });

  it('counts a cache miss without logging an error', async () => {
    const metrics = new MetricsService();
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const repository = new PostgresPricingRatesRepository(
      configService,
      secretsReader,
      () => ({ query: jest.fn(async () => ({ rows: [], rowCount: 0 })), end: jest.fn() }) as never,
      new DomainMetricsService(metrics),
    );

    const rate = await repository.findCurrentRate({
      provider: 'aws',
      service: 'compute',
      region: 'us-east-1',
      termCode: 'on_demand',
    });

    expect(rate?.sourceFetchedAt).toBeNull();
    expect(errorLog).not.toHaveBeenCalled();
    expect(await metrics.registry.metrics()).toContain(
      'pricing_rate_fallbacks_total{provider="aws",reason="not_cached"} 1',
    );
    errorLog.mockRestore();
  });
});
