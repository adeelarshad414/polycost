import { describe, it, expect, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
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
});
