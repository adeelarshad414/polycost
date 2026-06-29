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
import { normalizePricingCatalogRecords } from '../pricing-normalization/normalized-pricing-records';
import { SecretsReader } from '../secrets/secrets.service';
import {
  NormalizedPricingWriter,
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
  implements
    OnModuleDestroy,
    PricingCatalogReader,
    PricingCatalogWriter,
    NormalizedPricingWriter,
    PricingEtlRunRepository
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
        ORDER BY CASE WHEN attributes->>'source' = 'local_seed' THEN 1 ELSE 0 END,
                 unit_price_usd ASC
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

  async upsertNormalizedPricingRecords(
    records: PricingCatalogRecord[],
  ): Promise<PricingCatalogWriteResult> {
    const normalized = normalizePricingCatalogRecords(records);
    const pool = await this.getPool();
    let recordsUpdated = 0;
    let recordsRejected = 0;

    for (const record of normalized.compute) {
      try {
        const result = await pool.query(
          `
            WITH upserted_sku AS (
              INSERT INTO provider_skus (
                provider,
                provider_sku_id,
                family,
                vcpu,
                memory_gb,
                region,
                os,
                raw_payload,
                last_synced_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
              ON CONFLICT (provider, provider_sku_id, region)
              DO UPDATE SET
                family = EXCLUDED.family,
                vcpu = EXCLUDED.vcpu,
                memory_gb = EXCLUDED.memory_gb,
                os = EXCLUDED.os,
                raw_payload = EXCLUDED.raw_payload,
                last_synced_at = EXCLUDED.last_synced_at
              RETURNING id
            )
            INSERT INTO pricing_snapshots (
              sku_id,
              term,
              price_per_hour,
              currency,
              effective_date
            )
            SELECT id, $10, $11, $12, $13
            FROM upserted_sku
            ON CONFLICT (sku_id, term, effective_date)
            DO UPDATE SET
              price_per_hour = EXCLUDED.price_per_hour,
              currency = EXCLUDED.currency
          `,
          [
            record.provider,
            record.providerSkuId,
            record.family,
            record.vcpu,
            record.memoryGb,
            record.region,
            record.os,
            JSON.stringify(record.rawPayload),
            record.lastSyncedAt,
            record.term,
            record.pricePerHour,
            record.currency,
            record.effectiveDate,
          ],
        );

        recordsUpdated += result.rowCount ?? 0;
      } catch {
        recordsRejected += 1;
      }
    }

    for (const record of normalized.storage) {
      try {
        const result = await pool.query(
          `
            INSERT INTO storage_pricing (
              provider,
              region,
              tier,
              price_per_gb_month,
              currency,
              effective_date
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (provider, region, tier, effective_date)
            DO UPDATE SET
              price_per_gb_month = EXCLUDED.price_per_gb_month,
              currency = EXCLUDED.currency
          `,
          [
            record.provider,
            record.region,
            record.tier,
            record.pricePerGbMonth,
            record.currency,
            record.effectiveDate,
          ],
        );

        recordsUpdated += result.rowCount ?? 0;
      } catch {
        recordsRejected += 1;
      }
    }

    for (const record of normalized.egress) {
      try {
        const result = await pool.query(
          `
            INSERT INTO egress_tier_rates (
              provider,
              region,
              tier_from_gb,
              tier_to_gb,
              price_per_gb,
              effective_date
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (provider, region, tier_from_gb, effective_date)
            DO UPDATE SET
              tier_to_gb = EXCLUDED.tier_to_gb,
              price_per_gb = EXCLUDED.price_per_gb
          `,
          [
            record.provider,
            record.region,
            record.tierFromGb,
            record.tierToGb ?? null,
            record.pricePerGb,
            record.effectiveDate,
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
      recordsSkipped: normalized.skipped,
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
          records_rejected,
          records_skipped,
          error_detail
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        run.provider,
        run.startedAt,
        run.completedAt,
        run.status,
        run.recordsUpdated,
        run.recordsRejected,
        run.recordsSkipped,
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
