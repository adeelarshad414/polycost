import {
  CloudProviderAdapter,
  PricingCatalogRecord,
} from '../adapters/common/cloud-provider-adapter';
import {
  NormalizedPricingWriter,
  PricingCatalogWriter,
} from '../database/pricing-repository.types';
import { LiveRefreshUnavailableError } from './api-errors';
import { ComparisonSnapshot } from './api-database.repository';
import { LivePricingRefreshService, livePricingReferences } from './live-pricing-refresh.service';
import { CircuitBreakerRegistry } from '../adapters/common/circuit-breaker';

const liveRecord: PricingCatalogRecord = {
  provider: 'aws',
  serviceCategory: 'compute',
  serviceName: 'Amazon EC2',
  skuId: 'AWS-COMPUTE-1',
  region: 'us-east-1',
  unit: 'hour',
  unitPriceUsd: 0.05,
  effectiveDate: '2026-06-30T00:00:00.000Z',
  fetchedAt: '2026-06-30T01:00:00.000Z',
};

const snapshot: ComparisonSnapshot = {
  nwsSnapshot: {
    schemaVersion: '1.0',
    metadata: {
      sourceType: 'structured_form',
      createdAt: '2026-06-29T00:00:00.000Z',
    },
    workload: {
      type: 'web_app',
      region: {
        isDefault: true,
      },
    },
    compute: [
      {
        role: 'web',
        scalingType: 'fixed',
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
  },
  resultSnapshot: {
    comparisonId: 'comparison-1',
    pricingAsOf: '2026-06-29T00:00:00.000Z',
    cheapestProviderId: 'aws',
    providers: [
      {
        providerId: 'aws',
        lineItems: [
          {
            category: 'compute',
            description: 'web compute',
            isApproximate: false,
            baseMonthlyCostUsd: 36.5,
            skuId: 'AWS-COMPUTE-1',
            region: 'us-east-1',
            unit: 'hour',
            unitPriceUsd: 0.05,
          },
          {
            category: 'storage',
            description: 'object storage',
            isApproximate: false,
            baseMonthlyCostUsd: 10,
            skuId: 'AWS-STORAGE-1',
            region: 'us-east-1',
            unit: 'GB-Mo',
            unitPriceUsd: 0.02,
          },
        ],
        totals: {
          daily: 1.55,
          weekly: 10.85,
          monthly: 46.5,
          quarterly: 139.5,
          yearly: 558,
        },
      },
    ],
  },
};

describe('LivePricingRefreshService', () => {
  it('extracts saved provider SKU references from comparison snapshots', () => {
    expect(livePricingReferences(snapshot.resultSnapshot)).toEqual([
      {
        providerId: 'aws',
        category: 'compute',
        skuId: 'AWS-COMPUTE-1',
        region: 'us-east-1',
        source: 'pricing_catalog',
      },
      {
        providerId: 'aws',
        category: 'storage',
        skuId: 'AWS-STORAGE-1',
        region: 'us-east-1',
        source: 'pricing_catalog',
      },
    ]);
  });

  it('prefers pricingTrace source record identity when extracting live references', () => {
    expect(
      livePricingReferences({
        ...snapshot.resultSnapshot,
        providers: [
          {
            ...snapshot.resultSnapshot.providers[0],
            lineItems: [
              {
                category: 'compute',
                description: 'web compute',
                isApproximate: false,
                baseMonthlyCostUsd: 36.5,
                skuId: 'DISPLAY-SKU',
                region: 'us-east-1',
                unit: 'hour',
                unitPriceUsd: 0.05,
                pricingTrace: {
                  providerId: 'aws',
                  serviceCategory: 'compute',
                  source: 'pricing_catalog',
                  sourceRecordKey:
                    'aws|compute|TRACE-SKU|catalog-us-east-1|hour|2026-06-30T00:00:00.000Z',
                  resolvedSkuId: 'DISPLAY-SKU',
                  sourceSkuId: 'TRACE-SKU',
                  region: 'us-east-1',
                  catalogRegion: 'catalog-us-east-1',
                  unit: 'hour',
                  unitPriceUsd: 0.05,
                  effectiveDate: '2026-06-30T00:00:00.000Z',
                  fetchedAt: '2026-06-30T01:00:00.000Z',
                  isApproximate: false,
                  isEstimate: false,
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        providerId: 'aws',
        category: 'compute',
        skuId: 'TRACE-SKU',
        region: 'catalog-us-east-1',
        source: 'pricing_catalog',
        sourceRecordKey: 'aws|compute|TRACE-SKU|catalog-us-east-1|hour|2026-06-30T00:00:00.000Z',
      },
    ]);
  });

  it('refreshes referenced provider SKUs and persists raw plus normalized cache rows', async () => {
    const adapter = adapterMock('aws', async (skuIds) =>
      skuIds.includes('AWS-COMPUTE-1') ? [liveRecord] : [],
    );
    const catalogWriter: PricingCatalogWriter = {
      upsertPricingRecords: jest.fn(async () => ({
        recordsUpdated: 1,
        recordsRejected: 0,
      })),
    };
    const normalizedWriter: NormalizedPricingWriter = {
      upsertNormalizedPricingRecords: jest.fn(async () => ({
        recordsUpdated: 1,
        recordsRejected: 0,
        recordsSkipped: 0,
      })),
    };
    const service = new LivePricingRefreshService([adapter], catalogWriter, normalizedWriter);

    await expect(service.refreshSnapshot(snapshot)).resolves.toEqual([]);
    expect(adapter.refreshLivePricing).toHaveBeenCalledWith(['AWS-COMPUTE-1'], {
      categories: ['compute'],
      region: 'us-east-1',
    });
    expect(adapter.refreshLivePricing).toHaveBeenCalledWith(['AWS-STORAGE-1'], {
      categories: ['storage'],
      region: 'us-east-1',
    });
    expect(catalogWriter.upsertPricingRecords).toHaveBeenCalledWith([liveRecord]);
    expect(normalizedWriter.upsertNormalizedPricingRecords).toHaveBeenCalledWith([liveRecord]);
  });

  it('returns warnings when a provider live refresh fails', async () => {
    const service = new LivePricingRefreshService(
      [
        adapterMock('aws', async () => {
          throw new Error('provider throttled');
        }),
      ],
      writerMock(),
      writerMock(),
    );

    await expect(service.refreshSnapshot(snapshot)).resolves.toEqual([
      {
        providerId: 'aws',
        code: 'live_refresh_failed',
        message: 'aws live refresh failed: provider throttled',
      },
    ]);
  });

  it('does not call provider APIs for local seed SKU references', async () => {
    const adapter = adapterMock('aws');
    const service = new LivePricingRefreshService([adapter], writerMock(), writerMock());

    await expect(
      service.refreshSnapshot({
        ...snapshot,
        resultSnapshot: {
          ...snapshot.resultSnapshot,
          providers: [
            {
              ...snapshot.resultSnapshot.providers[0],
              lineItems: [
                {
                  category: 'compute',
                  description: 'local baseline compute',
                  isApproximate: false,
                  baseMonthlyCostUsd: 30,
                  skuId: 'local-seed-aws-compute-2x4',
                  region: 'us-east-1',
                  unit: 'hour',
                  unitPriceUsd: 0.0416,
                },
              ],
            },
          ],
        },
      }),
    ).resolves.toEqual([
      {
        providerId: 'aws',
        code: 'live_refresh_failed',
        message:
          'aws live refresh skipped local seed or modeled references; cached baseline pricing remains in use',
      },
    ]);
    expect(adapter.refreshLivePricing).not.toHaveBeenCalled();
  });

  it('fails clearly when old snapshots do not include SKU traceability', async () => {
    const legacySnapshot: ComparisonSnapshot = {
      ...snapshot,
      resultSnapshot: {
        ...snapshot.resultSnapshot,
        providers: [
          {
            ...snapshot.resultSnapshot.providers[0],
            lineItems: [
              {
                category: 'compute',
                description: 'legacy compute',
                isApproximate: false,
                baseMonthlyCostUsd: 30,
              },
            ],
          },
        ],
      },
    };
    const service = new LivePricingRefreshService([adapterMock('aws')], writerMock(), writerMock());

    await expect(service.refreshSnapshot(legacySnapshot)).rejects.toThrow(
      LiveRefreshUnavailableError,
    );
  });
});

function adapterMock(
  providerId: CloudProviderAdapter['providerId'],
  refreshLivePricing: CloudProviderAdapter['refreshLivePricing'] = jest.fn(async () => []),
): CloudProviderAdapter {
  return {
    providerId,
    priceWorkload: jest.fn(),
    refreshPricingCatalog: jest.fn(),
    refreshLivePricing: jest.fn(refreshLivePricing),
  };
}

function writerMock(): PricingCatalogWriter & NormalizedPricingWriter {
  return {
    upsertPricingRecords: jest.fn(async () => ({
      recordsUpdated: 0,
      recordsRejected: 0,
    })),
    upsertNormalizedPricingRecords: jest.fn(async () => ({
      recordsUpdated: 0,
      recordsRejected: 0,
      recordsSkipped: 0,
    })),
  };
}

describe('LivePricingRefreshService circuit breaker', () => {
  const writers = () => ({
    catalogWriter: {
      upsertPricingRecords: jest.fn(async () => ({ recordsUpdated: 1, recordsRejected: 0 })),
    } as PricingCatalogWriter,
    normalizedWriter: {
      upsertNormalizedPricingRecords: jest.fn(async () => ({
        recordsUpdated: 1,
        recordsRejected: 0,
        recordsSkipped: 0,
      })),
    } as NormalizedPricingWriter,
  });

  function deadProvider() {
    const refreshLivePricing = jest.fn(async () => {
      throw new Error('provider down');
    });

    return {
      refreshLivePricing,
      adapter: {
        providerId: 'aws',
        priceWorkload: jest.fn(),
        refreshPricingCatalog: jest.fn(),
        refreshLivePricing,
      } as unknown as CloudProviderAdapter,
    };
  }

  it('stops calling a provider once its circuit opens', async () => {
    const { adapter, refreshLivePricing } = deadProvider();
    const { catalogWriter, normalizedWriter } = writers();
    // Threshold 1 so a single exhausted retry cycle opens the circuit.
    const breakers = new CircuitBreakerRegistry({ failureThreshold: 1, cooldownMs: 60_000 });
    const service = new LivePricingRefreshService(
      [adapter],
      catalogWriter,
      normalizedWriter,
      breakers,
    );

    const first = await service.refreshSnapshot(snapshot);
    const callsAfterFirst = refreshLivePricing.mock.calls.length;
    const second = await service.refreshSnapshot(snapshot);

    // The first request pays the full retry cost; every later one is rejected
    // without touching the provider. That is the whole point: live refresh runs
    // on the user request path.
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(refreshLivePricing).toHaveBeenCalledTimes(callsAfterFirst);
    expect(breakers.get('aws').state).toBe('open');

    // The user still gets a result, degraded to cached pricing with a warning.
    expect(first[0]?.code).toBe('live_refresh_failed');
    expect(second[0]?.code).toBe('live_refresh_failed');
  });

  it('explains that the circuit is open in the warning', async () => {
    const { adapter } = deadProvider();
    const { catalogWriter, normalizedWriter } = writers();
    const breakers = new CircuitBreakerRegistry({ failureThreshold: 1, cooldownMs: 60_000 });
    const service = new LivePricingRefreshService(
      [adapter],
      catalogWriter,
      normalizedWriter,
      breakers,
    );

    await service.refreshSnapshot(snapshot);
    const warnings = await service.refreshSnapshot(snapshot);

    expect(warnings[0]?.message).toContain('circuit');
  });

  it('behaves exactly as before when no registry is supplied', async () => {
    const { adapter, refreshLivePricing } = deadProvider();
    const { catalogWriter, normalizedWriter } = writers();
    const service = new LivePricingRefreshService([adapter], catalogWriter, normalizedWriter);

    await service.refreshSnapshot(snapshot);
    const callsAfterFirst = refreshLivePricing.mock.calls.length;
    await service.refreshSnapshot(snapshot);

    // Without a breaker the provider is called again, unchanged.
    expect(refreshLivePricing.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('keeps a healthy provider working while another is open', async () => {
    const { adapter: broken } = deadProvider();
    const healthy = {
      providerId: 'gcp',
      priceWorkload: jest.fn(),
      refreshPricingCatalog: jest.fn(),
      refreshLivePricing: jest.fn(async () => []),
    } as unknown as CloudProviderAdapter;
    const { catalogWriter, normalizedWriter } = writers();
    const breakers = new CircuitBreakerRegistry({ failureThreshold: 1, cooldownMs: 60_000 });
    const service = new LivePricingRefreshService(
      [broken, healthy],
      catalogWriter,
      normalizedWriter,
      breakers,
    );

    await service.refreshSnapshot(snapshot);

    expect(breakers.get('aws').state).toBe('open');
    expect(breakers.get('gcp').state).toBe('closed');
  });
});
