import { normalizeInstanceFamily } from './family-normalizer';

describe('normalizeInstanceFamily', () => {
  it('normalizes common AWS instance family prefixes', () => {
    expect(normalizeInstanceFamily('aws', 'm7i.large')).toBe('general-purpose');
    expect(normalizeInstanceFamily('aws', 't4g.medium')).toBe('burstable');
    expect(normalizeInstanceFamily('aws', 'c7g.2xlarge')).toBe('compute-optimized');
    expect(normalizeInstanceFamily('aws', 'r7i.xlarge')).toBe('memory-optimized');
  });

  it('normalizes common Azure SKU family prefixes', () => {
    expect(normalizeInstanceFamily('azure', 'B2s_v2')).toBe('burstable');
    expect(normalizeInstanceFamily('azure', 'D4as_v5')).toBe('general-purpose');
    expect(normalizeInstanceFamily('azure', 'F8s_v2')).toBe('compute-optimized');
    expect(normalizeInstanceFamily('azure', 'E8ds_v5')).toBe('memory-optimized');
  });

  it('normalizes common GCP machine families with longest-prefix matching', () => {
    expect(normalizeInstanceFamily('gcp', 'e2-small')).toBe('burstable');
    expect(normalizeInstanceFamily('gcp', 'e2-standard-4')).toBe('general-purpose');
    expect(normalizeInstanceFamily('gcp', 'n2-standard-4')).toBe('general-purpose');
    expect(normalizeInstanceFamily('gcp', 'c3-highcpu-8')).toBe('compute-optimized');
    expect(normalizeInstanceFamily('gcp', 'm3-megamem-64')).toBe('memory-optimized');
    expect(normalizeInstanceFamily('gcp', 'z3-highmem-8')).toBe('storage-optimized');
  });

  it('returns undefined instead of guessing unknown families', () => {
    expect(normalizeInstanceFamily('aws', 'z99.experimental')).toBeUndefined();
  });
});
