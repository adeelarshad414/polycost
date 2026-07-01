import {
  CostComponent,
  EgressTierBreakdown,
  PricingBasis,
  PricingModelCost,
  ProviderId,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';
import { ServiceRequirement, WorkloadSourceType, WorkloadType } from '../nws/nws.types';

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
  code: 'provider_pricing_failed' | 'live_refresh_failed';
  message: string;
}

export interface ComparisonRequirementSummary {
  sourceType: WorkloadSourceType;
  workloadName?: string;
  workloadType: WorkloadType;
  regionPreference?: string;
  serviceRequirements: ServiceRequirement[];
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  requirements?: ComparisonRequirementSummary;
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  warnings?: ComparisonWarning[];
}
