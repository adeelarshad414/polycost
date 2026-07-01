import { HOURS_PER_MONTH, hourlyFromMonthly, intervalMultiplierFromMonthly } from './cost-time';

describe('web cost time utilities', () => {
  it('uses the same 730-hour month as the backend for every interval', () => {
    expect(HOURS_PER_MONTH).toBe(730);
    expect(hourlyFromMonthly(73)).toBeCloseTo(0.1);
    expect(intervalMultiplierFromMonthly('hourly')).toBeCloseTo(1 / 730);
    expect(intervalMultiplierFromMonthly('daily')).toBeCloseTo(24 / 730);
    expect(intervalMultiplierFromMonthly('weekly')).toBeCloseTo(168 / 730);
    expect(intervalMultiplierFromMonthly('monthly')).toBe(1);
    expect(intervalMultiplierFromMonthly('quarterly')).toBe(3);
    expect(intervalMultiplierFromMonthly('yearly')).toBe(12);
  });
});
