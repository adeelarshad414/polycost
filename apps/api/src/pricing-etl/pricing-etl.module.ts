import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { ErrorReporter } from '../observability/error-reporter.js';
import { reportWorkerFailures } from '../observability/process-errors.js';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { CloudProviderAdapter } from '../adapters/common/cloud-provider-adapter.js';
import {
  CLOUD_PROVIDER_ADAPTERS,
  ProviderAdaptersModule,
} from '../adapters/provider-adapters.module.js';
import { AppConfig } from '../config/config.schema.js';
import { PostgresPricingCatalogRepository } from '../database/pricing-catalog.repository.js';
import {
  PRICING_CATALOG_WRITER,
  PRICING_ETL_ADAPTERS,
  PRICING_ETL_QUEUE,
  PRICING_ETL_QUEUE_NAME,
  PRICING_ETL_RUN_REPOSITORY,
  PRICING_ETL_WORKER_FACTORY,
  NORMALIZED_PRICING_WRITER,
  PricingEtlQueue,
  PricingEtlScheduler,
  PricingEtlWorkerFactory,
} from './pricing-etl.scheduler.js';
import { PricingEtlService } from './pricing-etl.service.js';
import {
  PricingSyncFailureNotifier,
  WebhookPricingSyncFailureNotifier,
} from './pricing-sync-alert.service.js';

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
      /*
        Return type annotated deliberately. The DI token is a Symbol, so Nest
        cannot check that what this factory produces matches what the scheduler
        injects - and PricingEtlQueue is a narrow hand-written view of BullMQ's
        Queue. Without this, a signature drift (BullMQ 6 renaming the recurring
        API is exactly that) compiles clean and fails at runtime, where the
        symptom is a scheduled job that silently never registers.
      */
      useFactory: (configService: ConfigService<AppConfig, true>): PricingEtlQueue =>
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
