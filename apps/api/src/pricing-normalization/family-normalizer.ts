import { ProviderId } from '../adapters/common/cloud-provider-adapter.js';

export type NormalizedInstanceFamily =
  | 'general-purpose'
  | 'burstable'
  | 'compute-optimized'
  | 'memory-optimized'
  | 'storage-optimized'
  | 'accelerated-computing';

interface FamilyRule {
  prefix: string;
  family: NormalizedInstanceFamily;
}

const AWS_FAMILY_RULES: FamilyRule[] = [
  { prefix: 'inf', family: 'accelerated-computing' },
  { prefix: 'a', family: 'general-purpose' },
  { prefix: 'c', family: 'compute-optimized' },
  { prefix: 'g', family: 'accelerated-computing' },
  { prefix: 'i', family: 'storage-optimized' },
  { prefix: 'm', family: 'general-purpose' },
  { prefix: 'p', family: 'accelerated-computing' },
  { prefix: 'r', family: 'memory-optimized' },
  { prefix: 't', family: 'burstable' },
  { prefix: 'x', family: 'memory-optimized' },
];

const AZURE_FAMILY_RULES: FamilyRule[] = [
  { prefix: 'b', family: 'burstable' },
  { prefix: 'd', family: 'general-purpose' },
  { prefix: 'e', family: 'memory-optimized' },
  { prefix: 'f', family: 'compute-optimized' },
  { prefix: 'l', family: 'storage-optimized' },
  { prefix: 'm', family: 'memory-optimized' },
  { prefix: 'n', family: 'accelerated-computing' },
];

const GCP_FAMILY_RULES: FamilyRule[] = [
  { prefix: 'a2', family: 'accelerated-computing' },
  { prefix: 'a3', family: 'accelerated-computing' },
  { prefix: 'g2', family: 'accelerated-computing' },
  // c2d/c3d must precede c2/c3 (prefix match); c4/h3 are modern compute-optimized.
  { prefix: 'c2d', family: 'compute-optimized' },
  { prefix: 'c2', family: 'compute-optimized' },
  { prefix: 'c3d', family: 'compute-optimized' },
  { prefix: 'c3', family: 'compute-optimized' },
  { prefix: 'c4', family: 'compute-optimized' },
  { prefix: 'h3', family: 'compute-optimized' },
  { prefix: 'e2-micro', family: 'burstable' },
  { prefix: 'e2-small', family: 'burstable' },
  { prefix: 'e2-medium', family: 'burstable' },
  { prefix: 'e2', family: 'general-purpose' },
  { prefix: 'm1', family: 'memory-optimized' },
  { prefix: 'm2', family: 'memory-optimized' },
  { prefix: 'm3', family: 'memory-optimized' },
  { prefix: 'n1', family: 'general-purpose' },
  // n2d must precede n2 (prefix match); n4 is a modern general-purpose family.
  { prefix: 'n2d', family: 'general-purpose' },
  { prefix: 'n2', family: 'general-purpose' },
  { prefix: 'n4', family: 'general-purpose' },
  { prefix: 't2d', family: 'general-purpose' },
  { prefix: 't2a', family: 'general-purpose' },
  { prefix: 'z3', family: 'storage-optimized' },
];

/**
 * True when a string looks like an instance TYPE, not an opaque SKU id.
 *
 * The prefix rules below are single letters, so running them against an opaque
 * identifier matches essentially at random. That is not hypothetical: AWS's live
 * Price List gives every row an id like `TJCB42XUUBBP8KKF`, and 295 of 8,249
 * rows in one region start with `t`. One of them is r4.16xlarge - 64 vCPU, 488
 * GB - which was therefore classified `burstable`, became an exact match for a
 * 7-vCPU burstable request, and out-ranked every correct 8-vCPU candidate. The
 * comparison came out 25x too expensive.
 *
 * Real instance types are recognisable: AWS and GCP use a dotted or hyphenated
 * shape (`t3.medium`, `e2-standard-4`), Azure an underscored one
 * (`Standard_B2s`). Requiring that shape is what stops an id being read as a
 * family.
 *
 * This guards the CALLER, not normalizeInstanceFamily itself: azureVmShape and
 * gcpMachineShape pass a deliberate bare prefix letter, which this would reject.
 */
export function looksLikeInstanceType(descriptor: string): boolean {
  return /[._-]/.test(descriptor) && /\d/.test(descriptor);
}

export function normalizeInstanceFamily(
  provider: ProviderId,
  providerSkuId: string,
): NormalizedInstanceFamily | undefined {
  const normalizedSku = providerSkuId.toLowerCase();

  /*
    AWS matches the family token exactly; the others still match by prefix.

    An AWS instance type is <family letters><generation digit><attributes>, so
    the family is the leading run of letters: `t3` -> t, `m7i` -> m, `trn1` ->
    trn. The rules here are single letters, and matching them with startsWith
    reads `trn1.32xlarge` - a 128-vCPU Trainium accelerator - as `t`, burstable.
    That is how a $21.50/hr ML instance won a 13-vCPU web request. The same trap
    catches dl1, hpc7a and u-6tb1.

    GCP and Azure keep prefix matching: GCP's rules are already specific
    (`a2`, `c2d`, `c3`), and azureVmShape deliberately passes a bare family
    letter rather than a full type, which an exact-token match would still
    satisfy but a letters-only extraction on a full name would not.
  */
  if (provider === 'aws') {
    const familyToken = /^[a-z]+/.exec(normalizedSku)?.[0];

    return familyToken
      ? familyRulesForProvider(provider).find((rule) => rule.prefix === familyToken)?.family
      : undefined;
  }

  const matchingRule = familyRulesForProvider(provider).find((rule) =>
    normalizedSku.startsWith(rule.prefix),
  );

  return matchingRule?.family;
}

/**
 * Maps a provider's own family label onto the normalized taxonomy.
 *
 * Live catalogs publish their marketing category - AWS says "Memory optimized",
 * Azure "memoryOptimized" - which `isNormalizedInstanceFamily` rejects, so
 * before this the label was discarded and the code fell back to guessing from
 * identifiers. Reading the label the provider already gives us is both more
 * accurate and cheaper than inferring it.
 */
export function normalizeProviderFamilyLabel(
  label: string | undefined,
): NormalizedInstanceFamily | undefined {
  if (!label) {
    return undefined;
  }

  const collapsed = label.toLowerCase().replace(/[^a-z]/g, '');

  if (collapsed.includes('burstable') || collapsed.includes('microinstances')) {
    return 'burstable';
  }

  if (collapsed.includes('computeoptimized')) {
    return 'compute-optimized';
  }

  if (collapsed.includes('memoryoptimized')) {
    return 'memory-optimized';
  }

  if (collapsed.includes('storageoptimized')) {
    return 'storage-optimized';
  }

  if (
    collapsed.includes('gpu') ||
    collapsed.includes('accelerated') ||
    collapsed.includes('fpga') ||
    collapsed.includes('machinelearning') ||
    collapsed.includes('mediaaccelerator')
  ) {
    return 'accelerated-computing';
  }

  if (collapsed.includes('generalpurpose')) {
    return 'general-purpose';
  }

  return undefined;
}

function familyRulesForProvider(provider: ProviderId): FamilyRule[] {
  switch (provider) {
    case 'aws':
      return AWS_FAMILY_RULES;
    case 'azure':
      return AZURE_FAMILY_RULES;
    case 'gcp':
      return GCP_FAMILY_RULES;
  }
}
