import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { FormToNWSService } from './form-to-nws.service';
import { NLParserService } from './nl-parser.service';
import {
  GuidedFormRequirementParser,
  NaturalLanguageRequirementParser,
  normalizedRequirementsFromNws,
} from './requirement-parser.service';

const configService = {
  get: jest.fn((key: keyof AppConfig) => {
    if (key === 'NL_PARSE_MAX_INPUT_CHARS') {
      return 4_000;
    }

    return undefined;
  }),
} as unknown as ConfigService<AppConfig, true>;

describe('AI-native requirement parser adapters', () => {
  it('turns natural language into normalized requirements and NWS', async () => {
    const parser = new NaturalLanguageRequirementParser(
      new NLParserService(configService, {
        createStructuredOutput: jest.fn(),
      }),
    );

    const parsed = await parser.parseToNws(
      '3 tier web app with 4 medium servers, managed Postgres HA, 500GB object storage, CDN, and 1TB egress in US East.',
    );

    expect(parsed.nws.metadata.sourceType).toBe('natural_language');
    expect(parsed.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: '2026-07-01.phase1',
          source: 'natural_language',
          serviceCategory: 'compute',
          serviceType: 'vm-compute',
          quantity: 4,
        }),
        expect.objectContaining({
          serviceCategory: 'database',
          serviceType: 'relational-database',
          az: 'multi-az',
        }),
        expect.objectContaining({
          serviceCategory: 'networking',
          serviceType: 'cdn-edge',
        }),
      ]),
    );
  });

  it('turns guided form input into the same normalized requirement contract', () => {
    const parser = new GuidedFormRequirementParser(
      new FormToNWSService(() => new Date('2026-07-01T00:00:00.000Z')),
    );

    const parsed = parser.parseToNws({
      workloadName: 'Portal',
      workloadType: 'web_app',
      regionPreference: 'us-east',
      compute: [
        {
          role: 'web',
          instanceFamily: 'memory-optimized',
          processorArchitecture: 'arm64',
          tenancy: 'dedicated-host',
          vcpu: 4,
          memoryGb: 16,
          instanceCount: 2,
          scalingType: 'fixed',
        },
      ],
      storage: [
        {
          role: 'assets',
          type: 'object',
          sizeGb: 500,
          accessPattern: 'frequent',
        },
      ],
      network: {
        estimatedMonthlyEgressGb: 1_000,
        cdn: true,
        loadBalancer: true,
      },
      availability: {
        multiAz: true,
      },
    });

    expect(parsed.nws.metadata.sourceType).toBe('structured_form');
    expect(parsed.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'guided_form',
          serviceCategory: 'compute',
          serviceType: 'vm-compute',
          quantity: 2,
          region: 'us-east',
          config: expect.objectContaining({
            instanceType: 'memory-optimized / arm64 / dedicated-host / 4 vCPU / 16 GB',
          }),
          scaleParams: expect.objectContaining({
            instanceFamily: 'memory-optimized',
            processorArchitecture: 'arm64',
            tenancy: 'dedicated-host',
          }),
        }),
        expect.objectContaining({
          source: 'guided_form',
          serviceCategory: 'storage',
          serviceType: 'object-storage',
          scaleParams: expect.objectContaining({ sizeGb: 500 }),
        }),
      ]),
    );
  });

  it('normalizes advanced database dimensions into stable requirement scale params', () => {
    const requirements = normalizedRequirementsFromNws(
      {
        schemaVersion: '1.0',
        metadata: {
          sourceType: 'structured_form',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        workload: {
          type: 'web_app',
          region: { preference: 'us-east', isDefault: false },
        },
        compute: [],
        storage: [],
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
        network: { cdn: false, loadBalancer: false },
        availability: { multiAz: true, multiRegion: false },
      },
      'guided_form',
    );

    expect(requirements).toEqual([
      expect.objectContaining({
        requirementId: 'req-1',
        serviceCategory: 'database',
        serviceType: 'nosql-database',
        config: {
          instanceType: 'generic_nosql - 250GB',
          tier: 'high-availability',
        },
        region: 'us-east',
        az: 'multi-az',
        scaleParams: expect.objectContaining({
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
        }),
      }),
    ]);
  });

  it('converts serviceRequirements to stable IDs when NWS already contains them', () => {
    const requirements = normalizedRequirementsFromNws(
      {
        schemaVersion: '1.0',
        metadata: {
          sourceType: 'structured_form',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        workload: {
          type: 'web_app',
          region: { isDefault: true },
        },
        compute: [{ role: 'web', scalingType: 'fixed' }],
        storage: [],
        database: [],
        network: { cdn: false, loadBalancer: false },
        availability: { multiAz: false, multiRegion: false },
        serviceRequirements: [
          {
            serviceCategory: 'analytics',
            serviceType: 'data-warehouse',
            quantity: 1,
            scaleParams: { tb: 2 },
          },
        ],
      },
      'guided_form',
    );

    expect(requirements).toEqual([
      expect.objectContaining({
        requirementId: 'req-1',
        serviceCategory: 'analytics',
        serviceType: 'data-warehouse',
        quantity: 1,
        scaleParams: { tb: 2 },
      }),
    ]);
  });
});
