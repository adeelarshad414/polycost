import { IntervalKey } from './types';

export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
export const HOURS_PER_MONTH = 730;
export const MONTHS_PER_QUARTER = 3;
export const HOURS_PER_YEAR = HOURS_PER_MONTH * 12;

export function hourlyFromMonthly(monthlyCostUsd: number): number {
  return monthlyCostUsd / HOURS_PER_MONTH;
}

export function intervalMultiplierFromMonthly(interval: IntervalKey): number {
  switch (interval) {
    case 'hourly':
      return 1 / HOURS_PER_MONTH;
    case 'daily':
      return HOURS_PER_DAY / HOURS_PER_MONTH;
    case 'weekly':
      return HOURS_PER_WEEK / HOURS_PER_MONTH;
    case 'monthly':
      return 1;
    case 'quarterly':
      return MONTHS_PER_QUARTER;
    case 'yearly':
      return HOURS_PER_YEAR / HOURS_PER_MONTH;
  }
}
