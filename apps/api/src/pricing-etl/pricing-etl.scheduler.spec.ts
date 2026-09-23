import { describe, it, expect, jest } from '@jest/globals';
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
      add: jest.fn<PricingEtlQueue['add']>(async () => undefined),
      upsertJobScheduler: jest.fn<PricingEtlQueue['upsertJobScheduler']>(async () => undefined),
      getJobSchedulers: jest.fn<PricingEtlQueue['getJobSchedulers']>(async () => []),
      removeJobScheduler: jest.fn<PricingEtlQueue['removeJobScheduler']>(async () => true),
      close: jest.fn<PricingEtlQueue['close']>(async () => undefined),
    };
    const worker: PricingEtlWorker = {
      close: jest.fn<PricingEtlWorker['close']>(async () => undefined),
    };
    const etlService = {
      refreshAllProviders: jest.fn<PricingEtlService['refreshAllProviders']>(async () => summary),
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

    /*
      BullMQ 6: the recurring refresh is a job SCHEDULER keyed on its id, not a
      `queue.add` carrying `repeat`. The template name is asserted because that
      is what the worker switches on - a scheduler that stamped out jobs named
      after the scheduler id instead would still register cleanly and then
      never match.
    */
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      PRICING_ETL_REFRESH_JOB_NAME,
      { pattern: '0 2 * * *' },
      expect.objectContaining({
        name: PRICING_ETL_REFRESH_JOB_NAME,
        data: {},
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
      add: jest.fn<PricingEtlQueue['add']>(async () => undefined),
      upsertJobScheduler: jest.fn<PricingEtlQueue['upsertJobScheduler']>(async () => undefined),
      getJobSchedulers: jest.fn<PricingEtlQueue['getJobSchedulers']>(async () => []),
      removeJobScheduler: jest.fn<PricingEtlQueue['removeJobScheduler']>(async () => true),
      close: jest.fn<PricingEtlQueue['close']>(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *', false),
      {
        refreshAllProviders: jest.fn<PricingEtlService['refreshAllProviders']>(async () => summary),
      } as unknown as PricingEtlService,
      queue,
      () => ({
        close: jest.fn(async () => undefined),
      }),
    );

    await scheduler.onModuleInit();

    /*
      The recurring schedule is still registered; only the one-off boot refresh
      is suppressed. Asserted as "no adds at all" rather than "one add", which
      is what this said before BullMQ 6 - back then the recurring registration
      was itself a queue.add, so the count conflated the two. Separating them
      is the point: a change that stopped scheduling the recurring refresh
      would have kept the old assertion green.
    */
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      PRICING_ETL_REFRESH_JOB_NAME,
      { pattern: '0 2 * * *' },
      expect.objectContaining({ name: PRICING_ETL_REFRESH_JOB_NAME }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('retires a BullMQ 5 scheduler left behind by the upgrade', async () => {
    /*
      Upgrading to BullMQ 6 does not replace the old repeatable entries, it
      adds alongside them. Observed against a live Redis that had run v5:
      getJobSchedulers() returned the v5 entry keyed by an opaque hash AND the
      new one keyed by the job name, same cron, same job name - so the pricing
      catalog would refresh twice a day instead of once. v6 removed
      removeRepeatable, so this is the only way to clear them.

      The legacy id below is a real one taken from that Redis.
    */
    const queue: PricingEtlQueue = {
      add: jest.fn<PricingEtlQueue['add']>(async () => undefined),
      upsertJobScheduler: jest.fn<PricingEtlQueue['upsertJobScheduler']>(async () => undefined),
      getJobSchedulers: jest.fn<PricingEtlQueue['getJobSchedulers']>(async () => [
        { key: PRICING_ETL_REFRESH_JOB_NAME },
        { key: 'c7310bf36b03dc34f57b19d9ed651c0b' },
      ]),
      removeJobScheduler: jest.fn<PricingEtlQueue['removeJobScheduler']>(async () => true),
      close: jest.fn<PricingEtlQueue['close']>(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *', false),
      {
        refreshAllProviders: jest.fn<PricingEtlService['refreshAllProviders']>(async () => summary),
      } as unknown as PricingEtlService,
      queue,
      () => ({ close: jest.fn(async () => undefined) }),
    );

    await scheduler.onModuleInit();

    expect(queue.removeJobScheduler).toHaveBeenCalledWith('c7310bf36b03dc34f57b19d9ed651c0b');
    // The one we just registered must survive - a cleanup that removed
    // everything it found would leave the queue with no schedule at all.
    expect(queue.removeJobScheduler).not.toHaveBeenCalledWith(PRICING_ETL_REFRESH_JOB_NAME);
    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
  });

  it('closes worker and queue on module destroy', async () => {
    const queue: PricingEtlQueue = {
      add: jest.fn<PricingEtlQueue['add']>(async () => undefined),
      upsertJobScheduler: jest.fn<PricingEtlQueue['upsertJobScheduler']>(async () => undefined),
      getJobSchedulers: jest.fn<PricingEtlQueue['getJobSchedulers']>(async () => []),
      removeJobScheduler: jest.fn<PricingEtlQueue['removeJobScheduler']>(async () => true),
      close: jest.fn<PricingEtlQueue['close']>(async () => undefined),
    };
    const worker: PricingEtlWorker = {
      close: jest.fn<PricingEtlWorker['close']>(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *'),
      {
        refreshAllProviders: jest.fn<PricingEtlService['refreshAllProviders']>(async () => summary),
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
      add: jest.fn<PricingEtlQueue['add']>(async () => undefined),
      upsertJobScheduler: jest.fn<PricingEtlQueue['upsertJobScheduler']>(async () => undefined),
      getJobSchedulers: jest.fn<PricingEtlQueue['getJobSchedulers']>(async () => []),
      removeJobScheduler: jest.fn<PricingEtlQueue['removeJobScheduler']>(async () => true),
      close: jest.fn<PricingEtlQueue['close']>(async () => undefined),
    };
    const scheduler = new PricingEtlScheduler(
      configService('0 2 * * *'),
      {
        refreshAllProviders: jest.fn<PricingEtlService['refreshAllProviders']>(async () => summary),
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
