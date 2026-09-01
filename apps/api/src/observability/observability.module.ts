import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { DomainMetricsService } from './domain-metrics.service';
import { MetricsService } from './metrics.service';
import { TracingLifecycle } from './tracing.lifecycle';

/**
 * Global so any provider can record a metric without importing the module.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, DomainMetricsService, TracingLifecycle],
  exports: [MetricsService, DomainMetricsService],
})
export class ObservabilityModule {}
