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

export function normalizeInstanceFamily(
  provider: ProviderId,
  providerSkuId: string,
): NormalizedInstanceFamily | undefined {
  const normalizedSku = providerSkuId.toLowerCase();
  const matchingRule = familyRulesForProvider(provider).find((rule) =>
    normalizedSku.startsWith(rule.prefix),
  );

  return matchingRule?.family;
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
