import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ComparisonModule } from '../comparison/comparison.module';
import { AppConfig } from '../config/config.schema';
import { NwsParserModule } from '../nws-parser/nws-parser.module';
import { ReportModule } from '../reports/report.module';
import { SecretsService } from '../secrets/secrets.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { ApiDatabaseRepository } from './api-database.repository';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiRateLimitService } from './rate-limit.service';
import { ComparisonApplicationService } from './comparison-application.service';
import { ComparisonsController } from './comparisons.controller';
import {
  AlertsController,
  BudgetsController,
  CachedPricingController,
  ExchangeRatesController,
  SharedReportsController,
  ShareLinksController,
  WorkloadsController,
} from './cost-management.controller';
import { CostManagementService } from './cost-management.service';
import { PricingStatusController } from './pricing-status.controller';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { WorkloadController } from './workload.controller';

@Module({
  imports: [NwsParserModule, ComparisonModule, ReportModule],
  controllers: [
    WorkloadController,
    ComparisonsController,
    PricingStatusController,
    RegionsController,
    CachedPricingController,
    WorkloadsController,
    BudgetsController,
    AlertsController,
    ShareLinksController,
    SharedReportsController,
    ExchangeRatesController,
  ],
  providers: [
    SecretsService,
    {
      provide: ApiDatabaseRepository,
      inject: [ConfigService, SecretsService],
      useFactory: (configService: ConfigService<AppConfig, true>, secretsService: SecretsService) =>
        new ApiDatabaseRepository(configService, secretsService),
    },
    {
      provide: ApiRateLimitService,
      useFactory: () => new ApiRateLimitService(),
    },
    AdminApiKeyGuard,
    ComparisonApplicationService,
    {
      provide: CostManagementService,
      inject: [ApiDatabaseRepository],
      useFactory: (apiDatabaseRepository: ApiDatabaseRepository) =>
        new CostManagementService(apiDatabaseRepository),
    },
    RegionsService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
  exports: [ApiDatabaseRepository, CostManagementService],
})
export class ApiModule {}
