import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { instrumentPool } from '../observability/instrumented-pool.js';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import {
  CLOUD_PROVIDER_ADAPTERS,
  ProviderAdaptersModule,
} from '../adapters/provider-adapters.module.js';
import { CloudProviderAdapter } from '../adapters/common/cloud-provider-adapter.js';
import { ComparisonModule } from '../comparison/comparison.module.js';
import { AppConfig } from '../config/config.schema.js';
import { PostgresPricingCatalogRepository } from '../database/pricing-catalog.repository.js';
import { NwsParserModule } from '../nws-parser/nws-parser.module.js';
import { PricingModelsModule } from '../pricing-models/pricing-models.module.js';
import { PricingMatrixService } from '../pricing-models/pricing-matrix.service.js';
import { ReportModule } from '../reports/report.module.js';
import { ReportService } from '../reports/report.service.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { TerraformGenerationController } from '../terraform/terraform-generation.controller.js';
import { TerraformGenerationService } from '../terraform/terraform-generation.service.js';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { ApiDatabaseRepository } from './api-database.repository.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
// Named import rather than default: ioredis is CommonJS, and under ESM with
// node16 resolution its default import resolves to the module namespace, which
// is neither constructable nor usable as a type. The named Redis is the class.
import { Redis } from 'ioredis';
import { ApiRateLimitService, RATE_LIMIT_REDIS } from './rate-limit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { ComparisonAnalyticsService } from './comparison-analytics.service.js';
import { ComparisonApplicationService } from './comparison-application.service.js';
import { ComparisonPrewarmService } from './comparison-prewarm.service.js';
import { ComparisonsController } from './comparisons.controller.js';
import {
  AlertsController,
  BudgetsController,
  CachedPricingController,
  ExchangeRatesController,
  SharedReportsController,
  ShareLinksController,
  WorkloadsController,
} from './cost-management.controller.js';
import { CostManagementService } from './cost-management.service.js';
import { LivePricingRefreshService } from './live-pricing-refresh.service.js';
import { OpenApiController } from './openapi.controller.js';
import { CircuitBreakerRegistry } from '../adapters/common/circuit-breaker.js';

/** Shared so every caller sees the same breaker state for a provider. */
export const PROVIDER_CIRCUIT_BREAKERS = Symbol('PROVIDER_CIRCUIT_BREAKERS');
import { InvitationDeliveryService } from './invitation-delivery.service.js';
import { InvoiceArtifactGovernanceService } from './invoice-artifact-governance.service.js';
import { InvoiceArtifactStorageService } from './invoice-artifact-storage.service.js';
import { InvoiceEvidenceNotaryService } from './invoice-evidence-notary.service.js';
import { DataHealthController } from './data-health.controller.js';
import { PricingStatusController } from './pricing-status.controller.js';
import { RegionsController } from './regions.controller.js';
import { RegionsService } from './regions.service.js';
import { ReportExportJobsService } from './report-export-jobs.service.js';
import { ScimProvisioningController } from './scim-provisioning.controller.js';
import { ScimProvisioningService } from './scim-provisioning.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { TeamAuditExportService } from './team-audit-export.service.js';
import { WorkloadController } from './workload.controller.js';

@Module({
  imports: [
    NwsParserModule,
    ComparisonModule,
    ProviderAdaptersModule,
    ReportModule,
    PricingModelsModule,
  ],
  controllers: [
    OpenApiController,
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
      inject: [ConfigService, SecretsService, DomainMetricsService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        secretsService: SecretsService,
        domainMetrics: DomainMetricsService,
      ) =>
        new ApiDatabaseRepository(configService, secretsService, (config) =>
          instrumentPool(new Pool(config), domainMetrics, 'api'),
        ),
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
      // One registry shared by the whole app: a breaker that is recreated per
      // request has no memory, which is the entire feature.
      provide: PROVIDER_CIRCUIT_BREAKERS,
      inject: [ConfigService, DomainMetricsService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        domainMetrics: DomainMetricsService,
      ) =>
        new CircuitBreakerRegistry({
          failureThreshold: configService.get('PROVIDER_CIRCUIT_FAILURE_THRESHOLD', {
            infer: true,
          }),
          cooldownMs: configService.get('PROVIDER_CIRCUIT_COOLDOWN_MS', { infer: true }),
          onStateChange: (provider, state) => domainMetrics.recordCircuitState({ provider, state }),
        }),
    },
    {
      provide: LivePricingRefreshService,
      inject: [
        CLOUD_PROVIDER_ADAPTERS,
        PostgresPricingCatalogRepository,
        PROVIDER_CIRCUIT_BREAKERS,
      ],
      useFactory: (
        adapters: CloudProviderAdapter[],
        pricingRepository: PostgresPricingCatalogRepository,
        circuitBreakers: CircuitBreakerRegistry,
      ) =>
        new LivePricingRefreshService(
          adapters,
          pricingRepository,
          pricingRepository,
          circuitBreakers,
        ),
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
