import { ApiDatabaseRepository } from '../api/api-database.repository';
import {
  BudgetEvaluationRecord,
  CostObservationRecord,
  WorkloadCostBreakdown,
} from '../api/cost-management.types';
import { ExchangeRateClient } from './exchange-rate.client';
import { CostManagementJobsService } from './cost-management-jobs.service';

const budgetRecord: BudgetEvaluationRecord = {
  budget: {
    id: '11111111-1111-4111-8111-111111111111',
    workloadId: '22222222-2222-4222-8222-222222222222',
    thresholdUsd: 900,
    alertOnAnomalyPercent: 20,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
  },
  workload: {
    id: '22222222-2222-4222-8222-222222222222',
    instanceFamily: 'general-purpose',
    vcpu: 4,
    memoryGb: 16,
    region: 'us-east',
    instanceCount: 2,
    hoursPerMonth: 730,
    storageGb: 500,
    storageTier: 'standard',
    egressGbPerMonth: 1200,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
  },
};

const breakdown: WorkloadCostBreakdown = {
  workloadId: budgetRecord.workload.id,
  term: 'on_demand',
  providers: [
    {
      provider: 'aws',
      region: 'us-east-1',
      compute: 500,
      storage: 75,
      egress: 75,
      total: 650,
      currency: 'USD',
    },
    {
      provider: 'azure',
      region: 'eastus',
      compute: 750,
      storage: 100,
      egress: 100,
      total: 950,
      currency: 'USD',
    },
  ],
};

const observation: CostObservationRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  workloadId: budgetRecord.workload.id,
  budgetId: budgetRecord.budget.id,
  term: 'on_demand',
  provider: 'aws',
  observedMonthlyUsd: 650,
  source: 'modeled_cache',
  observedAt: '2026-06-30T00:00:00.000Z',
};

describe('CostManagementJobsService', () => {
  it('syncs currency rates into the cached exchange-rate table', async () => {
    const repository = repositoryMock({
      upsertExchangeRates: jest.fn(async () => 2),
    });
    const exchangeRateClient: ExchangeRateClient = {
      fetchLatest: jest.fn(async () => ({
        baseCurrency: 'USD',
        rates: {
          EUR: 0.87673,
          GBP: 0.75587,
        },
        source: 'https://api.frankfurter.app/latest',
        fetchedAt: '2026-06-30T00:00:00.000Z',
      })),
    };
    const service = new CostManagementJobsService(
      repository as unknown as ApiDatabaseRepository,
      exchangeRateClient,
    );

    await expect(service.syncCurrencyRates()).resolves.toEqual({
      status: 'success',
      baseCurrency: 'USD',
      quoteCurrencyCount: 2,
      recordsUpdated: 2,
      fetchedAt: '2026-06-30T00:00:00.000Z',
      source: 'https://api.frankfurter.app/latest',
    });
    expect(repository.upsertExchangeRates).toHaveBeenCalledWith({
      baseCurrency: 'USD',
      rates: {
        EUR: 0.87673,
        GBP: 0.75587,
      },
      source: 'https://api.frankfurter.app/latest',
      fetchedAt: '2026-06-30T00:00:00.000Z',
    });
  });

  it('records modeled spend and creates threshold/anomaly alerts', async () => {
    const repository = repositoryMock({
      getWorkloadCostBreakdown: jest.fn(async () => ({
        ...breakdown,
        providers: [
          {
            ...breakdown.providers[0],
            total: 1200,
          },
          breakdown.providers[1],
        ],
      })),
      insertCostObservation: jest.fn(async () => ({
        ...observation,
        observedMonthlyUsd: 950,
      })),
      getLatestCostObservationBefore: jest.fn(async () => ({
        ...observation,
        observedMonthlyUsd: 600,
      })),
      createAlertIfNotActive: jest
        .fn()
        .mockResolvedValueOnce({
          id: '44444444-4444-4444-8444-444444444444',
        })
        .mockResolvedValueOnce({
          id: '55555555-5555-4555-8555-555555555555',
        }),
    });
    const service = new CostManagementJobsService(
      repository as unknown as ApiDatabaseRepository,
      exchangeRateClientMock(),
    );

    await expect(service.evaluateBudgetAlerts()).resolves.toEqual({
      status: 'success',
      budgetsEvaluated: 1,
      observationsCreated: 1,
      alertsCreated: 2,
      budgetsSkippedWithoutPricing: 0,
    });
    expect(repository.insertCostObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        workloadId: budgetRecord.workload.id,
        budgetId: budgetRecord.budget.id,
        provider: 'azure',
        observedMonthlyUsd: 950,
      }),
    );
    expect(repository.createAlertIfNotActive).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: 'budget_threshold',
        thresholdUsd: 900,
        observedUsd: 950,
      }),
    );
    expect(repository.createAlertIfNotActive).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: 'anomaly',
        anomalyPercent: 58.33,
      }),
    );
  });

  it('skips budget alerts when cached pricing cannot produce a non-zero modeled total', async () => {
    const repository = repositoryMock({
      getWorkloadCostBreakdown: jest.fn(async () => ({
        ...breakdown,
        providers: breakdown.providers.map((provider) => ({
          ...provider,
          total: 0,
        })),
      })),
    });
    const service = new CostManagementJobsService(
      repository as unknown as ApiDatabaseRepository,
      exchangeRateClientMock(),
    );

    await expect(service.evaluateBudgetAlerts()).resolves.toEqual({
      status: 'success',
      budgetsEvaluated: 1,
      observationsCreated: 0,
      alertsCreated: 0,
      budgetsSkippedWithoutPricing: 1,
    });
    expect(repository.insertCostObservation).not.toHaveBeenCalled();
  });

  it('flushes pending team audit exports through the audit export service', async () => {
    const auditExportService = {
      flushPendingExports: jest.fn(async () => ({
        status: 'success' as const,
        claimed: 2,
        delivered: 2,
        failed: 0,
        deadLettered: 0,
        ranAt: '2026-07-08T00:00:00.000Z',
      })),
    };
    const service = new CostManagementJobsService(
      repositoryMock() as unknown as ApiDatabaseRepository,
      exchangeRateClientMock(),
      auditExportService as never,
    );

    await expect(service.flushPendingAuditExports()).resolves.toEqual({
      status: 'success',
      claimed: 2,
      delivered: 2,
      failed: 0,
      deadLettered: 0,
      ranAt: '2026-07-08T00:00:00.000Z',
    });
    expect(auditExportService.flushPendingExports).toHaveBeenCalledTimes(1);
  });
});

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    upsertExchangeRates: jest.fn(async () => 0),
    listBudgetsForEvaluation: jest.fn(async () => [budgetRecord]),
    getWorkloadCostBreakdown: jest.fn(async () => breakdown),
    insertCostObservation: jest.fn(async () => observation),
    getLatestCostObservationBefore: jest.fn(async () => undefined),
    createAlertIfNotActive: jest.fn(async () => undefined),
    cleanupExpiredShareLinks: jest.fn(async () => 0),
    ...overrides,
  };
}

function exchangeRateClientMock(): ExchangeRateClient {
  return {
    fetchLatest: jest.fn(async () => ({
      baseCurrency: 'USD',
      rates: {
        EUR: 0.87673,
      },
      source: 'https://api.frankfurter.app/latest',
      fetchedAt: '2026-06-30T00:00:00.000Z',
    })),
  };
}
