import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module.js';
import { ComparisonModule } from './comparison/comparison.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { CostManagementJobsModule } from './cost-management-jobs/cost-management-jobs.module.js';
import { DiagramParserModule } from './diagram-parser/diagram-parser.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { NwsParserModule } from './nws-parser/nws-parser.module.js';
import { PricingEtlModule } from './pricing-etl/pricing-etl.module.js';
import { PricingModelsModule } from './pricing-models/pricing-models.module.js';
import { ReportModule } from './reports/report.module.js';

@Module({
  imports: [
    AppConfigModule,
    ObservabilityModule,
    PricingEtlModule,
    NwsParserModule,
    ComparisonModule,
    ReportModule,
    PricingModelsModule,
    DiagramParserModule,
    ApiModule,
    CostManagementJobsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
