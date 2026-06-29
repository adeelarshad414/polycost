export const COST_MANAGEMENT_QUEUE_NAME = 'cost-management';
export const CURRENCY_SYNC_JOB_NAME = 'currency-sync';
export const ALERT_EVALUATOR_JOB_NAME = 'alert-evaluator';
export const SHARE_LINK_CLEANUP_JOB_NAME = 'share-link-cleanup';

export type CostManagementJobName =
  | typeof CURRENCY_SYNC_JOB_NAME
  | typeof ALERT_EVALUATOR_JOB_NAME
  | typeof SHARE_LINK_CLEANUP_JOB_NAME;

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

export type CostManagementJobSummary =
  CurrencySyncSummary | AlertEvaluationSummary | ShareLinkCleanupSummary;
