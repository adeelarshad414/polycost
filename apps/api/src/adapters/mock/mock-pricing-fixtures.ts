/* eslint-disable security/detect-object-injection -- Reviewed 2026-07-06: fixture expansion uses trusted provider/category dictionaries generated in-repo; see docs/SECURITY-SUPPRESSIONS.md. */
import {
  PricingCatalogRecord,
  PricingModelKey,
  ProviderId,
} from '../common/cloud-provider-adapter';

type ComputeFamily =
  | 'general-purpose'
  | 'burstable'
  | 'compute-optimized'
  | 'memory-optimized'
  | 'storage-optimized'
  | 'accelerated-computing';

interface MockProviderShape {
  provider: ProviderId;
  label: string;
  region: string;
  skuAttribute: 'instanceType' | 'armSkuName' | 'machineType';
  compute: Array<{
    sku: string;
    name: string;
    family: ComputeFamily;
    vcpu: number;
    memoryGb: number;
    hourlyUsd: number;
    processorArchitecture: 'x86_64' | 'arm64' | 'gpu';
    networkBaseline: string;
    diskBaseline: string;
  }>;
  storage: Array<{
    sku: string;
    serviceName: string;
    description: string;
    unitPriceUsd: number;
    type: 'object' | 'block' | 'file';
    storageClass: string;
    accessPattern: 'frequent' | 'infrequent' | 'archive';
    retrievalUsdPerGb?: number;
    minimumDurationDays?: number;
    iopsBaseline?: string;
    throughputBaseline?: string;
  }>;
  database: Array<{
    sku: string;
    serviceName: string;
    engine: string;
    hourlyUsd: number;
  }>;
  egressTiers: Array<{
    tierFromGb: number;
    tierToGb?: number;
    pricePerGb: number;
  }>;
}

const PRICING_MODEL_FACTORS: Record<PricingModelKey, number> = {
  'on-demand': 1,
  'reserved-1yr': 0.68,
  'reserved-3yr': 0.52,
  'savings-plan': 0.72,
  spot: 0.38,
};

const PROVIDER_SHAPES: Record<ProviderId, MockProviderShape> = {
  aws: {
    provider: 'aws',
    label: 'AWS',
    region: 'us-east-1',
    skuAttribute: 'instanceType',
    compute: [
      {
        sku: 'm7i.large',
        name: 'Amazon EC2 M7i Large',
        family: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        hourlyUsd: 0.096,
        processorArchitecture: 'x86_64',
        networkBaseline: 'up to 12.5 Gbps',
        diskBaseline: 'EBS gp3 baseline 3,000 IOPS',
      },
      {
        sku: 't4g.medium',
        name: 'Amazon EC2 T4g Medium',
        family: 'burstable',
        vcpu: 2,
        memoryGb: 4,
        hourlyUsd: 0.0336,
        processorArchitecture: 'arm64',
        networkBaseline: 'burstable up to 5 Gbps',
        diskBaseline: 'EBS burst baseline',
      },
      {
        sku: 'c7i.xlarge',
        name: 'Amazon EC2 C7i XLarge',
        family: 'compute-optimized',
        vcpu: 4,
        memoryGb: 8,
        hourlyUsd: 0.1701,
        processorArchitecture: 'x86_64',
        networkBaseline: 'up to 12.5 Gbps',
        diskBaseline: 'EBS optimized',
      },
      {
        sku: 'r7i.xlarge',
        name: 'Amazon EC2 R7i XLarge',
        family: 'memory-optimized',
        vcpu: 4,
        memoryGb: 32,
        hourlyUsd: 0.252,
        processorArchitecture: 'x86_64',
        networkBaseline: 'up to 12.5 Gbps',
        diskBaseline: 'EBS optimized',
      },
      {
        sku: 'i4i.xlarge',
        name: 'Amazon EC2 I4i XLarge',
        family: 'storage-optimized',
        vcpu: 4,
        memoryGb: 32,
        hourlyUsd: 0.343,
        processorArchitecture: 'x86_64',
        networkBaseline: 'up to 12.5 Gbps',
        diskBaseline: 'local NVMe, high IOPS',
      },
      {
        sku: 'g5.xlarge',
        name: 'Amazon EC2 G5 XLarge GPU',
        family: 'accelerated-computing',
        vcpu: 4,
        memoryGb: 16,
        hourlyUsd: 1.006,
        processorArchitecture: 'gpu',
        networkBaseline: 'up to 10 Gbps',
        diskBaseline: 'EBS optimized GPU baseline',
      },
    ],
    storage: [
      storage('aws-s3-standard', 'Amazon S3 Standard', 0.023, 'object', 'standard', 'frequent'),
      storage(
        'aws-s3-standard-ia',
        'Amazon S3 Standard-IA',
        0.0125,
        'object',
        'standard-ia',
        'infrequent',
        { retrievalUsdPerGb: 0.01, minimumDurationDays: 30 },
      ),
      storage(
        'aws-s3-glacier-instant',
        'Amazon S3 Glacier Instant Retrieval',
        0.004,
        'object',
        'glacier-instant',
        'archive',
        { retrievalUsdPerGb: 0.03, minimumDurationDays: 90 },
      ),
      storage('aws-ebs-gp3', 'Amazon EBS gp3', 0.08, 'block', 'gp3', 'frequent', {
        iopsBaseline: '3,000 IOPS baseline, provisionable to 16,000',
        throughputBaseline: '125 MiB/s baseline, provisionable to 1,000 MiB/s',
      }),
      storage('aws-efs-standard', 'Amazon EFS Standard', 0.3, 'file', 'standard', 'frequent'),
    ],
    database: [
      {
        sku: 'aws-rds-postgres-m6g-large',
        serviceName: 'Amazon RDS PostgreSQL',
        engine: 'postgres',
        hourlyUsd: 0.154,
      },
      {
        sku: 'aws-dynamodb-on-demand',
        serviceName: 'Amazon DynamoDB On-Demand',
        engine: 'generic_nosql',
        hourlyUsd: 0.11,
      },
      {
        sku: 'aws-elasticache-redis-cache-node',
        serviceName: 'Amazon ElastiCache Redis',
        engine: 'redis',
        hourlyUsd: 0.068,
      },
    ],
    egressTiers: [
      { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.09 },
      { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.085 },
      { tierFromGb: 51_200, tierToGb: 153_600, pricePerGb: 0.07 },
      { tierFromGb: 153_600, pricePerGb: 0.05 },
    ],
  },
  azure: {
    provider: 'azure',
    label: 'Azure',
    region: 'eastus',
    skuAttribute: 'armSkuName',
    compute: [
      {
        sku: 'Standard_D2s_v5',
        name: 'Azure D2s v5',
        family: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        hourlyUsd: 0.096,
        processorArchitecture: 'x86_64',
        networkBaseline: 'moderate network bandwidth',
        diskBaseline: 'Premium SSD capable baseline',
      },
      {
        sku: 'Standard_D2ps_v5',
        name: 'Azure D2ps v5 ARM',
        family: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        hourlyUsd: 0.077,
        processorArchitecture: 'arm64',
        networkBaseline: 'moderate ARM bandwidth',
        diskBaseline: 'Premium SSD capable baseline',
      },
      {
        sku: 'Standard_F4s_v2',
        name: 'Azure F4s v2',
        family: 'compute-optimized',
        vcpu: 4,
        memoryGb: 8,
        hourlyUsd: 0.169,
        processorArchitecture: 'x86_64',
        networkBaseline: 'compute optimized bandwidth',
        diskBaseline: 'Premium SSD capable baseline',
      },
      {
        sku: 'Standard_E4s_v5',
        name: 'Azure E4s v5',
        family: 'memory-optimized',
        vcpu: 4,
        memoryGb: 32,
        hourlyUsd: 0.252,
        processorArchitecture: 'x86_64',
        networkBaseline: 'memory optimized bandwidth',
        diskBaseline: 'Premium SSD capable baseline',
      },
      {
        sku: 'Standard_L8s_v3',
        name: 'Azure L8s v3',
        family: 'storage-optimized',
        vcpu: 8,
        memoryGb: 64,
        hourlyUsd: 0.688,
        processorArchitecture: 'x86_64',
        networkBaseline: 'high throughput local NVMe',
        diskBaseline: 'local NVMe, high IOPS',
      },
      {
        sku: 'Standard_NC4as_T4_v3',
        name: 'Azure NC T4 v3 GPU',
        family: 'accelerated-computing',
        vcpu: 4,
        memoryGb: 28,
        hourlyUsd: 0.526,
        processorArchitecture: 'gpu',
        networkBaseline: 'GPU workload bandwidth',
        diskBaseline: 'Premium SSD capable GPU baseline',
      },
    ],
    storage: [
      storage('azure-blob-hot', 'Azure Blob Hot LRS', 0.0184, 'object', 'hot', 'frequent'),
      storage('azure-blob-cool', 'Azure Blob Cool LRS', 0.01, 'object', 'cool', 'infrequent', {
        retrievalUsdPerGb: 0.01,
        minimumDurationDays: 30,
      }),
      storage(
        'azure-blob-archive',
        'Azure Blob Archive LRS',
        0.00099,
        'object',
        'archive',
        'archive',
        {
          retrievalUsdPerGb: 0.02,
          minimumDurationDays: 180,
        },
      ),
      storage(
        'azure-premium-ssd-v2',
        'Azure Premium SSD v2',
        0.081,
        'block',
        'premium',
        'frequent',
        {
          iopsBaseline: '3,000 IOPS included before provisioned IOPS',
          throughputBaseline: '125 MB/s included before provisioned throughput',
        },
      ),
      storage('azure-files-premium', 'Azure Files Premium', 0.16, 'file', 'premium', 'frequent'),
    ],
    database: [
      {
        sku: 'azure-postgresql-flexible-d2s',
        serviceName: 'Azure Database for PostgreSQL',
        engine: 'postgres',
        hourlyUsd: 0.145,
      },
      {
        sku: 'azure-cosmosdb-ru',
        serviceName: 'Azure Cosmos DB RU/s',
        engine: 'generic_nosql',
        hourlyUsd: 0.096,
      },
      {
        sku: 'azure-managed-redis-cache-node',
        serviceName: 'Azure Managed Redis',
        engine: 'redis',
        hourlyUsd: 0.071,
      },
    ],
    egressTiers: [
      { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.087 },
      { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.083 },
      { tierFromGb: 51_200, tierToGb: 153_600, pricePerGb: 0.07 },
      { tierFromGb: 153_600, pricePerGb: 0.05 },
    ],
  },
  gcp: {
    provider: 'gcp',
    label: 'GCP',
    region: 'us-central1',
    skuAttribute: 'machineType',
    compute: [
      {
        sku: 'n2-standard-2',
        name: 'Compute Engine N2 Standard 2',
        family: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        hourlyUsd: 0.097,
        processorArchitecture: 'x86_64',
        networkBaseline: 'up to 10 Gbps',
        diskBaseline: 'Persistent Disk balanced baseline',
      },
      {
        sku: 't2a-standard-2',
        name: 'Compute Engine T2A Standard 2 ARM',
        family: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        hourlyUsd: 0.067,
        processorArchitecture: 'arm64',
        networkBaseline: 'ARM standard network',
        diskBaseline: 'Persistent Disk balanced baseline',
      },
      {
        sku: 'c3-standard-4',
        name: 'Compute Engine C3 Standard 4',
        family: 'compute-optimized',
        vcpu: 4,
        memoryGb: 16,
        hourlyUsd: 0.208,
        processorArchitecture: 'x86_64',
        networkBaseline: 'compute optimized bandwidth',
        diskBaseline: 'Hyperdisk capable baseline',
      },
      {
        sku: 'm3-ultramem-8',
        name: 'Compute Engine M3 Ultramem 8',
        family: 'memory-optimized',
        vcpu: 8,
        memoryGb: 256,
        hourlyUsd: 2.012,
        processorArchitecture: 'x86_64',
        networkBaseline: 'memory optimized bandwidth',
        diskBaseline: 'Persistent Disk balanced baseline',
      },
      {
        sku: 'z3-highmem-8',
        name: 'Compute Engine Z3 Highmem 8',
        family: 'storage-optimized',
        vcpu: 8,
        memoryGb: 64,
        hourlyUsd: 0.938,
        processorArchitecture: 'x86_64',
        networkBaseline: 'high throughput local SSD',
        diskBaseline: 'local SSD, high IOPS',
      },
      {
        sku: 'a2-highgpu-1g',
        name: 'Compute Engine A2 High GPU 1G',
        family: 'accelerated-computing',
        vcpu: 12,
        memoryGb: 85,
        hourlyUsd: 2.934,
        processorArchitecture: 'gpu',
        networkBaseline: 'GPU workload bandwidth',
        diskBaseline: 'Persistent Disk SSD baseline',
      },
    ],
    storage: [
      storage('gcp-gcs-standard', 'Cloud Storage Standard', 0.02, 'object', 'standard', 'frequent'),
      storage(
        'gcp-gcs-nearline',
        'Cloud Storage Nearline',
        0.01,
        'object',
        'nearline',
        'infrequent',
        {
          retrievalUsdPerGb: 0.01,
          minimumDurationDays: 30,
        },
      ),
      storage('gcp-gcs-archive', 'Cloud Storage Archive', 0.0012, 'object', 'archive', 'archive', {
        retrievalUsdPerGb: 0.05,
        minimumDurationDays: 365,
      }),
      storage('gcp-pd-balanced', 'Persistent Disk Balanced', 0.1, 'block', 'balanced', 'frequent', {
        iopsBaseline: 'IOPS scales with provisioned capacity',
        throughputBaseline: 'throughput scales with provisioned capacity',
      }),
      storage(
        'gcp-filestore-enterprise',
        'Filestore Enterprise',
        0.32,
        'file',
        'enterprise',
        'frequent',
      ),
    ],
    database: [
      {
        sku: 'gcp-cloudsql-postgres-n2',
        serviceName: 'Cloud SQL PostgreSQL',
        engine: 'postgres',
        hourlyUsd: 0.151,
      },
      {
        sku: 'gcp-firestore-native',
        serviceName: 'Firestore Native Mode',
        engine: 'generic_nosql',
        hourlyUsd: 0.09,
      },
      {
        sku: 'gcp-memorystore-redis-node',
        serviceName: 'Memorystore for Redis',
        engine: 'redis',
        hourlyUsd: 0.064,
      },
    ],
    egressTiers: [
      { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.085 },
      { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.08 },
      { tierFromGb: 51_200, tierToGb: 153_600, pricePerGb: 0.06 },
      { tierFromGb: 153_600, pricePerGb: 0.04 },
    ],
  },
};

export function mockPricingCatalogRecords(
  provider: ProviderId,
  options: { region?: string; fetchedAt: string; effectiveDate?: string },
): PricingCatalogRecord[] {
  const shape = PROVIDER_SHAPES[provider];
  const region = options.region ?? shape.region;
  const effectiveDate = options.effectiveDate ?? '2026-07-01T00:00:00.000Z';

  return [
    ...computeRecords(shape, region, effectiveDate, options.fetchedAt),
    ...storageRecords(shape, region, effectiveDate, options.fetchedAt),
    ...databaseRecords(shape, region, effectiveDate, options.fetchedAt),
    networkRecord(shape, region, effectiveDate, options.fetchedAt),
  ];
}

function computeRecords(
  shape: MockProviderShape,
  region: string,
  effectiveDate: string,
  fetchedAt: string,
): PricingCatalogRecord[] {
  const pricingModels: PricingModelKey[] = [
    'on-demand',
    'reserved-1yr',
    'reserved-3yr',
    'savings-plan',
    'spot',
  ];

  return shape.compute.flatMap((compute) =>
    pricingModels.map((pricingModel) => {
      const unitPriceUsd = round(compute.hourlyUsd * PRICING_MODEL_FACTORS[pricingModel]);
      const skuId = `${shape.provider}-${compute.sku}-${pricingModel}`;

      return {
        provider: shape.provider,
        serviceCategory: 'compute' as const,
        serviceName: compute.name,
        skuId,
        skuDescription: `${shape.label} ${compute.family} ${pricingModel} compute estimate`,
        region,
        unit: 'hour',
        unitPriceUsd,
        attributes: {
          source: 'mock_provider',
          sourceEndpoint: `fixture://mock-pricing/${shape.provider}/compute`,
          rawSourceRecordId: skuId,
          pricingModel,
          [shape.skuAttribute]: compute.sku,
          instanceFamily: compute.family,
          normalizedFamily: compute.family,
          vcpu: compute.vcpu,
          memoryGb: compute.memoryGb,
          processorArchitecture: compute.processorArchitecture,
          networkBaseline: compute.networkBaseline,
          diskBaseline: compute.diskBaseline,
          currencyCode: 'USD',
          ...(pricingModel === 'reserved-1yr' ||
          pricingModel === 'reserved-3yr' ||
          pricingModel === 'savings-plan'
            ? { upfrontOption: 'no_upfront' }
            : {}),
          ...(pricingModel === 'spot'
            ? {
                isEstimate: true,
                estimateRangeLowUsd: round(unitPriceUsd * 0.8),
                estimateRangeHighUsd: round(unitPriceUsd * 1.2),
              }
            : {}),
        },
        effectiveDate,
        fetchedAt,
      };
    }),
  );
}

function storageRecords(
  shape: MockProviderShape,
  region: string,
  effectiveDate: string,
  fetchedAt: string,
): PricingCatalogRecord[] {
  return shape.storage.map((item) => ({
    provider: shape.provider,
    serviceCategory: 'storage' as const,
    serviceName: item.serviceName,
    skuId: item.sku,
    skuDescription: item.description,
    region,
    unit: 'GB-Mo',
    unitPriceUsd: item.unitPriceUsd,
    attributes: {
      source: 'mock_provider',
      sourceEndpoint: `fixture://mock-pricing/${shape.provider}/storage`,
      rawSourceRecordId: item.sku,
      type: item.type,
      storageClass: item.storageClass,
      accessPattern: item.accessPattern,
      monthlyPutRequestsThousandUsd: 0.005,
      monthlyGetRequestsThousandUsd: 0.0004,
      retrievalUsdPerGb: item.retrievalUsdPerGb ?? 0,
      minimumDurationDays: item.minimumDurationDays ?? 0,
      iopsBaseline: item.iopsBaseline,
      throughputBaseline: item.throughputBaseline,
    },
    effectiveDate,
    fetchedAt,
  }));
}

function databaseRecords(
  shape: MockProviderShape,
  region: string,
  effectiveDate: string,
  fetchedAt: string,
): PricingCatalogRecord[] {
  return shape.database.map((item) => ({
    provider: shape.provider,
    serviceCategory: 'database' as const,
    serviceName: item.serviceName,
    skuId: item.sku,
    skuDescription: `${item.serviceName} development-grade mock catalog row`,
    region,
    unit: 'hour',
    unitPriceUsd: item.hourlyUsd,
    attributes: {
      source: 'mock_provider',
      sourceEndpoint: `fixture://mock-pricing/${shape.provider}/database`,
      rawSourceRecordId: item.sku,
      engine: item.engine,
      multiAzPremiumPercent: 100,
      backupStorageUsdPerGbMonth: 0.095,
    },
    effectiveDate,
    fetchedAt,
  }));
}

function networkRecord(
  shape: MockProviderShape,
  region: string,
  effectiveDate: string,
  fetchedAt: string,
): PricingCatalogRecord {
  return {
    provider: shape.provider,
    serviceCategory: 'network',
    serviceName: `${shape.label} Internet Egress`,
    skuId: `${shape.provider}-internet-egress-tiered`,
    skuDescription: `${shape.label} tiered internet egress mock catalog`,
    region,
    unit: 'GB',
    unitPriceUsd: shape.egressTiers[0]?.pricePerGb ?? 0,
    attributes: {
      source: 'mock_provider',
      sourceEndpoint: `fixture://mock-pricing/${shape.provider}/network`,
      rawSourceRecordId: `${shape.provider}-internet-egress-tiered`,
      egressType: 'internet',
      egressTiers: shape.egressTiers.map((tier) => ({
        tierFromGb: tier.tierFromGb,
        startGb: tier.tierFromGb,
        ...(tier.tierToGb !== undefined ? { tierToGb: tier.tierToGb, endGb: tier.tierToGb } : {}),
        pricePerGb: tier.pricePerGb,
        unitPriceUsd: tier.pricePerGb,
      })),
    },
    effectiveDate,
    fetchedAt,
  };
}

function storage(
  sku: string,
  serviceName: string,
  unitPriceUsd: number,
  type: 'object' | 'block' | 'file',
  storageClass: string,
  accessPattern: 'frequent' | 'infrequent' | 'archive',
  extras: Partial<MockProviderShape['storage'][number]> = {},
): MockProviderShape['storage'][number] {
  return {
    sku,
    serviceName,
    description: `${serviceName} mock catalog row`,
    unitPriceUsd,
    type,
    storageClass,
    accessPattern,
    ...extras,
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
