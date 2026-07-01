import { NormalizedWorkloadSpec } from '../../nws/nws.types';

export type ProviderId = 'aws' | 'azure' | 'gcp';
export type ServiceCategory =
  'compute' | 'storage' | 'database' | 'network' | 'support' | 'licensing' | 'operations';
export type CostComponent =
  | 'compute'
  | 'storage'
  | 'database'
  | 'egress'
  | 'networking'
  | 'support'
  | 'licensing'
  | 'operations';
export type PricingModelKey =
  'on-demand' | 'reserved-1yr' | 'reserved-3yr' | 'spot' | 'savings-plan';
export type PricingBasis = 'flat' | 'tiered';
export type PricingVolatility = 'stable' | 'variable' | 'volatile';
export type PricingSource = 'catalog' | 'modeled-estimate';

export interface EgressTierBreakdown {
  tierFromGb: number;
  tierToGb?: number;
  pricePerGb: number;
  billableGb: number;
  monthlyCostUsd: number;
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

export interface PricingCatalogRecord {
  provider: ProviderId;
  serviceCategory: ServiceCategory;
  serviceName: string;
  skuId: string;
  skuDescription?: string;
  region: string;
  unit: string;
  unitPriceUsd: number;
  attributes?: Record<string, unknown>;
  effectiveDate: string;
  fetchedAt: string;
}

export interface ProviderPricingLineItem {
  category: ServiceCategory;
  costComponent?: CostComponent;
  description: string;
  isApproximate: boolean;
  baseHourlyCostUsd?: number;
  baseMonthlyCostUsd: number;
  skuId: string;
  region: string;
  unit: string;
  unitPriceUsd: number;
  pricingBasis?: PricingBasis;
  egressTiers?: EgressTierBreakdown[];
  pricingModels?: PricingModelCost[];
}

export interface ProviderPricingResult {
  providerId: ProviderId;
  lineItems: ProviderPricingLineItem[];
  baseHourlyCostUsd?: number;
  baseMonthlyCostUsd: number;
}

export interface PricingCatalogQuery {
  provider: ProviderId;
  category?: ServiceCategory;
  region?: string;
  serviceIds?: string[];
}

export interface PricingCatalogReader {
  find(query: PricingCatalogQuery): Promise<PricingCatalogRecord[]>;
}

export interface RefreshPricingCatalogOptions {
  categories?: ServiceCategory[];
  region?: string;
  fetchedAt?: string;
}

export interface CloudProviderAdapter {
  readonly providerId: ProviderId;

  priceWorkload(nws: NormalizedWorkloadSpec): Promise<ProviderPricingResult>;

  refreshPricingCatalog(options?: RefreshPricingCatalogOptions): Promise<PricingCatalogRecord[]>;

  refreshLivePricing(
    serviceIds: string[],
    options?: RefreshPricingCatalogOptions,
  ): Promise<PricingCatalogRecord[]>;
}
