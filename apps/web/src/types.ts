export const PROVIDER_ORDER = ['aws', 'azure', 'gcp'] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];
export type ServiceCategory = 'compute' | 'storage' | 'database' | 'network';
export type IntervalKey = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const INTERVALS: Array<{ key: IntervalKey; label: string }> = [
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
  sourceTraceability?: Array<{
    nwsPath: string;
    sourceRef: string;
  }>;
}

export interface ParsedNwsDraft {
  draftNws: NormalizedWorkloadSpec;
  parserConfidence: 'low' | 'medium' | 'high';
  fieldsRequiringReview: string[];
}

export interface CostIntervals {
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
  yearly: number;
}

export interface ComparisonLineItem {
  category: ServiceCategory;
  description: string;
  isApproximate: boolean;
  baseMonthlyCostUsd: number;
}

export interface ComparisonProviderResult {
  providerId: ProviderId;
  lineItems: ComparisonLineItem[];
  totals: CostIntervals;
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
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
  }>;
}

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}
