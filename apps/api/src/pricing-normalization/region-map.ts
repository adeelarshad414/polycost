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
} as const satisfies Record<string, Record<ProviderId, string>>;

export type CanonicalRegion = keyof typeof REGION_MAP;

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
  return ['us-east', 'us-central', 'us-west', 'eu-west', 'eu-central', 'ap-south'];
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
    default:
      return undefined;
  }
}
