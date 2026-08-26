import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import {
  ALERT_EVALUATOR_JOB_NAME,
  CURRENCY_SYNC_JOB_NAME,
  DATA_RETENTION_JOB_NAME,
  SHARE_LINK_CLEANUP_JOB_NAME,
  TEAM_AUDIT_EXPORT_JOB_NAME,
} from './cost-management-jobs.types';
import { CostManagementJobsService } from './cost-management-jobs.service';
import {
  CostManagementJobsScheduler,
  CostManagementQueue,
  CostManagementWorker,
} from './cost-management-jobs.scheduler';

const configService = {
  get: jest.fn((key: keyof AppConfig) => {
    switch (key) {
      case 'CURRENCY_SYNC_SCHEDULE_CRON':
        return '0 * * * *';
      case 'ALERT_EVALUATOR_SCHEDULE_CRON':
        return '*/15 * * * *';
      case 'SHARE_LINK_CLEANUP_SCHEDULE_CRON':
        return '0 3 * * *';
      case 'AUTH_AUDIT_EXPORT_SCHEDULE_CRON':
        return '*/5 * * * *';
      case 'DATA_RETENTION_SCHEDULE_CRON':
        return '30 3 * * *';
      case 'DATA_RETENTION_ENFORCEMENT_MODE':
        return 'report-only';
      case 'DATA_RETENTION_MAX_ROWS_PER_TABLE':
        return 50000;
      case 'DATA_RETENTION_TEAM_AUDIT_EVENT_DAYS':
        return 2555;
      case 'DATA_RETENTION_AUDIT_EXPORT_DAYS':
        return 90;
      case 'DATA_RETENTION_COMPARISON_AUDIT_LOG_DAYS':
        return 400;
      case 'DATA_RETENTION_ACCOUNT_SESSION_DAYS':
        return 30;
      case 'DATA_RETENTION_EXCHANGE_RATE_DAYS':
        return 730;
      case 'DATA_RETENTION_PRICING_ETL_RUN_DAYS':
        return 180;
      default:
        throw new Error(`Unexpected config key ${String(key)}`);
    }
  }),
} as unknown as ConfigService<AppConfig, true>;

describe('CostManagementJobsScheduler', () => {
  it('schedules currency, alert, share-link cleanup, and audit export jobs', async () => {
    const queue = queueMock();
    const scheduler = new CostManagementJobsScheduler(
      configService,
      jobsServiceMock() as unknown as CostManagementJobsService,
      queue,
      () => workerMock(),
    );

    await scheduler.scheduleRecurringJobs();

    expect(queue.add).toHaveBeenCalledWith(
      CURRENCY_SYNC_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: CURRENCY_SYNC_JOB_NAME,
        repeat: {
          pattern: '0 * * * *',
        },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      ALERT_EVALUATOR_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: ALERT_EVALUATOR_JOB_NAME,
        repeat: {
          pattern: '*/15 * * * *',
        },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      SHARE_LINK_CLEANUP_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: SHARE_LINK_CLEANUP_JOB_NAME,
        repeat: {
          pattern: '0 3 * * *',
        },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      TEAM_AUDIT_EXPORT_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: TEAM_AUDIT_EXPORT_JOB_NAME,
        repeat: {
          pattern: '*/5 * * * *',
        },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      DATA_RETENTION_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: DATA_RETENTION_JOB_NAME,
        repeat: {
          pattern: '30 3 * * *',
        },
      }),
    );
  });

  it('starts a worker that dispatches to the matching job service method', async () => {
    const queue = queueMock();
    const worker = workerMock();
    const jobsService = jobsServiceMock();
    let capturedProcessor: ((job: { name: string }) => Promise<unknown>) | undefined;
    const scheduler = new CostManagementJobsScheduler(
      configService,
      jobsService as unknown as CostManagementJobsService,
      queue,
      (processor) => {
        capturedProcessor = processor;
        return worker;
      },
    );

    await scheduler.onModuleInit();

    if (!capturedProcessor) {
      throw new Error('Expected worker processor to be captured');
    }
    await capturedProcessor({ name: CURRENCY_SYNC_JOB_NAME });
    await capturedProcessor({ name: ALERT_EVALUATOR_JOB_NAME });
    await capturedProcessor({ name: SHARE_LINK_CLEANUP_JOB_NAME });
    await capturedProcessor({ name: TEAM_AUDIT_EXPORT_JOB_NAME });
    await capturedProcessor({ name: DATA_RETENTION_JOB_NAME });

    expect(jobsService.syncCurrencyRates).toHaveBeenCalledWith('USD');
    expect(jobsService.evaluateBudgetAlerts).toHaveBeenCalledTimes(1);
    expect(jobsService.cleanupExpiredShareLinks).toHaveBeenCalledTimes(1);
    expect(jobsService.flushPendingAuditExports).toHaveBeenCalledTimes(1);
    // DB-2 sweep runs with the configured policy and defaults to report-only.
    expect(jobsService.runDataRetentionSweep).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'report-only',
        maxRowsPerTable: 50000,
        windows: expect.objectContaining({ teamAuditEventDays: 2555 }),
      }),
    );
  });

  it('closes worker and queue on module destroy', async () => {
    const queue = queueMock();
    const worker = workerMock();
    const scheduler = new CostManagementJobsScheduler(
      configService,
      jobsServiceMock() as unknown as CostManagementJobsService,
      queue,
      () => worker,
    );

    await scheduler.onModuleInit();
    await scheduler.onModuleDestroy();

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });
});

function queueMock(): CostManagementQueue {
  return {
    add: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };
}

function workerMock(): CostManagementWorker {
  return {
    close: jest.fn(async () => undefined),
  };
}

function jobsServiceMock() {
  return {
    runDataRetentionSweep: jest.fn(async () => ({
      status: 'success',
      mode: 'report-only',
      ranAt: '2026-08-26T00:00:00.000Z',
      totalEligibleRows: 0,
      totalDeletedRows: 0,
      tables: [],
    })),
    syncCurrencyRates: jest.fn(async () => ({
      status: 'success',
    })),
    evaluateBudgetAlerts: jest.fn(async () => ({
      status: 'success',
    })),
    cleanupExpiredShareLinks: jest.fn(async () => ({
      status: 'success',
    })),
    flushPendingAuditExports: jest.fn(async () => ({
      status: 'success',
    })),
  };
}
