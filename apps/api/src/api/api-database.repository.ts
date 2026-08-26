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
import {
  ApiConflictError,
  ApiNotFoundError,
  ApiValidationError,
  DataHealthResponse,
  PricingStatusResponse,
} from './api-errors';
import {
  GeneratedReport,
  ReportExportJobRecord,
  ReportFormat,
  ReportInterval,
  ReportPricingModel,
} from '../reports/report.types';
import {
  AccountSessionRecord,
  AccountTeamMembership,
  AccountProfileResponse,
  AuthIdentity,
  SsoConfigurationStatus,
  TeamAuditAction,
  TeamAuditEventRecord,
  TeamAuditTargetType,
  TeamScimIdentity,
  TeamScimTokenRecord,
  TeamScimUserRecord,
  TeamSwitchResponse,
  TeamSettingsRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRole,
} from './auth.types';
import {
  BillingImportInput,
  BillingImportRecord,
  BillingImportRowInput,
  BillingSourceType,
  InvoiceArtifactBlobRecord,
  InvoiceArtifactProviderRetentionProof,
  InvoiceArtifactStorageBackend,
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

interface PgQueryRunner {
  query<T = unknown>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
}

interface PgClientLike extends PgQueryRunner {
  release(): void;
}

export interface PgPoolLike extends PgQueryRunner {
  connect?(): Promise<PgClientLike>;
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
  mock_catalog_rows: string | number | null;
  seeded_catalog_rows: string | number | null;
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

export interface AccountSessionPrincipal {
  accountId: string;
  email: string;
  displayName?: string;
  status: 'active' | 'disabled' | 'invited';
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
  role: DatabaseTeamRole | null;
}

interface AccountSessionPrincipalRow {
  account_id: string;
  email: string;
  display_name: string | null;
  status: 'active' | 'disabled' | 'invited';
  team_id: string | null;
  team_name: string | null;
  role: DatabaseTeamRole | null;
}

interface AccountSessionRow {
  session_id: string;
  account_id: string;
  email: string;
  display_name: string | null;
  team_id: string | null;
  team_name: string | null;
  role: DatabaseTeamRole | null;
  expires_at: Date;
}

interface AccountSessionListRow {
  session_id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  has_user_agent: boolean;
  has_ip: boolean;
}

interface TeamSwitchRow {
  session_id: string;
  team_id: string;
  team_name: string;
  role: DatabaseTeamRole;
  expires_at: Date;
}

interface TeamMembershipRow {
  team_id: string;
  team_name: string;
  role: DatabaseTeamRole;
}

interface TeamMemberRow {
  account_id: string;
  email: string;
  display_name: string | null;
  role: DatabaseTeamRole;
  created_at: Date;
  last_active_at: Date | null;
}

interface TeamInvitationRow {
  id: string;
  team_id: string;
  email: string;
  role: Exclude<TeamRole, 'owner'> | 'viewer';
  status: TeamInvitationRecord['status'];
  invited_by_account_id: string;
  accepted_by_account_id: string | null;
  expires_at: Date;
  created_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

interface TeamAuditEventRow {
  id: string;
  team_id: string;
  actor_account_id: string | null;
  actor_email: string | null;
  action: TeamAuditAction;
  target_type: TeamAuditTargetType;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

interface TeamAuditExportClaimRow extends TeamAuditEventRow {
  export_id: string;
  audit_event_id: string;
  destination: 'webhook';
  export_status: TeamAuditExportStatus;
  attempts: number;
  next_attempt_at: Date | null;
  last_attempt_at: Date | null;
  delivered_at: Date | null;
  last_error: string | null;
  export_created_at: Date;
  export_updated_at: Date;
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

interface TeamScimTokenRow {
  id: string;
  team_id: string;
  display_name: string;
  token_prefix: string;
  created_by_account_id: string | null;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  expires_at: Date | null;
}

interface TeamScimIdentityRow {
  token_id: string;
  team_id: string;
  token_prefix: string;
  display_name: string;
}

interface TeamScimUserRow {
  id: string;
  team_id: string;
  external_id: string;
  account_id: string;
  user_name: string;
  display_name: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  deactivated_at: Date | null;
}

interface AccountProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  status: AccountProfileResponse['status'];
}

interface TeamSettingsRow {
  team_id: string;
  team_name: string;
  plan: TeamSettingsRecord['plan'];
  role: DatabaseTeamRole;
  updated_at: Date;
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
  evidence_hash: string;
  created_at: Date;
}

interface InvoiceArtifactBlobRow {
  id: string;
  reconciliation_id: string;
  artifact_id: string;
  team_id: string | null;
  file_name: string;
  mime_type: string;
  content_sha256: string;
  content_size_bytes: number;
  content: Buffer | null;
  uploaded_by_account_id: string | null;
  uploaded_at: Date;
  storage_backend: InvoiceArtifactStorageBackend;
  kms_key_reference: string | null;
  retention_until: Date;
  legal_hold: boolean;
  malware_scan_status: 'passed' | 'failed';
  malware_scan_engine: string;
  malware_scan_checked_at: Date;
  malware_scan_finding: string | null;
  object_store_bucket: string | null;
  object_store_region: string | null;
  object_store_key: string | null;
  object_store_uri: string | null;
  object_store_etag: string | null;
  object_store_version: string | null;
  provider_retention_proof_status: Extract<
    InvoiceArtifactProviderRetentionProof['status'],
    'declared' | 'provider-verified'
  > | null;
  provider_retention_proof_evidence_source: Exclude<
    InvoiceArtifactProviderRetentionProof['evidenceSource'],
    'not-required'
  > | null;
  provider_retention_proof_checked_at: Date | null;
  provider_retention_proof_retention_mode:
    InvoiceArtifactProviderRetentionProof['retentionMode'] | null;
  provider_retention_proof_reference: string | null;
  provider_retention_proof_sha256: string | null;
  provider_retention_proof_caveats: unknown;
}

interface InvoiceArtifactRetentionSummaryRow {
  expired_candidates: string;
  legal_hold_skipped: string;
}

interface InvoiceArtifactBlobDeletionCandidateRow {
  id: string;
  storage_backend: InvoiceArtifactStorageBackend;
  object_store_bucket: string | null;
  object_store_region: string | null;
  object_store_key: string | null;
  object_store_uri: string | null;
  object_store_version: string | null;
}

export interface InvoiceArtifactBlobDeletionCandidate {
  id: string;
  storageBackend: InvoiceArtifactStorageBackend;
  objectStoreBucket?: string;
  objectStoreRegion?: string;
  objectStoreKey?: string;
  objectStoreUri?: string;
  objectStoreVersion?: string;
}

const PROVIDERS: ProviderId[] = ['aws', 'azure', 'gcp'];
const DATA_FRESHNESS_POLICY_HOURS = 48;

export type DataRetentionMode = 'report-only' | 'delete-expired';

export interface DataRetentionWindows {
  teamAuditEventDays: number;
  auditExportDays: number;
  comparisonAuditLogDays: number;
  accountSessionDays: number;
  exchangeRateDays: number;
  pricingEtlRunDays: number;
}

export interface DataRetentionTableResult {
  table: string;
  /** Rows currently past their retention window (independent of the row cap). */
  eligibleRows: number;
  /** Rows actually removed this run; always 0 in report-only mode. */
  deletedRows: number;
}

export interface DataRetentionSweepResult {
  mode: DataRetentionMode;
  ranAt: string;
  maxRowsPerTable: number;
  tables: DataRetentionTableResult[];
  totalEligibleRows: number;
  totalDeletedRows: number;
}
// Rows per multi-row invoice line-item insert, bounding statement size while
// collapsing a large import into a handful of round-trips.
const INVOICE_LINE_ITEM_INSERT_CHUNK_SIZE = 500;
type DatabaseTeamRole = TeamRole | 'viewer';
type TeamAuditEventInput = {
  teamId: string;
  actorAccountId?: string;
  action: TeamAuditAction;
  targetType: TeamAuditTargetType;
  targetId?: string;
  metadata?: Record<string, unknown>;
};
type TeamAuditMutationInput = Omit<TeamAuditEventInput, 'teamId'>;
export type TeamAuditExportStatus = 'pending' | 'processing' | 'delivered' | 'failed';
export interface TeamAuditExportClaimRecord {
  exportId: string;
  auditEventId: string;
  destination: 'webhook';
  status: TeamAuditExportStatus;
  attempts: number;
  auditEvent: TeamAuditEventRecord;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

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

  // Persist the comparison and its rate-level audit log atomically. On the pool
  // these ran as two autocommits, so a crash between them left a saved
  // comparison with no audit trail (DB-3). Callers that need durability should
  // use this instead of the two methods separately.
  async saveComparisonWithAuditLog(
    nwsSnapshot: NormalizedWorkloadSpec,
    resultSnapshot: ComparisonResult,
  ): Promise<void> {
    await this.withTransaction(async (queryRunner) => {
      await this.saveComparison(nwsSnapshot, resultSnapshot, queryRunner);
      await this.recordComparisonAuditLog(resultSnapshot, queryRunner);
    });
  }

  async saveComparison(
    nwsSnapshot: NormalizedWorkloadSpec,
    resultSnapshot: ComparisonResult,
    runner?: PgQueryRunner,
  ): Promise<void> {
    const queryRunner = runner ?? (await this.getPool());
    await queryRunner.query(
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

  async recordComparisonAuditLog(
    resultSnapshot: ComparisonResult,
    runner?: PgQueryRunner,
  ): Promise<void> {
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

    const queryRunner = runner ?? (await this.getPool());
    await queryRunner.query(
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
      const mockRows = toCount(cacheRow?.mock_catalog_rows);
      const seededRows = toCount(cacheRow?.seeded_catalog_rows);
      const provenance = catalogProvenance(catalogRows, mockRows, seededRows);
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
      const provenanceMessage =
        provenance === 'live' || provenance === 'unknown'
          ? message
          : `${message} NOTE: this pricing is ${provenanceLabel(provenance)}, not live ${provider.providerId.toUpperCase()} data — recency does not imply real prices. Do not use for production cost decisions until USE_MOCK_PROVIDERS=false and the pricing ETL has run with provider credentials.`;

      return {
        ...provider,
        freshness,
        provenance,
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
        message: provenanceMessage,
      };
    });
    const freshnessAlerts = providers
      .filter((provider) => provider.freshness !== 'fresh')
      .map((provider) => ({
        providerId: provider.providerId,
        severity:
          provider.freshness === 'failed' || provider.freshness === 'missing'
            ? ('critical' as const)
            : ('warning' as const),
        message: provider.message,
      }));
    // Non-live pricing is a distinct, always-surfaced warning: without it the
    // badge could read "fresh" while serving mock/seed data. This is the fix for
    // the freshness-vs-authenticity gap.
    const provenanceAlerts = providers
      .filter(
        (provider) =>
          provider.provenance === 'mock' ||
          provider.provenance === 'seeded' ||
          provider.provenance === 'mixed',
      )
      .map((provider) => ({
        providerId: provider.providerId,
        severity: 'warning' as const,
        message: `${provider.providerId.toUpperCase()} is serving ${provenanceLabel(
          provider.provenance,
        )} — not live provider pricing. Set USE_MOCK_PROVIDERS=false and run the pricing ETL with credentials before using these numbers for real decisions.`,
      }));
    const alerts = [...freshnessAlerts, ...provenanceAlerts];
    const dataProvenance = rollUpProvenance(providers.map((provider) => provider.provenance));
    const usesNonLivePricing =
      dataProvenance === 'mock' || dataProvenance === 'seeded' || dataProvenance === 'mixed';
    const overallStatus = alerts.some((alert) => alert.severity === 'critical')
      ? 'degraded'
      : alerts.length > 0
        ? 'stale'
        : 'fresh';

    return {
      generatedAt: now.toISOString(),
      freshnessPolicyHours: DATA_FRESHNESS_POLICY_HOURS,
      overallStatus,
      dataProvenance,
      usesNonLivePricing,
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
                 COUNT(*) FILTER (WHERE sync_status = 'failed') AS catalog_failed_rows,
                 COUNT(*) FILTER (
                   WHERE COALESCE(source_endpoint, '') LIKE 'fixture://%'
                      OR COALESCE(attributes->>'source', '') = 'mock_provider'
                 ) AS mock_catalog_rows,
                 COUNT(*) FILTER (
                   WHERE COALESCE(attributes->>'source', '') = 'local_seed'
                 ) AS seeded_catalog_rows
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
               COALESCE(catalog.mock_catalog_rows, 0) AS mock_catalog_rows,
               COALESCE(catalog.seeded_catalog_rows, 0) AS seeded_catalog_rows,
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

  async listAlerts(workloadId: string): Promise<AlertRecord[]> {
    // Always scoped to a single workload id. There is no global-list branch: an
    // omitted workloadId must never return every workload's alerts.
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
        WHERE workload_id = $1::uuid
        ORDER BY triggered_at DESC
      `,
      [workloadId],
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
    return this.withTransaction(async (pool) => {
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
    });
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

  async upsertExternalAccountForTeam(input: {
    email: string;
    displayName?: string;
    authProvider: 'oidc' | 'saml';
    externalSubjectHash: string;
    teamId: string;
    defaultRole: Exclude<TeamRole, 'owner'>;
  }): Promise<AccountSessionPrincipal | undefined> {
    return this.withTransaction(async (pool) => {
      const existing = await pool.query<AccountProfileRow>(
        `
          SELECT id,
                 email,
                 display_name,
                 status
          FROM accounts
          WHERE lower(email) = lower($1)
          FOR UPDATE
        `,
        [input.email],
      );
      let account = existing.rows[0];

      if (account?.status === 'disabled') {
        return undefined;
      }

      if (!account) {
        const inserted = await pool.query<AccountProfileRow>(
          `
            INSERT INTO accounts (
              email,
              display_name,
              auth_provider,
              external_subject_hash
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id,
                      email,
                      display_name,
                      status
          `,
          [input.email, input.displayName ?? null, input.authProvider, input.externalSubjectHash],
        );
        account = inserted.rows[0];
      } else if (input.displayName && !account.display_name) {
        const updated = await pool.query<AccountProfileRow>(
          `
            UPDATE accounts
            SET display_name = $2,
                updated_at = now()
            WHERE id = $1
            RETURNING id,
                      email,
                      display_name,
                      status
          `,
          [account.id, input.displayName],
        );
        account = updated.rows[0];
      }

      await pool.query(
        `
          INSERT INTO team_memberships (
            team_id,
            account_id,
            role,
            last_active_at
          )
          VALUES ($1, $2, $3, now())
          ON CONFLICT (team_id, account_id)
          DO UPDATE SET
            last_active_at = EXCLUDED.last_active_at
        `,
        [input.teamId, account.id, input.defaultRole],
      );

      const principal = await pool.query<AccountSessionPrincipalRow>(
        `
          SELECT accounts.id AS account_id,
                 accounts.email,
                 accounts.display_name,
                 accounts.status,
                 teams.id AS team_id,
                 teams.name AS team_name,
                 team_memberships.role
          FROM accounts
          JOIN team_memberships
            ON team_memberships.account_id = accounts.id
           AND team_memberships.team_id = $2
          JOIN teams
            ON teams.id = team_memberships.team_id
          WHERE accounts.id = $1
          LIMIT 1
        `,
        [account.id, input.teamId],
      );

      return principal.rows[0] ? toAccountSessionPrincipal(principal.rows[0]) : undefined;
    });
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

  async updateAccountProfile(input: {
    accountId: string;
    email: string;
    displayName?: string;
    externalSubjectHash: string;
  }): Promise<AccountProfileResponse | undefined> {
    const result = await (
      await this.getPool()
    ).query<AccountProfileRow>(
      `
        UPDATE accounts
        SET email = $2,
            display_name = $3,
            external_subject_hash = CASE
              WHEN auth_provider = 'local' THEN $4
              ELSE external_subject_hash
            END,
            updated_at = now()
        WHERE id = $1
          AND status = 'active'
        RETURNING id,
                  email,
                  display_name,
                  status
      `,
      [input.accountId, input.email, input.displayName ?? null, input.externalSubjectHash],
    );

    return result.rows[0] ? toAccountProfileResponse(result.rows[0]) : undefined;
  }

  async updateAccountPassword(input: {
    accountId: string;
    passwordHash: string;
    changedAt: string;
  }): Promise<boolean> {
    const result = await (
      await this.getPool()
    ).query(
      `
        UPDATE account_password_credentials
        SET password_hash = $2,
            password_changed_at = $3,
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = now()
        WHERE account_id = $1
      `,
      [input.accountId, input.passwordHash, input.changedAt],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deactivateAccount(input: {
    accountId: string;
    deactivatedAt: string;
  }): Promise<AccountProfileResponse | undefined> {
    return this.withTransaction(async (pool) => {
      await pool.query(
        `
          UPDATE account_sessions
          SET revoked_at = $2
          WHERE account_id = $1
            AND revoked_at IS NULL
        `,
        [input.accountId, input.deactivatedAt],
      );

      const result = await pool.query<AccountProfileRow>(
        `
          UPDATE accounts
          SET status = 'disabled',
              updated_at = now()
          WHERE id = $1
            AND status = 'active'
          RETURNING id,
                    email,
                    display_name,
                    status
        `,
        [input.accountId],
      );

      return result.rows[0] ? toAccountProfileResponse(result.rows[0]) : undefined;
    });
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

  async listAccountSessions(
    accountId: string,
    currentSessionId: string,
    now: string,
  ): Promise<AccountSessionRecord[]> {
    const result = await (
      await this.getPool()
    ).query<AccountSessionListRow>(
      `
        SELECT id AS session_id,
               created_at,
               last_seen_at,
               expires_at,
               revoked_at,
               user_agent_hash IS NOT NULL AS has_user_agent,
               ip_hash IS NOT NULL AS has_ip
        FROM account_sessions
        WHERE account_id = $1
          AND (
            revoked_at IS NULL
            OR id = $2
          )
          AND expires_at > $3
        ORDER BY last_seen_at DESC,
                 created_at DESC
      `,
      [accountId, currentSessionId, now],
    );

    return result.rows.map((row) => ({
      id: row.session_id,
      current: row.session_id === currentSessionId,
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
      hasUserAgent: row.has_user_agent,
      hasIp: row.has_ip,
    }));
  }

  async revokeOtherSessions(input: {
    accountId: string;
    currentSessionId: string;
    revokedAt: string;
  }): Promise<number> {
    const result = await (
      await this.getPool()
    ).query(
      `
        UPDATE account_sessions
        SET revoked_at = $3
        WHERE account_id = $1
          AND id <> $2
          AND revoked_at IS NULL
      `,
      [input.accountId, input.currentSessionId, input.revokedAt],
    );

    return result.rowCount ?? 0;
  }

  async updateSessionTeam(input: {
    sessionId: string;
    accountId: string;
    teamId: string;
    now: string;
  }): Promise<TeamSwitchResponse | undefined> {
    const result = await (
      await this.getPool()
    ).query<TeamSwitchRow>(
      `
        WITH membership AS (
          SELECT team_memberships.team_id,
                 teams.name AS team_name,
                 team_memberships.role
          FROM team_memberships
          JOIN teams
            ON teams.id = team_memberships.team_id
          WHERE team_memberships.account_id = $2
            AND team_memberships.team_id = $3
          LIMIT 1
        ),
        updated_session AS (
          UPDATE account_sessions
          SET team_id = membership.team_id,
              last_seen_at = $4
          FROM membership
          WHERE account_sessions.id = $1
            AND account_sessions.account_id = $2
            AND account_sessions.revoked_at IS NULL
            AND account_sessions.expires_at > $4
          RETURNING account_sessions.id AS session_id,
                    account_sessions.account_id,
                    account_sessions.team_id,
                    account_sessions.expires_at,
                    membership.team_name,
                    membership.role
        )
        SELECT session_id,
               team_id,
               team_name,
               role,
               expires_at
        FROM updated_session
      `,
      [input.sessionId, input.accountId, input.teamId, input.now],
    );
    const row = result.rows[0];

    if (!row || !row.team_id || !row.team_name || !row.role) {
      return undefined;
    }

    return {
      activeTeam: {
        id: row.team_id,
        name: row.team_name,
        role: normalizeDatabaseTeamRole(row.role),
      },
      session: {
        id: row.session_id,
        expiresAt: row.expires_at.toISOString(),
      },
    };
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

  async createTeamForAccount(input: {
    accountId: string;
    teamName: string;
    teamSlug: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamSettingsRecord> {
    return this.withTransaction(async (pool) => {
      const teamResult = await pool.query<TeamSettingsRow>(
        `
          WITH created_team AS (
            INSERT INTO teams (
              owner_account_id,
              slug,
              name
            )
            VALUES ($1, $2, $3)
            RETURNING id,
                      name,
                      plan,
                      updated_at
          ),
          created_membership AS (
            INSERT INTO team_memberships (
              team_id,
              account_id,
              role
            )
            SELECT id,
                   $1,
                   'owner'
            FROM created_team
            RETURNING team_id,
                      role
          )
          SELECT created_team.id AS team_id,
                 created_team.name AS team_name,
                 created_team.plan,
                 created_membership.role,
                 created_team.updated_at
          FROM created_team
          JOIN created_membership
            ON created_membership.team_id = created_team.id
        `,
        [input.accountId, input.teamSlug, input.teamName],
      );
      const row = teamResult.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: row.team_id,
          ...input.audit,
          targetId: input.audit.targetId ?? row.team_id,
        });
      }

      return toTeamSettingsRecord(row);
    });
  }

  async updateTeamSettings(input: {
    teamId: string;
    teamName: string;
    actorAccountId: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamSettingsRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamSettingsRow>(
        `
          WITH updated_team AS (
            UPDATE teams
            SET name = $2,
                updated_at = now()
            WHERE id = $1
            RETURNING id,
                      name,
                      plan,
                      updated_at
          )
          SELECT updated_team.id AS team_id,
                 updated_team.name AS team_name,
                 updated_team.plan,
                 team_memberships.role,
                 updated_team.updated_at
          FROM updated_team
          JOIN team_memberships
            ON team_memberships.team_id = updated_team.id
           AND team_memberships.account_id = $3
        `,
        [input.teamId, input.teamName, input.actorAccountId],
      );
      const row = result.rows[0];

      if (row && input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.team_id,
        });
      }

      return row ? toTeamSettingsRecord(row) : undefined;
    });
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
    audit?: TeamAuditMutationInput;
  }): Promise<TeamInvitationRecord> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamInvitationRow>(
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
      const row = result.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            email: row.email,
            role: normalizeInvitableDatabaseRole(row.role),
            status: row.status,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toTeamInvitationRecord(row);
    });
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

  async recordTeamAuditEvent(input: TeamAuditEventInput): Promise<TeamAuditEventRecord> {
    // The audit-event insert and its export-outbox enqueue must commit atomically:
    // on the raw pool they ran as two autocommits, so a crash (or a failed outbox
    // insert) between them left a logged compliance event that would never be
    // exported to the webhook. Wrap both in a single transaction.
    return this.withTransaction((queryRunner) => this.insertTeamAuditEvent(queryRunner, input));
  }

  private async insertTeamAuditEvent(
    queryRunner: PgQueryRunner,
    input: TeamAuditEventInput,
  ): Promise<TeamAuditEventRecord> {
    const result = await queryRunner.query<TeamAuditEventRow>(
      `
        INSERT INTO team_audit_events (
          team_id,
          actor_account_id,
          action,
          target_type,
          target_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id,
                  team_id,
                  actor_account_id,
                  NULL::text AS actor_email,
                  action,
                  target_type,
                  target_id,
                  metadata,
                  created_at
      `,
      [
        input.teamId,
        input.actorAccountId ?? null,
        input.action,
        input.targetType,
        input.targetId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const record = toTeamAuditEventRecord(result.rows[0]);

    if (this.configService.get('AUTH_AUDIT_EXPORT_MODE', { infer: true }) === 'webhook') {
      await this.enqueueTeamAuditExport(queryRunner, record.id);
    }

    return record;
  }

  private async enqueueTeamAuditExport(
    queryRunner: PgQueryRunner,
    auditEventId: string,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO team_audit_event_exports (
          audit_event_id,
          destination,
          status
        )
        VALUES ($1, 'webhook', 'pending')
        ON CONFLICT (audit_event_id, destination)
        DO NOTHING
      `,
      [auditEventId],
    );
  }

  async listTeamAuditEvents(teamId: string, limit = 25): Promise<TeamAuditEventRecord[]> {
    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 25;
    const boundedLimit = Math.min(Math.max(normalizedLimit, 1), 100);
    const result = await (
      await this.getPool()
    ).query<TeamAuditEventRow>(
      `
        SELECT team_audit_events.id,
               team_audit_events.team_id,
               team_audit_events.actor_account_id,
               accounts.email AS actor_email,
               team_audit_events.action,
               team_audit_events.target_type,
               team_audit_events.target_id,
               team_audit_events.metadata,
               team_audit_events.created_at
        FROM team_audit_events
        LEFT JOIN accounts
          ON accounts.id = team_audit_events.actor_account_id
        WHERE team_audit_events.team_id = $1
        ORDER BY team_audit_events.created_at DESC,
                 team_audit_events.id DESC
        LIMIT $2
      `,
      [teamId, boundedLimit],
    );

    return result.rows.map(toTeamAuditEventRecord);
  }

  async claimPendingTeamAuditExports(input: {
    now: string;
    limit: number;
    maxAttempts: number;
  }): Promise<TeamAuditExportClaimRecord[]> {
    const result = await (
      await this.getPool()
    ).query<TeamAuditExportClaimRow>(
      `
        WITH selected_exports AS (
          SELECT id
          FROM team_audit_event_exports
          WHERE destination = 'webhook'
            AND (
              status = 'pending'
              OR (
                status = 'processing'
                AND last_attempt_at <= ($1::timestamptz - interval '15 minutes')
              )
            )
            AND next_attempt_at <= $1
            AND attempts < $2
          ORDER BY created_at ASC,
                   id ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        ),
        claimed_exports AS (
          UPDATE team_audit_event_exports
          SET status = 'processing',
              attempts = attempts + 1,
              last_attempt_at = $1,
              last_error = NULL,
              updated_at = now()
          FROM selected_exports
          WHERE team_audit_event_exports.id = selected_exports.id
          RETURNING team_audit_event_exports.id AS export_id,
                    team_audit_event_exports.audit_event_id,
                    team_audit_event_exports.destination,
                    team_audit_event_exports.status AS export_status,
                    team_audit_event_exports.attempts,
                    team_audit_event_exports.next_attempt_at,
                    team_audit_event_exports.last_attempt_at,
                    team_audit_event_exports.delivered_at,
                    team_audit_event_exports.last_error,
                    team_audit_event_exports.created_at AS export_created_at,
                    team_audit_event_exports.updated_at AS export_updated_at
        )
        SELECT claimed_exports.export_id,
               claimed_exports.audit_event_id,
               claimed_exports.destination,
               claimed_exports.export_status,
               claimed_exports.attempts,
               claimed_exports.next_attempt_at,
               claimed_exports.last_attempt_at,
               claimed_exports.delivered_at,
               claimed_exports.last_error,
               claimed_exports.export_created_at,
               claimed_exports.export_updated_at,
               team_audit_events.id,
               team_audit_events.team_id,
               team_audit_events.actor_account_id,
               accounts.email AS actor_email,
               team_audit_events.action,
               team_audit_events.target_type,
               team_audit_events.target_id,
               team_audit_events.metadata,
               team_audit_events.created_at
        FROM claimed_exports
        JOIN team_audit_events
          ON team_audit_events.id = claimed_exports.audit_event_id
        LEFT JOIN accounts
          ON accounts.id = team_audit_events.actor_account_id
        ORDER BY claimed_exports.export_created_at ASC,
                 claimed_exports.export_id ASC
      `,
      [input.now, input.maxAttempts, Math.max(1, Math.min(input.limit, 500))],
    );

    return result.rows.map(toTeamAuditExportClaimRecord);
  }

  async markTeamAuditExportDelivered(input: {
    exportId: string;
    deliveredAt: string;
  }): Promise<void> {
    await (
      await this.getPool()
    ).query(
      `
        UPDATE team_audit_event_exports
        SET status = 'delivered',
            delivered_at = $2,
            last_error = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [input.exportId, input.deliveredAt],
    );
  }

  async markTeamAuditExportFailed(input: {
    exportId: string;
    error: string;
    nextAttemptAt: string;
    maxAttempts: number;
  }): Promise<TeamAuditExportStatus | undefined> {
    const result = await (
      await this.getPool()
    ).query<{ status: TeamAuditExportStatus }>(
      `
        UPDATE team_audit_event_exports
        SET status = CASE
              WHEN attempts >= $4 THEN 'failed'
              ELSE 'pending'
            END,
            next_attempt_at = CASE
              WHEN attempts >= $4 THEN next_attempt_at
              ELSE $3
            END,
            last_error = left($2, 500),
            updated_at = now()
        WHERE id = $1
        RETURNING status
      `,
      [input.exportId, input.error, input.nextAttemptAt, input.maxAttempts],
    );

    return result.rows[0]?.status;
  }

  async revokeTeamInvitation(input: {
    teamId: string;
    invitationId: string;
    revokedAt: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamInvitationRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamInvitationRow>(
        `
          UPDATE team_invitations
          SET status = 'revoked',
              revoked_at = $3
          WHERE team_id = $1
            AND id = $2
            AND status = 'pending'
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
        [input.teamId, input.invitationId, input.revokedAt],
      );
      const row = result.rows[0];

      if (row && input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            email: row.email,
            role: normalizeInvitableDatabaseRole(row.role),
            status: row.status,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return row ? toTeamInvitationRecord(row) : undefined;
    });
  }

  async resendTeamInvitation(input: {
    teamId: string;
    invitationId: string;
    tokenHash: string;
    invitedByAccountId: string;
    expiresAt: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamInvitationRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamInvitationRow>(
        `
          UPDATE team_invitations
          SET token_hash = $3,
              invited_by_account_id = $4,
              expires_at = $5,
              created_at = now(),
              revoked_at = NULL
          WHERE team_id = $1
            AND id = $2
            AND status = 'pending'
          RETURNING id,
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
        `,
        [
          input.teamId,
          input.invitationId,
          input.tokenHash,
          input.invitedByAccountId,
          input.expiresAt,
        ],
      );
      const row = result.rows[0];

      if (row && input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            email: row.email,
            role: normalizeInvitableDatabaseRole(row.role),
            status: row.status,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return row ? toTeamInvitationRecord(row) : undefined;
    });
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

  async findInvitationByTokenHash(tokenHash: string): Promise<TeamInvitationRecord | undefined> {
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
        LIMIT 1
      `,
      [tokenHash],
    );

    return result.rows[0] ? toTeamInvitationRecord(result.rows[0]) : undefined;
  }

  async acceptTeamInvitation(input: {
    invitationId: string;
    accountId: string;
    acceptedAt: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamInvitationRecord> {
    return this.withTransaction(async (pool) => {
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
      const acceptedRow = accepted.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: acceptedRow.team_id,
          ...input.audit,
          targetId: input.audit.targetId ?? acceptedRow.id,
          metadata: {
            email: acceptedRow.email,
            role: normalizeInvitableDatabaseRole(acceptedRow.role),
            status: acceptedRow.status,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toTeamInvitationRecord(acceptedRow);
    });
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
    audit?: TeamAuditMutationInput;
  }): Promise<TeamMemberRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamMemberRow>(
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
      const row = result.rows[0];

      if (row && input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.account_id,
          metadata: {
            email: row.email,
            toRole: normalizeDatabaseTeamRole(row.role),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return row ? toTeamMemberRecord(row) : undefined;
    });
  }

  async removeTeamMember(input: {
    teamId: string;
    accountId: string;
    audit?: TeamAuditMutationInput;
  }): Promise<boolean> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<{ account_id: string; role: DatabaseTeamRole }>(
        `
          DELETE FROM team_memberships
          WHERE team_id = $1
            AND account_id = $2
          RETURNING account_id,
                    role
        `,
        [input.teamId, input.accountId],
      );
      const row = result.rows[0];

      if (row && input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.account_id,
          metadata: {
            role: normalizeDatabaseTeamRole(row.role),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return Boolean(row);
    });
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

  async upsertSsoProviderConfig(input: {
    teamId: string;
    providerType: 'oidc' | 'saml';
    displayName: string;
    issuerUrl: string;
    clientIdHint?: string;
    createdByAccountId: string;
    audit?: TeamAuditMutationInput;
  }): Promise<SsoConfigurationStatus['configuredProviders'][number]> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<SsoProviderConfigRow>(
        `
          INSERT INTO sso_identity_provider_configs (
            team_id,
            provider_type,
            display_name,
            issuer_url,
            client_id_hint,
            created_by_account_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (team_id, provider_type, issuer_url)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            client_id_hint = EXCLUDED.client_id_hint,
            status = 'configured',
            updated_at = now()
          RETURNING provider_type,
                    display_name,
                    issuer_url,
                    status
        `,
        [
          input.teamId,
          input.providerType,
          input.displayName,
          input.issuerUrl,
          input.clientIdHint ?? null,
          input.createdByAccountId,
        ],
      );
      const row = result.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? `${row.provider_type}:${row.issuer_url}`,
          metadata: {
            providerType: row.provider_type,
            displayName: row.display_name,
            issuerUrl: row.issuer_url,
            status: row.status,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return {
        providerType: row.provider_type,
        displayName: row.display_name,
        issuerUrl: row.issuer_url,
        status: row.status,
      };
    });
  }

  async createTeamScimToken(input: {
    teamId: string;
    displayName: string;
    tokenHash: string;
    tokenPrefix: string;
    createdByAccountId: string;
    expiresAt?: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamScimTokenRecord> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamScimTokenRow>(
        `
          INSERT INTO team_scim_tokens (
            team_id,
            display_name,
            token_hash,
            token_prefix,
            created_by_account_id,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id,
                    team_id,
                    display_name,
                    token_prefix,
                    created_by_account_id,
                    created_at,
                    last_used_at,
                    revoked_at,
                    expires_at
        `,
        [
          input.teamId,
          input.displayName,
          input.tokenHash,
          input.tokenPrefix,
          input.createdByAccountId,
          input.expiresAt ?? null,
        ],
      );
      const row = result.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            displayName: row.display_name,
            tokenPrefix: row.token_prefix,
            ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toTeamScimTokenRecord(row);
    });
  }

  async listTeamScimTokens(teamId: string): Promise<TeamScimTokenRecord[]> {
    const result = await (
      await this.getPool()
    ).query<TeamScimTokenRow>(
      `
        SELECT id,
               team_id,
               display_name,
               token_prefix,
               created_by_account_id,
               created_at,
               last_used_at,
               revoked_at,
               expires_at
        FROM team_scim_tokens
        WHERE team_id = $1
        ORDER BY created_at DESC,
                 id DESC
      `,
      [teamId],
    );

    return result.rows.map(toTeamScimTokenRecord);
  }

  async revokeTeamScimToken(input: {
    teamId: string;
    tokenId: string;
    revokedAt: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamScimTokenRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamScimTokenRow>(
        `
          UPDATE team_scim_tokens
          SET revoked_at = $3
          WHERE team_id = $1
            AND id = $2
            AND revoked_at IS NULL
          RETURNING id,
                    team_id,
                    display_name,
                    token_prefix,
                    created_by_account_id,
                    created_at,
                    last_used_at,
                    revoked_at,
                    expires_at
        `,
        [input.teamId, input.tokenId, input.revokedAt],
      );
      const row = result.rows[0];

      if (row && input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            displayName: row.display_name,
            tokenPrefix: row.token_prefix,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return row ? toTeamScimTokenRecord(row) : undefined;
    });
  }

  async resolveTeamScimToken(input: {
    tokenHash: string;
    now: string;
  }): Promise<TeamScimIdentity | undefined> {
    const result = await (
      await this.getPool()
    ).query<TeamScimIdentityRow>(
      `
        WITH resolved_token AS (
          UPDATE team_scim_tokens
          SET last_used_at = $2
          WHERE token_hash = $1
            AND revoked_at IS NULL
            AND (
              expires_at IS NULL
              OR expires_at > $2
            )
          RETURNING id,
                    team_id,
                    token_prefix,
                    display_name
        )
        SELECT id AS token_id,
               team_id,
               token_prefix,
               display_name
        FROM resolved_token
      `,
      [input.tokenHash, input.now],
    );
    const row = result.rows[0];

    return row
      ? {
          teamId: row.team_id,
          tokenId: row.token_id,
          tokenPrefix: row.token_prefix,
          displayName: row.display_name,
        }
      : undefined;
  }

  async listTeamScimUsers(teamId: string): Promise<TeamScimUserRecord[]> {
    const result = await (
      await this.getPool()
    ).query<TeamScimUserRow>(
      `
        SELECT id,
               team_id,
               external_id,
               account_id,
               user_name,
               display_name,
               active,
               created_at,
               updated_at,
               deactivated_at
        FROM team_scim_external_users
        WHERE team_id = $1
        ORDER BY user_name ASC
      `,
      [teamId],
    );

    return result.rows.map(toTeamScimUserRecord);
  }

  async getTeamScimUser(input: {
    teamId: string;
    userId: string;
  }): Promise<TeamScimUserRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<TeamScimUserRow>(
      `
        SELECT id,
               team_id,
               external_id,
               account_id,
               user_name,
               display_name,
               active,
               created_at,
               updated_at,
               deactivated_at
        FROM team_scim_external_users
        WHERE team_id = $1
          AND id = $2
        LIMIT 1
      `,
      [input.teamId, input.userId],
    );

    return result.rows[0] ? toTeamScimUserRecord(result.rows[0]) : undefined;
  }

  async upsertTeamScimUser(input: {
    teamId: string;
    externalId: string;
    externalSubjectHash: string;
    userName: string;
    displayName?: string;
    active: boolean;
    rawProfile: Record<string, unknown>;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamScimUserRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const existing = await pool.query<AccountProfileRow>(
        `
          SELECT id,
                 email,
                 display_name,
                 status
          FROM accounts
          WHERE lower(email) = lower($1)
          FOR UPDATE
        `,
        [input.userName],
      );
      let account = existing.rows[0];

      if (account?.status === 'disabled' && input.active) {
        return undefined;
      }

      if (!account) {
        const inserted = await pool.query<AccountProfileRow>(
          `
            INSERT INTO accounts (
              email,
              display_name,
              auth_provider,
              external_subject_hash
            )
            VALUES ($1, $2, 'saml', $3)
            RETURNING id,
                      email,
                      display_name,
                      status
          `,
          [input.userName, input.displayName ?? null, input.externalSubjectHash],
        );
        account = inserted.rows[0];
      } else if (input.displayName && input.displayName !== account.display_name) {
        const updated = await pool.query<AccountProfileRow>(
          `
            UPDATE accounts
            SET display_name = $2,
                updated_at = now()
            WHERE id = $1
            RETURNING id,
                      email,
                      display_name,
                      status
          `,
          [account.id, input.displayName],
        );
        account = updated.rows[0];
      }

      if (input.active) {
        await pool.query(
          `
            INSERT INTO team_memberships (
              team_id,
              account_id,
              role,
              last_active_at
            )
            VALUES ($1, $2, 'member', now())
            ON CONFLICT (team_id, account_id)
            DO UPDATE SET
              last_active_at = EXCLUDED.last_active_at
          `,
          [input.teamId, account.id],
        );
      } else {
        await pool.query(
          `
            DELETE FROM team_memberships
            WHERE team_id = $1
              AND account_id = $2
          `,
          [input.teamId, account.id],
        );
      }

      const result = await pool.query<TeamScimUserRow>(
        `
          INSERT INTO team_scim_external_users (
            team_id,
            external_id,
            account_id,
            user_name,
            display_name,
            active,
            raw_profile,
            deactivated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CASE WHEN $6 THEN NULL ELSE now() END)
          ON CONFLICT (team_id, external_id)
          DO UPDATE SET
            account_id = EXCLUDED.account_id,
            user_name = EXCLUDED.user_name,
            display_name = EXCLUDED.display_name,
            active = EXCLUDED.active,
            raw_profile = EXCLUDED.raw_profile,
            updated_at = now(),
            deactivated_at = CASE
              WHEN EXCLUDED.active THEN NULL
              ELSE COALESCE(team_scim_external_users.deactivated_at, now())
            END
          RETURNING id,
                    team_id,
                    external_id,
                    account_id,
                    user_name,
                    display_name,
                    active,
                    created_at,
                    updated_at,
                    deactivated_at
        `,
        [
          input.teamId,
          input.externalId,
          account.id,
          input.userName,
          input.displayName ?? null,
          input.active,
          JSON.stringify(input.rawProfile),
        ],
      );
      const row = result.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            externalId: row.external_id,
            userName: row.user_name,
            active: row.active,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toTeamScimUserRecord(row);
    });
  }

  async deactivateTeamScimUser(input: {
    teamId: string;
    userId: string;
    audit?: TeamAuditMutationInput;
  }): Promise<TeamScimUserRecord | undefined> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<TeamScimUserRow>(
        `
          UPDATE team_scim_external_users
          SET active = false,
              updated_at = now(),
              deactivated_at = COALESCE(deactivated_at, now())
          WHERE team_id = $1
            AND id = $2
          RETURNING id,
                    team_id,
                    external_id,
                    account_id,
                    user_name,
                    display_name,
                    active,
                    created_at,
                    updated_at,
                    deactivated_at
        `,
        [input.teamId, input.userId],
      );
      const row = result.rows[0];

      if (!row) {
        return undefined;
      }

      await pool.query(
        `
          DELETE FROM team_memberships
          WHERE team_id = $1
            AND account_id = $2
        `,
        [input.teamId, row.account_id],
      );

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          teamId: input.teamId,
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            externalId: row.external_id,
            userName: row.user_name,
            active: false,
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toTeamScimUserRecord(row);
    });
  }

  async createBillingImport(input: {
    importInput: BillingImportInput;
    originalFileSha256: string;
    teamId?: string;
    createdByAccountId?: string;
    rows: Array<BillingImportRowInput & { lineItemHash: string }>;
    audit?: TeamAuditMutationInput;
  }): Promise<{
    importRun: BillingImportRecord;
    lineItems: InvoiceLineItemRecord[];
  }> {
    const importedLineItems: InvoiceLineItemRecord[] = [];

    return this.withTransaction(async (pool) => {
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

      // Deduplicate by hash within the batch, keeping the first occurrence. The
      // old per-row loop relied on ON CONFLICT DO NOTHING seeing the first insert
      // in-transaction to drop later duplicates; a single multi-row insert cannot
      // conflict against its own not-yet-visible rows, so the dedup is done here
      // instead. The import_run_id is brand new, so there are no pre-existing rows
      // to conflict with — only these intra-batch duplicates.
      const seenLineItemHashes = new Set<string>();
      const dedupedRows = input.rows.filter((row) => {
        if (seenLineItemHashes.has(row.lineItemHash)) {
          return false;
        }
        seenLineItemHashes.add(row.lineItemHash);
        return true;
      });

      const insertedRowsByHash = new Map<string, InvoiceLineItemRow>();

      for (
        let offset = 0;
        offset < dedupedRows.length;
        offset += INVOICE_LINE_ITEM_INSERT_CHUNK_SIZE
      ) {
        const chunk = dedupedRows.slice(offset, offset + INVOICE_LINE_ITEM_INSERT_CHUNK_SIZE);
        const payload = chunk.map((row) => ({
          import_run_id: importRunId,
          team_id: input.teamId ?? null,
          provider: input.importInput.provider,
          billing_period_start: input.importInput.billingPeriodStart,
          billing_period_end: input.importInput.billingPeriodEnd,
          usage_start: row.usageStart ?? null,
          usage_end: row.usageEnd ?? null,
          service_name: row.serviceName,
          sku_id: row.skuId ?? null,
          region: row.region ?? null,
          resource_id: row.resourceId ?? null,
          usage_quantity: row.usageQuantity ?? null,
          usage_unit: row.usageUnit ?? null,
          cost_usd: row.costUsd,
          currency: row.currency ?? 'USD',
          tags: row.tags ?? {},
          raw_payload: row.rawPayload ?? {},
          line_item_hash: row.lineItemHash,
        }));

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
            SELECT import_run_id,
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
            FROM jsonb_to_recordset($1::jsonb) AS incoming(
              import_run_id UUID,
              team_id UUID,
              provider TEXT,
              billing_period_start DATE,
              billing_period_end DATE,
              usage_start TIMESTAMPTZ,
              usage_end TIMESTAMPTZ,
              service_name TEXT,
              sku_id TEXT,
              region TEXT,
              resource_id TEXT,
              usage_quantity NUMERIC,
              usage_unit TEXT,
              cost_usd NUMERIC,
              currency TEXT,
              tags JSONB,
              raw_payload JSONB,
              line_item_hash TEXT
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
          [JSON.stringify(payload)],
        );

        for (const insertedRow of inserted.rows) {
          insertedRowsByHash.set(insertedRow.line_item_hash, insertedRow);
        }
      }

      // Preserve input order and inserted-only semantics: emit a record for each
      // deduped row that was actually written (RETURNING row order is not
      // guaranteed, so match back by hash).
      for (const row of dedupedRows) {
        const insertedRow = insertedRowsByHash.get(row.lineItemHash);
        if (insertedRow) {
          importedLineItems.push(toInvoiceLineItemRecord(insertedRow));
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
      const finalImportRow = finalImport.rows[0];

      if (input.audit && finalImportRow.team_id) {
        await this.insertTeamAuditEvent(pool, {
          teamId: finalImportRow.team_id,
          ...input.audit,
          targetId: input.audit.targetId ?? finalImportRow.id,
          metadata: {
            provider: finalImportRow.provider,
            sourceType: finalImportRow.source_type,
            rowsAccepted: finalImportRow.rows_accepted,
            rowsRejected: finalImportRow.rows_rejected,
            totalCostUsd: Number.parseFloat(finalImportRow.total_cost_usd),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return {
        importRun: toBillingImportRecord(finalImportRow),
        lineItems: importedLineItems,
      };
    });
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
    audit?: TeamAuditEventInput;
  }): Promise<InvoiceReconciliationRecord> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<InvoiceReconciliationRow>(
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
                    md5(evidence::text) AS evidence_hash,
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
      const row = result.rows[0];

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            importRunId: input.importRunId,
            comparisonId: input.comparisonId,
            provider: row.provider,
            status: row.status,
            varianceUsd: Number.parseFloat(row.variance_usd),
            variancePercent: Number.parseFloat(row.variance_percent),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toInvoiceReconciliationRecord(row);
    });
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
               md5(evidence::text) AS evidence_hash,
               created_at
        FROM invoice_reconciliation_results
        WHERE import_run_id = $1
        ORDER BY created_at DESC
      `,
      [importRunId],
    );

    return result.rows.map(toInvoiceReconciliationRecord);
  }

  async getInvoiceReconciliation(
    reconciliationId: string,
  ): Promise<InvoiceReconciliationRecord | undefined> {
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
               md5(evidence::text) AS evidence_hash,
               created_at
        FROM invoice_reconciliation_results
        WHERE id = $1
        LIMIT 1
      `,
      [reconciliationId],
    );

    return result.rows[0] ? toInvoiceReconciliationRecord(result.rows[0]) : undefined;
  }

  async updateInvoiceReconciliationEvidence(input: {
    reconciliationId: string;
    evidence: Record<string, unknown>;
    expectedEvidenceHash: string;
    audit?: TeamAuditEventInput;
  }): Promise<InvoiceReconciliationRecord> {
    return this.withTransaction(async (pool) => {
      const result = await pool.query<InvoiceReconciliationRow>(
        `
          UPDATE invoice_reconciliation_results
          SET evidence = $2::jsonb
          WHERE id = $1
            AND md5(evidence::text) = $3
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
                    md5(evidence::text) AS evidence_hash,
                    created_at
        `,
        [input.reconciliationId, JSON.stringify(input.evidence), input.expectedEvidenceHash],
      );
      const row = result.rows[0];

      if (!row) {
        // Optimistic-concurrency guard: the evidence changed since it was read
        // (or the row was removed). Fail loudly so the caller retries rather than
        // silently clobbering a concurrent write.
        throw new ApiConflictError(
          `Invoice reconciliation ${input.reconciliationId} was modified concurrently; retry the operation`,
        );
      }

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            importRunId: row.import_run_id,
            comparisonId: row.comparison_id,
            provider: row.provider,
            status: row.status,
            varianceUsd: Number.parseFloat(row.variance_usd),
            variancePercent: Number.parseFloat(row.variance_percent),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toInvoiceReconciliationRecord(row);
    });
  }

  async saveInvoiceArtifactBlobAndUpdateEvidence(input: {
    reconciliationId: string;
    artifactId: string;
    teamId?: string;
    fileName: string;
    mimeType: string;
    contentSha256: string;
    contentSizeBytes: number;
    storageBackend: InvoiceArtifactStorageBackend;
    content?: Buffer;
    objectStoreBucket?: string;
    objectStoreRegion?: string;
    objectStoreKey?: string;
    objectStoreUri?: string;
    objectStoreETag?: string;
    objectStoreVersion?: string;
    providerRetentionProof?: InvoiceArtifactProviderRetentionProof;
    uploadedByAccountId?: string;
    uploadedAt: string;
    kmsKeyReference?: string;
    retentionUntil: string;
    legalHold: boolean;
    malwareScanCheckedAt: string;
    malwareScanFinding?: string;
    evidence: Record<string, unknown>;
    expectedEvidenceHash: string;
    audit?: TeamAuditEventInput;
  }): Promise<InvoiceReconciliationRecord> {
    return this.withTransaction(async (pool) => {
      const providerRetentionProof = persistedProviderRetentionProof(input.providerRetentionProof);

      await pool.query<InvoiceArtifactBlobRow>(
        `
          INSERT INTO invoice_artifact_blobs (
            reconciliation_id,
            artifact_id,
            team_id,
            file_name,
            mime_type,
            content_sha256,
            content_size_bytes,
            content,
            uploaded_by_account_id,
            uploaded_at,
            storage_backend,
            kms_key_reference,
            retention_until,
            legal_hold,
            malware_scan_status,
            malware_scan_engine,
            malware_scan_checked_at,
            malware_scan_finding,
            object_store_bucket,
            object_store_region,
            object_store_key,
            object_store_uri,
            object_store_etag,
            object_store_version,
            provider_retention_proof_status,
            provider_retention_proof_evidence_source,
            provider_retention_proof_checked_at,
            provider_retention_proof_retention_mode,
            provider_retention_proof_reference,
            provider_retention_proof_sha256,
            provider_retention_proof_caveats
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'passed', 'polycost-eicar-signature-v1', $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29::jsonb)
          ON CONFLICT (reconciliation_id, artifact_id)
          DO UPDATE SET
            team_id = EXCLUDED.team_id,
            file_name = EXCLUDED.file_name,
            mime_type = EXCLUDED.mime_type,
            content_sha256 = EXCLUDED.content_sha256,
            content_size_bytes = EXCLUDED.content_size_bytes,
            content = EXCLUDED.content,
            uploaded_by_account_id = EXCLUDED.uploaded_by_account_id,
            uploaded_at = EXCLUDED.uploaded_at,
            storage_backend = EXCLUDED.storage_backend,
            kms_key_reference = EXCLUDED.kms_key_reference,
            -- WORM defense-in-depth (SEC-3): a re-upload may only strengthen
            -- governance, never weaken it. Retention is extended to the later of
            -- the two dates, and legal hold can only be turned on, never off,
            -- via this path (release goes through the dedicated legal-hold API).
            retention_until = GREATEST(invoice_artifact_blobs.retention_until, EXCLUDED.retention_until),
            legal_hold = invoice_artifact_blobs.legal_hold OR EXCLUDED.legal_hold,
            malware_scan_status = EXCLUDED.malware_scan_status,
            malware_scan_engine = EXCLUDED.malware_scan_engine,
            malware_scan_checked_at = EXCLUDED.malware_scan_checked_at,
            malware_scan_finding = EXCLUDED.malware_scan_finding,
            object_store_bucket = EXCLUDED.object_store_bucket,
            object_store_region = EXCLUDED.object_store_region,
            object_store_key = EXCLUDED.object_store_key,
            object_store_uri = EXCLUDED.object_store_uri,
            object_store_etag = EXCLUDED.object_store_etag,
            object_store_version = EXCLUDED.object_store_version,
            provider_retention_proof_status = EXCLUDED.provider_retention_proof_status,
            provider_retention_proof_evidence_source = EXCLUDED.provider_retention_proof_evidence_source,
            provider_retention_proof_checked_at = EXCLUDED.provider_retention_proof_checked_at,
            provider_retention_proof_retention_mode = EXCLUDED.provider_retention_proof_retention_mode,
            provider_retention_proof_reference = EXCLUDED.provider_retention_proof_reference,
            provider_retention_proof_sha256 = EXCLUDED.provider_retention_proof_sha256,
            provider_retention_proof_caveats = EXCLUDED.provider_retention_proof_caveats
        `,
        [
          input.reconciliationId,
          input.artifactId,
          input.teamId ?? null,
          input.fileName,
          input.mimeType,
          input.contentSha256,
          input.contentSizeBytes,
          input.content ?? null,
          input.uploadedByAccountId ?? null,
          input.uploadedAt,
          input.storageBackend,
          input.kmsKeyReference ?? null,
          input.retentionUntil,
          input.legalHold,
          input.malwareScanCheckedAt,
          input.malwareScanFinding ?? null,
          input.objectStoreBucket ?? null,
          input.objectStoreRegion ?? null,
          input.objectStoreKey ?? null,
          input.objectStoreUri ?? null,
          input.objectStoreETag ?? null,
          input.objectStoreVersion ?? null,
          providerRetentionProof?.status ?? null,
          providerRetentionProof?.evidenceSource ?? null,
          providerRetentionProof?.checkedAt ?? null,
          providerRetentionProof?.retentionMode ?? null,
          providerRetentionProof?.proofReference ?? null,
          providerRetentionProof?.proofDigestSha256 ?? null,
          providerRetentionProof?.caveatsJson ?? '[]',
        ],
      );
      const result = await pool.query<InvoiceReconciliationRow>(
        `
          UPDATE invoice_reconciliation_results
          SET evidence = $2::jsonb
          WHERE id = $1
            AND md5(evidence::text) = $3
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
                    md5(evidence::text) AS evidence_hash,
                    created_at
        `,
        [input.reconciliationId, JSON.stringify(input.evidence), input.expectedEvidenceHash],
      );
      const row = result.rows[0];

      if (!row) {
        // Optimistic-concurrency guard: evidence changed since it was read
        // (or the row was removed). Fail loudly so the caller retries.
        throw new ApiConflictError(
          `Invoice reconciliation ${input.reconciliationId} was modified concurrently; retry the operation`,
        );
      }

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            importRunId: row.import_run_id,
            comparisonId: row.comparison_id,
            provider: row.provider,
            status: row.status,
            varianceUsd: Number.parseFloat(row.variance_usd),
            variancePercent: Number.parseFloat(row.variance_percent),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toInvoiceReconciliationRecord(row);
    });
  }

  async updateInvoiceArtifactLegalHoldAndEvidence(input: {
    reconciliationId: string;
    artifactId: string;
    legalHold: boolean;
    evidence: Record<string, unknown>;
    expectedEvidenceHash: string;
    audit?: TeamAuditEventInput;
  }): Promise<InvoiceReconciliationRecord> {
    return this.withTransaction(async (pool) => {
      const artifactResult = await pool.query<{ id: string }>(
        `
          UPDATE invoice_artifact_blobs
          SET legal_hold = $3
          WHERE reconciliation_id = $1
            AND artifact_id = $2
          RETURNING id
        `,
        [input.reconciliationId, input.artifactId, input.legalHold],
      );

      if (!artifactResult.rows[0]) {
        throw new ApiNotFoundError(
          `Invoice artifact blob ${input.artifactId} was not found for reconciliation ${input.reconciliationId}`,
        );
      }

      const result = await pool.query<InvoiceReconciliationRow>(
        `
          UPDATE invoice_reconciliation_results
          SET evidence = $2::jsonb
          WHERE id = $1
            AND md5(evidence::text) = $3
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
                    md5(evidence::text) AS evidence_hash,
                    created_at
        `,
        [input.reconciliationId, JSON.stringify(input.evidence), input.expectedEvidenceHash],
      );
      const row = result.rows[0];

      if (!row) {
        // Optimistic-concurrency guard: evidence changed since it was read
        // (or the row was removed). Fail loudly so the caller retries.
        throw new ApiConflictError(
          `Invoice reconciliation ${input.reconciliationId} was modified concurrently; retry the operation`,
        );
      }

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            importRunId: row.import_run_id,
            comparisonId: row.comparison_id,
            provider: row.provider,
            status: row.status,
            varianceUsd: Number.parseFloat(row.variance_usd),
            variancePercent: Number.parseFloat(row.variance_percent),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toInvoiceReconciliationRecord(row);
    });
  }

  async updateInvoiceArtifactProviderRetentionProofAndEvidence(input: {
    reconciliationId: string;
    artifactId: string;
    providerRetentionProof: InvoiceArtifactProviderRetentionProof;
    evidence: Record<string, unknown>;
    expectedEvidenceHash: string;
    audit?: TeamAuditEventInput;
  }): Promise<InvoiceReconciliationRecord> {
    const providerRetentionProof = persistedProviderRetentionProof(input.providerRetentionProof);

    if (!providerRetentionProof) {
      throw new ApiValidationError('invoice artifact provider retention proof is not persisted', [
        {
          field: 'providerRetentionProof',
          issue: 'only declared or provider-verified proof is persisted to artifact blob rows',
        },
      ]);
    }

    return this.withTransaction(async (pool) => {
      const artifactResult = await pool.query<{ id: string }>(
        `
          UPDATE invoice_artifact_blobs
          SET provider_retention_proof_status = $3,
              provider_retention_proof_evidence_source = $4,
              provider_retention_proof_checked_at = $5,
              provider_retention_proof_retention_mode = $6,
              provider_retention_proof_reference = $7,
              provider_retention_proof_sha256 = $8,
              provider_retention_proof_caveats = $9::jsonb
          WHERE reconciliation_id = $1
            AND artifact_id = $2
          RETURNING id
        `,
        [
          input.reconciliationId,
          input.artifactId,
          providerRetentionProof.status,
          providerRetentionProof.evidenceSource,
          providerRetentionProof.checkedAt,
          providerRetentionProof.retentionMode,
          providerRetentionProof.proofReference ?? null,
          providerRetentionProof.proofDigestSha256 ?? null,
          providerRetentionProof.caveatsJson,
        ],
      );

      if (!artifactResult.rows[0]) {
        throw new ApiNotFoundError(
          `Invoice artifact blob ${input.artifactId} was not found for reconciliation ${input.reconciliationId}`,
        );
      }

      const result = await pool.query<InvoiceReconciliationRow>(
        `
          UPDATE invoice_reconciliation_results
          SET evidence = $2::jsonb
          WHERE id = $1
            AND md5(evidence::text) = $3
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
                    md5(evidence::text) AS evidence_hash,
                    created_at
        `,
        [input.reconciliationId, JSON.stringify(input.evidence), input.expectedEvidenceHash],
      );
      const row = result.rows[0];

      if (!row) {
        // Optimistic-concurrency guard: evidence changed since it was read
        // (or the row was removed). Fail loudly so the caller retries.
        throw new ApiConflictError(
          `Invoice reconciliation ${input.reconciliationId} was modified concurrently; retry the operation`,
        );
      }

      if (input.audit) {
        await this.insertTeamAuditEvent(pool, {
          ...input.audit,
          targetId: input.audit.targetId ?? row.id,
          metadata: {
            importRunId: row.import_run_id,
            comparisonId: row.comparison_id,
            provider: row.provider,
            status: row.status,
            varianceUsd: Number.parseFloat(row.variance_usd),
            variancePercent: Number.parseFloat(row.variance_percent),
            ...(input.audit.metadata ?? {}),
          },
        });
      }

      return toInvoiceReconciliationRecord(row);
    });
  }

  async getInvoiceArtifactBlob(
    reconciliationId: string,
    artifactId: string,
  ): Promise<InvoiceArtifactBlobRecord | undefined> {
    const result = await (
      await this.getPool()
    ).query<InvoiceArtifactBlobRow>(
      `
        SELECT id,
               reconciliation_id,
               artifact_id,
               team_id,
               file_name,
               mime_type,
               content_sha256,
               content_size_bytes,
               content,
               uploaded_by_account_id,
               uploaded_at,
               storage_backend,
               kms_key_reference,
               retention_until,
               legal_hold,
               malware_scan_status,
               malware_scan_engine,
               malware_scan_checked_at,
               malware_scan_finding,
               object_store_bucket,
               object_store_region,
               object_store_key,
               object_store_uri,
               object_store_etag,
               object_store_version,
               provider_retention_proof_status,
               provider_retention_proof_evidence_source,
               provider_retention_proof_checked_at,
               provider_retention_proof_retention_mode,
               provider_retention_proof_reference,
               provider_retention_proof_sha256,
               provider_retention_proof_caveats
        FROM invoice_artifact_blobs
        WHERE reconciliation_id = $1
          AND artifact_id = $2
        LIMIT 1
      `,
      [reconciliationId, artifactId],
    );

    return result.rows[0] ? toInvoiceArtifactBlobRecord(result.rows[0]) : undefined;
  }

  async getInvoiceArtifactBlobLegalHold(
    reconciliationId: string,
    artifactId: string,
  ): Promise<boolean | undefined> {
    // Lightweight legal-hold probe (no content transfer) for the WORM re-upload
    // guard (SEC-3). Returns undefined when no blob exists yet.
    const result = await (
      await this.getPool()
    ).query<{ legal_hold: boolean }>(
      `
        SELECT legal_hold
        FROM invoice_artifact_blobs
        WHERE reconciliation_id = $1
          AND artifact_id = $2
        LIMIT 1
      `,
      [reconciliationId, artifactId],
    );

    return result.rows[0]?.legal_hold;
  }

  async summarizeInvoiceArtifactRetention(
    evaluatedAt: string,
    teamId: string,
  ): Promise<{
    expiredCandidates: number;
    legalHoldSkipped: number;
  }> {
    const result = await (
      await this.getPool()
    ).query<InvoiceArtifactRetentionSummaryRow>(
      `
        SELECT COUNT(*) FILTER (
                 WHERE retention_until <= $1
                   AND legal_hold = false
               )::text AS expired_candidates,
               COUNT(*) FILTER (
                 WHERE retention_until <= $1
                   AND legal_hold = true
               )::text AS legal_hold_skipped
        FROM invoice_artifact_blobs
        WHERE team_id = $2::uuid
      `,
      [evaluatedAt, teamId],
    );
    const row = result.rows[0];

    return {
      expiredCandidates: row ? Number.parseInt(row.expired_candidates, 10) : 0,
      legalHoldSkipped: row ? Number.parseInt(row.legal_hold_skipped, 10) : 0,
    };
  }

  async listExpiredInvoiceArtifactBlobDeletionCandidates(
    evaluatedAt: string,
    teamId: string,
  ): Promise<InvoiceArtifactBlobDeletionCandidate[]> {
    const result = await (
      await this.getPool()
    ).query<InvoiceArtifactBlobDeletionCandidateRow>(
      `
        SELECT id,
               storage_backend,
               object_store_bucket,
               object_store_region,
               object_store_key,
               object_store_uri,
               object_store_version
        FROM invoice_artifact_blobs
        WHERE retention_until <= $1
          AND legal_hold = false
          AND team_id = $2::uuid
        ORDER BY retention_until ASC, uploaded_at ASC
      `,
      [evaluatedAt, teamId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      storageBackend: row.storage_backend,
      ...(row.object_store_bucket ? { objectStoreBucket: row.object_store_bucket } : {}),
      ...(row.object_store_region ? { objectStoreRegion: row.object_store_region } : {}),
      ...(row.object_store_key ? { objectStoreKey: row.object_store_key } : {}),
      ...(row.object_store_uri ? { objectStoreUri: row.object_store_uri } : {}),
      ...(row.object_store_version ? { objectStoreVersion: row.object_store_version } : {}),
    }));
  }

  async deleteInvoiceArtifactBlobsByIds(
    ids: string[],
    evaluatedAt: string,
    teamId: string,
  ): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await (
      await this.getPool()
    ).query<{ id: string }>(
      `
        DELETE FROM invoice_artifact_blobs
        WHERE id = ANY($1::uuid[])
          AND retention_until <= $2
          AND legal_hold = false
          AND team_id = $3::uuid
        RETURNING id
      `,
      [ids, evaluatedAt, teamId],
    );

    return result.rows.length;
  }

  async deleteExpiredInvoiceArtifactBlobs(evaluatedAt: string): Promise<number> {
    const result = await (
      await this.getPool()
    ).query<{ id: string }>(
      `
        DELETE FROM invoice_artifact_blobs
        WHERE retention_until <= $1
          AND legal_hold = false
        RETURNING id
      `,
      [evaluatedAt],
    );

    return result.rows.length;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  // DB-2: prune the append-only tables that otherwise grow without bound.
  //
  // Safety properties:
  // - report-only mode counts what WOULD be removed and deletes nothing. This is
  //   the default; deletion is an explicit, irreversible opt-in.
  // - Each table is bounded by maxRowsPerTable so a first run on a large table
  //   cannot hold a long lock; the sweep simply continues on the next schedule.
  // - team_audit_events is a compliance trail: rows are only eligible once past
  //   the (long) retention window AND once no non-delivered export row refers to
  //   them. team_audit_event_exports cascades on delete, so pruning an event with
  //   a pending export would silently destroy an undelivered compliance export.
  // - Only delivered outbox rows are pruned; pending/processing/failed are kept.
  async pruneExpiredData(input: {
    now: string;
    mode: DataRetentionMode;
    windows: DataRetentionWindows;
    maxRowsPerTable: number;
  }): Promise<DataRetentionSweepResult> {
    const pool = await this.getPool();
    const limit = Math.max(1, Math.trunc(input.maxRowsPerTable));
    const cutoff = (days: number) =>
      new Date(Date.parse(input.now) - days * 24 * 60 * 60 * 1000).toISOString();

    // Ordered deliberately: delivered outbox rows first, then the audit events
    // they referenced, so the NOT EXISTS guard sees the freshest outbox state.
    const plans: Array<{ table: string; where: string; params: unknown[] }> = [
      {
        table: 'team_audit_event_exports',
        where: `status = 'delivered' AND delivered_at < $1`,
        params: [cutoff(input.windows.auditExportDays)],
      },
      {
        table: 'comparison_audit_logs',
        where: `created_at < $1`,
        params: [cutoff(input.windows.comparisonAuditLogDays)],
      },
      {
        table: 'account_sessions',
        where: `expires_at < $1`,
        params: [cutoff(input.windows.accountSessionDays)],
      },
      {
        table: 'exchange_rates',
        where: `fetched_at < $1`,
        params: [cutoff(input.windows.exchangeRateDays)],
      },
      {
        table: 'pricing_etl_runs',
        where: `started_at < $1`,
        params: [cutoff(input.windows.pricingEtlRunDays)],
      },
      {
        table: 'team_audit_events',
        where: `created_at < $1
          AND NOT EXISTS (
            SELECT 1
            FROM team_audit_event_exports
            WHERE team_audit_event_exports.audit_event_id = team_audit_events.id
              AND team_audit_event_exports.status <> 'delivered'
          )`,
        params: [cutoff(input.windows.teamAuditEventDays)],
      },
    ];

    const tables: DataRetentionTableResult[] = [];

    for (const plan of plans) {
      const eligible = await pool.query<{ eligible: string }>(
        `SELECT COUNT(*)::text AS eligible FROM ${plan.table} WHERE ${plan.where}`,
        plan.params,
      );
      const eligibleRows = Number.parseInt(eligible.rows[0]?.eligible ?? '0', 10);

      if (input.mode !== 'delete-expired' || eligibleRows === 0) {
        tables.push({ table: plan.table, eligibleRows, deletedRows: 0 });
        continue;
      }

      const deleted = await pool.query(
        `DELETE FROM ${plan.table}
         WHERE ctid IN (
           SELECT ctid FROM ${plan.table} WHERE ${plan.where} LIMIT ${limit}
         )`,
        plan.params,
      );
      tables.push({
        table: plan.table,
        eligibleRows,
        deletedRows: deleted.rowCount ?? 0,
      });
    }

    return {
      mode: input.mode,
      ranAt: input.now,
      maxRowsPerTable: limit,
      tables,
      totalEligibleRows: tables.reduce((total, row) => total + row.eligibleRows, 0),
      totalDeletedRows: tables.reduce((total, row) => total + row.deletedRows, 0),
    };
  }

  private async withTransaction<T>(
    operation: (queryRunner: PgQueryRunner) => Promise<T>,
  ): Promise<T> {
    const pool = await this.getPool();
    const queryRunner = pool.connect ? await pool.connect() : pool;
    let transactionStarted = false;

    try {
      await queryRunner.query('BEGIN');
      transactionStarted = true;

      const result = await operation(queryRunner);
      await queryRunner.query('COMMIT');

      return result;
    } catch (error) {
      if (transactionStarted) {
        await queryRunner.query('ROLLBACK');
      }
      throw error;
    } finally {
      const releasableRunner = queryRunner as PgQueryRunner & { release?: () => void };
      releasableRunner.release?.();
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
  const role = row.role ? normalizeDatabaseTeamRole(row.role) : undefined;

  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    status: row.status,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    ...(row.locked_until ? { lockedUntil: row.locked_until.toISOString() } : {}),
    ...(row.team_id && row.team_name && role
      ? {
          defaultTeam: {
            teamId: row.team_id,
            teamName: row.team_name,
            role,
          },
        }
      : {}),
  };
}

function toAccountSessionPrincipal(row: AccountSessionPrincipalRow): AccountSessionPrincipal {
  const role = row.role ? normalizeDatabaseTeamRole(row.role) : undefined;

  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    status: row.status,
    ...(row.team_id && row.team_name && role
      ? {
          defaultTeam: {
            teamId: row.team_id,
            teamName: row.team_name,
            role,
          },
        }
      : {}),
  };
}

function toAuthIdentity(row: AccountSessionRow): AuthIdentity {
  const role = row.role ? normalizeDatabaseTeamRole(row.role) : undefined;

  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.team_id ? { teamId: row.team_id } : {}),
    ...(role ? { role } : {}),
    sessionId: row.session_id,
    expiresAt: row.expires_at.toISOString(),
  };
}

function toTeamMembership(row: TeamMembershipRow): AccountTeamMembership {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    role: normalizeDatabaseTeamRole(row.role),
  };
}

function toTeamMemberRecord(row: TeamMemberRow): TeamMemberRecord {
  return {
    accountId: row.account_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    role: normalizeDatabaseTeamRole(row.role),
    createdAt: row.created_at.toISOString(),
    ...(row.last_active_at ? { lastActiveAt: row.last_active_at.toISOString() } : {}),
  };
}

function toTeamInvitationRecord(row: TeamInvitationRow): TeamInvitationRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: normalizeInvitableDatabaseRole(row.role),
    status: row.status,
    invitedByAccountId: row.invited_by_account_id,
    ...(row.accepted_by_account_id ? { acceptedByAccountId: row.accepted_by_account_id } : {}),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    ...(row.accepted_at ? { acceptedAt: row.accepted_at.toISOString() } : {}),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
  };
}

function toTeamAuditEventRecord(row: TeamAuditEventRow): TeamAuditEventRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    ...(row.actor_account_id ? { actorAccountId: row.actor_account_id } : {}),
    ...(row.actor_email ? { actorEmail: row.actor_email } : {}),
    action: row.action,
    targetType: row.target_type,
    ...(row.target_id ? { targetId: row.target_id } : {}),
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

function toTeamScimTokenRecord(row: TeamScimTokenRow): TeamScimTokenRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    displayName: row.display_name,
    tokenPrefix: row.token_prefix,
    ...(row.created_by_account_id ? { createdByAccountId: row.created_by_account_id } : {}),
    createdAt: row.created_at.toISOString(),
    ...(row.last_used_at ? { lastUsedAt: row.last_used_at.toISOString() } : {}),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
  };
}

function toTeamScimUserRecord(row: TeamScimUserRow): TeamScimUserRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    externalId: row.external_id,
    accountId: row.account_id,
    userName: row.user_name,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.deactivated_at ? { deactivatedAt: row.deactivated_at.toISOString() } : {}),
  };
}

function toTeamAuditExportClaimRecord(row: TeamAuditExportClaimRow): TeamAuditExportClaimRecord {
  return {
    exportId: row.export_id,
    auditEventId: row.audit_event_id,
    destination: row.destination,
    status: row.export_status,
    attempts: row.attempts,
    auditEvent: toTeamAuditEventRecord(row),
    ...(row.next_attempt_at ? { nextAttemptAt: row.next_attempt_at.toISOString() } : {}),
    ...(row.last_attempt_at ? { lastAttemptAt: row.last_attempt_at.toISOString() } : {}),
    ...(row.delivered_at ? { deliveredAt: row.delivered_at.toISOString() } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    createdAt: row.export_created_at.toISOString(),
    updatedAt: row.export_updated_at.toISOString(),
  };
}

function toAccountProfileResponse(row: AccountProfileRow): AccountProfileResponse {
  return {
    id: row.id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    status: row.status,
  };
}

function toTeamSettingsRecord(row: TeamSettingsRow): TeamSettingsRecord {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    plan: row.plan,
    role: normalizeDatabaseTeamRole(row.role),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeDatabaseTeamRole(role: DatabaseTeamRole): TeamRole {
  return role === 'viewer' ? 'member' : role;
}

function normalizeInvitableDatabaseRole(
  role: Exclude<TeamRole, 'owner'> | 'viewer',
): Exclude<TeamRole, 'owner'> {
  return role === 'viewer' ? 'member' : role;
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
    evidenceHash: row.evidence_hash,
    createdAt: row.created_at.toISOString(),
  };
}

function toInvoiceArtifactBlobRecord(row: InvoiceArtifactBlobRow): InvoiceArtifactBlobRecord {
  return {
    id: row.id,
    reconciliationId: row.reconciliation_id,
    artifactId: row.artifact_id,
    ...(row.team_id ? { teamId: row.team_id } : {}),
    fileName: row.file_name,
    mimeType: row.mime_type,
    contentSha256: row.content_sha256,
    contentSizeBytes: row.content_size_bytes,
    ...(row.content ? { contentBase64: row.content.toString('base64') } : {}),
    ...(row.uploaded_by_account_id ? { uploadedByAccountId: row.uploaded_by_account_id } : {}),
    uploadedAt: row.uploaded_at.toISOString(),
    storageProfile: {
      storageBackend: row.storage_backend,
      encryptionStatus:
        row.storage_backend === 'database-bytea' ? 'database-managed' : 'customer-managed-kms',
      ...(row.object_store_bucket
        ? {
            objectStore: {
              bucketOrContainer: row.object_store_bucket,
              prefix: objectPrefixFromKey(row.object_store_key),
              ...(row.object_store_region ? { region: row.object_store_region } : {}),
              ...(row.object_store_key ? { key: row.object_store_key } : {}),
              ...(row.object_store_uri ? { uri: row.object_store_uri } : {}),
              ...(row.object_store_etag ? { eTag: row.object_store_etag } : {}),
              ...(row.object_store_version ? { version: row.object_store_version } : {}),
            },
          }
        : {}),
      ...(row.kms_key_reference ? { kmsKeyReference: row.kms_key_reference } : {}),
      kmsKeyRequiredForProduction: !row.kms_key_reference,
    },
    retentionPolicy: {
      retentionUntil: row.retention_until.toISOString(),
      retentionDays: retentionDaysBetween(row.uploaded_at, row.retention_until),
      legalHold: row.legal_hold,
    },
    providerRetentionProof: toInvoiceArtifactProviderRetentionProof(row),
    malwareScan: {
      status: row.malware_scan_status,
      scanner: row.malware_scan_engine,
      checkedAt: row.malware_scan_checked_at.toISOString(),
      findings: row.malware_scan_finding ? [row.malware_scan_finding] : [],
    },
  };
}

function toInvoiceArtifactProviderRetentionProof(
  row: InvoiceArtifactBlobRow,
): InvoiceArtifactProviderRetentionProof {
  const retentionUntil = row.retention_until.toISOString();
  const checkedAt =
    row.provider_retention_proof_checked_at?.toISOString() ?? row.uploaded_at.toISOString();

  if (row.storage_backend === 'database-bytea') {
    return {
      schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
      status: 'not-applicable',
      evidenceSource: 'not-required',
      storageBackend: row.storage_backend,
      checkedAt,
      retentionMode: 'not-configured',
      retentionUntil,
      legalHold: row.legal_hold,
      caveats: [
        'database-bytea storage has no provider object-lock control plane; use external object storage for invoice-grade retention proof.',
      ],
    };
  }

  const persistedStatus = row.provider_retention_proof_status;

  if (persistedStatus) {
    return {
      schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
      status: persistedStatus,
      evidenceSource: row.provider_retention_proof_evidence_source ?? 'local-config',
      storageBackend: row.storage_backend,
      checkedAt,
      retentionMode: row.provider_retention_proof_retention_mode ?? 'not-configured',
      retentionUntil,
      legalHold: row.legal_hold,
      ...(row.object_store_bucket
        ? {
            objectStore: {
              bucketOrContainer: row.object_store_bucket,
              prefix: objectPrefixFromKey(row.object_store_key),
              ...(row.object_store_region ? { region: row.object_store_region } : {}),
              ...(row.object_store_key ? { key: row.object_store_key } : {}),
              ...(row.object_store_uri ? { uri: row.object_store_uri } : {}),
              ...(row.object_store_etag ? { eTag: row.object_store_etag } : {}),
              ...(row.object_store_version ? { version: row.object_store_version } : {}),
            },
          }
        : {}),
      ...(row.provider_retention_proof_reference
        ? { proofReference: row.provider_retention_proof_reference }
        : {}),
      ...(row.provider_retention_proof_sha256
        ? { proofDigestSha256: row.provider_retention_proof_sha256 }
        : {}),
      caveats: stringArrayFromJsonb(row.provider_retention_proof_caveats),
    };
  }

  return {
    schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
    status: 'missing',
    evidenceSource: 'local-config',
    storageBackend: row.storage_backend,
    checkedAt,
    retentionMode: 'not-configured',
    retentionUntil,
    legalHold: row.legal_hold,
    ...(row.object_store_bucket
      ? {
          objectStore: {
            bucketOrContainer: row.object_store_bucket,
            prefix: objectPrefixFromKey(row.object_store_key),
            ...(row.object_store_region ? { region: row.object_store_region } : {}),
            ...(row.object_store_key ? { key: row.object_store_key } : {}),
            ...(row.object_store_uri ? { uri: row.object_store_uri } : {}),
            ...(row.object_store_etag ? { eTag: row.object_store_etag } : {}),
            ...(row.object_store_version ? { version: row.object_store_version } : {}),
          },
        }
      : {}),
    caveats: [
      'provider retention proof was not persisted with this artifact row; use the reconciliation evidence packet manifest for captured provider proof.',
    ],
  };
}

function persistedProviderRetentionProof(proof: InvoiceArtifactProviderRetentionProof | undefined):
  | {
      status: 'declared' | 'provider-verified';
      evidenceSource: InvoiceArtifactProviderRetentionProof['evidenceSource'];
      checkedAt: string;
      retentionMode: InvoiceArtifactProviderRetentionProof['retentionMode'];
      proofReference?: string;
      proofDigestSha256?: string;
      caveatsJson: string;
    }
  | undefined {
  if (!proof || proof.status === 'missing' || proof.status === 'not-applicable') {
    return undefined;
  }

  if (proof.evidenceSource === 'not-required') {
    return undefined;
  }

  return {
    status: proof.status,
    evidenceSource: proof.evidenceSource,
    checkedAt: proof.checkedAt,
    retentionMode: proof.retentionMode,
    ...(proof.proofReference ? { proofReference: proof.proofReference } : {}),
    ...(proof.proofDigestSha256 ? { proofDigestSha256: proof.proofDigestSha256 } : {}),
    caveatsJson: JSON.stringify(proof.caveats.slice(0, 20)),
  };
}

function stringArrayFromJsonb(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function retentionDaysBetween(uploadedAt: Date, retentionUntil: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diff = retentionUntil.getTime() - uploadedAt.getTime();

  return Math.max(0, Math.round(diff / millisecondsPerDay));
}

function objectPrefixFromKey(key: string | null): string {
  if (!key || !key.includes('/')) {
    return 'invoice-artifacts';
  }

  return key.slice(0, key.lastIndexOf('/'));
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

type PricingProvenance = 'live' | 'mock' | 'seeded' | 'mixed' | 'unknown';

/**
 * Classifies the provenance of a provider's served catalog rows. Live rows are
 * the complement of mock (fixture://) and seeded (local_seed) rows.
 */
function catalogProvenance(
  catalogRows: number,
  mockRows: number,
  seededRows: number,
): PricingProvenance {
  if (catalogRows <= 0) {
    return 'unknown';
  }

  const nonLiveRows = Math.min(catalogRows, mockRows + seededRows);
  const liveRows = catalogRows - nonLiveRows;

  if (liveRows === catalogRows) {
    return 'live';
  }
  if (liveRows > 0) {
    return 'mixed';
  }
  // All rows are non-live. If both mock and seed exist, it's mixed non-live;
  // otherwise label by whichever kind is present (mock takes precedence since
  // reads prefer mock/live rows over seed rows).
  if (mockRows > 0 && seededRows > 0) {
    return 'mixed';
  }
  return mockRows > 0 ? 'mock' : 'seeded';
}

function provenanceLabel(provenance: PricingProvenance): string {
  switch (provenance) {
    case 'mock':
      return 'mock/demo fixture pricing';
    case 'seeded':
      return 'local seed pricing';
    case 'mixed':
      return 'a mix of mock/seed and live pricing';
    case 'live':
      return 'live provider pricing';
    default:
      return 'unknown-provenance pricing';
  }
}

function rollUpProvenance(provenances: PricingProvenance[]): PricingProvenance {
  const known = provenances.filter((provenance) => provenance !== 'unknown');
  if (known.length === 0) {
    return 'unknown';
  }

  const unique = new Set(known);
  if (unique.size === 1) {
    return [...unique][0];
  }
  // Any blend of live + non-live, or mock + seeded, is reported as mixed so the
  // caller never sees a single clean label that hides non-live data.
  return 'mixed';
}
