import { PricingCacheService } from './pricing-cache.service';
import { PricingMatrixService } from './pricing-matrix.service';
import {
  PricingCompareV2Controller,
  PricingModelsController,
} from './pricing-models.controller';
import { PricingRateReader, PricingRateRecord } from './pricing-models.types';
import { PricingTermsService } from './pricing-terms.service';
import { RateResolverService } from './rate-resolver.service';
import { SpotEstimateService } from './spot-estimate.service';

const rate: PricingRateRecord = {
  provider: 'aws',
  service: 'general-purpose',
  skuId: '11111111-1111-4111-8111-111111111111',
  providerSkuId: 'm7i.large',
  region: 'us-east-1',
  termCode: 'on_demand',
  hourlyRateUsd: 0.1,
  currency: 'USD',
  isEstimate: false,
  sourceFetchedAt: '2026-06-30T00:00:00.000Z',
  validFrom: '2026-06-30T00:00:00.000Z',
  source: 'pricing_rates',
};

describe('PricingModelsController', () => {
  it('returns schemaVersion 2 rate payloads for the additive provider/service endpoint', async () => {
    const controller = new PricingModelsController(service());

    await expect(
      controller.rate('aws', 'compute', {
        region: 'us-east',
        granularity: 'monthly',
      }),
    ).resolves.toMatchObject({
      schemaVersion: 2,
      provider: 'aws',
      region: 'us-east-1',
      pricingTerm: {
        code: 'on_demand',
      },
      intervals: {
        monthly: 73,
      },
    });
  });

  it('lists dynamic model/payment options for selector-driven UIs', () => {
    const controller = new PricingModelsController(service());

    expect(controller.models('aws', 'compute', 'us-east')).toMatchObject({
      schemaVersion: 2,
      provider: 'aws',
      region: 'us-east-1',
      models: expect.arrayContaining([
        expect.objectContaining({
          code: 'reserved_3yr',
          requiresPaymentOption: true,
          defaultPaymentOption: 'no_upfront',
        }),
        expect.objectContaining({
          code: 'spot_estimate',
          isEstimateOnly: true,
        }),
      ]),
    });
  });
});

describe('PricingCompareV2Controller', () => {
  it('adds a top-level v2 compare endpoint without changing legacy pricing compare', async () => {
    const controller = new PricingCompareV2Controller(service());

    await expect(
      controller.compare({
        services: '[compute]',
        region: 'us-east',
        pricingModel: 'on_demand',
        granularity: 'hourly',
      }),
    ).resolves.toMatchObject({
      schemaVersion: 2,
      services: ['compute'],
      granularity: 'hourly',
      pricingModel: 'on_demand',
      providers: expect.arrayContaining([
        expect.objectContaining({
          provider: 'aws',
          rate: expect.objectContaining({
            schemaVersion: 2,
            amountUsd: 0.1,
          }),
        }),
      ]),
    });
  });
});

function service(): PricingMatrixService {
  const pricingTermsService = new PricingTermsService();
  const cacheService = new PricingCacheService();
  const rateResolver = new RateResolverService(reader(), pricingTermsService, cacheService);
  const spotEstimateService = new SpotEstimateService(rateResolver, cacheService);

  return new PricingMatrixService(
    pricingTermsService,
    rateResolver,
    spotEstimateService,
    cacheService,
  );
}

function reader(): PricingRateReader {
  return {
    findCurrentRate: jest.fn(async (query) => ({
      ...rate,
      provider: query.provider,
      region: query.region,
      termCode: query.termCode,
      ...(query.paymentOptionCode ? { paymentOptionCode: query.paymentOptionCode } : {}),
    })),
  };
}
