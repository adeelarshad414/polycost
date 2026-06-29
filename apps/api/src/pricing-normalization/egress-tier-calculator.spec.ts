import { calculateEgressCost, EgressTierRate } from './egress-tier-calculator';

describe('calculateEgressCost', () => {
  it('walks tier bands with explicit upper bounds', () => {
    const tiers: EgressTierRate[] = [
      { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.09 },
      { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.085 },
      { tierFromGb: 51_200, tierToGb: null, pricePerGb: 0.07 },
    ];

    expect(calculateEgressCost(tiers, 0)).toBe(0);
    expect(calculateEgressCost(tiers, 500)).toBe(45);
    expect(calculateEgressCost(tiers, 10_240)).toBeCloseTo(921.6, 2);
    expect(calculateEgressCost(tiers, 11_240)).toBeCloseTo(1006.6, 2);
  });

  it('infers upper bounds from the next tier start when providers only expose start ranges', () => {
    const tiers: EgressTierRate[] = [
      { tierFromGb: 50_000, pricePerGb: 0.06 },
      { tierFromGb: 0, pricePerGb: 0.08 },
      { tierFromGb: 10_000, pricePerGb: 0.07 },
    ];

    expect(calculateEgressCost(tiers, 60_000)).toBe(4200);
  });

  it.each([
    [
      'aws us-east-1 style tier',
      [
        { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.09 },
        { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.085 },
      ],
      12_000,
      1071.2,
    ],
    [
      'azure eastus style tier',
      [
        { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.087 },
        { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.077 },
      ],
      12_000,
      1026.4,
    ],
    [
      'gcp us-central1 style tier',
      [
        { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.09 },
        { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.0218181818 },
      ],
      12_000,
      960,
    ],
  ])('covers %s boundary math', (_label, tiers, gbPerMonth, expected) => {
    expect(calculateEgressCost(tiers, gbPerMonth)).toBeCloseTo(expected, 2);
  });
});
