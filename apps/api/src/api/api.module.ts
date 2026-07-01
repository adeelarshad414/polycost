import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import {
  CLOUD_PROVIDER_ADAPTERS,
  ProviderAdaptersModule,
} from '../adapters/provider-adapters.module';
import { CloudProviderAdapter } from '../adapters/common/cloud-provider-adapter';
import { ComparisonModule } from '../comparison/comparison.module';
import { AppConfig } from '../config/config.schema';
import { PostgresPricingCatalogRepository } from '../database/pricing-catalog.repository';
import { NwsParserModule } from '../nws-parser/nws-parser.module';
import { PricingModelsModule } from '../pricing-models/pricing-models.module';
import { PricingMatrixService } from '../pricing-models/pricing-matrix.service';
import { ReportModule } from '../reports/report.module';
import { ReportService } from '../reports/report.service';
import { SecretsService } from '../secrets/secrets.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { ApiDatabaseRepository } from './api-database.repository';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiRateLimitService } from './rate-limit.service';
import { ComparisonApplicationService } from './comparison-application.service';
import { ComparisonPrewarmService } from './comparison-prewarm.service';
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
import { LivePricingRefreshService } from './live-pricing-refresh.service';
import { DataHealthController } from './data-health.controller';
import { PricingStatusController } from './pricing-status.controller';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { ReportExportJobsService } from './report-export-jobs.service';
import { WorkloadController } from './workload.controller';

@Module({
  imports: [
    NwsParserModule,
    ComparisonModule,
    ProviderAdaptersModule,
    ReportModule,
    PricingModelsModule,
  ],
  controllers: [
    WorkloadController,
    ComparisonsController,
    DataHealthController,
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
    {
      provide: LivePricingRefreshService,
      inject: [CLOUD_PROVIDER_ADAPTERS, PostgresPricingCatalogRepository],
      useFactory: (
        adapters: CloudProviderAdapter[],
        pricingRepository: PostgresPricingCatalogRepository,
      ) => new LivePricingRefreshService(adapters, pricingRepository, pricingRepository),
    },
    ComparisonApplicationService,
    {
      provide: ComparisonPrewarmService,
      inject: [ApiDatabaseRepository, PricingMatrixService],
      useFactory: (
        apiDatabaseRepository: ApiDatabaseRepository,
        pricingMatrixService: PricingMatrixService,
      ) => new ComparisonPrewarmService(apiDatabaseRepository, pricingMatrixService),
    },
    {
      provide: ReportExportJobsService,
      inject: [ComparisonApplicationService, ApiDatabaseRepository, ReportService],
      useFactory: (
        comparisonApplicationService: ComparisonApplicationService,
        apiDatabaseRepository: ApiDatabaseRepository,
        reportService: ReportService,
      ) =>
        new ReportExportJobsService(
          comparisonApplicationService,
          apiDatabaseRepository,
          reportService,
        ),
    },
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
