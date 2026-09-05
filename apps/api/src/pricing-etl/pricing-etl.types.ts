import { ProviderId } from '../adapters/common/cloud-provider-adapter.js';
import { PricingEtlProviderStatus } from '../database/pricing-repository.types.js';

export const PRICING_ETL_QUEUE_NAME = 'pricing-etl';
export const PRICING_ETL_REFRESH_JOB_NAME = 'refresh-pricing-catalog';
export const PRICING_ETL_STARTUP_REFRESH_JOB_ID = 'refresh-pricing-catalog-startup';

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
