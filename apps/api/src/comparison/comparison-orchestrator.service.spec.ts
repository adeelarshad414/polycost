import {
  CloudProviderAdapter,
  ProviderId,
  ProviderPricingResult,
} from '../adapters/common/cloud-provider-adapter';
import { InMemoryPricingCatalogReader } from '../adapters/common/in-memory-pricing-catalog.reader';
import { MockProviderAdapter } from '../adapters/mock/mock-provider.adapter';
import { NormalizedWorkloadSpec, ServiceRequirement } from '../nws/nws.types';
import {
  ComparisonOrchestratorService,
  ComparisonUnavailableError,
} from './comparison-orchestrator.service';
import { ComparisonLineItem, ComparisonProviderResult } from './comparison.types';
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

const commitmentProviderResult = (providerId: ProviderId): ProviderPricingResult => ({
  providerId,
  baseMonthlyCostUsd: 100,
  lineItems: [
    {
      category: 'compute',
      costComponent: 'compute',
      description: `${providerId} commitment compute`,
      isApproximate: false,
      baseMonthlyCostUsd: 100,
      skuId: `${providerId}-commitment-compute`,
      region: 'us-test-1',
      unit: 'hour',
      unitPriceUsd: 0.14,
      pricingBasis: 'flat',
      pricingModels: [
        { model: 'on-demand', available: true, monthlyCostUsd: 100 },
        { model: 'reserved-1yr', available: true, monthlyCostUsd: 72 },
        { model: 'reserved-3yr', available: true, monthlyCostUsd: 55 },
        { model: 'savings-plan', available: true, monthlyCostUsd: 68 },
      ],
    },
  ],
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

const UI_PRICED_SERVICE_FAMILY_IDS = [
  'vm-compute',
  'burstable-compute',
  'autoscaling-compute',
  'serverless-functions',
  'container-orchestration',
  'serverless-containers',
  'container-registry',
  'app-platform',
  'api-gateway',
  'object-storage',
  'block-storage',
  'file-storage',
  'archive-storage',
  'relational-database',
  'nosql-database',
  'cache',
  'managed-search',
  'data-warehouse',
  'data-lake',
  'data-integration',
  'streaming-analytics',
  'business-intelligence',
  'queues-messaging',
  'eventing',
  'workflow-orchestration',
  'cdn-edge',
  'load-balancing',
  'dns',
  'private-networking',
  'dedicated-connectivity',
  'keys-secrets',
  'security-posture',
  'waf-ddos',
  'monitoring',
  'logging-audit',
  'tracing-apm',
] as const;

const uiPricedServiceCoverageWorkload: NormalizedWorkloadSpec = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-07-06T00:00:00.000Z',
  },
  workload: {
    type: 'web_app',
    region: {
      preference: 'us-east',
      isDefault: false,
    },
  },
  compute: [
    {
      role: 'general-purpose',
      scalingType: 'fixed',
      instanceCount: 1,
      vcpu: 2,
      memoryGb: 8,
      instanceFamily: 'general-purpose',
    },
    {
      role: 'burstable',
      scalingType: 'fixed',
      instanceCount: 1,
      vcpu: 2,
      memoryGb: 4,
      instanceFamily: 'burstable',
    },
    {
      role: 'autoscaling',
      scalingType: 'autoscaling',
      autoscalingRange: {
        min: 1,
        max: 3,
      },
      vcpu: 4,
      memoryGb: 16,
      instanceFamily: 'general-purpose',
    },
  ],
  storage: [
    {
      role: 'object',
      type: 'object',
      sizeGb: 500,
      accessPattern: 'frequent',
      storageClass: 'standard',
    },
    {
      role: 'block',
      type: 'block',
      sizeGb: 250,
      accessPattern: 'frequent',
      storageClass: 'standard',
    },
    {
      role: 'file',
      type: 'file',
      sizeGb: 250,
      accessPattern: 'frequent',
      storageClass: 'standard',
    },
    {
      role: 'object archive',
      type: 'object',
      sizeGb: 1_000,
      accessPattern: 'archive',
      storageClass: 'archive',
    },
  ],
  database: [
    {
      role: 'relational',
      engine: 'postgres',
      sizeGb: 200,
      highAvailability: false,
    },
    {
      role: 'nosql',
      engine: 'generic_nosql',
      sizeGb: 100,
      highAvailability: false,
      nosqlReadRequestUnitsMillion: 25,
      nosqlWriteRequestUnitsMillion: 10,
      ruPerSecond: 1_000,
    },
    {
      role: 'cache',
      engine: 'redis',
      sizeGb: 20,
      highAvailability: false,
      cacheReplicaCount: 2,
    },
  ],
  network: {
    cdn: true,
    loadBalancer: true,
    estimatedMonthlyEgressGb: 5_000,
    cdnTrafficGb: 4_000,
    cdnCacheHitRatioPercent: 85,
    cdnRequestsMillion: 75,
    loadBalancerProcessedGb: 2_000,
    loadBalancerHours: 730,
    loadBalancerNewConnectionsPerSecond: 25,
    loadBalancerActiveConnections: 4_000,
    loadBalancerRuleEvaluationsPerSecond: 250,
    dnsHostedZones: 2,
    dnsQueriesMillion: 20,
    natGatewayGb: 1_000,
    natGatewayHours: 730,
    vpnConnectionCount: 2,
    vpnConnectionHours: 730,
    vpnDataTransferGb: 300,
    privateCircuitCount: 1,
    privateCircuitPortHours: 730,
    privateCircuitDataTransferGb: 500,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
    faultTolerance: 'single-zone',
  },
  serviceRequirements: UI_PRICED_SERVICE_FAMILY_IDS.map(serviceRequirementForPricedFamily),
};

function serviceRequirementForPricedFamily(serviceType: string): ServiceRequirement {
  return {
    serviceCategory: serviceCategoryForPricedFamily(serviceType),
    serviceType,
    quantity: 1,
    scaleParams: {
      observabilityMetricsMillion: 10,
      observabilityLogsIngestGb: 250,
      observabilityLogRetentionGb: 500,
      observabilityAlarms: 25,
      observabilityDashboards: 3,
      observabilityTracesMillion: 20,
      secretsCount: 50,
      secretApiCallsTenThousand: 100,
      securityProtectedResources: 120,
      securityFindingsThousand: 10,
      wafWebAclCount: 2,
      wafRuleCount: 20,
      wafRequestsMillion: 120,
      ddosProtectedResources: 1,
      functionInvocationsMillion: 40,
      functionDurationMs: 120,
      functionMemoryMb: 512,
      appPlatformRequestsMillion: 60,
      appPlatformRequestDurationMs: 250,
      appPlatformVcpu: 1,
      appPlatformMemoryGb: 0.5,
      kubernetesClusterCount: 1,
      kubernetesWorkerNodeCount: 3,
      kubernetesWorkerVcpu: 2,
      kubernetesWorkerMemoryGb: 8,
      registryStorageGb: 250,
      registryEgressGb: 100,
      databaseRole: 'search',
      searchNodeCount: 2,
      searchNodeHours: 730,
      searchStorageGb: 200,
      searchQueriesMillion: 5,
      analyticsWarehouseStorageGb: 1_000,
      analyticsWarehouseQueryTb: 20,
      analyticsDataLakeStorageGb: 2_000,
      analyticsIntegrationJobHours: 120,
      analyticsStreamingIngestGb: 500,
      analyticsBiUsers: 10,
      integrationQueueMessagesMillion: 50,
      integrationEventsMillion: 50,
      integrationWorkflowTransitionsThousand: 250,
      integrationApiGatewayRequestsMillion: 100,
    },
  };
}

function serviceCategoryForPricedFamily(
  serviceType: string,
): ServiceRequirement['serviceCategory'] {
  if (
    ['vm-compute', 'burstable-compute', 'autoscaling-compute', 'serverless-functions'].includes(
      serviceType,
    )
  ) {
    return 'compute';
  }

  if (
    ['container-orchestration', 'serverless-containers', 'container-registry'].includes(serviceType)
  ) {
    return 'containers';
  }

  if (['app-platform', 'api-gateway'].includes(serviceType)) {
    return 'application';
  }

  if (
    ['object-storage', 'block-storage', 'file-storage', 'archive-storage'].includes(serviceType)
  ) {
    return 'storage';
  }

  if (['relational-database', 'nosql-database', 'cache', 'managed-search'].includes(serviceType)) {
    return 'database';
  }

  if (
    [
      'data-warehouse',
      'data-lake',
      'data-integration',
      'streaming-analytics',
      'business-intelligence',
    ].includes(serviceType)
  ) {
    return 'analytics';
  }

  if (['queues-messaging', 'eventing', 'workflow-orchestration'].includes(serviceType)) {
    return 'integration';
  }

  if (
    ['cdn-edge', 'load-balancing', 'dns', 'private-networking', 'dedicated-connectivity'].includes(
      serviceType,
    )
  ) {
    return 'networking';
  }

  if (['keys-secrets', 'security-posture', 'waf-ddos'].includes(serviceType)) {
    return 'security';
  }

  return 'operations';
}

async function mockCatalogAdapter(providerId: ProviderId): Promise<CloudProviderAdapter> {
  const seedAdapter = new MockProviderAdapter(
    providerId,
    new InMemoryPricingCatalogReader([]),
    providerId === 'azure' ? 'eastus' : providerId === 'gcp' ? 'us-central1' : 'us-east-1',
    () => new Date('2026-07-06T00:00:00.000Z'),
  );
  const records = await seedAdapter.refreshPricingCatalog();

  return new MockProviderAdapter(
    providerId,
    new InMemoryPricingCatalogReader(records),
    providerId === 'azure' ? 'eastus' : providerId === 'gcp' ? 'us-central1' : 'us-east-1',
    () => new Date('2026-07-06T00:00:00.000Z'),
  );
}

function expectProviderPricingEvidence(
  provider: ComparisonProviderResult,
  requiredModeledSkuIds: readonly string[],
): void {
  const catalogLineItems = provider.lineItems.filter(
    (lineItem) => lineItem.skuId?.startsWith('modeled-') !== true,
  );
  const modeledLineItems = provider.lineItems.filter(
    (lineItem) => lineItem.skuId?.startsWith('modeled-') === true,
  );

  expect(catalogLineItems.length).toBeGreaterThanOrEqual(11);
  expect(catalogLineItems.map((lineItem) => lineItem.category)).toEqual(
    expect.arrayContaining(['compute', 'storage', 'database', 'network']),
  );

  for (const lineItem of catalogLineItems) {
    expectCatalogLineItemEvidence(provider.providerId, lineItem);
  }

  for (const skuId of requiredModeledSkuIds) {
    const lineItem = modeledLineItems.find((candidate) => candidate.skuId === skuId);

    expect(lineItem).toBeDefined();
    if (lineItem) {
      expectModeledLineItemEvidence(provider.providerId, lineItem);
    }
  }
}

function expectCatalogLineItemEvidence(providerId: ProviderId, lineItem: ComparisonLineItem): void {
  expect(lineItem.rateSource).toBe('pricing_catalog');
  expect(lineItem.rateSourceSkuId).toBe(lineItem.skuId);
  expect(lineItem.rateCurrency).toBe('USD');
  expect(lineItem.rateValidFrom).toMatch(/^\d{4}-\d{2}-\d{2}/);
  expect(lineItem.rateSourceFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(lineItem.region).toEqual(expect.any(String));
  expect(lineItem.unit).toEqual(expect.any(String));
  expect(lineItem.unitPriceUsd).toEqual(expect.any(Number));
  expect(lineItem.baseMonthlyCostUsd).toBeGreaterThan(0);
  expect(lineItem.pricingTrace).toEqual(
    expect.objectContaining({
      providerId,
      serviceCategory: lineItem.category,
      costComponent: lineItem.costComponent,
      source: 'pricing_catalog',
      sourceRecordKey: expect.stringContaining(
        `${providerId}|${lineItem.category}|${lineItem.skuId}|`,
      ),
      resolvedSkuId: lineItem.skuId,
      sourceSkuId: lineItem.skuId,
      region: lineItem.region,
      unit: lineItem.unit,
      unitPriceUsd: lineItem.unitPriceUsd,
      currency: 'USD',
      effectiveDate: lineItem.rateValidFrom,
      fetchedAt: lineItem.rateSourceFetchedAt,
      sourceEndpoint: expect.stringMatching(/^(fixture|https):/),
      sourceRecordId: expect.any(String),
      transformVersion: 'pricing-normalization-v3',
      sourcePayloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      derivation: expect.objectContaining({
        unitPriceUsd: lineItem.unitPriceUsd,
        monthlyCostUsd: lineItem.baseMonthlyCostUsd,
      }),
      isApproximate: lineItem.isApproximate,
      isEstimate: false,
    }),
  );
}

function expectModeledLineItemEvidence(providerId: ProviderId, lineItem: ComparisonLineItem): void {
  expect(lineItem.rateSource).toBe('manual_model');
  expect(lineItem.rateSourceSkuId).toBe(lineItem.skuId);
  expect(lineItem.rateCurrency).toBe('USD');
  expect(lineItem.unit).toEqual(expect.any(String));
  expect(lineItem.unitPriceUsd).toEqual(expect.any(Number));
  expect(lineItem.pricingTrace).toEqual(
    expect.objectContaining({
      providerId,
      serviceCategory: lineItem.category,
      costComponent: lineItem.costComponent,
      source: 'manual_model',
      sourceRecordKey: expect.stringContaining(
        `${providerId}|${lineItem.category}|${lineItem.skuId}|`,
      ),
      resolvedSkuId: lineItem.skuId,
      sourceSkuId: lineItem.skuId,
      unit: lineItem.unit,
      unitPriceUsd: lineItem.unitPriceUsd,
      equivalenceConfidence: lineItem.isApproximate ? 'approximate' : 'direct',
      isApproximate: lineItem.isApproximate,
      isEstimate: true,
    }),
  );
}

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
        availability: {
          multiAz: false,
          multiRegion: false,
        },
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
      pricingModelRecommendation: {
        preferredModel: 'on-demand',
        confidence: 'high',
        rationale:
          'Defaulting to on-demand for an unspecified workload with no commitment preference signal, preserving flexibility and avoiding unsupported long-term commitments.',
        sourceSignals: {
          flexibilityBias: 'flexibility',
        },
      },
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

  it('warns when a data residency lock adjusts the requested comparison region', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [20])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workload: {
        ...validWorkload.workload,
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
    });

    expect(result.warnings).toEqual([
      {
        code: 'data_residency_region_adjusted',
        message:
          "Data residency lock 'eu' constrained pricing to eu-west; requested region 'us-east' is outside the allowed geography.",
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
      networkingMonthlyCostUsd: 0,
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

  it('prices every UI family currently labeled priced through mock catalog coverage', async () => {
    const service = createService([
      await mockCatalogAdapter('aws'),
      await mockCatalogAdapter('azure'),
      await mockCatalogAdapter('gcp'),
    ]);

    const result = await service.compare(uiPricedServiceCoverageWorkload);
    const requiredSkuIds = [
      'modeled-serverless-function-requests',
      'modeled-app-platform-requests',
      'modeled-kubernetes-control-plane',
      'modeled-container-registry-storage',
      'modeled-application-api-gateway-requests',
      'modeled-database-nosql-read-units',
      'modeled-database-cache-replicas',
      'modeled-database-search-capacity',
      'modeled-analytics-warehouse-storage',
      'modeled-analytics-data-lake-storage',
      'modeled-analytics-integration-job-hours',
      'modeled-analytics-streaming-ingest',
      'modeled-analytics-bi-users',
      'modeled-integration-queue-messages',
      'modeled-integration-event-routing',
      'modeled-integration-workflow-transitions',
      'modeled-cdn-viewer-transfer',
      'modeled-load-balancer-capacity',
      'modeled-dns',
      'modeled-nat-gateway',
      'modeled-vpn-connectivity',
      'modeled-private-circuit',
      'modeled-security-secrets',
      'modeled-security-posture-resources',
      'modeled-security-waf-acls',
      'modeled-operations-metrics',
      'modeled-operations-log-ingestion',
      'modeled-operations-traces',
    ];

    expect(result.warnings).toBeUndefined();
    expect(result.providers).toHaveLength(3);
    expect(
      result.requirements?.serviceRequirements.map((requirement) => requirement.serviceType),
    ).toEqual(expect.arrayContaining(UI_PRICED_SERVICE_FAMILY_IDS));

    for (const provider of result.providers) {
      const skuIds = new Set(provider.lineItems.map((lineItem) => lineItem.skuId));

      expect(provider.totals.monthly).toBeGreaterThan(0);
      expect(provider.lineItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'compute',
            description: expect.stringContaining('general-purpose compute'),
          }),
          expect.objectContaining({
            category: 'compute',
            description: expect.stringContaining('burstable compute'),
          }),
          expect.objectContaining({
            category: 'compute',
            description: expect.stringContaining('autoscaling compute'),
          }),
          expect.objectContaining({
            category: 'storage',
            description: expect.stringContaining('object standard storage'),
          }),
          expect.objectContaining({
            category: 'storage',
            description: expect.stringContaining('block standard storage'),
          }),
          expect.objectContaining({
            category: 'storage',
            description: expect.stringContaining('file standard storage'),
          }),
          expect.objectContaining({
            category: 'storage',
            description: expect.stringContaining('object archive'),
          }),
          expect.objectContaining({
            category: 'database',
            description: expect.stringContaining('relational database'),
          }),
          expect.objectContaining({
            category: 'database',
            description: expect.stringContaining('nosql database'),
          }),
          expect.objectContaining({
            category: 'database',
            description: expect.stringContaining('cache database'),
          }),
        ]),
      );

      expect(requiredSkuIds.filter((skuId) => !skuIds.has(skuId))).toEqual([]);
      expectProviderPricingEvidence(provider, requiredSkuIds);
    }
  });

  it('recommends 3-year reserved pricing for production workloads with high commitment appetite', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => commitmentProviderResult('aws')),
      ),
      adapter(
        'azure',
        jest.fn(async () => commitmentProviderResult('azure')),
      ),
      adapter(
        'gcp',
        jest.fn(async () => commitmentProviderResult('gcp')),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        environment: 'production',
        commitmentPreferencePercent: 90,
      },
    });

    expect(result.pricingModelRecommendation).toEqual({
      preferredModel: 'reserved-3yr',
      confidence: 'high',
      rationale: expect.stringContaining('production workload with 90% commitment preference'),
      sourceSignals: {
        environment: 'production',
        commitmentPreferencePercent: 90,
        flexibilityBias: 'cost-optimized',
      },
    });
  });

  it('keeps development workloads on-demand unless commitment appetite is explicit and extreme', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => commitmentProviderResult('aws')),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        environment: 'development',
        commitmentPreferencePercent: 70,
      },
    });

    expect(result.pricingModelRecommendation).toEqual({
      preferredModel: 'on-demand',
      confidence: 'high',
      rationale: expect.stringContaining('development workload with 70% commitment preference'),
      sourceSignals: {
        environment: 'development',
        commitmentPreferencePercent: 70,
        flexibilityBias: 'balanced',
      },
    });
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
          description: expect.stringMatching(
            /scheduled duty cycle .*multi-region resilience capacity x1\.65/,
          ),
          baseMonthlyCostUsd: 42.9,
        }),
        expect.objectContaining({
          category: 'support',
          costComponent: 'support',
          description: 'AWS Business Support support estimate',
          baseMonthlyCostUsd: 100,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'licensing',
          costComponent: 'licensing',
          baseMonthlyCostUsd: 39.47,
          isApproximate: true,
        }),
        expect.objectContaining({
          category: 'operations',
          costComponent: 'operations',
          baseMonthlyCostUsd: 35,
          isApproximate: true,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 42.9,
        supportMonthlyCostUsd: 100,
        licensingMonthlyCostUsd: 39.47,
        operationsMonthlyCostUsd: 35,
      }),
    );
  });

  it('applies HA resource capacity multipliers to compute pricing models', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 100,
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
              unitPriceUsd: 0.137,
              pricingBasis: 'flat',
              pricingModels: [
                { model: 'on-demand', available: true, monthlyCostUsd: 100 },
                { model: 'reserved-1yr', available: true, monthlyCostUsd: 60 },
              ],
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      availability: {
        multiAz: true,
        multiRegion: false,
        faultTolerance: 'multi-az',
      },
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'compute',
          description: 'aws compute (multi-AZ resilience capacity x1.20)',
          baseMonthlyCostUsd: 120,
          pricingModels: expect.arrayContaining([
            expect.objectContaining({
              model: 'reserved-1yr',
              monthlyCostUsd: 72,
              caveat: 'multi-AZ resilience capacity x1.20',
            }),
          ]),
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 120,
        operationsMonthlyCostUsd: 0,
      }),
    );
  });

  it('adds modeled dedicated tenancy premiums when catalog compute falls back to shared capacity', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 100,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'web compute: AWS shared compute fallback',
              isApproximate: true,
              baseMonthlyCostUsd: 100,
              skuId: 'aws-shared-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.137,
              pricingBasis: 'flat',
              pricingModels: [
                { model: 'on-demand', available: true, monthlyCostUsd: 100 },
                { model: 'reserved-1yr', available: true, monthlyCostUsd: 60 },
                { model: 'reserved-3yr', available: true, monthlyCostUsd: 45 },
                { model: 'spot', available: true, monthlyCostUsd: 35 },
                { model: 'savings-plan', available: true, monthlyCostUsd: 58 },
              ],
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      compute: [
        {
          role: 'web',
          vcpu: 4,
          scalingType: 'fixed',
          instanceCount: 3,
          tenancy: 'dedicated-host',
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'compute',
          costComponent: 'compute',
          description: expect.stringContaining(
            'AWS Dedicated host tenancy premium estimate (web: 1 64-vCPU host(s), 16 instance(s)/host density)',
          ),
          skuId: 'modeled-compute-dedicated-host-premium',
          isApproximate: true,
          baseMonthlyCostUsd: 2767.79,
          pricingModels: expect.arrayContaining([
            expect.objectContaining({
              model: 'reserved-1yr',
              available: true,
              monthlyCostUsd: 2269.59,
            }),
            expect.objectContaining({
              model: 'spot',
              available: true,
              monthlyCostUsd: 2767.79,
              estimated: true,
              volatility: 'volatile',
            }),
          ]),
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 2867.79,
      }),
    );
    expect(result.providers[0].pricingModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'reserved-1yr',
          available: true,
        }),
        expect.objectContaining({
          model: 'savings-plan',
          available: true,
        }),
        expect.objectContaining({
          model: 'spot',
          available: true,
          estimated: true,
          volatility: 'volatile',
        }),
      ]),
    );
  });

  it('models AWS T-series CPU credit overage when burstable utilization exceeds baseline', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [100])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      compute: [
        {
          role: 'web',
          instanceFamily: 'burstable',
          vcpu: 2,
          scalingType: 'fixed',
          instanceCount: 2,
        },
      ],
      workloadProfile: {
        usagePattern: {
          type: 'always_on',
          averageUtilizationPercent: 70,
        },
      },
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'compute',
          costComponent: 'compute',
          description: expect.stringContaining(
            'AWS T-series CPU credit overage estimate for web (70% avg vs 20% baseline, 1460 vCPU-credit-hour)',
          ),
          skuId: 'modeled-compute-burstable-cpu-credits-1',
          isApproximate: true,
          baseMonthlyCostUsd: 73,
          unit: 'vCPU-credit-hour',
          unitPriceUsd: 0.05,
        }),
      ]),
    );
    expect(result.providers[0].breakdown).toEqual(
      expect.objectContaining({
        computeMonthlyCostUsd: 173,
      }),
    );
  });

  it('surfaces zero-cost burstable CPU risk for Azure and GCP without changing totals', async () => {
    const service = createService([
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [100])),
      ),
      adapter(
        'gcp',
        jest.fn(async () => providerResult('gcp', [100])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      compute: [
        {
          role: 'worker',
          instanceFamily: 'burstable',
          vcpu: 2,
          scalingType: 'fixed',
          instanceCount: 2,
        },
      ],
      workloadProfile: {
        usagePattern: {
          type: 'always_on',
          averageUtilizationPercent: 70,
        },
      },
    });

    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'azure',
          breakdown: expect.objectContaining({
            computeMonthlyCostUsd: 100,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringContaining(
                'Azure B-series CPU credit depletion risk signal for worker (70% avg vs 20% baseline; no paid overage modeled)',
              ),
              skuId: 'modeled-compute-burstable-cpu-credits-1',
              baseMonthlyCostUsd: 0,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'gcp',
          breakdown: expect.objectContaining({
            computeMonthlyCostUsd: 100,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringContaining(
                'GCP E2 shared-core scheduling risk signal for worker (70% avg vs 20% baseline; no paid overage modeled)',
              ),
              skuId: 'modeled-compute-burstable-cpu-credits-1',
              baseMonthlyCostUsd: 0,
            }),
          ]),
        }),
      ]),
    );
  });

  it('uses provider-specific public support rate cards', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [300_000])),
      ),
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [300_000])),
      ),
      adapter(
        'gcp',
        jest.fn(async () => providerResult('gcp', [300_000])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        supportTier: 'business',
      },
    });

    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 15_800,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'AWS Business Support support estimate',
              skuId: 'modeled-support-business',
              baseMonthlyCostUsd: 15_800,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'azure',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 100,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'Azure Standard support estimate',
              baseMonthlyCostUsd: 100,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'gcp',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 15_900,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'GCP Enhanced support estimate',
              baseMonthlyCostUsd: 15_900,
            }),
          ]),
        }),
      ]),
    );
  });

  it('labels AWS developer support separately from business support', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [100])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        supportTier: 'developer',
      },
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'AWS Developer Support support estimate',
          skuId: 'modeled-support-developer',
          baseMonthlyCostUsd: 29,
        }),
      ]),
    );
  });

  it('models enterprise-on-ramp support as distinct provider plan line items', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [120_000])),
      ),
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [120_000])),
      ),
      adapter(
        'gcp',
        jest.fn(async () => providerResult('gcp', [120_000])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        supportTier: 'enterprise_onramp',
      },
    });

    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 12_000,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'AWS Enterprise On-Ramp support estimate',
              skuId: 'modeled-support-enterprise-onramp',
              baseMonthlyCostUsd: 12_000,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'azure',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 1_000,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'Azure Professional Direct support estimate',
              skuId: 'modeled-support-enterprise-onramp',
              baseMonthlyCostUsd: 1_000,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'gcp',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 7_900,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'GCP Enhanced support estimate',
              skuId: 'modeled-support-enterprise-onramp',
              baseMonthlyCostUsd: 7_900,
            }),
          ]),
        }),
      ]),
    );
  });

  it('maps enterprise support to premier or premium provider support plans', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [300_000])),
      ),
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [300_000])),
      ),
      adapter(
        'gcp',
        jest.fn(async () => providerResult('gcp', [300_000])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        supportTier: 'enterprise',
      },
    });

    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 25_500,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'AWS Enterprise Support support estimate',
              baseMonthlyCostUsd: 25_500,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'azure',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 15_000,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'Azure Unified Enterprise support estimate',
              baseMonthlyCostUsd: 15_000,
            }),
          ]),
        }),
        expect.objectContaining({
          providerId: 'gcp',
          breakdown: expect.objectContaining({
            supportMonthlyCostUsd: 25_500,
          }),
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              description: 'GCP Premium support estimate',
              baseMonthlyCostUsd: 25_500,
            }),
          ]),
        }),
      ]),
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
      workload: {
        ...validWorkload.workload,
        region: {
          preference: 'us-east-1',
          isDefault: false,
        },
      },
      network: {
        estimatedMonthlyEgressGb: 0,
        crossAzTransferGb: 100,
        interRegionTransferGb: 200,
        interRegionDestination: 'eu-west-1',
        cdn: true,
        cdnTrafficGb: 1000,
        cdnCacheHitRatioPercent: 80,
        cdnRequestsMillion: 20,
        natGatewayGb: 500,
        natGatewayHours: 730,
        dnsHostedZones: 2,
        dnsQueriesMillion: 3,
        loadBalancer: true,
        loadBalancerProcessedGb: 250,
        loadBalancerHours: 730,
        loadBalancerNewConnectionsPerSecond: 75,
        loadBalancerActiveConnections: 9000,
        loadBalancerRuleEvaluationsPerSecond: 1500,
        vpnConnectionCount: 2,
        vpnConnectionHours: 730,
        vpnDataTransferGb: 1000,
        privateCircuitCount: 1,
        privateCircuitPortHours: 730,
        privateCircuitDataTransferGb: 2000,
      },
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'network',
          costComponent: 'networking',
          skuId: 'modeled-cross-az-transfer',
          baseMonthlyCostUsd: 1,
          isApproximate: true,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-inter-region-transfer',
          description: expect.stringContaining('us-east to eu-west'),
          baseMonthlyCostUsd: 10,
        }),
        expect.objectContaining({
          costComponent: 'egress',
          skuId: 'modeled-cdn-viewer-transfer',
          description: expect.stringContaining('80% cache hit'),
          baseMonthlyCostUsd: 85,
        }),
        expect.objectContaining({
          costComponent: 'egress',
          skuId: 'modeled-cdn-origin-transfer',
          description: expect.stringContaining('80% cache hit'),
          baseMonthlyCostUsd: 2,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-cdn-edge-requests',
          description: expect.stringContaining('20M requests'),
          baseMonthlyCostUsd: 15,
        }),
        expect.objectContaining({
          costComponent: 'egress',
          skuId: 'modeled-cdn-break-even-evidence',
          description: expect.stringContaining(
            'AWS CDN break-even evidence (CDN adds $12.00/mo: direct egress $90.00/mo vs CDN $102.00/mo; break-even 5000 GB at 80% cache hit and 20M requests)',
          ),
          baseMonthlyCostUsd: 0,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-nat-gateway',
          baseMonthlyCostUsd: 55.35,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-dns',
          baseMonthlyCostUsd: 2.2,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-load-balancer-capacity',
          baseMonthlyCostUsd: 18.43,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-load-balancer-lcu',
          description: expect.stringContaining('3.00 LCU peak'),
          baseMonthlyCostUsd: 17.52,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-vpn-connectivity',
          description: expect.stringContaining('2 connection(s), 730 hrs, 1000 GB transfer'),
          baseMonthlyCostUsd: 163,
        }),
        expect.objectContaining({
          costComponent: 'networking',
          skuId: 'modeled-private-circuit',
          description: expect.stringContaining('1 circuit(s), 730 port hrs, 2000 GB transfer'),
          baseMonthlyCostUsd: 259,
        }),
      ]),
    );
    expect(result.providers[0].breakdown?.egressMonthlyCostUsd).toBe(87);
    expect(result.providers[0].breakdown?.networkingMonthlyCostUsd).toBe(541.5);
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
          objectRetentionDays: 30,
          replication: 'cross-region',
          lifecycleTransitionsThousand: 20,
          snapshotSizeGb: 200,
          snapshotRetentionDays: 45,
          provisionedIops: 3000,
          provisionedThroughputMbps: 125,
        },
        {
          role: 'media-index',
          type: 'object',
          sizeGb: 100,
          accessPattern: 'frequent',
          storageClass: 'intelligent-tiering',
          objectCountThousand: 4000,
        },
        {
          role: 'shared-files',
          type: 'file',
          sizeGb: 300,
          accessPattern: 'infrequent',
          storageClass: 'infrequent-access',
        },
        {
          role: 'cluster-disk',
          type: 'block',
          sizeGb: 100,
          multiAttachEnabled: true,
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
          skuId: 'modeled-storage-intelligent-tiering-monitoring',
          baseMonthlyCostUsd: 10,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-file-service-evidence',
          description: expect.stringContaining(
            'AWS shared-files file storage evidence (Amazon EFS Standard/IA with bursting, elastic, or provisioned throughput; 300 GB infrequent access, throughput and replication mode must be validated for the final SKU)',
          ),
          baseMonthlyCostUsd: 0,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-minimum-duration',
          description: expect.stringContaining('30d planned, 90d billable minimum'),
          baseMonthlyCostUsd: 3.6,
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
          skuId: 'modeled-storage-lifecycle-net-savings',
          description: expect.stringContaining(
            'AWS assets lifecycle savings evidence vs all-standard storage (archive: $9.70/mo gross savings - $0.20/mo transition cost = $9.50/mo net savings, before retrieval charges)',
          ),
          baseMonthlyCostUsd: 0,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-snapshots',
          baseMonthlyCostUsd: 15,
        }),
        expect.objectContaining({
          skuId: 'modeled-storage-multi-attach',
          baseMonthlyCostUsd: 2,
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
    expect(result.providers[0].breakdown?.storageMonthlyCostUsd).toBe(62.73);
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
          skuId: 'modeled-database-nosql-provisioned-evidence',
          description: expect.stringContaining(
            'AWS primary NoSQL provisioned-capacity evidence (DynamoDB provisioned capacity (19.03 RCU / 7.61 WCU average) = $5.42/mo vs on-demand $37.50/mo; provisioned saves $32.08/mo at steady traffic)',
          ),
          baseMonthlyCostUsd: 0,
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

  it('adds SQL Server license-included surcharge as a separate licensing line item', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [100])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        operatingSystem: 'linux',
      },
      database: [
        {
          role: 'primary',
          engine: 'sql_server',
          sizeGb: 600,
          highAvailability: true,
        },
      ],
    });

    const provider = result.providers[0];

    expect(provider).toBeDefined();
    expect(provider?.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'licensing',
          costComponent: 'licensing',
          description:
            'AWS SQL Server license-included surcharge estimate (4 vCPU HA pair, 5840 vCPU-hrs)',
          skuId: 'modeled-sql-server-license-1',
          baseMonthlyCostUsd: 700.8,
          unit: 'vCPU-hour',
          unitPriceUsd: 0.12,
          isApproximate: true,
        }),
      ]),
    );
    expect(provider?.breakdown?.licensingMonthlyCostUsd).toBe(700.8);
  });

  it('keeps SQL Server BYOL and Azure Hybrid Benefit visible as an audited zero-cost license path', async () => {
    const service = createService([
      adapter(
        'azure',
        jest.fn(async () => providerResult('azure', [100])),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      workloadProfile: {
        operatingSystem: 'byol',
      },
      database: [
        {
          role: 'primary',
          engine: 'sql_server',
          sizeGb: 600,
          highAvailability: false,
        },
      ],
    });

    const provider = result.providers[0];

    expect(provider).toBeDefined();
    expect(provider?.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'licensing',
          costComponent: 'licensing',
          description:
            'Azure SQL Server Azure Hybrid Benefit/BYOL applied (4 vCPU single instance, modeled license-included delta avoided)',
          skuId: 'modeled-sql-server-license-byol-1',
          baseMonthlyCostUsd: 0,
          unit: 'vCPU-hour avoided',
          unitPriceUsd: 0,
          isApproximate: true,
        }),
      ]),
    );
    expect(provider?.breakdown?.licensingMonthlyCostUsd).toBe(0);
  });

  it('adds modeled managed-search database line items from service requirements', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async (): Promise<ProviderPricingResult> => ({
          providerId: 'aws',
          baseMonthlyCostUsd: 20,
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'AWS compute',
              isApproximate: false,
              baseMonthlyCostUsd: 20,
              skuId: 'aws-compute',
              region: 'us-east-1',
              unit: 'hour',
              unitPriceUsd: 0.03,
            },
          ],
        })),
      ),
    ]);

    const result = await service.compare({
      ...validWorkload,
      database: [],
      serviceRequirements: [
        {
          serviceCategory: 'database',
          serviceType: 'managed-search',
          instanceType: '2 search nodes - 500GB index',
          quantity: 1,
          scaleParams: {
            searchNodeCount: 2,
            searchNodeHours: 730,
            searchStorageGb: 500,
            searchQueriesMillion: 25,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skuId: 'modeled-database-search-capacity',
          description: 'Amazon OpenSearch Service capacity estimate',
          baseMonthlyCostUsd: 350.4,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-search-storage',
          description: 'Amazon OpenSearch Service index storage estimate',
          baseMonthlyCostUsd: 67.5,
        }),
        expect.objectContaining({
          skuId: 'modeled-database-search-queries',
          description: 'Amazon OpenSearch Service search query estimate',
          baseMonthlyCostUsd: 0,
        }),
      ]),
    );
    expect(result.providers[0].breakdown?.databaseMonthlyCostUsd).toBe(417.9);
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

  it('adds modeled security posture and WAF line items', async () => {
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
          serviceCategory: 'security',
          serviceType: 'security-posture',
          quantity: 1,
          scaleParams: {
            securityProtectedResources: 100,
            securityFindingsThousand: 25,
          },
        },
        {
          serviceCategory: 'security',
          serviceType: 'waf-ddos',
          quantity: 1,
          scaleParams: {
            wafWebAclCount: 2,
            wafRuleCount: 10,
            wafRequestsMillion: 80,
            ddosProtectedResources: 1,
          },
        },
      ],
    });

    expect(result.providers[0].lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'operations',
          costComponent: 'operations',
          skuId: 'modeled-security-posture-resources',
          baseMonthlyCostUsd: 3,
          isApproximate: true,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-posture-findings',
          baseMonthlyCostUsd: 5,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-waf-acls',
          baseMonthlyCostUsd: 10,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-waf-rules',
          baseMonthlyCostUsd: 10,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-waf-requests',
          baseMonthlyCostUsd: 48,
        }),
        expect.objectContaining({
          skuId: 'modeled-security-ddos-protection',
          baseMonthlyCostUsd: 3000,
        }),
      ]),
    );
    expect(result.providers[0].breakdown?.operationsMonthlyCostUsd).toBe(3076);
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
            kubernetesWorkerVcpu: 2,
            kubernetesWorkerMemoryGb: 4,
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
          skuId: 'modeled-serverless-function-memory-tradeoff',
          description: expect.stringContaining(
            'AWS serverless function memory tradeoff evidence (512MB at 200ms costs $8.33/mo; 1024MB must run at <=100ms to keep GB-second spend flat)',
          ),
          baseMonthlyCostUsd: 0,
        }),
        expect.objectContaining({
          skuId: 'modeled-kubernetes-control-plane',
          baseMonthlyCostUsd: 146,
        }),
        expect.objectContaining({
          skuId: 'modeled-kubernetes-worker-node-compute',
          baseMonthlyCostUsd: 445.02,
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
        computeMonthlyCostUsd: 658.35,
        storageMonthlyCostUsd: 4,
        egressMonthlyCostUsd: 9,
      }),
    );
  });

  it.each(['app-platform', 'serverless-containers'])(
    'adds modeled %s request-based line items',
    async (serviceType) => {
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
            serviceCategory: serviceType === 'app-platform' ? 'application' : 'containers',
            serviceType,
            quantity: 1,
            scaleParams: {
              appPlatformRequestsMillion: 10,
              appPlatformRequestDurationMs: 400,
              appPlatformVcpu: 1,
              appPlatformMemoryGb: 0.5,
              appPlatformAlwaysOnHours: 730,
              appPlatformMinInstances: 1,
            },
          },
        ],
      });

      expect(result.providers[0].lineItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'compute',
            skuId: 'modeled-app-platform-requests',
            baseMonthlyCostUsd: 0,
            unit: '1M requests',
          }),
          expect.objectContaining({
            skuId: 'modeled-app-platform-request-compute',
            baseMonthlyCostUsd: 71.11,
            unit: 'vCPU-hour',
          }),
          expect.objectContaining({
            skuId: 'modeled-app-platform-request-memory',
            baseMonthlyCostUsd: 3.89,
            unit: 'GB-hour',
          }),
        ]),
      );
      expect(result.providers[0].breakdown).toEqual(
        expect.objectContaining({
          computeMonthlyCostUsd: 85,
        }),
      );
    },
  );

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
          category: 'operations',
          skuId: 'modeled-analytics-warehouse-capacity-evidence',
          description: expect.stringContaining(
            'AWS data warehouse capacity evidence (20 TB queried = $100.00/mo on-demand vs Redshift reserved RA3 floor $1080.00/mo; on-demand saves $980.00/mo; break-even 216 TB/mo)',
          ),
          baseMonthlyCostUsd: 0,
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
          costComponent: 'networking',
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
        egressMonthlyCostUsd: 0,
        networkingMonthlyCostUsd: 14,
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

  it('adds public pricing trace evidence when provider line items only have flat rate fields', async () => {
    const service = createService([
      adapter(
        'aws',
        jest.fn(async () => providerResult('aws', [20])),
      ),
    ]);

    const result = await service.compare(validWorkload);

    expect(result.providers[0].lineItems[0]).toEqual(
      expect.objectContaining({
        rateSource: 'pricing_catalog',
        rateSourceSkuId: 'aws-0',
        pricingTrace: expect.objectContaining({
          providerId: 'aws',
          serviceCategory: 'compute',
          source: 'pricing_catalog',
          sourceRecordKey: 'aws|compute|aws-0|us-test-1|month|pricing_catalog',
          resolvedSkuId: 'aws-0',
          sourceSkuId: 'aws-0',
          region: 'us-test-1',
          unit: 'month',
          unitPriceUsd: 20,
          isApproximate: false,
          isEstimate: false,
        }),
      }),
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
