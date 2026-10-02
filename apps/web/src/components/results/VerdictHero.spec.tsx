import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ComparisonResult, DataHealthResponse } from '../../types';
import { VerdictHero, VerdictKpis, rankedQuotes } from './VerdictHero';

function comparison(totals: Array<[string, number]>): ComparisonResult {
  return {
    providers: totals.map(([providerId, monthly]) => ({
      providerId,
      totals: { monthly, yearly: monthly * 12 },
    })),
  } as unknown as ComparisonResult;
}

function health(freshness: string, ageHours?: number): DataHealthResponse {
  return {
    providers: [{ providerId: 'azure', freshness, ageHours }],
  } as unknown as DataHealthResponse;
}

const result = comparison([
  ['aws', 132.94],
  ['azure', 122.96],
  ['gcp', 521.55],
]);

describe('VerdictHero', () => {
  it('ranks quotes cheapest first without summing them', () => {
    expect(rankedQuotes(result).map((quote) => quote.providerId)).toEqual(['azure', 'aws', 'gcp']);
  });

  it('states the answer, the gap to each alternative and how far to trust it', async () => {
    const { container } = render(
      <VerdictHero
        comparison={result}
        provenanceLabel="Includes seed pricing"
        confidence="low"
        regionLabel="us-east"
        actions={<button>Export</button>}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Azure is the lowest-cost option for this workload' }),
    ).toBeTruthy();
    // Animated copy (aria-hidden) plus the final figure for assistive tech.
    expect(screen.getAllByText('$122.96')).toHaveLength(2);
    expect(screen.getByText('7.5% below AWS')).toBeTruthy();
    expect(screen.getByText('76% below GCP')).toBeTruthy();
    expect(screen.getByText('Includes seed pricing')).toBeTruthy();
    expect(screen.getByText('Low confidence')).toBeTruthy();
    expect(screen.getByText(/Recommendation · us-east/)).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('marks live pricing and handles a comparison with nothing priced', () => {
    const { rerender } = render(<VerdictHero comparison={comparison([['gcp', 30]])} />);
    expect(screen.getByText('Live pricing')).toBeTruthy();

    rerender(<VerdictHero comparison={comparison([])} />);
    expect(screen.getByRole('heading', { name: /No provider could be priced/ })).toBeTruthy();
  });
});

describe('VerdictKpis', () => {
  it('shows monthly, annual, savings versus the next-best option and freshness', () => {
    render(<VerdictKpis comparison={result} dataHealth={health('fresh', 6)} />);

    expect(screen.getByText('$1,475.52')).toBeTruthy();
    expect(screen.getByText('$119.76')).toBeTruthy();
    expect(screen.getByText('Versus the next-best option, AWS')).toBeTruthy();
    expect(screen.getByText('Up to date')).toBeTruthy();
    expect(screen.getByText('Azure prices updated 6 hours ago')).toBeTruthy();
  });

  it('words a failed sync and unknown or missing data plainly', () => {
    const { rerender } = render(
      <VerdictKpis comparison={result} dataHealth={health('failed', 72)} />,
    );
    expect(screen.getByText('Sync failed')).toBeTruthy();
    expect(screen.getByText('Latest Azure sync failed; prices are 3 days old')).toBeTruthy();

    rerender(<VerdictKpis comparison={result} dataHealth={health('stale', 0.5)} />);
    expect(screen.getByText('Azure prices updated under an hour ago')).toBeTruthy();

    rerender(<VerdictKpis comparison={result} dataHealth={health('missing')} />);
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.getByText('Freshness not reported')).toBeTruthy();

    rerender(<VerdictKpis comparison={comparison([['gcp', 30]])} dataHealth={null} />);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText('Needs a second priced provider')).toBeTruthy();
  });

  it('renders nothing without a priced provider', () => {
    const { container } = render(<VerdictKpis comparison={comparison([])} dataHealth={null} />);
    expect(container.innerHTML).toBe('');
  });
});
