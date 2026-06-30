export const PROVIDER_ORDER = ['aws', 'azure', 'gcp'] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];
export type ServiceCategory = 'compute' | 'storage' | 'database' | 'network';
export type CostComponent = 'compute' | 'storage' | 'database' | 'egress';
export type PricingModelKey =
  'on-demand' | 'reserved-1yr' | 'reserved-3yr' | 'spot' | 'savings-plan';
export type PricingBasis = 'flat' | 'tiered';
export type PricingVolatility = 'stable' | 'variable' | 'volatile';
export type PricingSource = 'catalog' | 'modeled-estimate';
export type IntervalKey = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type NormalizedInstanceFamily =
  | 'general-purpose'
  | 'compute-optimized'
  | 'memory-optimized'
  | 'storage-optimized'
  | 'accelerated-computing';
export type CachedPricingTerm =
  'on_demand' | 'reserved_1yr' | 'reserved_3yr' | 'spot' | 'savings_plan';
export type PricingTermCode =
  | 'on_demand'
  | 'reserved_1yr'
  | 'reserved_3yr'
  | 'savings_plan_1yr'
  | 'savings_plan_3yr'
  | 'spot_estimate';
export type PaymentOptionCode = 'no_upfront' | 'partial_upfront' | 'all_upfront' | 'n_a';
export type StoragePricingTier = 'standard' | 'infrequent_access' | 'archive';

export const INTERVALS: Array<{ key: IntervalKey; label: string }> = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
];

export interface NormalizedWorkloadSpec {
  schemaVersion: '1.0';
  metadata: {
    sourceType: 'natural_language' | 'structured_form' | 'drawio_diagram' | 'terraform';
    rawInput?: string;
    createdAt: string;
  };
  workload: {
    name?: string;
    type:
      | 'web_app'
      | 'api_backend'
      | 'static_site'
      | 'batch_processing'
      | 'data_pipeline'
      | 'ml_workload'
      | 'other';
    expectedUsers?: {
      dailyActiveUsers?: number;
      peakConcurrentUsers?: number;
    };
    region: {
      preference?: string;
      isDefault: boolean;
    };
  };
  compute: Array<{
    role: string;
    vcpu?: number;
    memoryGb?: number;
    instanceCount?: number;
    scalingType: 'fixed' | 'autoscaling';
    autoscalingRange?: {
      min: number;
      max: number;
    };
  }>;
  storage: Array<{
    role: string;
    type: 'object' | 'block' | 'file';
    sizeGb: number;
    accessPattern?: 'frequent' | 'infrequent' | 'archive';
  }>;
  database: Array<{
    role: string;
    engine: 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'generic_relational' | 'generic_nosql';
    sizeGb?: number;
    highAvailability: boolean;
    managedServicePreference?: string;
  }>;
  network: {
    estimatedMonthlyEgressGb?: number;
    cdn: boolean;
    loadBalancer: boolean;
  };
  availability: {
    multiAz: boolean;
    multiRegion: boolean;
    slaTarget?: string;
  };
  serviceRequirements?: ServiceRequirement[];
  sourceTraceability?: Array<{
    nwsPath: string;
    sourceRef: string;
  }>;
}

export interface ServiceRequirement {
  serviceCategory:
    | 'compute'
    | 'containers'
    | 'application'
    | 'storage'
    | 'database'
    | 'analytics'
    | 'ai'
    | 'integration'
    | 'networking'
    | 'security'
    | 'operations'
    | 'devops'
    | 'migration'
    | 'edge'
    | 'business';
  serviceType: string;
  instanceType?: string;
  tier?: string;
  region?: string;
  az?: string;
  quantity: number;
  scaleParams?: Record<string, string | number | boolean>;
}

export interface ParsedNwsDraft {
  draftNws: NormalizedWorkloadSpec;
  parserConfidence: 'low' | 'medium' | 'high';
  fieldsRequiringReview: string[];
}

export interface CostIntervals {
  hourly?: number;
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
  yearly: number;
}

export interface ComparisonLineItem {
  category: ServiceCategory;
  costComponent?: CostComponent;
  description: string;
  isApproximate: boolean;
  baseHourlyCostUsd?: number;
  baseMonthlyCostUsd: number;
  skuId?: string;
  region?: string;
  unit?: string;
  unitPriceUsd?: number;
  pricingBasis?: PricingBasis;
  pricingModels?: PricingModelCost[];
}

export interface PricingModelCost {
  model: PricingModelKey;
  available: boolean;
  displayName?: string;
  providerTerm?: string;
  source?: PricingSource;
  estimated?: boolean;
  volatility?: PricingVolatility;
  monthlyCostUsd?: number;
  hourlyCostUsd?: number;
  savingsPercentVsOnDemand?: number;
  upfrontOption?: 'none' | 'partial' | 'all';
  commitmentTermMonths?: number;
  lastFetchedAt?: string;
  caveat?: string;
  unavailableReason?: string;
}

export interface ComparisonCostBreakdown {
  computeMonthlyCostUsd: number;
  storageMonthlyCostUsd: number;
  egressMonthlyCostUsd: number;
  databaseMonthlyCostUsd: number;
  scopedMonthlyCostUsd: number;
}

export interface ComparisonProviderResult {
  providerId: ProviderId;
  lineItems: ComparisonLineItem[];
  totals: CostIntervals;
  pricingModels?: PricingModelCost[];
  breakdown?: ComparisonCostBreakdown;
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  requirements?: {
    sourceType: NormalizedWorkloadSpec['metadata']['sourceType'];
    workloadName?: string;
    workloadType: NormalizedWorkloadSpec['workload']['type'];
    regionPreference?: string;
    serviceRequirements: ServiceRequirement[];
  };
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  warnings?: Array<{
    providerId?: ProviderId;
    code?: string;
    message: string;
  }>;
}

export interface PricingStatusResponse {
  providers: Array<{
    providerId: ProviderId;
    status: 'success' | 'partial' | 'failed';
    lastSuccessfulRun?: string;
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
  }>;
}

export interface PricingModelCatalogEntry {
  model: PricingModelKey;
  cachedTerm: CachedPricingTerm;
  label: string;
  default: boolean;
  volatility: PricingVolatility;
  providerTerms: Record<ProviderId, string>;
  caveat: string;
}

export interface PricingModelCatalogResponse {
  models: PricingModelCatalogEntry[];
  defaultModel: PricingModelKey;
  generatedAt: string;
}

export interface PricingModelsForServiceResponse {
  schemaVersion: 2;
  provider: ProviderId;
  service: string;
  region: string;
  generatedAt: string;
  models: Array<{
    code: PricingTermCode;
    label: string;
    termMonths?: number;
    requiresPaymentOption: boolean;
    isEstimateOnly: boolean;
    paymentOptions: Array<{
      code: PaymentOptionCode;
      label: string;
    }>;
    defaultPaymentOption?: PaymentOptionCode;
  }>;
}

export interface BackendHealthResponse {
  status: 'ok' | string;
  service: string;
}

export type RegionCatalogSource = 'live' | 'fallback';

export interface CloudRegion {
  providerId: ProviderId;
  id: string;
  label: string;
  location?: string;
  source: RegionCatalogSource;
}

export interface CloudRegionProviderCatalog {
  providerId: ProviderId;
  label: string;
  source: RegionCatalogSource;
  sourceUrl: string;
  calculatorUrl: string;
  regions: CloudRegion[];
}

export interface RegionCatalogResponse {
  generatedAt: string;
  cacheTtlSeconds: number;
  providers: CloudRegionProviderCatalog[];
}

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

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}
