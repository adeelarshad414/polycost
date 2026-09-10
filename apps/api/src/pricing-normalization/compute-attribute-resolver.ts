import type { NormalizedWorkloadSpec } from '../nws/nws.types.js';
import {
  looksLikeInstanceType,
  normalizeInstanceFamily,
  NormalizedInstanceFamily,
  normalizeProviderFamilyLabel,
} from './family-normalizer.js';

/*
  Resolution of a catalog row's compute intent - family, instruction set and
  tenancy - from whatever attributes the provider happened to publish.

  These lived as private methods on BaseCloudProviderAdapter, which meant the
  only way to exercise them was to price a whole workload and infer the answer
  from which SKU came back. Four consecutive defects (#224, #225, #226, #227)
  were resolvers returning the wrong value on real provider attribute shapes,
  every one of them invisible to a green suite because the mock catalog
  publishes attributes in exactly the shape the resolvers expected. They are
  pure functions of a record, so they are testable directly - see
  compute-attribute-resolver.spec.ts, which runs them over shapes captured from
  a live catalog.
*/

export type ProviderId = 'aws' | 'azure' | 'gcp';

export type ComputeProcessorArchitecture = NonNullable<
  NormalizedWorkloadSpec['compute'][number]['processorArchitecture']
>;
export type ComputeTenancy = NonNullable<NormalizedWorkloadSpec['compute'][number]['tenancy']>;

/**
 * The subset of a catalog row these resolvers read. Deliberately narrower than
 * PricingCatalogRecord so the fixture can capture shapes without carrying
 * prices, regions or lineage.
 */
export interface ComputeAttributeSource {
  skuId: string;
  serviceName?: string;
  skuDescription?: string;
  attributes?: Record<string, unknown>;
}

function stringAttribute(record: ComputeAttributeSource, key: string): string | undefined {
  // Reflect.get rather than a computed member access: the keys here are all
  // literals from this module, but a computed index on a Record<string,
  // unknown> trips the object-injection rule, and the adapter only got away
  // with it under a file-wide suppression. This needs no suppression at all.
  const value: unknown = record.attributes ? Reflect.get(record.attributes, key) : undefined;

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isNormalizedInstanceFamily(value: string | undefined): value is NormalizedInstanceFamily {
  return (
    value === 'general-purpose' ||
    value === 'burstable' ||
    value === 'compute-optimized' ||
    value === 'memory-optimized' ||
    value === 'storage-optimized' ||
    value === 'accelerated-computing'
  );
}

function isComputeProcessorArchitecture(
  value: string | undefined,
): value is ComputeProcessorArchitecture {
  return value === 'x86_64' || value === 'arm64' || value === 'gpu';
}

function descriptorsOf(record: ComputeAttributeSource): string[] {
  return [
    record.skuId,
    record.serviceName,
    record.skuDescription,
    stringAttribute(record, 'instanceType'),
    stringAttribute(record, 'skuName'),
    stringAttribute(record, 'armSkuName'),
    stringAttribute(record, 'machineType'),
    stringAttribute(record, 'processor'),
    /*
      The field that actually carries the instruction set. AWS's
      `processorArchitecture` says "64-bit" for Graviton and Intel alike - it is
      word size, not ISA - so without this the arm64/x86_64 heuristics fall back
      to pattern-matching the instance type, which only works for older names:
      /\bc\d\b/ matches c4.2xlarge but not c6i.2xlarge, so most modern types
      resolved to undefined and ranked worse than older ones regardless of price.
    */
    stringAttribute(record, 'physicalProcessor'),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function resolveInstanceFamily(
  providerId: ProviderId,
  record: ComputeAttributeSource,
): NormalizedInstanceFamily | undefined {
  const explicitFamily =
    stringAttribute(record, 'family') ??
    stringAttribute(record, 'instanceFamily') ??
    stringAttribute(record, 'normalizedFamily');

  if (isNormalizedInstanceFamily(explicitFamily)) {
    return explicitFamily;
  }

  const descriptors = [
    record.skuId,
    record.serviceName,
    record.skuDescription,
    stringAttribute(record, 'instanceType'),
    stringAttribute(record, 'skuName'),
    stringAttribute(record, 'armSkuName'),
    stringAttribute(record, 'machineType'),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const descriptor of descriptors) {
    // Only descriptors shaped like an instance type. skuId is in this list and,
    // for live catalogs, is an opaque identifier - matching single-letter family
    // prefixes against it succeeds at random.
    if (!looksLikeInstanceType(descriptor)) {
      continue;
    }

    const family = normalizeInstanceFamily(providerId, descriptor);

    if (family) {
      return family;
    }
  }

  /*
    The provider's own marketing label, last.

    It is a coarser taxonomy than ours and deliberately ranks below the instance
    type: AWS labels t3.2xlarge "General purpose", but t3 is burstable, and a
    burstable request must be able to find it. Reading the label first excluded
    every live burstable instance and fell back to seed pricing.

    It still earns its place for rows that publish no parseable instance type,
    where the alternative is no family at all.
  */
  return normalizeProviderFamilyLabel(explicitFamily);
}

const GPU_DESCRIPTOR_PATTERN = /\b(gpu|nvidia|a100|h100|v100|p4d|g5|nc|nd|a2|g2)\b/i;

/*
  `graviton` needed a trailing \b, and AWS names every generation with a digit
  ("AWS Graviton4 Processor"): n->4 is not a word boundary, so the token never
  matched. 412 of 1,389 live AWS compute rows are Graviton and every one of them
  resolved to an unknown architecture - so an arm64 request ranked real Graviton
  no better than any unlabelled x86 row, and an x86_64 request would silently
  accept a Graviton instance when no known-x86 row fitted.
*/
const ARM_DESCRIPTOR_PATTERN = /\b(?:arm|arm64|aarch64|graviton\d*|ampere|t2a)\b/i;

const X86_DESCRIPTOR_PATTERN = /\b(x86|x64|intel|amd|xeon|epyc|m\d|c\d|r\d|d\d|fsv2)\b/i;

/*
  Azure marks Ampere ARM parts with a `p` in the size name's variant segment -
  the letters between the vCPU count and the version suffix: Standard_D4ps_v5,
  Standard_B2pls_v2, Standard_E8pds_v6. The `p` has to come from that segment
  specifically, because other size names carry a p in the family letters
  (Standard_NP10s is an x86-hosted FPGA part) or in a product name.

  Checked against the live catalog: this matches 97 distinct sizes across 314
  rows, all of them genuine Ampere parts, and no non-ARM size.

  The variant charclass is closed to Azure's documented variant letters rather
  than [a-z], because the size name is not the whole string: Standard_H16_Promo
  and Standard_NC12_Promo collapse to `...16promo` / `...12promo`, and an open
  charclass reads the `p` of "Promo" as Ampere - flipping an x86 H-series part
  and eleven NVIDIA parts to arm64. Closing the class makes those names fail to
  parse at all, which is the correct answer for them.
*/
const AZURE_SIZE_NAME_VERSION_SUFFIX = /v\d+$/;
const AZURE_SIZE_NAME_PATTERN = /^[a-z]+\d+([abcdilmprst]*)$/;

function azureArchitectureFromSizeName(
  sizeName: string | undefined,
): ComputeProcessorArchitecture | undefined {
  if (!sizeName) {
    return undefined;
  }

  // The version suffix is peeled off before matching rather than written as an
  // optional group: `(?:v\d+)?` nests a quantifier inside an optional, which is
  // the shape the ReDoS lint rule flags. Stripping it first leaves every
  // quantifier in the pattern at star height one.
  const collapsed = sizeName
    .toLowerCase()
    .replace(/[_\s-]/g, '')
    .replace(AZURE_SIZE_NAME_VERSION_SUFFIX, '');
  const variant = AZURE_SIZE_NAME_PATTERN.exec(collapsed)?.[1];

  return variant?.includes('p') ? 'arm64' : undefined;
}

export function resolveProcessorArchitecture(
  providerId: ProviderId,
  record: ComputeAttributeSource,
): ComputeProcessorArchitecture | undefined {
  const explicitArchitecture =
    stringAttribute(record, 'processorArchitecture') ??
    stringAttribute(record, 'architecture') ??
    stringAttribute(record, 'cpuArchitecture');

  if (isComputeProcessorArchitecture(explicitArchitecture)) {
    return explicitArchitecture;
  }

  const descriptors = descriptorsOf(record);

  if (descriptors.some((descriptor) => GPU_DESCRIPTOR_PATTERN.test(descriptor))) {
    return 'gpu';
  }

  if (descriptors.some((descriptor) => ARM_DESCRIPTOR_PATTERN.test(descriptor))) {
    return 'arm64';
  }

  // Azure publishes no processor field at all, so the size name is the only ISA
  // signal it gives us. Read it from the size attributes rather than the whole
  // descriptor list: a stray `p` in a product description would otherwise flip
  // an x86 row to arm64.
  if (providerId === 'azure') {
    const azureArchitecture = azureArchitectureFromSizeName(
      stringAttribute(record, 'armSkuName') ?? stringAttribute(record, 'skuName'),
    );

    if (azureArchitecture) {
      return azureArchitecture;
    }
  }

  if (descriptors.some((descriptor) => X86_DESCRIPTOR_PATTERN.test(descriptor))) {
    return 'x86_64';
  }

  return undefined;
}

/*
  Providers publish tenancy as a marketing label, not as our taxonomy's token.
  Every live AWS compute row reports `Shared` with a capital S, so an equality
  check against 'shared' rejected all 1,389 of them and left tenancy undefined
  across the whole catalog - which made the tenancy clause of the selection
  predicate a no-op that would accept a Dedicated SKU for a shared request.

  AWS's `Dedicated` is a Dedicated Instance and `Host` is a Dedicated Host. Both
  map to 'dedicated-host' here, matching what the descriptor fallback below
  already does for the phrase "dedicated instance"; the NWS taxonomy draws its
  line between shared and not-shared tenancy, not between the two AWS products.
*/
export function normalizeProviderTenancyLabel(
  label: string | undefined,
): ComputeTenancy | undefined {
  if (!label) {
    return undefined;
  }

  const collapsed = label.toLowerCase().replace(/[^a-z]/g, '');

  if (collapsed === 'shared' || collapsed === 'default' || collapsed === 'multitenant') {
    return 'shared';
  }

  if (collapsed === 'soletenant' || collapsed === 'singletenant' || collapsed === 'sole') {
    return 'sole-tenant';
  }

  if (
    collapsed === 'dedicated' ||
    collapsed === 'dedicatedhost' ||
    collapsed === 'dedicatedinstance' ||
    collapsed === 'host'
  ) {
    return 'dedicated-host';
  }

  return undefined;
}

const SOLE_TENANT_DESCRIPTOR_PATTERN = /\b(sole[- ]tenant|sole tenant|single tenant)\b/i;
const DEDICATED_DESCRIPTOR_PATTERN = /\b(dedicated host|dedicated instance|dedicated tenancy)\b/i;

export function resolveComputeTenancy(record: ComputeAttributeSource): ComputeTenancy | undefined {
  const explicitTenancy =
    stringAttribute(record, 'tenancy') ??
    stringAttribute(record, 'hostTenancy') ??
    stringAttribute(record, 'computeTenancy');

  const normalizedTenancy = normalizeProviderTenancyLabel(explicitTenancy);

  if (normalizedTenancy) {
    return normalizedTenancy;
  }

  const descriptors = descriptorsOf(record);

  if (descriptors.some((descriptor) => SOLE_TENANT_DESCRIPTOR_PATTERN.test(descriptor))) {
    return 'sole-tenant';
  }

  if (descriptors.some((descriptor) => DEDICATED_DESCRIPTOR_PATTERN.test(descriptor))) {
    return 'dedicated-host';
  }

  return undefined;
}
