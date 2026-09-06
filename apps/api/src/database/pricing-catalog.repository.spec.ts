/* eslint-disable security/detect-object-injection -- Reviewed 2026-07-06: repository test rows are controlled fixtures indexed by expected column names; see docs/SECURITY-SUPPRESSIONS.md. */
import { describe, it, expect, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PgPoolLike, PostgresPricingCatalogRepository } from './pricing-catalog.repository.js';

/**
 * The signature every pg query double must satisfy, derived from the
 * production interface so a mock cannot drift from the contract it stands in
 * for. PgPoolLike['query'] is generic in its row type and a mock is a concrete
 * function, so the row type is instantiated here.
 */
type QueryMock = (...args: Parameters<PgPoolLike['query']>) => ReturnType<PgPoolLike['query']>;
import { AppConfig } from '../config/config.schema.js';
import { SecretsReader } from '../secrets/secrets.service.js';
import { PricingCatalogRecord } from '../adapters/common/cloud-provider-adapter.js';
import { pricingLineageForCatalogRecord } from '../pricing-normalization/pricing-lineage.js';

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
    const query = jest.fn<QueryMock>(async () => ({
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
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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
    const query = jest.fn<QueryMock>(async () => ({
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
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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

  it('returns persisted catalog source lineage as queryable record attributes', async () => {
    const sourcePayloadHash = 'a'.repeat(64);
    const sourceRecordKey = 'aws|compute|SKU-1|us-east-1|Hrs|2026-01-01T00:00:00.000Z';
    const query = jest.fn<QueryMock>(async () => ({
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
          source_endpoint:
            'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json',
          source_record_id: 'SKU-1:rate-code',
          source_record_key: sourceRecordKey,
          transform_version: 'pricing-normalization-v3',
          source_payload_hash: sourcePayloadHash,
        },
      ],
      rowCount: 1,
    }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    const [catalogRecord] = await repository.find({
      provider: 'aws',
      category: 'compute',
      region: 'us-east-1',
      serviceIds: ['SKU-1'],
    });

    expect(catalogRecord.attributes).toEqual(
      expect.objectContaining({
        vcpu: 2,
        sourceRecordId: 'SKU-1:rate-code',
        sourceRecordKey,
        transformVersion: 'pricing-normalization-v3',
        sourcePayloadHash,
      }),
    );
    expect(pricingLineageForCatalogRecord(catalogRecord)).toEqual(
      expect.objectContaining({
        sourceRecordId: 'SKU-1:rate-code',
        sourceRecordKey,
        transformVersion: 'pricing-normalization-v3',
        sourcePayloadHash,
      }),
    );
  });

  it('upserts a batch of valid records in a single multi-row statement', async () => {
    const query = jest.fn<QueryMock>(async () => ({ rows: [], rowCount: 3 }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(repository.upsertPricingRecords([record, record, record])).resolves.toEqual({
      recordsUpdated: 3,
      recordsRejected: 0,
    });
    // One batched round-trip for the whole chunk, not one per record.
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('jsonb_to_recordset'), [
      expect.any(String),
    ]);
  });

  it('falls back to per-row inserts so one bad row rejects only itself', async () => {
    const query = jest
      .fn<QueryMock>()
      // The batched chunk trips a constraint on one row...
      .mockRejectedValueOnce(new Error('chunk constraint violation'))
      // ...so it retries the chunk row-by-row: first row succeeds, second rejects.
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockRejectedValueOnce(new Error('constraint violation'));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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
    // 1 failed chunk attempt + 2 per-row retries.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('uses safe defaults when optional record fields and row counts are absent', async () => {
    const query = jest.fn<QueryMock>(async () => ({ rows: [], rowCount: null }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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
    // Optional fields default safely in the batched JSON payload: a missing
    // description serializes as null and missing attributes as an empty object.
    expect(query).toHaveBeenCalledWith(expect.stringContaining('jsonb_to_recordset'), [
      expect.stringContaining('"sku_description":null'),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('jsonb_to_recordset'), [
      expect.stringContaining('"attributes":{}'),
    ]);
  });

  it('records provider ETL outcomes', async () => {
    const query = jest.fn<QueryMock>(async () => ({ rows: [], rowCount: 1 }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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
      recordsRejected: 1,
      recordsSkipped: 4,
      errorDetail: 'provider unavailable',
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'gcp',
      '2026-06-28T00:00:00.000Z',
      '2026-06-28T00:01:00.000Z',
      'failed',
      0,
      1,
      4,
      'provider unavailable',
    ]);
  });

  it('upserts normalized compute, storage, and egress cache rows', async () => {
    const query = jest.fn<QueryMock>(async () => ({ rows: [], rowCount: 1 }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(
      repository.upsertNormalizedPricingRecords([
        {
          ...record,
          attributes: {
            pricingModel: 'on-demand',
            instanceType: 't3.small',
            vcpu: 2,
            memoryGb: 2,
          },
        },
        {
          provider: 'aws',
          serviceCategory: 'storage',
          serviceName: 'Amazon S3',
          skuId: 'AWS-S3-STANDARD',
          skuDescription: 'S3 Standard storage',
          region: 'us-east-1',
          unit: 'GB-Mo',
          unitPriceUsd: 0.023,
          attributes: {
            storageClass: 'General Purpose',
          },
          effectiveDate: '2026-01-01T00:00:00.000Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
        {
          provider: 'aws',
          serviceCategory: 'network',
          serviceName: 'AWS Data Transfer',
          skuId: 'AWS-EGRESS',
          region: 'us-east-1',
          unit: 'GB',
          unitPriceUsd: 0.09,
          effectiveDate: '2026-01-01T00:00:00.000Z',
          fetchedAt: '2026-06-28T00:00:00.000Z',
        },
      ]),
    ).resolves.toEqual({
      recordsUpdated: 4,
      recordsRejected: 0,
      recordsSkipped: 0,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO provider_skus'),
      expect.arrayContaining(['aws', 't3.small', 'burstable', 2, 2, 'us-east-1']),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO pricing_rates'),
      expect.arrayContaining(['aws', 't3.small', 'us-east-1', 'on_demand']),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO storage_pricing'),
      expect.arrayContaining([
        'aws',
        'us-east-1',
        'standard',
        0.023,
        'USD',
        '2026-01-01T00:00:00.000Z',
        expect.stringContaining('pricing'),
        'AWS-S3-STANDARD',
        'aws|storage|AWS-S3-STANDARD|us-east-1|GB-Mo|2026-01-01T00:00:00.000Z',
        '2026-06-28T00:00:00.000Z',
        'pricing-normalization-v3',
      ]),
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO egress_tier_rates'),
      expect.arrayContaining([
        'aws',
        'us-east-1',
        0,
        null,
        0.09,
        '2026-01-01T00:00:00.000Z',
        expect.stringContaining('pricing'),
        'AWS-EGRESS',
        'aws|network|AWS-EGRESS|us-east-1|GB|2026-01-01T00:00:00.000Z',
        '2026-06-28T00:00:00.000Z',
        'pricing-normalization-v3',
      ]),
    );
  });

  it('reports unsupported normalized records as skipped without rejecting the run', async () => {
    const query = jest.fn<QueryMock>(async () => ({ rows: [], rowCount: 1 }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
    };
    const repository = new PostgresPricingCatalogRepository(
      configService(),
      secretsReader(),
      () => pool,
    );

    await expect(repository.upsertNormalizedPricingRecords([minimalRecord])).resolves.toEqual({
      recordsUpdated: 0,
      recordsRejected: 0,
      recordsSkipped: 1,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('records provider ETL outcomes without optional error detail', async () => {
    const query = jest.fn<QueryMock>(async () => ({ rows: [], rowCount: 1 }));
    const pool: PgPoolLike = {
      query: query as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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
      recordsRejected: 0,
      recordsSkipped: 2,
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'aws',
      '2026-06-28T00:00:00.000Z',
      '2026-06-28T00:01:00.000Z',
      'success',
      3,
      0,
      2,
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
      query: jest.fn<QueryMock>(async () => ({
        rows: [],
        rowCount: 0,
      })) as unknown as PgPoolLike['query'],
      end: jest.fn<PgPoolLike['end']>(async () => undefined),
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
