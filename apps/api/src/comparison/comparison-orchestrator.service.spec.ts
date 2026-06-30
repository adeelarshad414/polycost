import {
  CloudProviderAdapter,
  ProviderId,
  ProviderPricingResult,
} from '../adapters/common/cloud-provider-adapter';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import {
  ComparisonOrchestratorService,
  ComparisonUnavailableError,
} from './comparison-orchestrator.service';
import { EquivalentServiceMapper } from './equivalent-service-mapper';
import { IntervalCostCalculator } from './interval-cost-calculator';

const validWorkload: NormalizedWorkloadSpec = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-06-28T00:00:00.000Z',
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
      instanceCount: 2,
    },
  ],
  storage: [],
  database: [
    {
      role: 'primary',
      engine: 'postgres',
      highAvailability: false,
      managedServicePreference: 'Aurora PostgreSQL',
    },
  ],
  network: {
    cdn: false,
    loadBalancer: false,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
  },
};

const providerResult = (providerId: ProviderId, monthlyCosts: number[]): ProviderPricingResult => ({
  providerId,
  baseMonthlyCostUsd: monthlyCosts.reduce((sum, cost) => sum + cost, 0),
  lineItems: monthlyCosts.map((cost, index) => ({
    category: index === 0 ? 'compute' : 'database',
    description: `${providerId} item ${index}`,
    isApproximate: false,
    baseMonthlyCostUsd: cost,
    skuId: `${providerId}-${index}`,
    region: 'us-test-1',
    unit: 'month',
    unitPriceUsd: cost,
  })),
});

const adapter = (
  providerId: ProviderId,
  priceWorkload: CloudProviderAdapter['priceWorkload'],
): CloudProviderAdapter => ({
  providerId,
  priceWorkload,
  refreshPricingCatalog: jest.fn(async () => []),
  refreshLivePricing: jest.fn(async () => []),
});

const createService = (adapters: CloudProviderAdapter[]) =>
  new ComparisonOrchestratorService(
    adapters,
    new IntervalCostCalculator(),
    new EquivalentServiceMapper(),
    () => 'comparison-123',
    () => new Date('2026-06-28T12:00:00.000Z'),
  );

describe('ComparisonOrchestratorService', () => {
  it('fans out to provider adapters and returns interval totals and cheapest provider', async () => {
    const aws = adapter(
      'aws',
      jest.fn(async () => providerResult('aws', [30, 10])),
    );
    const azure = adapter(
      'azure',
      jest.fn(async () => providerResult('azure', [20, 10])),
    );
    const gcp = adapter(
      'gcp',
      jest.fn(async () => providerResult('gcp', [50, 10])),
    );
    const service = createService([aws, azure, gcp]);

    const result = await service.compare(validWorkload);

    expect(result).toEqual({
      comparisonId: 'comparison-123',
      pricingAsOf: '2026-06-28T12:00:00.000Z',
      cheapestProviderId: 'azure',
      providers: [
        expect.objectContaining({
          providerId: 'aws',
          totals: {
            daily: 1.33,
            weekly: 9.31,
            monthly: 40,
            quarterly: 120,
            yearly: 480,
          },
        }),
        expect.objectContaining({
          providerId: 'azure',
          totals: expect.objectContaining({
            monthly: 30,
          }),
        }),
        expect.objectContaining({
          providerId: 'gcp',
          totals: expect.objectContaining({
            monthly: 60,
          }),
        }),
      ],
    });
    expect(aws.priceWorkload).toHaveBeenCalledWith(validWorkload);
    expect(azure.priceWorkload).toHaveBeenCalledWith(validWorkload);
    expect(gcp.priceWorkload).toHaveBeenCalledWith(validWorkload);
  });

  it('annotates approximate line items from provider-specific preferences', async () => {
    const service = createService([
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [20, 10])),
      ),
    ]);

    const result = await service.compare(validWorkload);

    expect(result.providers[0].lineItems[1]).toEqual(
      expect.objectContaining({
        category: 'database',
        isApproximate: true,
      }),
    );
  });

  it('returns partial results when one provider fails', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [20])),
      ),
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [30])),
      ),
      adapter(
        'gcp',
        jest.fn(async () => Promise.reject(new Error('catalog unavailable'))),
      ),
    ]);

    const result = await service.compare(validWorkload);

    expect(result.providers).toHaveLength(2);
    expect(result.cheapestProviderId).toBe('aws');
    expect(result.warnings).toEqual([
      {
        providerId: 'gcp',
        code: 'provider_pricing_failed',
        message: 'gcp pricing failed: catalog unavailable',
      },
    ]);
  });

  it('returns pricing-model availability and a scoped workload breakdown', async () => {
    const richProviderResult: ProviderPricingResult = {
      providerId: 'aws',
      baseMonthlyCostUsd: 145,
      lineItems: [
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'aws compute',
          isApproximate: false,
          baseMonthlyCostUsd: 100,
          skuId: 'aws-compute',
          region: 'us-east-1',
          unit: 'hour',
          unitPriceUsd: 0.14,
          pricingBasis: 'flat',
          pricingModels: [
            { model: 'on-demand', available: true, monthlyCostUsd: 100 },
            { model: 'reserved-1yr', available: true, monthlyCostUsd: 80 },
            { model: 'reserved-3yr', available: true, monthlyCostUsd: 50 },
          ],
        },
        {
          category: 'storage',
          costComponent: 'storage',
          description: 'aws storage',
          isApproximate: false,
          baseMonthlyCostUsd: 10,
          skuId: 'aws-storage',
          region: 'us-east-1',
          unit: 'GB-Mo',
          unitPriceUsd: 0.02,
          pricingBasis: 'flat',
        },
        {
          category: 'network',
          costComponent: 'egress',
          description: 'aws internet egress',
          isApproximate: false,
          baseMonthlyCostUsd: 15,
          skuId: 'aws-egress',
          region: 'us-east-1',
          unit: 'GB',
          unitPriceUsd: 0.09,
          pricingBasis: 'tiered',
        },
        {
          category: 'database',
          costComponent: 'database',
          description: 'aws database',
          isApproximate: false,
          baseMonthlyCostUsd: 20,
          skuId: 'aws-database',
          region: 'us-east-1',
          unit: 'hour',
          unitPriceUsd: 0.03,
          pricingBasis: 'flat',
        },
      ],
    };
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => richProviderResult),
      ),
    ]);

    const result = await service.compare(validWorkload);

    expect(result.providers[0].pricingModels).toEqual([
      { model: 'on-demand', available: true, monthlyCostUsd: 145 },
      { model: 'reserved-1yr', available: true, monthlyCostUsd: 125 },
      { model: 'reserved-3yr', available: true, monthlyCostUsd: 95 },
    ]);
    expect(result.providers[0].breakdown).toEqual({
      computeMonthlyCostUsd: 100,
      storageMonthlyCostUsd: 10,
      egressMonthlyCostUsd: 15,
      databaseMonthlyCostUsd: 20,
      scopedMonthlyCostUsd: 125,
    });
  });

  it('uses a safe warning when a provider fails without an Error object', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [20])),
      ),
      adapter(
        'azure',
        jest.fn(() => Promise.reject('timeout')),
      ),
    ]);

    const result = await service.compare(validWorkload);

    expect(result.warnings?.[0].message).toBe(
      'azure pricing failed: Unknown provider pricing error',
    );
  });

  it('throws when every provider fails', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => Promise.reject(new Error('empty catalog'))),
      ),
    ]);

    await expect(service.compare(validWorkload)).rejects.toThrow(ComparisonUnavailableError);
  });

  it('validates the NWS before pricing', async () => {
    const aws = adapter(
      'aws',
      jest.fn(async () => providerResult('aws', [20])),
    );
    const service = createService([aws]);

    await expect(
      service.compare({
        ...validWorkload,
        schemaVersion: '9.9',
      }),
    ).rejects.toThrow('NWS schema migration required');
    expect(aws.priceWorkload).not.toHaveBeenCalled();
  });
});
