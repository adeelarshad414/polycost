import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { DomainMetricsService } from './domain-metrics.service';
import { MetricsService } from './metrics.service';

/**
 * Global so any provider can record a metric without importing the module.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, DomainMetricsService],
  exports: [MetricsService, DomainMetricsService],
})
export class ObservabilityModule {}
