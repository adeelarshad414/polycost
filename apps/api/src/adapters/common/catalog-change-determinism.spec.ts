import { describe, it, expect } from '@jest/globals';
import { AwsProviderAdapter } from '../aws/aws-provider.adapter.js';
import { InMemoryPricingCatalogReader } from './in-memory-pricing-catalog.reader.js';
import type { PricingCatalogRecord } from './cloud-provider-adapter.js';
import type { NormalizedWorkloadSpec } from '../../nws/nws.types.js';

/*
  K-10: deterministic proof that pricing tracks the catalog.

  The register recorded that a live refresh had been observed re-running into a
  fresh snapshot, but that a *changed catalog row* provably changing the result
  needed a test-only catalog fixture path. InMemoryPricingCatalogReader is that
  path: it takes records directly, so a catalog can be mutated by one field and
  the two results compared with nothing else moving.

  Three properties, and the third is the one that makes the other two mean
  something:

  1. same catalog, same result - no hidden clock, cache or ordering input;
  2. change the SELECTED row's price and the result moves by exactly that much;
  3. change a row that was NOT selected and the result does not move at all.

  Without (3), a test could pass by being sensitive to any catalog change at
  all - including changes it should ignore - which is a different property from
  tracking the row that was actually priced.
*/

const REGION = 'us-east-1';
/*
  Stated here rather than imported from cost-time.ts on purpose. Importing it
  would put the same value on both sides of every assertion below, and changing
  the monthly-hour standard would silently keep the tests green; verified by
  lowering hoursPerMonth in packages/types, which fails this spec and would not
  if the constant were shared.
*/
const HOURS_PER_MONTH = 730;

function computeRow(
  skuId: string,
  instanceType: string,
  vcpu: number,
  memoryGb: number,
  pricePerHour: number,
): PricingCatalogRecord {
  return {
    provider: 'aws',
    serviceCategory: 'compute',
    serviceName: 'Amazon Elastic Compute Cloud',
    skuId,
    skuDescription: `$${pricePerHour} per On Demand Linux ${instanceType} Instance Hour`,
    region: REGION,
    unit: 'Hrs',
    unitPriceUsd: pricePerHour,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    attributes: {
      vcpu,
      memoryGb,
      instanceType,
      instanceFamily: 'General purpose',
      tenancy: 'Shared',
      processorArchitecture: '64-bit',
      physicalProcessor: 'Intel Xeon 8375C (Ice Lake)',
      pricingModel: 'on-demand',
      operation: 'RunInstances',
    },
  } as unknown as PricingCatalogRecord;
}

/** The row the selector picks for the workload below: smallest adequate size. */
const SELECTED_SKU = 'SELECTED4VCPU8GB';
/** Adequate too, but larger, so it is never chosen while the smaller one exists. */
const UNSELECTED_SKU = 'UNSELECTED16VCPU';

function catalog(
  selectedPricePerHour: number,
  unselectedPricePerHour = 1.536,
): PricingCatalogRecord[] {
  return [
    computeRow(SELECTED_SKU, 'm6i.xlarge', 4, 16, selectedPricePerHour),
    computeRow(UNSELECTED_SKU, 'm6i.4xlarge', 16, 64, unselectedPricePerHour),
  ];
}

const WORKLOAD = {
  schemaVersion: '1.0',
  metadata: { sourceType: 'structured_form', createdAt: '2026-01-01T00:00:00.000Z' },
  workload: { type: 'web_app', region: { preference: REGION, isDefault: false } },
  compute: [{ role: 'web', scalingType: 'fixed', instanceCount: 2, vcpu: 4, memoryGb: 8 }],
  storage: [],
  database: [],
  network: { cdn: false, loadBalancer: false },
  availability: { multiAz: false, multiRegion: false },
} as unknown as NormalizedWorkloadSpec;

async function priceAgainst(records: PricingCatalogRecord[]): Promise<{
  skuId: string | undefined;
  monthlyCostUsd: number;
}> {
  const adapter = new AwsProviderAdapter(
    new InMemoryPricingCatalogReader(records),
    REGION,
    (async () => {
      throw new Error('pricing must not reach the network');
    }) as never,
    // Pinned clock: a result that varied with wall time would make every
    // comparison below meaningless.
    () => new Date('2026-01-01T00:00:00.000Z'),
  );
  const result = await adapter.priceWorkload(WORKLOAD);
  const compute = result.lineItems.filter((item) => item.category === 'compute');

  expect(compute).toHaveLength(1);

  return { skuId: compute[0].skuId, monthlyCostUsd: result.baseMonthlyCostUsd };
}

describe('pricing tracks the catalog deterministically (K-10)', () => {
  const BASE_RATE = 0.192;
  const RAISED_RATE = 0.24;
  const INSTANCE_COUNT = 2;

  it('returns the same result for the same catalog', async () => {
    const first = await priceAgainst(catalog(BASE_RATE));
    const second = await priceAgainst(catalog(BASE_RATE));

    expect(second).toEqual(first);
    expect(first.skuId).toBe(SELECTED_SKU);
  });

  it('moves by exactly the rate change when the selected row changes', async () => {
    // The test only says anything if the two rates actually differ.
    expect(RAISED_RATE).toBeGreaterThan(BASE_RATE);

    const before = await priceAgainst(catalog(BASE_RATE));
    const after = await priceAgainst(catalog(RAISED_RATE));

    /*
      Both absolute figures are pinned, not just the delta between them. A
      delta-only assertion goes vacuous the moment the two rates are equal -
      nought equals nought - and would then pass while testing nothing. Checked
      by setting RAISED_RATE to BASE_RATE, which passed the delta form and fails
      this one.
    */
    expect(after.skuId).toBe(SELECTED_SKU);
    expect(before.monthlyCostUsd).toBeCloseTo(BASE_RATE * INSTANCE_COUNT * HOURS_PER_MONTH, 2);
    expect(after.monthlyCostUsd).toBeCloseTo(RAISED_RATE * INSTANCE_COUNT * HOURS_PER_MONTH, 2);
    expect(after.monthlyCostUsd - before.monthlyCostUsd).toBeCloseTo(
      (RAISED_RATE - BASE_RATE) * INSTANCE_COUNT * HOURS_PER_MONTH,
      2,
    );
  });

  it('does not move when a row that was not selected changes', async () => {
    /*
      The control. A result sensitive to any catalog change at all would pass
      the test above without tracking the row it actually priced, and this is
      what separates the two.
    */
    const before = await priceAgainst(catalog(BASE_RATE, 1.536));
    const after = await priceAgainst(catalog(BASE_RATE, 9.999));

    expect(after).toEqual(before);
  });

  it('reprices onto a different row when the catalog makes another one cheaper', async () => {
    /*
      Selection is smallest-adequate-first with price as the tie-break, so the
      larger row cannot win on price alone. Shrinking it to the same size as the
      selected row and pricing it below is what moves the choice - which also
      pins that the selection policy itself is catalog-driven, not hardcoded.
    */
    const records = catalog(BASE_RATE);
    records[1] = computeRow(UNSELECTED_SKU, 'm6i.xlarge', 4, 16, BASE_RATE / 2);

    const result = await priceAgainst(records);

    expect(result.skuId).toBe(UNSELECTED_SKU);
  });
});
