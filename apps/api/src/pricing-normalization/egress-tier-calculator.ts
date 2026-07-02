export interface EgressTierRate {
  tierFromGb: number;
  tierToGb?: number | null;
  pricePerGb: number;
}

export interface CalculatedEgressTier {
  tierFromGb: number;
  tierToGb?: number;
  pricePerGb: number;
  billableGb: number;
  monthlyCostUsd: number;
}

export function calculateEgressCost(tiers: EgressTierRate[], gbPerMonth: number): number {
  return calculateEgressTierBreakdown(tiers, gbPerMonth).reduce(
    (total, tier) => total + tier.monthlyCostUsd,
    0,
  );
}

export function calculateEgressTierBreakdown(
  tiers: EgressTierRate[],
  gbPerMonth: number,
): CalculatedEgressTier[] {
  if (gbPerMonth <= 0 || tiers.length === 0) {
    return [];
  }

  const sortedTiers = [...tiers].sort((left, right) => left.tierFromGb - right.tierFromGb);

  return sortedTiers
    .map((tier, index) => {
      const nextTier = sortedTiers[index + 1];
      const tierCeiling = tier.tierToGb ?? nextTier?.tierFromGb ?? Number.POSITIVE_INFINITY;
      const billableGb = Math.max(0, Math.min(gbPerMonth, tierCeiling) - tier.tierFromGb);

      return {
        tierFromGb: tier.tierFromGb,
        ...(Number.isFinite(tierCeiling) ? { tierToGb: tierCeiling } : {}),
        pricePerGb: tier.pricePerGb,
        billableGb,
        monthlyCostUsd: roundCurrency(billableGb * tier.pricePerGb),
      };
    })
    .filter((tier) => tier.billableGb > 0);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
