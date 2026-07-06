import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  PricingModelKey,
  ProviderId,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from '../common/cloud-provider-adapter';
import { defaultFetch, FetchLike, parseJsonResponse } from '../common/http-client';

interface AwsBulkPriceListResponse {
  products: Record<string, AwsProduct>;
  terms: {
    OnDemand?: Record<string, Record<string, AwsOnDemandTerm>>;
    Reserved?: Record<string, Record<string, AwsReservedTerm>>;
  };
  publicationDate?: string;
}

interface AwsProduct {
  sku: string;
  productFamily?: string;
  attributes: Record<string, string>;
}

interface AwsPriceDimension {
  unit: string;
  description: string;
  pricePerUnit: {
    USD?: string;
  };
}

interface AwsOnDemandTerm {
  effectiveDate: string;
  priceDimensions: Record<string, AwsPriceDimension>;
}

interface AwsReservedTerm extends AwsOnDemandTerm {
  termAttributes?: Record<string, string>;
}

const AWS_BULK_PRICING_ENDPOINT = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';

const CATALOG_REFRESH_CATEGORIES = ['compute', 'storage', 'database', 'network'] as const;
type CatalogRefreshCategory = (typeof CATALOG_REFRESH_CATEGORIES)[number];

const CATEGORY_SERVICE_CODES: Record<CatalogRefreshCategory, string[]> = {
  compute: ['AmazonEC2'],
  storage: ['AmazonS3'],
  database: ['AmazonRDS', 'AmazonElastiCache'],
  network: ['AmazonVPC'],
};

const AWS_LOCATION_TO_REGION: Record<string, string> = {
  'US East (N. Virginia)': 'us-east-1',
  'US East (Ohio)': 'us-east-2',
  'US West (Oregon)': 'us-west-2',
};

export class AwsProviderAdapter extends BaseCloudProviderAdapter {
  readonly providerId: ProviderId = 'aws';
  private readonly fetchClient: FetchLike;
  private readonly now: () => Date;

  constructor(catalogReader: PricingCatalogReader, defaultRegion: string);
  constructor(
    catalogReader: PricingCatalogReader,
    defaultRegion: string,
    fetchClient: FetchLike,
    now?: () => Date,
  );
  constructor(
    catalogReader: PricingCatalogReader,
    defaultRegion: string,
    legacySecretsReader: unknown,
    fetchClient?: FetchLike,
    now?: () => Date,
  );
  constructor(
    catalogReader: PricingCatalogReader,
    defaultRegion: string,
    fetchClientOrLegacySecretsReader: FetchLike | unknown = defaultFetch,
    fetchClientOrNow?: FetchLike | (() => Date),
    now?: () => Date,
  ) {
    super(catalogReader, defaultRegion);
    const hasLegacySecretsReader = typeof fetchClientOrLegacySecretsReader !== 'function';
    this.fetchClient = hasLegacySecretsReader
      ? ((fetchClientOrNow as FetchLike | undefined) ?? defaultFetch)
      : (fetchClientOrLegacySecretsReader as FetchLike);
    this.now =
      (hasLegacySecretsReader ? now : (fetchClientOrNow as (() => Date) | undefined)) ??
      (() => new Date());
  }

  async refreshPricingCatalog(
    options: RefreshPricingCatalogOptions = {},
  ): Promise<PricingCatalogRecord[]> {
    const categories = catalogRefreshCategories(options.categories);
    const fetchedAt = options.fetchedAt ?? this.now().toISOString();
    const records: PricingCatalogRecord[] = [];

    for (const category of categories) {
      for (const serviceCode of CATEGORY_SERVICE_CODES[category]) {
        records.push(
          ...(await this.fetchServiceProducts(serviceCode, category, fetchedAt, options.region)),
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

  private async fetchServiceProducts(
    serviceCode: string,
    category: ServiceCategory,
    fetchedAt: string,
    region?: string,
  ): Promise<PricingCatalogRecord[]> {
    const url = region
      ? `${AWS_BULK_PRICING_ENDPOINT}/${serviceCode}/current/${region}/index.json`
      : `${AWS_BULK_PRICING_ENDPOINT}/${serviceCode}/current/index.json`;
    const response = await this.fetchClient(url);
    const parsed = await parseJsonResponse<AwsBulkPriceListResponse>(this.providerId, response);

    return this.normalizeBulkCatalog(parsed, serviceCode, category, fetchedAt, region);
  }

  private normalizeBulkCatalog(
    priceList: AwsBulkPriceListResponse,
    serviceCode: string,
    category: ServiceCategory,
    fetchedAt: string,
    regionFilter?: string,
  ): PricingCatalogRecord[] {
    return Object.values(priceList.products).flatMap((product) => {
      const region =
        product.attributes.regionCode ??
        AWS_LOCATION_TO_REGION[product.attributes.location] ??
        product.attributes.location;

      if (regionFilter && region !== regionFilter) {
        return [];
      }

      const onDemandTerms = Object.entries(priceList.terms.OnDemand?.[product.sku] ?? {});
      const reservedTerms = Object.entries(priceList.terms.Reserved?.[product.sku] ?? {});

      return [
        ...onDemandTerms.flatMap(([termCode, term]) =>
          this.normalizeTerm(
            product,
            serviceCode,
            termCode,
            term,
            category,
            region,
            fetchedAt,
            priceList.publicationDate,
            'on-demand',
          ),
        ),
        ...reservedTerms.flatMap(([termCode, term]) => {
          const pricingModel = awsReservedPricingModel(term);

          if (!pricingModel) {
            return [];
          }

          return this.normalizeTerm(
            product,
            serviceCode,
            termCode,
            term,
            category,
            region,
            fetchedAt,
            priceList.publicationDate,
            pricingModel,
          );
        }),
      ];
    });
  }

  private normalizeTerm(
    product: AwsProduct,
    serviceCode: string,
    termCode: string,
    term: AwsOnDemandTerm | AwsReservedTerm,
    category: ServiceCategory,
    region: string,
    fetchedAt: string,
    publicationDate: string | undefined,
    pricingModel: PricingModelKey,
  ): PricingCatalogRecord[] {
    return this.priceDimensions(term, pricingModel).map(([dimensionCode, dimension]) => ({
      provider: this.providerId,
      serviceCategory: category,
      serviceName: product.attributes.servicename ?? product.attributes.servicecode ?? serviceCode,
      skuId:
        pricingModel === 'on-demand'
          ? product.sku
          : `${product.sku}:${pricingModel}:${termCode}:${dimensionCode}`,
      skuDescription: dimension.description,
      region,
      unit: dimension.unit,
      unitPriceUsd: Number.parseFloat(dimension.pricePerUnit.USD ?? '0'),
      attributes: {
        ...product.attributes,
        pricingModel,
        productFamily: product.productFamily,
        rawServiceCode: serviceCode,
        ...(isReservedTerm(term) ? term.termAttributes : {}),
        ...(isReservedTerm(term) ? { upfrontOption: awsUpfrontOption(term) } : {}),
        vcpu: parseOptionalNumber(product.attributes.vcpu),
        memoryGb: parseMemoryGb(product.attributes.memory),
      },
      effectiveDate: term.effectiveDate ?? publicationDate ?? fetchedAt,
      fetchedAt,
    }));
  }

  private priceDimensions(
    term: AwsOnDemandTerm | AwsReservedTerm,
    pricingModel: PricingModelKey,
  ): Array<[string, AwsPriceDimension]> {
    const dimensions = Object.entries(term.priceDimensions).filter(
      ([, dimension]) => dimension.pricePerUnit.USD !== undefined,
    );

    if (pricingModel === 'on-demand') {
      return dimensions.slice(0, 1);
    }

    return dimensions
      .filter(([, dimension]) => {
        const normalizedUnit = dimension.unit.toLowerCase();
        const normalizedDescription = dimension.description.toLowerCase();

        return normalizedUnit.includes('hour') || normalizedDescription.includes('hourly');
      })
      .slice(0, 1);
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
    const key = `${record.skuId}:${record.region}:${record.unit}:${String(
      record.attributes?.pricingModel ?? 'on-demand',
    )}`;
    if (!byKey.has(key)) {
      byKey.set(key, record);
    }
  }

  return [...byKey.values()];
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMemoryGb(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/,/g, '');
  const match = normalized.match(/(?<amount>\d+(\.\d+)?)\s*GiB/i);
  return match?.groups?.amount ? Number.parseFloat(match.groups.amount) : undefined;
}

function awsReservedPricingModel(term: AwsReservedTerm): PricingModelKey | undefined {
  const length =
    term.termAttributes?.LeaseContractLength ??
    term.termAttributes?.leaseContractLength ??
    term.termAttributes?.leasecontractlength;

  if (!length) {
    return undefined;
  }

  if (length.includes('3') || /three/i.test(length)) {
    return 'reserved-3yr';
  }

  if (length.includes('1') || /one/i.test(length)) {
    return 'reserved-1yr';
  }

  return undefined;
}

function awsUpfrontOption(term: AwsReservedTerm): string {
  return (
    term.termAttributes?.PurchaseOption ??
    term.termAttributes?.purchaseOption ??
    term.termAttributes?.purchaseoption ??
    'No Upfront'
  );
}

function isReservedTerm(term: AwsOnDemandTerm | AwsReservedTerm): term is AwsReservedTerm {
  return 'termAttributes' in term;
}
