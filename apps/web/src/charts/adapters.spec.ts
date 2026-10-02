import { comparisonCategoryBreakdown, comparisonQuotes, intervalPeriod } from './adapters';
import type { ComparisonResult } from '../types';

function comparison(providers: unknown[]): ComparisonResult {
  return { providers } as unknown as ComparisonResult;
}

describe('chart adapters', () => {
  it('returns one quote per provider and leaves missing providers unpriced', () => {
    expect(
      comparisonQuotes(comparison([{ providerId: 'azure', totals: { monthly: 12 } }])),
    ).toEqual([
      { providerId: 'aws', value: undefined },
      { providerId: 'azure', value: 12 },
      { providerId: 'gcp', value: undefined },
    ]);
    expect(comparisonQuotes(null).every((quote) => quote.value === undefined)).toBe(true);
  });

  it('reads the requested interval and names its period', () => {
    const result = comparison([{ providerId: 'gcp', totals: { monthly: 30, yearly: 360 } }]);

    expect(
      comparisonQuotes(result, 'yearly').find((quote) => quote.providerId === 'gcp')?.value,
    ).toBe(360);
    expect([intervalPeriod('yearly'), intervalPeriod('daily'), intervalPeriod('monthly')]).toEqual([
      'year',
      'day',
      'month',
    ]);
  });

  it('maps the breakdown to categories, merges network, and keeps the remainder', () => {
    const [aws, gcp] = comparisonCategoryBreakdown(
      comparison([
        {
          providerId: 'aws',
          totals: { monthly: 140 },
          breakdown: {
            computeMonthlyCostUsd: 30,
            storageMonthlyCostUsd: 0,
            egressMonthlyCostUsd: 3,
            networkingMonthlyCostUsd: 2,
            databaseMonthlyCostUsd: 0,
            supportMonthlyCostUsd: 100,
            licensingMonthlyCostUsd: 0,
            operationsMonthlyCostUsd: 0,
            scopedMonthlyCostUsd: 135,
          },
        },
        { providerId: 'gcp', totals: { monthly: 50 } },
      ]),
    );

    expect(aws.categories.find((entry) => entry.category === 'network')?.value).toBe(5);
    expect(aws.categories.at(-1)).toEqual({ category: 'operations', value: 5 });
    expect(gcp.categories).toEqual([{ category: 'operations', value: 50 }]);
    expect(comparisonCategoryBreakdown(null)).toEqual([]);
  });
});
