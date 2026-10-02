import { formatCurrency } from '../../lib/format';
import type { ComparisonResult } from '../../types';
import { rankedQuotes } from './VerdictHero';

const PROVIDER_NAME = new Map([
  ['aws', 'AWS'],
  ['azure', 'Azure'],
  ['gcp', 'GCP'],
]);

/** Plain sentence for screen readers when a comparison finishes (UI-7). */
export function comparisonAnnouncement(comparison: ComparisonResult | null): string {
  if (!comparison) {
    return '';
  }
  const [lowest] = rankedQuotes(comparison);
  if (!lowest) {
    return 'Results ready. No provider could be priced for this workload.';
  }
  const name = PROVIDER_NAME.get(lowest.providerId) ?? lowest.providerId;
  return `Results ready. ${name} is the lowest-cost option at ${formatCurrency(
    lowest.monthly,
  )} per month.`;
}

/**
 * Polite live region: results render far below the form on small screens, so a
 * screen-reader user otherwise gets no signal that the comparison completed.
 */
export function ComparisonAnnouncer({ comparison }: { comparison: ComparisonResult | null }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {comparisonAnnouncement(comparison)}
    </p>
  );
}
