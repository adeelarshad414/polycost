import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { ApiDatabaseRepository } from '../api/api-database.repository';
import { ApiModule } from '../api/api.module';
import { AppConfig } from '../config/config.schema';
import {
  COST_MANAGEMENT_QUEUE,
  COST_MANAGEMENT_QUEUE_NAME,
  COST_MANAGEMENT_WORKER_FACTORY,
  CostManagementJobsScheduler,
  CostManagementWorkerFactory,
  EXCHANGE_RATE_CLIENT,
} from './cost-management-jobs.scheduler';
import { CostManagementJobsService } from './cost-management-jobs.service';
import { ExchangeRateClient, FrankfurterExchangeRateClient } from './exchange-rate.client';

@Module({
  imports: [ApiModule],
  providers: [
    {
      provide: FrankfurterExchangeRateClient,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        new FrankfurterExchangeRateClient(configService),
    },
    {
      provide: EXCHANGE_RATE_CLIENT,
      useExisting: FrankfurterExchangeRateClient,
    },
    {
      provide: CostManagementJobsService,
      inject: [ApiDatabaseRepository, EXCHANGE_RATE_CLIENT],
      useFactory: (repository: ApiDatabaseRepository, exchangeRateClient: ExchangeRateClient) =>
        new CostManagementJobsService(repository, exchangeRateClient),
    },
    {
      provide: COST_MANAGEMENT_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        new Queue(COST_MANAGEMENT_QUEUE_NAME, {
          connection: redisConnection(configService),
        }),
    },
    {
      provide: COST_MANAGEMENT_WORKER_FACTORY,
      inject: [ConfigService],
      useFactory:
        (configService: ConfigService<AppConfig, true>): CostManagementWorkerFactory =>
        (processor) =>
          new Worker(COST_MANAGEMENT_QUEUE_NAME, (job) => processor({ name: job.name }), {
            connection: redisConnection(configService),
          }),
    },
    CostManagementJobsScheduler,
  ],
})
export class CostManagementJobsModule {}

function redisConnection(configService: ConfigService<AppConfig, true>) {
  return {
    host: configService.get('REDIS_HOST', { infer: true }),
    port: configService.get('REDIS_PORT', { infer: true }),
  };
}
