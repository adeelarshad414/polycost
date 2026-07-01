import { ComparisonResult } from '../comparison/comparison.types';
import { PricingMatrixService } from '../pricing-models/pricing-matrix.service';
import { RateResult } from '../pricing-models/pricing-models.types';
import { ApiDatabaseRepository, ComparisonPrewarmJobRecord } from './api-database.repository';
import { ComparisonPrewarmService, comparisonPrewarmRequests } from './comparison-prewarm.service';

const comparisonId = '11111111-1111-4111-8111-111111111111';
const jobId = '77777777-7777-4777-8777-777777777777';

const result: ComparisonResult = {
  comparisonId,
  pricingAsOf: '2026-07-01T00:00:00.000Z',
  cheapestProviderId: 'aws',
  providers: [
    {
      providerId: 'aws',
      totals: {
        daily: 10,
        weekly: 70,
        monthly: 300,
        quarterly: 900,
        yearly: 3600,
      },
      lineItems: [
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'web compute',
          isApproximate: false,
          baseMonthlyCostUsd: 120,
          skuId: 'm7i.large',
          region: 'us-east-1',
        },
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'web compute duplicate',
          isApproximate: false,
          baseMonthlyCostUsd: 120,
          skuId: 'm7i.large',
          region: 'us-east-1',
        },
        {
          category: 'storage',
          costComponent: 'storage',
          description: 'object storage',
          isApproximate: false,
          baseMonthlyCostUsd: 10,
          skuId: 's3-standard',
          region: 'us-east-1',
        },
      ],
    },
  ],
};

const prewarmJob: ComparisonPrewarmJobRecord = {
  jobId,
  comparisonId,
  status: 'pending',
  requestedCombinations: 8,
  warmedCombinations: 0,
  failedCombinations: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('ComparisonPrewarmService', () => {
  it('derives de-duplicated compute pricing-model prewarm requests', () => {
    expect(comparisonPrewarmRequests(result)).toEqual([
      expect.objectContaining({
        provider: 'aws',
        service: 'compute',
        region: 'us-east-1',
        pricingModel: 'on_demand',
        granularity: 'monthly',
      }),
      expect.objectContaining({
        pricingModel: 'on_demand',
        granularity: 'yearly',
      }),
      expect.objectContaining({
        pricingModel: 'on_demand',
        granularity: 'hourly',
      }),
      expect.objectContaining({
        pricingModel: 'reserved_1yr',
        paymentOption: 'no_upfront',
        granularity: 'monthly',
      }),
      expect.objectContaining({
        pricingModel: 'reserved_3yr',
        paymentOption: 'no_upfront',
        granularity: 'monthly',
      }),
      expect.objectContaining({
        pricingModel: 'reserved_3yr',
        paymentOption: 'no_upfront',
        granularity: 'yearly',
      }),
      expect.objectContaining({
        pricingModel: 'savings_plan_1yr',
        paymentOption: 'no_upfront',
        granularity: 'monthly',
      }),
      expect.objectContaining({
        pricingModel: 'spot_estimate',
        granularity: 'monthly',
      }),
    ]);
  });

  it('enqueues background work without blocking the caller', () => {
    const scheduled: Array<() => void> = [];
    const service = createService(undefined, undefined, {
      scheduler: (task) => scheduled.push(task),
    });

    service.enqueue(result);

    expect(scheduled).toHaveLength(1);
  });

  it('records a completed prewarm job after all common pricing combinations resolve', async () => {
    const repository = repositoryMock();
    const pricingMatrixService = pricingMatrixServiceMock();
    const service = createService(repository, pricingMatrixService);

    await expect(service.processComparison(result)).resolves.toEqual({
      comparisonId,
      jobId,
      requestedCombinations: 8,
      warmedCombinations: 8,
      failedCombinations: 0,
    });
    expect(repository.createComparisonPrewarmJob).toHaveBeenCalledWith({
      comparisonId,
      requestedCombinations: 8,
    });
    expect(repository.markComparisonPrewarmJobRunning).toHaveBeenCalledWith(
      jobId,
      '2026-07-01T00:00:00.000Z',
    );
    expect(pricingMatrixService.resolveRate).toHaveBeenCalledTimes(8);
    expect(repository.finishComparisonPrewarmJob).toHaveBeenCalledWith(jobId, {
      status: 'completed',
      warmedCombinations: 8,
      failedCombinations: 0,
      completedAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('records failed combinations without failing the comparison response path', async () => {
    const repository = repositoryMock();
    const pricingMatrixService = pricingMatrixServiceMock({
      resolveRate: jest
        .fn()
        .mockRejectedValueOnce(new Error('reserved rate missing'))
        .mockResolvedValue(rateResult()),
    });
    const service = createService(repository, pricingMatrixService);

    await expect(service.processComparison(result)).resolves.toEqual({
      comparisonId,
      jobId,
      requestedCombinations: 8,
      warmedCombinations: 7,
      failedCombinations: 1,
      errorMessage: 'reserved rate missing',
    });
    expect(repository.finishComparisonPrewarmJob).toHaveBeenCalledWith(jobId, {
      status: 'completed',
      warmedCombinations: 7,
      failedCombinations: 1,
      completedAt: '2026-07-01T00:00:00.000Z',
      errorMessage: 'reserved rate missing',
    });
  });
});

function createService(
  repository = repositoryMock(),
  pricingMatrixService = pricingMatrixServiceMock(),
  options: {
    scheduler?: (task: () => void) => void;
  } = {},
): ComparisonPrewarmService {
  return new ComparisonPrewarmService(
    repository,
    pricingMatrixService,
    () => new Date('2026-07-01T00:00:00.000Z'),
    options.scheduler ?? (() => undefined),
  );
}

function repositoryMock(
  overrides: Partial<Record<keyof ApiDatabaseRepository, unknown>> = {},
): jest.Mocked<ApiDatabaseRepository> {
  return {
    createComparisonPrewarmJob: jest.fn(async () => prewarmJob),
    markComparisonPrewarmJobRunning: jest.fn(async () => undefined),
    finishComparisonPrewarmJob: jest.fn(async () => undefined),
    ...overrides,
  } as unknown as jest.Mocked<ApiDatabaseRepository>;
}

function pricingMatrixServiceMock(
  overrides: Partial<Record<keyof PricingMatrixService, unknown>> = {},
): jest.Mocked<PricingMatrixService> {
  return {
    resolveRate: jest.fn(async () => rateResult()),
    ...overrides,
  } as unknown as jest.Mocked<PricingMatrixService>;
}

function rateResult(): RateResult {
  return {
    schemaVersion: 2,
    provider: 'aws',
    service: 'general-purpose',
    skuId: 'sku-1',
    providerSkuId: 'm7i.large',
    region: 'us-east-1',
    pricingTerm: {
      code: 'on_demand',
      label: 'On-demand',
      requiresPaymentOption: false,
      isEstimateOnly: false,
    },
    granularity: 'monthly',
    hourlyRateUsd: 0.1,
    amountUsd: 73,
    currency: 'USD',
    intervals: {
      hourly: 0.1,
      daily: 2.4,
      weekly: 16.8,
      monthly: 73,
      yearly: 876,
    },
    isEstimate: false,
    lastFetchedAt: '2026-07-01T00:00:00.000Z',
    validFrom: '2026-07-01T00:00:00.000Z',
    source: 'pricing_rates',
  };
}
