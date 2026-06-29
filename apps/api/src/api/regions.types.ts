import { ProviderId } from '../adapters/common/cloud-provider-adapter';

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
