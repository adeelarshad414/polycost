import { describe, it, expect } from '@jest/globals';
import { commitmentPricingModelCandidates } from './commitment-policy.js';

describe('commitmentPricingModelCandidates', () => {
  it('allows 3-year commitments only for production workloads with very high commitment appetite', () => {
    expect(
      commitmentPricingModelCandidates({
        environment: 'production',
        commitmentPreferencePercent: 90,
      }),
    ).toEqual(['reserved-3yr', 'savings-plan', 'reserved-1yr']);
  });

  it('keeps moderate production commitment appetite on shorter terms', () => {
    expect(
      commitmentPricingModelCandidates({
        environment: 'production',
        commitmentPreferencePercent: 70,
      }),
    ).toEqual(['reserved-1yr', 'savings-plan']);
  });

  it('does not recommend commitments when flexibility is preferred', () => {
    expect(
      commitmentPricingModelCandidates({
        environment: 'production',
        commitmentPreferencePercent: 20,
      }),
    ).toEqual([]);
  });

  it('blocks 3-year recommendations for non-production workloads', () => {
    expect(
      commitmentPricingModelCandidates({
        environment: 'development',
        commitmentPreferencePercent: 90,
      }),
    ).toEqual(['savings-plan', 'reserved-1yr']);

    expect(
      commitmentPricingModelCandidates({
        environment: 'staging',
        commitmentPreferencePercent: 70,
      }),
    ).toEqual([]);
  });
});
