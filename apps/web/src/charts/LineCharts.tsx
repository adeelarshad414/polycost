import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { formatCurrency } from '../lib/format';
import { ChartFrame, type LegendItem } from './ChartFrame';
import {
  areaPath,
  bandPath,
  breakEvenMonth,
  cumulativeSeries,
  linearScale,
  linePath,
  niceMax,
  providerLabel,
  sequentialStep,
  type ChartProviderId,
  type CumulativeTerm,
  type SeriesPoint,
} from './models';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

function useCrosshair(count: number) {
  const [active, setActive] = useState<number | null>(null);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (count === 0) {
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive((current) => Math.min(count - 1, (current ?? -1) + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive((current) => Math.max(0, (current ?? count) - 1));
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  }

  return { active, setActive, onKeyDown };
}

function formatOptional(value: number | undefined): string {
  return value === undefined ? '—' : formatCurrency(value);
}

function readout(label: string, value: number | undefined): string {
  return value === undefined ? '' : ` · ${label} ${formatCurrency(value)}`;
}

type HeatmapValues = Record<string, Partial<Record<ChartProviderId, number>>>;

function cellValue(
  values: HeatmapValues,
  regionId: string,
  providerId: ChartProviderId,
): number | undefined {
  const row = new Map(Object.entries(values)).get(regionId);
  return row ? new Map(Object.entries(row)).get(providerId) : undefined;
}

function yTicks(max: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);
}

/**
 * Actual spend as a solid line over a single-series fade, the forecast dashed
 * inside its confidence band, and the budget as a labelled reference line.
 * Arrow keys move the crosshair when the plot has focus.
 */
export function TrendForecastArea({
  labels,
  actual,
  forecast,
  forecastLow,
  forecastHigh,
  budget,
  title = 'Spend trend and forecast',
}: {
  labels: string[];
  actual: Array<number | undefined>;
  forecast?: Array<number | undefined>;
  forecastLow?: Array<number | undefined>;
  forecastHigh?: Array<number | undefined>;
  budget?: number;
  title?: string;
}) {
  const gradientId = useId();
  const toPoints = (values?: Array<number | undefined>): SeriesPoint[] =>
    (values ?? []).flatMap((value, index) => (value === undefined ? [] : [{ x: index, y: value }]));
  const actualPoints = toPoints(actual);
  const forecastPoints = toPoints(forecast);
  const lowPoints = toPoints(forecastLow);
  const highPoints = toPoints(forecastHigh);
  const max = niceMax(
    Math.max(
      0,
      budget ?? 0,
      ...[...actualPoints, ...forecastPoints, ...highPoints].map((p) => p.y),
    ),
  );
  const x = linearScale([0, Math.max(1, labels.length - 1)], [PAD.left, WIDTH - PAD.right]);
  const y = linearScale([0, max], [HEIGHT - PAD.bottom, PAD.top]);
  const crosshair = useCrosshair(labels.length);
  const legend: LegendItem[] = [
    { key: 'actual', label: 'Actual', colorToken: '--brand-primary' },
    ...(forecastPoints.length > 0
      ? [{ key: 'forecast', label: 'Forecast', colorToken: '--brand-violet', dashed: true }]
      : []),
    ...(budget !== undefined
      ? [{ key: 'budget', label: 'Budget', colorToken: '--warning', dashed: true }]
      : []),
  ];
  const active = crosshair.active;

  return (
    <ChartFrame
      title={title}
      unit="USD per month"
      legend={legend}
      table={{
        caption: `${title} (USD per month)`,
        columns: [
          { key: 'period', label: 'Period' },
          { key: 'actual', label: 'Actual', numeric: true },
          { key: 'forecast', label: 'Forecast', numeric: true },
        ],
        rows: labels.map((label, index) => ({
          period: label,
          actual: formatOptional(actual.at(index)),
          forecast: formatOptional(forecast?.at(index)),
        })),
      }}
    >
      <svg
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${title}. Use the left and right arrow keys to read each period.`}
        tabIndex={0}
        onKeyDown={crosshair.onKeyDown}
        onMouseLeave={() => crosshair.setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="chart-area-stop-top" />
            <stop offset="100%" className="chart-area-stop-bottom" />
          </linearGradient>
        </defs>
        {yTicks(max).map((tick) => (
          <g key={tick}>
            <line
              className="chart-grid"
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="chart-axis"
              x={PAD.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatCurrency(Math.round(tick))}
            </text>
          </g>
        ))}
        {labels.map((label, index) => (
          <text key={label} className="chart-axis" x={x(index)} y={HEIGHT - 8} textAnchor="middle">
            {label}
          </text>
        ))}
        {lowPoints.length > 0 && highPoints.length > 0 ? (
          <path className="chart-band" d={bandPath(highPoints, lowPoints, x, y)} />
        ) : null}
        {actualPoints.length > 0 ? (
          <>
            <path d={areaPath(actualPoints, x, y)} fill={`url(#${gradientId})`} />
            <path className="chart-line chart-line-actual" d={linePath(actualPoints, x, y)} />
          </>
        ) : null}
        {forecastPoints.length > 0 ? (
          <path className="chart-line chart-line-forecast" d={linePath(forecastPoints, x, y)} />
        ) : null}
        {budget !== undefined ? (
          <g className="chart-budget">
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(budget)} y2={y(budget)} />
            <text x={WIDTH - PAD.right} y={y(budget) - 6} textAnchor="end">
              ⚠ Budget {formatCurrency(budget)}
            </text>
          </g>
        ) : null}
        {labels.map((label, index) => (
          <rect
            key={`hit-${label}`}
            className="chart-hit"
            x={x(index) - (WIDTH - PAD.left - PAD.right) / Math.max(1, labels.length) / 2}
            y={PAD.top}
            width={(WIDTH - PAD.left - PAD.right) / Math.max(1, labels.length)}
            height={HEIGHT - PAD.top - PAD.bottom}
            onMouseEnter={() => crosshair.setActive(index)}
          />
        ))}
        {active !== null ? (
          <g className="chart-crosshair">
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />
          </g>
        ) : null}
      </svg>
      {active !== null ? (
        <p className="chart-readout" role="status">
          <strong>{labels.at(active)}</strong>
          {readout('Actual', actual.at(active))}
          {readout('Forecast', forecast?.at(active))}
        </p>
      ) : null}
    </ChartFrame>
  );
}

const TERM_TOKENS = new Map<string, string>([
  ['on-demand', '--text-muted'],
  ['1yr', '--brand-primary'],
  ['3yr', '--brand-violet'],
]);

/**
 * Cumulative cost of on-demand against each commitment term, with the month a
 * commitment starts to pay off marked. Unpriced terms are listed with the
 * reason instead of being drawn as a zero line.
 */
export function CommitmentBreakEven({
  terms,
  months = 36,
  title = 'Commitment break-even',
}: {
  terms: CumulativeTerm[];
  months?: number;
  title?: string;
}) {
  const series = useMemo(() => cumulativeSeries(terms, months), [terms, months]);
  const onDemand = series.find((entry) => entry.id === 'on-demand');
  const commitments = series.filter((entry) => entry.id !== 'on-demand');
  const unpriced = terms.filter((term) => term.monthly === undefined);
  const crossovers = onDemand
    ? commitments.map((entry) => ({ entry, month: breakEvenMonth(onDemand, entry) }))
    : [];
  const max = niceMax(Math.max(0, ...series.flatMap((entry) => entry.points.map((p) => p.y))));
  const x = linearScale([0, months], [PAD.left, WIDTH - PAD.right]);
  const y = linearScale([0, max], [HEIGHT - PAD.bottom, PAD.top]);

  return (
    <ChartFrame
      title={title}
      unit={`Cumulative USD over ${months} months`}
      legend={series.map((entry) => ({
        key: entry.id,
        label: entry.label,
        colorToken: TERM_TOKENS.get(entry.id) ?? '--brand-primary',
        dashed: entry.id === 'on-demand',
      }))}
      table={{
        caption: `${title}: month each commitment breaks even`,
        columns: [
          { key: 'term', label: 'Term' },
          { key: 'month', label: 'Breaks even', numeric: true },
        ],
        rows: [
          ...crossovers.map(({ entry, month }) => ({
            term: entry.label,
            month: month === undefined ? `Not within ${months} months` : `Month ${month}`,
          })),
          ...unpriced.map((term) => ({ term: term.label, month: 'No pricing in catalog' })),
        ],
      }}
    >
      {onDemand && commitments.length > 0 ? (
        <svg className="chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
          {yTicks(max).map((tick) => (
            <g key={tick}>
              <line
                className="chart-grid"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="chart-axis"
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatCurrency(Math.round(tick))}
              </text>
            </g>
          ))}
          {[0, months / 3, (2 * months) / 3, months].map((month) => (
            <text
              key={month}
              className="chart-axis"
              x={x(month)}
              y={HEIGHT - 8}
              textAnchor="middle"
            >
              {`M${Math.round(month)}`}
            </text>
          ))}
          {series.map((entry) => (
            <path
              key={entry.id}
              className={`chart-line chart-line-term term-${entry.id}`}
              d={linePath(entry.points, x, y)}
            />
          ))}
          {crossovers.map(({ entry, month }) =>
            month === undefined ? null : (
              <g key={entry.id} className="chart-crossover">
                <circle cx={x(month)} cy={y(entry.points.at(month)?.y ?? 0)} r={5} />
                <text x={x(month) + 8} y={y(entry.points.at(month)?.y ?? 0) - 8}>
                  {`${entry.label} pays off at month ${month}`}
                </text>
              </g>
            ),
          )}
        </svg>
      ) : (
        <p className="chart-empty-note">
          Add a 1- or 3-year commitment price to compare it against on-demand.
        </p>
      )}
      {unpriced.length > 0 ? (
        <ul className="chart-missing-list">
          {unpriced.map((term) => (
            <li key={term.id}>— {term.label}: no pricing in catalog</li>
          ))}
        </ul>
      ) : null}
    </ChartFrame>
  );
}

/**
 * Region × provider heatmap on the sequential ramp. The cheapest cell is
 * outlined and every cell prints its value, so colour is never the only cue.
 */
export function RegionProviderHeatmap({
  regions,
  providers,
  values,
  title = 'Monthly cost by region',
}: {
  regions: Array<{ id: string; label: string }>;
  providers: ChartProviderId[];
  /** values[regionId][providerId] in USD per month; missing cells are unpriced. */
  values: Record<string, Partial<Record<ChartProviderId, number>>>;
  title?: string;
}) {
  const all = regions.flatMap((region) =>
    providers.flatMap((providerId) => {
      const value = cellValue(values, region.id, providerId);
      return value === undefined ? [] : [{ region: region.id, providerId, value }];
    }),
  );
  const min = Math.min(...all.map((cell) => cell.value));
  const max = Math.max(...all.map((cell) => cell.value));
  const cheapest = all.find((cell) => cell.value === min);

  return (
    <ChartFrame
      title={title}
      unit="USD per month; darker is more expensive"
      table={{
        caption: `${title} (USD per month)`,
        columns: [
          { key: 'region', label: 'Region' },
          ...providers.map((providerId) => ({
            key: providerId,
            label: providerLabel(providerId),
            numeric: true,
          })),
        ],
        rows: regions.map((region) => ({
          region: region.label,
          ...Object.fromEntries(
            providers.map((providerId) => {
              const value = cellValue(values, region.id, providerId);
              return [providerId, value === undefined ? '—' : formatCurrency(value)];
            }),
          ),
        })),
      }}
    >
      <div
        className="heatmap"
        style={{
          gridTemplateColumns: `minmax(96px, auto) repeat(${providers.length}, minmax(0, 1fr))`,
        }}
        role="presentation"
      >
        <span className="heatmap-corner" />
        {providers.map((providerId) => (
          <span key={providerId} className="heatmap-col-label">
            {providerLabel(providerId)}
          </span>
        ))}
        {regions.map((region) => (
          <HeatmapRow
            key={region.id}
            region={region}
            providers={providers}
            values={values}
            min={min}
            max={max}
            cheapest={cheapest}
          />
        ))}
      </div>
    </ChartFrame>
  );
}

function HeatmapRow({
  region,
  providers,
  values,
  min,
  max,
  cheapest,
}: {
  region: { id: string; label: string };
  providers: ChartProviderId[];
  values: Record<string, Partial<Record<ChartProviderId, number>>>;
  min: number;
  max: number;
  cheapest?: { region: string; providerId: ChartProviderId };
}) {
  return (
    <>
      <span className="heatmap-row-label">{region.label}</span>
      {providers.map((providerId) => {
        const value = cellValue(values, region.id, providerId);
        if (value === undefined) {
          return (
            <span key={providerId} className="heatmap-cell is-missing">
              —
            </span>
          );
        }
        const step = sequentialStep(value, min, max);
        const isCheapest = cheapest?.region === region.id && cheapest.providerId === providerId;
        return (
          <span
            key={providerId}
            className={`heatmap-cell${step >= 6 ? ' is-strong' : ''}${isCheapest ? ' is-cheapest' : ''}`}
            style={{ background: `var(--seq-${step})` }}
            role="img"
            tabIndex={0}
            aria-label={`${region.label}, ${providerLabel(providerId)}: ${formatCurrency(value)}${
              isCheapest ? ', cheapest' : ''
            }`}
          >
            {formatCurrency(value)}
          </span>
        );
      })}
    </>
  );
}

/** Tiny trend line for a KPI tile. Decorative; the tile states the number. */
export function Sparkline({
  values,
  colorToken = '--brand-primary',
}: {
  values: number[];
  colorToken?: string;
}) {
  if (values.length < 2) {
    return null;
  }
  const w = 120;
  const h = 32;
  const points = values.map((value, index) => ({ x: index, y: value }));
  const x = linearScale([0, values.length - 1], [2, w - 2]);
  const y = linearScale([Math.min(...values), Math.max(...values)], [h - 3, 3]);
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      style={{ '--spark': `var(${colorToken})` } as CSSProperties}
    >
      <path d={linePath(points, x, y)} />
    </svg>
  );
}
