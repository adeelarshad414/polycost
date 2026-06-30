import {
  canonicalRegionForProviderRegion,
  providerRegionForCanonicalRegion,
  providerRegionsForCanonicalRegion,
  supportedCanonicalRegions,
} from './region-map';

describe('region-map', () => {
  it('maps canonical regions to provider-specific region codes', () => {
    expect(providerRegionsForCanonicalRegion('us-east')).toEqual({
      aws: 'us-east-1',
      azure: 'eastus',
      gcp: 'us-east1',
    });
    expect(providerRegionForCanonicalRegion('eu-west', 'azure')).toBe('westeurope');
  });

  it('maps provider-specific region codes back to canonical comparison regions', () => {
    expect(canonicalRegionForProviderRegion('us-east-1')).toBe('us-east');
    expect(canonicalRegionForProviderRegion('eastus')).toBe('us-east');
    expect(canonicalRegionForProviderRegion('us-east1')).toBe('us-east');
  });

  it('does not guess unsupported canonical regions', () => {
    expect(canonicalRegionForProviderRegion('antarctica-south')).toBeUndefined();
    expect(providerRegionsForCanonicalRegion('antarctica-south')).toBeUndefined();
    expect(providerRegionForCanonicalRegion('antarctica-south', 'aws')).toBeUndefined();
    expect(supportedCanonicalRegions()).toContain('us-east');
  });
});
