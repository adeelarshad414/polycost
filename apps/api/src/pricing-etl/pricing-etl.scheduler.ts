import {
  Inject,
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { registerQueueDepth } from '../observability/queue-depth.js';
import { ConfigService } from '@nestjs/config';
import { JobSchedulerTemplateOptions, JobsOptions } from 'bullmq';
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
  /*
    BullMQ 6 removed `repeat` from JobsOptions: a recurring job is now a job
    SCHEDULER, upserted by id, that stamps out jobs from a template. The
    rename is not cosmetic - `queue.add` with `repeat` also took a `jobId`
    that BullMQ ignored for repeatables, so two calls with the same id could
    leave two schedulers behind. `upsertJobScheduler` is keyed on the id by
    construction, which is what makes re-running it on every boot safe.
  */
  upsertJobScheduler(
    jobSchedulerId: string,
    repeatOpts: { pattern: string },
    jobTemplate?: {
      name?: string;
      data?: Record<string, never>;
      opts?: JobSchedulerTemplateOptions;
    },
  ): Promise<unknown>;
  /*
    Used to retire schedulers left by BullMQ 5.

    Upgrading does not replace the old repeatable entries, it adds alongside
    them: after the upgrade `getJobSchedulers()` returns both the v5 entries
    (keyed by an opaque hash) and the new ones (keyed by our job name), with
    identical patterns. Verified against a live Redis that had run v5 - every
    scheduled job came back twice, which would mean two pricing refreshes and
    two data-retention sweeps a day, not one.

    v6 removed `removeRepeatable`, so this is the only way to clear them, and
    it does work on a legacy hash id.
  */
  getJobSchedulers(): Promise<Array<{ key: string }>>;
  removeJobScheduler(jobSchedulerId: string): Promise<boolean>;
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
  private readonly logger = new Logger(PricingEtlScheduler.name);
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
    await this.retireUnknownSchedulers([PRICING_ETL_REFRESH_JOB_NAME]);
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

    await this.queue.upsertJobScheduler(
      PRICING_ETL_REFRESH_JOB_NAME,
      { pattern: cronPattern },
      {
        // The template's name is what the worker switches on, so it has to
        // stay the job name rather than defaulting to the scheduler id.
        name: PRICING_ETL_REFRESH_JOB_NAME,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
    );
  }

  /**
   * Retires schedulers this build did not register - in practice the entries
   * BullMQ 5 left behind, which otherwise keep firing alongside the new ones.
   * Idempotent, so it simply finds nothing to do from the second boot onwards.
   */
  private async retireUnknownSchedulers(expectedIds: readonly string[]): Promise<void> {
    const expected = new Set(expectedIds);
    const schedulers = await this.queue.getJobSchedulers();

    for (const scheduler of schedulers) {
      if (expected.has(scheduler.key)) {
        continue;
      }

      await this.queue.removeJobScheduler(scheduler.key);
      this.logger.log(
        `Retired a BullMQ 5 job scheduler left in the pricing-etl queue: ${scheduler.key}`,
      );
    }
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
