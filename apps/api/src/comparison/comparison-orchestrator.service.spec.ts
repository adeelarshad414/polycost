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
      requirements: {
        sourceType: 'structured_form',
        workloadType: 'web_app',
        serviceRequirements: expect.arrayContaining([
          expect.objectContaining({
            serviceCategory: 'compute',
            serviceType: 'vm-compute',
            quantity: 2,
          }),
          expect.objectContaining({
            serviceCategory: 'database',
            serviceType: 'relational-database',
          }),
        ]),
      },
      cheapestProviderId: 'azure',
      providers: [
        expect.objectContaining({
          providerId: 'aws',
          totals: expect.objectContaining({
            hourly: 0.05,
            daily: 1.32,
            weekly: 9.21,
            monthly: 40,
            quarterly: 120,
            yearly: 480,
          }),
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
            { model: 'on-demand', available: true, monthlyCostUsd: 100, hourlyCostUsd: 0.14 },
            {
              model: 'reserved-1yr',
              available: true,
              monthlyCostUsd: 80,
              upfrontOption: 'partial',
              upfrontCostUsd: 240,
            },
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
          egressTiers: [
            {
              tierFromGb: 0,
              tierToGb: 200,
              pricePerGb: 0.075,
              billableGb: 200,
              monthlyCostUsd: 15,
            },
          ],
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

    expect(result.providers[0].pricingModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'on-demand',
          available: true,
          hourlyCostUsd: 0.2,
          monthlyCostUsd: 145,
          savingsPercentVsOnDemand: 0,
        }),
        expect.objectContaining({
          model: 'reserved-1yr',
          available: true,
          monthlyCostUsd: 125,
          upfrontOption: 'partial',
          upfrontCostUsd: 240,
          savingsPercentVsOnDemand: 13.79,
        }),
        expect.objectContaining({
          model: 'reserved-3yr',
          available: true,
          monthlyCostUsd: 95,
          savingsPercentVsOnDemand: 34.48,
        }),
        expect.objectContaining({
          model: 'spot',
          available: false,
        }),
        expect.objectContaining({
          model: 'savings-plan',
          available: false,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual({
      computeMonthlyCostUsd: 100,
      storageMonthlyCostUsd: 10,
      egressMonthlyCostUsd: 15,
      databaseMonthlyCostUsd: 20,
      supportMonthlyCostUsd: 0,
      licensingMonthlyCostUsd: 0,
      operationsMonthlyCostUsd: 0,
      scopedMonthlyCostUsd: 145,
    });
    expect(result.providers[0].lineItems[2].egressTiers).toEqual([
      {
        tierFromGb: 0,
        tierToGb: 200,
        pricePerGb: 0.075,
        billableGb: 200,
        monthlyCostUsd: 15,
      },
    ]);
  });

  it('adds production-depth modeled line items from workload profile assumptions', async () => {
    const profiledProviderResult: ProviderPricingResult = {
      providerId: 'aws',
      baseMonthlyCostUsd: 100,
      lineItems: [
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'aws compute',
          isApproximate: false,
          baseMonthlyCostUsd: 73,
          skuId: 'aws-compute',
          region: 'us-east-1',
          unit: 'hour',
          unitPriceUsd: 0.1,
          pricingBasis: 'flat',
          pricingModels: [
            { model: 'on-demand', available: true, monthlyCostUsd: 73, hourlyCostUsd: 0.1 },
            { model: 'reserved-1yr', available: true, monthlyCostUsd: 50 },
          ],
        },
        {
          category: 'storage',
          costComponent: 'storage',
          description: 'aws storage',
          isApproximate: false,
          baseMonthlyCostUsd: 20,
          skuId: 'aws-storage',
          region: 'us-east-1',
          unit: 'GB-Mo',
          unitPriceUsd: 0.02,
          pricingBasis: 'flat',
        },
        {
          category: 'database',
          costComponent: 'database',
          description: 'aws database',
          isApproximate: false,
          baseMonthlyCostUsd: 80,
          skuId: 'aws-database',
          region: 'us-east-1',
          unit: 'hour',
          unitPriceUsd: 0.11,
          pricingBasis: 'flat',
        },
      ],
    };
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => profiledProviderResult),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      availability: {
        multiAz: true,
        multiRegion: true,
        faultTolerance: 'multi-region',
      },
      compute: [
        {
          role: 'web',
          vcpu: 2,
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
      workloadProfile: {
        environment: 'production',
        operatingSystem: 'windows',
        supportTier: 'business',
        usagePattern: {
          type: 'scheduled',
          hoursPerDay: 12,
          daysPerWeek: 5,
        },
      },
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'compute',
          description: expect.stringContaining('scheduled duty cycle'),
          baseMonthlyCostUsd: 26,
        }),
        expect.objectContaining({
          category: 'support',
          costComponent: 'support',
          baseMonthlyCostUsd: 100,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'licensing',
          costComponent: 'licensing',
          baseMonthlyCostUsd: 23.92,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'operations',
          costComponent: 'operations',
          baseMonthlyCostUsd: 81.9,
          isApproximate: true,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 26,
        supportMonthlyCostUsd: 100,
        licensingMonthlyCostUsd: 23.92,
        operationsMonthlyCostUsd: 81.9,
      }),
    );
  });

  it('adds explicit modeled network dimension line items when advanced traffic assumptions exist', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      network: {
        estimatedMonthlyEgressGb: 0,
        crossAzTransferGb: 100,
        interRegionTransferGb: 200,
        cdn: true,
        cdnTrafficGb: 1000,
        cdnCacheHitRatioPercent: 80,
        natGatewayGb: 500,
        natGatewayHours: 730,
        dnsHostedZones: 2,
        dnsQueriesMillion: 3,
        loadBalancer: true,
        loadBalancerProcessedGb: 250,
        loadBalancerHours: 730,
      },
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'network',
          costComponent: 'egress',
          skuId: 'modeled-cross-az-transfer',
          baseMonthlyCostUsd: 1,
          isApproximate: true,
        }),
        expect.objectContaining({
          skuId: 'modeled-inter-region-transfer',
          baseMonthlyCostUsd: 4,
        }),
        expect.objectContaining({
          skuId: 'modeled-cdn-delivery',
          description: expect.stringContaining('80% cache hit'),
          baseMonthlyCostUsd: 87,
        }),
        expect.objectContaining({
          skuId: 'modeled-nat-gateway',
          baseMonthlyCostUsd: 55.35,
        }),
        expect.objectContaining({
          skuId: 'modeled-dns',
          baseMonthlyCostUsd: 2.2,
        }),
        expect.objectContaining({
          skuId: 'modeled-load-balancer-capacity',
          baseMonthlyCostUsd: 18.43,
        }),
      ]),
    );
    expect(result.providers[0].breakdown?.egressMonthlyCostUsd).toBe(167.98);
  });

  it('adds explicit modeled storage dimension line items when advanced storage assumptions exist', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      storage: [
        {
          role: 'assets',
          type: 'object',
          sizeGb: 500,
          accessPattern: 'archive',
          storageClass: 'archive',
          monthlyPutRequestsThousand: 100,
          monthlyGetRequestsThousand: 250,
          monthlyDeleteRequestsThousand: 10,
          monthlyListRequestsThousand: 25,
          monthlyRetrievalGb: 40,
          replication: 'cross-region',
          lifecycleTransitionsThousand: 20,
          snapshotSizeGb: 200,
          snapshotRetentionDays: 45,
          provisionedIops: 3000,
          provisionedThroughputMbps: 125,
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'storage',
          costComponent: 'storage',
          skuId: 'modeled-storage-put-requests',
          baseMonthlyCostUsd: 0.5,
          isApproximate: true,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-get-requests',
          baseMonthlyCostUsd: 0.1,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-list-requests',
          baseMonthlyCostUsd: 0.13,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-retrieval',
          baseMonthlyCostUsd: 1.2,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-cross-region-replication',
          baseMonthlyCostUsd: 10,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-lifecycle-transitions',
          baseMonthlyCostUsd: 0.2,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-snapshots',
          baseMonthlyCostUsd: 15,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-provisioned-iops',
          baseMonthlyCostUsd: 15,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-provisioned-throughput',
          baseMonthlyCostUsd: 5,
        }),
      ]),
    );
    expect(result.providers[0].breakdown?.storageMonthlyCostUsd).toBe(47.13);
  });

  it('adds explicit modeled database dimension line items when advanced database assumptions exist', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 100,
          lineItems: [
            {
              category: 'database',
              costComponent: 'database',
              description: 'aws database',
              isApproximate: false,
              baseMonthlyCostUsd: 100,
              skuId: 'aws-database',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.14,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      database: [
        {
          role: 'primary',
          engine: 'generic_nosql',
          sizeGb: 250,
          highAvailability: true,
          backupStorageGb: 120,
          backupRetentionDays: 45,
          provisionedIops: 3000,
          readReplicaCount: 2,
          crossRegionReplicaTransferGb: 150,
          nosqlReadRequestUnitsMillion: 50,
          nosqlWriteRequestUnitsMillion: 20,
          ruPerSecond: 4000,
          queryDataTb: 8,
          cacheReplicaCount: 1,
          storageGrowthGbPerMonth: 40,
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'database',
          costComponent: 'database',
          skuId: 'modeled-database-ha-standby',
          baseMonthlyCostUsd: 55,
          isApproximate: true,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-backup-storage',
          baseMonthlyCostUsd: 17.1,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-provisioned-iops',
          baseMonthlyCostUsd: 300,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-read-replicas',
          baseMonthlyCostUsd: 170,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-replica-transfer',
          baseMonthlyCostUsd: 3,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-nosql-read-units',
          baseMonthlyCostUsd: 12.5,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-nosql-write-units',
          baseMonthlyCostUsd: 25,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-ru-capacity',
          baseMonthlyCostUsd: 32,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-query-processing',
          baseMonthlyCostUsd: 40,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-cache-replicas',
          baseMonthlyCostUsd: 45,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-storage-growth',
          baseMonthlyCostUsd: 4.6,
        }),
      ]),
    );
    expect(result.requirements?.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'database',
        serviceType: 'nosql-database',
        instanceType: 'generic_nosql - 250GB',
        scaleParams: expect.objectContaining({
          backupStorageGb: 120,
          readReplicaCount: 2,
          ruPerSecond: 4000,
        }),
      }),
    );
    expect(result.providers[0].breakdown?.databaseMonthlyCostUsd).toBe(804.2);
  });

  it('adds modeled operations line items for observability and secrets assumptions', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      serviceRequirements: [
        {
          serviceCategory: 'operations',
          serviceType: 'monitoring',
          quantity: 1,
          scaleParams: {
            observabilityMetricsMillion: 10,
            observabilityAlarms: 5,
            observabilityDashboards: 2,
          },
        },
        {
          serviceCategory: 'operations',
          serviceType: 'logging-audit',
          quantity: 1,
          scaleParams: {
            observabilityLogsIngestGb: 50,
            observabilityLogRetentionGb: 100,
          },
        },
        {
          serviceCategory: 'operations',
          serviceType: 'tracing-apm',
          quantity: 1,
          scaleParams: {
            observabilityTracesMillion: 4,
          },
        },
        {
          serviceCategory: 'security',
          serviceType: 'keys-secrets',
          quantity: 1,
          scaleParams: {
            secretsCount: 12,
            secretApiCallsTenThousand: 30,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'operations',
          costComponent: 'operations',
          skuId: 'modeled-operations-metrics',
          baseMonthlyCostUsd: 3,
          isApproximate: true,
        }),
        expect.objectContaining({
          skuId: 'modeled-operations-log-ingestion',
          baseMonthlyCostUsd: 25,
        }),
        expect.objectContaining({
          skuId: 'modeled-operations-log-retention',
          baseMonthlyCostUsd: 3,
        }),
        expect.objectContaining({
          skuId: 'modeled-operations-alarms',
          baseMonthlyCostUsd: 0.5,
        }),
        expect.objectContaining({
          skuId: 'modeled-operations-dashboards',
          baseMonthlyCostUsd: 6,
        }),
        expect.objectContaining({
          skuId: 'modeled-operations-traces',
          baseMonthlyCostUsd: 20,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-secrets',
          baseMonthlyCostUsd: 4.8,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-secret-api-calls',
          baseMonthlyCostUsd: 1.5,
        }),
      ]),
    );
    expect(result.providers[0].breakdown?.operationsMonthlyCostUsd).toBe(63.8);
  });

  it('adds modeled serverless and container runtime line items', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      serviceRequirements: [
        {
          serviceCategory: 'compute',
          serviceType: 'serverless-functions',
          quantity: 1,
          scaleParams: {
            functionInvocationsMillion: 5,
            functionDurationMs: 200,
            functionMemoryMb: 512,
          },
        },
        {
          serviceCategory: 'containers',
          serviceType: 'container-orchestration',
          quantity: 1,
          scaleParams: {
            kubernetesClusterCount: 2,
            kubernetesWorkerNodeCount: 6,
          },
        },
        {
          serviceCategory: 'containers',
          serviceType: 'container-registry',
          quantity: 1,
          scaleParams: {
            registryStorageGb: 40,
            registryEgressGb: 100,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'compute',
          skuId: 'modeled-serverless-function-requests',
          baseMonthlyCostUsd: 1,
          isApproximate: true,
        }),
        expect.objectContaining({
          skuId: 'modeled-serverless-function-duration',
          baseMonthlyCostUsd: 8.33,
        }),
        expect.objectContaining({
          skuId: 'modeled-kubernetes-control-plane',
          baseMonthlyCostUsd: 146,
        }),
        expect.objectContaining({
          skuId: 'modeled-kubernetes-node-overhead',
          baseMonthlyCostUsd: 48,
        }),
        expect.objectContaining({
          category: 'storage',
          skuId: 'modeled-container-registry-storage',
          baseMonthlyCostUsd: 4,
        }),
        expect.objectContaining({
          category: 'network',
          skuId: 'modeled-container-registry-egress',
          baseMonthlyCostUsd: 9,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 213.33,
        storageMonthlyCostUsd: 4,
        egressMonthlyCostUsd: 9,
      }),
    );
  });

  it('adds modeled analytics platform line items', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      serviceRequirements: [
        {
          serviceCategory: 'analytics',
          serviceType: 'data-warehouse',
          quantity: 1,
          scaleParams: {
            analyticsWarehouseStorageGb: 500,
            analyticsWarehouseQueryTb: 20,
          },
        },
        {
          serviceCategory: 'analytics',
          serviceType: 'data-lake',
          quantity: 1,
          scaleParams: {
            analyticsDataLakeStorageGb: 5000,
          },
        },
        {
          serviceCategory: 'analytics',
          serviceType: 'data-integration',
          quantity: 1,
          scaleParams: {
            analyticsIntegrationJobHours: 120,
          },
        },
        {
          serviceCategory: 'analytics',
          serviceType: 'streaming-analytics',
          quantity: 1,
          scaleParams: {
            analyticsStreamingIngestGb: 1000,
          },
        },
        {
          serviceCategory: 'analytics',
          serviceType: 'business-intelligence',
          quantity: 1,
          scaleParams: {
            analyticsBiUsers: 25,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'storage',
          skuId: 'modeled-analytics-warehouse-storage',
          baseMonthlyCostUsd: 12,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-analytics-warehouse-query',
          baseMonthlyCostUsd: 100,
        }),
        expect.objectContaining({
          category: 'storage',
          skuId: 'modeled-analytics-data-lake-storage',
          baseMonthlyCostUsd: 115,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-analytics-integration-job-hours',
          baseMonthlyCostUsd: 52.8,
        }),
        expect.objectContaining({
          category: 'network',
          skuId: 'modeled-analytics-streaming-ingest',
          baseMonthlyCostUsd: 14,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-analytics-bi-users',
          baseMonthlyCostUsd: 600,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 10,
        storageMonthlyCostUsd: 127,
        egressMonthlyCostUsd: 14,
        operationsMonthlyCostUsd: 752.8,
      }),
    );
  });

  it('adds modeled AI and machine-learning platform line items', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      serviceRequirements: [
        {
          serviceCategory: 'ai',
          serviceType: 'ml-training',
          quantity: 1,
          scaleParams: {
            aiTrainingGpuHours: 300,
          },
        },
        {
          serviceCategory: 'ai',
          serviceType: 'model-hosting',
          quantity: 1,
          scaleParams: {
            aiModelHostingHours: 730,
          },
        },
        {
          serviceCategory: 'ai',
          serviceType: 'ai-inference',
          quantity: 1,
          scaleParams: {
            aiInferenceRequestsMillion: 2,
          },
        },
        {
          serviceCategory: 'ai',
          serviceType: 'vector-search',
          quantity: 1,
          scaleParams: {
            aiVectorStorageGb: 200,
            aiVectorQueriesMillion: 5,
          },
        },
        {
          serviceCategory: 'ai',
          serviceType: 'generative-ai-api',
          quantity: 1,
          scaleParams: {
            aiApiInputTokensMillion: 500,
            aiApiOutputTokensMillion: 100,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'compute',
          skuId: 'modeled-ai-training-gpu-hours',
          baseMonthlyCostUsd: 918,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'compute',
          skuId: 'modeled-ai-model-hosting-hours',
          baseMonthlyCostUsd: 175.2,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-ai-inference-requests',
          baseMonthlyCostUsd: 0.4,
        }),
        expect.objectContaining({
          category: 'storage',
          skuId: 'modeled-ai-vector-storage',
          baseMonthlyCostUsd: 50,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-ai-vector-queries',
          baseMonthlyCostUsd: 0.5,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-ai-api-input-tokens',
          baseMonthlyCostUsd: 400,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-ai-api-output-tokens',
          baseMonthlyCostUsd: 240,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 1103.2,
        storageMonthlyCostUsd: 50,
        operationsMonthlyCostUsd: 640.9,
      }),
    );
  });

  it('adds modeled integration and API gateway line items', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 10,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'aws compute',
              isApproximate: false,
              baseMonthlyCostUsd: 10,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.01,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      serviceRequirements: [
        {
          serviceCategory: 'integration',
          serviceType: 'queues-messaging',
          quantity: 1,
          scaleParams: {
            integrationQueueMessagesMillion: 50,
          },
        },
        {
          serviceCategory: 'integration',
          serviceType: 'eventing',
          quantity: 1,
          scaleParams: {
            integrationEventsMillion: 20,
          },
        },
        {
          serviceCategory: 'integration',
          serviceType: 'workflow-orchestration',
          quantity: 1,
          scaleParams: {
            integrationWorkflowTransitionsThousand: 100,
          },
        },
        {
          serviceCategory: 'application',
          serviceType: 'api-gateway',
          quantity: 1,
          scaleParams: {
            integrationApiGatewayRequestsMillion: 10,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-integration-queue-messages',
          baseMonthlyCostUsd: 20,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-integration-event-routing',
          baseMonthlyCostUsd: 20,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-integration-workflow-transitions',
          baseMonthlyCostUsd: 2.5,
        }),
        expect.objectContaining({
          category: 'operations',
          skuId: 'modeled-application-api-gateway-requests',
          baseMonthlyCostUsd: 35,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 10,
        operationsMonthlyCostUsd: 77.5,
      }),
    );
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
