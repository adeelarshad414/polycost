import { Injectable } from '@nestjs/common';
import { PricingCacheService } from './pricing-cache.service.js';
import { RateResolverQuery, RateResult } from './pricing-models.types.js';
import { RateResolverService } from './rate-resolver.service.js';

const SPOT_ESTIMATE_TTL_SECONDS = 30 * 60;
const SPOT_DISCLAIMER =
  'Spot is shown as an estimate range only. Validate interruption tolerance and current provider spot market behavior before committing.';

@Injectable()
export class SpotEstimateService {
  constructor(
    private readonly rateResolverService: RateResolverService,
    private readonly cacheService: PricingCacheService,
  ) {}

  async resolveSpotEstimate(
    query: Omit<RateResolverQuery, 'termCode' | 'paymentOptionCode'>,
  ): Promise<RateResult> {
    const cacheKey = this.cacheService.spotEstimateKey(query.provider, query.service, query.region);

    return this.cacheService.getOrSet(cacheKey, SPOT_ESTIMATE_TTL_SECONDS, async () => ({
      ...(await this.rateResolverService.resolveRate({
        ...query,
        termCode: 'spot_estimate',
      })),
      isEstimate: true,
      disclaimer: SPOT_DISCLAIMER,
    }));
  }
}
