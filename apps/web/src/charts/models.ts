/**
 * Chart models (UI-3). Pure functions that turn cost data into what a chart
 * draws, kept apart from rendering so the data-viz grammar is unit-tested:
 *
 * - provider quotes are alternatives: they are compared, never summed, and never
 *   shown as shares of a combined whole;
 * - cost categories keep one fixed order and colour, whatever the data;
 * - a missing value is reported as missing, never drawn as zero.
 */

export type ChartProviderId = 'aws' | 'azure' | 'gcp';

export const CATEGORY_ORDER = [
  'compute',
  'storage',
  'database',
  'network',
  'support',
  'licensing',
  'operations',
] as const;

export type ChartCategory = (typeof CATEGORY_ORDER)[number];

// Maps rather than keyed objects: lookups stay typed and never touch the prototype.
const CATEGORY_LABELS = new Map<ChartCategory, string>([
  ['compute', 'Compute'],
  ['storage', 'Storage'],
  ['database', 'Database'],
  ['network', 'Network & egress'],
  ['support', 'Support'],
  ['licensing', 'Licensing'],
  ['operations', 'Operations & other'],
]);

export function categoryLabel(category: ChartCategory): string {
  return CATEGORY_LABELS.get(category) ?? category;
}

const PROVIDER_LABELS = new Map<ChartProviderId, string>([
  ['aws', 'AWS'],
  ['azure', 'Azure'],
  ['gcp', 'GCP'],
]);

export function providerLabel(providerId: ChartProviderId): string {
  return PROVIDER_LABELS.get(providerId) ?? providerId;
}

export interface ProviderQuote {
  providerId: ChartProviderId;
  /** Monthly cost in USD; undefined when the provider could not be priced. */
  value: number | undefined;
}

export interface ComparisonBarRow {
  providerId: ChartProviderId;
  label: string;
  value: number;
  /** Bar length as a share of the most expensive quote, 0-100. */
  widthPercent: number;
  isLowest: boolean;
  /** Amount above the lowest quote; 0 for the lowest. */
  deltaFromLowest: number;
  /** Fraction above the lowest quote (0.081 = 8.1%); 0 for the lowest. */
  deltaRatioFromLowest: number;
}

export interface ProviderComparisonModel {
  rows: ComparisonBarRow[];
  unpriced: ChartProviderId[];
}

/** Sorts priced quotes cheapest first and measures each against the lowest. */
export function providerComparison(quotes: ProviderQuote[]): ProviderComparisonModel {
  const priced = quotes.filter(
    (quote): quote is { providerId: ChartProviderId; value: number } =>
      quote.value !== undefined && Number.isFinite(quote.value) && quote.value >= 0,
  );
  const unpriced = quotes
    .filter((quote) => !priced.some((candidate) => candidate.providerId === quote.providerId))
    .map((quote) => quote.providerId);

  if (priced.length === 0) {
    return { rows: [], unpriced };
  }

  const sorted = [...priced].sort((a, b) => a.value - b.value);
  const lowest = sorted[0].value;
  const highest = sorted[sorted.length - 1].value;

  return {
    rows: sorted.map((quote, index) => ({
      providerId: quote.providerId,
      label: providerLabel(quote.providerId),
      value: quote.value,
      widthPercent: highest > 0 ? (quote.value / highest) * 100 : 0,
      isLowest: index === 0,
      deltaFromLowest: quote.value - lowest,
      deltaRatioFromLowest: lowest > 0 ? (quote.value - lowest) / lowest : 0,
    })),
    unpriced,
  };
}

export interface CategoryValue {
  category: ChartCategory;
  value: number;
}

export interface StackedSegment extends CategoryValue {
  label: string;
  /** Share of this provider's own total (a real part-to-whole), 0-100. */
  percentOfProvider: number;
  /** Segment length as a share of the most expensive provider's total, 0-100. */
  widthPercent: number;
}

export interface StackedBar {
  providerId: ChartProviderId;
  label: string;
  total: number;
  segments: StackedSegment[];
}

/**
 * One stacked bar per provider. Percentages are within a provider only, which
 * is a genuine part-to-whole; bar lengths share one scale so providers compare.
 */
export function stackedByProvider(
  providers: Array<{ providerId: ChartProviderId; categories: CategoryValue[] }>,
): StackedBar[] {
  const totals = providers.map((provider) =>
    provider.categories.reduce((sum, entry) => sum + Math.max(0, entry.value), 0),
  );
  const maxTotal = Math.max(0, ...totals);

  return providers.map((provider, index) => {
    const total = totals.at(index) ?? 0;
    const byCategory = new Map<ChartCategory, number>();
    for (const entry of provider.categories) {
      if (entry.value > 0) {
        byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.value);
      }
    }

    return {
      providerId: provider.providerId,
      label: providerLabel(provider.providerId),
      total,
      segments: CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => {
        const value = byCategory.get(category) ?? 0;
        return {
          category,
          label: categoryLabel(category),
          value,
          percentOfProvider: total > 0 ? (value / total) * 100 : 0,
          widthPercent: maxTotal > 0 ? (value / maxTotal) * 100 : 0,
        };
      }),
    };
  });
}

export interface SeriesPoint {
  x: number;
  y: number;
}

export interface PlotBox {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  return scale;
}

/** "Nice" upper bound for an axis so ticks land on round numbers. */
export function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function linePath(points: SeriesPoint[], x: LinearScale, y: LinearScale): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(x(point.x))},${round(y(point.y))}`)
    .join(' ');
}

/** Closed area under a line, down to the baseline value. */
export function areaPath(
  points: SeriesPoint[],
  x: LinearScale,
  y: LinearScale,
  baseline = 0,
): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points, x, y)} L${round(x(last.x))},${round(y(baseline))} L${round(
    x(first.x),
  )},${round(y(baseline))} Z`;
}

/** Band between an upper and a lower series, e.g. a forecast confidence range. */
export function bandPath(
  upper: SeriesPoint[],
  lower: SeriesPoint[],
  x: LinearScale,
  y: LinearScale,
): string {
  if (upper.length === 0 || lower.length === 0) {
    return '';
  }
  const back = [...lower].reverse();
  return `${linePath(upper, x, y)} ${back
    .map((point) => `L${round(x(point.x))},${round(y(point.y))}`)
    .join(' ')} Z`;
}

export interface CumulativeTerm {
  id: string;
  label: string;
  /** Up-front payment in USD (0 for on-demand). */
  upfront: number;
  /** Recurring monthly cost in USD; undefined when the term is not priced. */
  monthly: number | undefined;
}

export interface CumulativeSeries {
  id: string;
  label: string;
  points: SeriesPoint[];
}

/** Cumulative cost by month for each priced term, month 0 through `months`. */
export function cumulativeSeries(terms: CumulativeTerm[], months: number): CumulativeSeries[] {
  return terms
    .filter((term): term is CumulativeTerm & { monthly: number } => term.monthly !== undefined)
    .map((term) => ({
      id: term.id,
      label: term.label,
      points: Array.from({ length: months + 1 }, (_, month) => ({
        x: month,
        y: term.upfront + term.monthly * month,
      })),
    }));
}

/**
 * First month in which the commitment's cumulative cost is at or below
 * on-demand's, or undefined if it never breaks even within the horizon.
 */
export function breakEvenMonth(
  onDemand: CumulativeSeries,
  commitment: CumulativeSeries,
): number | undefined {
  for (const [index, point] of onDemand.points.entries()) {
    const committed = commitment.points.at(index);
    if (index > 0 && committed && committed.y <= point.y) {
      return point.x;
    }
  }
  return undefined;
}

/** Sequential step 1-10 for a heatmap cell; higher cost is a darker step. */
export function sequentialStep(value: number, min: number, max: number, steps = 10): number {
  if (!Number.isFinite(value) || max <= min) {
    return 1;
  }
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return 1 + Math.round(ratio * (steps - 1));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
