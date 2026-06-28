import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { PricingEtlProviderStatus } from '../database/pricing-repository.types';

export const PRICING_ETL_QUEUE_NAME = 'pricing-etl';
export const PRICING_ETL_REFRESH_JOB_NAME = 'refresh-pricing-catalog';

export type PricingEtlOverallStatus = 'success' | 'partial' | 'failed';

export interface PricingEtlProviderResult {
  provider: ProviderId;
  status: PricingEtlProviderStatus;
  startedAt: string;
  completedAt: string;
  recordsUpdated: number;
  recordsRejected: number;
  errorDetail?: string;
}

export interface PricingEtlSummary {
  status: PricingEtlOverallStatus;
  providerResults: PricingEtlProviderResult[];
}
