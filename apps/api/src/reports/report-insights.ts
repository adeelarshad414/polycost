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
  const annualAvoidableSpread =
    monthlySpread !== undefined ? roundCurrency(monthlySpread * 12) : undefined;
  const dominant = lowest ? dominantCategory(lowest.lineItems) : undefined;
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );
  const pricedProviders = result.providers.length;

  return [
    {
      label: 'Executive recommendation',
      value: lowest
        ? `${lowest.providerId} is the current cost baseline before commitments`
        : 'Pending',
    },
    {
      label: 'Decision confidence',
      value: decisionConfidence(pricedProviders, approximateLineItems),
    },
    {
      label: 'Solution architect review',
      value: solutionArchitectReview(lowest, pricedProviders, approximateLineItems),
    },
    {
      label: 'Architecture risk',
      value: architectureRisk(pricedProviders, approximateLineItems),
    },
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
      label: 'Annual avoidable spread',
      value: annualAvoidableSpread !== undefined ? `$${annualAvoidableSpread}` : 'Pending',
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

function decisionConfidence(pricedProviders: number, approximateLineItems: number): string {
  if (pricedProviders === 0) {
    return 'Pending - no provider estimates yet';
  }

  if (pricedProviders === 3 && approximateLineItems === 0) {
    return 'High - three providers priced with exact mappings';
  }

  if (pricedProviders >= 2) {
    return `Medium - ${pricedProviders}/3 providers priced; ${approximateLineItems} approximate mappings`;
  }

  return `Low - ${pricedProviders}/3 providers priced; validate before sharing`;
}

function solutionArchitectReview(
  lowest: ComparisonResult['providers'][number] | undefined,
  pricedProviders: number,
  approximateLineItems: number,
): string {
  if (!lowest) {
    return 'Pending';
  }

  if (pricedProviders < 3 || approximateLineItems > 0) {
    return `${lowest.providerId} requires service-equivalence, resilience, data-path, and quota review`;
  }

  return `${lowest.providerId} is ready for architecture shortlist after regional SKU and quota validation`;
}

function architectureRisk(pricedProviders: number, approximateLineItems: number): string {
  if (pricedProviders === 0) {
    return 'Pending - no provider estimates yet';
  }

  if (pricedProviders < 2) {
    return 'High - provider coverage is too thin for target-cloud selection';
  }

  if (pricedProviders < 3 || approximateLineItems > 0) {
    return 'Medium - validate provider coverage and approximate service mappings';
  }

  return 'Low - exact mappings across all three providers; validate region and quotas';
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
