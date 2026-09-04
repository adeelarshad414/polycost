import type { ReactNode } from 'react';

/**
 * The four dimensions that move the number, as sliders.
 *
 * PolyCost models far more than four things - the workload form has well over a
 * hundred fields - which is exactly why this exists. A reader arriving at the
 * page should be able to move the estimate immediately on the levers that
 * dominate a cloud bill, and open the full model when they need the rest.
 *
 * So this is deliberately NOT a replacement for the form. It is a summary of
 * four fields that reads and writes the same state, sitting above a disclosure
 * holding everything else. Values typed in the detailed form appear here, and
 * dragging here changes the detailed form.
 */

export interface ControlDimension {
  id: string;
  label: string;
  /** Unit shown beside the value: vCPU, GB, requests. */
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Formats the value for display; GB becomes TB past a threshold. */
  format?: (value: number) => string;
}

export interface ControlChoice<T extends string> {
  id: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

function defaultFormat(value: number): string {
  return value.toLocaleString();
}

/** Rounds a dragged value to the dimension's granularity. */
function snapToStep(value: number, step: number): number {
  if (step <= 0) {
    return value;
  }

  return Math.round(value / step) * step;
}

export function WorkloadControlBar({
  dimensions,
  choices,
  note,
  title = 'Workload inputs',
  /**
   * The result below no longer matches these levers - a recompute failed or has
   * not landed. Says so rather than letting the numbers be read as current.
   */
  stale = false,
  /**
   * Renders the same levers above an existing result rather than above the
   * form. Same controls, same state - only the framing differs, because next
   * to a result these are for adjusting an answer, not composing a question.
   */
  variant = 'form',
  children,
}: {
  dimensions: ControlDimension[];
  choices: Array<ControlChoice<string>>;
  note?: string;
  title?: string;
  stale?: boolean;
  variant?: 'form' | 'live';
  /** The full workload form, behind a disclosure. */
  children?: ReactNode;
}) {
  return (
    <section
      className={
        variant === 'live'
          ? 'workload-control-bar workload-control-bar-live'
          : 'workload-control-bar'
      }
      aria-label={title}
    >
      <div className="workload-control-heading">
        {variant === 'live' ? <h3>{title}</h3> : <h2>{title}</h2>}
        {note ? <p>{note}</p> : null}
        {stale ? (
          <p className="workload-control-stale" role="status">
            The figures below are from the previous inputs and have not caught up with these levers.
          </p>
        ) : null}
      </div>

      <div className="workload-control-sliders">
        {dimensions.map((dimension) => {
          const format = dimension.format ?? defaultFormat;

          return (
            <div key={dimension.id} className="workload-control-slider">
              <label htmlFor={`control-${dimension.id}`}>
                <span className="workload-control-label">{dimension.label}</span>
                <span className="workload-control-value">
                  <strong>{format(dimension.value)}</strong>
                  <em>{dimension.unit}</em>
                </span>
              </label>
              {/*
                step="any" is deliberate. These sliders live inside the workload
                form and summarise fields the detailed form also edits, so they
                see arbitrary values - a storage size of 777 GB, say. A range
                input whose value does not land on its step is INVALID, and an
                invalid control blocks form submission entirely: setting
                step={64} here made "Compare costs" silently do nothing for any
                value that was not a multiple of 64.

                Granularity is applied on change instead, so dragging still
                moves in sensible increments without making a typed value
                unsubmittable.
              */}
              <input
                id={`control-${dimension.id}`}
                type="range"
                min={dimension.min}
                max={dimension.max}
                step="any"
                value={dimension.value}
                onChange={(event) =>
                  dimension.onChange(snapToStep(Number(event.target.value), dimension.step))
                }
              />
            </div>
          );
        })}
      </div>

      <div className="workload-control-choices">
        {choices.map((choice) => (
          <fieldset key={choice.id} className="workload-control-choice">
            <legend>{choice.label}</legend>
            <div className="workload-control-segmented">
              {choice.options.map((option) => {
                const selected = option.value === choice.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    // A segmented control is a set of toggles, so each button
                    // reports its own pressed state rather than the group
                    // pretending to be a radio list it is not.
                    aria-pressed={selected}
                    className={
                      selected
                        ? 'workload-control-segment workload-control-segment-active'
                        : 'workload-control-segment'
                    }
                    onClick={() => choice.onChange(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {children ? (
        <details className="workload-control-detail">
          <summary>
            Adjust the full workload model
            <span>storage classes, database engines, networking, security, AI, and operations</span>
          </summary>
          <div className="workload-control-detail-body">{children}</div>
        </details>
      ) : null}
    </section>
  );
}

/** GB below a terabyte, TB above it, so the value stays readable at both ends. */
export function formatCapacity(gb: number): string {
  if (gb >= 1024) {
    return (gb / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  return gb.toLocaleString();
}

export function capacityUnit(gb: number): string {
  return gb >= 1024 ? 'TB' : 'GB';
}
