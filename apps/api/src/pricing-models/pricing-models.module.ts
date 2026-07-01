import { Module } from '@nestjs/common';
import { SecretsService } from '../secrets/secrets.service';
import { PricingCompareV2Controller, PricingModelsController } from './pricing-models.controller';
import { PricingCacheService } from './pricing-cache.service';
import { PricingMatrixService } from './pricing-matrix.service';
import { PostgresPricingRatesRepository } from './pricing-rates.repository';
import { PricingTermsService } from './pricing-terms.service';
import { RateResolverService } from './rate-resolver.service';
import { SpotEstimateService } from './spot-estimate.service';

@Module({
  controllers: [PricingModelsController, PricingCompareV2Controller],
  providers: [
    SecretsService,
    PricingCacheService,
    PricingTermsService,
    PostgresPricingRatesRepository,
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
