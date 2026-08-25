import { createSign } from 'node:crypto';
import { SecretsReader } from '../../secrets/secrets.service';
/* eslint-disable security/detect-object-injection -- Reviewed 2026-07-06: provider catalog keys are controlled GCP Cloud Billing fields, not arbitrary user mutation; see docs/SECURITY-SUPPRESSIONS.md. */
import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from '../common/cloud-provider-adapter';
import { AdapterCredentialError, AdapterError } from '../common/adapter-errors';
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

interface GcpServiceAccountCredentials {
  client_email?: unknown;
  private_key?: unknown;
  token_uri?: unknown;
}

interface GcpTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const GCP_CATALOG_ENDPOINT = 'https://cloudbilling.googleapis.com/v1/services';
// Hard ceiling on paginated requests per listing. GCP returns up to 5000
// items/page, so real catalogs need only a handful of pages; this bounds a feed
// that keeps returning a nextPageToken forever (H-B4).
const MAX_GCP_CATALOG_PAGES = 2_000;
const GCP_DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const GCP_SECRET_PATH = 'polycost/providers/gcp';
const GCP_BILLING_READ_SCOPE = 'https://www.googleapis.com/auth/cloud-billing.readonly';

const CATALOG_REFRESH_CATEGORIES = ['compute', 'storage', 'database', 'network'] as const;
type CatalogRefreshCategory = (typeof CATALOG_REFRESH_CATEGORIES)[number];

const CATEGORY_MATCHERS: Record<CatalogRefreshCategory, RegExp[]> = {
  compute: [/compute/i],
  storage: [/storage/i],
  database: [/sql/i, /database/i, /memorystore/i],
  network: [/network/i, /vpc/i],
};

// Pin categories with a single well-known primary GCP service to its stable
// serviceId, so an unrelated service whose display name merely contains
// "compute"/"storage" (e.g. "Storage Transfer Service") is not swept in.
// Categories left empty fall back to the display-name matchers above.
const CATEGORY_SERVICE_IDS: Record<CatalogRefreshCategory, string[]> = {
  compute: ['6F81-5844-456A'], // Compute Engine
  storage: ['95FF-2EF5-5EA1'], // Cloud Storage
  database: [],
  network: [],
};

function gcpServiceMatchesCategory(
  service: { serviceId: string; displayName: string },
  category: CatalogRefreshCategory,
): boolean {
  const pinnedServiceIds = CATEGORY_SERVICE_IDS[category];
  if (pinnedServiceIds.length > 0) {
    return pinnedServiceIds.includes(service.serviceId);
  }
  return CATEGORY_MATCHERS[category].some((matcher) => matcher.test(service.displayName));
}

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
        gcpServiceMatchesCategory(service, category),
      );

      for (const service of matchingServices) {
        const serviceSkus = await this.fetchServiceSkus(
          service.name,
          category,
          fetchedAt,
          token,
          options.region,
        );
        // Loop-push (not push(...largeArray)) — a service can expose thousands
        // of SKUs; spreading them as call arguments would overflow the stack.
        for (const record of serviceSkus) {
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

  private async fetchServices(token: string): Promise<GcpService[]> {
    const services: GcpService[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      pageCount += 1;
      if (pageCount > MAX_GCP_CATALOG_PAGES) {
        throw new AdapterError(
          this.providerId,
          `service catalog pagination exceeded ${MAX_GCP_CATALOG_PAGES} pages; aborting to avoid an unbounded loop`,
        );
      }

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

      // Loop-push (not push(...array)) to stay overflow-safe on large pages.
      for (const service of parsed.services) {
        services.push(service);
      }
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
    let pageCount = 0;

    do {
      pageCount += 1;
      if (pageCount > MAX_GCP_CATALOG_PAGES) {
        throw new AdapterError(
          this.providerId,
          `sku pagination for ${serviceName} exceeded ${MAX_GCP_CATALOG_PAGES} pages; aborting to avoid an unbounded loop`,
        );
      }

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

      // Loop-push (not push(...flatMap)) so a large SKU page cannot overflow.
      for (const sku of parsed.skus) {
        for (const record of this.normalizeSku(serviceName, sku, category, fetchedAt, region)) {
          records.push(record);
        }
      }
      pageToken = parsed.nextPageToken;
    } while (pageToken);

    return records;
  }

  private normalizeSku(
    serviceName: string,
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
        sourceEndpoint: `https://cloudbilling.googleapis.com/v1/${serviceName}/skus`,
        rawSourceRecordId: sku.skuId,
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
    const directAccessToken = await this.getOptionalSecret('access_token');

    if (directAccessToken) {
      return directAccessToken;
    }

    const serviceAccountJson =
      (await this.getOptionalSecret('service_account_json')) ??
      (await this.getOptionalSecret('service_account_key_json'));

    if (serviceAccountJson) {
      return this.exchangeServiceAccountToken(serviceAccountJson);
    }

    throw new AdapterCredentialError(
      this.providerId,
      'missing required GCP Cloud Billing access token or service account JSON',
    );
  }

  private async getOptionalSecret(key: string): Promise<string | undefined> {
    try {
      const value = await this.secretsReader.getSecret(GCP_SECRET_PATH, key);
      const trimmed = value.trim();

      return trimmed.length > 0 ? trimmed : undefined;
    } catch {
      return undefined;
    }
  }

  private async exchangeServiceAccountToken(serviceAccountJson: string): Promise<string> {
    const credentials = parseServiceAccountCredentials(this.providerId, serviceAccountJson);
    const tokenUri = credentials.tokenUri ?? GCP_DEFAULT_TOKEN_URI;
    const nowSeconds = Math.floor(this.now().getTime() / 1000);
    const assertion = signedServiceAccountJwt(this.providerId, credentials, nowSeconds, tokenUri);
    const response = await this.fetchClient(tokenUri, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    const parsed = await parseJsonResponse<GcpTokenResponse>(this.providerId, response);

    if (!parsed.access_token || parsed.access_token.trim().length === 0) {
      throw new AdapterCredentialError(
        this.providerId,
        `GCP service account token exchange did not return access_token: ${
          parsed.error_description ?? parsed.error ?? 'empty token response'
        }`,
      );
    }

    return parsed.access_token;
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

function parseServiceAccountCredentials(
  providerId: ProviderId,
  rawJson: string,
): { clientEmail: string; privateKey: string; tokenUri?: string } {
  let parsed: GcpServiceAccountCredentials;

  try {
    parsed = JSON.parse(rawJson) as GcpServiceAccountCredentials;
  } catch {
    throw new AdapterCredentialError(providerId, 'GCP service account JSON is not valid JSON');
  }

  if (typeof parsed.client_email !== 'string' || parsed.client_email.trim().length === 0) {
    throw new AdapterCredentialError(
      providerId,
      'GCP service account JSON is missing client_email',
    );
  }

  if (typeof parsed.private_key !== 'string' || parsed.private_key.trim().length === 0) {
    throw new AdapterCredentialError(providerId, 'GCP service account JSON is missing private_key');
  }

  return {
    clientEmail: parsed.client_email.trim(),
    privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    ...(typeof parsed.token_uri === 'string' && parsed.token_uri.trim().length > 0
      ? { tokenUri: parsed.token_uri.trim() }
      : {}),
  };
}

function signedServiceAccountJwt(
  providerId: ProviderId,
  credentials: { clientEmail: string; privateKey: string },
  nowSeconds: number,
  tokenUri: string,
): string {
  const header = base64UrlJson({
    alg: 'RS256',
    typ: 'JWT',
  });
  const payload = base64UrlJson({
    iss: credentials.clientEmail,
    scope: GCP_BILLING_READ_SCOPE,
    aud: tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const signingInput = `${header}.${payload}`;

  try {
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .end()
      .sign(credentials.privateKey, 'base64url');

    return `${signingInput}.${signature}`;
  } catch {
    throw new AdapterCredentialError(
      providerId,
      'GCP service account private_key could not sign a JWT assertion',
    );
  }
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
