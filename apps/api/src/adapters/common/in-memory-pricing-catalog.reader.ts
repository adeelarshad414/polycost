import {
  PricingCatalogQuery,
  PricingCatalogReader,
  PricingCatalogRecord,
} from './cloud-provider-adapter.js';

export class InMemoryPricingCatalogReader implements PricingCatalogReader {
  constructor(private readonly records: PricingCatalogRecord[]) {}

  async find(query: PricingCatalogQuery): Promise<PricingCatalogRecord[]> {
    return this.records.filter((record) => {
      const matchesProvider = record.provider === query.provider;
      const matchesCategory =
        query.category === undefined || record.serviceCategory === query.category;
      const matchesRegion = query.region === undefined || record.region === query.region;
      const matchesServiceId =
        query.serviceIds === undefined ||
        query.serviceIds.includes(record.skuId) ||
        query.serviceIds.includes(record.serviceName);

      return matchesProvider && matchesCategory && matchesRegion && matchesServiceId;
    });
  }
}
