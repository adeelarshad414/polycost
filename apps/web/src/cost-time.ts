import { IntervalKey } from './types';
import monthlyHourStandard from '@polycost/types/monthly-hour-standard.json';

export const HOURS_PER_DAY = monthlyHourStandard.hoursPerDay;
export const DAYS_PER_WEEK = monthlyHourStandard.daysPerWeek;
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
export const HOURS_PER_MONTH = monthlyHourStandard.hoursPerMonth;
export const MONTHS_PER_QUARTER = monthlyHourStandard.monthsPerQuarter;
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
