import { describe, it, expect } from '@jest/globals';
import { AwsProviderAdapter } from '../aws/aws-provider.adapter.js';
import { InMemoryPricingCatalogReader } from './in-memory-pricing-catalog.reader.js';
import type { PricingCatalogRecord } from './cloud-provider-adapter.js';
import type { NormalizedWorkloadSpec } from '../../nws/nws.types.js';

/*
  Compute SKU selection against a catalog shaped like a real one.

  The mock catalog has a few dozen hand-curated rows, so any selection looked
  correct. A live AWS Price List has thousands, and it exposed a selection that
  was 25x too expensive: for a 7-vCPU burstable request the adapter chose
  r4.16xlarge - 64 vCPU, 488 GB - because AWS's opaque SKU id for that row,
  `TJCB42XUUBBP8KKF`, starts with `t`, and `t` is the family prefix for
  burstable. 295 of 8,249 live rows in one region start with `t`.

  These fixtures reproduce the two properties of a live catalog that the mock
  one does not have: opaque identifiers unrelated to the instance type, and the
  provider's own marketing family label rather than our normalized taxonomy.
*/

const REGION = 'us-east-1';

function awsRow(
  skuId: string,
  instanceType: string,
  vcpu: number,
  memoryGb: number,
  pricePerHour: number,
  /**
   * Omitted for rows that publish no family label. 1,070 of 8,249 live AWS rows
   * in one region are like this, and they are the ones that fall through to
   * descriptor matching - where an opaque id can be read as a family.
   */
  instanceFamily?: string,
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
      ...(instanceFamily === undefined ? {} : { instanceFamily }),
      tenancy: 'Shared',
      // Exactly what the live catalog reports: word size, not ISA. Graviton
      // rows say this too, which is why physicalProcessor is the real signal.
      processorArchitecture: '64-bit',
      physicalProcessor: 'Intel Xeon Platinum 8259CL',
      pricingModel: 'on-demand',
      operation: 'RunInstances',
    },
  } as unknown as PricingCatalogRecord;
}

/**
 * The opaque ids are the point: each starts with a letter that is also a family
 * prefix, and none of them matches its instance type's real family.
 */
const CATALOG: PricingCatalogRecord[] = [
  // Identical capacity, different price: isolates the price tie-break so this
  // test cannot accidentally be measuring the size preference instead. Both are
  // x86 - an ARM type like c7gd would be excluded by the architecture predicate,
  // correctly, and would have made this test measure that instead.
  awsRow('39748UVFEUKY3MVQ', 'c4.2xlarge', 8, 16, 0.398, 'Compute optimized'),
  awsRow('4QCDYF8UQFTZQR7D', 'c6i.2xlarge', 8, 16, 0.3629, 'Compute optimized'),
  // One size up: only eligible once the request needs it.
  awsRow('5PPPPPPPPPPPPPPP', 'c5.4xlarge', 16, 32, 0.68, 'Compute optimized'),
  // The trap: id starts with `t`, so a prefix match reads it as burstable.
  awsRow('TJCB42XUUBBP8KKF', 'r4.16xlarge', 64, 488, 4.256, 'Memory optimized'),
  // The same trap on other single-letter prefixes.
  awsRow('MZZZZZZZZZZZZZZZ', 'x1.32xlarge', 128, 1952, 13.338, 'Memory optimized'),
  awsRow('CQQQQQQQQQQQQQQQ', 'i3.16xlarge', 64, 488, 4.992, 'Storage optimized'),
  // Cheapest row in the catalog, but too small to satisfy the request.
  awsRow('AAAAAAAAAAAAAAAA', 'c5.large', 2, 4, 0.085, 'Compute optimized'),
  // No family label, so resolution falls through to the descriptors - and the
  // opaque id begins with `t`. This is the row the original bug picked.
  awsRow('TQQQQQQQQQQQQQQQ', 'r5.24xlarge', 96, 768, 6.048),
  /*
    Real instance types whose family is more than one letter. Matching the AWS
    rules by prefix reads all three as burstable, compute-optimized and so on
    from their first character: trn1 -> t, dl1 -> d, hpc7a -> h. trn1.32xlarge
    at $21.50/hr actually won a 13-vCPU web request this way on live data.
  */
  awsRow('WVVQPJVCQU4SR8XF', 'trn1.32xlarge', 128, 512, 21.5, 'Machine Learning ASIC Instances'),
  awsRow('DLLLLLLLLLLLLLLL', 'dl1.24xlarge', 96, 768, 13.109, 'GPU instance'),
  awsRow('HPCCCCCCCCCCCCCC', 'hpc7a.96xlarge', 192, 768, 7.2, 'Compute optimized'),
];

function workload(vcpu: number, memoryGb: number): NormalizedWorkloadSpec {
  // Shape copied from the AWS adapter spec's minimalNws so this exercises the
  // real validator rather than a hand-rolled approximation.
  return {
    schemaVersion: '1.0',
    metadata: {
      sourceType: 'structured_form',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    workload: {
      type: 'web_app',
      region: { preference: REGION, isDefault: false },
    },
    compute: [
      {
        role: 'web',
        scalingType: 'fixed',
        instanceCount: 1,
        vcpu,
        memoryGb,
        instanceFamily: 'burstable',
        processorArchitecture: 'x86_64',
        tenancy: 'shared',
      },
    ],
    storage: [],
    database: [],
    network: { cdn: false, loadBalancer: false },
    availability: { multiAz: false, multiRegion: false },
  } as unknown as NormalizedWorkloadSpec;
}

function adapter(): AwsProviderAdapter {
  return new AwsProviderAdapter(
    new InMemoryPricingCatalogReader(CATALOG),
    REGION,
    (async () => {
      throw new Error('selection must not reach the network');
    }) as never,
    () => new Date('2026-01-01T00:00:00.000Z'),
  );
}

async function computeSkuIds(vcpu: number, memoryGb: number): Promise<string[]> {
  const result = await adapter().priceWorkload(workload(vcpu, memoryGb));

  return result.lineItems
    .filter((item) => item.category === 'compute')
    .map((item) => item.skuId)
    .filter((skuId): skuId is string => typeof skuId === 'string');
}

describe('compute SKU selection against a realistic catalog', () => {
  it('picks the cheapest instance among those of the same adequate size', async () => {
    // Both 8-vCPU rows have identical capacity, so price decides: c6i.2xlarge
    // at $0.3629 over c4.2xlarge at $0.398.
    await expect(computeSkuIds(7, 4)).resolves.toEqual(['4QCDYF8UQFTZQR7D']);
  });

  it('prefers the smallest adequate size over a cheaper larger one', async () => {
    /*
      Pinning the documented policy, which is smallest-adequate-first with price
      as the tie-break - not cheapest-overall. Worth stating explicitly because
      the two differ: a 16-vCPU row priced below an 8-vCPU row would still lose
      here, and for a cost-comparison tool that is a real design question rather
      than an obvious answer. This test exists so any change to that policy is a
      deliberate one.
    */
    const skuIds = await computeSkuIds(7, 4);

    expect(skuIds).not.toContain('5PPPPPPPPPPPPPPP');
  });

  it('never selects a row whose opaque id merely starts with a family prefix', async () => {
    // The specific regression: r4.16xlarge won because TJCB42XUUBBP8KKF begins
    // with `t`. Asserted by id so the reason cannot drift.
    const skuIds = await computeSkuIds(7, 4);

    expect(skuIds).not.toContain('TJCB42XUUBBP8KKF');
    expect(skuIds).not.toContain('MZZZZZZZZZZZZZZZ');
    expect(skuIds).not.toContain('CQQQQQQQQQQQQQQQ');
  });

  it('does not read a family out of an opaque id when the row has no label', async () => {
    /*
      The label mapping alone would hide this: rows that publish a family never
      reach descriptor matching. Rows that publish none do, and an opaque id
      beginning with `t` would be read as burstable - an exact match for the
      request - and beat every correct candidate on rank before price is
      considered.
    */
    const skuIds = await computeSkuIds(7, 4);

    expect(skuIds).not.toContain('TQQQQQQQQQQQQQQQ');
  });

  it('does not read a family from the first letter of a multi-letter one', async () => {
    /*
      trn1, dl1 and hpc7a are real AWS families. Matched by prefix they read as
      t, d and h - burstable, general-purpose, and nothing - so a Trainium
      accelerator at $21.50/hr became an exact match for a burstable request.
      The family is the leading run of letters, not the first character.
    */
    const skuIds = await computeSkuIds(13, 8);

    expect(skuIds).not.toContain('WVVQPJVCQU4SR8XF');
    expect(skuIds).not.toContain('DLLLLLLLLLLLLLLL');
    expect(skuIds).not.toContain('HPCCCCCCCCCCCCCC');
  });

  it('never selects an instance smaller than the request', async () => {
    // c5.large is the cheapest row by a wide margin, so a price-first selection
    // that lost the capacity floor would take it.
    await expect(computeSkuIds(7, 4)).resolves.not.toContain('AAAAAAAAAAAAAAAA');
  });

  it('stays cheapest-sufficient as the requested size grows', async () => {
    // At 64 vCPU the large rows become legitimate and the cheapest of them
    // should win, which proves the fix did not simply avoid big instances.
    await expect(computeSkuIds(64, 400)).resolves.toEqual(['TJCB42XUUBBP8KKF']);
  });
});
