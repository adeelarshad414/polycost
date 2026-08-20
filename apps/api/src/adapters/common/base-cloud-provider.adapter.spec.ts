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
    expect(result.lineItems[0].pricingTrace).toEqual(
      expect.objectContaining({
        providerId: 'aws',
        serviceCategory: 'compute',
        source: 'pricing_catalog',
        sourceRecordKey: 'aws|compute|COMPUTE-RIGHT|test-region|hour|2026-01-01T00:00:00Z',
        resolvedSkuId: 'COMPUTE-RIGHT',
        sourceSkuId: 'COMPUTE-RIGHT',
        catalogRegion: 'test-region',
        unitPriceUsd: 0.05,
        derivation: expect.objectContaining({
          expression: '0.05 USD/hour x 3 x 730 hour-month standard',
          quantity: 3,
          hourlyCostUsd: 0.15,
          monthlyCostUsd: 109.5,
          monthlyHours: 730,
        }),
        isEstimate: false,
      }),
    );
    expect(result.lineItems[1].isApproximate).toBe(true);
    expect(result.lineItems[1].pricingTrace?.derivation).toEqual(
      expect.objectContaining({
        expression: '0.02 USD/GB-Mo x 100',
        quantity: 100,
        hourlyCostUsd: 0.00274, // 100/730 x 0.02 as a 6dp rate (was rounded to 0)
        monthlyCostUsd: 2,
      }),
    );
  });

  it('uses residency-locked canonical regions before querying provider pricing', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          ...catalog[1],
          serviceName: 'eu west compute',
          skuId: 'COMPUTE-EU',
          region: 'eu-west-1',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      workload: {
        ...fullWorkload.workload,
        region: {
          preference: 'us-east',
          isDefault: false,
        },
      },
      workloadProfile: {
        dataResidency: {
          scope: 'eu',
          complianceLocked: true,
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
          role: 'api',
          vcpu: 2,
          memoryGb: 4,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'COMPUTE-EU',
        region: 'eu-west-1',
      }),
    );
  });

  it('labels approximate fallback rows with the requested provider region', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader(catalog),
      'test-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      workload: {
        ...fullWorkload.workload,
        region: {
          preference: 'eu-west',
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
          role: 'api',
          vcpu: 2,
          memoryGb: 4,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        isApproximate: true,
        region: 'eu-west-1',
      }),
    );
  });

  it('falls back to type-compatible storage when class-specific catalog rows are unavailable', async () => {
    const shallowStorageCatalog = catalog.map((record) =>
      record.skuId === 'STORAGE'
        ? {
            ...record,
            attributes: {
              type: 'object',
              accessPattern: 'frequent',
            },
          }
        : record,
    );
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader(shallowStorageCatalog),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      storage: [
        {
          role: 'archive assets',
          type: 'object',
          sizeGb: 100,
          accessPattern: 'archive',
          storageClass: 'archive',
        },
      ],
    });

    expect(result.lineItems[1]).toEqual(
      expect.objectContaining({
        skuId: 'STORAGE',
        isApproximate: true,
        description: expect.stringContaining('archive assets archive storage'),
      }),
    );
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
          upfrontOption: 'partial',
          upfrontCostUsd: 240,
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
    expect(result.lineItems[0].pricingModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'on-demand',
          available: true,
          hourlyCostUsd: 0.15,
          monthlyCostUsd: 109.5,
        }),
        expect.objectContaining({
          model: 'reserved-1yr',
          available: true,
          hourlyCostUsd: 0.09,
          monthlyCostUsd: 65.7,
          upfrontOption: 'partial',
          upfrontCostUsd: 240,
        }),
        expect.objectContaining({
          model: 'reserved-3yr',
          available: true,
          hourlyCostUsd: 0.06,
          monthlyCostUsd: 43.8,
        }),
        expect.objectContaining({
          model: 'spot',
          available: true,
          estimated: true,
          source: 'modeled-estimate',
          volatility: 'volatile',
        }),
        expect.objectContaining({
          model: 'savings-plan',
          available: true,
          estimated: true,
          source: 'modeled-estimate',
        }),
      ]),
    );
    expect(result.lineItems[4]).toEqual(
      expect.objectContaining({
        baseMonthlyCostUsd: 0.5,
        costComponent: 'egress',
        pricingBasis: 'tiered',
        egressTiers: expect.arrayContaining([
          expect.objectContaining({
            tierFromGb: 5,
            tierToGb: 10,
            pricePerGb: 0.1,
            billableGb: 5,
            monthlyCostUsd: 0.5,
          }),
        ]),
      }),
    );
  });

  it('prefers matching compute instance family when the workload asks for it', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'generic compute without family metadata',
          skuId: 'generic.cheap',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.01,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'general purpose compute',
          skuId: 'm6i.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.02,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'memory optimized compute',
          skuId: 'r6i.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.05,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'cache',
          instanceFamily: 'memory-optimized',
          vcpu: 2,
          memoryGb: 8,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'r6i.large',
        baseMonthlyCostUsd: 36.5,
      }),
    );
  });

  it('falls back to approximate nearest compute when a requested family is unavailable', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'general purpose compute',
          skuId: 'm6i.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.02,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'training',
          instanceFamily: 'accelerated-computing',
          vcpu: 2,
          memoryGb: 8,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'm6i.large',
        isApproximate: true,
        baseMonthlyCostUsd: 14.6,
      }),
    );
  });

  it('prefers matching processor architecture when catalog rows expose architecture metadata', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'x86 general purpose compute',
          skuId: 'm6i.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.02,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
            processorArchitecture: 'x86_64',
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'arm general purpose compute',
          skuId: 'm7g.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.03,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
            processorArchitecture: 'arm64',
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'web',
          instanceFamily: 'general-purpose',
          processorArchitecture: 'arm64',
          tenancy: 'shared',
          vcpu: 2,
          memoryGb: 8,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'm7g.large',
        baseMonthlyCostUsd: 21.9,
      }),
    );
  });

  it('falls back approximately when dedicated tenancy is requested but unavailable', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'shared x86 compute',
          skuId: 'm6i.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.02,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
            processorArchitecture: 'x86_64',
            tenancy: 'shared',
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'licensed-db',
          instanceFamily: 'general-purpose',
          processorArchitecture: 'x86_64',
          tenancy: 'dedicated-host',
          vcpu: 2,
          memoryGb: 8,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'm6i.large',
        isApproximate: true,
        baseMonthlyCostUsd: 14.6,
      }),
    );
  });

  it('marks rows without architecture metadata as approximate for non-default architecture intent', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          provider: 'aws',
          serviceCategory: 'compute',
          serviceName: 'generic compute without architecture metadata',
          skuId: 'generic.large',
          region: 'test-region',
          unit: 'hour',
          unitPriceUsd: 0.02,
          attributes: {
            vcpu: 2,
            memoryGb: 8,
          },
          effectiveDate: '2026-01-01T00:00:00Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
      ]),
      'fallback-region',
    );

    const result = await adapter.priceWorkload({
      ...fullWorkload,
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      compute: [
        {
          role: 'arm-worker',
          instanceFamily: 'general-purpose',
          processorArchitecture: 'arm64',
          tenancy: 'shared',
          vcpu: 2,
          memoryGb: 8,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'generic.large',
        isApproximate: true,
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

  it('falls back to default-region compute when requested-region rows do not fit', async () => {
    const adapter = new TestProviderAdapter(
      new InMemoryPricingCatalogReader([
        {
          ...catalog[0],
          region: 'partial-region',
        },
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
          preference: 'partial-region',
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
          vcpu: 2,
          memoryGb: 4,
        },
      ],
    });

    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        skuId: 'COMPUTE-RIGHT',
        region: 'partial-region',
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
