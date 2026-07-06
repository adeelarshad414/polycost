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
import { DataHealthResponse, PricingStatusResponse } from './api-errors';
import {
  GeneratedReport,
  ReportExportJobRecord,
  ReportFormat,
  ReportInterval,
  ReportPricingModel,
} from '../reports/report.types';
import {
  AccountTeamMembership,
  AuthIdentity,
  SsoConfigurationStatus,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRole,
} from './auth.types';
import {
  BillingImportInput,
  BillingImportRecord,
  BillingImportRowInput,
  BillingSourceType,
  InvoiceLineItemRecord,
  InvoiceReconciliationRecord,
  InvoiceReconciliationStatus,
} from './billing.types';
import {
  AlertRecord,
  BudgetInput,
  BudgetEvaluationRecord,
  BudgetRecord,
  CachedPricingCompareQuery,
  CachedPricingCompareRow,
  CachedPricingTerm,
  CostObservationInput,
  CostObservationRecord,
  CreateAlertInput,
  ExchangeRatesResponse,
  ExchangeRateUpsertInput,
  ShareLinkAnalyticsResponse,
  ShareLinkEventInput,
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

export type ComparisonPrewarmJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ComparisonPrewarmJobRecord {
  jobId: string;
  comparisonId: string;
  status: ComparisonPrewarmJobStatus;
  requestedCombinations: number;
  warmedCombinations: number;
  failedCombinations: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface ComparisonSnapshotRow {
  nws_snapshot: NormalizedWorkloadSpec;
  result_snapshot: ComparisonResult;
}

interface PricingStatusRow {
  provider: ProviderId;
  status: 'success' | 'partial' | 'failed';
  last_successful_run: Date | null;
  records_updated: number | null;
  records_rejected: number | null;
  records_skipped: number | null;
}

interface PricingCacheHealthRow {
  provider: ProviderId;
  catalog_rows: string | number | null;
  current_rate_rows: string | number | null;
  latest_catalog_sync_at: Date | null;
  latest_rate_sync_at: Date | null;
  catalog_success_rows: string | number | null;
  catalog_partial_rows: string | number | null;
  catalog_failed_rows: string | number | null;
  rate_success_rows: string | number | null;
  rate_partial_rows: string | number | null;
  rate_failed_rows: string | number | null;
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

interface BudgetEvaluationRow {
  budget_id: string;
  workload_id: string;
  threshold_usd: string;
  alert_on_anomaly_percent: string | null;
  budget_created_at: Date;
  budget_updated_at: Date;
  instance_family: WorkloadRecord['instanceFamily'];
  vcpu: number;
  memory_gb: string;
  region: string;
  instance_count: number;
  hours_per_month: string;
  storage_gb: string;
  storage_tier: WorkloadRecord['storageTier'];
  egress_gb_per_month: string;
  workload_created_at: Date;
  workload_updated_at: Date;
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
  pricing_model: ShareLinkRecord['pricingModel'];
  granularity: ShareLinkRecord['granularity'];
  password_hash: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

interface ShareLinkEventRollupRow {
  country_code: string | null;
  section: string | null;
  views: string;
  last_viewed_at: Date | null;
}

interface ExchangeRateRow {
  quote_currency: string;
  rate: string;
  fetched_at: Date;
}

interface CostObservationRow {
  id: string;
  workload_id: string;
  budget_id: string | null;
  term: CachedPricingTerm;
  provider: ProviderId;
  observed_monthly_usd: string;
  source: 'modeled_cache';
  observed_at: Date;
}

interface ReportExportJobRow {
  id: string;
  comparison_id: string;
  format: ReportFormat;
  interval: ReportInterval | null;
  pricing_model: ReportPricingModel | null;
  status: ReportExportJobRecord['status'];
  file_name: string | null;
  content_type: string | null;
  artifact?: Buffer | null;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

interface ComparisonPrewarmJobRow {
  id: string;
  comparison_id: string;
  status: ComparisonPrewarmJobStatus;
  requested_combinations: number;
  warmed_combinations: number;
  failed_combinations: number;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface LocalAccountWithPassword {
  accountId: string;
  email: string;
  displayName?: string;
  status: 'active' | 'disabled' | 'invited';
  passwordHash: string;
  failedAttempts: number;
  lockedUntil?: string;
  defaultTeam?: AccountTeamMembership;
}

interface LocalAccountWithPasswordRow {
  account_id: string;
  email: string;
  display_name: string | null;
  status: 'active' | 'disabled' | 'invited';
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
  team_id: string | null;
  team_name: string | null;
  role: TeamRole | null;
}

interface AccountSessionRow {
  session_id: string;
  account_id: string;
  email: string;
  display_name: string | null;
  team_id: string | null;
  team_name: string | null;
  role: TeamRole | null;
  expires_at: Date;
}

interface TeamMembershipRow {
  team_id: string;
  team_name: string;
  role: TeamRole;
}

interface TeamMemberRow {
  account_id: string;
  email: string;
  display_name: string | null;
  role: TeamRole;
  created_at: Date;
  last_active_at: Date | null;
}

interface TeamInvitationRow {
  id: string;
  team_id: string;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  status: TeamInvitationRecord['status'];
  invited_by_account_id: string;
  accepted_by_account_id: string | null;
  expires_at: Date;
  created_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

interface TeamInvitationWithTokenRow extends TeamInvitationRow {
  token_hash: string;
}

interface SsoProviderConfigRow {
  provider_type: 'oidc' | 'saml';
  display_name: string;
  issuer_url: string;
  status: 'configured' | 'disabled';
}

interface BillingImportRow {
  id: string;
  team_id: string | null;
  provider: ProviderId;
  source_type: BillingSourceType;
  status: BillingImportRecord['status'];
  billing_period_start: Date | string;
  billing_period_end: Date | string;
  original_file_sha256: string;
  rows_received: number;
  rows_accepted: number;
  rows_rejected: number;
  total_cost_usd: string;
  created_by_account_id: string | null;
  created_at: Date;
  completed_at: Date | null;
  error_detail: string | null;
}

interface InvoiceLineItemRow {
  id: string;
  import_run_id: string;
  team_id: string | null;
  provider: ProviderId;
  billing_period_start: Date | string;
  billing_period_end: Date | string;
  usage_start: Date | null;
  usage_end: Date | null;
  service_name: string;
  sku_id: string | null;
  region: string | null;
  resource_id: string | null;
  usage_quantity: string | null;
  usage_unit: string | null;
  cost_usd: string;
  currency: string;
  tags: Record<string, string>;
  raw_payload: Record<string, unknown>;
  line_item_hash: string;
  matched_comparison_id: string | null;
  matched_trace_key: string | null;
  created_at: Date;
}

interface InvoiceReconciliationRow {
  id: string;
  import_run_id: string;
  comparison_id: string;
  provider: ProviderId;
  estimated_total_usd: string;
  invoiced_total_usd: string;
  variance_usd: string;
  variance_percent: string;
  status: InvoiceReconciliationStatus;
  evidence: Record<string, unknown>;
  created_at: Date;
}

const PROVIDERS: ProviderId[] = ['aws', 'azure', 'gcp'];
const DATA_FRESHNESS_POLICY_HOURS = 48;

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

  async recordComparisonAuditLog(resultSnapshot: ComparisonResult): Promise<void> {
    const rows = resultSnapshot.providers.flatMap((provider) =>
      provider.lineItems.map((lineItem) => ({
        comparison_id: resultSnapshot.comparisonId,
        provider: provider.providerId,
        service_category: lineItem.category,
        cost_component: lineItem.costComponent ?? lineItem.category,
        service_label: lineItem.description,
        resolved_sku_id: lineItem.skuId ?? null,
        provider_region: lineItem.region ?? null,
        confidence: lineItem.isApproximate ? 'approximate' : 'direct',
        rate_used_usd: lineItem.unitPriceUsd ?? lineItem.baseHourlyCostUsd ?? null,
        rate_source: lineItem.rateSource ?? null,
        rate_source_sku_id: lineItem.rateSourceSkuId ?? lineItem.skuId ?? null,
        pricing_term_code: lineItem.pricingTermCode ?? null,
        payment_option_code: lineItem.paymentOptionCode ?? null,
        rate_currency:
          lineItem.rateCurrency ??
          (lineItem.unitPriceUsd !== undefined || lineItem.baseHourlyCostUsd !== undefined
            ? 'USD'
            : null),
        rate_unit: lineItem.unit ?? null,
        rate_valid_from: lineItem.rateValidFrom ?? null,
        rate_source_fetched_at: lineItem.rateSourceFetchedAt ?? null,
        pricing_trace: lineItem.pricingTrace ?? null,
        monthly_cost_usd: lineItem.baseMonthlyCostUsd,
        pricing_basis: lineItem.pricingBasis ?? null,
        is_approximate: lineItem.isApproximate,
        raw_line_item: lineItem,
      })),
    );

    if (rows.length === 0) {
      return;
    }

    await (
      await this.getPool()
    ).query(
      `
        INSERT INTO comparison_audit_logs (
          comparison_id,
          provider,
          service_category,
          cost_component,
          service_label,
          resolved_sku_id,
          provider_region,
          confidence,
          rate_used_usd,
          rate_source,
          rate_source_sku_id,
          pricing_term_code,
          payment_option_code,
          rate_currency,
          rate_unit,
          rate_valid_from,
          rate_source_fetched_at,
          pricing_trace,
          monthly_cost_usd,
          pricing_basis,
          is_approximate,
          raw_line_item
        )
        SELECT comparison_id,
               provider,
               service_category,
               cost_component,
               service_label,
               resolved_sku_id,
               provider_region,
               confidence,
               rate_used_usd,
               rate_source,
               rate_source_sku_id,
               pricing_term_code,
               payment_option_code,
               rate_currency,
               rate_unit,
               rate_valid_from,
               rate_source_fetched_at,
               pricing_trace,
               monthly_cost_usd,
               pricing_basis,
               is_approximate,
               raw_line_item
        FROM jsonb_to_recordset($1::jsonb) AS audit_rows(
          comparison_id UUID,
          provider TEXT,
          service_category TEXT,
          cost_component TEXT,
          service_label TEXT,
          resolved_sku_id TEXT,
          provider_region TEXT,
          confidence TEXT,
          rate_used_usd NUMERIC,
          rate_source TEXT,
          rate_source_sku_id TEXT,
          pricing_term_code TEXT,
          payment_option_code TEXT,
          rate_currency TEXT,
          rate_unit TEXT,
          rate_valid_from TIMESTAMPTZ,
          rate_source_fetched_at TIMESTAMPTZ,
          pricing_trace JSONB,
          monthly_cost_usd NUMERIC,
          pricing_basis TEXT,
          is_approximate BOOLEAN,
          raw_line_item JSONB
        )
      `,
      [JSON.stringify(rows)],
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
                 status,
                 records_updated,
                 records_rejected,
                 records_skipped
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
               latest.records_updated,
               latest.records_rejected,
               latest.records_skipped,
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
          recordsUpdated: row?.records_updated ?? 0,
          recordsRejected: row?.records_rejected ?? 0,
          recordsSkipped: row?.records_skipped ?? 0,
          ...(row?.last_successful_run
            ? { lastSuccessfulRun: row.last_successful_run.toISOString() }
            : {}),
        };
      }),
    };
  }

  async getDataHealth(now: Date = new Date()): Promise<DataHealthResponse> {
    const [status, cacheHealth] = await Promise.all([
      this.getPricingStatus(),
      this.getPricingCacheHealth(),
    ]);
    const cacheByProvider = new Map(cacheHealth.map((row) => [row.provider, row]));
    const providers = status.providers.map((provider) => {
      const providerAgeHours = provider.lastSuccessfulRun
        ? roundHours((now.getTime() - Date.parse(provider.lastSuccessfulRun)) / 3_600_000)
        : undefined;
      const cacheRow = cacheByProvider.get(provider.providerId);
      const latestCacheSyncAt = latestDate([
        cacheRow?.latest_catalog_sync_at ?? null,
        cacheRow?.latest_rate_sync_at ?? null,
      ]);
      const cacheAgeHours = latestCacheSyncAt
        ? roundHours((now.getTime() - Date.parse(latestCacheSyncAt)) / 3_600_000)
        : undefined;
      const catalogRows = toCount(cacheRow?.catalog_rows);
      const currentRateRows = toCount(cacheRow?.current_rate_rows);
      const cacheFreshness: DataHealthResponse['providers'][number]['cache']['freshness'] =
        cacheAgeHours === undefined
          ? 'missing'
          : cacheAgeHours > DATA_FRESHNESS_POLICY_HOURS
            ? 'stale'
            : 'fresh';
      const ageHours = maxDefined(providerAgeHours, cacheAgeHours);
      const freshness: DataHealthResponse['providers'][number]['freshness'] =
        provider.status === 'failed'
          ? 'failed'
          : provider.status === 'partial'
            ? 'stale'
            : ageHours === undefined || (catalogRows === 0 && currentRateRows === 0)
              ? 'missing'
              : providerAgeHours !== undefined && providerAgeHours > DATA_FRESHNESS_POLICY_HOURS
                ? 'stale'
                : cacheFreshness === 'stale'
                  ? 'stale'
                  : 'fresh';
      const message =
        freshness === 'fresh'
          ? `Pricing cache refreshed ${ageHours}h ago across ${catalogRows} catalog rows and ${currentRateRows} current rate rows.`
          : freshness === 'stale'
            ? provider.status === 'partial'
              ? `Latest provider sync was partial; review ${provider.recordsRejected} rejected and ${provider.recordsSkipped} skipped rows.`
              : `Pricing data is ${ageHours}h old against the ${DATA_FRESHNESS_POLICY_HOURS}h policy; refresh before production decisions.`
            : freshness === 'failed'
              ? 'Latest provider sync failed; use cached data with caution.'
              : catalogRows === 0 && currentRateRows === 0
                ? 'No cached pricing rows are available for this provider.'
                : 'No successful provider sync has been recorded.';

      return {
        ...provider,
        freshness,
        ...(ageHours !== undefined ? { ageHours } : {}),
        cache: {
          catalogRows,
          currentRateRows,
          ...(cacheRow?.latest_catalog_sync_at
            ? { latestCatalogSyncAt: cacheRow.latest_catalog_sync_at.toISOString() }
            : {}),
          ...(cacheRow?.latest_rate_sync_at
            ? { latestRateSyncAt: cacheRow.latest_rate_sync_at.toISOString() }
            : {}),
          ...(cacheAgeHours !== undefined ? { ageHours: cacheAgeHours } : {}),
          freshness: cacheFreshness,
          syncStatusCounts: {
            success: toCount(cacheRow?.catalog_success_rows) + toCount(cacheRow?.rate_success_rows),
            partial: toCount(cacheRow?.catalog_partial_rows) + toCount(cacheRow?.rate_partial_rows),
            failed: toCount(cacheRow?.catalog_failed_rows) + toCount(cacheRow?.rate_failed_rows),
          },
        },
        message,
      };
    });
    const alerts = providers
      .filter((provider) => provider.freshness !== 'fresh')
      .map((provider) => ({
        providerId: provider.providerId,
        severity:
          provider.freshness === 'failed' || provider.freshness === 'missing'
            ? ('critical' as const)
            : ('warning' as const),
        message: provider.message,
      }));
    const overallStatus = alerts.some((alert) => alert.severity === 'critical')
      ? 'degraded'
      : alerts.length > 0
        ? 'stale'
        : 'fresh';

    return {
      generatedAt: now.toISOString(),
      freshnessPolicyHours: DATA_FRESHNESS_POLICY_HOURS,
      overallStatus,
      alertCount: alerts.length,
      alerts,
      providers,
    };
  }

  private async getPricingCacheHealth(): Promise<PricingCacheHealthRow[]> {
    const result = await (
      await this.getPool()
    ).query<PricingCacheHealthRow>(
      `
        WITH catalog AS (
          SELECT provider,
                 COUNT(*) AS catalog_rows,
                 MAX(fetched_at) AS latest_catalog_sync_at,
                 COUNT(*) FILTER (WHERE sync_status = 'success') AS catalog_success_rows,
                 COUNT(*) FILTER (WHERE sync_status = 'partial') AS catalog_partial_rows,
                 COUNT(*) FILTER (WHERE sync_status = 'failed') AS catalog_failed_rows
          FROM pricing_catalog
          GROUP BY provider
        ),
        rates AS (
          SELECT provider_skus.provider,
                 COUNT(*) FILTER (WHERE pricing_rates.valid_to IS NULL) AS current_rate_rows,
                 MAX(pricing_rates.source_fetched_at) FILTER (
                   WHERE pricing_rates.valid_to IS NULL
                 ) AS latest_rate_sync_at,
                 COUNT(*) FILTER (
                   WHERE pricing_rates.valid_to IS NULL
                     AND pricing_rates.sync_status = 'success'
                 ) AS rate_success_rows,
                 COUNT(*) FILTER (
                   WHERE pricing_rates.valid_to IS NULL
                     AND pricing_rates.sync_status = 'partial'
                 ) AS rate_partial_rows,
                 COUNT(*) FILTER (
                   WHERE pricing_rates.valid_to IS NULL
                     AND pricing_rates.sync_status = 'failed'
                 ) AS rate_failed_rows
          FROM provider_skus
          JOIN pricing_rates
            ON pricing_rates.sku_id = provider_skus.id
          GROUP BY provider_skus.provider
        )
        SELECT COALESCE(catalog.provider, rates.provider) AS provider,
               COALESCE(catalog.catalog_rows, 0) AS catalog_rows,
               COALESCE(rates.current_rate_rows, 0) AS current_rate_rows,
               catalog.latest_catalog_sync_at,
               rates.latest_rate_sync_at,
               COALESCE(catalog.catalog_success_rows, 0) AS catalog_success_rows,
               COALESCE(catalog.catalog_partial_rows, 0) AS catalog_partial_rows,
               COALESCE(catalog.catalog_failed_rows, 0) AS catalog_failed_rows,
               COALESCE(rates.rate_success_rows, 0) AS rate_success_rows,
               COALESCE(rates.rate_partial_rows, 0) AS rate_partial_rows,
               COALESCE(rates.rate_failed_rows, 0) AS rate_failed_rows
        FROM catalog
        FULL OUTER JOIN rates
          ON rates.provider = catalog.provider
      `,
    );

    return result.rows;
  }

  async createReportExportJob(input: {
    comparisonId: string;
    format: ReportFormat;
    interval?: ReportInterval;
    pricingModel?: ReportPricingModel;
  }): Promise<ReportExportJobRecord> {
    const result = await (
      await this.getPool()
    ).query<ReportExportJobRow>(
      `
        INSERT INTO report_export_jobs (
          comparison_id,
          format,
          interval,
          pricing_model
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id,
                  comparison_id,
                  format,
                  interval,
                  pricing_model,
                  status,
                  file_name,
                  content_type,
                  error_message,
                  created_at,
                  started_at,
                  completed_at
      `,
      [input.comparisonId, input.format, input.interval ?? null, input.pricingModel ?? null],
    );

    return toReportExportJobRecord(result.rows[0]);
  }

  async getReportExportJob(
    comparisonId: string,
    jobId: string,
  ): Promise<ReportExportJobRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<ReportExportJobRow>(
      `
        SELECT id,
               comparison_id,
               format,
               interval,
               pricing_model,
               status,
               file_name,
               content_type,
               error_message,
               created_at,
               started_at,
               completed_at
        FROM report_export_jobs
        WHERE comparison_id = $1
          AND id = $2
      `,
      [comparisonId, jobId],
    );

    return result.rows[0] ? toReportExportJobRecord(result.rows[0]) : undefined;
  }

  async markReportExportJobRunning(jobId: string, startedAt: string): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE report_export_jobs
        SET status = 'running',
            started_at = $2,
            error_message = NULL
        WHERE id = $1
          AND status = 'pending'
      `,
      [jobId, startedAt],
    );
  }

  async completeReportExportJob(
    jobId: string,
    report: GeneratedReport,
    completedAt: string,
  ): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE report_export_jobs
        SET status = 'completed',
            file_name = $2,
            content_type = $3,
            artifact = $4,
            completed_at = $5,
            error_message = NULL
        WHERE id = $1
      `,
      [jobId, report.fileName, report.contentType, report.content, completedAt],
    );
  }

  async failReportExportJob(
    jobId: string,
    errorMessage: string,
    completedAt: string,
  ): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE report_export_jobs
        SET status = 'failed',
            error_message = $2,
            completed_at = $3
        WHERE id = $1
      `,
      [jobId, errorMessage, completedAt],
    );
  }

  async getReportExportJobArtifact(
    comparisonId: string,
    jobId: string,
  ): Promise<{ job: ReportExportJobRecord; content: Buffer } | undefined> {
    const result = await (
      await this.getPool()
    ).query<ReportExportJobRow>(
      `
        SELECT id,
               comparison_id,
               format,
               interval,
               pricing_model,
               status,
               file_name,
               content_type,
               artifact,
               error_message,
               created_at,
               started_at,
               completed_at
        FROM report_export_jobs
        WHERE comparison_id = $1
          AND id = $2
      `,
      [comparisonId, jobId],
    );
    const row = result.rows[0];

    if (!row || !row.artifact) {
      return undefined;
    }

    return {
      job: toReportExportJobRecord(row),
      content: row.artifact,
    };
  }

  async createComparisonPrewarmJob(input: {
    comparisonId: string;
    requestedCombinations: number;
  }): Promise<ComparisonPrewarmJobRecord> {
    const result = await (
      await this.getPool()
    ).query<ComparisonPrewarmJobRow>(
      `
        INSERT INTO comparison_prewarm_jobs (
          comparison_id,
          requested_combinations
        )
        VALUES ($1, $2)
        RETURNING id,
                  comparison_id,
                  status,
                  requested_combinations,
                  warmed_combinations,
                  failed_combinations,
                  error_message,
                  created_at,
                  started_at,
                  completed_at
      `,
      [input.comparisonId, input.requestedCombinations],
    );

    return toComparisonPrewarmJobRecord(result.rows[0]);
  }

  async markComparisonPrewarmJobRunning(jobId: string, startedAt: string): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE comparison_prewarm_jobs
        SET status = 'running',
            started_at = $2,
            error_message = NULL
        WHERE id = $1
          AND status = 'pending'
      `,
      [jobId, startedAt],
    );
  }

  async finishComparisonPrewarmJob(
    jobId: string,
    input: {
      status: Exclude<ComparisonPrewarmJobStatus, 'pending' | 'running'>;
      warmedCombinations: number;
      failedCombinations: number;
      completedAt: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE comparison_prewarm_jobs
        SET status = $2,
            warmed_combinations = $3,
            failed_combinations = $4,
            error_message = $5,
            completed_at = $6
        WHERE id = $1
      `,
      [
        jobId,
        input.status,
        input.warmedCombinations,
        input.failedCombinations,
        input.errorMessage ?? null,
        input.completedAt,
      ],
    );
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

  async listBudgetsForEvaluation(): Promise<BudgetEvaluationRecord[]> {
    const result = await (
      await this.getPool()
    ).query<BudgetEvaluationRow>(
      `
        SELECT budgets.id AS budget_id,
               budgets.workload_id,
               budgets.threshold_usd,
               budgets.alert_on_anomaly_percent,
               budgets.created_at AS budget_created_at,
               budgets.updated_at AS budget_updated_at,
               workloads.instance_family,
               workloads.vcpu,
               workloads.memory_gb,
               workloads.region,
               workloads.instance_count,
               workloads.hours_per_month,
               workloads.storage_gb,
               workloads.storage_tier,
               workloads.egress_gb_per_month,
               workloads.created_at AS workload_created_at,
               workloads.updated_at AS workload_updated_at
        FROM budgets
        JOIN workloads
          ON workloads.id = budgets.workload_id
        ORDER BY budgets.updated_at DESC
      `,
    );

    return result.rows.map((row) => ({
      budget: toBudgetRecord({
        id: row.budget_id,
        workload_id: row.workload_id,
        threshold_usd: row.threshold_usd,
        alert_on_anomaly_percent: row.alert_on_anomaly_percent,
        created_at: row.budget_created_at,
        updated_at: row.budget_updated_at,
      }),
      workload: toWorkloadRecord({
        id: row.workload_id,
        instance_family: row.instance_family,
        vcpu: row.vcpu,
        memory_gb: row.memory_gb,
        region: row.region,
        instance_count: row.instance_count,
        hours_per_month: row.hours_per_month,
        storage_gb: row.storage_gb,
        storage_tier: row.storage_tier,
        egress_gb_per_month: row.egress_gb_per_month,
        created_at: row.workload_created_at,
        updated_at: row.workload_updated_at,
      }),
    }));
  }

  async createAlertIfNotActive(input: CreateAlertInput): Promise<AlertRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<AlertRow>(
      `
        WITH inserted AS (
          INSERT INTO alerts (
            workload_id,
            budget_id,
            alert_type,
            message,
            threshold_usd,
            observed_usd,
            anomaly_percent
          )
          SELECT $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6,
                 $7
          WHERE NOT EXISTS (
            SELECT 1
            FROM alerts
            WHERE workload_id = $1
              AND budget_id IS NOT DISTINCT FROM $2::uuid
              AND alert_type = $3
              AND dismissed = false
              AND triggered_at > now() - interval '1 day'
          )
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
        )
        SELECT *
        FROM inserted
      `,
      [
        input.workloadId,
        input.budgetId ?? null,
        input.alertType,
        input.message,
        input.thresholdUsd ?? null,
        input.observedUsd ?? null,
        input.anomalyPercent ?? null,
      ],
    );

    return result.rows[0] ? toAlertRecord(result.rows[0]) : undefined;
  }

  async insertCostObservation(input: CostObservationInput): Promise<CostObservationRecord> {
    const result = await (
      await this.getPool()
    ).query<CostObservationRow>(
      `
        INSERT INTO workload_cost_observations (
          workload_id,
          budget_id,
          term,
          provider,
          observed_monthly_usd,
          observed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id,
                  workload_id,
                  budget_id,
                  term,
                  provider,
                  observed_monthly_usd,
                  source,
                  observed_at
      `,
      [
        input.workloadId,
        input.budgetId ?? null,
        input.term,
        input.provider,
        input.observedMonthlyUsd,
        input.observedAt,
      ],
    );

    return toCostObservationRecord(result.rows[0]);
  }

  async getLatestCostObservationBefore(input: {
    workloadId: string;
    budgetId?: string;
    observedBefore: string;
  }): Promise<CostObservationRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<CostObservationRow>(
      `
        SELECT id,
               workload_id,
               budget_id,
               term,
               provider,
               observed_monthly_usd,
               source,
               observed_at
        FROM workload_cost_observations
        WHERE workload_id = $1
          AND budget_id IS NOT DISTINCT FROM $2::uuid
          AND observed_at <= $3
        ORDER BY observed_at DESC
        LIMIT 1
      `,
      [input.workloadId, input.budgetId ?? null, input.observedBefore],
    );

    return result.rows[0] ? toCostObservationRecord(result.rows[0]) : undefined;
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
    pricingModel: ShareLinkRecord['pricingModel'];
    granularity: ShareLinkRecord['granularity'];
    passwordHash?: string;
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
          pricing_model,
          granularity,
          password_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING token,
                  workload_id,
                  watermark,
                  pricing_model,
                  granularity,
                  password_hash,
                  expires_at,
                  revoked_at,
                  created_at
      `,
      [
        input.token,
        input.workloadId,
        input.watermark,
        input.pricingModel,
        input.granularity,
        input.passwordHash ?? null,
        input.expiresAt,
      ],
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
               pricing_model,
               granularity,
               password_hash,
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

  async recordShareLinkEvent(input: ShareLinkEventInput): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        INSERT INTO share_link_events (
          token,
          country_code,
          section,
          user_agent_hash,
          viewed_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        input.token,
        input.countryCode ?? null,
        input.section,
        input.userAgentHash ?? null,
        input.viewedAt,
      ],
    );
  }

  async getShareLinkAnalytics(token: string): Promise<ShareLinkAnalyticsResponse | undefined> {
    const linkResult = await (
      await this.getPool()
    ).query<{ token: string }>(
      `
        SELECT token
        FROM share_links
        WHERE token = $1
      `,
      [token],
    );

    if (!linkResult.rows[0]) {
      return undefined;
    }

    const rollupResult = await (
      await this.getPool()
    ).query<ShareLinkEventRollupRow>(
      `
        SELECT country_code,
               section,
               COUNT(*) AS views,
               MAX(viewed_at) AS last_viewed_at
        FROM share_link_events
        WHERE token = $1
        GROUP BY country_code, section
        ORDER BY views DESC, last_viewed_at DESC
      `,
      [token],
    );
    const totalViews = rollupResult.rows.reduce(
      (sum, row) => sum + Number.parseInt(row.views, 10),
      0,
    );
    const lastViewedAt = latestDate(rollupResult.rows.map((row) => row.last_viewed_at));
    const countryViews = rollupViewsByKey(rollupResult.rows, (row) => row.country_code, 'Unknown')
      .filter((entry) => entry.countryCode !== 'Unknown')
      .map((entry) => ({
        countryCode: entry.countryCode,
        views: entry.views,
      }));
    const sectionViews = rollupViewsByKey(rollupResult.rows, (row) => row.section, 'summary').map(
      (entry) => ({
        section: entry.countryCode,
        views: entry.views,
        ...(entry.lastViewedAt ? { lastViewedAt: entry.lastViewedAt } : {}),
      }),
    );

    return {
      token,
      totalViews,
      ...(lastViewedAt ? { lastViewedAt } : {}),
      countryViews,
      sectionViews,
    };
  }

  async revokeShareLink(token: string, revokedAt: string): Promise<ShareLinkRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<ShareLinkRow>(
      `
        UPDATE share_links
        SET revoked_at = $2
        WHERE token = $1
          AND revoked_at IS NULL
        RETURNING token,
                  workload_id,
                  watermark,
                  pricing_model,
                  granularity,
                  password_hash,
                  expires_at,
                  revoked_at,
                  created_at
      `,
      [token, revokedAt],
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

  async upsertExchangeRates(input: ExchangeRateUpsertInput): Promise<number> {
    const pool = await this.getPool();
    let recordsUpdated = 0;

    for (const [quoteCurrency, rate] of Object.entries(input.rates)) {
      const result = await pool.query(
        `
          INSERT INTO exchange_rates (
            base_currency,
            quote_currency,
            rate,
            source,
            fetched_at
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (base_currency, quote_currency, fetched_at)
          DO UPDATE SET
            rate = EXCLUDED.rate,
            source = EXCLUDED.source
        `,
        [input.baseCurrency, quoteCurrency, rate, input.source, input.fetchedAt],
      );

      recordsUpdated += result.rowCount ?? 0;
    }

    return recordsUpdated;
  }

  async cleanupExpiredShareLinks(now: string): Promise<number> {
    const result = await (
      await this.getPool()
    ).query(
      `
        UPDATE share_links
        SET revoked_at = $1
        WHERE revoked_at IS NULL
          AND expires_at <= $1
      `,
      [now],
    );

    return result.rowCount ?? 0;
  }

  async createLocalAccountWithTeam(input: {
    email: string;
    displayName?: string;
    externalSubjectHash: string;
    passwordHash: string;
    teamName: string;
    teamSlug: string;
  }): Promise<LocalAccountWithPassword> {
    const pool = await this.getPool();

    await pool.query('BEGIN');

    try {
      const accountResult = await pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        status: 'active' | 'disabled' | 'invited';
      }>(
        `
          INSERT INTO accounts (
            email,
            display_name,
            auth_provider,
            external_subject_hash
          )
          VALUES ($1, $2, 'local', $3)
          RETURNING id,
                    email,
                    display_name,
                    status
        `,
        [input.email, input.displayName ?? null, input.externalSubjectHash],
      );
      const account = accountResult.rows[0];

      await pool.query(
        `
          INSERT INTO account_password_credentials (
            account_id,
            password_hash
          )
          VALUES ($1, $2)
        `,
        [account.id, input.passwordHash],
      );

      const teamResult = await pool.query<{
        id: string;
        name: string;
      }>(
        `
          INSERT INTO teams (
            owner_account_id,
            slug,
            name
          )
          VALUES ($1, $2, $3)
          RETURNING id,
                    name
        `,
        [account.id, input.teamSlug, input.teamName],
      );
      const team = teamResult.rows[0];

      await pool.query(
        `
          INSERT INTO team_memberships (
            team_id,
            account_id,
            role
          )
          VALUES ($1, $2, 'owner')
        `,
        [team.id, account.id],
      );

      await pool.query('COMMIT');

      return {
        accountId: account.id,
        email: account.email,
        ...(account.display_name ? { displayName: account.display_name } : {}),
        status: account.status,
        passwordHash: input.passwordHash,
        failedAttempts: 0,
        defaultTeam: {
          teamId: team.id,
          teamName: team.name,
          role: 'owner',
        },
      };
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async findLocalAccountByEmail(email: string): Promise<LocalAccountWithPassword | undefined> {
    const result = await (
      await this.getPool()
    ).query<LocalAccountWithPasswordRow>(
      `
        SELECT accounts.id AS account_id,
               accounts.email,
               accounts.display_name,
               accounts.status,
               account_password_credentials.password_hash,
               account_password_credentials.failed_attempts,
               account_password_credentials.locked_until,
               team_membership.team_id,
               teams.name AS team_name,
               team_membership.role
        FROM accounts
        JOIN account_password_credentials
          ON account_password_credentials.account_id = accounts.id
        LEFT JOIN LATERAL (
          SELECT team_id,
                 role
          FROM team_memberships
          WHERE team_memberships.account_id = accounts.id
          ORDER BY CASE role
                     WHEN 'owner' THEN 1
                     WHEN 'admin' THEN 2
                     WHEN 'member' THEN 3
                     ELSE 4
                   END,
                   created_at ASC
          LIMIT 1
        ) AS team_membership ON TRUE
        LEFT JOIN teams
          ON teams.id = team_membership.team_id
        WHERE accounts.auth_provider = 'local'
          AND accounts.email = $1
        LIMIT 1
      `,
      [email],
    );
    const row = result.rows[0];

    return row ? toLocalAccountWithPassword(row) : undefined;
  }

  async recordFailedLogin(input: {
    accountId: string;
    failedAttempts: number;
    lockedUntil?: string;
  }): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE account_password_credentials
        SET failed_attempts = $2,
            locked_until = $3,
            updated_at = now()
        WHERE account_id = $1
      `,
      [input.accountId, input.failedAttempts, input.lockedUntil ?? null],
    );
  }

  async resetFailedLogin(accountId: string): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE account_password_credentials
        SET failed_attempts = 0,
            locked_until = NULL,
            updated_at = now()
        WHERE account_id = $1
      `,
      [accountId],
    );
  }

  async createSession(input: {
    accountId: string;
    teamId?: string;
    tokenHash: string;
    expiresAt: string;
    userAgentHash?: string;
    ipHash?: string;
  }): Promise<{ sessionId: string; expiresAt: string }> {
    const result = await (
      await this.getPool()
    ).query<{
      id: string;
      expires_at: Date;
    }>(
      `
        INSERT INTO account_sessions (
          account_id,
          team_id,
          token_hash,
          expires_at,
          user_agent_hash,
          ip_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id,
                  expires_at
      `,
      [
        input.accountId,
        input.teamId ?? null,
        input.tokenHash,
        input.expiresAt,
        input.userAgentHash ?? null,
        input.ipHash ?? null,
      ],
    );
    const row = result.rows[0];

    return {
      sessionId: row.id,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async resolveSession(tokenHash: string, now: string): Promise<AuthIdentity | undefined> {
    const result = await (
      await this.getPool()
    ).query<AccountSessionRow>(
      `
        SELECT account_sessions.id AS session_id,
               accounts.id AS account_id,
               accounts.email,
               accounts.display_name,
               account_sessions.team_id,
               teams.name AS team_name,
               team_memberships.role,
               account_sessions.expires_at
        FROM account_sessions
        JOIN accounts
          ON accounts.id = account_sessions.account_id
        LEFT JOIN teams
          ON teams.id = account_sessions.team_id
        LEFT JOIN team_memberships
          ON team_memberships.team_id = account_sessions.team_id
         AND team_memberships.account_id = account_sessions.account_id
        WHERE account_sessions.token_hash = $1
          AND account_sessions.revoked_at IS NULL
          AND account_sessions.expires_at > $2
          AND accounts.status = 'active'
        LIMIT 1
      `,
      [tokenHash, now],
    );
    const row = result.rows[0];

    if (!row) {
      return undefined;
    }

    await (
      await this.getPool()
    ).query(
      `
        UPDATE account_sessions
        SET last_seen_at = $2
        WHERE id = $1
      `,
      [row.session_id, now],
    );

    return toAuthIdentity(row);
  }

  async revokeSession(sessionId: string, now: string): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE account_sessions
        SET revoked_at = $2
        WHERE id = $1
          AND revoked_at IS NULL
      `,
      [sessionId, now],
    );
  }

  async listAccountTeams(accountId: string): Promise<AccountTeamMembership[]> {
    const result = await (
      await this.getPool()
    ).query<TeamMembershipRow>(
      `
        SELECT teams.id AS team_id,
               teams.name AS team_name,
               team_memberships.role
        FROM team_memberships
        JOIN teams
          ON teams.id = team_memberships.team_id
        WHERE team_memberships.account_id = $1
        ORDER BY CASE team_memberships.role
                   WHEN 'owner' THEN 1
                   WHEN 'admin' THEN 2
                   WHEN 'member' THEN 3
                   ELSE 4
                 END,
                 teams.name ASC
      `,
      [accountId],
    );

    return result.rows.map(toTeamMembership);
  }

  async getTeamMembership(input: {
    accountId: string;
    teamId: string;
  }): Promise<AccountTeamMembership | undefined> {
    const result = await (
      await this.getPool()
    ).query<TeamMembershipRow>(
      `
        SELECT teams.id AS team_id,
               teams.name AS team_name,
               team_memberships.role
        FROM team_memberships
        JOIN teams
          ON teams.id = team_memberships.team_id
        WHERE team_memberships.account_id = $1
          AND team_memberships.team_id = $2
        LIMIT 1
      `,
      [input.accountId, input.teamId],
    );

    return result.rows[0] ? toTeamMembership(result.rows[0]) : undefined;
  }

  async listTeamMembers(teamId: string): Promise<TeamMemberRecord[]> {
    const result = await (
      await this.getPool()
    ).query<TeamMemberRow>(
      `
        SELECT accounts.id AS account_id,
               accounts.email,
               accounts.display_name,
               team_memberships.role,
               team_memberships.created_at,
               team_memberships.last_active_at
        FROM team_memberships
        JOIN accounts
          ON accounts.id = team_memberships.account_id
        WHERE team_memberships.team_id = $1
        ORDER BY CASE team_memberships.role
                   WHEN 'owner' THEN 1
                   WHEN 'admin' THEN 2
                   WHEN 'member' THEN 3
                   ELSE 4
                 END,
                 accounts.email ASC
      `,
      [teamId],
    );

    return result.rows.map(toTeamMemberRecord);
  }

  async createTeamInvitation(input: {
    teamId: string;
    email: string;
    role: Exclude<TeamRole, 'owner'>;
    tokenHash: string;
    invitedByAccountId: string;
    expiresAt: string;
  }): Promise<TeamInvitationRecord> {
    const result = await (
      await this.getPool()
    ).query<TeamInvitationRow>(
      `
        INSERT INTO team_invitations (
          team_id,
          email,
          role,
          token_hash,
          invited_by_account_id,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (team_id, email)
          WHERE status = 'pending'
        DO UPDATE SET
          role = EXCLUDED.role,
          token_hash = EXCLUDED.token_hash,
          invited_by_account_id = EXCLUDED.invited_by_account_id,
          expires_at = EXCLUDED.expires_at,
          created_at = now(),
          revoked_at = NULL
        RETURNING id,
                  team_id,
                  email,
                  role,
                  status,
                  invited_by_account_id,
                  accepted_by_account_id,
                  expires_at,
                  created_at,
                  accepted_at,
                  revoked_at
      `,
      [
        input.teamId,
        input.email,
        input.role,
        input.tokenHash,
        input.invitedByAccountId,
        input.expiresAt,
      ],
    );

    return toTeamInvitationRecord(result.rows[0]);
  }

  async listTeamInvitations(teamId: string): Promise<TeamInvitationRecord[]> {
    const result = await (
      await this.getPool()
    ).query<TeamInvitationRow>(
      `
        SELECT id,
               team_id,
               email,
               role,
               CASE
                 WHEN status = 'pending' AND expires_at <= now() THEN 'expired'
                 ELSE status
               END AS status,
               invited_by_account_id,
               accepted_by_account_id,
               expires_at,
               created_at,
               accepted_at,
               revoked_at
        FROM team_invitations
        WHERE team_id = $1
        ORDER BY created_at DESC
      `,
      [teamId],
    );

    return result.rows.map(toTeamInvitationRecord);
  }

  async findPendingInvitationByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<TeamInvitationRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<TeamInvitationRow>(
      `
        SELECT id,
               team_id,
               email,
               role,
               status,
               invited_by_account_id,
               accepted_by_account_id,
               expires_at,
               created_at,
               accepted_at,
               revoked_at
        FROM team_invitations
        WHERE token_hash = $1
          AND status = 'pending'
          AND expires_at > $2
        LIMIT 1
      `,
      [tokenHash, now],
    );

    return result.rows[0] ? toTeamInvitationRecord(result.rows[0]) : undefined;
  }

  async acceptTeamInvitation(input: {
    invitationId: string;
    accountId: string;
    acceptedAt: string;
  }): Promise<TeamInvitationRecord> {
    const pool = await this.getPool();

    await pool.query('BEGIN');

    try {
      const invitation = await pool.query<TeamInvitationWithTokenRow>(
        `
          SELECT id,
                 team_id,
                 email,
                 role,
                 status,
                 token_hash,
                 invited_by_account_id,
                 accepted_by_account_id,
                 expires_at,
                 created_at,
                 accepted_at,
                 revoked_at
          FROM team_invitations
          WHERE id = $1
            AND status = 'pending'
          FOR UPDATE
        `,
        [input.invitationId],
      );
      const row = invitation.rows[0];

      if (!row) {
        throw new Error('Team invitation is no longer pending');
      }

      await pool.query(
        `
          INSERT INTO team_memberships (
            team_id,
            account_id,
            role,
            last_active_at
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (team_id, account_id)
          DO UPDATE SET
            role = EXCLUDED.role,
            last_active_at = EXCLUDED.last_active_at
        `,
        [row.team_id, input.accountId, row.role, input.acceptedAt],
      );

      const accepted = await pool.query<TeamInvitationRow>(
        `
          UPDATE team_invitations
          SET status = 'accepted',
              accepted_by_account_id = $2,
              accepted_at = $3
          WHERE id = $1
          RETURNING id,
                    team_id,
                    email,
                    role,
                    status,
                    invited_by_account_id,
                    accepted_by_account_id,
                    expires_at,
                    created_at,
                    accepted_at,
                    revoked_at
        `,
        [input.invitationId, input.accountId, input.acceptedAt],
      );

      await pool.query('COMMIT');

      return toTeamInvitationRecord(accepted.rows[0]);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async countTeamOwners(teamId: string): Promise<number> {
    const result = await (
      await this.getPool()
    ).query<{ owners: string }>(
      `
        SELECT COUNT(*) AS owners
        FROM team_memberships
        WHERE team_id = $1
          AND role = 'owner'
      `,
      [teamId],
    );

    return Number.parseInt(result.rows[0]?.owners ?? '0', 10);
  }

  async updateTeamMemberRole(input: {
    teamId: string;
    accountId: string;
    role: TeamRole;
  }): Promise<TeamMemberRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<TeamMemberRow>(
      `
        WITH updated_membership AS (
          UPDATE team_memberships
          SET role = $3
          WHERE team_id = $1
            AND account_id = $2
          RETURNING account_id,
                    role,
                    created_at,
                    last_active_at
        )
        SELECT updated_membership.account_id,
               accounts.email,
               accounts.display_name,
               updated_membership.role,
               updated_membership.created_at,
               updated_membership.last_active_at
        FROM updated_membership
        JOIN accounts
          ON accounts.id = updated_membership.account_id
      `,
      [input.teamId, input.accountId, input.role],
    );

    return result.rows[0] ? toTeamMemberRecord(result.rows[0]) : undefined;
  }

  async removeTeamMember(input: { teamId: string; accountId: string }): Promise<boolean> {
    const result = await (
      await this.getPool()
    ).query(
      `
        DELETE FROM team_memberships
        WHERE team_id = $1
          AND account_id = $2
      `,
      [input.teamId, input.accountId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async listSsoProviderConfigs(
    teamId: string,
  ): Promise<SsoConfigurationStatus['configuredProviders']> {
    const result = await (
      await this.getPool()
    ).query<SsoProviderConfigRow>(
      `
        SELECT provider_type,
               display_name,
               issuer_url,
               status
        FROM sso_identity_provider_configs
        WHERE team_id = $1
        ORDER BY provider_type,
                 display_name
      `,
      [teamId],
    );

    return result.rows.map((row) => ({
      providerType: row.provider_type,
      displayName: row.display_name,
      issuerUrl: row.issuer_url,
      status: row.status,
    }));
  }

  async createBillingImport(input: {
    importInput: BillingImportInput;
    originalFileSha256: string;
    teamId?: string;
    createdByAccountId?: string;
    rows: Array<BillingImportRowInput & { lineItemHash: string }>;
  }): Promise<{
    importRun: BillingImportRecord;
    lineItems: InvoiceLineItemRecord[];
  }> {
    const pool = await this.getPool();
    const importedLineItems: InvoiceLineItemRecord[] = [];

    await pool.query('BEGIN');

    try {
      const importResult = await pool.query<BillingImportRow>(
        `
          INSERT INTO billing_import_runs (
            team_id,
            provider,
            source_type,
            billing_period_start,
            billing_period_end,
            original_file_sha256,
            rows_received,
            created_by_account_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id,
                    team_id,
                    provider,
                    source_type,
                    status,
                    billing_period_start,
                    billing_period_end,
                    original_file_sha256,
                    rows_received,
                    rows_accepted,
                    rows_rejected,
                    total_cost_usd,
                    created_by_account_id,
                    created_at,
                    completed_at,
                    error_detail
        `,
        [
          input.teamId ?? null,
          input.importInput.provider,
          input.importInput.sourceType,
          input.importInput.billingPeriodStart,
          input.importInput.billingPeriodEnd,
          input.originalFileSha256,
          input.rows.length,
          input.createdByAccountId ?? null,
        ],
      );
      const importRunId = importResult.rows[0].id;

      for (const row of input.rows) {
        const inserted = await pool.query<InvoiceLineItemRow>(
          `
            INSERT INTO invoice_line_items (
              import_run_id,
              team_id,
              provider,
              billing_period_start,
              billing_period_end,
              usage_start,
              usage_end,
              service_name,
              sku_id,
              region,
              resource_id,
              usage_quantity,
              usage_unit,
              cost_usd,
              currency,
              tags,
              raw_payload,
              line_item_hash
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15,
              $16::jsonb, $17::jsonb, $18
            )
            ON CONFLICT (import_run_id, line_item_hash)
            DO NOTHING
            RETURNING id,
                      import_run_id,
                      team_id,
                      provider,
                      billing_period_start,
                      billing_period_end,
                      usage_start,
                      usage_end,
                      service_name,
                      sku_id,
                      region,
                      resource_id,
                      usage_quantity,
                      usage_unit,
                      cost_usd,
                      currency,
                      tags,
                      raw_payload,
                      line_item_hash,
                      matched_comparison_id,
                      matched_trace_key,
                      created_at
          `,
          [
            importRunId,
            input.teamId ?? null,
            input.importInput.provider,
            input.importInput.billingPeriodStart,
            input.importInput.billingPeriodEnd,
            row.usageStart ?? null,
            row.usageEnd ?? null,
            row.serviceName,
            row.skuId ?? null,
            row.region ?? null,
            row.resourceId ?? null,
            row.usageQuantity ?? null,
            row.usageUnit ?? null,
            row.costUsd,
            row.currency ?? 'USD',
            JSON.stringify(row.tags ?? {}),
            JSON.stringify(row.rawPayload ?? {}),
            row.lineItemHash,
          ],
        );

        if (inserted.rows[0]) {
          importedLineItems.push(toInvoiceLineItemRecord(inserted.rows[0]));
        }
      }

      const acceptedRows = importedLineItems.length;
      const totalCostUsd = importedLineItems.reduce((total, row) => total + row.costUsd, 0);
      const finalImport = await pool.query<BillingImportRow>(
        `
          UPDATE billing_import_runs
          SET status = 'completed',
              rows_accepted = $2,
              rows_rejected = $3,
              total_cost_usd = $4,
              completed_at = now()
          WHERE id = $1
          RETURNING id,
                    team_id,
                    provider,
                    source_type,
                    status,
                    billing_period_start,
                    billing_period_end,
                    original_file_sha256,
                    rows_received,
                    rows_accepted,
                    rows_rejected,
                    total_cost_usd,
                    created_by_account_id,
                    created_at,
                    completed_at,
                    error_detail
        `,
        [importRunId, acceptedRows, input.rows.length - acceptedRows, totalCostUsd],
      );

      await pool.query('COMMIT');

      return {
        importRun: toBillingImportRecord(finalImport.rows[0]),
        lineItems: importedLineItems,
      };
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async getBillingImport(importRunId: string): Promise<BillingImportRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<BillingImportRow>(
      `
        SELECT id,
               team_id,
               provider,
               source_type,
               status,
               billing_period_start,
               billing_period_end,
               original_file_sha256,
               rows_received,
               rows_accepted,
               rows_rejected,
               total_cost_usd,
               created_by_account_id,
               created_at,
               completed_at,
               error_detail
        FROM billing_import_runs
        WHERE id = $1
      `,
      [importRunId],
    );

    return result.rows[0] ? toBillingImportRecord(result.rows[0]) : undefined;
  }

  async listInvoiceLineItems(importRunId: string): Promise<InvoiceLineItemRecord[]> {
    const result = await (
      await this.getPool()
    ).query<InvoiceLineItemRow>(
      `
        SELECT id,
               import_run_id,
               team_id,
               provider,
               billing_period_start,
               billing_period_end,
               usage_start,
               usage_end,
               service_name,
               sku_id,
               region,
               resource_id,
               usage_quantity,
               usage_unit,
               cost_usd,
               currency,
               tags,
               raw_payload,
               line_item_hash,
               matched_comparison_id,
               matched_trace_key,
               created_at
        FROM invoice_line_items
        WHERE import_run_id = $1
        ORDER BY created_at ASC,
                 id ASC
      `,
      [importRunId],
    );

    return result.rows.map(toInvoiceLineItemRecord);
  }

  async saveInvoiceReconciliation(input: {
    importRunId: string;
    comparisonId: string;
    provider: ProviderId;
    estimatedTotalUsd: number;
    invoicedTotalUsd: number;
    varianceUsd: number;
    variancePercent: number;
    status: InvoiceReconciliationStatus;
    evidence: Record<string, unknown>;
  }): Promise<InvoiceReconciliationRecord> {
    const result = await (
      await this.getPool()
    ).query<InvoiceReconciliationRow>(
      `
        INSERT INTO invoice_reconciliation_results (
          import_run_id,
          comparison_id,
          provider,
          estimated_total_usd,
          invoiced_total_usd,
          variance_usd,
          variance_percent,
          status,
          evidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING id,
                  import_run_id,
                  comparison_id,
                  provider,
                  estimated_total_usd,
                  invoiced_total_usd,
                  variance_usd,
                  variance_percent,
                  status,
                  evidence,
                  created_at
      `,
      [
        input.importRunId,
        input.comparisonId,
        input.provider,
        input.estimatedTotalUsd,
        input.invoicedTotalUsd,
        input.varianceUsd,
        input.variancePercent,
        input.status,
        JSON.stringify(input.evidence),
      ],
    );

    return toInvoiceReconciliationRecord(result.rows[0]);
  }

  async listInvoiceReconciliations(importRunId: string): Promise<InvoiceReconciliationRecord[]> {
    const result = await (
      await this.getPool()
    ).query<InvoiceReconciliationRow>(
      `
        SELECT id,
               import_run_id,
               comparison_id,
               provider,
               estimated_total_usd,
               invoiced_total_usd,
               variance_usd,
               variance_percent,
               status,
               evidence,
               created_at
        FROM invoice_reconciliation_results
        WHERE import_run_id = $1
        ORDER BY created_at DESC
      `,
      [importRunId],
    );

    return result.rows.map(toInvoiceReconciliationRecord);
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
    pricingModel: row.pricing_model,
    granularity: row.granularity,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    expiresAt: row.expires_at.toISOString(),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
  };
}

function toCostObservationRecord(row: CostObservationRow): CostObservationRecord {
  return {
    id: row.id,
    workloadId: row.workload_id,
    ...(row.budget_id ? { budgetId: row.budget_id } : {}),
    term: row.term,
    provider: row.provider,
    observedMonthlyUsd: Number.parseFloat(row.observed_monthly_usd),
    source: row.source,
    observedAt: row.observed_at.toISOString(),
  };
}

function toReportExportJobRecord(row: ReportExportJobRow): ReportExportJobRecord {
  return {
    jobId: row.id,
    comparisonId: row.comparison_id,
    format: row.format,
    ...(row.interval ? { interval: row.interval } : {}),
    ...(row.pricing_model ? { pricingModel: row.pricing_model } : {}),
    status: row.status,
    ...(row.file_name ? { fileName: row.file_name } : {}),
    ...(row.content_type ? { contentType: row.content_type } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at.toISOString(),
    ...(row.started_at ? { startedAt: row.started_at.toISOString() } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
  };
}

function toComparisonPrewarmJobRecord(row: ComparisonPrewarmJobRow): ComparisonPrewarmJobRecord {
  return {
    jobId: row.id,
    comparisonId: row.comparison_id,
    status: row.status,
    requestedCombinations: row.requested_combinations,
    warmedCombinations: row.warmed_combinations,
    failedCombinations: row.failed_combinations,
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at.toISOString(),
    ...(row.started_at ? { startedAt: row.started_at.toISOString() } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
  };
}

function toLocalAccountWithPassword(row: LocalAccountWithPasswordRow): LocalAccountWithPassword {
  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    status: row.status,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    ...(row.locked_until ? { lockedUntil: row.locked_until.toISOString() } : {}),
    ...(row.team_id && row.team_name && row.role
      ? {
          defaultTeam: {
            teamId: row.team_id,
            teamName: row.team_name,
            role: row.role,
          },
        }
      : {}),
  };
}

function toAuthIdentity(row: AccountSessionRow): AuthIdentity {
  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.team_id ? { teamId: row.team_id } : {}),
    ...(row.role ? { role: row.role } : {}),
    sessionId: row.session_id,
    expiresAt: row.expires_at.toISOString(),
  };
}

function toTeamMembership(row: TeamMembershipRow): AccountTeamMembership {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    role: row.role,
  };
}

function toTeamMemberRecord(row: TeamMemberRow): TeamMemberRecord {
  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    role: row.role,
    createdAt: row.created_at.toISOString(),
    ...(row.last_active_at ? { lastActiveAt: row.last_active_at.toISOString() } : {}),
  };
}

function toTeamInvitationRecord(row: TeamInvitationRow): TeamInvitationRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByAccountId: row.invited_by_account_id,
    ...(row.accepted_by_account_id ? { acceptedByAccountId: row.accepted_by_account_id } : {}),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    ...(row.accepted_at ? { acceptedAt: row.accepted_at.toISOString() } : {}),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
  };
}

function toBillingImportRecord(row: BillingImportRow): BillingImportRecord {
  return {
    id: row.id,
    ...(row.team_id ? { teamId: row.team_id } : {}),
    provider: row.provider,
    sourceType: row.source_type,
    status: row.status,
    billingPeriodStart: dateOnly(row.billing_period_start),
    billingPeriodEnd: dateOnly(row.billing_period_end),
    originalFileSha256: row.original_file_sha256,
    rowsReceived: row.rows_received,
    rowsAccepted: row.rows_accepted,
    rowsRejected: row.rows_rejected,
    totalCostUsd: Number.parseFloat(row.total_cost_usd),
    ...(row.created_by_account_id ? { createdByAccountId: row.created_by_account_id } : {}),
    createdAt: row.created_at.toISOString(),
    ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
    ...(row.error_detail ? { errorDetail: row.error_detail } : {}),
  };
}

function toInvoiceLineItemRecord(row: InvoiceLineItemRow): InvoiceLineItemRecord {
  return {
    id: row.id,
    importRunId: row.import_run_id,
    ...(row.team_id ? { teamId: row.team_id } : {}),
    provider: row.provider,
    billingPeriodStart: dateOnly(row.billing_period_start),
    billingPeriodEnd: dateOnly(row.billing_period_end),
    serviceName: row.service_name,
    ...(row.sku_id ? { skuId: row.sku_id } : {}),
    ...(row.region ? { region: row.region } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.usage_start ? { usageStart: row.usage_start.toISOString() } : {}),
    ...(row.usage_end ? { usageEnd: row.usage_end.toISOString() } : {}),
    ...(row.usage_quantity !== null
      ? { usageQuantity: Number.parseFloat(row.usage_quantity) }
      : {}),
    ...(row.usage_unit ? { usageUnit: row.usage_unit } : {}),
    costUsd: Number.parseFloat(row.cost_usd),
    currency: row.currency,
    tags: row.tags,
    rawPayload: row.raw_payload,
    lineItemHash: row.line_item_hash,
    ...(row.matched_comparison_id ? { matchedComparisonId: row.matched_comparison_id } : {}),
    ...(row.matched_trace_key ? { matchedTraceKey: row.matched_trace_key } : {}),
    createdAt: row.created_at.toISOString(),
  };
}

function toInvoiceReconciliationRecord(row: InvoiceReconciliationRow): InvoiceReconciliationRecord {
  return {
    id: row.id,
    importRunId: row.import_run_id,
    comparisonId: row.comparison_id,
    provider: row.provider,
    estimatedTotalUsd: Number.parseFloat(row.estimated_total_usd),
    invoicedTotalUsd: Number.parseFloat(row.invoiced_total_usd),
    varianceUsd: Number.parseFloat(row.variance_usd),
    variancePercent: Number.parseFloat(row.variance_percent),
    status: row.status,
    evidence: row.evidence,
    createdAt: row.created_at.toISOString(),
  };
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function latestDate(dates: Array<Date | null>): string | undefined {
  const timestamps = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function rollupViewsByKey(
  rows: ShareLinkEventRollupRow[],
  keySelector: (row: ShareLinkEventRollupRow) => string | null,
  fallbackKey: string,
): Array<{ countryCode: string; views: number; lastViewedAt?: string }> {
  const rollups = new Map<string, { views: number; lastViewedAt?: string }>();

  for (const row of rows) {
    const key = keySelector(row) ?? fallbackKey;
    const views = Number.parseInt(row.views, 10);
    const lastViewedAt = row.last_viewed_at?.toISOString();
    const existing = rollups.get(key);

    if (existing) {
      existing.views += views;
      if (lastViewedAt && (!existing.lastViewedAt || lastViewedAt > existing.lastViewedAt)) {
        existing.lastViewedAt = lastViewedAt;
      }
      continue;
    }

    rollups.set(key, {
      views,
      ...(lastViewedAt ? { lastViewedAt } : {}),
    });
  }

  return [...rollups.entries()]
    .map(([countryCode, value]) => ({
      countryCode,
      views: value.views,
      ...(value.lastViewedAt ? { lastViewedAt: value.lastViewedAt } : {}),
    }))
    .sort(
      (left, right) =>
        right.views - left.views || left.countryCode.localeCompare(right.countryCode),
    );
}

function roundHours(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function toCount(value: string | number | null | undefined): number {
  if (value === undefined || value === null) {
    return 0;
  }

  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function maxDefined(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);

  return defined.length > 0 ? Math.max(...defined) : undefined;
}
