import { Injectable } from '@nestjs/common';
import {
  CloudProviderAdapter,
  PricingCatalogRecord,
  ProviderId,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';
import { ComparisonResult, ComparisonWarning } from '../comparison/comparison.types';
import {
  NormalizedPricingWriter,
  PricingCatalogWriter,
} from '../database/pricing-repository.types';
import { LiveRefreshUnavailableError } from './api-errors';
import { ComparisonSnapshot } from './api-database.repository';

interface LivePricingReference {
  providerId: ProviderId;
  category: ServiceCategory;
  skuId: string;
  region: string;
}

interface LivePricingReferenceGroup {
  providerId: ProviderId;
  category: ServiceCategory;
  region: string;
  skuIds: string[];
}

interface LivePricingCacheEntry {
  expiresAt: number;
  records: PricingCatalogRecord[];
}

const LIVE_PRICING_CACHE_TTL_MS = 60_000;
const LIVE_PRICING_MAX_ATTEMPTS = 3;
const LIVE_PRICING_BACKOFF_MS = 75;

@Injectable()
export class LivePricingRefreshService {
  private readonly livePricingCache = new Map<string, LivePricingCacheEntry>();

  constructor(
    private readonly adapters: CloudProviderAdapter[],
    private readonly catalogWriter: PricingCatalogWriter,
    private readonly normalizedPricingWriter: NormalizedPricingWriter,
  ) {}

  async refreshSnapshot(snapshot: ComparisonSnapshot): Promise<ComparisonWarning[]> {
    const references = livePricingReferences(snapshot.resultSnapshot);

    if (references.length === 0) {
      throw new LiveRefreshUnavailableError(
        'Stored comparison does not include provider SKU traceability for live refresh',
      );
    }

    const warnings = await Promise.all(
      this.adapters.map((adapter) => this.refreshProvider(adapter, references)),
    );

    return warnings.filter((warning): warning is ComparisonWarning => warning !== undefined);
  }

  private async refreshProvider(
    adapter: CloudProviderAdapter,
    references: LivePricingReference[],
  ): Promise<ComparisonWarning | undefined> {
    const providerReferences = references.filter(
      (reference) => reference.providerId === adapter.providerId,
    );

    if (providerReferences.length === 0) {
      return undefined;
    }

    const refreshableReferences = providerReferences.filter(
      (reference) => !reference.skuId.startsWith('local-seed-'),
    );

    if (refreshableReferences.length === 0) {
      return {
        providerId: adapter.providerId,
        code: 'live_refresh_failed',
        message: `${adapter.providerId} live refresh skipped local seed provider SKUs; cached baseline pricing remains in use`,
      };
    }

    try {
      const records = (
        await Promise.all(
          groupReferences(refreshableReferences).map((group) =>
            this.refreshGroupWithCacheAndBackoff(adapter, group),
          ),
        )
      ).flat();
      const uniqueRecords = uniquePricingRecords(records);

      if (uniqueRecords.length === 0) {
        return {
          providerId: adapter.providerId,
          code: 'live_refresh_failed',
          message: `${adapter.providerId} live refresh returned no pricing rows for saved provider SKUs`,
        };
      }

      const catalogWrite = await this.catalogWriter.upsertPricingRecords(uniqueRecords);
      const normalizedWrite =
        await this.normalizedPricingWriter.upsertNormalizedPricingRecords(uniqueRecords);
      const recordsRejected = catalogWrite.recordsRejected + normalizedWrite.recordsRejected;

      if (recordsRejected > 0) {
        return {
          providerId: adapter.providerId,
          code: 'live_refresh_failed',
          message: `${adapter.providerId} live refresh persisted with ${recordsRejected} rejected pricing rows`,
        };
      }

      return undefined;
    } catch (error) {
      return {
        providerId: adapter.providerId,
        code: 'live_refresh_failed',
        message: `${adapter.providerId} live refresh failed: ${safeErrorMessage(error)}`,
      };
    }
  }

  private async refreshGroupWithCacheAndBackoff(
    adapter: CloudProviderAdapter,
    group: LivePricingReferenceGroup,
  ): Promise<PricingCatalogRecord[]> {
    const key = cacheKey(group);
    const cached = this.livePricingCache.get(key);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.records;
    }

    const records = await retryWithBackoff(() =>
      adapter.refreshLivePricing(group.skuIds, {
        categories: [group.category],
        region: group.region,
      }),
    );

    this.livePricingCache.set(key, {
      expiresAt: now + LIVE_PRICING_CACHE_TTL_MS,
      records,
    });

    return records;
  }
}

export function livePricingReferences(result: ComparisonResult): LivePricingReference[] {
  return result.providers.flatMap((provider) =>
    provider.lineItems.flatMap((lineItem) => {
      if (!lineItem.skuId || !lineItem.region) {
        return [];
      }

      return [
        {
          providerId: provider.providerId,
          category: lineItem.category,
          skuId: lineItem.skuId,
          region: lineItem.region,
        },
      ];
    }),
  );
}

function groupReferences(references: LivePricingReference[]): LivePricingReferenceGroup[] {
  const groups = new Map<string, LivePricingReferenceGroup>();

  for (const reference of references) {
    const key = `${reference.providerId}:${reference.category}:${reference.region}`;
    const existing = groups.get(key);

    if (existing) {
      existing.skuIds = [...new Set([...existing.skuIds, reference.skuId])];
      continue;
    }

    groups.set(key, {
      providerId: reference.providerId,
      category: reference.category,
      region: reference.region,
      skuIds: [reference.skuId],
    });
  }

  return [...groups.values()];
}

function uniquePricingRecords(records: PricingCatalogRecord[]): PricingCatalogRecord[] {
  const unique = new Map<string, PricingCatalogRecord>();

  for (const record of records) {
    unique.set(
      [
        record.provider,
        record.serviceCategory,
        record.skuId,
        record.region,
        record.unit,
        record.effectiveDate,
      ].join(':'),
      record,
    );
  }

  return [...unique.values()];
}

function cacheKey(group: LivePricingReferenceGroup): string {
  return [
    group.providerId,
    group.category,
    group.region,
    [...group.skuIds].sort().join(','),
  ].join(':');
}

async function retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= LIVE_PRICING_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < LIVE_PRICING_MAX_ATTEMPTS) {
        await delay(LIVE_PRICING_BACKOFF_MS * attempt);
      }
    }
  }

  throw lastError;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error';
}
