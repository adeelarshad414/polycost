import type { ComparisonResult } from '../types';
import type { CategoryValue, ChartProviderId, ProviderQuote } from './models';

const PROVIDERS: ChartProviderId[] = ['aws', 'azure', 'gcp'];

/** Monthly quote per provider; a provider missing from the result is unpriced. */
export function comparisonQuotes(comparison: ComparisonResult | null): ProviderQuote[] {
  return PROVIDERS.map((providerId) => {
    const provider = comparison?.providers.find((entry) => entry.providerId === providerId);
    return { providerId, value: provider?.totals.monthly };
  });
}

/**
 * Monthly cost by category for each priced provider. Egress and networking are
 * one "network" category; anything the breakdown does not account for is kept
 * as "operations & other" so each bar still adds up to the provider's total.
 */
export function comparisonCategoryBreakdown(
  comparison: ComparisonResult | null,
): Array<{ providerId: ChartProviderId; categories: CategoryValue[] }> {
  return (comparison?.providers ?? [])
    .filter((provider) => PROVIDERS.includes(provider.providerId))
    .map((provider) => {
      const breakdown = provider.breakdown;
      const categories: CategoryValue[] = breakdown
        ? [
            { category: 'compute', value: breakdown.computeMonthlyCostUsd },
            { category: 'storage', value: breakdown.storageMonthlyCostUsd },
            { category: 'database', value: breakdown.databaseMonthlyCostUsd },
            {
              category: 'network',
              value: breakdown.egressMonthlyCostUsd + breakdown.networkingMonthlyCostUsd,
            },
            { category: 'support', value: breakdown.supportMonthlyCostUsd },
            { category: 'licensing', value: breakdown.licensingMonthlyCostUsd },
            { category: 'operations', value: breakdown.operationsMonthlyCostUsd },
          ]
        : [];
      const accounted = categories.reduce((sum, entry) => sum + entry.value, 0);
      const remainder = provider.totals.monthly - accounted;
      if (remainder > 0.005) {
        categories.push({ category: 'operations', value: remainder });
      }
      return { providerId: provider.providerId, categories };
    });
}
