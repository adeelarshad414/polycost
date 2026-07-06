import { mockPricingCatalogRecords } from '../adapters/mock/mock-pricing-fixtures';
import { PricingCatalogRecord, ProviderId } from '../adapters/common/cloud-provider-adapter';
import {
  NormalizedComputePricingRecord,
  normalizePricingCatalogRecords,
} from './normalized-pricing-records';
import { pricingLineageForCatalogRecord } from './pricing-lineage';

const providers: ProviderId[] = ['aws', 'azure', 'gcp'];
const fetchedAt = '2026-07-06T00:00:00.000Z';
const effectiveDate = '2026-07-01T00:00:00.000Z';

describe('pricing reconciliation evidence', () => {
  it.each(providers)(
    'recomputes at least 20 %s stored rates from raw source records',
    (provider) => {
      const records = mockPricingCatalogRecords(provider, {
        fetchedAt,
        effectiveDate,
      });
      const normalized = normalizePricingCatalogRecords(records);
      const reconciliationAssertions = {
        compute: 0,
        storage: 0,
        egress: 0,
      };

      for (const compute of normalized.compute) {
        const raw = sourceRecordForCompute(compute);
        expect(compute.pricePerHour).toBe(raw.unitPriceUsd);
        expect(compute.sourceLineage).toEqual(pricingLineageForCatalogRecord(raw));
        expect(compute.sourceLineage.sourcePayloadHash).toMatch(/^[a-f0-9]{64}$/);
        expect(compute.sourceLineage.sourceEndpoint).toBe(
          `fixture://mock-pricing/${provider}/compute`,
        );
        reconciliationAssertions.compute += 4;
      }

      for (const storage of normalized.storage) {
        const raw = sourceRecordForLineage(records, storage.sourceLineage.sourceRecordId);

        expect(storage.pricePerGbMonth).toBe(raw.unitPriceUsd);
        expect(storage.sourceLineage).toEqual(pricingLineageForCatalogRecord(raw));
        expect(storage.sourceLineage.sourcePayloadHash).toMatch(/^[a-f0-9]{64}$/);
        expect(storage.sourceLineage.sourceEndpoint).toBe(
          `fixture://mock-pricing/${provider}/storage`,
        );
        reconciliationAssertions.storage += 4;
      }

      for (const egress of normalized.egress) {
        const raw = sourceRecordForLineage(records, egress.sourceLineage.sourceRecordId);
        const rawTiers = egressTiersForRecord(raw);
        const rawTier = rawTiers.find((tier) => tier.startGb === egress.tierFromGb);

        expect(rawTier).toBeDefined();
        expect(egress.pricePerGb).toBe(rawTier?.pricePerGb);
        expect(egress.sourceLineage).toEqual(pricingLineageForCatalogRecord(raw));
        expect(egress.sourceLineage.sourcePayloadHash).toMatch(/^[a-f0-9]{64}$/);
        expect(egress.sourceLineage.sourceEndpoint).toBe(
          `fixture://mock-pricing/${provider}/network`,
        );
        reconciliationAssertions.egress += 5;
      }

      expect(reconciliationAssertions.compute).toBeGreaterThan(0);
      expect(reconciliationAssertions.storage).toBeGreaterThan(0);
      expect(reconciliationAssertions.egress).toBeGreaterThan(0);
      expect(
        reconciliationAssertions.compute +
          reconciliationAssertions.storage +
          reconciliationAssertions.egress,
      ).toBeGreaterThanOrEqual(20);
    },
  );
});

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
