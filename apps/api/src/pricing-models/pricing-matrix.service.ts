import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { PricingCacheService } from './pricing-cache.service';
import {
  PaymentOptionCode,
  PricingCompareV2Response,
  PricingGranularity,
  PricingMatrixResponse,
  PricingModelsResponse,
  PricingTermCode,
  RateResult,
} from './pricing-models.types';
import { PricingTermsService } from './pricing-terms.service';
import { RateResolverService } from './rate-resolver.service';
import { SpotEstimateService } from './spot-estimate.service';

const PROVIDERS: ProviderId[] = ['aws', 'azure', 'gcp'];
const COMPARISON_TTL_SECONDS = 15 * 60;

@Injectable()
export class PricingMatrixService {
  constructor(
    private readonly pricingTermsService: PricingTermsService,
    private readonly rateResolverService: RateResolverService,
    private readonly spotEstimateService: SpotEstimateService,
    private readonly cacheService: PricingCacheService,
  ) {}

  listModels(provider: ProviderId, service: string, region: string): PricingModelsResponse {
    return {
      schemaVersion: 2,
      provider,
      service,
      region,
      generatedAt: this.now().toISOString(),
      models: this.pricingTermsService.listTerms().map((term) => ({
        ...term,
        paymentOptions: this.pricingTermsService.listPaymentOptions(term.code),
        ...(this.pricingTermsService.defaultPaymentOption(term.code)
          ? { defaultPaymentOption: this.pricingTermsService.defaultPaymentOption(term.code) }
          : {}),
      })),
    };
  }

  resolveRate(input: {
    provider: ProviderId;
    service: string;
    region: string;
    pricingModel: PricingTermCode;
    paymentOption?: PaymentOptionCode;
    granularity: PricingGranularity;
  }): Promise<RateResult> {
    if (input.pricingModel === 'spot_estimate') {
      return this.spotEstimateService.resolveSpotEstimate({
        provider: input.provider,
        service: input.service,
        region: input.region,
        granularity: input.granularity,
      });
    }

    return this.rateResolverService.resolveRate({
      provider: input.provider,
      service: input.service,
      region: input.region,
      termCode: input.pricingModel,
      ...(input.paymentOption ? { paymentOptionCode: input.paymentOption } : {}),
      granularity: input.granularity,
    });
  }

  async matrix(input: {
    provider: ProviderId;
    service: string;
    region: string;
  }): Promise<PricingMatrixResponse> {
    const rates = await Promise.all(
      this.pricingTermsService.listTerms().map((term) =>
        this.resolveRate({
          provider: input.provider,
          service: input.service,
          region: input.region,
          pricingModel: term.code,
          paymentOption: this.pricingTermsService.defaultPaymentOption(term.code),
          granularity: 'monthly',
        }),
      ),
    );

    return {
      schemaVersion: 2,
      provider: input.provider,
      service: input.service,
      region: input.region,
      generatedAt: this.now().toISOString(),
      matrix: rates,
    };
  }

  async compare(input: {
    services: string[];
    regionByProvider: Record<ProviderId, string>;
    pricingModel: PricingTermCode;
    paymentOption?: PaymentOptionCode;
    granularity: PricingGranularity;
  }): Promise<PricingCompareV2Response> {
    const cacheKey = this.cacheService.comparisonKey(
      requestHash({
        services: input.services,
        regionByProvider: input.regionByProvider,
        pricingModel: input.pricingModel,
        paymentOption: input.paymentOption,
        granularity: input.granularity,
      }),
    );

    return this.cacheService.getOrSet(cacheKey, COMPARISON_TTL_SECONDS, async () => {
      const service = input.services[0] ?? 'compute';
      const providers = await Promise.all(
        PROVIDERS.map(async (provider) => {
          const region = regionForProvider(input.regionByProvider, provider);
          const rate = await this.resolveRate({
            provider,
            service,
            region,
            pricingModel: input.pricingModel,
            paymentOption: input.paymentOption,
            granularity: input.granularity,
          });

          return {
            provider,
            service,
            region,
            rate,
          };
        }),
      );

      return {
        schemaVersion: 2,
        generatedAt: this.now().toISOString(),
        services: input.services,
        granularity: input.granularity,
        pricingModel: input.pricingModel,
        ...(input.paymentOption ? { paymentOption: input.paymentOption } : {}),
        providers,
      };
    });
  }

  private now(): Date {
    return new Date();
  }
}

function requestHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 24);
}

function regionForProvider(
  regionByProvider: Record<ProviderId, string>,
  provider: ProviderId,
): string {
  switch (provider) {
    case 'aws':
      return regionByProvider.aws;
    case 'azure':
      return regionByProvider.azure;
    case 'gcp':
      return regionByProvider.gcp;
  }
}
