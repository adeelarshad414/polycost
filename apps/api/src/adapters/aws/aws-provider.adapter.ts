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
import { AwsCredentials, signAwsJsonRequest } from './aws-signature-v4';

interface AwsGetProductsResponse {
  FormatVersion: string;
  NextToken?: string;
  PriceList: string[];
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

interface AwsPriceListItem {
  product: {
    sku: string;
    productFamily?: string;
    attributes: Record<string, string>;
  };
  serviceCode: string;
  terms: {
    OnDemand?: Record<string, AwsOnDemandTerm>;
  };
  publicationDate?: string;
}

const AWS_PRICING_HOST = 'api.pricing.us-east-1.amazonaws.com';
const AWS_PRICING_ENDPOINT = `https://${AWS_PRICING_HOST}`;
const AWS_SECRET_PATH = 'polycost/providers/aws';

const CATEGORY_SERVICE_CODES: Record<ServiceCategory, string[]> = {
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
    const categories = options.categories ?? ['compute', 'storage', 'database', 'network'];
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

  async refreshLivePricing(serviceIds: string[]): Promise<PricingCatalogRecord[]> {
    const allRecords = await this.refreshPricingCatalog();
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
    const credentials = await this.getCredentials();
    const records: PricingCatalogRecord[] = [];
    let nextToken: string | undefined;

    do {
      const requestBody = JSON.stringify({
        ServiceCode: serviceCode,
        FormatVersion: 'aws_v1',
        MaxResults: 100,
        ...(nextToken ? { NextToken: nextToken } : {}),
      });
      const signedRequest = signAwsJsonRequest({
        credentials,
        region: 'us-east-1',
        service: 'pricing',
        host: AWS_PRICING_HOST,
        target: 'AWSPriceListService.GetProducts',
        body: requestBody,
        now: this.now(),
      });
      const response = await this.fetchClient(AWS_PRICING_ENDPOINT, {
        method: 'POST',
        headers: signedRequest.headers,
        body: signedRequest.body,
      });
      const parsed = await parseJsonResponse<AwsGetProductsResponse>(this.providerId, response);

      records.push(...this.normalizePriceList(parsed.PriceList, category, fetchedAt, region));
      nextToken = parsed.NextToken;
    } while (nextToken);

    return records;
  }

  private normalizePriceList(
    priceList: string[],
    category: ServiceCategory,
    fetchedAt: string,
    regionFilter?: string,
  ): PricingCatalogRecord[] {
    return priceList.flatMap((priceListEntry) => {
      const parsed = JSON.parse(priceListEntry) as AwsPriceListItem;
      const region =
        parsed.product.attributes.regionCode ??
        AWS_LOCATION_TO_REGION[parsed.product.attributes.location] ??
        parsed.product.attributes.location;

      if (regionFilter && region !== regionFilter) {
        return [];
      }

      const dimension = this.firstPriceDimension(parsed);

      if (!dimension || !dimension.pricePerUnit.USD) {
        return [];
      }

      return [
        {
          provider: this.providerId,
          serviceCategory: category,
          serviceName:
            parsed.product.attributes.servicename ??
            parsed.product.attributes.servicecode ??
            parsed.serviceCode,
          skuId: parsed.product.sku,
          skuDescription: dimension.description,
          region,
          unit: dimension.unit,
          unitPriceUsd: Number.parseFloat(dimension.pricePerUnit.USD),
          attributes: {
            ...parsed.product.attributes,
            productFamily: parsed.product.productFamily,
            rawServiceCode: parsed.serviceCode,
            vcpu: parseOptionalNumber(parsed.product.attributes.vcpu),
            memoryGb: parseMemoryGb(parsed.product.attributes.memory),
          },
          effectiveDate: this.firstEffectiveDate(parsed) ?? parsed.publicationDate ?? fetchedAt,
          fetchedAt,
        },
      ];
    });
  }
  private firstPriceDimension(parsed: AwsPriceListItem): AwsPriceDimension | undefined {
    const term = Object.values(parsed.terms.OnDemand ?? {})[0];
    return term ? Object.values(term.priceDimensions)[0] : undefined;
  }

  private firstEffectiveDate(parsed: AwsPriceListItem): string | undefined {
    return Object.values(parsed.terms.OnDemand ?? {})[0]?.effectiveDate;
  }

  private async getCredentials(): Promise<AwsCredentials> {
    const accessKeyId = await this.getRequiredSecret('access_key_id');
    const secretAccessKey = await this.getRequiredSecret('secret_access_key');
    const sessionToken = await this.getOptionalSecret('session_token');

    return {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  private async getRequiredSecret(key: string): Promise<string> {
    try {
      return await this.secretsReader.getSecret(AWS_SECRET_PATH, key);
    } catch {
      throw new AdapterCredentialError(
        this.providerId,
        `missing required AWS pricing credential ${key}`,
      );
    }
  }

  private async getOptionalSecret(key: string): Promise<string | undefined> {
    try {
      return await this.secretsReader.getSecret(AWS_SECRET_PATH, key);
    } catch {
      return undefined;
    }
  }
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
