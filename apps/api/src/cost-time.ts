import { CostIntervals } from './comparison/comparison.types.js';
import monthlyHourStandard from '@polycost/types/monthly-hour-standard.json';

export const HOURS_PER_DAY = monthlyHourStandard.hoursPerDay;
export const DAYS_PER_WEEK = monthlyHourStandard.daysPerWeek;
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
export const HOURS_PER_MONTH = monthlyHourStandard.hoursPerMonth;
export const MONTHS_PER_QUARTER = monthlyHourStandard.monthsPerQuarter;
export const HOURS_PER_YEAR = HOURS_PER_MONTH * 12;

export function intervalCostsFromHourly(hourlyCostUsd: number): CostIntervals {
  if (!Number.isFinite(hourlyCostUsd) || hourlyCostUsd < 0) {
    throw new RangeError('hourlyCostUsd must be a finite non-negative number');
  }

  return {
    // Hourly is a sub-cent rate; round it finer so hourly x 730 reconciles with
    // the monthly total. Longer intervals are dollar totals rounded to cents.
    hourly: roundRate(hourlyCostUsd),
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

/**
 * Rounds an hourly RATE to 6 decimals. Hourly rates are frequently sub-cent, so
 * rounding to whole cents makes hourly x 730 disagree with the monthly total.
 */
export function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
