import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from '../common/cloud-provider-adapter';
import { defaultFetch, FetchLike, parseJsonResponse } from '../common/http-client';

interface AzureRetailPricesResponse {
  Items: AzureRetailPriceItem[];
  NextPageLink?: string;
}

interface AzureRetailPriceItem {
  currencyCode: string;
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  effectiveStartDate: string;
  meterId: string;
  meterName: string;
  productId: string;
  skuId: string;
  productName: string;
  skuName: string;
  serviceName: string;
  serviceFamily: string;
  unitOfMeasure: string;
  type: string;
  isPrimaryMeterRegion?: boolean;
  armSkuName?: string;
  reservationTerm?: string;
}

const AZURE_RETAIL_PRICES_ENDPOINT = 'https://prices.azure.com/api/retail/prices';

const CATALOG_REFRESH_CATEGORIES = ['compute', 'storage', 'database', 'network'] as const;
type CatalogRefreshCategory = (typeof CATALOG_REFRESH_CATEGORIES)[number];

const CATEGORY_FILTERS: Record<CatalogRefreshCategory, string[]> = {
  compute: [
    "serviceFamily eq 'Compute' and priceType eq 'Consumption'",
    "serviceFamily eq 'Compute' and priceType eq 'Reservation'",
  ],
  storage: ["serviceFamily eq 'Storage' and priceType eq 'Consumption'"],
  database: ["serviceFamily eq 'Databases' and priceType eq 'Consumption'"],
  network: ["serviceFamily eq 'Networking' and priceType eq 'Consumption'"],
};

export class AzureProviderAdapter extends BaseCloudProviderAdapter {
  readonly providerId: ProviderId = 'azure';

  constructor(
    catalogReader: PricingCatalogReader,
    defaultRegion: string,
    private readonly fetchClient: FetchLike = defaultFetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    super(catalogReader, defaultRegion);
  }

  async refreshPricingCatalog(
    options: RefreshPricingCatalogOptions = {},
  ): Promise<PricingCatalogRecord[]> {
    const categories = catalogRefreshCategories(options.categories);
    const fetchedAt = options.fetchedAt ?? this.now().toISOString();
    const records: PricingCatalogRecord[] = [];

    for (const category of categories) {
      records.push(...(await this.fetchCategory(category, fetchedAt, options.region)));
    }

    return records;
  }

  async refreshLivePricing(
    serviceIds: string[],
    options: RefreshPricingCatalogOptions = {},
  ): Promise<PricingCatalogRecord[]> {
    const allRecords = await this.refreshPricingCatalog(options);
    return uniqueSkuRecords(
      allRecords.filter(
        (record) => serviceIds.includes(record.skuId) || serviceIds.includes(record.serviceName),
      ),
    );
  }

  private async fetchCategory(
    category: CatalogRefreshCategory,
    fetchedAt: string,
    region?: string,
  ): Promise<PricingCatalogRecord[]> {
    const records: PricingCatalogRecord[] = [];

    for (const categoryFilter of CATEGORY_FILTERS[category]) {
      const filter = [categoryFilter, region ? `armRegionName eq '${region}'` : undefined]
        .filter(Boolean)
        .join(' and ');
      const url = new URL(AZURE_RETAIL_PRICES_ENDPOINT);
      url.searchParams.set('currencyCode', 'USD');
      url.searchParams.set('$filter', filter);
      let nextPageUrl: string | undefined = url.toString();

      while (nextPageUrl) {
        const response = await this.fetchClient(nextPageUrl);
        const parsed = await parseJsonResponse<AzureRetailPricesResponse>(
          this.providerId,
          response,
        );

        records.push(...parsed.Items.map((item) => this.normalizeItem(item, category, fetchedAt)));
        nextPageUrl = parsed.NextPageLink;
      }
    }

    return records;
  }

  private normalizeItem(
    item: AzureRetailPriceItem,
    category: ServiceCategory,
    fetchedAt: string,
  ): PricingCatalogRecord {
    return {
      provider: this.providerId,
      serviceCategory: category,
      serviceName: item.serviceName,
      skuId: item.skuId,
      skuDescription: `${item.productName} - ${item.meterName}`,
      region: item.armRegionName,
      unit: item.unitOfMeasure,
      unitPriceUsd: item.unitPrice,
      attributes: {
        currencyCode: item.currencyCode,
        meterId: item.meterId,
        productId: item.productId,
        skuName: item.skuName,
        serviceFamily: item.serviceFamily,
        priceType: item.type,
        pricingModel: azurePricingModel(item),
        reservationTerm: item.reservationTerm,
        armSkuName: item.armSkuName,
        isPrimaryMeterRegion: item.isPrimaryMeterRegion,
        vcpu: parseAzureVcpu(item.skuName),
        memoryGb: parseAzureMemoryGb(item.armSkuName ?? item.skuName),
      },
      effectiveDate: item.effectiveStartDate,
      fetchedAt,
    };
  }
}

function catalogRefreshCategories(
  categories: ServiceCategory[] | undefined,
): CatalogRefreshCategory[] {
  if (!categories) {
    return [...CATALOG_REFRESH_CATEGORIES];
  }

  return categories.filter((category): category is CatalogRefreshCategory =>
    CATALOG_REFRESH_CATEGORIES.includes(category as CatalogRefreshCategory),
  );
}

function uniqueSkuRecords(records: PricingCatalogRecord[]): PricingCatalogRecord[] {
  const byKey = new Map<string, PricingCatalogRecord>();

  for (const record of records) {
    const key = `${record.skuId}:${record.region}:${record.unit}`;
    if (!byKey.has(key)) {
      byKey.set(key, record);
    }
  }

  return [...byKey.values()];
}

function parseAzureVcpu(skuName: string): number | undefined {
  const match = skuName.match(/[A-Z](?<vcpu>\d+)/i);
  return match?.groups?.vcpu ? Number.parseInt(match.groups.vcpu, 10) : undefined;
}

function parseAzureMemoryGb(skuName: string): number | undefined {
  const normalized = skuName
    .toLowerCase()
    .replace(/^standard[_\s-]?/, '')
    .replace(/[_\s-]/g, '');
  const match = normalized.match(/^(?<family>[a-z]+)(?<vcpu>\d+)(?<variant>[a-z]*)v?\d*$/i);
  const familyPrefix = match?.groups?.family?.[0]?.toLowerCase();
  const vcpu = match?.groups?.vcpu ? Number.parseInt(match.groups.vcpu, 10) : undefined;
  const variant = match?.groups?.variant ?? '';

  if (!familyPrefix || !vcpu) {
    return undefined;
  }

  switch (familyPrefix) {
    case 'b':
      if (vcpu === 1) {
        return variant.includes('m') ? 2 : 1;
      }
      return variant.includes('m') ? vcpu * 4 : vcpu * 2;
    case 'd':
      return vcpu * 4;
    case 'e':
      return vcpu * 8;
    case 'f':
      return vcpu * 2;
    case 'l':
      return vcpu * 8;
    case 'm':
      return vcpu * 16;
    case 'n':
      return vcpu * 7;
    default:
      return undefined;
  }
}

function azurePricingModel(
  item: AzureRetailPriceItem,
): 'on-demand' | 'reserved-1yr' | 'reserved-3yr' {
  if (item.type !== 'Reservation') {
    return 'on-demand';
  }

  if (item.reservationTerm?.includes('3')) {
    return 'reserved-3yr';
  }

  return 'reserved-1yr';
}
