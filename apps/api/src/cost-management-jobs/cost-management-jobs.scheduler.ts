import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { DomainMetricsService } from '../observability/domain-metrics.service.js';
import { registerQueueDepth } from '../observability/queue-depth.js';
import { ConfigService } from '@nestjs/config';
import { JobSchedulerTemplateOptions, JobsOptions } from 'bullmq';
import { AppConfig } from '../config/config.schema.js';
import {
  ALERT_EVALUATOR_JOB_NAME,
  COST_MANAGEMENT_QUEUE_NAME,
  CostManagementJob,
  CostManagementJobName,
  CostManagementJobSummary,
  CURRENCY_SYNC_JOB_NAME,
  DATA_RETENTION_JOB_NAME,
  SHARE_LINK_CLEANUP_JOB_NAME,
  TEAM_AUDIT_EXPORT_JOB_NAME,
} from './cost-management-jobs.types.js';
import { CostManagementJobsService } from './cost-management-jobs.service.js';

export const COST_MANAGEMENT_QUEUE = Symbol('COST_MANAGEMENT_QUEUE');
export const COST_MANAGEMENT_WORKER_FACTORY = Symbol('COST_MANAGEMENT_WORKER_FACTORY');
export const EXCHANGE_RATE_CLIENT = Symbol('EXCHANGE_RATE_CLIENT');

export interface CostManagementQueue {
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
    identical patterns. Verified against a live Redis that had run v5 - all
    five jobs came back twice, which would mean two data-retention sweeps and
    two audit-export flushes per schedule, not one.

    v6 removed `removeRepeatable`, so this is the only way to clear them, and
    it does work on a legacy hash id.
  */
  getJobSchedulers(): Promise<Array<{ key: string }>>;
  removeJobScheduler(jobSchedulerId: string): Promise<boolean>;
  close(): Promise<void>;
  // Optional so existing test doubles need no change; BullMQ's Queue provides it.
  getJobCounts?(...states: string[]): Promise<Record<string, number>>;
}

export interface CostManagementWorker {
  close(): Promise<void>;
}

export type CostManagementWorkerFactory = (
  processor: (job: CostManagementJob) => Promise<CostManagementJobSummary>,
) => CostManagementWorker;

@Injectable()
export class CostManagementJobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CostManagementJobsScheduler.name);
  private worker?: CostManagementWorker;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly jobsService: CostManagementJobsService,
    @Inject(COST_MANAGEMENT_QUEUE) private readonly queue: CostManagementQueue,
    @Inject(COST_MANAGEMENT_WORKER_FACTORY)
    private readonly workerFactory: CostManagementWorkerFactory,
    @Optional() private readonly domainMetrics?: DomainMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    registerQueueDepth(this.domainMetrics, COST_MANAGEMENT_QUEUE_NAME, this.queue);
    await this.scheduleRecurringJobs();
    await this.retireUnknownSchedulers([
      CURRENCY_SYNC_JOB_NAME,
      ALERT_EVALUATOR_JOB_NAME,
      SHARE_LINK_CLEANUP_JOB_NAME,
      TEAM_AUDIT_EXPORT_JOB_NAME,
      DATA_RETENTION_JOB_NAME,
    ]);
    this.worker = this.workerFactory((job) => this.runJob(job));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }

    await this.queue.close();
  }

  async scheduleRecurringJobs(): Promise<void> {
    await Promise.all([
      this.scheduleJob(
        CURRENCY_SYNC_JOB_NAME,
        this.configService.get('CURRENCY_SYNC_SCHEDULE_CRON', { infer: true }),
      ),
      this.scheduleJob(
        ALERT_EVALUATOR_JOB_NAME,
        this.configService.get('ALERT_EVALUATOR_SCHEDULE_CRON', { infer: true }),
      ),
      this.scheduleJob(
        SHARE_LINK_CLEANUP_JOB_NAME,
        this.configService.get('SHARE_LINK_CLEANUP_SCHEDULE_CRON', { infer: true }),
      ),
      this.scheduleJob(
        TEAM_AUDIT_EXPORT_JOB_NAME,
        this.configService.get('AUTH_AUDIT_EXPORT_SCHEDULE_CRON', { infer: true }),
      ),
      this.scheduleJob(
        DATA_RETENTION_JOB_NAME,
        this.configService.get('DATA_RETENTION_SCHEDULE_CRON', { infer: true }),
      ),
    ]);
  }

  // Reads the DB-2 retention policy from config. The scheduler owns ConfigService,
  // so the jobs service stays free of config wiring.
  private dataRetentionOptions() {
    return {
      mode: this.configService.get('DATA_RETENTION_ENFORCEMENT_MODE', { infer: true }),
      maxRowsPerTable: this.configService.get('DATA_RETENTION_MAX_ROWS_PER_TABLE', {
        infer: true,
      }),
      windows: {
        teamAuditEventDays: this.configService.get('DATA_RETENTION_TEAM_AUDIT_EVENT_DAYS', {
          infer: true,
        }),
        auditExportDays: this.configService.get('DATA_RETENTION_AUDIT_EXPORT_DAYS', {
          infer: true,
        }),
        comparisonAuditLogDays: this.configService.get('DATA_RETENTION_COMPARISON_AUDIT_LOG_DAYS', {
          infer: true,
        }),
        accountSessionDays: this.configService.get('DATA_RETENTION_ACCOUNT_SESSION_DAYS', {
          infer: true,
        }),
        exchangeRateDays: this.configService.get('DATA_RETENTION_EXCHANGE_RATE_DAYS', {
          infer: true,
        }),
        pricingEtlRunDays: this.configService.get('DATA_RETENTION_PRICING_ETL_RUN_DAYS', {
          infer: true,
        }),
      },
    };
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
        `Retired a BullMQ 5 job scheduler left in the cost-management queue: ${scheduler.key}`,
      );
    }
  }

  private async scheduleJob(jobName: CostManagementJobName, cronPattern: string): Promise<void> {
    await this.queue.upsertJobScheduler(
      jobName,
      { pattern: cronPattern },
      {
        // The template's name is what the worker switches on, so it has to
        // stay the job name rather than defaulting to the scheduler id.
        name: jobName,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
    );
  }

  private async runJob(job: CostManagementJob): Promise<CostManagementJobSummary> {
    try {
      switch (job.name) {
        case CURRENCY_SYNC_JOB_NAME:
          return await this.jobsService.syncCurrencyRates('USD');
        case ALERT_EVALUATOR_JOB_NAME:
          return await this.jobsService.evaluateBudgetAlerts();
        case SHARE_LINK_CLEANUP_JOB_NAME:
          return await this.jobsService.cleanupExpiredShareLinks();
        case TEAM_AUDIT_EXPORT_JOB_NAME:
          return await this.jobsService.flushPendingAuditExports();
        case DATA_RETENTION_JOB_NAME:
          return await this.jobsService.runDataRetentionSweep(this.dataRetentionOptions());
        default:
          throw new Error(`Unsupported cost-management job: ${job.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown cost-management job error';
      this.logger.error(`Cost-management job ${job.name} failed: ${message}`);
      throw error;
    }
  }
}

export { COST_MANAGEMENT_QUEUE_NAME };
