import type { ComparisonProviderResult, ServiceCategory } from '../types';

/**
 * Cost by service for one provider.
 *
 * The provider cards answer "which cloud", this answers "what am I paying for" -
 * and in practice that is the question that changes an architecture. A total of
 * $121 tells you nothing; $100 of it being a support plan tells you where to
 * look first.
 *
 * Scoped to a single provider on purpose. Summing categories across three
 * mutually exclusive options would describe a bill nobody is going to receive.
 */

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  compute: 'Compute',
  storage: 'Storage',
  database: 'Database',
  network: 'Networking',
  support: 'Support',
  licensing: 'Licensing',
  operations: 'Operations',
};

export interface ServiceSlice {
  category: ServiceCategory;
  label: string;
  cost: number;
  share: number;
}

export function serviceSlices(provider: ComparisonProviderResult): ServiceSlice[] {
  const totals = new Map<ServiceCategory, number>();

  for (const item of provider.lineItems) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.baseMonthlyCostUsd);
  }

  const priced = [...totals.entries()].filter(([, cost]) => cost > 0);
  const total = priced.reduce((sum, [, cost]) => sum + cost, 0);

  // Sorted by cost so the thing worth looking at is first, and zero-cost
  // categories are dropped - a list padded with $0.00 rows reads as noise.
  return priced
    .sort((a, b) => b[1] - a[1])
    .map(([category, cost]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      cost,
      share: total > 0 ? cost / total : 0,
    }));
}

export function CostByService({
  provider,
  formatCost,
}: {
  provider: ComparisonProviderResult;
  /** Passed in so this shares the app's currency formatting rather than its own. */
  formatCost: (value: number) => string;
}) {
  const slices = serviceSlices(provider);

  if (slices.length === 0) {
    return null;
  }

  const largest = slices[0].cost;

  return (
    <section className="cost-by-service" aria-label="Cost by service">
      <div className="cost-by-service-heading">
        <span>Cost by service</span>
        <h3>{provider.providerId.toUpperCase()} monthly breakdown</h3>
      </div>

      <ul className="cost-by-service-list">
        {slices.map((slice) => (
          <li key={slice.category} className="cost-by-service-row">
            <div className="cost-by-service-label">
              <span>{slice.label}</span>
              <strong>{formatCost(slice.cost)}</strong>
            </div>
            {/*
              Bars are scaled against the largest slice rather than the total, so
              the smaller categories stay visible instead of collapsing into a
              sliver. The share is on the row for the absolute reading.
            */}
            <div
              className="cost-by-service-track"
              role="img"
              aria-label={`${slice.label}: ${formatCost(slice.cost)}, ${Math.round(
                slice.share * 100,
              )} percent of this provider's cost`}
            >
              <div
                className={`cost-by-service-bar cost-by-service-bar-${slice.category}`}
                style={{ width: `${Math.max(2, (slice.cost / largest) * 100)}%` }}
              />
            </div>
            <span className="cost-by-service-share">{Math.round(slice.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
