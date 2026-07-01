import { ProviderId } from '../adapters/common/cloud-provider-adapter';

export const REGION_MAP = {
  'us-east': {
    aws: 'us-east-1',
    azure: 'eastus',
    gcp: 'us-east1',
  },
  'us-central': {
    aws: 'us-east-2',
    azure: 'centralus',
    gcp: 'us-central1',
  },
  'us-west': {
    aws: 'us-west-2',
    azure: 'westus2',
    gcp: 'us-west1',
  },
  'eu-west': {
    aws: 'eu-west-1',
    azure: 'westeurope',
    gcp: 'europe-west1',
  },
  'eu-central': {
    aws: 'eu-central-1',
    azure: 'germanywestcentral',
    gcp: 'europe-west3',
  },
  'ap-south': {
    aws: 'ap-south-1',
    azure: 'centralindia',
    gcp: 'asia-south1',
  },
  'ap-southeast': {
    aws: 'ap-southeast-1',
    azure: 'southeastasia',
    gcp: 'asia-southeast1',
  },
  uk: {
    aws: 'eu-west-2',
    azure: 'uksouth',
    gcp: 'europe-west2',
  },
  canada: {
    aws: 'ca-central-1',
    azure: 'canadacentral',
    gcp: 'northamerica-northeast1',
  },
} as const satisfies Record<string, Record<ProviderId, string>>;

export type CanonicalRegion = keyof typeof REGION_MAP;
export type ResidencyRegionScope = 'us' | 'eu' | 'uk' | 'apac' | 'canada';

export function isCanonicalRegion(region: string): region is CanonicalRegion {
  return regionMapFor(region) !== undefined;
}

export function canonicalRegionForProviderRegion(region: string): CanonicalRegion | undefined {
  const normalizedRegion = region.trim().toLowerCase();

  for (const canonicalRegion of supportedCanonicalRegions()) {
    const providerRegions = regionMapFor(canonicalRegion);

    if (
      providerRegions &&
      Object.values(providerRegions).some((providerRegion) => providerRegion === normalizedRegion)
    ) {
      return canonicalRegion;
    }
  }

  return undefined;
}

export function providerRegionForCanonicalRegion(
  region: string,
  provider: ProviderId,
): string | undefined {
  const providerRegions = providerRegionsForCanonicalRegion(region);

  if (!providerRegions) {
    return undefined;
  }

  switch (provider) {
    case 'aws':
      return providerRegions.aws;
    case 'azure':
      return providerRegions.azure;
    case 'gcp':
      return providerRegions.gcp;
  }
}

export function providerRegionsForCanonicalRegion(
  region: string,
): Record<ProviderId, string> | undefined {
  return regionMapFor(region);
}

export function supportedCanonicalRegions(): CanonicalRegion[] {
  return [
    'us-east',
    'us-central',
    'us-west',
    'eu-west',
    'eu-central',
    'ap-south',
    'ap-southeast',
    'uk',
    'canada',
  ];
}

export function residencyScopeForRegionScope(scope: string): ResidencyRegionScope | undefined {
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

export function canonicalRegionsForResidencyScope(scope: string): CanonicalRegion[] | undefined {
  const residencyScope = residencyScopeForRegionScope(scope);

  switch (residencyScope) {
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

export function canonicalRegionForResidencyLock(
  regionPreference: string | undefined,
  scope: string,
): CanonicalRegion | undefined {
  const allowedRegions = canonicalRegionsForResidencyScope(scope);

  if (!allowedRegions || allowedRegions.length === 0) {
    return undefined;
  }

  const requestedCanonicalRegion = canonicalRegionForPreference(regionPreference);

  return requestedCanonicalRegion && allowedRegions.includes(requestedCanonicalRegion)
    ? requestedCanonicalRegion
    : allowedRegions[0];
}

export function canonicalRegionForPreference(
  regionPreference: string | undefined,
): CanonicalRegion | undefined {
  const preference = regionPreference?.trim().toLowerCase();

  if (!preference) {
    return undefined;
  }

  return (
    canonicalRegionForProviderRegion(preference) ??
    (isCanonicalRegion(preference) ? preference : undefined)
  );
}

function regionMapFor(region: string): Record<ProviderId, string> | undefined {
  switch (region) {
    case 'us-east':
      return REGION_MAP['us-east'];
    case 'us-central':
      return REGION_MAP['us-central'];
    case 'us-west':
      return REGION_MAP['us-west'];
    case 'eu-west':
      return REGION_MAP['eu-west'];
    case 'eu-central':
      return REGION_MAP['eu-central'];
    case 'ap-south':
      return REGION_MAP['ap-south'];
    case 'ap-southeast':
      return REGION_MAP['ap-southeast'];
    case 'uk':
      return REGION_MAP.uk;
    case 'canada':
      return REGION_MAP.canada;
    default:
      return undefined;
  }
}
