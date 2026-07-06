import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
  RefreshPricingCatalogOptions,
} from '../common/cloud-provider-adapter';
import { mockPricingCatalogRecords } from './mock-pricing-fixtures';

export class MockProviderAdapter extends BaseCloudProviderAdapter {
  constructor(
    readonly providerId: ProviderId,
    catalogReader: PricingCatalogReader,
    private readonly providerDefaultRegion: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    super(catalogReader, providerDefaultRegion);
  }

  async refreshPricingCatalog(
    options: RefreshPricingCatalogOptions = {},
  ): Promise<PricingCatalogRecord[]> {
    return mockPricingCatalogRecords(this.providerId, {
      region: options.region ?? this.providerDefaultRegion,
      fetchedAt: options.fetchedAt ?? this.now().toISOString(),
    }).filter((record) => matchesCategories(record, options.categories));
  }

  async refreshLivePricing(
    serviceIds: string[],
    options: RefreshPricingCatalogOptions = {},
  ): Promise<PricingCatalogRecord[]> {
    const allRecords = await this.refreshPricingCatalog(options);

    if (serviceIds.length === 0) {
      return allRecords;
    }

    return allRecords.filter(
      (record) => serviceIds.includes(record.skuId) || serviceIds.includes(record.serviceName),
    );
  }
}

export function createMockProviderAdapters(
  catalogReader: PricingCatalogReader,
  defaultRegions: Record<ProviderId, string>,
): MockProviderAdapter[] {
  return [
    new MockProviderAdapter('aws', catalogReader, defaultRegions.aws),
    new MockProviderAdapter('azure', catalogReader, defaultRegions.azure),
    new MockProviderAdapter('gcp', catalogReader, defaultRegions.gcp),
  ];
}

function matchesCategories(
  record: PricingCatalogRecord,
  categories: RefreshPricingCatalogOptions['categories'],
): boolean {
  return !categories || categories.length === 0 || categories.includes(record.serviceCategory);
}
