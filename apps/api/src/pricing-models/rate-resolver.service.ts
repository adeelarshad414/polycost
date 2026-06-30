import { Injectable } from '@nestjs/common';
import { ApiValidationError } from '../api/api-errors';
import { PricingCacheService } from './pricing-cache.service';
import {
  PaymentOptionCode,
  PricingGranularity,
  PricingRateReader,
  PricingRateRecord,
  RateIntervals,
  RateResolverQuery,
  RateResult,
} from './pricing-models.types';
import { PricingTermsService } from './pricing-terms.service';

const PRICING_TTL_SECONDS = 24 * 60 * 60;
const GRANULARITY_MULTIPLIERS: Record<PricingGranularity, number> = {
  hourly: 1,
  daily: 24,
  weekly: 24 * 7,
  monthly: 730,
  yearly: 8760,
};

@Injectable()
export class RateResolverService {
  constructor(
    private readonly reader: PricingRateReader,
    private readonly pricingTermsService: PricingTermsService,
    private readonly cacheService: PricingCacheService,
  ) {}

  async resolveRate(query: RateResolverQuery): Promise<RateResult> {
    const term = this.pricingTermsService.getTerm(query.termCode);
    const paymentOptionCode = this.validatePaymentOption(query.paymentOptionCode, term.code);
    const cacheKey = this.cacheService.pricingKey({
      provider: query.provider,
      skuOrService: query.service,
      region: query.region,
      term: query.termCode,
      paymentOption: paymentOptionCode,
    });
    const rate = await this.cacheService.getOrSet<PricingRateRecord | undefined>(
      cacheKey,
      PRICING_TTL_SECONDS,
      () =>
        this.reader.findCurrentRate({
          provider: query.provider,
          service: query.service,
          region: query.region,
          termCode: query.termCode,
          ...(paymentOptionCode ? { paymentOptionCode } : {}),
        }),
    );

    if (!rate) {
      throw new ApiValidationError('Pricing data is unavailable', [
        {
          field: 'pricingModel',
          issue: `${term.label} is not offered for ${query.provider}/${query.service} in ${query.region}`,
        },
      ]);
    }

    return this.toRateResult(rate, query.granularity);
  }

  private validatePaymentOption(
    paymentOptionCode: PaymentOptionCode | undefined,
    termCode: RateResolverQuery['termCode'],
  ): PaymentOptionCode | undefined {
    const term = this.pricingTermsService.getTerm(termCode);

    if (!term.requiresPaymentOption) {
      return undefined;
    }

    const validOptions = this.pricingTermsService.listPaymentOptions(termCode);

    if (!paymentOptionCode) {
      throw new ApiValidationError('paymentOption is required for this pricing model', [
        {
          field: 'paymentOption',
          issue: `must be one of ${validOptions.map((option) => option.code).join(', ')}`,
        },
      ]);
    }

    if (!validOptions.some((option) => option.code === paymentOptionCode)) {
      throw new ApiValidationError('Unsupported payment option', [
        {
          field: 'paymentOption',
          issue: `must be one of ${validOptions.map((option) => option.code).join(', ')}`,
        },
      ]);
    }

    return paymentOptionCode;
  }

  private toRateResult(rate: PricingRateRecord, granularity: PricingGranularity): RateResult {
    const intervals = intervalsFromHourlyRate(rate.hourlyRateUsd);
    const pricingTerm = this.pricingTermsService.getTerm(rate.termCode);
    const paymentOption = rate.paymentOptionCode
      ? this.pricingTermsService.getPaymentOption(rate.paymentOptionCode)
      : undefined;

    return {
      schemaVersion: 2,
      provider: rate.provider,
      service: rate.service,
      skuId: rate.skuId,
      providerSkuId: rate.providerSkuId,
      region: rate.region,
      pricingTerm,
      ...(paymentOption ? { paymentOption } : {}),
      granularity,
      hourlyRateUsd: roundRate(rate.hourlyRateUsd),
      amountUsd: amountForGranularity(intervals, granularity),
      currency: rate.currency,
      intervals,
      isEstimate: rate.isEstimate,
      ...(rate.estimateRangeLowUsd !== undefined
        ? { estimateRangeLowUsd: roundRate(rate.estimateRangeLowUsd) }
        : {}),
      ...(rate.estimateRangeHighUsd !== undefined
        ? { estimateRangeHighUsd: roundRate(rate.estimateRangeHighUsd) }
        : {}),
      lastFetchedAt: rate.sourceFetchedAt,
      validFrom: rate.validFrom,
      source: rate.source,
      ...(rate.unavailableReason
        ? {
            unavailable: true,
            reason: rate.unavailableReason,
          }
        : {}),
    };
  }
}

export function intervalsFromHourlyRate(hourlyRateUsd: number): RateIntervals {
  if (!Number.isFinite(hourlyRateUsd) || hourlyRateUsd < 0) {
    throw new RangeError('hourlyRateUsd must be a finite non-negative number');
  }

  return {
    hourly: roundRate(hourlyRateUsd * GRANULARITY_MULTIPLIERS.hourly),
    daily: roundRate(hourlyRateUsd * GRANULARITY_MULTIPLIERS.daily),
    weekly: roundRate(hourlyRateUsd * GRANULARITY_MULTIPLIERS.weekly),
    monthly: roundRate(hourlyRateUsd * GRANULARITY_MULTIPLIERS.monthly),
    yearly: roundRate(hourlyRateUsd * GRANULARITY_MULTIPLIERS.yearly),
  };
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function amountForGranularity(
  intervals: RateIntervals,
  granularity: PricingGranularity,
): number {
  switch (granularity) {
    case 'hourly':
      return intervals.hourly;
    case 'daily':
      return intervals.daily;
    case 'weekly':
      return intervals.weekly;
    case 'monthly':
      return intervals.monthly;
    case 'yearly':
      return intervals.yearly;
  }
}
