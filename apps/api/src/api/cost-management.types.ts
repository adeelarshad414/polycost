import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { NormalizedInstanceFamily } from '../pricing-normalization/family-normalizer';

export type CachedPricingTerm = 'on_demand' | 'reserved_1yr' | 'reserved_3yr';
export type StoragePricingTier = 'standard' | 'infrequent_access' | 'archive';

export interface WorkloadInput {
  instanceFamily: NormalizedInstanceFamily;
  vcpu: number;
  memoryGb: number;
  region: string;
  instanceCount: number;
  hoursPerMonth: number;
  storageGb: number;
  storageTier: StoragePricingTier;
  egressGbPerMonth: number;
}

export interface WorkloadRecord extends WorkloadInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CachedPricingCompareQuery {
  instanceFamily: NormalizedInstanceFamily;
  vcpu: number;
  memoryGb: number;
  region: string;
  term: CachedPricingTerm;
}

export interface CachedPricingCompareRow {
  provider: ProviderId;
  providerSkuId: string;
  skuId: string;
  pricePerHour: number;
  term: CachedPricingTerm;
  region: string;
  currency: string;
  effectiveDate: string;
}

export interface ProviderCostBreakdown {
  provider: ProviderId;
  region: string;
  compute: number;
  storage: number;
  egress: number;
  total: number;
  currency: 'USD';
}

export interface WorkloadCostBreakdown {
  workloadId: string;
  term: CachedPricingTerm;
  providers: ProviderCostBreakdown[];
}

export interface BudgetInput {
  workloadId: string;
  thresholdUsd: number;
  alertOnAnomalyPercent?: number;
}

export interface BudgetRecord extends BudgetInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  workloadId: string;
  budgetId?: string;
  alertType: 'budget_threshold' | 'anomaly';
  message: string;
  thresholdUsd?: number;
  observedUsd?: number;
  anomalyPercent?: number;
  dismissed: boolean;
  triggeredAt: string;
  dismissedAt?: string;
}

export interface ShareLinkInput {
  workloadId: string;
  watermark: boolean;
  expiresInDays: number;
}

export interface ShareLinkRecord {
  token: string;
  workloadId: string;
  watermark: boolean;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface ShareLinkResponse {
  token: string;
  url: string;
}

export interface SharedReportResponse {
  token: string;
  watermark: boolean;
  expiresAt: string;
  workload: WorkloadRecord;
  breakdown: WorkloadCostBreakdown;
}

export interface ExchangeRatesResponse {
  base: string;
  lastUpdated?: string;
  rates: Record<string, number>;
}

export interface BudgetEvaluationRecord {
  budget: BudgetRecord;
  workload: WorkloadRecord;
}

export interface CreateAlertInput {
  workloadId: string;
  budgetId?: string;
  alertType: AlertRecord['alertType'];
  message: string;
  thresholdUsd?: number;
  observedUsd?: number;
  anomalyPercent?: number;
}

export interface CostObservationInput {
  workloadId: string;
  budgetId?: string;
  term: CachedPricingTerm;
  provider: ProviderId;
  observedMonthlyUsd: number;
  observedAt: string;
}

export interface CostObservationRecord extends CostObservationInput {
  id: string;
  source: 'modeled_cache';
}

export interface ExchangeRateUpsertInput {
  baseCurrency: string;
  rates: Record<string, number>;
  source: string;
  fetchedAt: string;
}
