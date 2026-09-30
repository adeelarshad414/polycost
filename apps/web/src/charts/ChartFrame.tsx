import { useId, useState, type CSSProperties, type ReactNode } from 'react';

export interface LegendItem {
  key: string;
  label: string;
  /** CSS custom property that colours the swatch, e.g. "--provider-aws". */
  colorToken: string;
  /** Line series draw a dashed swatch when their stroke is dashed. */
  dashed?: boolean;
}

export interface TableColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ChartTable {
  caption: string;
  columns: TableColumn[];
  rows: Array<Record<string, ReactNode>>;
}

/**
 * The frame every chart shares (UI-3): a title and unit line, a legend whenever
 * there are two or more series (identity is never colour alone), and a "View as
 * table" toggle that swaps the plot for an accessible <table> of the same data.
 */
export function ChartFrame({
  title,
  unit,
  legend,
  table,
  actions,
  children,
  className,
}: {
  title: string;
  unit: string;
  legend?: LegendItem[];
  table: ChartTable;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  return (
    <figure
      className={['chart-frame', className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
    >
      <header className="chart-frame-header">
        <div className="chart-frame-heading">
          <h3 id={titleId} className="chart-frame-title">
            {title}
          </h3>
          <span className="chart-frame-unit">{unit}</span>
        </div>
        <div className="chart-frame-actions">
          {actions}
          <button
            type="button"
            className="chart-table-toggle"
            aria-pressed={showTable}
            onClick={() => setShowTable((current) => !current)}
          >
            {showTable ? 'View as chart' : 'View as table'}
          </button>
        </div>
      </header>

      {legend && legend.length >= 2 ? (
        <ul className="chart-legend" aria-label={`${title} legend`}>
          {legend.map((item) => (
            <li key={item.key}>
              <i
                className={item.dashed ? 'chart-swatch chart-swatch-dashed' : 'chart-swatch'}
                style={{ '--swatch': `var(${item.colorToken})` } as CSSProperties}
                aria-hidden="true"
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      {showTable ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <caption>{table.caption}</caption>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric ? 'is-numeric' : undefined}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column, columnIndex) =>
                    columnIndex === 0 ? (
                      <th key={column.key} scope="row">
                        {row[column.key]}
                      </th>
                    ) : (
                      <td key={column.key} className={column.numeric ? 'is-numeric' : undefined}>
                        {row[column.key]}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot">{children}</div>
      )}
    </figure>
  );
}
