import type { ComparisonResult, CostIntervals } from '../types';
import type { CategoryValue, ChartProviderId, ProviderQuote } from './models';

const PROVIDERS: ChartProviderId[] = ['aws', 'azure', 'gcp'];

export type QuoteInterval = Exclude<keyof CostIntervals, 'hourly'>;

const INTERVAL_PERIOD = new Map<QuoteInterval, string>([
  ['daily', 'day'],
  ['weekly', 'week'],
  ['monthly', 'month'],
  ['quarterly', 'quarter'],
  ['yearly', 'year'],
]);

/** The unit a chart states for an interval, e.g. "yearly" is "year". */
export function intervalPeriod(interval: QuoteInterval): string {
  return INTERVAL_PERIOD.get(interval) ?? 'month';
}

/** One quote per provider for the interval; a provider missing from the result is unpriced. */
export function comparisonQuotes(
  comparison: ComparisonResult | null,
  interval: QuoteInterval = 'monthly',
): ProviderQuote[] {
  return PROVIDERS.map((providerId) => {
    const provider = comparison?.providers.find((entry) => entry.providerId === providerId);
    if (!provider) {
      return { providerId, value: undefined };
    }
    const totals = new Map(Object.entries(provider.totals));
    return { providerId, value: totals.get(interval) };
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
