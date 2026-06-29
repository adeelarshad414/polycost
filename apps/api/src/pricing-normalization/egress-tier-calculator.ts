export interface EgressTierRate {
  tierFromGb: number;
  tierToGb?: number | null;
  pricePerGb: number;
}

export function calculateEgressCost(tiers: EgressTierRate[], gbPerMonth: number): number {
  if (gbPerMonth <= 0 || tiers.length === 0) {
    return 0;
  }

  const sortedTiers = [...tiers].sort((left, right) => left.tierFromGb - right.tierFromGb);

  return sortedTiers.reduce((total, tier, index) => {
    const nextTier = sortedTiers[index + 1];
    const tierCeiling = tier.tierToGb ?? nextTier?.tierFromGb ?? Number.POSITIVE_INFINITY;
    const billableGb = Math.max(0, Math.min(gbPerMonth, tierCeiling) - tier.tierFromGb);

    return total + billableGb * tier.pricePerGb;
  }, 0);
}
