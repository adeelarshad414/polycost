import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { ErrorReporter } from '../observability/error-reporter';
import { reportWorkerFailures } from '../observability/process-errors';
import { DomainMetricsService } from '../observability/domain-metrics.service';
import { CloudProviderAdapter } from '../adapters/common/cloud-provider-adapter';
import {
  CLOUD_PROVIDER_ADAPTERS,
  ProviderAdaptersModule,
} from '../adapters/provider-adapters.module';
import { AppConfig } from '../config/config.schema';
import { PostgresPricingCatalogRepository } from '../database/pricing-catalog.repository';
import {
  PRICING_CATALOG_WRITER,
  PRICING_ETL_ADAPTERS,
  PRICING_ETL_QUEUE,
  PRICING_ETL_QUEUE_NAME,
  PRICING_ETL_RUN_REPOSITORY,
  PRICING_ETL_WORKER_FACTORY,
  NORMALIZED_PRICING_WRITER,
  PricingEtlScheduler,
  PricingEtlWorkerFactory,
} from './pricing-etl.scheduler';
import { PricingEtlService } from './pricing-etl.service';
import {
  PricingSyncFailureNotifier,
  WebhookPricingSyncFailureNotifier,
} from './pricing-sync-alert.service';

const PRICING_SYNC_FAILURE_NOTIFIER = Symbol('PRICING_SYNC_FAILURE_NOTIFIER');

@Module({
  imports: [ProviderAdaptersModule],
  providers: [
    {
      provide: PRICING_ETL_ADAPTERS,
      inject: [CLOUD_PROVIDER_ADAPTERS],
      useFactory: (adapters: CloudProviderAdapter[]) => adapters,
    },
    {
      provide: PRICING_CATALOG_WRITER,
      useExisting: PostgresPricingCatalogRepository,
    },
    {
      provide: NORMALIZED_PRICING_WRITER,
      useExisting: PostgresPricingCatalogRepository,
    },
    {
      provide: PRICING_ETL_RUN_REPOSITORY,
      useExisting: PostgresPricingCatalogRepository,
    },
    WebhookPricingSyncFailureNotifier,
    {
      provide: PRICING_SYNC_FAILURE_NOTIFIER,
      useExisting: WebhookPricingSyncFailureNotifier,
    },
    {
      provide: PricingEtlService,
      inject: [
        PRICING_ETL_ADAPTERS,
        PRICING_CATALOG_WRITER,
        PRICING_ETL_RUN_REPOSITORY,
        NORMALIZED_PRICING_WRITER,
        PRICING_SYNC_FAILURE_NOTIFIER,
        DomainMetricsService,
      ],
      useFactory: (
        adapters: CloudProviderAdapter[],
        catalogRepository: PostgresPricingCatalogRepository,
        runRepository: PostgresPricingCatalogRepository,
        normalizedPricingWriter: PostgresPricingCatalogRepository,
        failureNotifier: PricingSyncFailureNotifier,
        domainMetrics: DomainMetricsService,
      ) =>
        new PricingEtlService(
          adapters,
          catalogRepository,
          runRepository,
          undefined,
          normalizedPricingWriter,
          failureNotifier,
          {},
          domainMetrics,
        ),
    },
    {
      provide: PRICING_ETL_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        new Queue(PRICING_ETL_QUEUE_NAME, {
          connection: redisConnection(configService),
        }),
    },
    {
      provide: PRICING_ETL_WORKER_FACTORY,
      inject: [ConfigService, ErrorReporter],
      useFactory:
        (
          configService: ConfigService<AppConfig, true>,
          errorReporter: ErrorReporter,
        ): PricingEtlWorkerFactory =>
        (processor) => {
          const worker = new Worker(PRICING_ETL_QUEUE_NAME, processor, {
            connection: redisConnection(configService),
          });

          reportWorkerFailures(worker, PRICING_ETL_QUEUE_NAME, errorReporter);

          return worker;
        },
    },
    PricingEtlScheduler,
  ],
})
export class PricingEtlModule {}

function redisConnection(configService: ConfigService<AppConfig, true>) {
  return {
    host: configService.get('REDIS_HOST', { infer: true }),
    port: configService.get('REDIS_PORT', { infer: true }),
  };
}
