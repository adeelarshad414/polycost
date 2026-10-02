import { useMemo } from 'react';
import { formatCurrency, formatPercent } from '../lib/format';
import { ChartFrame } from './ChartFrame';
import { varianceRows, type VarianceInput } from './models';

/**
 * Estimate vs invoiced actuals on a diverging scale (UI-5): bars grow left when
 * the invoice came in under the estimate and right when it came in over, with
 * the shade stepping up with the size of the gap. The sign is also written out,
 * so direction never relies on colour.
 */
export function VarianceChart({
  rows: inputs,
  title = 'Estimate vs invoice',
}: {
  rows: VarianceInput[];
  title?: string;
}) {
  const rows = useMemo(() => varianceRows(inputs), [inputs]);

  return (
    <ChartFrame
      title={title}
      unit="USD, invoiced minus estimated; left is under, right is over"
      legend={[
        { key: 'under', label: 'Under estimate', colorToken: '--div-under-2' },
        { key: 'over', label: 'Over estimate', colorToken: '--div-over-2' },
      ]}
      table={{
        caption: `${title} (USD)`,
        columns: [
          { key: 'label', label: 'Provider' },
          { key: 'estimate', label: 'Estimated', numeric: true },
          { key: 'actual', label: 'Invoiced', numeric: true },
          { key: 'variance', label: 'Variance', numeric: true },
        ],
        rows: rows.map((row) => ({
          label: row.label,
          estimate: formatCurrency(row.estimate),
          actual: formatCurrency(row.actual),
          variance: signedVariance(row.variance, row.ratio),
        })),
      }}
    >
      {rows.length === 0 ? (
        <p className="chart-empty-note">Import a provider bill to compare it with the estimate.</p>
      ) : (
        <ol className="variance-rows">
          {rows.map((row) => (
            <li
              key={row.key}
              className={`variance-row is-${row.direction}`}
              tabIndex={0}
              aria-label={`${row.label}: invoiced ${formatCurrency(row.actual)} against ${formatCurrency(
                row.estimate,
              )} estimated, ${signedVariance(row.variance, row.ratio)}`}
            >
              <span className="variance-label">{row.label}</span>
              <span className="variance-track">
                <span className="variance-half variance-half-under">
                  {row.direction === 'under' ? (
                    <span
                      className={`variance-bar div-under-${row.step}`}
                      style={{ inlineSize: `${Math.max(row.widthPercent, 2)}%` }}
                    />
                  ) : null}
                </span>
                <span className="variance-axis" aria-hidden="true" />
                <span className="variance-half variance-half-over">
                  {row.direction === 'over' ? (
                    <span
                      className={`variance-bar div-over-${row.step}`}
                      style={{ inlineSize: `${Math.max(row.widthPercent, 2)}%` }}
                    />
                  ) : null}
                </span>
              </span>
              <span className="variance-value">{signedVariance(row.variance, row.ratio)}</span>
            </li>
          ))}
        </ol>
      )}
    </ChartFrame>
  );
}

function signedVariance(variance: number, ratio: number): string {
  if (Math.abs(variance) < 0.005) {
    return 'On estimate';
  }
  const sign = variance > 0 ? '+' : '−';
  return `${sign}${formatCurrency(Math.abs(variance))} (${sign}${formatPercent(Math.abs(ratio) * 100)})`;
}
