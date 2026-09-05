import { InMemoryPricingCatalogReader } from '../common/in-memory-pricing-catalog.reader.js';
import { MockProviderAdapter } from './mock-provider.adapter.js';

describe('MockProviderAdapter', () => {
  it('returns a production-demo catalog with at least 30 SKUs per provider', async () => {
    for (const provider of ['aws', 'azure', 'gcp'] as const) {
      const adapter = new MockProviderAdapter(
        provider,
        new InMemoryPricingCatalogReader([]),
        provider === 'azure' ? 'eastus' : provider === 'gcp' ? 'us-central1' : 'us-east-1',
        () => new Date('2026-07-06T00:00:00.000Z'),
      );

      const records = await adapter.refreshPricingCatalog();

      expect(records.length).toBeGreaterThanOrEqual(30);
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider,
            serviceCategory: 'compute',
            attributes: expect.objectContaining({
              pricingModel: 'reserved-3yr',
              upfrontOption: 'no_upfront',
            }),
          }),
          expect.objectContaining({
            provider,
            serviceCategory: 'network',
            attributes: expect.objectContaining({
              egressTiers: expect.any(Array),
            }),
          }),
          expect.objectContaining({
            provider,
            serviceCategory: 'storage',
          }),
        ]),
      );
    }
  });

  it('prices a workload through the same base adapter logic used by live providers', async () => {
    const refreshAdapter = new MockProviderAdapter(
      'aws',
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      () => new Date('2026-07-06T00:00:00.000Z'),
    );
    const records = await refreshAdapter.refreshPricingCatalog();
    const adapter = new MockProviderAdapter(
      'aws',
      new InMemoryPricingCatalogReader(records),
      'us-east-1',
    );

    const result = await adapter.priceWorkload({
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
          role: 'web',
          scalingType: 'fixed',
          instanceCount: 2,
          vcpu: 2,
          memoryGb: 8,
          instanceFamily: 'general-purpose',
        },
      ],
      storage: [
        {
          role: 'assets',
          type: 'object',
          sizeGb: 100,
          accessPattern: 'frequent',
          storageClass: 'standard',
        },
      ],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
        estimatedMonthlyEgressGb: 80_000,
      },
      availability: {
        multiAz: false,
        multiRegion: false,
      },
    });

    expect(result.baseMonthlyCostUsd).toBeGreaterThan(0);
    expect(result.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'network',
          pricingBasis: 'tiered',
          egressTiers: expect.arrayContaining([
            expect.objectContaining({
              tierFromGb: 51_200,
              billableGb: 28_800,
            }),
          ]),
        }),
      ]),
    );
  });
});
