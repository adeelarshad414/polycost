import {
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

  it('does not guess unsupported canonical regions', () => {
    expect(providerRegionsForCanonicalRegion('antarctica-south')).toBeUndefined();
    expect(providerRegionForCanonicalRegion('antarctica-south', 'aws')).toBeUndefined();
    expect(supportedCanonicalRegions()).toContain('us-east');
  });
});
