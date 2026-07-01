import {
  CostComponent,
  EgressTierBreakdown,
  PricingBasis,
  PricingModelKey,
  PricingModelCost,
  ProviderId,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';
import {
  NormalizedWorkloadSpec,
  ServiceRequirement,
  WorkloadSourceType,
  WorkloadType,
} from '../nws/nws.types';

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
  egressTiers?: EgressTierBreakdown[];
  pricingModels?: PricingModelCost[];
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

export interface ComparisonWarning {
  providerId?: ProviderId;
  code: 'provider_pricing_failed' | 'live_refresh_failed' | 'data_residency_region_adjusted';
  message: string;
}

export interface ComparisonRequirementSummary {
  sourceType: WorkloadSourceType;
  workloadName?: string;
  workloadType: WorkloadType;
  regionPreference?: string;
  workloadProfile?: Pick<
    NonNullable<NormalizedWorkloadSpec['workloadProfile']>,
    'environment' | 'dataResidency' | 'operatingSystem' | 'supportTier' | 'tags'
  >;
  serviceRequirements: ServiceRequirement[];
}

type ComparisonWorkloadProfile = NormalizedWorkloadSpec['workloadProfile'];

export interface PricingModelRecommendation {
  preferredModel: PricingModelKey;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  sourceSignals: {
    environment?: NonNullable<ComparisonWorkloadProfile>['environment'];
    commitmentPreferencePercent?: number;
    flexibilityBias: 'flexibility' | 'balanced' | 'cost-optimized';
  };
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  requirements?: ComparisonRequirementSummary;
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  pricingModelRecommendation?: PricingModelRecommendation;
  warnings?: ComparisonWarning[];
}
