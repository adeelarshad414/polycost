import { PricingCacheService } from './pricing-cache.service.js';
import { PricingMatrixService } from './pricing-matrix.service.js';
import {
  PricingCompareV2Controller,
  PricingModelsController,
} from './pricing-models.controller.js';
import { PricingRateReader, PricingRateRecord } from './pricing-models.types.js';
import { PricingTermsService } from './pricing-terms.service.js';
import { RateResolverService } from './rate-resolver.service.js';
import { SpotEstimateService } from './spot-estimate.service.js';
import { ApiRateLimitService } from '../api/rate-limit.service.js';
import { RateLimitExceededError } from '../api/api-errors.js';

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
    const controller = pricingModelsController();
    const response = responseHeaders();

    await expect(
      controller.rate(
        'aws',
        'compute',
        {
          region: 'us-east',
          granularity: 'monthly',
        },
        requestIdentity(),
        response,
      ),
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
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
  });

  it('lists dynamic model/payment options for selector-driven UIs', async () => {
    const controller = pricingModelsController();
    const response = responseHeaders();

    await expect(
      controller.models('aws', 'compute', 'us-east', requestIdentity(), response),
    ).resolves.toMatchObject({
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
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
  });

  it('rate limits rate, model, and matrix reads by endpoint scope', async () => {
    const controller = pricingModelsController();
    const request = requestIdentity();

    await controller.rate('aws', 'compute', {}, request);
    await controller.rate('aws', 'compute', {}, request);
    await expect(controller.rate('aws', 'compute', {}, request)).rejects.toThrow(
      RateLimitExceededError,
    );

    await controller.models('aws', 'compute', 'us-east', request);
    await controller.models('aws', 'compute', 'us-east', request);
    await expect(controller.models('aws', 'compute', 'us-east', request)).rejects.toThrow(
      RateLimitExceededError,
    );

    await controller.matrix('aws', 'compute', 'us-east', request);
    await controller.matrix('aws', 'compute', 'us-east', request);
    await expect(controller.matrix('aws', 'compute', 'us-east', request)).rejects.toThrow(
      RateLimitExceededError,
    );
  });
});

describe('PricingCompareV2Controller', () => {
  it('adds a top-level v2 compare endpoint without changing legacy pricing compare', async () => {
    const controller = pricingCompareV2Controller();
    const response = responseHeaders();

    await expect(
      controller.compare(
        {
          services: '[compute]',
          region: 'us-east',
          pricingModel: 'on_demand',
          granularity: 'hourly',
        },
        requestIdentity(),
        response,
      ),
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
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
  });

  it('rate limits the top-level v2 compare endpoint by identity', async () => {
    const controller = pricingCompareV2Controller();
    const request = requestIdentity();

    await controller.compare({}, request);
    await controller.compare({}, request);
    await expect(controller.compare({}, request)).rejects.toThrow(RateLimitExceededError);
  });
});

function pricingModelsController(): PricingModelsController {
  return new PricingModelsController(service(), new ApiRateLimitService(() => 0), configService);
}

function pricingCompareV2Controller(): PricingCompareV2Controller {
  return new PricingCompareV2Controller(service(), new ApiRateLimitService(() => 0), configService);
}

function requestIdentity() {
  return {
    ip: '203.0.113.10',
    headers: {},
  };
}

function responseHeaders() {
  return {
    header: jest.fn(),
  };
}

const configService = {
  get: jest.fn((key: string) => {
    switch (key) {
      case 'RATE_LIMIT_COMPARISON_PER_MINUTE':
      case 'RATE_LIMIT_PUBLIC_READ_PER_MINUTE':
        return 2;
      default:
        return undefined;
    }
  }),
} as never;

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
