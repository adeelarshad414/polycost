import { Inject, Injectable, Optional, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { registerQueueDepth } from '../observability/queue-depth.js';
import { ConfigService } from '@nestjs/config';
import { JobsOptions } from 'bullmq';
import { AppConfig } from '../config/config.schema.js';
import { PricingEtlService } from './pricing-etl.service.js';
import {
  PRICING_ETL_QUEUE_NAME,
  PRICING_ETL_REFRESH_JOB_NAME,
  PRICING_ETL_STARTUP_REFRESH_JOB_ID,
  PricingEtlSummary,
} from './pricing-etl.types.js';

export const PRICING_ETL_QUEUE = Symbol('PRICING_ETL_QUEUE');
export const PRICING_ETL_WORKER_FACTORY = Symbol('PRICING_ETL_WORKER_FACTORY');
export const PRICING_ETL_ADAPTERS = Symbol('PRICING_ETL_ADAPTERS');
export const PRICING_CATALOG_WRITER = Symbol('PRICING_CATALOG_WRITER');
export const NORMALIZED_PRICING_WRITER = Symbol('NORMALIZED_PRICING_WRITER');
export const PRICING_ETL_RUN_REPOSITORY = Symbol('PRICING_ETL_RUN_REPOSITORY');

export interface PricingEtlQueue {
  add(name: string, data: Record<string, never>, options: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
  // Optional so existing test doubles need no change; BullMQ's Queue provides it.
  getJobCounts?(...states: string[]): Promise<Record<string, number>>;
}

export interface PricingEtlWorker {
  close(): Promise<void>;
}

export type PricingEtlWorkerFactory = (
  processor: () => Promise<PricingEtlSummary>,
) => PricingEtlWorker;

@Injectable()
export class PricingEtlScheduler implements OnModuleInit, OnModuleDestroy {
  private worker?: PricingEtlWorker;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly etlService: PricingEtlService,
    @Inject(PRICING_ETL_QUEUE) private readonly queue: PricingEtlQueue,
    @Inject(PRICING_ETL_WORKER_FACTORY)
    private readonly workerFactory: PricingEtlWorkerFactory,
    @Optional() private readonly domainMetrics?: DomainMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    registerQueueDepth(this.domainMetrics, PRICING_ETL_QUEUE_NAME, this.queue);
    await this.scheduleRecurringRefresh();
    await this.scheduleStartupRefresh();
    this.worker = this.workerFactory(() => this.etlService.refreshAllProviders());
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }

    await this.queue.close();
  }

  async scheduleRecurringRefresh(): Promise<void> {
    const cronPattern = this.configService.get('PRICING_ETL_SCHEDULE_CRON', {
      infer: true,
    });

    await this.queue.add(
      PRICING_ETL_REFRESH_JOB_NAME,
      {},
      {
        jobId: PRICING_ETL_REFRESH_JOB_NAME,
        repeat: {
          pattern: cronPattern,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async scheduleStartupRefresh(): Promise<void> {
    const runOnBoot = this.configService.get('PRICING_ETL_RUN_ON_BOOT', {
      infer: true,
    });

    if (!runOnBoot) {
      return;
    }

    await this.queue.add(
      PRICING_ETL_REFRESH_JOB_NAME,
      {},
      {
        jobId: PRICING_ETL_STARTUP_REFRESH_JOB_ID,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}

export { PRICING_ETL_QUEUE_NAME };
