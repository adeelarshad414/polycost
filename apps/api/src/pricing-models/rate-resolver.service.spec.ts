import { ApiValidationError } from '../api/api-errors';
import { PricingCacheService } from './pricing-cache.service';
import { PricingRateReader, PricingRateRecord } from './pricing-models.types';
import { PricingTermsService } from './pricing-terms.service';
import { intervalsFromHourlyRate, RateResolverService } from './rate-resolver.service';

const currentRate: PricingRateRecord = {
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

describe('RateResolverService', () => {
  it('derives all granularities from the hourly base rate using the 730-hour month', () => {
    expect(intervalsFromHourlyRate(0.1)).toEqual({
      hourly: 0.1,
      daily: 2.4,
      weekly: 16.8,
      monthly: 73,
      yearly: 876,
    });
  });

  it('resolves requested granularity from cached hourly pricing rows', async () => {
    const reader = readerMock(currentRate);
    const service = resolver(reader);

    await expect(
      service.resolveRate({
        provider: 'aws',
        service: 'compute',
        region: 'us-east-1',
        termCode: 'on_demand',
        granularity: 'yearly',
      }),
    ).resolves.toEqual({
      schemaVersion: 2,
      provider: 'aws',
      service: 'general-purpose',
      skuId: currentRate.skuId,
      providerSkuId: 'm7i.large',
      region: 'us-east-1',
      pricingTerm: {
        code: 'on_demand',
        label: 'On-demand',
        requiresPaymentOption: false,
        isEstimateOnly: false,
      },
      granularity: 'yearly',
      hourlyRateUsd: 0.1,
      amountUsd: 876,
      currency: 'USD',
      intervals: {
        hourly: 0.1,
        daily: 2.4,
        weekly: 16.8,
        monthly: 73,
        yearly: 876,
      },
      isEstimate: false,
      lastFetchedAt: '2026-06-30T00:00:00.000Z',
      validFrom: '2026-06-30T00:00:00.000Z',
      source: 'pricing_rates',
    });
    expect(reader.findCurrentRate).toHaveBeenCalledWith({
      provider: 'aws',
      service: 'compute',
      region: 'us-east-1',
      termCode: 'on_demand',
    });
  });

  it('requires explicit payment options for reserved and savings terms', async () => {
    const service = resolver(readerMock(currentRate));

    await expect(
      service.resolveRate({
        provider: 'aws',
        service: 'compute',
        region: 'us-east-1',
        termCode: 'reserved_3yr',
        granularity: 'monthly',
      }),
    ).rejects.toThrow(ApiValidationError);
  });

  it('attaches unavailable metadata for transparent fallback estimates', async () => {
    const service = resolver(
      readerMock({
        ...currentRate,
        termCode: 'reserved_1yr',
        paymentOptionCode: 'no_upfront',
        source: 'modeled-estimate',
        isEstimate: true,
        unavailableReason: 'No current pricing_rates row was found.',
      }),
    );

    await expect(
      service.resolveRate({
        provider: 'aws',
        service: 'compute',
        region: 'us-east-1',
        termCode: 'reserved_1yr',
        paymentOptionCode: 'no_upfront',
        granularity: 'monthly',
      }),
    ).resolves.toMatchObject({
      unavailable: true,
      reason: 'No current pricing_rates row was found.',
      isEstimate: true,
      source: 'modeled-estimate',
      paymentOption: {
        code: 'no_upfront',
      },
    });
  });
});

function resolver(reader: PricingRateReader): RateResolverService {
  return new RateResolverService(reader, new PricingTermsService(), new PricingCacheService());
}

function readerMock(record: PricingRateRecord): PricingRateReader & {
  findCurrentRate: jest.Mock<Promise<PricingRateRecord>>;
} {
  return {
    findCurrentRate: jest.fn(async () => record),
  };
}
