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
import { TerraformGenerationController } from '../terraform/terraform-generation.controller';
import { TerraformGenerationService } from '../terraform/terraform-generation.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { ApiDatabaseRepository } from './api-database.repository';
import { ApiExceptionFilter } from './api-exception.filter';
import Redis from 'ioredis';
import { ApiRateLimitService, RATE_LIMIT_REDIS } from './rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ComparisonAnalyticsService } from './comparison-analytics.service';
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
import { InvitationDeliveryService } from './invitation-delivery.service';
import { InvoiceArtifactGovernanceService } from './invoice-artifact-governance.service';
import { InvoiceArtifactStorageService } from './invoice-artifact-storage.service';
import { InvoiceEvidenceNotaryService } from './invoice-evidence-notary.service';
import { DataHealthController } from './data-health.controller';
import { PricingStatusController } from './pricing-status.controller';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { ReportExportJobsService } from './report-export-jobs.service';
import { ScimProvisioningController } from './scim-provisioning.controller';
import { ScimProvisioningService } from './scim-provisioning.service';
import { SessionAuthGuard } from './session-auth.guard';
import { TeamAuditExportService } from './team-audit-export.service';
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
    AuthController,
    ScimProvisioningController,
    BillingController,
    TerraformGenerationController,
  ],
  providers: [
    SecretsService,
    TerraformGenerationService,
    {
      provide: ApiDatabaseRepository,
      inject: [ConfigService, SecretsService],
      useFactory: (configService: ConfigService<AppConfig, true>, secretsService: SecretsService) =>
        new ApiDatabaseRepository(configService, secretsService),
    },
    {
      // Shared Redis client for rate limiting. Without it each instance keeps its
      // own counters, so N replicas would allow N times the intended limit -
      // which matters most for the auth and paid refresh-live endpoints.
      provide: RATE_LIMIT_REDIS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        new Redis({
          host: configService.get('REDIS_HOST', { infer: true }),
          port: configService.get('REDIS_PORT', { infer: true }),
          // Fail fast instead of queueing: the service falls back to per-process
          // counters when Redis is unreachable, and a queued command would defer
          // that fallback behind a growing backlog.
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: false,
        }),
    },
    {
      provide: ApiRateLimitService,
      inject: [RATE_LIMIT_REDIS],
      useFactory: (redis: Redis) => new ApiRateLimitService(undefined, redis),
    },
    AdminApiKeyGuard,
    InvitationDeliveryService,
    TeamAuditExportService,
    InvoiceArtifactGovernanceService,
    InvoiceEvidenceNotaryService,
    {
      provide: InvoiceArtifactStorageService,
      inject: [ConfigService, SecretsService],
      useFactory: (configService: ConfigService<AppConfig, true>, secretsService: SecretsService) =>
        new InvoiceArtifactStorageService(configService, secretsService),
    },
    AuthService,
    ScimProvisioningService,
    SessionAuthGuard,
    BillingService,
    ComparisonAnalyticsService,
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
  exports: [ApiDatabaseRepository, CostManagementService, TeamAuditExportService],
})
export class ApiModule {}
