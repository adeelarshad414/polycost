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
import { pricingLineageForCatalogRecord } from '../pricing-normalization/pricing-lineage';
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

interface PricingRateUpsertInput {
  pricingTermCode: string;
  paymentOptionCode?: string;
  hourlyRateUsd: number;
  currency: 'USD';
  isEstimate: boolean;
  estimateRangeLowUsd?: number;
  estimateRangeHighUsd?: number;
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
        const lineage = pricingLineageForCatalogRecord(record);
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
              fetched_at,
              sync_status,
              source_endpoint,
              source_record_id,
              source_record_key,
              transform_version,
              source_payload_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (provider, sku_id, region, effective_date)
            DO UPDATE SET
              service_category = EXCLUDED.service_category,
              service_name = EXCLUDED.service_name,
              sku_description = EXCLUDED.sku_description,
              unit = EXCLUDED.unit,
              unit_price_usd = EXCLUDED.unit_price_usd,
              attributes = EXCLUDED.attributes,
              fetched_at = EXCLUDED.fetched_at,
              sync_status = EXCLUDED.sync_status,
              source_endpoint = EXCLUDED.source_endpoint,
              source_record_id = EXCLUDED.source_record_id,
              source_record_key = EXCLUDED.source_record_key,
              transform_version = EXCLUDED.transform_version,
              source_payload_hash = EXCLUDED.source_payload_hash
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
            'success',
            lineage.sourceEndpoint,
            lineage.sourceRecordId,
            lineage.sourceRecordKey,
            lineage.transformVersion,
            lineage.sourcePayloadHash,
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
                last_synced_at,
                sync_status
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
              ON CONFLICT (provider, provider_sku_id, region)
              DO UPDATE SET
                family = EXCLUDED.family,
                vcpu = EXCLUDED.vcpu,
                memory_gb = EXCLUDED.memory_gb,
                os = EXCLUDED.os,
                raw_payload = EXCLUDED.raw_payload,
                last_synced_at = EXCLUDED.last_synced_at,
                sync_status = EXCLUDED.sync_status
              RETURNING id
            )
            INSERT INTO pricing_snapshots (
              sku_id,
              term,
              price_per_hour,
              currency,
              effective_date
            )
            SELECT id, $11, $12, $13, $14
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
            'success',
            record.term,
            record.pricePerHour,
            record.currency,
            record.effectiveDate,
          ],
        );

        recordsUpdated += result.rowCount ?? 0;
        recordsUpdated += await this.upsertCurrentPricingRates(pool, record);
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
              effective_date,
              source_endpoint,
              source_record_id,
              source_record_key,
              source_fetched_at,
              transform_version,
              source_payload_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (provider, region, tier, effective_date)
            DO UPDATE SET
              price_per_gb_month = EXCLUDED.price_per_gb_month,
              currency = EXCLUDED.currency,
              source_endpoint = EXCLUDED.source_endpoint,
              source_record_id = EXCLUDED.source_record_id,
              source_record_key = EXCLUDED.source_record_key,
              source_fetched_at = EXCLUDED.source_fetched_at,
              transform_version = EXCLUDED.transform_version,
              source_payload_hash = EXCLUDED.source_payload_hash
          `,
          [
            record.provider,
            record.region,
            record.tier,
            record.pricePerGbMonth,
            record.currency,
            record.effectiveDate,
            record.sourceLineage.sourceEndpoint,
            record.sourceLineage.sourceRecordId,
            record.sourceLineage.sourceRecordKey,
            record.sourceLineage.fetchTimestamp,
            record.sourceLineage.transformVersion,
            record.sourceLineage.sourcePayloadHash,
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
              effective_date,
              source_endpoint,
              source_record_id,
              source_record_key,
              source_fetched_at,
              transform_version,
              source_payload_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (provider, region, tier_from_gb, effective_date)
            DO UPDATE SET
              tier_to_gb = EXCLUDED.tier_to_gb,
              price_per_gb = EXCLUDED.price_per_gb,
              source_endpoint = EXCLUDED.source_endpoint,
              source_record_id = EXCLUDED.source_record_id,
              source_record_key = EXCLUDED.source_record_key,
              source_fetched_at = EXCLUDED.source_fetched_at,
              transform_version = EXCLUDED.transform_version,
              source_payload_hash = EXCLUDED.source_payload_hash
          `,
          [
            record.provider,
            record.region,
            record.tierFromGb,
            record.tierToGb ?? null,
            record.pricePerGb,
            record.effectiveDate,
            record.sourceLineage.sourceEndpoint,
            record.sourceLineage.sourceRecordId,
            record.sourceLineage.sourceRecordKey,
            record.sourceLineage.fetchTimestamp,
            record.sourceLineage.transformVersion,
            record.sourceLineage.sourcePayloadHash,
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

  private async upsertCurrentPricingRates(
    pool: PgPoolLike,
    record: ReturnType<typeof normalizePricingCatalogRecords>['compute'][number],
  ): Promise<number> {
    let recordsUpdated = 0;
    const lineage = record.sourceLineage;

    for (const rate of pricingRateRowsForComputeRecord(record)) {
      const result = await pool.query(
        `
          WITH resolved AS (
            SELECT provider_skus.id AS sku_id,
                   pricing_terms.id AS pricing_term_id,
                   payment_options.id AS payment_option_id
            FROM provider_skus
            JOIN pricing_terms
              ON pricing_terms.code = $4
            LEFT JOIN payment_options
              ON payment_options.code = $5
            WHERE provider_skus.provider = $1
              AND provider_skus.provider_sku_id = $2
              AND provider_skus.region = $3
          ),
          closed_previous AS (
            UPDATE pricing_rates
            SET valid_to = $12::timestamptz
            FROM resolved
            WHERE pricing_rates.sku_id = resolved.sku_id
              AND pricing_rates.region = $3
              AND pricing_rates.pricing_term_id = resolved.pricing_term_id
              AND (
                (pricing_rates.payment_option_id IS NULL AND resolved.payment_option_id IS NULL)
                OR pricing_rates.payment_option_id = resolved.payment_option_id
              )
              AND pricing_rates.valid_to IS NULL
              AND pricing_rates.valid_from <> $12::timestamptz
            RETURNING pricing_rates.id
          )
          INSERT INTO pricing_rates (
            sku_id,
            region,
            pricing_term_id,
            payment_option_id,
            hourly_rate_usd,
            currency,
            is_estimate,
            estimate_range_low_usd,
            estimate_range_high_usd,
            source_fetched_at,
            valid_from,
            sync_status,
            source_endpoint,
            source_record_id,
            source_record_key,
            transform_version,
            source_payload_hash
          )
          SELECT resolved.sku_id,
                 $3,
                 resolved.pricing_term_id,
                 resolved.payment_option_id,
                 ROUND($6::numeric, 6),
                 $7,
                 $8,
                 $9::numeric,
                 $10::numeric,
                 $11::timestamptz,
                 $12::timestamptz,
                 'success',
                 $13,
                 $14,
                 $15,
                 $16,
                 $17
          FROM resolved
          ON CONFLICT (
            sku_id,
            region,
            pricing_term_id,
            (COALESCE(payment_option_id, 0)),
            valid_from
          )
          DO UPDATE SET
            hourly_rate_usd = EXCLUDED.hourly_rate_usd,
            currency = EXCLUDED.currency,
            is_estimate = EXCLUDED.is_estimate,
            estimate_range_low_usd = EXCLUDED.estimate_range_low_usd,
            estimate_range_high_usd = EXCLUDED.estimate_range_high_usd,
            source_fetched_at = EXCLUDED.source_fetched_at,
            valid_to = NULL,
            sync_status = EXCLUDED.sync_status,
            source_endpoint = EXCLUDED.source_endpoint,
            source_record_id = EXCLUDED.source_record_id,
            source_record_key = EXCLUDED.source_record_key,
            transform_version = EXCLUDED.transform_version,
            source_payload_hash = EXCLUDED.source_payload_hash
        `,
        [
          record.provider,
          record.providerSkuId,
          record.region,
          rate.pricingTermCode,
          rate.paymentOptionCode ?? null,
          rate.hourlyRateUsd,
          rate.currency,
          rate.isEstimate,
          rate.estimateRangeLowUsd ?? null,
          rate.estimateRangeHighUsd ?? null,
          record.lastSyncedAt,
          record.effectiveDate,
          lineage.sourceEndpoint,
          lineage.sourceRecordId,
          lineage.sourceRecordKey,
          lineage.transformVersion,
          lineage.sourcePayloadHash,
        ],
      );

      recordsUpdated += result.rowCount ?? 0;
    }

    return recordsUpdated;
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

function pricingRateRowsForComputeRecord(
  record: ReturnType<typeof normalizePricingCatalogRecords>['compute'][number],
): PricingRateUpsertInput[] {
  switch (record.term) {
    case 'on_demand':
      return [pricingRate(record, 'on_demand')];
    case 'reserved_1yr':
      return paymentAdjustedRates(record, 'reserved_1yr', {
        no_upfront: 1,
        partial_upfront: 0.62 / 0.68,
        all_upfront: 0.58 / 0.68,
      });
    case 'reserved_3yr':
      return paymentAdjustedRates(record, 'reserved_3yr', {
        no_upfront: 1,
        partial_upfront: 0.47 / 0.52,
        all_upfront: 0.43 / 0.52,
      });
    case 'savings_plan':
      return paymentAdjustedRates(record, 'savings_plan_1yr', {
        no_upfront: 1,
        partial_upfront: 0.68 / 0.72,
        all_upfront: 0.64 / 0.72,
      });
    case 'spot':
      return [
        pricingRate(record, 'spot_estimate', undefined, 1, {
          isEstimate: true,
          estimateRangeLowUsd: roundSix(record.pricePerHour * 0.8),
          estimateRangeHighUsd: roundSix(record.pricePerHour * 1.2),
        }),
      ];
  }
}

function paymentAdjustedRates(
  record: ReturnType<typeof normalizePricingCatalogRecords>['compute'][number],
  pricingTermCode: string,
  factors: Record<'no_upfront' | 'partial_upfront' | 'all_upfront', number>,
): PricingRateUpsertInput[] {
  return Object.entries(factors).map(([paymentOptionCode, factor]) =>
    pricingRate(record, pricingTermCode, paymentOptionCode, factor),
  );
}

function pricingRate(
  record: ReturnType<typeof normalizePricingCatalogRecords>['compute'][number],
  pricingTermCode: string,
  paymentOptionCode?: string,
  factor = 1,
  options: Pick<
    PricingRateUpsertInput,
    'isEstimate' | 'estimateRangeLowUsd' | 'estimateRangeHighUsd'
  > = { isEstimate: false },
): PricingRateUpsertInput {
  return {
    pricingTermCode,
    ...(paymentOptionCode ? { paymentOptionCode } : {}),
    hourlyRateUsd: roundSix(record.pricePerHour * factor),
    currency: record.currency,
    isEstimate: options.isEstimate,
    ...(options.estimateRangeLowUsd !== undefined
      ? { estimateRangeLowUsd: options.estimateRangeLowUsd }
      : {}),
    ...(options.estimateRangeHighUsd !== undefined
      ? { estimateRangeHighUsd: options.estimateRangeHighUsd }
      : {}),
  };
}

function roundSix(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
