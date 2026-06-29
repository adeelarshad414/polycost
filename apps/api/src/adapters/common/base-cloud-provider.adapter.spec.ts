import {
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderPricingLineItem,
  ProviderId,
} from './cloud-provider-adapter';
import { BaseCloudProviderAdapter } from './base-cloud-provider.adapter';
import { InMemoryPricingCatalogReader } from './in-memory-pricing-catalog.reader';

class TestProviderAdapter extends BaseCloudProviderAdapter {
  readonly providerId: ProviderId = 'aws';

  constructor(catalogReader: PricingCatalogReader, defaultRegion: string) {
    super(catalogReader, defaultRegion);
  }

  async refreshPricingCatalog(): Promise<PricingCatalogRecord[]> {
    return [];
  }

  async refreshLivePricing(): Promise<PricingCatalogRecord[]> {
    return [];
  }
}

const fullWorkload = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-06-28T00:00:00.000Z',
  },
  workload: {
    type: 'web_app',
    region: {
      preference: 'test-region',
      isDefault: false,
    },
  },
  compute: [
    {
      role: 'api',
      vcpu: 2,
      memoryGb: 4,
      scalingType: 'autoscaling',
      autoscalingRange: {
        min: 2,
        max: 4,
      },
    },
  ],
  storage: [
    {
      role: 'uploads',
      type: 'object',
      sizeGb: 100,
      accessPattern: 'frequent',
    },
  ],
  database: [
    {
      role: 'primary',
      engine: 'postgres',
      sizeGb: 50,
      highAvailability: false,
    },
  ],
  network: {
    estimatedMonthlyEgressGb: 10,
    cdn: true,
    loadBalancer: true,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
  },
};

const catalog: PricingCatalogRecord[] = [
  {
    provider: 'aws',
    serviceCategory: 'compute',
    serviceName: 'too-small compute',
    skuId: 'COMPUTE-SMALL',
    region: 'test-region',
    unit: 'hour',
    unitPriceUsd: 0.01,
    attributes: {
      vcpu: 1,
      memoryGb: 2,
    },
    effectiveDate: '2026-01-01T00:00:00Z',
    fetchedAt: '2026-06-28T00:00:00.000Z',
  },
  {
    provider: 'aws',
    serviceCategory: 'compute',
    serviceName: 'right-sized compute',
    skuId: 'COMPUTE-RIGHT',
    region: 'test-region',
    unit: 'hour',
    unitPriceUsd: 0.05,
    attributes: {
      vcpu: 2,
      memoryGb: 4,
    },
    effectiveDate: '2026-01-01T00:00:00Z',
    fetchedAt: '2026-06-28T00:00:00.000Z',
  },
  {
    provider: 'aws',
    serviceCategory: 'storage',
    serviceName: 'object storage',
    skuId: 'STORAGE',
    region: 'test-region',
    unit: 'GB-Mo',
    unitPriceUsd: 0.02,
    attributes: {
      type: 'object',
      accessPattern: 'frequent',
      isApproximate: true,
    },
    effectiveDate: '2026-01-01T00:00:00Z',
    fetchedAt: '2026-06-28T00:00:00.000Z',
  },
  {
    provider: 'aws',
    serviceCategory: 'database',
    serviceName: 'postgres database',
    skuId: 'DB',
    region: 'test-region',
    unit: 'H',
    unitPriceUsd: 0.1,
    attributes: {
      engine: 'postgres',
    },
    effectiveDate: '2026-01-01T00:00:00Z',
    fetchedAt: '2026-06-28T00:00:00.000Z',
  },
  {
    provider: 'aws',
    serviceCategory: 'database',
    serviceName: 'database storage',
    skuId: 'DB-STORAGE',
    region: 'test-region',
    unit: 'GB-Mo',
    unitPriceUsd: 0.01,
    attributes: {
      usage: 'storage',
    },
    effectiveDate: '2026-01-01T00:00:00Z',
    fetchedAt: '2026-06-28T00:00:00.000Z',
  },
  {
    provider: 'aws',
    serviceCategory: 'network',
    serviceName: 'internet egress',
    skuId: 'NETWORK',
    region: 'test-region',
    unit: 'GB',
    unitPriceUsd: 0.09,
    effectiveDate: '2026-01-01T00:00:00Z',
    fetchedAt: '2026-06-28T00:00:00.000Z',
  },
];

describe('BaseCloudProviderAdapter', () => {
  it('prices compute, storage, database, database storage, and network line items', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader(catalog),
      'fallback-region',
    );

    const result = await adapter.priceWorkload(fullWorkload);

    expect(result.baseMonthlyCostUsd).toBe(185.9);
    expect(result.lineItems.map((lineItem: ProviderPricingLineItem) => lineItem.skuId)).toEqual([
      'COMPUTE-RIGHT',
      'STORAGE',
      'DB',
      'DB-STORAGE',
      'NETWORK',
    ]);
    expect(result.lineItems[1].isApproximate).toBe(true);
  });

  it('uses cached commitment rows and walks egress tier bands', async () => {
    const tieredAndCommittedCatalog: PricingCatalogRecord[] = [
      ...catalog.map((record) =>
        record.skuId === 'NETWORK'
          ? {
              ...record,
              unitPriceUsd: 0,
              attributes: {
                egressTiers: [
                  { startGb: 0, unitPriceUsd: 0 },
                  { startGb: 5, unitPriceUsd: 0.1 },
                  { startGb: 10, unitPriceUsd: 0.08 },
                ],
              },
            }
          : record,
      ),
      {
        ...catalog[1],
        serviceName: 'one-year reserved compute',
        skuId: 'COMPUTE-RIGHT-1YR',
        unitPriceUsd: 0.03,
        attributes: {
          ...catalog[1].attributes,
          pricingModel: 'reserved-1yr',
        },
      },
      {
        ...catalog[1],
        serviceName: 'three-year reserved compute',
        skuId: 'COMPUTE-RIGHT-3YR',
        unitPriceUsd: 0.02,
        attributes: {
          ...catalog[1].attributes,
          pricingModel: 'reserved-3yr',
        },
      },
    ];
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader(tieredAndCommittedCatalog),
      'fallback-region',
    );

    const result = await adapter.priceWorkload(fullWorkload);

    expect(result.baseMonthlyCostUsd).toBe(185.5);
    expect(result.lineItems[0].pricingModels).toEqual([
      {
        model: 'on-demand',
        available: true,
        monthlyCostUsd: 109.5,
      },
      {
        model: 'reserved-1yr',
        available: true,
        monthlyCostUsd: 65.7,
      },
      {
        model: 'reserved-3yr',
        available: true,
        monthlyCostUsd: 43.8,
      },
    ]);
    expect(result.lineItems[4]).toEqual(
      expect.objectContaining({
        baseMonthlyCostUsd: 0.5,
        costComponent: 'egress',
        pricingBasis: 'tiered',
      }),
    );
  });

  it('uses the adapter default region when the workload marks its region as default', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          ...catalog[1],
          region: 'fallback-region',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      workload: {
        type: 'web_app',
        region: {
          isDefault: true,
        },
      },
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'web',
          scalingType: 'fixed',
        },
      ],
    });

    expect(result.baseMonthlyCostUsd).toBe(36.5);
  });

  it('falls back to the adapter default region when a cloud-specific region has no match', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          ...catalog[1],
          region: 'fallback-region',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      workload: {
        type: 'web_app',
        region: {
          preference: 'aws-shaped-region',
          isDefault: false,
        },
      },
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'web',
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.baseMonthlyCostUsd).toBe(36.5);
    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        isApproximate: true,
      }),
    );
  });

  it('fails clearly when no matching catalog record exists', async () => {
    const adapter = new TestProviderAdapter(new InMemoryPricingCatalogReader([]), 'test-region');

    await expect(adapter.priceWorkload(fullWorkload)).rejects.toThrow(
      'no compute pricing catalog record found for region test-region',
    );
  });
});
