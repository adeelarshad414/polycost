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
            records_updated: 12,
            records_rejected: 1,
            records_skipped: 7,
            last_successful_run: new Date('2026-06-29T00:00:00.000Z'),
          },
          {
            provider: 'azure',
            status: 'failed',
            records_updated: 0,
            records_rejected: 3,
            records_skipped: 0,
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
          recordsUpdated: 12,
          recordsRejected: 1,
          recordsSkipped: 7,
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
        {
          providerId: 'azure',
          status: 'failed',
          recordsUpdated: 0,
          recordsRejected: 3,
          recordsSkipped: 0,
        },
        {
          providerId: 'gcp',
          status: 'failed',
          recordsUpdated: 0,
          recordsRejected: 0,
          recordsSkipped: 0,
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

  it('lists budgets with workload details for modeled-cost evaluation', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            budget_id: '11111111-1111-4111-8111-111111111111',
            workload_id: '22222222-2222-4222-8222-222222222222',
            threshold_usd: '900.00',
            alert_on_anomaly_percent: '20.00',
            budget_created_at: new Date('2026-06-20T00:00:00.000Z'),
            budget_updated_at: new Date('2026-06-29T00:00:00.000Z'),
            instance_family: 'general-purpose',
            vcpu: 4,
            memory_gb: '16',
            region: 'us-east',
            instance_count: 2,
            hours_per_month: '730',
            storage_gb: '500',
            storage_tier: 'standard',
            egress_gb_per_month: '1200',
            workload_created_at: new Date('2026-06-19T00:00:00.000Z'),
            workload_updated_at: new Date('2026-06-28T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      })),
    );

    await expect(repository.listBudgetsForEvaluation()).resolves.toEqual([
      {
        budget: {
          id: '11111111-1111-4111-8111-111111111111',
          workloadId: '22222222-2222-4222-8222-222222222222',
          thresholdUsd: 900,
          alertOnAnomalyPercent: 20,
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        },
        workload: expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          createdAt: '2026-06-19T00:00:00.000Z',
          updatedAt: '2026-06-28T00:00:00.000Z',
        }),
      },
    ]);
  });

  it('upserts exchange-rate snapshots and cleans up expired share links', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 });
    const repository = createRepository(query);

    await expect(
      repository.upsertExchangeRates({
        baseCurrency: 'USD',
        rates: {
          EUR: 0.87673,
          GBP: 0.75587,
        },
        source: 'https://api.frankfurter.app/latest',
        fetchedAt: '2026-06-30T00:00:00.000Z',
      }),
    ).resolves.toBe(2);
    await expect(repository.cleanupExpiredShareLinks('2026-06-30T00:00:00.000Z')).resolves.toBe(3);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO exchange_rates'),
      ['USD', 'EUR', 0.87673, 'https://api.frankfurter.app/latest', '2026-06-30T00:00:00.000Z'],
    );
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE share_links'), [
      '2026-06-30T00:00:00.000Z',
    ]);
  });
});

function createRepository(query: jest.Mock): ApiDatabaseRepository {
  const pool: PgPoolLike = {
    query,
    end: jest.fn(async () => undefined),
  };

  return new ApiDatabaseRepository(configService, secretsReader, () => pool);
}
