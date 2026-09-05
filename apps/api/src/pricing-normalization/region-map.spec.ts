import {
  canonicalRegionForProviderRegion,
  canonicalRegionForResidencyLock,
  canonicalRegionsForResidencyScope,
  providerRegionForCanonicalRegion,
  providerRegionsForCanonicalRegion,
  residencyScopeForRegionScope,
  supportedCanonicalRegions,
} from './region-map.js';

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
    expect(canonicalRegionForProviderRegion('uksouth')).toBe('uk');
    expect(canonicalRegionForProviderRegion('northamerica-northeast1')).toBe('canada');
  });

  it('does not guess unsupported canonical regions', () => {
    expect(canonicalRegionForProviderRegion('antarctica-south')).toBeUndefined();
    expect(providerRegionsForCanonicalRegion('antarctica-south')).toBeUndefined();
    expect(providerRegionForCanonicalRegion('antarctica-south', 'aws')).toBeUndefined();
    expect(supportedCanonicalRegions()).toContain('us-east');
    expect(supportedCanonicalRegions()).toContain('uk');
    expect(supportedCanonicalRegions()).toContain('canada');
  });

  it('resolves residency lock scopes into compliant canonical regions', () => {
    expect(residencyScopeForRegionScope('European Union')).toBe('eu');
    expect(residencyScopeForRegionScope('GDPR')).toBe('eu');
    expect(canonicalRegionsForResidencyScope('eu')).toEqual(['eu-west', 'eu-central']);
    expect(canonicalRegionsForResidencyScope('apac')).toEqual(['ap-south', 'ap-southeast']);
    expect(canonicalRegionForResidencyLock('us-east', 'eu')).toBe('eu-west');
    expect(canonicalRegionForResidencyLock('germanywestcentral', 'eu')).toBe('eu-central');
    expect(canonicalRegionForResidencyLock('eastus', 'global')).toBeUndefined();
  });
});
