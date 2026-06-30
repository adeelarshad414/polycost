import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { EquivalentServiceMapper } from './equivalent-service-mapper';

const workload: NormalizedWorkloadSpec = {
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
      role: 'api',
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
      accessPattern: 'archive',
    },
    {
      role: 'shared',
      type: 'file',
      sizeGb: 50,
    },
  ],
  database: [
    {
      role: 'primary',
      engine: 'postgres',
      highAvailability: true,
      managedServicePreference: 'Aurora PostgreSQL',
    },
    {
      role: 'cache',
      engine: 'redis',
      highAvailability: false,
    },
  ],
  network: {
    estimatedMonthlyEgressGb: 50,
    cdn: true,
    loadBalancer: true,
  },
  availability: {
    multiAz: true,
    multiRegion: false,
  },
};

describe('EquivalentServiceMapper', () => {
  const mapper = new EquivalentServiceMapper();

  it('maps NWS components to reviewed provider SKU patterns', () => {
    const mappings = mapper.mapWorkload(workload);

    expect(mappings.map((mapping) => mapping.tierLabel)).toEqual([
      'compute-autoscaling-general-purpose',
      'storage-object-archive',
      'storage-file-shared',
      'database-postgres-managed',
      'database-redis-managed',
      'network-egress-internet',
      'network-cdn',
      'network-load-balancer',
    ]);
    expect(mappings[0].providerSkuPatterns).toEqual(
      expect.objectContaining({
        aws: 'EC2 Auto Scaling with general purpose instances',
        azure: 'Virtual Machine Scale Sets with general purpose instances',
        gcp: 'Managed Instance Groups with general purpose machine types',
      }),
    );
  });

  it('marks provider-native database preferences as approximate on other clouds', () => {
    expect(mapper.isApproximateForProvider(workload, 'aws', 'database')).toBe(false);
    expect(mapper.isApproximateForProvider(workload, 'azure', 'database')).toBe(true);
    expect(mapper.isApproximateForProvider(workload, 'gcp', 'database')).toBe(true);
  });

  it('marks globally approximate mapped tiers as approximate', () => {
    expect(mapper.isApproximateForProvider(workload, 'aws', 'storage')).toBe(true);
    expect(mapper.isApproximateForProvider(workload, 'azure', 'network')).toBe(true);
  });

  it('preserves adapter approximation flags while annotating line items', () => {
    const lineItem = mapper.annotateLineItem(workload, 'aws', {
      category: 'compute',
      description: 'api compute',
      isApproximate: true,
      baseMonthlyCostUsd: 10,
      skuId: 'sku-1',
      region: 'us-east-1',
      unit: 'hour',
      unitPriceUsd: 0.01,
    });

    expect(lineItem.isApproximate).toBe(true);
  });

  it('covers fixed compute and non-archive storage tiers', () => {
    const mappings = mapper.mapWorkload({
      ...workload,
      compute: [
        {
          role: 'worker',
          scalingType: 'fixed',
          instanceCount: 1,
        },
      ],
      storage: [
        {
          role: 'disk',
          type: 'block',
          sizeGb: 20,
        },
        {
          role: 'logs',
          type: 'object',
          sizeGb: 20,
          accessPattern: 'infrequent',
        },
        {
          role: 'assets',
          type: 'object',
          sizeGb: 20,
          accessPattern: 'frequent',
        },
      ],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
    });

    expect(mappings.map((mapping) => mapping.tierLabel)).toEqual([
      'compute-fixed-general-purpose',
      'storage-block-general-purpose',
      'storage-object-infrequent',
      'storage-object-standard',
    ]);
  });

  it('maps all database engine tiers that V1 accepts', () => {
    const mappings = mapper.mapWorkload({
      ...workload,
      compute: [],
      storage: [],
      database: [
        {
          role: 'mysql',
          engine: 'mysql',
          highAvailability: false,
        },
        {
          role: 'mongo',
          engine: 'mongodb',
          highAvailability: false,
        },
        {
          role: 'relational',
          engine: 'generic_relational',
          highAvailability: false,
        },
        {
          role: 'nosql',
          engine: 'generic_nosql',
          highAvailability: false,
        },
      ],
      network: {
        cdn: false,
        loadBalancer: false,
      },
    });

    expect(mappings.map((mapping) => mapping.tierLabel)).toEqual([
      'database-mysql-managed',
      'database-mongodb-managed',
      'database-generic-relational-managed',
      'database-generic-nosql-managed',
    ]);
  });

  it('marks unknown equivalence rules as approximate', () => {
    const mapperWithoutRules = new EquivalentServiceMapper([]);

    expect(mapperWithoutRules.mapWorkload(workload)[0]).toEqual(
      expect.objectContaining({
        tierLabel: 'compute-autoscaling-general-purpose',
        providerSkuPatterns: {
          aws: undefined,
          azure: undefined,
          gcp: undefined,
        },
        isApproximate: true,
      }),
    );
  });

  it('detects Azure and GCP native service preferences', () => {
    const azurePreferred = {
      ...workload,
      database: [
        {
          role: 'primary',
          engine: 'postgres',
          highAvailability: false,
          managedServicePreference: 'Azure Database for PostgreSQL',
        },
      ],
    } satisfies NormalizedWorkloadSpec;
    const gcpPreferred = {
      ...workload,
      database: [
        {
          role: 'primary',
          engine: 'postgres',
          highAvailability: false,
          managedServicePreference: 'Cloud SQL for PostgreSQL',
        },
      ],
    } satisfies NormalizedWorkloadSpec;

    expect(mapper.isApproximateForProvider(azurePreferred, 'azure', 'database')).toBe(false);
    expect(mapper.isApproximateForProvider(azurePreferred, 'aws', 'database')).toBe(true);
    expect(mapper.isApproximateForProvider(gcpPreferred, 'gcp', 'database')).toBe(false);
    expect(mapper.isApproximateForProvider(gcpPreferred, 'azure', 'database')).toBe(true);
  });

  it('does not apply database service preferences to other categories', () => {
    expect(mapper.isApproximateForProvider(workload, 'azure', 'compute')).toBe(false);
  });
});
