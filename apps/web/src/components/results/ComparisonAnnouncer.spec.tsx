import { render, screen } from '@testing-library/react';
import type { ComparisonResult } from '../../types';
import { ComparisonAnnouncer, comparisonAnnouncement } from './ComparisonAnnouncer';

function comparison(totals: Array<[string, number]>): ComparisonResult {
  return {
    providers: totals.map(([providerId, monthly]) => ({
      providerId,
      totals: { monthly, yearly: monthly * 12 },
    })),
  } as unknown as ComparisonResult;
}

describe('ComparisonAnnouncer', () => {
  it('announces the lowest-cost provider politely', () => {
    render(
      <ComparisonAnnouncer
        comparison={comparison([
          ['aws', 42],
          ['gcp', 30],
        ])}
      />,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe(
      'Results ready. GCP is the lowest-cost option at $30.00 per month.',
    );
  });

  it('stays silent without a comparison and explains an unpriced one', () => {
    expect(comparisonAnnouncement(null)).toBe('');
    expect(comparisonAnnouncement(comparison([]))).toBe(
      'Results ready. No provider could be priced for this workload.',
    );
  });
});
