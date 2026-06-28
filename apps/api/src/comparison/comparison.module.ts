import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CLOUD_PROVIDER_ADAPTERS,
  ProviderAdaptersModule,
} from '../adapters/provider-adapters.module';
import { CloudProviderAdapter } from '../adapters/common/cloud-provider-adapter';
import { ComparisonOrchestratorService } from './comparison-orchestrator.service';
import {
  COMPARISON_CLOCK,
  COMPARISON_ID_FACTORY,
  COMPARISON_PROVIDER_ADAPTERS,
} from './comparison.tokens';
import { EquivalentServiceMapper } from './equivalent-service-mapper';
import { IntervalCostCalculator } from './interval-cost-calculator';

@Module({
  imports: [ProviderAdaptersModule],
  providers: [
    IntervalCostCalculator,
    EquivalentServiceMapper,
    {
      provide: COMPARISON_PROVIDER_ADAPTERS,
      inject: [CLOUD_PROVIDER_ADAPTERS],
      useFactory: (adapters: CloudProviderAdapter[]) => adapters,
    },
    {
      provide: COMPARISON_ID_FACTORY,
      useValue: () => randomUUID(),
    },
    {
      provide: COMPARISON_CLOCK,
      useValue: () => new Date(),
    },
    ComparisonOrchestratorService,
  ],
  exports: [ComparisonOrchestratorService, IntervalCostCalculator, EquivalentServiceMapper],
})
export class ComparisonModule {}
