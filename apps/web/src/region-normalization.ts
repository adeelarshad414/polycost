import { ProviderId } from './types';

export interface ComparisonRegionGroup {
  id: string;
  label: string;
  providerRegions: Record<ProviderId, string>;
}

export const COMPARISON_REGION_GROUPS: ComparisonRegionGroup[] = [
  {
    id: 'us-east',
    label: 'US East',
    providerRegions: {
      aws: 'us-east-1',
      azure: 'eastus',
      gcp: 'us-east1',
    },
  },
  {
    id: 'us-central',
    label: 'US Central',
    providerRegions: {
      aws: 'us-east-2',
      azure: 'centralus',
      gcp: 'us-central1',
    },
  },
  {
    id: 'us-west',
    label: 'US West',
    providerRegions: {
      aws: 'us-west-2',
      azure: 'westus2',
      gcp: 'us-west1',
    },
  },
  {
    id: 'eu-west',
    label: 'Europe West',
    providerRegions: {
      aws: 'eu-west-1',
      azure: 'westeurope',
      gcp: 'europe-west1',
    },
  },
  {
    id: 'eu-central',
    label: 'Europe Central',
    providerRegions: {
      aws: 'eu-central-1',
      azure: 'germanywestcentral',
      gcp: 'europe-west3',
    },
  },
  {
    id: 'ap-south',
    label: 'Asia Pacific South',
    providerRegions: {
      aws: 'ap-south-1',
      azure: 'centralindia',
      gcp: 'asia-south1',
    },
  },
  {
    id: 'ap-southeast',
    label: 'Asia Pacific Southeast',
    providerRegions: {
      aws: 'ap-southeast-1',
      azure: 'southeastasia',
      gcp: 'asia-southeast1',
    },
  },
  {
    id: 'uk',
    label: 'United Kingdom',
    providerRegions: {
      aws: 'eu-west-2',
      azure: 'uksouth',
      gcp: 'europe-west2',
    },
  },
  {
    id: 'canada',
    label: 'Canada',
    providerRegions: {
      aws: 'ca-central-1',
      azure: 'canadacentral',
      gcp: 'northamerica-northeast1',
    },
  },
];

export const DEFAULT_COMPARISON_REGION = COMPARISON_REGION_GROUPS[0].id;

export function canonicalRegionForRegionPreference(regionPreference: string): string | undefined {
  const normalizedRegion = regionPreference.trim().toLowerCase();

  if (!normalizedRegion) {
    return undefined;
  }

  const directMatch = COMPARISON_REGION_GROUPS.find((group) => group.id === normalizedRegion);

  if (directMatch) {
    return directMatch.id;
  }

  return COMPARISON_REGION_GROUPS.find((group) =>
    Object.values(group.providerRegions).some(
      (providerRegion) => providerRegion === normalizedRegion,
    ),
  )?.id;
}

export function comparisonRegionLabel(regionPreference: string): string | undefined {
  const canonicalRegion = canonicalRegionForRegionPreference(regionPreference);
  const group = COMPARISON_REGION_GROUPS.find((candidate) => candidate.id === canonicalRegion);

  if (!group) {
    return undefined;
  }

  return `${group.label} (${providerRegionSummary(group)})`;
}

export function canonicalRegionsForResidencyScope(scope: string): string[] | undefined {
  switch (normalizedResidencyScope(scope)) {
    case 'us':
      return ['us-east', 'us-central', 'us-west'];
    case 'eu':
      return ['eu-west', 'eu-central'];
    case 'uk':
      return ['uk'];
    case 'apac':
      return ['ap-south', 'ap-southeast'];
    case 'canada':
      return ['canada'];
    default:
      return undefined;
  }
}

export function isRegionPreferenceAllowedForResidency(
  regionPreference: string,
  scope: string,
): boolean {
  const allowedRegions = canonicalRegionsForResidencyScope(scope);

  if (!allowedRegions) {
    return true;
  }

  const canonicalRegion = canonicalRegionForRegionPreference(regionPreference);

  return canonicalRegion !== undefined && allowedRegions.includes(canonicalRegion);
}

export function regionPreferenceForResidencyLock(
  regionPreference: string,
  scope: string,
): string | undefined {
  const allowedRegions = canonicalRegionsForResidencyScope(scope);

  if (!allowedRegions || allowedRegions.length === 0) {
    return undefined;
  }

  return isRegionPreferenceAllowedForResidency(regionPreference, scope)
    ? (canonicalRegionForRegionPreference(regionPreference) ?? regionPreference)
    : allowedRegions[0];
}

export function providerRegionSummary(group: ComparisonRegionGroup): string {
  return `AWS ${group.providerRegions.aws} · Azure ${group.providerRegions.azure} · GCP ${group.providerRegions.gcp}`;
}

function normalizedResidencyScope(
  scope: string,
): 'us' | 'eu' | 'uk' | 'apac' | 'canada' | undefined {
  const normalizedScope = scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (!normalizedScope || normalizedScope === 'global' || normalizedScope === 'anywhere') {
    return undefined;
  }

  if (
    normalizedScope === 'us' ||
    normalizedScope === 'usa' ||
    normalizedScope === 'unitedstates' ||
    normalizedScope === 'america'
  ) {
    return 'us';
  }

  if (
    normalizedScope === 'eu' ||
    normalizedScope === 'europe' ||
    normalizedScope === 'europeanunion' ||
    normalizedScope === 'eea' ||
    normalizedScope === 'gdpr'
  ) {
    return 'eu';
  }

  if (
    normalizedScope === 'uk' ||
    normalizedScope === 'gb' ||
    normalizedScope === 'greatbritain' ||
    normalizedScope === 'unitedkingdom'
  ) {
    return 'uk';
  }

  if (
    normalizedScope === 'apac' ||
    normalizedScope === 'asia' ||
    normalizedScope === 'asiapacific'
  ) {
    return 'apac';
  }

  if (normalizedScope === 'canada' || normalizedScope === 'ca') {
    return 'canada';
  }

  return undefined;
}
