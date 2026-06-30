import {
  CostComponent,
  PricingBasis,
  PricingModelCost,
  ProviderId,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';

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

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  warnings?: ComparisonWarning[];
}
