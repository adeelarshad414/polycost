import { useMemo, useState } from 'react';
import { formatCurrency, formatPercent } from '../lib/format';
import { ChartFrame } from './ChartFrame';
import {
  CATEGORY_ORDER,
  categoryLabel,
  providerLabel,
  providerComparison,
  stackedByProvider,
  type CategoryValue,
  type ChartCategory,
  type ChartProviderId,
  type ProviderQuote,
} from './models';

/**
 * Provider comparison: horizontal bars sorted cheapest first. The lowest quote
 * is the only filled bar; the others are tinted with an outline and carry their
 * gap to the lowest, so the answer and the size of the difference read at once.
 */
export function ProviderComparisonBar({
  quotes,
  period = 'month',
  title = 'Provider comparison',
}: {
  quotes: ProviderQuote[];
  /** Unit the quotes are expressed in: month, year, quarter, week, day or hour. */
  period?: string;
  title?: string;
}) {
  const model = useMemo(() => providerComparison(quotes), [quotes]);
  const unit = `USD per ${period}, lowest first`;

  return (
    <ChartFrame
      title={title}
      unit={unit}
      className="chart-comparison"
      table={{
        caption: `${title} (${unit})`,
        columns: [
          { key: 'provider', label: 'Provider' },
          { key: 'cost', label: `Cost per ${period}`, numeric: true },
          { key: 'gap', label: 'Above lowest', numeric: true },
        ],
        rows: [
          ...model.rows.map((row) => ({
            provider: row.label,
            cost: formatCurrency(row.value),
            gap: row.isLowest ? 'Lowest' : `+${formatCurrency(row.deltaFromLowest)}`,
          })),
          ...model.unpriced.map((providerId) => ({
            provider: providerLabel(providerId),
            cost: '—',
            gap: 'Not priced',
          })),
        ],
      }}
    >
      {model.rows.length === 0 ? (
        <p className="chart-empty-note">No provider could be priced for this workload.</p>
      ) : (
        <ol className="comparison-bars">
          {model.rows.map((row) => (
            <li
              key={row.providerId}
              className={`comparison-bar-row provider-${row.providerId}${row.isLowest ? ' is-lowest' : ''}`}
              tabIndex={0}
              aria-label={`${row.label}: ${formatCurrency(row.value)} per ${period}${
                row.isLowest
                  ? ', lowest'
                  : `, ${formatCurrency(row.deltaFromLowest)} (${formatPercent(
                      row.deltaRatioFromLowest * 100,
                    )}) above the lowest`
              }`}
            >
              <span className="comparison-bar-label">{row.label}</span>
              <span className="comparison-bar-track">
                <span
                  className="comparison-bar-fill"
                  style={{ inlineSize: `${Math.max(row.widthPercent, 2)}%` }}
                />
              </span>
              <span className="comparison-bar-value">{formatCurrency(row.value)}</span>
              <span className="comparison-bar-delta">
                {row.isLowest
                  ? 'Lowest'
                  : `+${formatCurrency(row.deltaFromLowest)} · ${formatPercent(
                      row.deltaRatioFromLowest * 100,
                    )}`}
              </span>
            </li>
          ))}
          {model.unpriced.map((providerId) => (
            <li key={providerId} className="comparison-bar-row is-unpriced">
              <span className="comparison-bar-label">{providerLabel(providerId)}</span>
              <span className="comparison-bar-missing">— Not priced for this workload</span>
            </li>
          ))}
        </ol>
      )}
    </ChartFrame>
  );
}

/**
 * Cost by service: one stacked bar per provider in the fixed category order.
 * Selecting a category in the legend highlights it everywhere; the selection is
 * reported to the parent so other charts can follow it (linked state).
 */
export function CostByServiceStacked({
  providers,
  selectedCategory: controlledCategory,
  onSelectCategory,
  title = 'Cost by service',
}: {
  providers: Array<{ providerId: ChartProviderId; categories: CategoryValue[] }>;
  selectedCategory?: ChartCategory | null;
  onSelectCategory?: (category: ChartCategory | null) => void;
  title?: string;
}) {
  const bars = useMemo(() => stackedByProvider(providers), [providers]);
  const [localCategory, setLocalCategory] = useState<ChartCategory | null>(null);
  const selected = controlledCategory !== undefined ? controlledCategory : localCategory;
  const present = useMemo(() => {
    const seen = new Set<ChartCategory>();
    bars.forEach((bar) => bar.segments.forEach((segment) => seen.add(segment.category)));
    return [...seen];
  }, [bars]);
  const orderedPresent = CATEGORY_ORDER.filter((category) => present.includes(category));

  function toggle(category: ChartCategory) {
    const next = selected === category ? null : category;
    setLocalCategory(next);
    onSelectCategory?.(next);
  }

  return (
    <ChartFrame
      title={title}
      unit="USD per month, by service category"
      className="chart-stacked"
      table={{
        caption: `${title} (USD per month)`,
        columns: [
          { key: 'provider', label: 'Provider' },
          ...orderedPresent.map((category) => ({
            key: category,
            label: categoryLabel(category),
            numeric: true,
          })),
          { key: 'total', label: 'Provider total', numeric: true },
        ],
        rows: bars.map((bar) => ({
          provider: bar.label,
          ...Object.fromEntries(
            orderedPresent.map((category) => {
              const segment = bar.segments.find((entry) => entry.category === category);
              return [category, segment ? formatCurrency(segment.value) : '—'];
            }),
          ),
          total: formatCurrency(bar.total),
        })),
      }}
      actions={
        orderedPresent.length > 1 ? (
          <div className="chart-category-filter" role="group" aria-label="Highlight a category">
            {orderedPresent.map((category) => (
              <button
                key={category}
                type="button"
                className={`chart-category-chip cat-${category}`}
                aria-pressed={selected === category}
                onClick={() => toggle(category)}
              >
                <i className="chart-swatch" aria-hidden="true" />
                {categoryLabel(category)}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <ol className="stacked-bars">
        {bars.map((bar) => (
          <li key={bar.providerId} className="stacked-bar-row">
            <span className="stacked-bar-label">{bar.label}</span>
            <span className="stacked-bar-track">
              {bar.segments.map((segment) => (
                <span
                  key={segment.category}
                  className={`stacked-segment cat-${segment.category}${
                    selected && selected !== segment.category ? ' is-dimmed' : ''
                  }`}
                  style={{ inlineSize: `${segment.widthPercent}%` }}
                  role="img"
                  tabIndex={0}
                  aria-label={`${bar.label} ${segment.label}: ${formatCurrency(
                    segment.value,
                  )}, ${formatPercent(segment.percentOfProvider)} of ${bar.label}`}
                  title={`${segment.label}: ${formatCurrency(segment.value)} (${formatPercent(
                    segment.percentOfProvider,
                  )})`}
                />
              ))}
            </span>
            <span className="stacked-bar-total">{formatCurrency(bar.total)}</span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
