/* eslint-disable security/detect-object-injection, security/detect-unsafe-regex -- Reviewed 2026-07-06: provider catalog keys and bounded SKU parsing operate on controlled cloud catalog data; see docs/SECURITY-SUPPRESSIONS.md. */
import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  PricingModelKey,
  ProviderId,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from '../common/cloud-provider-adapter';
import { Readable } from 'node:stream';
import {
  defaultFetch,
  FetchLike,
  HttpResponseLike,
  parseJsonResponse,
} from '../common/http-client';
import { streamAwsBulkPriceList } from './aws-bulk-stream';

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
  network: ['AmazonVPC', 'AmazonEC2'],
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
    // Default to the region-specific index (~480MB for EC2). Without a region
    // the AWS bulk API serves the ALL-regions index (multiple GB), which is
    // wasteful and impractical to fetch on every refresh.
    const region = options.region ?? this.defaultRegion;
    const records: PricingCatalogRecord[] = [];

    for (const category of categories) {
      for (const serviceCode of CATEGORY_SERVICE_CODES[category]) {
        const serviceRecords = await this.fetchServiceProducts(
          serviceCode,
          category,
          fetchedAt,
          region,
        );
        // Loop-push (not push(...largeArray)) — a region's EC2 catalog can hold
        // tens of thousands of matched SKUs; spreading them as call arguments
        // would overflow the stack.
        for (const record of serviceRecords) {
          records.push(record);
        }
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

    const parsed = await this.readBulkPriceList(response, serviceCode, category);

    return this.normalizeBulkCatalog(parsed, serviceCode, category, fetchedAt, region);
  }

  /**
   * The AWS EC2 region index is ~480 MB and OOMs a whole-buffer JSON.parse.
   * When the response exposes a body stream (real fetch), stream-parse it and
   * keep only the SKUs matching this category. Fall back to buffered parsing
   * when no stream is available (e.g. small mocked responses in tests).
   */
  private async readBulkPriceList(
    response: HttpResponseLike,
    serviceCode: string,
    category: ServiceCategory,
  ): Promise<AwsBulkPriceListResponse> {
    if (!response.ok) {
      // Delegate to the buffered path purely to raise the standard AdapterApiError.
      return parseJsonResponse<AwsBulkPriceListResponse>(this.providerId, response);
    }

    const bodyStream = toNodeReadable(response.body);
    if (bodyStream) {
      const streamed = await streamAwsBulkPriceList<AwsProduct, AwsOnDemandTerm>(
        bodyStream,
        (product) => awsProductMatchesCategory(product, category, serviceCode),
      );
      return streamed as unknown as AwsBulkPriceListResponse;
    }

    return parseJsonResponse<AwsBulkPriceListResponse>(this.providerId, response);
  }

  private normalizeBulkCatalog(
    priceList: AwsBulkPriceListResponse,
    serviceCode: string,
    category: ServiceCategory,
    fetchedAt: string,
    regionFilter?: string,
  ): PricingCatalogRecord[] {
    return Object.values(priceList.products).flatMap((product) => {
      if (!awsProductMatchesCategory(product, category, serviceCode)) {
        return [];
      }

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
        sourceEndpoint: `${AWS_BULK_PRICING_ENDPOINT}/${serviceCode}/current/index.json`,
        rawSourceRecordId: `${product.sku}:${termCode}:${dimensionCode}`,
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

function toNodeReadable(body: unknown): Readable | undefined {
  if (!body) {
    return undefined;
  }
  if (body instanceof Readable) {
    return body;
  }
  // Web ReadableStream (what the global fetch Response exposes) -> Node Readable.
  if (typeof (body as { getReader?: unknown }).getReader === 'function') {
    return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
  }
  return undefined;
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

function awsProductMatchesCategory(
  product: AwsProduct,
  category: ServiceCategory,
  serviceCode: string,
): boolean {
  if (serviceCode !== 'AmazonEC2') {
    return true;
  }

  switch (category) {
    case 'compute': {
      const isComputeProduct =
        product.attributes.instanceType !== undefined ||
        normalizedProductFamily(product).includes('compute');
      if (!isComputeProduct) {
        return false;
      }
      // Keep only the standard on-demand rate: Linux, Shared tenancy, no
      // pre-installed software, used (not capacity-reserved) capacity, on-demand
      // market. Without this, "cheapest-wins" selection could pick a Windows,
      // Dedicated, capacity-reservation, or Spot SKU. Attributes that are absent
      // (e.g. sparse fixtures) are treated as matching so nothing is over-filtered.
      const { operatingSystem, tenancy, preInstalledSw, capacitystatus, marketoption } =
        product.attributes;
      return (
        (operatingSystem === undefined || operatingSystem === 'Linux') &&
        (tenancy === undefined || tenancy === 'Shared') &&
        (preInstalledSw === undefined || preInstalledSw === 'NA') &&
        (capacitystatus === undefined || capacitystatus === 'Used') &&
        (marketoption === undefined || marketoption === 'OnDemand')
      );
    }
    case 'network':
      return (
        normalizedProductFamily(product).includes('data transfer') ||
        normalizedTransferType(product).length > 0 ||
        normalizedUsageType(product).includes('data')
      );
    case 'storage':
    case 'database':
    case 'support':
    case 'licensing':
    case 'operations':
      return true;
  }
}

function normalizedProductFamily(product: AwsProduct): string {
  return (product.productFamily ?? '').toLowerCase();
}

function normalizedTransferType(product: AwsProduct): string {
  return (product.attributes.transferType ?? '').toLowerCase();
}

function normalizedUsageType(product: AwsProduct): string {
  return (product.attributes.usagetype ?? '').toLowerCase();
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
