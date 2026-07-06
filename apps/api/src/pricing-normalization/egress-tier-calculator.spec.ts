import {
  calculateEgressCost,
  calculateEgressTierBreakdown,
  EgressTierRate,
} from './egress-tier-calculator';

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
    expect(calculateEgressTierBreakdown(tiers, 11_240)).toEqual([
      {
        tierFromGb: 0,
        tierToGb: 10_240,
        pricePerGb: 0.09,
        billableGb: 10_240,
        monthlyCostUsd: 921.6,
      },
      {
        tierFromGb: 10_240,
        tierToGb: 51_200,
        pricePerGb: 0.085,
        billableGb: 1_000,
        monthlyCostUsd: 85,
      },
    ]);
  });

  it('infers upper bounds from the next tier start when providers only expose start ranges', () => {
    const tiers: EgressTierRate[] = [
      { tierFromGb: 50_000, pricePerGb: 0.06 },
      { tierFromGb: 0, pricePerGb: 0.08 },
      { tierFromGb: 10_000, pricePerGb: 0.07 },
    ];

    expect(calculateEgressCost(tiers, 60_000)).toBe(4200);
    expect(
      calculateEgressTierBreakdown(tiers, 60_000).map((tier) => ({
        from: tier.tierFromGb,
        to: tier.tierToGb,
        gb: tier.billableGb,
      })),
    ).toEqual([
      { from: 0, to: 10_000, gb: 10_000 },
      { from: 10_000, to: 50_000, gb: 40_000 },
      { from: 50_000, to: undefined, gb: 10_000 },
    ]);
  });

  it('derives the total cost from the same rows used for the visible tier breakdown', () => {
    const tiers: EgressTierRate[] = [
      { tierFromGb: 0, tierToGb: 100, pricePerGb: 0.1 },
      { tierFromGb: 100, tierToGb: 1_000, pricePerGb: 0.08 },
    ];
    const breakdown = calculateEgressTierBreakdown(tiers, 250);
    const total = breakdown.reduce((sum, tier) => sum + tier.monthlyCostUsd, 0);

    expect(total).toBe(calculateEgressCost(tiers, 250));
    expect(total).toBe(22);
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

  it('matches the manual AWS-style tier calculation for 80TB of internet egress', () => {
    const tiers: EgressTierRate[] = [
      { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.09 },
      { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.085 },
      { tierFromGb: 51_200, tierToGb: null, pricePerGb: 0.07 },
    ];

    expect(calculateEgressTierBreakdown(tiers, 81_920)).toEqual([
      {
        tierFromGb: 0,
        tierToGb: 10_240,
        pricePerGb: 0.09,
        billableGb: 10_240,
        monthlyCostUsd: 921.6,
      },
      {
        tierFromGb: 10_240,
        tierToGb: 51_200,
        pricePerGb: 0.085,
        billableGb: 40_960,
        monthlyCostUsd: 3481.6,
      },
      {
        tierFromGb: 51_200,
        pricePerGb: 0.07,
        billableGb: 30_720,
        monthlyCostUsd: 2150.4,
      },
    ]);
    expect(calculateEgressCost(tiers, 81_920)).toBe(6553.6);
  });
});
