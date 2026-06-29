import { NormalizedWorkloadSpec } from '../../nws/nws.types';

export type ProviderId = 'aws' | 'azure' | 'gcp';
export type ServiceCategory = 'compute' | 'storage' | 'database' | 'network';
export type CostComponent = 'compute' | 'storage' | 'database' | 'egress';
export type PricingModelKey = 'on-demand' | 'reserved-1yr' | 'reserved-3yr';
export type PricingBasis = 'flat' | 'tiered';

export interface PricingModelCost {
  model: PricingModelKey;
  available: boolean;
  monthlyCostUsd?: number;
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
  baseMonthlyCostUsd: number;
  skuId: string;
  unit: string;
  unitPriceUsd: number;
  pricingBasis?: PricingBasis;
  pricingModels?: PricingModelCost[];
}

export interface ProviderPricingResult {
  providerId: ProviderId;
  lineItems: ProviderPricingLineItem[];
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

  refreshLivePricing(serviceIds: string[]): Promise<PricingCatalogRecord[]>;
}
