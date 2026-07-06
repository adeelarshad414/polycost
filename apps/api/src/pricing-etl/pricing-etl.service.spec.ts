import { Logger } from '@nestjs/common';
import {
  CloudProviderAdapter,
  PricingCatalogRecord,
} from '../adapters/common/cloud-provider-adapter';
import {
  NormalizedPricingWriter,
  PricingCatalogWriter,
  PricingEtlRunRepository,
} from '../database/pricing-repository.types';
import { PricingEtlService } from './pricing-etl.service';

const adapter = (
  providerId: CloudProviderAdapter['providerId'],
  refreshPricingCatalog: CloudProviderAdapter['refreshPricingCatalog'],
): CloudProviderAdapter => ({
  providerId,
  refreshPricingCatalog,
  refreshLivePricing: jest.fn(async () => []),
  priceWorkload: jest.fn(async () => ({
    providerId,
    lineItems: [],
    baseMonthlyCostUsd: 0,
  })),
});

const fixedClock = () => {
  const dates = [
    new Date('2026-06-28T00:00:00.000Z'),
    new Date('2026-06-28T00:00:01.000Z'),
    new Date('2026-06-28T00:00:02.000Z'),
    new Date('2026-06-28T00:00:03.000Z'),
    new Date('2026-06-28T00:00:04.000Z'),
    new Date('2026-06-28T00:00:05.000Z'),
  ];
  return jest.fn(() => dates.shift() ?? new Date('2026-06-28T00:00:09.000Z'));
};

const singleAttemptRetry = { maxAttempts: 1 };

const createCatalogRecord = (
  provider: PricingCatalogRecord['provider'],
  skuId: string,
): PricingCatalogRecord => ({
  provider,
  serviceCategory: 'compute',
  serviceName: `${provider} compute`,
  skuId,
  region: provider === 'azure' ? 'eastus' : provider === 'gcp' ? 'us-central1' : 'us-east-1',
  unit: 'hour',
  unitPriceUsd: 0.01,
  effectiveDate: '2026-01-01T00:00:00.000Z',
  fetchedAt: '2026-06-28T00:00:00.000Z',
});

describe('PricingEtlService', () => {
  it('refreshes every provider, persists records, and logs success independently', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async (records) => ({
        recordsUpdated: records.length,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => [createCatalogRecord('aws', 'AWS-1')]),
        ),
        adapter(
          'azure',
          jest.fn(async () => [createCatalogRecord('azure', 'AZURE-1')]),
        ),
        adapter(
          'gcp',
          jest.fn(async () => [createCatalogRecord('gcp', 'GCP-1')]),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
    );

    const summary = await service.refreshAllProviders();

    expect(summary.status).toBe('success');
    expect(writer.upsertPricingRecords).toHaveBeenCalledTimes(3);
    expect(runRepository.recordProviderRun).toHaveBeenCalledTimes(3);
    expect(runRepository.recordProviderRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'aws',
        status: 'success',
        recordsUpdated: 1,
      }),
    );
  });

  it('retries transient provider refresh failures before recording success', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async (records) => ({
        recordsUpdated: records.length,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const refreshPricingCatalog = jest.fn() as jest.MockedFunction<
      CloudProviderAdapter['refreshPricingCatalog']
    >;
    refreshPricingCatalog
      .mockRejectedValueOnce(new Error('provider throttled'))
      .mockResolvedValueOnce([createCatalogRecord('aws', 'AWS-1')]);
    const retryDelay = jest.fn(async () => undefined);
    const service = new PricingEtlService(
      [adapter('aws', refreshPricingCatalog)],
      writer,
      runRepository,
      fixedClock(),
      undefined,
      undefined,
      {
        maxAttempts: 2,
        baseDelayMs: 25,
        delay: retryDelay,
      },
    );

    const summary = await service.refreshAllProviders();

    expect(summary.status).toBe('success');
    expect(refreshPricingCatalog).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenCalledWith(25);
    expect(runRepository.recordProviderRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'aws',
        status: 'success',
        recordsUpdated: 1,
      }),
    );
  });

  it('persists normalized pricing rows during each provider refresh', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async (records) => ({
        recordsUpdated: records.length,
        recordsRejected: 0,
      })),
    };
    const normalizedWriter: NormalizedPricingWriter = {
      upsertNormalizedPricingRecords: jest.fn(async () => ({
        recordsUpdated: 2,
        recordsRejected: 0,
        recordsSkipped: 1,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => [createCatalogRecord('aws', 'AWS-1')]),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
      normalizedWriter,
    );

    const summary = await service.refreshAllProviders();

    expect(summary.providerResults[0]).toEqual(
      expect.objectContaining({
        provider: 'aws',
        status: 'success',
        recordsUpdated: 3,
        recordsRejected: 0,
        recordsSkipped: 1,
      }),
    );
    expect(runRepository.recordProviderRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'aws',
        recordsUpdated: 3,
        recordsRejected: 0,
        recordsSkipped: 1,
      }),
    );
    expect(normalizedWriter.upsertNormalizedPricingRecords).toHaveBeenCalledWith([
      createCatalogRecord('aws', 'AWS-1'),
    ]);
  });

  it('returns a partial summary when one provider fails and logs all outcomes', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async (records) => ({
        recordsUpdated: records.length,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => [createCatalogRecord('aws', 'AWS-1')]),
        ),
        adapter(
          'azure',
          jest.fn(async () => [createCatalogRecord('azure', 'AZURE-1')]),
        ),
        adapter(
          'gcp',
          jest.fn(async () => {
            throw new Error('GCP catalog unavailable');
          }),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
      undefined,
      undefined,
      singleAttemptRetry,
    );

    const summary = await service.refreshAllProviders();

    expect(summary.status).toBe('partial');
    expect(summary.providerResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'gcp',
          status: 'failed',
          recordsUpdated: 0,
          errorDetail: 'GCP catalog unavailable',
        }),
        expect.objectContaining({
          provider: 'aws',
          status: 'success',
        }),
      ]),
    );
    expect(runRepository.recordProviderRun).toHaveBeenCalledTimes(3);
  });

  it('notifies configured alerting when a provider sync fails', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async (records) => ({
        recordsUpdated: records.length,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const notifier = {
      notifyProviderResult: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => [createCatalogRecord('aws', 'AWS-1')]),
        ),
        adapter(
          'gcp',
          jest.fn(async () => {
            throw new Error('GCP catalog unavailable');
          }),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
      undefined,
      notifier,
      singleAttemptRetry,
    );

    await expect(service.refreshAllProviders()).resolves.toEqual(
      expect.objectContaining({
        status: 'partial',
      }),
    );
    expect(notifier.notifyProviderResult).toHaveBeenCalledTimes(1);
    expect(notifier.notifyProviderResult).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gcp',
        status: 'failed',
        errorDetail: 'GCP catalog unavailable',
      }),
    );
  });

  it('keeps ETL summaries intact when alert notification delivery fails', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async (records) => ({
        recordsUpdated: records.length,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const notifier = {
      notifyProviderResult: jest.fn(async () => {
        throw new Error('webhook unavailable');
      }),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => [createCatalogRecord('aws', 'AWS-1')]),
        ),
        adapter(
          'gcp',
          jest.fn(async () => {
            throw new Error('GCP catalog unavailable');
          }),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
      undefined,
      notifier,
      singleAttemptRetry,
    );

    await expect(service.refreshAllProviders()).resolves.toEqual(
      expect.objectContaining({
        status: 'partial',
        providerResults: expect.arrayContaining([
          expect.objectContaining({
            provider: 'aws',
            status: 'success',
          }),
          expect.objectContaining({
            provider: 'gcp',
            status: 'failed',
            errorDetail: 'GCP catalog unavailable',
          }),
        ]),
      }),
    );
    expect(runRepository.recordProviderRun).toHaveBeenCalledTimes(2);
    expect(notifier.notifyProviderResult).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pricing_sync_alert_notification_failed',
        provider: 'gcp',
        status: 'failed',
        error: 'webhook unavailable',
      }),
    );
    loggerSpy.mockRestore();
  });

  it('marks a provider run partial when some catalog rows are rejected', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async () => ({
        recordsUpdated: 1,
        recordsRejected: 2,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => [createCatalogRecord('aws', 'AWS-1')]),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
    );

    const summary = await service.refreshAllProviders();

    expect(summary.status).toBe('partial');
    expect(summary.providerResults[0]).toEqual(
      expect.objectContaining({
        provider: 'aws',
        status: 'partial',
        recordsUpdated: 1,
        recordsRejected: 2,
        errorDetail: '2 pricing records were rejected',
      }),
    );
  });

  it('returns failed when every provider fails and truncates long error details', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async () => ({
        recordsUpdated: 0,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'aws',
          jest.fn(async () => {
            throw new Error('x'.repeat(2500));
          }),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
      undefined,
      undefined,
      singleAttemptRetry,
    );

    const summary = await service.refreshAllProviders();

    expect(summary.status).toBe('failed');
    expect(summary.providerResults[0].errorDetail).toHaveLength(2000);
  });

  it('uses a safe error message when a provider rejects without an Error object', async () => {
    const writer: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async () => ({
        recordsUpdated: 0,
        recordsRejected: 0,
      })),
    };
    const runRepository: PricingEtlRunRepository = {
      recordProviderRun: jest.fn(async () => undefined),
    };
    const service = new PricingEtlService(
      [
        adapter(
          'azure',
          jest.fn(() => Promise.reject('provider timeout')),
        ),
      ],
      writer,
      runRepository,
      fixedClock(),
      undefined,
      undefined,
      singleAttemptRetry,
    );

    const summary = await service.refreshAllProviders();

    expect(summary.status).toBe('failed');
    expect(summary.providerResults[0]).toEqual(
      expect.objectContaining({
        provider: 'azure',
        status: 'failed',
        errorDetail: 'Unknown provider refresh error',
      }),
    );
  });
});
