import { ConfigService } from '@nestjs/config';
import { PgPoolLike, PostgresPricingCatalogRepository } from './pricing-catalog.repository';
import { AppConfig } from '../config/config.schema';
import { SecretsReader } from '../secrets/secrets.service';
import { PricingCatalogRecord } from '../adapters/common/cloud-provider-adapter';

const configService = () =>
  ({
    get: jest.fn((key: keyof AppConfig) => {
      const values: Partial<AppConfig> = {
        DB_HOST: 'postgres',
        DB_PORT: 5432,
        DB_NAME: 'polycost_dev',
      };

      return values[key];
    }),
  }) as unknown as ConfigService<AppConfig, true>;

const secretsReader = (): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'etl_username') {
      return 'polycost_etl';
    }

    if (key === 'etl_password') {
      return 'generated-password';
    }

    throw new Error('missing secret');
  }),
});

const record: PricingCatalogRecord = {
  provider: 'aws',
  serviceCategory: 'compute',
  serviceName: 'Amazon EC2',
  skuId: 'SKU-1',
  skuDescription: 'Compute hour',
  region: 'us-east-1',
  unit: 'Hrs',
  unitPriceUsd: 0.01,
  attributes: {
    vcpu: 2,
  },
  effectiveDate: '2026-01-01T00:00:00.000Z',
  fetchedAt: '2026-06-28T00:00:00.000Z',
};

const minimalRecord: PricingCatalogRecord = {
  provider: 'azure',
  serviceCategory: 'storage',
  serviceName: 'Azure Blob Storage',
  skuId: 'SKU-2',
  region: 'eastus',
  unit: 'GB',
  unitPriceUsd: 0.02,
  effectiveDate: '2026-01-01T00:00:00.000Z',
  fetchedAt: '2026-06-28T00:00:00.000Z',
};

describe('PostgresPricingCatalogRepository', () => {
  it('reads catalog rows with parameterized filters', async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          provider: 'aws',
          service_category: 'compute',
          service_name: 'Amazon EC2',
          sku_id: 'SKU-1',
          sku_description: 'Compute hour',
          region: 'us-east-1',
          unit: 'Hrs',
          unit_price_usd: '0.010000',
          attributes: {
            vcpu: 2,
          },
          effective_date: new Date('2026-01-01T00:00:00.000Z'),
          fetched_at: new Date('2026-06-28T00:00:00.000Z'),
        },
      ],
      rowCount: 1,
    }));
    const pool: PgPoolLike = {
      query: query as PgPoolLike['query'],
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(
      repository.find({
        provider: 'aws',
        category: 'compute',
        region: 'us-east-1',
        serviceIds: ['SKU-1'],
      }),
    ).resolves.toEqual([record]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("attributes->>'source' = 'local_seed'"),
      ['aws', 'compute', 'us-east-1', ['SKU-1']],
    );
  });

  it('reads catalog rows without optional filters or nullable row fields', async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          provider: 'azure',
          service_category: 'storage',
          service_name: 'Azure Blob Storage',
          sku_id: 'SKU-2',
          sku_description: null,
          region: 'eastus',
          unit: 'GB',
          unit_price_usd: '0.020000',
          attributes: null,
          effective_date: new Date('2026-01-01T00:00:00.000Z'),
          fetched_at: new Date('2026-06-28T00:00:00.000Z'),
        },
      ],
      rowCount: 1,
    }));
    const pool: PgPoolLike = {
      query: query as PgPoolLike['query'],
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(repository.find({ provider: 'azure', serviceIds: [] })).resolves.toEqual([
      minimalRecord,
    ]);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['azure']);
  });

  it('upserts valid records and reports row-level rejects without logging values', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockRejectedValueOnce(new Error('constraint violation'));
    const pool: PgPoolLike = {
      query: query as PgPoolLike['query'],
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(repository.upsertPricingRecords([record, record])).resolves.toEqual({
      recordsUpdated: 1,
      recordsRejected: 1,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses safe defaults when optional record fields and row counts are absent', async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: null }));
    const pool: PgPoolLike = {
      query: query as PgPoolLike['query'],
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(repository.upsertPricingRecords([minimalRecord])).resolves.toEqual({
      recordsUpdated: 0,
      recordsRejected: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([null, JSON.stringify({})]),
    );
  });

  it('records provider ETL outcomes', async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 1 }));
    const pool: PgPoolLike = {
      query: query as PgPoolLike['query'],
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await repository.recordProviderRun({
      provider: 'gcp',
      startedAt: '2026-06-28T00:00:00.000Z',
      completedAt: '2026-06-28T00:01:00.000Z',
      status: 'failed',
      recordsUpdated: 0,
      errorDetail: 'provider unavailable',
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'gcp',
      '2026-06-28T00:00:00.000Z',
      '2026-06-28T00:01:00.000Z',
      'failed',
      0,
      'provider unavailable',
    ]);
  });

  it('records provider ETL outcomes without optional error detail', async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 1 }));
    const pool: PgPoolLike = {
      query: query as PgPoolLike['query'],
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await repository.recordProviderRun({
      provider: 'aws',
      startedAt: '2026-06-28T00:00:00.000Z',
      completedAt: '2026-06-28T00:01:00.000Z',
      status: 'success',
      recordsUpdated: 3,
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'aws',
      '2026-06-28T00:00:00.000Z',
      '2026-06-28T00:01:00.000Z',
      'success',
      3,
      null,
    ]);
  });

  it('does not create the lazy pool when destroyed before use', async () => {
    const poolFactory = jest.fn(() => ({
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      end: jest.fn(async () => undefined),
    }));
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      poolFactory,
    );

    await repository.onModuleDestroy();

    expect(poolFactory).not.toHaveBeenCalled();
  });

  it('closes the lazy pool on module destroy', async () => {
    const pool: PgPoolLike = {
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      end: jest.fn(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await repository.find({ provider: 'azure' });
    await repository.onModuleDestroy();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
