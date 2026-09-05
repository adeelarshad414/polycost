/* eslint-disable security/detect-object-injection -- Reviewed 2026-07-06: provider catalog keys are controlled Azure Retail Prices fields, not arbitrary user mutation; see docs/SECURITY-SUPPRESSIONS.md. */
import { BaseCloudProviderAdapter } from '../common/base-cloud-provider.adapter.js';
import {
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from '../common/cloud-provider-adapter.js';
import {
  assertSameProviderOrigin,
  defaultFetch,
  FetchLike,
  parseJsonResponse,
} from '../common/http-client.js';
import { AdapterError } from '../common/adapter-errors.js';

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
// Hard ceiling on paginated requests per category filter. The Azure Retail
// Prices API returns 100 items/page; even an unfiltered catalog is well under
// this. It exists so a misbehaving or hostile feed that always returns a
// NextPageLink cannot loop forever (H-B4).
const MAX_AZURE_RETAIL_PAGES = 5_000;

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
    // Default to the adapter's region so the Retail Prices $filter is scoped to
    // one armRegionName. Without it the boot ETL pulls the entire global catalog
    // (hundreds of thousands of meters), which is wasteful and — via the old
    // push(...spread) — overflowed the call stack.
    const region = options.region ?? this.defaultRegion;
    const records: PricingCatalogRecord[] = [];

    for (const category of categories) {
      const categoryRecords = await this.fetchCategory(category, fetchedAt, region);
      // Accumulate with a loop, never `push(...largeArray)` — spreading a large
      // array as call arguments throws "Maximum call stack size exceeded".
      for (const record of categoryRecords) {
        records.push(record);
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
      let pageCount = 0;

      while (nextPageUrl) {
        pageCount += 1;
        if (pageCount > MAX_AZURE_RETAIL_PAGES) {
          throw new AdapterError(
            this.providerId,
            `retail prices pagination exceeded ${MAX_AZURE_RETAIL_PAGES} pages for filter "${filter}"; aborting to avoid an unbounded loop`,
          );
        }

        // The NextPageLink comes from the response body — untrusted data — so it
        // must resolve to the pinned Azure pricing host before we fetch it.
        assertSameProviderOrigin(this.providerId, nextPageUrl, AZURE_RETAIL_PRICES_ENDPOINT);

        const response = await this.fetchClient(nextPageUrl);
        const parsed = await parseJsonResponse<AzureRetailPricesResponse>(
          this.providerId,
          response,
        );

        // Loop-push (not push(...map)) so a large page cannot overflow the stack.
        for (const item of parsed.Items) {
          // Spot / Low-Priority / DevTest meters are `Consumption` type but are
          // NOT standard on-demand prices; ingesting them let them masquerade as
          // on-demand and made Azure compute look 10-90% too cheap.
          if (isExcludedAzureMeter(item)) {
            continue;
          }
          records.push(this.normalizeItem(item, category, fetchedAt));
        }
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
    // Azure Retail Prices meters are priced per a *block* of units declared in
    // `unitOfMeasure` (e.g. "1 Hour", "10 Hours", "100 Hours", "1 GB/Month").
    // `unitPrice` is the price for the whole block, so we must divide by the
    // block quantity to obtain a true per-single-unit rate. Storing the raw
    // block price against a per-unit unit label overstated any meter with a
    // quantity > 1 by that factor (up to 100x for "100 Hours" meters).
    const { quantity, unit } = parseAzureUnitOfMeasure(item.unitOfMeasure);
    const unitPriceUsd = quantity > 0 ? item.unitPrice / quantity : item.unitPrice;

    return {
      provider: this.providerId,
      serviceCategory: category,
      serviceName: item.serviceName,
      skuId: item.skuId,
      skuDescription: `${item.productName} - ${item.meterName}`,
      region: item.armRegionName,
      unit,
      unitPriceUsd,
      attributes: {
        currencyCode: item.currencyCode,
        sourceEndpoint: AZURE_RETAIL_PRICES_ENDPOINT,
        rawSourceRecordId: `${item.meterId}:${item.productId}:${item.skuId}`,
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
        // Preserve provenance so the block-normalization is auditable.
        unitOfMeasure: item.unitOfMeasure,
        unitOfMeasureQuantity: quantity,
        rawBlockUnitPriceUsd: item.unitPrice,
      },
      effectiveDate: item.effectiveStartDate,
      fetchedAt,
    };
  }
}

/**
 * Parses an Azure `unitOfMeasure` string into a numeric block quantity and the
 * bare unit label. Examples:
 *   "1 Hour"      -> { quantity: 1,   unit: "Hour" }
 *   "10 Hours"    -> { quantity: 10,  unit: "Hours" }
 *   "100 Hours"   -> { quantity: 100, unit: "Hours" }
 *   "1 GB/Month"  -> { quantity: 1,   unit: "GB/Month" }
 *   "1/Month"     -> { quantity: 1,   unit: "/Month" }
 *   "GB"          -> { quantity: 1,   unit: "GB" }   (no leading quantity)
 * Falls back to quantity 1 and the original string when no valid leading
 * quantity is present, so a divide-by-zero or unit loss can never occur.
 */
export function parseAzureUnitOfMeasure(unitOfMeasure: string | undefined | null): {
  quantity: number;
  unit: string;
} {
  const raw = (unitOfMeasure ?? '').trim();
  if (raw.length === 0) {
    return { quantity: 1, unit: raw };
  }

  const match = raw.match(/^(?<qty>\d+(?:\.\d+)?)\s*(?<unit>.*)$/);
  const parsedQuantity = match?.groups?.qty ? Number.parseFloat(match.groups.qty) : NaN;

  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    return { quantity: 1, unit: raw };
  }

  const unitLabel = match?.groups?.unit?.trim() ?? '';
  return { quantity: parsedQuantity, unit: unitLabel.length > 0 ? unitLabel : raw };
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

/**
 * Spot and Low-Priority meters are `Consumption`-type but priced far below and
 * differently from on-demand (interruptible, no capacity guarantee). They must
 * not be ingested as on-demand pricing.
 */
function isSpotOrLowPriorityAzureMeter(item: AzureRetailPriceItem): boolean {
  const raw = [item.meterName, item.skuName, item.productName, item.armSkuName]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
  // Normalize word separators to spaces and pad, so ` spot ` matches on a word
  // boundary without a (ReDoS-flagged) regex and handles `_`/`-` delimited SKUs.
  const padded = ` ${raw.replaceAll('_', ' ').replaceAll('-', ' ')} `;
  return (
    padded.includes(' spot ') || padded.includes(' low priority ') || raw.includes('lowpriority')
  );
}

/**
 * Meters to drop from the catalog: DevTest (and any non-standard price type) plus
 * Spot/Low-Priority. Standard on-demand (`Consumption`) and `Reservation` meters
 * are kept.
 */
function isExcludedAzureMeter(item: AzureRetailPriceItem): boolean {
  if (item.type !== 'Consumption' && item.type !== 'Reservation') {
    return true;
  }
  return isSpotOrLowPriorityAzureMeter(item);
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
