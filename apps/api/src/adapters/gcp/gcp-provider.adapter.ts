import { SecretsReader } from '../../secrets/secrets.service';
import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from '../common/cloud-provider-adapter';
import { AdapterCredentialError } from '../common/adapter-errors';
import { defaultFetch, FetchLike, parseJsonResponse } from '../common/http-client';

interface GcpServicesResponse {
  services: GcpService[];
  nextPageToken?: string;
}

interface GcpService {
  name: string;
  serviceId: string;
  displayName: string;
  businessEntityName: string;
}

interface GcpSkusResponse {
  skus: GcpSku[];
  nextPageToken?: string;
}

interface GcpSku {
  skuId: string;
  description: string;
  category: {
    serviceDisplayName: string;
    resourceFamily: string;
    resourceGroup: string;
    usageType: string;
  };
  serviceRegions: string[];
  pricingInfo: Array<{
    effectiveTime: string;
    pricingExpression: {
      usageUnit: string;
      usageUnitDescription: string;
      baseUnit?: string;
      baseUnitDescription?: string;
      tieredRates: Array<{
        startUsageAmount: number;
        unitPrice: {
          currencyCode: string;
          units?: string;
          nanos?: number;
        };
      }>;
    };
  }>;
  serviceProviderName: string;
}

const GCP_CATALOG_ENDPOINT = 'https://cloudbilling.googleapis.com/v1/services';
const GCP_SECRET_PATH = 'polycost/providers/gcp';

const CATALOG_REFRESH_CATEGORIES = ['compute', 'storage', 'database', 'network'] as const;
type CatalogRefreshCategory = (typeof CATALOG_REFRESH_CATEGORIES)[number];

const CATEGORY_MATCHERS: Record<CatalogRefreshCategory, RegExp[]> = {
  compute: [/compute/i],
  storage: [/storage/i],
  database: [/sql/i, /database/i, /memorystore/i],
  network: [/network/i, /vpc/i],
};

export class GcpProviderAdapter extends BaseCloudProviderAdapter {
  readonly providerId: ProviderId = 'gcp';

  constructor(
    catalogReader: PricingCatalogReader,
    defaultRegion: string,
    private readonly secretsReader: SecretsReader,
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
    const token = await this.getAccessToken();
    const services = await this.fetchServices(token);
    const records: PricingCatalogRecord[] = [];

    for (const category of categories) {
      const matchingServices = services.filter((service) =>
        CATEGORY_MATCHERS[category].some((matcher) => matcher.test(service.displayName)),
      );

      for (const service of matchingServices) {
        records.push(
          ...(await this.fetchServiceSkus(
            service.name,
            category,
            fetchedAt,
            token,
            options.region,
          )),
        );
      }
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

  private async fetchServices(token: string): Promise<GcpService[]> {
    const services: GcpService[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(GCP_CATALOG_ENDPOINT);
      url.searchParams.set('pageSize', '5000');

      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.fetchClient(url.toString(), {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const parsed = await parseJsonResponse<GcpServicesResponse>(this.providerId, response);

      services.push(...parsed.services);
      pageToken = parsed.nextPageToken;
    } while (pageToken);

    return services;
  }

  private async fetchServiceSkus(
    serviceName: string,
    category: ServiceCategory,
    fetchedAt: string,
    token: string,
    region?: string,
  ): Promise<PricingCatalogRecord[]> {
    const records: PricingCatalogRecord[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`https://cloudbilling.googleapis.com/v1/${serviceName}/skus`);
      url.searchParams.set('currencyCode', 'USD');
      url.searchParams.set('pageSize', '5000');

      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.fetchClient(url.toString(), {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const parsed = await parseJsonResponse<GcpSkusResponse>(this.providerId, response);

      records.push(
        ...parsed.skus.flatMap((sku) => this.normalizeSku(sku, category, fetchedAt, region)),
      );
      pageToken = parsed.nextPageToken;
    } while (pageToken);

    return records;
  }

  private normalizeSku(
    sku: GcpSku,
    category: ServiceCategory,
    fetchedAt: string,
    regionFilter?: string,
  ): PricingCatalogRecord[] {
    const pricingExpression = sku.pricingInfo[0]?.pricingExpression;
    const price = pricingExpression?.tieredRates[0]?.unitPrice;

    if (!price) {
      return [];
    }

    const regions = regionFilter
      ? sku.serviceRegions.filter((region) => region === regionFilter)
      : sku.serviceRegions;

    return regions.map((region) => ({
      provider: this.providerId,
      serviceCategory: category,
      serviceName: sku.category.serviceDisplayName,
      skuId: sku.skuId,
      skuDescription: sku.description,
      region,
      unit: pricingExpression?.usageUnitDescription ?? pricingExpression?.usageUnit ?? 'unit',
      unitPriceUsd: moneyToNumber(price.units, price.nanos),
      attributes: {
        pricingModel: 'on-demand',
        resourceFamily: sku.category.resourceFamily,
        resourceGroup: sku.category.resourceGroup,
        usageType: sku.category.usageType,
        serviceProviderName: sku.serviceProviderName,
        baseUnit: pricingExpression?.baseUnit,
        baseUnitDescription: pricingExpression?.baseUnitDescription,
        ...(category === 'network' && pricingExpression
          ? { egressTiers: gcpTieredRates(pricingExpression.tieredRates) }
          : {}),
      },
      effectiveDate: sku.pricingInfo[0]?.effectiveTime ?? fetchedAt,
      fetchedAt,
    }));
  }

  private async getAccessToken(): Promise<string> {
    try {
      return await this.secretsReader.getSecret(GCP_SECRET_PATH, 'access_token');
    } catch {
      throw new AdapterCredentialError(
        this.providerId,
        'missing required GCP Cloud Billing access token',
      );
    }
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

function moneyToNumber(units = '0', nanos = 0): number {
  return Number.parseInt(units, 10) + nanos / 1_000_000_000;
}

function gcpTieredRates(
  rates: GcpSku['pricingInfo'][number]['pricingExpression']['tieredRates'],
): Array<{ startUsageAmount: number; unitPriceUsd: number }> {
  return rates.map((rate) => ({
    startUsageAmount: rate.startUsageAmount,
    unitPriceUsd: moneyToNumber(rate.unitPrice.units, rate.unitPrice.nanos),
  }));
}
