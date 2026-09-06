import { describe, it, expect } from '@jest/globals';
import { NWSMigrationError, NWSValidationError, NWSValidator } from './nws-validator.js';
import { NormalizedWorkloadSpec } from './nws.types.js';

const baseSpec = (): NormalizedWorkloadSpec => ({
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-06-28T00:00:00.000Z',
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
    },
  ],
  storage: [],
  database: [],
  network: {
    cdn: true,
    loadBalancer: true,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
  },
});

type ExpectedErrorType = {
  prototype: Error;
};

const expectValidationIssue = (
  input: unknown,
  errorType: ExpectedErrorType,
  issuePath: string,
  issueMessage: string,
) => {
  expect(() => NWSValidator.validate(input)).toThrow();

  try {
    NWSValidator.validate(input);
    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(errorType);
    expect((error as NWSValidationError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: issuePath,
          message: expect.stringContaining(issueMessage),
        }),
      ]),
    );
  }
};

describe('NWSValidator', () => {
  it('accepts a minimal valid compute workload', () => {
    expect(NWSValidator.validate(baseSpec())).toEqual(baseSpec());
  });

  it('rejects an oversized compute array (DoS amplification cap)', () => {
    const spec = baseSpec();
    spec.compute = Array.from({ length: 251 }, () => ({
      role: 'web',
      scalingType: 'fixed' as const,
      instanceCount: 1,
    }));
    expect(() => NWSValidator.validate(spec)).toThrow(NWSValidationError);
  });

  it('accepts a valid storage-only workload', () => {
    const spec = {
      ...baseSpec(),
      compute: [],
      storage: [
        {
          role: 'assets',
          type: 'object',
          sizeGb: 250,
          accessPattern: 'frequent',
        },
      ],
    };

    expect(NWSValidator.validate(spec).storage).toHaveLength(1);
  });

  it('accepts advanced storage cost dimensions', () => {
    const spec = {
      ...baseSpec(),
      compute: [],
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
    };

    expect(NWSValidator.validate(spec).storage[0]).toMatchObject({
      storageClass: 'archive',
      replication: 'cross-region',
      provisionedIops: 3000,
    });
  });

  it('accepts a valid database-only workload', () => {
    const spec = {
      ...baseSpec(),
      compute: [],
      database: [
        {
          role: 'primary',
          engine: 'postgres',
          sizeGb: 100,
          highAvailability: true,
          managedServicePreference: 'managed postgres',
        },
      ],
    };

    expect(NWSValidator.validate(spec).database).toHaveLength(1);
  });

  it('accepts advanced database cost dimensions', () => {
    const spec = {
      ...baseSpec(),
      compute: [],
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
    };

    expect(NWSValidator.validate(spec).database[0]).toMatchObject({
      engine: 'generic_nosql',
      backupStorageGb: 120,
      readReplicaCount: 2,
      ruPerSecond: 4000,
    });
  });

  it('accepts a maximal valid workload with optional metadata and traceability', () => {
    const spec: NormalizedWorkloadSpec = {
      ...baseSpec(),
      metadata: {
        sourceType: 'natural_language',
        rawInput: 'A web app with Postgres, CDN, and object storage.',
        createdAt: '2026-06-28T00:00:00.000Z',
      },
      workload: {
        name: 'Proposal app',
        type: 'api_backend',
        expectedUsers: {
          dailyActiveUsers: 10000,
          peakConcurrentUsers: 1200,
        },
        region: {
          preference: 'eastus',
          isDefault: false,
        },
      },
      compute: [
        {
          role: 'api',
          vcpu: 4,
          memoryGb: 16,
          instanceCount: 3,
          scalingType: 'autoscaling',
          autoscalingRange: {
            min: 2,
            max: 8,
          },
        },
      ],
      storage: [
        {
          role: 'uploads',
          type: 'object',
          sizeGb: 500,
          accessPattern: 'infrequent',
        },
      ],
      database: [
        {
          role: 'cache',
          engine: 'redis',
          highAvailability: false,
        },
      ],
      network: {
        estimatedMonthlyEgressGb: 750,
        cdn: true,
        loadBalancer: true,
      },
      availability: {
        multiAz: true,
        multiRegion: false,
        slaTarget: '99.9%',
      },
      sourceTraceability: [
        {
          nwsPath: 'compute.0.instanceCount',
          sourceRef: 'structuredForm.compute.instances',
        },
      ],
    };

    expect(NWSValidator.validate(spec)).toEqual(spec);
  });

  it('rejects an entirely empty priced workload', () => {
    const spec = {
      ...baseSpec(),
      compute: [],
      storage: [],
      database: [],
    };

    expectValidationIssue(
      spec,
      NWSValidationError,
      'compute',
      'At least one of compute, storage, or database must be non-empty',
    );
  });

  it('rejects a missing workload type', () => {
    const spec = baseSpec() as unknown as Record<string, unknown>;
    spec.workload = {
      region: {
        isDefault: true,
      },
    };

    expectValidationIssue(spec, NWSValidationError, 'workload.type', 'expected one of');
  });

  it('rejects an unsupported schema version with a migration error', () => {
    expectValidationIssue(
      {
        ...baseSpec(),
        schemaVersion: '2.0',
      },
      NWSMigrationError,
      'schemaVersion',
      'requires a migration',
    );
  });

  it('rejects a malformed root value with a clear root path', () => {
    expectValidationIssue(null, NWSValidationError, '<root>', 'expected object');
  });

  it('rejects autoscaling ranges where max is below min', () => {
    const spec = {
      ...baseSpec(),
      compute: [
        {
          role: 'api',
          scalingType: 'autoscaling',
          autoscalingRange: {
            min: 4,
            max: 2,
          },
        },
      ],
    };

    expectValidationIssue(
      spec,
      NWSValidationError,
      'compute.0.autoscalingRange.max',
      'greater than or equal to min',
    );
  });

  it('rejects unknown fields so versioned NWS changes are explicit', () => {
    expectValidationIssue(
      {
        ...baseSpec(),
        unversionedField: true,
      },
      NWSValidationError,
      '<root>',
      'Unrecognized key',
    );
  });
});
