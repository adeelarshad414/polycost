/*
  Shared labelled form controls. Both render a caption, a control and an
  accessible error, and both derive their element id from the label so the
  label/control association stays correct without a caller-supplied id.
*/
import { clampNumber, toId } from '../lib/workload-analysis';

export function TextField({
  label,
  value,
  inputMode,
  suffix,
  disabled,
  error,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  suffix?: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = toId(label);
  const errorId = `${id}-error`;
  return (
    <div className={error ? 'form-field is-invalid' : 'form-field'}>
      <label className="field-caption" htmlFor={id}>
        {label}
      </label>
      <span className={suffix ? 'field-control field-control-suffix' : 'field-control'}>
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
      {error ? (
        <span id={errorId} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  error,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  suffix?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = toId(label);
  const errorId = `${id}-error`;
  const numericValue = clampNumber(Number(value), min, max);

  return (
    <div className={error ? 'form-field range-field is-invalid' : 'form-field range-field'}>
      <label className="field-caption" htmlFor={id}>
        {label}
      </label>
      <div className="range-field-control">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={numericValue}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <strong>
          {numericValue}
          {suffix}
        </strong>
      </div>
      {error ? (
        <span id={errorId} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
