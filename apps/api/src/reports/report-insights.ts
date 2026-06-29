import { ComparisonResult } from '../comparison/comparison.types';

export interface ReportInsight {
  label: string;
  value: string;
}

export function buildReportInsights(result: ComparisonResult): ReportInsight[] {
  const providersByMonthly = [...result.providers].sort(
    (left, right) => left.totals.monthly - right.totals.monthly,
  );
  const lowest = providersByMonthly[0];
  const highest = providersByMonthly.at(-1);
  const monthlySpread =
    lowest && highest ? roundCurrency(highest.totals.monthly - lowest.totals.monthly) : undefined;
  const dominant = lowest ? dominantCategory(lowest.lineItems) : undefined;
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );
  const pricedProviders = result.providers.length;

  return [
    {
      label: 'Lowest monthly run rate',
      value: lowest ? `${lowest.providerId} $${lowest.totals.monthly}` : 'Pending',
    },
    {
      label: 'Annual exposure at lowest',
      value: lowest ? `${lowest.providerId} $${lowest.totals.yearly}` : 'Pending',
    },
    {
      label: 'Monthly optimization spread',
      value: monthlySpread !== undefined ? `$${monthlySpread}` : 'Pending',
    },
    {
      label: 'Dominant cost driver',
      value: dominant ? `${dominant.category} $${dominant.total}` : 'Pending',
    },
    {
      label: 'Approximate line items',
      value: approximateLineItems.toString(),
    },
    {
      label: 'Priced providers',
      value: `${pricedProviders}/3`,
    },
  ];
}

function dominantCategory(
  lineItems: ComparisonResult['providers'][number]['lineItems'],
): { category: string; total: number } | undefined {
  const totals = new Map<string, number>();

  for (const lineItem of lineItems) {
    totals.set(
      lineItem.category,
      roundCurrency((totals.get(lineItem.category) ?? 0) + lineItem.baseMonthlyCostUsd),
    );
  }

  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((left, right) => right.total - left.total)[0];
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
