/*
  Money (audit M-04). The one place this app rounds or adds US dollars.

  Floating-point dollars drift: 0.1 + 0.2 is 0.30000000000000004, and 1.005 is
  stored as 1.00499..., so `Math.round(x * 100) / 100` turns it into 1.00. Every
  operation here first moves the amount to whole micro-dollars (1e-6 USD), which
  is exact for any amount below about $9 billion, then rounds half away from zero.
  Sums are added as integers, so a total does not depend on the order of its parts.

  The API and the web app each keep a copy of this file - the shared package
  carries types only at runtime - and both run every case in
  packages/types/money-cases.json, so they cannot disagree.
*/

const MICROS_PER_USD = 1_000_000;
// Largest amount whose micro-dollar count is still an exact integer.
const MAX_ABS_USD = Number.MAX_SAFE_INTEGER / MICROS_PER_USD;

/** Whole micro-dollars for a dollar amount. */
export function toMicros(usd: number): number {
  if (!Number.isFinite(usd) || Math.abs(usd) > MAX_ABS_USD) {
    throw new RangeError(`Amount out of range for money arithmetic: ${usd}`);
  }
  return Math.sign(usd) * Math.round(Math.abs(usd) * MICROS_PER_USD);
}

export function fromMicros(micros: number): number {
  return micros / MICROS_PER_USD;
}

/** Rounds to `decimals` places (0-6), half away from zero. */
export function roundUsd(usd: number, decimals = 2): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new RangeError(`decimals must be an integer from 0 to 6, got ${decimals}`);
  }
  const micros = toMicros(usd);
  const step = 10 ** (6 - decimals);
  const units = Math.sign(micros) * Math.round(Math.abs(micros) / step);
  // No negative zero: -0.004 rounds to 0, not to a "-$0.00".
  return units === 0 ? 0 : units / 10 ** decimals;
}

/**
 * Hourly and per-unit rates: 6 decimals. Rates are often sub-cent, and rounding
 * them to cents makes rate x 730 disagree with the monthly total.
 */
export function roundRateUsd(usd: number): number {
  return roundUsd(usd, 6);
}

/**
 * Exact a + b (to the micro-dollar). Drop-in for running totals and
 * `reduce((sum, x) => addUsd(sum, x.cost), 0)`, which otherwise drift.
 */
export function addUsd(a: number, b: number): number {
  return fromMicros(toMicros(a) + toMicros(b));
}

/** Exact sum, independent of order; not rounded to cents. */
export function sumUsd(amounts: readonly number[]): number {
  return fromMicros(amounts.reduce((total, amount) => total + toMicros(amount), 0));
}

/**
 * Percent change from `base` to `value`, to 4 decimals. Null when `base` is 0
 * and `value` is not: a change from nothing has no percentage, and reporting
 * one (the old code said 100%) states a variance nobody measured.
 */
export function percentChange(value: number, base: number): number | null {
  const valueMicros = toMicros(value);
  const baseMicros = toMicros(base);
  if (baseMicros === 0) {
    return valueMicros === 0 ? 0 : null;
  }
  return roundPercent(((valueMicros - baseMicros) / baseMicros) * 100);
}

/** Percentages: 4 decimals, half away from zero. */
export function roundPercent(percent: number, decimals = 4): number {
  return roundUsd(percent, decimals);
}
