import { mockPricingCatalogRecords } from '../adapters/mock/mock-pricing-fixtures';
import { PricingCatalogRecord, ProviderId } from '../adapters/common/cloud-provider-adapter';
import {
  NormalizedComputePricingRecord,
  NormalizedEgressTierRateRecord,
  normalizePricingCatalogRecords,
  NormalizedPricingRecords,
  NormalizedStoragePricingRecord,
} from './normalized-pricing-records';
import { pricingLineageForCatalogRecord } from './pricing-lineage';

const providers: ProviderId[] = ['aws', 'azure', 'gcp'];
const fetchedAt = '2026-07-06T00:00:00.000Z';
const effectiveDate = '2026-07-01T00:00:00.000Z';
const expectedComputeFamilies = [
  'accelerated-computing',
  'burstable',
  'compute-optimized',
  'general-purpose',
  'memory-optimized',
  'storage-optimized',
] as const;
const expectedStorageTiers = ['archive', 'infrequent_access', 'standard'] as const;

describe('pricing reconciliation evidence', () => {
  it.each(providers)(
    'recomputes at least 20 distinct %s normalized rates from raw source records',
    (provider) => {
      const records = mockPricingCatalogRecords(provider, {
        fetchedAt,
        effectiveDate,
      });
      const normalized = normalizePricingCatalogRecords(records);
      const reconciledRows = new Set<string>();

      for (const compute of normalized.compute) {
        const raw = sourceRecordForCompute(compute);
        expect(compute.pricePerHour).toBe(raw.unitPriceUsd);
        expect(compute.sourceLineage).toEqual(pricingLineageForCatalogRecord(raw));
        expectCompleteLineage(compute.sourceLineage);
        expect(compute.sourceLineage.sourceEndpoint).toBe(
          `fixture://mock-pricing/${provider}/compute`,
        );
        reconciledRows.add(`compute:${compute.providerSkuId}:${compute.term}`);
      }

      for (const storage of normalized.storage) {
        const raw = sourceRecordForLineage(records, storage.sourceLineage.sourceRecordId);

        expect(storage.pricePerGbMonth).toBe(raw.unitPriceUsd);
        expect(storage.sourceLineage).toEqual(pricingLineageForCatalogRecord(raw));
        expectCompleteLineage(storage.sourceLineage);
        expect(storage.sourceLineage.sourceEndpoint).toBe(
          `fixture://mock-pricing/${provider}/storage`,
        );
        reconciledRows.add(`storage:${storage.tier}`);
      }

      for (const egress of normalized.egress) {
        const raw = sourceRecordForLineage(records, egress.sourceLineage.sourceRecordId);
        const rawTiers = egressTiersForRecord(raw);
        const rawTier = rawTiers.find((tier) => tier.startGb === egress.tierFromGb);

        expect(rawTier).toBeDefined();
        expect(egress.pricePerGb).toBe(rawTier?.pricePerGb);
        expect(egress.sourceLineage).toEqual(pricingLineageForCatalogRecord(raw));
        expectCompleteLineage(egress.sourceLineage);
        expect(egress.sourceLineage.sourceEndpoint).toBe(
          `fixture://mock-pricing/${provider}/network`,
        );
        reconciledRows.add(`egress:${egress.tierFromGb}`);
      }

      expect(normalized.compute.length).toBeGreaterThanOrEqual(30);
      expect(normalized.storage.length).toBeGreaterThanOrEqual(3);
      expect(normalized.egress.length).toBeGreaterThanOrEqual(4);
      expect(reconciledRows.size).toBeGreaterThanOrEqual(20);
    },
  );

  it.each(providers)(
    'covers mainstream %s compute families, storage tiers, and egress dimensions',
    (provider) => {
      const records = mockPricingCatalogRecords(provider, {
        fetchedAt,
        effectiveDate,
      });
      const normalized = normalizePricingCatalogRecords(records);
      const storageTypes = new Set(
        records
          .filter((record) => record.serviceCategory === 'storage')
          .map((record) => record.attributes?.type),
      );
      const storageAccessPatterns = new Set(
        records
          .filter((record) => record.serviceCategory === 'storage')
          .map((record) => record.attributes?.accessPattern),
      );

      expect(familiesFor(normalized)).toEqual(expectedComputeFamilies);
      expect(storageTiersFor(normalized)).toEqual(expectedStorageTiers);
      expect(egressTierStartsFor(normalized)).toEqual([0, 10_240, 51_200, 153_600]);
      expect(storageTypes).toEqual(new Set(['object', 'block', 'file']));
      expect(storageAccessPatterns).toEqual(new Set(['frequent', 'infrequent', 'archive']));
      expect(records.every((record) => record.fetchedAt === fetchedAt)).toBe(true);
      expect(records.every((record) => record.effectiveDate === effectiveDate)).toBe(true);
    },
  );
});

function familiesFor(
  normalized: NormalizedPricingRecords,
): Array<(typeof expectedComputeFamilies)[number]> {
  return [...new Set(normalized.compute.map((record) => record.family))].sort();
}

function storageTiersFor(
  normalized: NormalizedPricingRecords,
): Array<(typeof expectedStorageTiers)[number]> {
  return [...new Set(normalized.storage.map((record) => record.tier))].sort();
}

function egressTierStartsFor(normalized: NormalizedPricingRecords): number[] {
  return normalized.egress.map((record) => record.tierFromGb).sort((left, right) => left - right);
}

function expectCompleteLineage(
  lineage:
    | NormalizedComputePricingRecord['sourceLineage']
    | NormalizedStoragePricingRecord['sourceLineage']
    | NormalizedEgressTierRateRecord['sourceLineage'],
): void {
  expect(lineage.sourceEndpoint).toBeTruthy();
  expect(lineage.sourceRecordId).toBeTruthy();
  expect(lineage.sourceRecordKey).toBeTruthy();
  expect(lineage.fetchTimestamp).toBe(fetchedAt);
  expect(lineage.transformVersion).toBe('pricing-normalization-v3');
  expect(lineage.sourcePayloadHash).toMatch(/^[a-f0-9]{64}$/);
}

function sourceRecordForCompute(record: NormalizedComputePricingRecord): PricingCatalogRecord {
  const source = record.rawPayload.sourceRecord;

  if (!isPricingCatalogRecord(source)) {
    throw new Error(`Missing compute sourceRecord for ${record.provider}/${record.providerSkuId}`);
  }

  return source;
}

function sourceRecordForLineage(
  records: PricingCatalogRecord[],
  sourceRecordId: string,
): PricingCatalogRecord {
  const source = records.find(
    (record) =>
      record.skuId === sourceRecordId ||
      record.attributes?.rawSourceRecordId === sourceRecordId ||
      record.attributes?.sourceRecordId === sourceRecordId,
  );

  if (!source) {
    throw new Error(`Missing raw source record for lineage id ${sourceRecordId}`);
  }

  return source;
}

function egressTiersForRecord(
  record: PricingCatalogRecord | undefined,
): Array<{ startGb: number; pricePerGb: number }> {
  if (!record || !Array.isArray(record.attributes?.egressTiers)) {
    return [];
  }

  return record.attributes.egressTiers
    .map((tier) => {
      if (!isObjectRecord(tier)) {
        return undefined;
      }

      const startGb = numberFromUnknown(tier.startGb ?? tier.tierFromGb);
      const pricePerGb = numberFromUnknown(tier.pricePerGb ?? tier.unitPriceUsd);

      if (startGb === undefined || pricePerGb === undefined) {
        return undefined;
      }

      return { startGb, pricePerGb };
    })
    .filter((tier): tier is { startGb: number; pricePerGb: number } => tier !== undefined);
}

function isPricingCatalogRecord(value: unknown): value is PricingCatalogRecord {
  return (
    isObjectRecord(value) &&
    typeof value.skuId === 'string' &&
    typeof value.unitPriceUsd === 'number'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
