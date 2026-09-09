import { describe, it, expect } from '@jest/globals';
import { AwsProviderAdapter } from '../aws/aws-provider.adapter.js';
import { AzureProviderAdapter } from '../azure/azure-provider.adapter.js';
import { InMemoryPricingCatalogReader } from './in-memory-pricing-catalog.reader.js';
import type { PricingCatalogRecord } from './cloud-provider-adapter.js';
import type { NormalizedWorkloadSpec } from '../../nws/nws.types.js';

/*
  Architecture and tenancy resolution against the attributes real catalogs
  publish - which are not the ones the mock catalog publishes.

  Three defects, all invisible to the mock fixtures and all measured against a
  live catalog of 1,389 AWS and 6,761 Azure compute rows:

  1. AWS names every Graviton generation with a trailing digit ("AWS Graviton4
     Processor"). The arm64 pattern required a word boundary straight after
     `graviton`, and n->4 is not one, so 412 of the 1,389 live AWS rows - every
     ARM part in the catalog - resolved to an unknown architecture.

  2. AWS reports tenancy as `Shared`, capitalised. The check was an equality
     test against the lowercase token, so all 1,389 rows failed it and tenancy
     was undefined catalogue-wide, making the tenancy clause of the selection
     predicate a no-op.

  3. Azure publishes no processor attribute at all. Its 314 live Ampere rows
     are identifiable only by the `p` in the size name's variant segment.
*/

const AWS_REGION = 'us-east-1';
const AZURE_REGION = 'eastus';

function awsRow(options: {
  skuId: string;
  instanceType: string;
  physicalProcessor?: string;
  pricePerHour: number;
  tenancy?: string;
  vcpu?: number;
  memoryGb?: number;
}): PricingCatalogRecord {
  const { skuId, instanceType, physicalProcessor, pricePerHour } = options;
  const vcpu = options.vcpu ?? 8;

  return {
    provider: 'aws',
    serviceCategory: 'compute',
    serviceName: 'Amazon Elastic Compute Cloud',
    skuId,
    skuDescription: `$${pricePerHour} per On Demand Linux ${instanceType} Instance Hour`,
    region: AWS_REGION,
    unit: 'Hrs',
    unitPriceUsd: pricePerHour,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    attributes: {
      vcpu,
      memoryGb: options.memoryGb ?? vcpu * 2,
      instanceType,
      instanceFamily: 'General purpose',
      ...(options.tenancy === undefined ? {} : { tenancy: options.tenancy }),
      // Word size, not ISA. Graviton rows report this too.
      processorArchitecture: '64-bit',
      // Omitted for rows that publish no processor at all - 37 of the live AWS
      // compute rows, and every one of Azure's.
      ...(physicalProcessor === undefined ? {} : { physicalProcessor }),
      pricingModel: 'on-demand',
      operation: 'RunInstances',
    },
  } as unknown as PricingCatalogRecord;
}

function azureRow(armSkuName: string, pricePerHour: number): PricingCatalogRecord {
  return {
    provider: 'azure',
    serviceCategory: 'compute',
    serviceName: 'Virtual Machines',
    skuId: `DZH318Z0BXDW/${armSkuName}`,
    skuDescription: `Virtual Machines Series - ${armSkuName}`,
    region: AZURE_REGION,
    unit: '1 Hour',
    unitPriceUsd: pricePerHour,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    // Exactly the attribute set the Azure retail price API returns: no
    // processor field of any kind, and `armSkuName` means Azure Resource
    // Manager, not the instruction set.
    attributes: {
      vcpu: 8,
      memoryGb: 32,
      armSkuName,
      skuName: armSkuName.replace(/^Standard_/, ''),
      pricingModel: 'on-demand',
      serviceFamily: 'Compute',
    },
  } as unknown as PricingCatalogRecord;
}

function workload(
  overrides: Partial<{ processorArchitecture: string; tenancy: string }>,
  region: string,
): NormalizedWorkloadSpec {
  return {
    schemaVersion: '1.0',
    metadata: { sourceType: 'structured_form', createdAt: '2026-01-01T00:00:00.000Z' },
    workload: { type: 'web_app', region: { preference: region, isDefault: false } },
    compute: [
      {
        role: 'web',
        scalingType: 'fixed',
        instanceCount: 1,
        vcpu: 4,
        memoryGb: 8,
        ...overrides,
      },
    ],
    storage: [],
    database: [],
    network: { cdn: false, loadBalancer: false },
    availability: { multiAz: false, multiRegion: false },
  } as unknown as NormalizedWorkloadSpec;
}

async function computeLineItems(
  adapter: AwsProviderAdapter | AzureProviderAdapter,
  spec: NormalizedWorkloadSpec,
): Promise<Array<{ skuId?: string; isApproximate: boolean }>> {
  const result = await adapter.priceWorkload(spec);

  return result.lineItems
    .filter((item) => item.category === 'compute')
    .map((item) => ({ skuId: item.skuId, isApproximate: item.isApproximate }));
}

async function selectedSkuIds(
  adapter: AwsProviderAdapter | AzureProviderAdapter,
  spec: NormalizedWorkloadSpec,
): Promise<Array<string | undefined>> {
  return (await computeLineItems(adapter, spec)).map((item) => item.skuId);
}

const unreachableFetch = (async () => {
  throw new Error('selection must not reach the network');
}) as never;

const frozenClock = (): Date => new Date('2026-01-01T00:00:00.000Z');

describe('processor architecture resolution', () => {
  function aws(catalog: PricingCatalogRecord[]): AwsProviderAdapter {
    return new AwsProviderAdapter(
      new InMemoryPricingCatalogReader(catalog),
      AWS_REGION,
      unreachableFetch,
      frozenClock,
    );
  }

  it('ranks a generation-numbered Graviton part above an unlabelled row for arm64', async () => {
    /*
      The unlabelled row is what makes this a real test. An unresolved
      architecture is ranked "unknown", which sits between an exact match and a
      mismatch - so while Graviton also read as unknown, the two tied on rank
      and the cheaper unlabelled x86 row won an arm64 request on price. Both
      rows have to be present for the bug to show: with only the Graviton row
      in the catalog it is selected either way.
    */
    const skuIds = await selectedSkuIds(
      aws([
        awsRow({
          skuId: 'HZQ8P4W2NKX3RJDM',
          instanceType: 'm7g.2xlarge',
          physicalProcessor: 'AWS Graviton3 Processor',
          pricePerHour: 0.3264,
        }),
        awsRow({
          skuId: 'B7YT5FQ2XLPW9CGN',
          instanceType: 'm5a.2xlarge',
          pricePerHour: 0.2,
        }),
      ]),
      workload({ processorArchitecture: 'arm64' }, AWS_REGION),
    );

    expect(skuIds).toEqual(['HZQ8P4W2NKX3RJDM']);
  });

  it('flags an x86_64 request that can only be met by a Graviton part', async () => {
    /*
      The half of the defect that reports a number the workload cannot run on.
      Only the Graviton row is large enough, so it is what gets priced either
      way - the difference is whether the result admits it. Resolved as arm64 it
      fails the architecture predicate, falls to the approximate path and is
      labelled; unresolved it satisfied the predicate outright and an ARM price
      was returned as an exact answer to an x86 request.
    */
    const lineItems = await computeLineItems(
      aws([
        awsRow({
          skuId: 'HZQ8P4W2NKX3RJDM',
          instanceType: 'm7g.2xlarge',
          physicalProcessor: 'AWS Graviton3 Processor',
          pricePerHour: 0.2992,
        }),
        awsRow({
          skuId: 'QW4NR8ZKT6VYH2PL',
          instanceType: 'm6i.large',
          physicalProcessor: 'Intel Xeon 8375C (Ice Lake)',
          pricePerHour: 0.096,
          vcpu: 2,
        }),
      ]),
      workload({ processorArchitecture: 'x86_64' }, AWS_REGION),
    );

    expect(lineItems).toEqual([{ skuId: 'HZQ8P4W2NKX3RJDM', isApproximate: true }]);
  });
});

describe('Azure architecture resolution from the size name', () => {
  const CATALOG = [
    // Ampere: the `p` sits in the variant segment, after the vCPU count.
    azureRow('Standard_D8ps_v5', 0.308),
    azureRow('Standard_D8s_v5', 0.384),
    /*
      The trap. Collapsed for parsing, this reads `...16promo`, and a variant
      segment open to [a-z] takes the `p` of "Promo" as Ampere. H-series is an
      x86 HPC part.
    */
    azureRow('Standard_H16_Promo', 0.199),
  ];

  function azure(): AzureProviderAdapter {
    return new AzureProviderAdapter(
      new InMemoryPricingCatalogReader(CATALOG),
      AZURE_REGION,
      unreachableFetch,
      frozenClock,
    );
  }

  it('reads an Ampere size name as arm64 with no processor attribute present', async () => {
    await expect(
      selectedSkuIds(azure(), workload({ processorArchitecture: 'arm64' }, AZURE_REGION)),
    ).resolves.toEqual(['DZH318Z0BXDW/Standard_D8ps_v5']);
  });

  it('does not read the p of a promotional suffix as Ampere', async () => {
    /*
      Standard_H16_Promo is the cheapest row here, so an arm64 request that
      mis-parses it wins on price and returns an x86 HPC part for an ARM
      workload. Asserted by exclusion rather than by the winner so the reason
      cannot drift onto the size preference.
    */
    const skuIds = await selectedSkuIds(
      azure(),
      workload({ processorArchitecture: 'arm64' }, AZURE_REGION),
    );

    expect(skuIds).not.toContain('DZH318Z0BXDW/Standard_H16_Promo');
  });
});

describe('compute tenancy resolution', () => {
  /*
    Both rows are the same instance type at the same size, and neither carries
    the word "dedicated" anywhere but in the `tenancy` attribute. That matters:
    an earlier version of this fixture named the dedicated row
    `m6i.2xlarge-dedicated`, which put "dedicated Instance" into the generated
    sku description, where the descriptor fallback matched it - so the test
    passed with the attribute fix reverted.
  */
  function tenancyRow(skuId: string, tenancy: string, pricePerHour: number): PricingCatalogRecord {
    return awsRow({ skuId, instanceType: 'm6i.2xlarge', tenancy, pricePerHour });
  }

  function aws(catalog: PricingCatalogRecord[]): AwsProviderAdapter {
    return new AwsProviderAdapter(
      new InMemoryPricingCatalogReader(catalog),
      AWS_REGION,
      unreachableFetch,
      frozenClock,
    );
  }

  it('reads a capitalised provider tenancy label', async () => {
    /*
      `Shared`, not `shared` - the exact string all 1,389 live AWS compute rows
      carry, and the one the old equality check rejected.

      The dedicated row is priced *below* the shared one here, which real
      dedicated capacity never is. That is deliberate: with realistic pricing
      the shared row wins on price whether or not tenancy resolves, and the test
      would pass with the fix reverted. Inverting the prices makes the tenancy
      predicate the only thing that can produce this answer.
    */
    const skuIds = await selectedSkuIds(
      aws([
        tenancyRow('R3KX9WQ2NPLT6BVH', 'Shared', 0.384),
        tenancyRow('F8ZM5YCJ4DQW7NTR', 'Dedicated', 0.336),
      ]),
      workload({ tenancy: 'shared' }, AWS_REGION),
    );

    expect(skuIds).toEqual(['R3KX9WQ2NPLT6BVH']);
  });

  it('selects dedicated capacity when dedicated tenancy is requested', async () => {
    /*
      The compliance direction, and the one that needs no contrived pricing:
      dedicated capacity genuinely costs more, so price pulls toward the shared
      row on its own. With tenancy unresolved both rows rank equal and the
      cheaper shared row won - a workload that asked for dedicated tenancy was
      priced, and reported, on shared hardware.
    */
    const skuIds = await selectedSkuIds(
      aws([
        tenancyRow('R3KX9WQ2NPLT6BVH', 'Shared', 0.384),
        tenancyRow('F8ZM5YCJ4DQW7NTR', 'Dedicated', 0.4224),
      ]),
      workload({ tenancy: 'dedicated-host' }, AWS_REGION),
    );

    expect(skuIds).toEqual(['F8ZM5YCJ4DQW7NTR']);
  });
});
