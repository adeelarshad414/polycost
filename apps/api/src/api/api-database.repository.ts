import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { calculateEgressCost } from '../pricing-normalization/egress-tier-calculator';
import { providerRegionForCanonicalRegion } from '../pricing-normalization/region-map';
import { SecretsReader, SecretsService } from '../secrets/secrets.service';
import { PricingStatusResponse } from './api-errors';
import {
  AlertRecord,
  BudgetInput,
  BudgetRecord,
  CachedPricingCompareQuery,
  CachedPricingCompareRow,
  CachedPricingTerm,
  ExchangeRatesResponse,
  ShareLinkRecord,
  WorkloadCostBreakdown,
  WorkloadInput,
  WorkloadRecord,
} from './cost-management.types';

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

export interface ComparisonSnapshot {
  nwsSnapshot: NormalizedWorkloadSpec;
  resultSnapshot: ComparisonResult;
}

interface ComparisonSnapshotRow {
  nws_snapshot: NormalizedWorkloadSpec;
  result_snapshot: ComparisonResult;
}

interface PricingStatusRow {
  provider: ProviderId;
  status: 'success' | 'partial' | 'failed';
  last_successful_run: Date | null;
}

interface WorkloadRow {
  id: string;
  instance_family: WorkloadRecord['instanceFamily'];
  vcpu: number;
  memory_gb: string;
  region: string;
  instance_count: number;
  hours_per_month: string;
  storage_gb: string;
  storage_tier: WorkloadRecord['storageTier'];
  egress_gb_per_month: string;
  created_at: Date;
  updated_at: Date;
}

interface CachedPricingCompareSqlRow {
  provider: ProviderId;
  provider_sku_id: string;
  sku_id: string;
  price_per_hour: string;
  term: CachedPricingTerm;
  region: string;
  currency: string;
  effective_date: Date | string;
}

interface StoragePriceRow {
  price_per_gb_month: string;
}

interface EgressTierRateRow {
  tier_from_gb: string;
  tier_to_gb: string | null;
  price_per_gb: string;
}

interface BudgetRow {
  id: string;
  workload_id: string;
  threshold_usd: string;
  alert_on_anomaly_percent: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AlertRow {
  id: string;
  workload_id: string;
  budget_id: string | null;
  alert_type: AlertRecord['alertType'];
  message: string;
  threshold_usd: string | null;
  observed_usd: string | null;
  anomaly_percent: string | null;
  dismissed: boolean;
  triggered_at: Date;
  dismissed_at: Date | null;
}

interface ShareLinkRow {
  token: string;
  workload_id: string;
  watermark: boolean;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

interface ExchangeRateRow {
  quote_currency: string;
  rate: string;
  fetched_at: Date;
}

const PROVIDERS: ProviderId[] = ['aws', 'azure', 'gcp'];

const defaultPgPoolFactory: PgPoolFactory = (config) => new Pool(config);

@Injectable()
export class ApiDatabaseRepository implements OnModuleDestroy {
  private pool?: PgPoolLike;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(SecretsService)
    private readonly secretsReader: SecretsReader,
    private readonly poolFactory: PgPoolFactory = defaultPgPoolFactory,
  ) {}

  async saveComparison(
    nwsSnapshot: NormalizedWorkloadSpec,
    resultSnapshot: ComparisonResult,
  ): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        INSERT INTO comparisons (
          id,
          nws_snapshot,
          result_snapshot,
          pricing_as_of
        )
        VALUES ($1, $2::jsonb, $3::jsonb, $4)
      `,
      [
        resultSnapshot.comparisonId,
        JSON.stringify(nwsSnapshot),
        JSON.stringify(resultSnapshot),
        resultSnapshot.pricingAsOf,
      ],
    );
  }

  async getComparison(comparisonId: string): Promise<ComparisonSnapshot | undefined> {
    const result = await (
      await this.getPool()
    ).query<ComparisonSnapshotRow>(
      `
        SELECT nws_snapshot,
               result_snapshot
        FROM comparisons
        WHERE id = $1
      `,
      [comparisonId],
    );

    const row = result.rows[0];

    return row
      ? {
          nwsSnapshot: row.nws_snapshot,
          resultSnapshot: row.result_snapshot,
        }
      : undefined;
  }

  async getPricingStatus(): Promise<PricingStatusResponse> {
    const result = await (
      await this.getPool()
    ).query<PricingStatusRow>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (provider)
                 provider,
                 status
          FROM pricing_etl_runs
          ORDER BY provider, started_at DESC
        ),
        successful AS (
          SELECT provider,
                 MAX(completed_at) AS last_successful_run
          FROM pricing_etl_runs
          WHERE status = 'success'
          GROUP BY provider
        )
        SELECT latest.provider,
               latest.status,
               successful.last_successful_run
        FROM latest
        LEFT JOIN successful
          ON successful.provider = latest.provider
      `,
    );
    const byProvider = new Map(result.rows.map((row) => [row.provider, row]));

    return {
      providers: PROVIDERS.map((providerId) => {
        const row = byProvider.get(providerId);

        return {
          providerId,
          status: row?.status ?? 'failed',
          ...(row?.last_successful_run
            ? { lastSuccessfulRun: row.last_successful_run.toISOString() }
            : {}),
        };
      }),
    };
  }

  async createWorkload(input: WorkloadInput): Promise<WorkloadRecord> {
    const result = await (
      await this.getPool()
    ).query<WorkloadRow>(
      `
        INSERT INTO workloads (
          instance_family,
          vcpu,
          memory_gb,
          region,
          instance_count,
          hours_per_month,
          storage_gb,
          storage_tier,
          egress_gb_per_month
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id,
                  instance_family,
                  vcpu,
                  memory_gb,
                  region,
                  instance_count,
                  hours_per_month,
                  storage_gb,
                  storage_tier,
                  egress_gb_per_month,
                  created_at,
                  updated_at
      `,
      [
        input.instanceFamily,
        input.vcpu,
        input.memoryGb,
        input.region,
        input.instanceCount,
        input.hoursPerMonth,
        input.storageGb,
        input.storageTier,
        input.egressGbPerMonth,
      ],
    );

    return toWorkloadRecord(result.rows[0]);
  }

  async getWorkload(workloadId: string): Promise<WorkloadRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<WorkloadRow>(
      `
        SELECT id,
               instance_family,
               vcpu,
               memory_gb,
               region,
               instance_count,
               hours_per_month,
               storage_gb,
               storage_tier,
               egress_gb_per_month,
               created_at,
               updated_at
        FROM workloads
        WHERE id = $1
      `,
      [workloadId],
    );

    return result.rows[0] ? toWorkloadRecord(result.rows[0]) : undefined;
  }

  async compareCachedPricing(query: CachedPricingCompareQuery): Promise<CachedPricingCompareRow[]> {
    const providerRegionMap = providerRegions(query.region);
    const result = await (
      await this.getPool()
    ).query<CachedPricingCompareSqlRow>(
      `
        WITH requested_regions(provider, region) AS (
          VALUES
            ('aws', $4),
            ('azure', $5),
            ('gcp', $6)
        )
        SELECT DISTINCT ON (requested_regions.provider)
               requested_regions.provider,
               provider_skus.provider_sku_id,
               provider_skus.id AS sku_id,
               pricing_snapshots.price_per_hour,
               pricing_snapshots.term,
               provider_skus.region,
               pricing_snapshots.currency,
               pricing_snapshots.effective_date
        FROM requested_regions
        JOIN provider_skus
          ON provider_skus.provider = requested_regions.provider
         AND provider_skus.region = requested_regions.region
        JOIN pricing_snapshots
          ON pricing_snapshots.sku_id = provider_skus.id
         AND pricing_snapshots.term = $7
        WHERE provider_skus.family = $1
          AND provider_skus.vcpu >= $2
          AND provider_skus.memory_gb >= $3
        ORDER BY requested_regions.provider,
                 pricing_snapshots.effective_date DESC,
                 provider_skus.vcpu ASC,
                 provider_skus.memory_gb ASC,
                 pricing_snapshots.price_per_hour ASC
      `,
      [
        query.instanceFamily,
        query.vcpu,
        query.memoryGb,
        providerRegionMap.aws,
        providerRegionMap.azure,
        providerRegionMap.gcp,
        query.term,
      ],
    );

    return result.rows.map(toCachedPricingCompareRow);
  }

  async getWorkloadCostBreakdown(
    workloadId: string,
    term: CachedPricingTerm,
  ): Promise<WorkloadCostBreakdown | undefined> {
    const workload = await this.getWorkload(workloadId);

    if (!workload) {
      return undefined;
    }

    const computeRows = await this.compareCachedPricing({
      instanceFamily: workload.instanceFamily,
      vcpu: workload.vcpu,
      memoryGb: workload.memoryGb,
      region: workload.region,
      term,
    });
    const computeRowsByProvider = new Map(computeRows.map((row) => [row.provider, row]));
    const providers = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const region =
          providerRegionForCanonicalRegion(workload.region, provider) ?? workload.region;
        const computeRow = computeRowsByProvider.get(provider);
        const compute = this.roundCurrency(
          (computeRow?.pricePerHour ?? 0) * workload.hoursPerMonth * workload.instanceCount,
        );
        const storage = await this.storageMonthlyCost(provider, region, workload);
        const egress = await this.egressMonthlyCost(provider, region, workload.egressGbPerMonth);

        return {
          provider,
          region,
          compute,
          storage,
          egress,
          total: this.roundCurrency(compute + storage + egress),
          currency: 'USD' as const,
        };
      }),
    );

    return {
      workloadId,
      term,
      providers,
    };
  }

  async createBudget(input: BudgetInput): Promise<BudgetRecord> {
    const result = await (
      await this.getPool()
    ).query<BudgetRow>(
      `
        INSERT INTO budgets (
          workload_id,
          threshold_usd,
          alert_on_anomaly_percent
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (workload_id)
        DO UPDATE SET
          threshold_usd = EXCLUDED.threshold_usd,
          alert_on_anomaly_percent = EXCLUDED.alert_on_anomaly_percent,
          updated_at = now()
        RETURNING id,
                  workload_id,
                  threshold_usd,
                  alert_on_anomaly_percent,
                  created_at,
                  updated_at
      `,
      [input.workloadId, input.thresholdUsd, input.alertOnAnomalyPercent ?? null],
    );

    return toBudgetRecord(result.rows[0]);
  }

  async listAlerts(workloadId?: string): Promise<AlertRecord[]> {
    const result = await (
      await this.getPool()
    ).query<AlertRow>(
      `
        SELECT id,
               workload_id,
               budget_id,
               alert_type,
               message,
               threshold_usd,
               observed_usd,
               anomaly_percent,
               dismissed,
               triggered_at,
               dismissed_at
        FROM alerts
        WHERE ($1::uuid IS NULL OR workload_id = $1::uuid)
        ORDER BY triggered_at DESC
      `,
      [workloadId ?? null],
    );

    return result.rows.map(toAlertRecord);
  }

  async updateAlertDismissed(
    alertId: string,
    dismissed: boolean,
  ): Promise<AlertRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<AlertRow>(
      `
        UPDATE alerts
        SET dismissed = $2,
            dismissed_at = CASE WHEN $2 THEN now() ELSE NULL END
        WHERE id = $1
        RETURNING id,
                  workload_id,
                  budget_id,
                  alert_type,
                  message,
                  threshold_usd,
                  observed_usd,
                  anomaly_percent,
                  dismissed,
                  triggered_at,
                  dismissed_at
      `,
      [alertId, dismissed],
    );

    return result.rows[0] ? toAlertRecord(result.rows[0]) : undefined;
  }

  async createShareLink(input: {
    token: string;
    workloadId: string;
    watermark: boolean;
    expiresAt: string;
  }): Promise<ShareLinkRecord> {
    const result = await (
      await this.getPool()
    ).query<ShareLinkRow>(
      `
        INSERT INTO share_links (
          token,
          workload_id,
          watermark,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING token,
                  workload_id,
                  watermark,
                  expires_at,
                  revoked_at,
                  created_at
      `,
      [input.token, input.workloadId, input.watermark, input.expiresAt],
    );

    return toShareLinkRecord(result.rows[0]);
  }

  async getActiveShareLink(token: string): Promise<ShareLinkRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<ShareLinkRow>(
      `
        SELECT token,
               workload_id,
               watermark,
               expires_at,
               revoked_at,
               created_at
        FROM share_links
        WHERE token = $1
          AND revoked_at IS NULL
          AND expires_at > now()
      `,
      [token],
    );

    return result.rows[0] ? toShareLinkRecord(result.rows[0]) : undefined;
  }

  async getExchangeRates(baseCurrency: string): Promise<ExchangeRatesResponse> {
    const result = await (
      await this.getPool()
    ).query<ExchangeRateRow>(
      `
        SELECT DISTINCT ON (quote_currency)
               quote_currency,
               rate,
               fetched_at
        FROM exchange_rates
        WHERE base_currency = $1
        ORDER BY quote_currency, fetched_at DESC
      `,
      [baseCurrency],
    );

    const rates: Record<string, number> = {};
    let lastUpdated: string | undefined;

    result.rows.forEach((row) => {
      rates[row.quote_currency] = Number.parseFloat(row.rate);

      const fetchedAt = row.fetched_at.toISOString();
      if (!lastUpdated || fetchedAt > lastUpdated) {
        lastUpdated = fetchedAt;
      }
    });

    return {
      base: baseCurrency,
      ...(lastUpdated ? { lastUpdated } : {}),
      rates,
    };
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
        user: await this.secretsReader.getSecret('polycost/db', 'username'),
        password: await this.secretsReader.getSecret('polycost/db', 'password'),
      });
    }

    return this.pool;
  }

  private async storageMonthlyCost(
    provider: ProviderId,
    region: string,
    workload: WorkloadRecord,
  ): Promise<number> {
    if (workload.storageGb <= 0) {
      return 0;
    }

    const result = await (
      await this.getPool()
    ).query<StoragePriceRow>(
      `
        SELECT price_per_gb_month
        FROM storage_pricing
        WHERE provider = $1
          AND region = $2
          AND tier = $3
        ORDER BY effective_date DESC
        LIMIT 1
      `,
      [provider, region, workload.storageTier],
    );
    const row = result.rows[0];

    return this.roundCurrency(
      (row ? Number.parseFloat(row.price_per_gb_month) : 0) * workload.storageGb,
    );
  }

  private async egressMonthlyCost(
    provider: ProviderId,
    region: string,
    egressGbPerMonth: number,
  ): Promise<number> {
    if (egressGbPerMonth <= 0) {
      return 0;
    }

    const result = await (
      await this.getPool()
    ).query<EgressTierRateRow>(
      `
        SELECT tier_from_gb,
               tier_to_gb,
               price_per_gb
        FROM egress_tier_rates
        WHERE provider = $1
          AND region = $2
          AND effective_date = (
            SELECT MAX(effective_date)
            FROM egress_tier_rates
            WHERE provider = $1
              AND region = $2
          )
        ORDER BY tier_from_gb ASC
      `,
      [provider, region],
    );

    return this.roundCurrency(
      calculateEgressCost(
        result.rows.map((row) => ({
          tierFromGb: Number.parseFloat(row.tier_from_gb),
          ...(row.tier_to_gb ? { tierToGb: Number.parseFloat(row.tier_to_gb) } : {}),
          pricePerGb: Number.parseFloat(row.price_per_gb),
        })),
        egressGbPerMonth,
      ),
    );
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

function providerRegions(region: string): Record<ProviderId, string> {
  return {
    aws: providerRegionForCanonicalRegion(region, 'aws') ?? region,
    azure: providerRegionForCanonicalRegion(region, 'azure') ?? region,
    gcp: providerRegionForCanonicalRegion(region, 'gcp') ?? region,
  };
}

function toWorkloadRecord(row: WorkloadRow): WorkloadRecord {
  return {
    id: row.id,
    instanceFamily: row.instance_family,
    vcpu: row.vcpu,
    memoryGb: Number.parseFloat(row.memory_gb),
    region: row.region,
    instanceCount: row.instance_count,
    hoursPerMonth: Number.parseFloat(row.hours_per_month),
    storageGb: Number.parseFloat(row.storage_gb),
    storageTier: row.storage_tier,
    egressGbPerMonth: Number.parseFloat(row.egress_gb_per_month),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toCachedPricingCompareRow(row: CachedPricingCompareSqlRow): CachedPricingCompareRow {
  return {
    provider: row.provider,
    providerSkuId: row.provider_sku_id,
    skuId: row.sku_id,
    pricePerHour: Number.parseFloat(row.price_per_hour),
    term: row.term,
    region: row.region,
    currency: row.currency,
    effectiveDate:
      row.effective_date instanceof Date ? row.effective_date.toISOString() : row.effective_date,
  };
}

function toBudgetRecord(row: BudgetRow): BudgetRecord {
  return {
    id: row.id,
    workloadId: row.workload_id,
    thresholdUsd: Number.parseFloat(row.threshold_usd),
    ...(row.alert_on_anomaly_percent
      ? { alertOnAnomalyPercent: Number.parseFloat(row.alert_on_anomaly_percent) }
      : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toAlertRecord(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    workloadId: row.workload_id,
    ...(row.budget_id ? { budgetId: row.budget_id } : {}),
    alertType: row.alert_type,
    message: row.message,
    ...(row.threshold_usd ? { thresholdUsd: Number.parseFloat(row.threshold_usd) } : {}),
    ...(row.observed_usd ? { observedUsd: Number.parseFloat(row.observed_usd) } : {}),
    ...(row.anomaly_percent ? { anomalyPercent: Number.parseFloat(row.anomaly_percent) } : {}),
    dismissed: row.dismissed,
    triggeredAt: row.triggered_at.toISOString(),
    ...(row.dismissed_at ? { dismissedAt: row.dismissed_at.toISOString() } : {}),
  };
}

function toShareLinkRecord(row: ShareLinkRow): ShareLinkRecord {
  return {
    token: row.token,
    workloadId: row.workload_id,
    watermark: row.watermark,
    expiresAt: row.expires_at.toISOString(),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
  };
}
