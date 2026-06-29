import { ConfigService } from '@nestjs/config';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { SecretsReader } from '../secrets/secrets.service';
import { ApiDatabaseRepository, PgPoolLike } from './api-database.repository';

const configService = {
  get: jest.fn((key: keyof AppConfig) => {
    switch (key) {
      case 'DB_HOST':
        return 'postgres';
      case 'DB_PORT':
        return 5432;
      case 'DB_NAME':
        return 'polycost_dev';
      default:
        return undefined;
    }
  }),
} as unknown as ConfigService<AppConfig, true>;

const secretsReader: SecretsReader = {
  getSecret: jest.fn(async (_path: string, key: string) =>
    key === 'username' ? 'polycost_app' : 'app-password',
  ),
};

const comparisonResult: ComparisonResult = {
  comparisonId: '11111111-1111-4111-8111-111111111111',
  pricingAsOf: '2026-06-29T00:00:00.000Z',
  cheapestProviderId: 'aws',
  providers: [],
};

const nwsSnapshot: NormalizedWorkloadSpec = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-06-29T00:00:00.000Z',
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
    },
  ],
  storage: [],
  database: [],
  network: {
    cdn: false,
    loadBalancer: false,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
  },
};

describe('ApiDatabaseRepository', () => {
  it('saves and retrieves comparison snapshots through the app DB role', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            nws_snapshot: nwsSnapshot,
            result_snapshot: comparisonResult,
          },
        ],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await repository.saveComparison(nwsSnapshot as never, comparisonResult as never);
    await expect(repository.getComparison(comparisonResult.comparisonId)).resolves.toEqual({
      nwsSnapshot,
      resultSnapshot: comparisonResult,
    });
    expect(secretsReader.getSecret).toHaveBeenCalledWith('polycost/db', 'username');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO comparisons'), [
      comparisonResult.comparisonId,
      JSON.stringify(nwsSnapshot),
      JSON.stringify(comparisonResult),
      comparisonResult.pricingAsOf,
    ]);
  });

  it('returns undefined for missing comparison snapshots', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [],
        rowCount: 0,
      })),
    );

    await expect(repository.getComparison(comparisonResult.comparisonId)).resolves.toBeUndefined();
  });

  it('returns latest pricing status for every provider', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            provider: 'aws',
            status: 'success',
            last_successful_run: new Date('2026-06-29T00:00:00.000Z'),
          },
          {
            provider: 'azure',
            status: 'failed',
            last_successful_run: null,
          },
        ],
        rowCount: 2,
      })),
    );

    await expect(repository.getPricingStatus()).resolves.toEqual({
      providers: [
        {
          providerId: 'aws',
          status: 'success',
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
        {
          providerId: 'azure',
          status: 'failed',
        },
        {
          providerId: 'gcp',
          status: 'failed',
        },
      ],
    });
  });

  it('creates normalized workload records through the app DB role', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            instance_family: 'general-purpose',
            vcpu: 4,
            memory_gb: '16',
            region: 'us-east',
            instance_count: 2,
            hours_per_month: '730',
            storage_gb: '500',
            storage_tier: 'standard',
            egress_gb_per_month: '1200',
            created_at: new Date('2026-06-29T00:00:00.000Z'),
            updated_at: new Date('2026-06-29T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      })),
    );

    await expect(
      repository.createWorkload({
        instanceFamily: 'general-purpose',
        vcpu: 4,
        memoryGb: 16,
        region: 'us-east',
        instanceCount: 2,
        hoursPerMonth: 730,
        storageGb: 500,
        storageTier: 'standard',
        egressGbPerMonth: 1200,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        instanceFamily: 'general-purpose',
        memoryGb: 16,
        region: 'us-east',
      }),
    );
  });

  it('compares normalized cached pricing across canonical provider regions', async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          provider: 'aws',
          provider_sku_id: 'm7i.xlarge',
          sku_id: '33333333-3333-4333-8333-333333333333',
          price_per_hour: '0.19200000',
          term: 'on_demand',
          region: 'us-east-1',
          currency: 'USD',
          effective_date: new Date('2026-06-29T00:00:00.000Z'),
        },
      ],
      rowCount: 1,
    }));
    const repository = createRepository(query);

    await expect(
      repository.compareCachedPricing({
        instanceFamily: 'general-purpose',
        vcpu: 4,
        memoryGb: 16,
        region: 'us-east',
        term: 'on_demand',
      }),
    ).resolves.toEqual([
      {
        provider: 'aws',
        providerSkuId: 'm7i.xlarge',
        skuId: '33333333-3333-4333-8333-333333333333',
        pricePerHour: 0.192,
        term: 'on_demand',
        region: 'us-east-1',
        currency: 'USD',
        effectiveDate: '2026-06-29T00:00:00.000Z',
      },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM requested_regions'), [
      'general-purpose',
      4,
      16,
      'us-east-1',
      'eastus',
      'us-east1',
      'on_demand',
    ]);
  });

  it('returns cached exchange rates keyed by quote currency', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            quote_currency: 'EUR',
            rate: '0.93000000',
            fetched_at: new Date('2026-06-29T00:00:00.000Z'),
          },
          {
            quote_currency: 'PKR',
            rate: '278.00000000',
            fetched_at: new Date('2026-06-29T01:00:00.000Z'),
          },
        ],
        rowCount: 2,
      })),
    );

    await expect(repository.getExchangeRates('USD')).resolves.toEqual({
      base: 'USD',
      lastUpdated: '2026-06-29T01:00:00.000Z',
      rates: {
        EUR: 0.93,
        PKR: 278,
      },
    });
  });
});

function createRepository(query: jest.Mock): ApiDatabaseRepository {
  const pool: PgPoolLike = {
    query,
    end: jest.fn(async () => undefined),
  };

  return new ApiDatabaseRepository(configService, secretsReader, () => pool);
}
