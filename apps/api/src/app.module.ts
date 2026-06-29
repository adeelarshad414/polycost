import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';
import { ComparisonModule } from './comparison/comparison.module';
import { AppConfigModule } from './config/app-config.module';
import { CostManagementJobsModule } from './cost-management-jobs/cost-management-jobs.module';
import { HealthController } from './health/health.controller';
import { NwsParserModule } from './nws-parser/nws-parser.module';
import { PricingEtlModule } from './pricing-etl/pricing-etl.module';
import { ReportModule } from './reports/report.module';

@Module({
  imports: [
    AppConfigModule,
    PricingEtlModule,
    NwsParserModule,
    ComparisonModule,
    ReportModule,
    ApiModule,
    CostManagementJobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
