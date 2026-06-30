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

@Injectable()
export class LivePricingRefreshService {
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
            adapter.refreshLivePricing(group.skuIds, {
              categories: [group.category],
              region: group.region,
            }),
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

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error';
}
