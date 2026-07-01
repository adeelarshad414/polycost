import type {
  AiCostNarrative as SharedAiCostNarrative,
  NormalizedRequirement as SharedNormalizedRequirement,
  ProviderCostResult as SharedProviderCostResult,
} from '@polycost/types';

export type NormalizedRequirement = SharedNormalizedRequirement;
export type ProviderCostResult = SharedProviderCostResult;
export type AiCostNarrative = SharedAiCostNarrative;

export const PROVIDER_ORDER = ['aws', 'azure', 'gcp'] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];
export type ServiceCategory =
  'compute' | 'storage' | 'database' | 'network' | 'support' | 'licensing' | 'operations';
export type CostComponent =
  'compute' | 'storage' | 'database' | 'egress' | 'support' | 'licensing' | 'operations';
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
export type ProcessorArchitecture = 'x86_64' | 'arm64' | 'gpu';
export type ComputeTenancy = 'shared' | 'dedicated-host' | 'sole-tenant';
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
export type StorageClass =
  | 'standard'
  | 'hot'
  | 'cool'
  | 'cold'
  | 'nearline'
  | 'coldline'
  | 'intelligent-tiering'
  | 'infrequent-access'
  | 'one-zone-infrequent-access'
  | 'archive-instant'
  | 'archive'
  | 'deep-archive'
  | 'premium'
  | 'ultra';
export type StorageReplication = 'none' | 'same-region' | 'cross-region';

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
    instanceFamily?: NormalizedInstanceFamily;
    processorArchitecture?: ProcessorArchitecture;
    tenancy?: ComputeTenancy;
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
    storageClass?: StorageClass;
    monthlyPutRequestsThousand?: number;
    monthlyGetRequestsThousand?: number;
    monthlyDeleteRequestsThousand?: number;
    monthlyListRequestsThousand?: number;
    monthlyRetrievalGb?: number;
    replication?: StorageReplication;
    lifecycleTransitionsThousand?: number;
    snapshotSizeGb?: number;
    snapshotRetentionDays?: number;
    provisionedIops?: number;
    provisionedThroughputMbps?: number;
  }>;
  database: Array<{
    role: string;
    engine: 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'generic_relational' | 'generic_nosql';
    sizeGb?: number;
    highAvailability: boolean;
    managedServicePreference?: string;
    backupStorageGb?: number;
    backupRetentionDays?: number;
    provisionedIops?: number;
    readReplicaCount?: number;
    crossRegionReplicaTransferGb?: number;
    nosqlReadRequestUnitsMillion?: number;
    nosqlWriteRequestUnitsMillion?: number;
    ruPerSecond?: number;
    queryDataTb?: number;
    cacheReplicaCount?: number;
    storageGrowthGbPerMonth?: number;
    searchNodeCount?: number;
    searchNodeHours?: number;
    searchStorageGb?: number;
    searchQueriesMillion?: number;
  }>;
  network: {
    estimatedMonthlyEgressGb?: number;
    crossAzTransferGb?: number;
    interRegionTransferGb?: number;
    cdnTrafficGb?: number;
    cdnCacheHitRatioPercent?: number;
    natGatewayGb?: number;
    natGatewayHours?: number;
    dnsHostedZones?: number;
    dnsQueriesMillion?: number;
    loadBalancerProcessedGb?: number;
    loadBalancerHours?: number;
    vpnConnectionCount?: number;
    vpnConnectionHours?: number;
    vpnDataTransferGb?: number;
    privateCircuitCount?: number;
    privateCircuitPortHours?: number;
    privateCircuitDataTransferGb?: number;
    cdn: boolean;
    loadBalancer: boolean;
  };
  availability: {
    multiAz: boolean;
    multiRegion: boolean;
    slaTarget?: string;
    faultTolerance?: 'single-zone' | 'multi-az' | 'multi-region' | 'active-active';
  };
  workloadProfile?: {
    environment?: 'production' | 'staging' | 'development' | 'test';
    commitmentPreferencePercent?: number;
    dataResidency?: {
      scope: string;
      complianceLocked: boolean;
      frameworks?: string[];
    };
    operatingSystem?: 'linux' | 'windows' | 'byol';
    supportTier?: 'none' | 'developer' | 'business' | 'enterprise';
    usagePattern?: {
      type: 'always_on' | 'scheduled' | 'bursty';
      hoursPerDay?: number;
      daysPerWeek?: number;
      averageUtilizationPercent?: number;
    };
    tags?: Array<{
      key: string;
      value: string;
    }>;
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

export interface EgressTierBreakdown {
  tierFromGb: number;
  tierToGb?: number;
  pricePerGb: number;
  billableGb: number;
  monthlyCostUsd: number;
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
  egressTiers?: EgressTierBreakdown[];
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
  upfrontCostUsd?: number;
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
  supportMonthlyCostUsd: number;
  licensingMonthlyCostUsd: number;
  operationsMonthlyCostUsd: number;
  scopedMonthlyCostUsd: number;
}

export interface ComparisonProviderResult {
  providerId: ProviderId;
  lineItems: ComparisonLineItem[];
  totals: CostIntervals;
  pricingModels?: PricingModelCost[];
  breakdown?: ComparisonCostBreakdown;
}

export interface PricingModelRecommendation {
  preferredModel: PricingModelKey;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  sourceSignals: {
    environment?: NonNullable<NormalizedWorkloadSpec['workloadProfile']>['environment'];
    commitmentPreferencePercent?: number;
    flexibilityBias: 'flexibility' | 'balanced' | 'cost-optimized';
  };
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  requirements?: {
    sourceType: NormalizedWorkloadSpec['metadata']['sourceType'];
    workloadName?: string;
    workloadType: NormalizedWorkloadSpec['workload']['type'];
    regionPreference?: string;
    workloadProfile?: Pick<
      NonNullable<NormalizedWorkloadSpec['workloadProfile']>,
      | 'environment'
      | 'commitmentPreferencePercent'
      | 'dataResidency'
      | 'operatingSystem'
      | 'supportTier'
      | 'usagePattern'
      | 'tags'
    >;
    serviceRequirements: ServiceRequirement[];
  };
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  pricingModelRecommendation?: PricingModelRecommendation;
  warnings?: Array<{
    providerId?: ProviderId;
    code?: string;
    message: string;
  }>;
}

export type AnalyticsDimension =
  | 'compute'
  | 'storage'
  | 'egress'
  | 'networking'
  | 'database'
  | 'support'
  | 'licensing'
  | 'operations'
  | 'other';

export interface CostCompositionItem {
  dimension: AnalyticsDimension;
  label: string;
  monthlyCostUsd: number;
  percentOfProviderTotal: number;
  runningMonthlyUsd: number;
  topDriver?: string;
}

export interface ProviderCostComposition {
  providerId: ProviderId;
  totalMonthlyUsd: number;
  items: CostCompositionItem[];
}

export interface ProviderDeltaAnalysis {
  dimension: AnalyticsDimension;
  label: string;
  cheapestProviderId: ProviderId;
  mostExpensiveProviderId: ProviderId;
  cheapestMonthlyUsd: number;
  mostExpensiveMonthlyUsd: number;
  deltaMonthlyUsd: number;
  deltaPercentVsMostExpensive: number;
  explanation: string;
}

export interface SensitivityScenarioRow {
  variable: 'compute_capacity' | 'storage_volume' | 'egress_traffic' | 'database_capacity';
  label: string;
  changePercent: number;
  providerId: ProviderId;
  baselineMonthlyUsd: number;
  adjustedMonthlyUsd: number;
  deltaMonthlyUsd: number;
}

export interface CommitmentRoiTimeline {
  providerId: ProviderId;
  pricingModel: Exclude<PricingModelKey, 'on-demand' | 'spot'>;
  label: string;
  baselineMonthlyUsd: number;
  committedMonthlyUsd: number;
  upfrontCostUsd: number;
  monthlySavingsUsd: number;
  breakEvenMonth?: number;
  points: Array<{
    month: number;
    onDemandCumulativeUsd: number;
    committedCumulativeUsd: number;
    savingsUsd: number;
  }>;
}

export interface CommitmentCoverageRow {
  providerId: ProviderId;
  eligibleMonthlyUsd: number;
  coveredPercentOfSpend: number;
  onDemandExposureMonthlyUsd: number;
  maxMonthlySavingsUsd: number;
}

export interface TcoSignal {
  providerId: ProviderId;
  egressLockInMonthlyUsd: number;
  supportMonthlyUsd: number;
  licensingMonthlyUsd: number;
  freeTierApplicability: 'possible' | 'unlikely';
  note: string;
}

export interface FinOpsFinding {
  id: string;
  severity: 'info' | 'review' | 'warning' | 'critical';
  category:
    | 'cost-driver'
    | 'right-sizing'
    | 'commitment'
    | 'egress'
    | 'licensing'
    | 'support'
    | 'mapping'
    | 'risk';
  title: string;
  recommendation: string;
  estimatedMonthlyImpactUsd?: number;
  providerId?: ProviderId;
}

export interface ExecutiveForecast {
  horizonDays: 90;
  assumption: string;
  providerForecasts: Array<{
    providerId: ProviderId;
    monthlyRunRateUsd: number;
    ninetyDayRunRateUsd: number;
    annualizedRunRateUsd: number;
  }>;
}

export interface CostCoverageMapEntry {
  providerId: ProviderId;
  dimension: string;
  status: string;
  pricedRows: number;
  approximateRows: number;
  monthlyUsd?: number;
  evidence: string;
  reviewCue: string;
}

export interface ComparisonAnalyticsResponse {
  comparisonId: string;
  generatedAt: string;
  pricingAsOf: string;
  executiveForecast: ExecutiveForecast;
  costCoverageMap: CostCoverageMapEntry[];
  costComposition: ProviderCostComposition[];
  providerDeltaAnalysis: ProviderDeltaAnalysis[];
  sensitivityScenarios: SensitivityScenarioRow[];
  commitmentRoiTimelines: CommitmentRoiTimeline[];
  commitmentCoverage: CommitmentCoverageRow[];
  tcoSignals: TcoSignal[];
  finOpsFindings: FinOpsFinding[];
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

export interface DataHealthResponse {
  generatedAt: string;
  freshnessPolicyHours: number;
  overallStatus: 'fresh' | 'stale' | 'degraded';
  alertCount: number;
  alerts: Array<{
    providerId?: ProviderId;
    severity: 'warning' | 'critical';
    message: string;
  }>;
  providers: Array<{
    providerId: ProviderId;
    status: 'success' | 'partial' | 'failed';
    freshness: 'fresh' | 'stale' | 'missing' | 'failed';
    lastSuccessfulRun?: string;
    ageHours?: number;
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
    message: string;
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
  pricingModel: PricingModelKey;
  granularity: IntervalKey;
  passwordProtected: boolean;
  workload: WorkloadRecord;
  breakdown: WorkloadCostBreakdown;
}

export interface ShareLinkAnalyticsResponse {
  token: string;
  totalViews: number;
  lastViewedAt?: string;
  countryViews: Array<{
    countryCode: string;
    views: number;
  }>;
  sectionViews: Array<{
    section: string;
    views: number;
    lastViewedAt?: string;
  }>;
}

export interface ExchangeRatesResponse {
  base: string;
  lastUpdated?: string;
  rates: Record<string, number>;
}

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';
export type ReportExportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReportExportJobResponse {
  jobId: string;
  comparisonId: string;
  format: ReportFormat;
  interval?: IntervalKey;
  pricingModel?: PricingModelKey;
  status: ReportExportJobStatus;
  fileName?: string;
  contentType?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  statusUrl: string;
  downloadUrl?: string;
}

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}
