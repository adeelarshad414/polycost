import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { instrumentPool } from '../observability/instrumented-pool.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { ApiRateLimitService } from '../api/rate-limit.service.js';
import {
  PricingCompareV2Controller,
  PricingModelsController,
} from './pricing-models.controller.js';
import { PricingCacheService } from './pricing-cache.service.js';
import { PricingMatrixService } from './pricing-matrix.service.js';
import {
  PRICING_RATES_POOL_FACTORY,
  PostgresPricingRatesRepository,
} from './pricing-rates.repository.js';
import { PricingTermsService } from './pricing-terms.service.js';
import { RateResolverService } from './rate-resolver.service.js';
import { SpotEstimateService } from './spot-estimate.service.js';

@Module({
  controllers: [PricingModelsController, PricingCompareV2Controller],
  providers: [
    SecretsService,
    PricingCacheService,
    {
      provide: ApiRateLimitService,
      useFactory: () => new ApiRateLimitService(),
    },
    PricingTermsService,
    PostgresPricingRatesRepository,
    {
      // The repository already accepts an injectable pool factory, so it needs
      // no code change to be instrumented.
      provide: PRICING_RATES_POOL_FACTORY,
      inject: [DomainMetricsService],
      useFactory:
        (domainMetrics: DomainMetricsService) => (config: ConstructorParameters<typeof Pool>[0]) =>
          instrumentPool(new Pool(config), domainMetrics, 'pricing_rates'),
    },
    {
      provide: RateResolverService,
      inject: [PostgresPricingRatesRepository, PricingTermsService, PricingCacheService],
      useFactory: (
        repository: PostgresPricingRatesRepository,
        pricingTermsService: PricingTermsService,
        pricingCacheService: PricingCacheService,
      ) => new RateResolverService(repository, pricingTermsService, pricingCacheService),
    },
    SpotEstimateService,
    PricingMatrixService,
  ],
  exports: [PricingMatrixService, RateResolverService, PricingCacheService],
})
export class PricingModelsModule {}
