import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
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
  PricingEtlScheduler,
  PricingEtlWorkerFactory,
} from './pricing-etl.scheduler';
import { PricingEtlService } from './pricing-etl.service';

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
      provide: PRICING_ETL_RUN_REPOSITORY,
      useExisting: PostgresPricingCatalogRepository,
    },
    {
      provide: PricingEtlService,
      inject: [PRICING_ETL_ADAPTERS, PRICING_CATALOG_WRITER, PRICING_ETL_RUN_REPOSITORY],
      useFactory: (
        adapters: CloudProviderAdapter[],
        catalogRepository: PostgresPricingCatalogRepository,
        runRepository: PostgresPricingCatalogRepository,
      ) => new PricingEtlService(adapters, catalogRepository, runRepository),
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
      inject: [ConfigService],
      useFactory:
        (configService: ConfigService<AppConfig, true>): PricingEtlWorkerFactory =>
        (processor) =>
          new Worker(PRICING_ETL_QUEUE_NAME, processor, {
            connection: redisConnection(configService),
          }),
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
