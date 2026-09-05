import { NormalizedWorkloadSpec } from '../../nws/nws.types.js';

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
export type RateSource = 'pricing_catalog' | 'pricing_rates' | 'modeled_estimate' | 'manual_model';

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

export interface PricingTrace {
  providerId: ProviderId;
  serviceCategory: ServiceCategory;
  costComponent?: CostComponent;
  source: RateSource;
  sourceRecordKey: string;
  resolvedSkuId?: string;
  sourceSkuId?: string;
  providerServiceName?: string;
  skuDescription?: string;
  region?: string;
  catalogRegion?: string;
  unit?: string;
  unitPriceUsd?: number;
  currency?: string;
  effectiveDate?: string;
  fetchedAt?: string;
  sourceEndpoint?: string;
  sourceRecordId?: string;
  transformVersion?: string;
  sourcePayloadHash?: string;
  derivation?: {
    expression: string;
    unitPriceUsd?: number;
    quantity: number;
    monthlyCostUsd: number;
    hourlyCostUsd?: number;
    monthlyHours?: number;
    // GCP Compute Engine sustained-use discount, when applied. `listMonthlyCostUsd`
    // is the pre-discount on-demand cost so the derivation stays fully auditable.
    listMonthlyCostUsd?: number;
    sustainedUseDiscountPercent?: number;
  };
  equivalenceConfidence?: 'direct' | 'approximate' | 'modeled';
  pricingTermCode?: string;
  paymentOptionCode?: string;
  pricingBasis?: PricingBasis;
  isApproximate: boolean;
  isEstimate: boolean;
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
  rateSource?: RateSource;
  rateSourceSkuId?: string;
  pricingTermCode?: string;
  paymentOptionCode?: string;
  rateCurrency?: string;
  rateValidFrom?: string;
  rateSourceFetchedAt?: string;
  pricingTrace?: PricingTrace;
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
