import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions } from 'bullmq';
import { AppConfig } from '../config/config.schema';
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
} from './cost-management-jobs.types';
import { CostManagementJobsService } from './cost-management-jobs.service';

export const COST_MANAGEMENT_QUEUE = Symbol('COST_MANAGEMENT_QUEUE');
export const COST_MANAGEMENT_WORKER_FACTORY = Symbol('COST_MANAGEMENT_WORKER_FACTORY');
export const EXCHANGE_RATE_CLIENT = Symbol('EXCHANGE_RATE_CLIENT');

export interface CostManagementQueue {
  add(name: string, data: Record<string, never>, options: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduleRecurringJobs();
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
        comparisonAuditLogDays: this.configService.get(
          'DATA_RETENTION_COMPARISON_AUDIT_LOG_DAYS',
          { infer: true },
        ),
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

  private async scheduleJob(jobName: CostManagementJobName, cronPattern: string): Promise<void> {
    await this.queue.add(
      jobName,
      {},
      {
        jobId: jobName,
        repeat: {
          pattern: cronPattern,
        },
        removeOnComplete: true,
        removeOnFail: 100,
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
