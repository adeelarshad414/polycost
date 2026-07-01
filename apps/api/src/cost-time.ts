import { CostIntervals } from './comparison/comparison.types';

export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
export const HOURS_PER_MONTH = 730;
export const MONTHS_PER_QUARTER = 3;
export const HOURS_PER_YEAR = HOURS_PER_MONTH * 12;

export function intervalCostsFromHourly(hourlyCostUsd: number): CostIntervals {
  if (!Number.isFinite(hourlyCostUsd) || hourlyCostUsd < 0) {
    throw new RangeError('hourlyCostUsd must be a finite non-negative number');
  }

  return {
    hourly: roundCurrency(hourlyCostUsd),
    daily: roundCurrency(hourlyCostUsd * HOURS_PER_DAY),
    weekly: roundCurrency(hourlyCostUsd * HOURS_PER_WEEK),
    monthly: roundCurrency(hourlyCostUsd * HOURS_PER_MONTH),
    quarterly: roundCurrency(hourlyCostUsd * HOURS_PER_MONTH * MONTHS_PER_QUARTER),
    yearly: roundCurrency(hourlyCostUsd * HOURS_PER_YEAR),
  };
}

export function hourlyFromMonthly(monthlyCostUsd: number): number {
  if (!Number.isFinite(monthlyCostUsd) || monthlyCostUsd < 0) {
    throw new RangeError('monthlyCostUsd must be a finite non-negative number');
  }

  return monthlyCostUsd / HOURS_PER_MONTH;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
