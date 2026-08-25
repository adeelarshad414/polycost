import { BaseCloudProviderAdapter } from '../adapters/common/base-cloud-provider.adapter';
import {
  PricingCatalogRecord,
  PricingCatalogReader,
  ProviderId,
} from '../adapters/common/cloud-provider-adapter';
import { InMemoryPricingCatalogReader } from '../adapters/common/in-memory-pricing-catalog.reader';
import { ComparisonOrchestratorService } from '../comparison/comparison-orchestrator.service';
import { ComparisonResult } from '../comparison/comparison.types';
import { EquivalentServiceMapper } from '../comparison/equivalent-service-mapper';
import { IntervalCostCalculator } from '../comparison/interval-cost-calculator';
import {
  NormalizedPricingWriter,
  PricingCatalogWriter,
} from '../database/pricing-repository.types';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { ComparisonApplicationService } from './comparison-application.service';
import { ComparisonSnapshot } from './api-database.repository';
import { LivePricingRefreshService } from './live-pricing-refresh.service';

class TraceableTestAdapter extends BaseCloudProviderAdapter {
  readonly providerId: ProviderId = 'aws';

  constructor(
    catalogReader: PricingCatalogReader,
    private readonly refreshedRecord: PricingCatalogRecord,
  ) {
    super(catalogReader, 'us-east-1');
  }

  async refreshPricingCatalog(): Promise<PricingCatalogRecord[]> {
    return [this.refreshedRecord];
  }

  async refreshLivePricing(serviceIds: string[]): Promise<PricingCatalogRecord[]> {
    return serviceIds.includes(this.refreshedRecord.skuId) ? [this.refreshedRecord] : [];
  }
}

const workload: NormalizedWorkloadSpec = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-07-06T00:00:00.000Z',
  },
  workload: {
    type: 'web_app',
    region: {
      preference: 'us-east-1',
      isDefault: false,
    },
  },
  compute: [
    {
      role: 'api',
      vcpu: 2,
      memoryGb: 4,
      scalingType: 'fixed',
      instanceCount: 1,
    },
  ],
  storage: [],
  database: [],
  network: {
    cdn: false,
    loadBalancer: false,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
  },
};

const initialRecord: PricingCatalogRecord = {
  provider: 'aws',
  serviceCategory: 'compute',
  serviceName: 'Traceable EC2 shape',
  skuId: 'AWS-COMPUTE-TRACE',
  skuDescription: 'Traceability test compute hourly rate',
  region: 'us-east-1',
  unit: 'hour',
  unitPriceUsd: 0.05,
  attributes: {
    pricingModel: 'on-demand',
    vcpu: 2,
    memoryGb: 4,
    sourceEndpoint: 'fixture://aws/traceability/compute',
    rawSourceRecordId: 'aws-price-row-ec2-trace',
  },
  effectiveDate: '2026-07-01T00:00:00.000Z',
  fetchedAt: '2026-07-01T01:00:00.000Z',
};

const refreshedRecord: PricingCatalogRecord = {
  ...initialRecord,
  unitPriceUsd: 0.08,
  fetchedAt: '2026-07-06T01:00:00.000Z',
};

describe('live pricing traceability', () => {
  it('recomputes refreshed comparisons from the exact refreshed SKU row', async () => {
    const catalog = [initialRecord];
    const reader = new InMemoryPricingCatalogReader(catalog);
    const adapter = new TraceableTestAdapter(reader, refreshedRecord);
    const snapshotStore: { current?: ComparisonSnapshot } = {};
    let comparisonCounter = 0;
    const orchestrator = new ComparisonOrchestratorService(
      [adapter],
      new IntervalCostCalculator(),
      new EquivalentServiceMapper(),
      () => `comparison-${(comparisonCounter += 1).toString()}`,
      () => new Date('2026-07-06T12:00:00.000Z'),
    );
    const liveRefresh = new LivePricingRefreshService(
      [adapter],
      mutableCatalogWriter(catalog),
      normalizedWriterMock(),
    );
    const repository = {
      saveComparisonWithAuditLog: jest.fn(
        async (nwsSnapshot: NormalizedWorkloadSpec, resultSnapshot: ComparisonResult) => {
          snapshotStore.current = {
            nwsSnapshot,
            resultSnapshot,
          };
        },
      ),
      recordComparisonAuditLog: jest.fn(async () => undefined),
      getComparison: jest.fn(async () => snapshotStore.current),
      getPricingStatus: jest.fn(async () => ({ providers: [] })),
      getDataHealth: jest.fn(async () => ({
        generatedAt: '2026-07-06T12:00:00.000Z',
        freshnessPolicyHours: 48,
        overallStatus: 'fresh',
        alertCount: 0,
        alerts: [],
        providers: [],
      })),
    };
    const service = new ComparisonApplicationService(
      orchestrator,
      repository as never,
      liveRefresh,
    );

    const initial = await service.createComparison(workload);
    const initialEvidence = await service.getComparisonPricingEvidence(initial.comparisonId);
    const refreshed = await service.refreshLiveComparison(initial.comparisonId, true);
    const refreshedEvidence = await service.getComparisonPricingEvidence(refreshed.comparisonId);
    const initialEvidenceRow = initialEvidence.evidence[0]!;
    const refreshedEvidenceRow = refreshedEvidence.evidence[0]!;

    expect(initial.providers[0].totals.monthly).toBe(36.5);
    expect(refreshed.providers[0].totals.monthly).toBe(58.4);
    expect(refreshed.providers[0].lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'AWS-COMPUTE-TRACE',
        unitPriceUsd: 0.08,
        rateSourceFetchedAt: '2026-07-06T01:00:00.000Z',
        pricingTrace: expect.objectContaining({
          source: 'pricing_catalog',
          sourceRecordKey: 'aws|compute|AWS-COMPUTE-TRACE|us-east-1|hour|2026-07-01T00:00:00.000Z',
          sourceSkuId: 'AWS-COMPUTE-TRACE',
          unitPriceUsd: 0.08,
          fetchedAt: '2026-07-06T01:00:00.000Z',
          isEstimate: false,
        }),
      }),
    );
    expect(initialEvidenceRow.displayedAmounts.monthlyCostUsd).toBe(36.5);
    expect(initialEvidenceRow.rate).toEqual(
      expect.objectContaining({
        sourceEndpoint: 'fixture://aws/traceability/compute',
        sourceRecordId: 'aws-price-row-ec2-trace',
        unitPriceUsd: 0.05,
        fetchedAt: '2026-07-01T01:00:00.000Z',
      }),
    );
    expect(initialEvidenceRow.rate.sourcePayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshedEvidenceRow).toEqual(
      expect.objectContaining({
        displayedAmounts: expect.objectContaining({
          monthlyCostUsd: 58.4,
          hourlyCostUsd: 0.08,
        }),
        sku: expect.objectContaining({
          resolvedSkuId: 'AWS-COMPUTE-TRACE',
          sourceSkuId: 'AWS-COMPUTE-TRACE',
          providerServiceName: 'Traceable EC2 shape',
        }),
        rate: expect.objectContaining({
          source: 'pricing_catalog',
          sourceEndpoint: 'fixture://aws/traceability/compute',
          sourceRecordId: 'aws-price-row-ec2-trace',
          unitPriceUsd: 0.08,
          fetchedAt: '2026-07-06T01:00:00.000Z',
        }),
        derivation: expect.objectContaining({
          monthlyCostUsd: 58.4,
          hourlyCostUsd: 0.08,
          monthlyHours: 730,
        }),
        equivalence: {
          confidence: 'direct',
          isApproximate: false,
          isEstimate: false,
        },
      }),
    );
    expect(refreshedEvidenceRow.rate.sourcePayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshedEvidenceRow.rate.sourcePayloadHash).not.toBe(
      initialEvidenceRow.rate.sourcePayloadHash,
    );
  });
});

function mutableCatalogWriter(records: PricingCatalogRecord[]): PricingCatalogWriter {
  return {
    upsertPricingRecords: jest.fn(async (updates) => {
      for (const update of updates) {
        const index = records.findIndex(
          (record) =>
            record.provider === update.provider &&
            record.skuId === update.skuId &&
            record.region === update.region &&
            record.effectiveDate === update.effectiveDate,
        );

        if (index === -1) {
          records.push(update);
        } else {
          records.splice(index, 1, update);
        }
      }

      return {
        recordsUpdated: updates.length,
        recordsRejected: 0,
      };
    }),
  };
}

function normalizedWriterMock(): NormalizedPricingWriter {
  return {
    upsertNormalizedPricingRecords: jest.fn(async (records) => ({
      recordsUpdated: records.length,
      recordsRejected: 0,
      recordsSkipped: 0,
    })),
  };
}
