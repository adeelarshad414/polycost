import { ProviderId } from '../adapters/common/cloud-provider-adapter.js';
import { PricingEtlProviderStatus } from '../database/pricing-repository.types.js';

export const PRICING_ETL_QUEUE_NAME = 'pricing-etl';
export const PRICING_ETL_REFRESH_JOB_NAME = 'refresh-pricing-catalog';
export const PRICING_ETL_STARTUP_REFRESH_JOB_ID = 'refresh-pricing-catalog-startup';

/**
 * Audit M-05: jobs had no retry. The ETL already retries each provider fetch
 * and records provider failures itself, so a job-level retry only covers a
 * crash of the run (e.g. the database). Failed jobs are kept for inspection
 * and alerting (JobQueueFailuresAccumulating).
 */
export const PRICING_ETL_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: 500,
} as const;

export type PricingEtlOverallStatus = 'success' | 'partial' | 'failed';

export interface PricingEtlProviderResult {
  provider: ProviderId;
  status: PricingEtlProviderStatus;
  startedAt: string;
  completedAt: string;
  recordsUpdated: number;
  recordsRejected: number;
  recordsSkipped: number;
  errorDetail?: string;
}

export interface PricingEtlSummary {
  status: PricingEtlOverallStatus;
  providerResults: PricingEtlProviderResult[];
}
