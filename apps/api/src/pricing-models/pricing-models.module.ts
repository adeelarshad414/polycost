import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainMetricsService } from '../observability/domain-metrics.service';
import { instrumentPool } from '../observability/instrumented-pool';
import { SecretsService } from '../secrets/secrets.service';
import { ApiRateLimitService } from '../api/rate-limit.service';
import { PricingCompareV2Controller, PricingModelsController } from './pricing-models.controller';
import { PricingCacheService } from './pricing-cache.service';
import { PricingMatrixService } from './pricing-matrix.service';
import {
  PRICING_RATES_POOL_FACTORY,
  PostgresPricingRatesRepository,
} from './pricing-rates.repository';
import { PricingTermsService } from './pricing-terms.service';
import { RateResolverService } from './rate-resolver.service';
import { SpotEstimateService } from './spot-estimate.service';

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
