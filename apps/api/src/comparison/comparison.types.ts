import {
  CostComponent,
  PricingBasis,
  PricingModelCost,
  ProviderId,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';

export interface CostIntervals {
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
  baseMonthlyCostUsd: number;
  pricingBasis?: PricingBasis;
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
  code: 'provider_pricing_failed';
  message: string;
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  warnings?: ComparisonWarning[];
}
