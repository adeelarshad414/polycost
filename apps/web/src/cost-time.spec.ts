import {
  HOURS_PER_DAY,
  HOURS_PER_MONTH,
  HOURS_PER_WEEK,
  hourlyFromMonthly,
  intervalMultiplierFromMonthly,
} from './cost-time';

describe('web cost time utilities', () => {
  it('uses the same 730-hour month as the backend for every interval', () => {
    expect(HOURS_PER_MONTH).toBe(730);
    expect(hourlyFromMonthly(73)).toBeCloseTo(0.1);
    expect(intervalMultiplierFromMonthly('hourly')).toBeCloseTo(1 / HOURS_PER_MONTH);
    expect(intervalMultiplierFromMonthly('daily')).toBeCloseTo(HOURS_PER_DAY / HOURS_PER_MONTH);
    expect(intervalMultiplierFromMonthly('weekly')).toBeCloseTo(HOURS_PER_WEEK / HOURS_PER_MONTH);
    expect(intervalMultiplierFromMonthly('monthly')).toBe(1);
    expect(intervalMultiplierFromMonthly('quarterly')).toBe(3);
    expect(intervalMultiplierFromMonthly('yearly')).toBe(12);
  });
});
