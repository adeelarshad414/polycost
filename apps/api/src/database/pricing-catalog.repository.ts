import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  PricingCatalogQuery,
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
} from '../adapters/common/cloud-provider-adapter';
import { AppConfig } from '../config/config.schema';
import { SecretsReader } from '../secrets/secrets.service';
import {
  PricingCatalogWriteResult,
  PricingEtlRunRecord,
  PricingEtlRunRepository,
  PricingCatalogWriter,
} from './pricing-repository.types';

interface QueryResultLike<T> {
  rows: T[];
  rowCount: number | null;
}

export interface PgPoolLike {
  query<T = unknown>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
  end(): Promise<void>;
}

interface PgPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export type PgPoolFactory = (config: PgPoolConfig) => PgPoolLike;

interface PricingCatalogRow {
  provider: ProviderId;
  service_category: PricingCatalogRecord['serviceCategory'];
  service_name: string;
  sku_id: string;
  sku_description: string | null;
  region: string;
  unit: string;
  unit_price_usd: string;
  attributes: Record<string, unknown> | null;
  effective_date: Date;
  fetched_at: Date;
}

const defaultPgPoolFactory: PgPoolFactory = (config) => new Pool(config);

@Injectable()
export class PostgresPricingCatalogRepository
  implements OnModuleDestroy, PricingCatalogReader, PricingCatalogWriter, PricingEtlRunRepository
{
  private pool?: PgPoolLike;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly secretsReader: SecretsReader,
    private readonly poolFactory: PgPoolFactory = defaultPgPoolFactory,
  ) {}

  async find(query: PricingCatalogQuery): Promise<PricingCatalogRecord[]> {
    const conditions = ['provider = $1'];
    const values: unknown[] = [query.provider];

    if (query.category) {
      values.push(query.category);
      conditions.push(`service_category = $${values.length}`);
    }

    if (query.region) {
      values.push(query.region);
      conditions.push(`region = $${values.length}`);
    }

    if (query.serviceIds && query.serviceIds.length > 0) {
      values.push(query.serviceIds);
      conditions.push(`(sku_id = ANY($${values.length}) OR service_name = ANY($${values.length}))`);
    }

    const result = await (
      await this.getPool()
    ).query<PricingCatalogRow>(
      `
        SELECT provider,
               service_category,
               service_name,
               sku_id,
               sku_description,
               region,
               unit,
               unit_price_usd,
               attributes,
               effective_date,
               fetched_at
        FROM pricing_catalog
        WHERE ${conditions.join(' AND ')}
        ORDER BY unit_price_usd ASC
      `,
      values,
    );

    return result.rows.map(toPricingCatalogRecord);
  }

  async upsertPricingRecords(records: PricingCatalogRecord[]): Promise<PricingCatalogWriteResult> {
    let recordsUpdated = 0;
    let recordsRejected = 0;
    const pool = await this.getPool();

    for (const record of records) {
      try {
        const result = await pool.query(
          `
            INSERT INTO pricing_catalog (
              provider,
              service_category,
              service_name,
              sku_id,
              sku_description,
              region,
              unit,
              unit_price_usd,
              attributes,
              effective_date,
              fetched_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
            ON CONFLICT (provider, sku_id, region, effective_date)
            DO UPDATE SET
              service_category = EXCLUDED.service_category,
              service_name = EXCLUDED.service_name,
              sku_description = EXCLUDED.sku_description,
              unit = EXCLUDED.unit,
              unit_price_usd = EXCLUDED.unit_price_usd,
              attributes = EXCLUDED.attributes,
              fetched_at = EXCLUDED.fetched_at
          `,
          [
            record.provider,
            record.serviceCategory,
            record.serviceName,
            record.skuId,
            record.skuDescription ?? null,
            record.region,
            record.unit,
            record.unitPriceUsd,
            JSON.stringify(record.attributes ?? {}),
            record.effectiveDate,
            record.fetchedAt,
          ],
        );

        recordsUpdated += result.rowCount ?? 0;
      } catch {
        recordsRejected += 1;
      }
    }

    return {
      recordsUpdated,
      recordsRejected,
    };
  }

  async recordProviderRun(run: PricingEtlRunRecord): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        INSERT INTO pricing_etl_runs (
          provider,
          started_at,
          completed_at,
          status,
          records_updated,
          error_detail
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        run.provider,
        run.startedAt,
        run.completedAt,
        run.status,
        run.recordsUpdated,
        run.errorDetail ?? null,
      ],
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private async getPool(): Promise<PgPoolLike> {
    if (!this.pool) {
      this.pool = this.poolFactory({
        host: this.configService.get('DB_HOST', { infer: true }),
        port: this.configService.get('DB_PORT', { infer: true }),
        database: this.configService.get('DB_NAME', { infer: true }),
        user: await this.secretsReader.getSecret('polycost/db', 'etl_username'),
        password: await this.secretsReader.getSecret('polycost/db', 'etl_password'),
      });
    }

    return this.pool;
  }
}

function toPricingCatalogRecord(row: PricingCatalogRow): PricingCatalogRecord {
  return {
    provider: row.provider,
    serviceCategory: row.service_category,
    serviceName: row.service_name,
    skuId: row.sku_id,
    skuDescription: row.sku_description ?? undefined,
    region: row.region,
    unit: row.unit,
    unitPriceUsd: Number.parseFloat(row.unit_price_usd),
    attributes: row.attributes ?? undefined,
    effectiveDate: row.effective_date.toISOString(),
    fetchedAt: row.fetched_at.toISOString(),
  };
}
