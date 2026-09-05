import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema.js';
import { PricingEtlService } from './pricing-etl.service.js';
import {
  PRICING_ETL_REFRESH_JOB_NAME,
  PRICING_ETL_STARTUP_REFRESH_JOB_ID,
  PricingEtlSummary,
} from './pricing-etl.types.js';
import { PricingEtlQueue, PricingEtlScheduler, PricingEtlWorker } from './pricing-etl.scheduler.js';

const configService = (cron: string, runOnBoot = true) =>
  ({
    get: jest.fn((key: keyof AppConfig) => {
      if (key === 'PRICING_ETL_SCHEDULE_CRON') {
        return cron;
      }
      if (key === 'PRICING_ETL_RUN_ON_BOOT') {
        return runOnBoot;
      }

      throw new Error(`Unexpected config key ${String(key)}`);
    }),
  }) as unknown as ConfigService<AppConfig, true>;

const summary: PricingEtlSummary = {
  status: 'success',
  providerResults: [],
};

describe('PricingEtlScheduler', () => {
  it('schedules recurring and startup BullMQ jobs from config and starts a worker', async () => {
    const queue: PricingEtlQueue = {
      add: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    };
    const worker: PricingEtlWorker = {
      close: jest.fn(async () => undefined),
    };
    const etlService = {
      refreshAllProviders: jest.fn(async () => summary),
    } as unknown as PricingEtlService;
    let capturedProcessor: (() => Promise<PricingEtlSummary>) | undefined;
    const workerFactory = jest.fn((processor: () => Promise<PricingEtlSummary>) => {
      capturedProcessor = processor;
      return worker;
    });
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *'),
      etlService,
      queue,
      workerFactory,
    );

    await scheduler.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(
      PRICING_ETL_REFRESH_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: PRICING_ETL_REFRESH_JOB_NAME,
        repeat: {
          pattern: '0 2 * * *',
        },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      PRICING_ETL_REFRESH_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: PRICING_ETL_STARTUP_REFRESH_JOB_ID,
      }),
    );
    expect(workerFactory).toHaveBeenCalledTimes(1);
    if (!capturedProcessor) {
      throw new Error('Expected the scheduler to register a worker processor');
    }
    await expect(capturedProcessor()).resolves.toBe(summary);
  });

  it('can disable startup refresh for scheduled-only deployments', async () => {
    const queue: PricingEtlQueue = {
      add: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *', false),
      {
        refreshAllProviders: jest.fn(async () => summary),
      } as unknown as PricingEtlService,
      queue,
      () => ({
        close: jest.fn(async () => undefined),
      }),
    );

    await scheduler.onModuleInit();

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      PRICING_ETL_REFRESH_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: PRICING_ETL_REFRESH_JOB_NAME,
      }),
    );
  });

  it('closes worker and queue on module destroy', async () => {
    const queue: PricingEtlQueue = {
      add: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    };
    const worker: PricingEtlWorker = {
      close: jest.fn(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *'),
      {
        refreshAllProviders: jest.fn(async () => summary),
      } as unknown as PricingEtlService,
      queue,
      () => worker,
    );

    await scheduler.onModuleInit();
    await scheduler.onModuleDestroy();

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it('closes the queue even if the worker was never started', async () => {
    const queue: PricingEtlQueue = {
      add: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *'),
      {
        refreshAllProviders: jest.fn(async () => summary),
      } as unknown as PricingEtlService,
      queue,
      () => ({
        close: jest.fn(async () => undefined),
      }),
    );

    await scheduler.onModuleDestroy();

    expect(queue.close).toHaveBeenCalledTimes(1);
  });
});
