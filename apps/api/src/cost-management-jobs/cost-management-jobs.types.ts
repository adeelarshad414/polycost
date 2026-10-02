export const COST_MANAGEMENT_QUEUE_NAME = 'cost-management';
export const CURRENCY_SYNC_JOB_NAME = 'currency-sync';
export const ALERT_EVALUATOR_JOB_NAME = 'alert-evaluator';
export const SHARE_LINK_CLEANUP_JOB_NAME = 'share-link-cleanup';
export const TEAM_AUDIT_EXPORT_JOB_NAME = 'team-audit-export';
export const DATA_RETENTION_JOB_NAME = 'data-retention';

/**
 * Audit M-05: retry transient failures with backoff. Every job here is safe to
 * repeat: currency sync and retention are idempotent, alert creation is
 * deduplicated, and share-link cleanup and audit export only act on rows
 * still pending.
 */
export const COST_MANAGEMENT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: 500,
} as const;

export type CostManagementJobName =
  | typeof CURRENCY_SYNC_JOB_NAME
  | typeof ALERT_EVALUATOR_JOB_NAME
  | typeof SHARE_LINK_CLEANUP_JOB_NAME
  | typeof TEAM_AUDIT_EXPORT_JOB_NAME
  | typeof DATA_RETENTION_JOB_NAME;

export interface CostManagementJob {
  name: string;
}

export interface CurrencySyncSummary {
  status: 'success';
  baseCurrency: string;
  quoteCurrencyCount: number;
  recordsUpdated: number;
  fetchedAt: string;
  source: string;
}

export interface AlertEvaluationSummary {
  status: 'success';
  budgetsEvaluated: number;
  observationsCreated: number;
  alertsCreated: number;
  budgetsSkippedWithoutPricing: number;
}

export interface ShareLinkCleanupSummary {
  status: 'success';
  revokedLinks: number;
  ranAt: string;
}

export interface DataRetentionSweepJobSummary {
  status: 'success';
  mode: 'report-only' | 'delete-expired';
  ranAt: string;
  totalEligibleRows: number;
  totalDeletedRows: number;
  tables: Array<{ table: string; eligibleRows: number; deletedRows: number }>;
}

export type CostManagementJobSummary =
  | CurrencySyncSummary
  | AlertEvaluationSummary
  | ShareLinkCleanupSummary
  | DataRetentionSweepJobSummary
  | {
      status: 'skipped' | 'success';
      claimed: number;
      delivered: number;
      failed: number;
      deadLettered: number;
      ranAt: string;
      reason?: string;
    };
