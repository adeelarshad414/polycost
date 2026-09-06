import { describe, it, expect } from '@jest/globals';
import {
  HOURS_PER_MONTH,
  hourlyFromMonthly,
  intervalCostsFromHourly,
  roundCurrency,
} from './cost-time.js';

describe('cost time utilities', () => {
  it('derives every reporting interval from the 730-hour month standard', () => {
    expect(HOURS_PER_MONTH).toBe(730);
    expect(hourlyFromMonthly(73)).toBeCloseTo(0.1);
    expect(intervalCostsFromHourly(0.1)).toEqual({
      hourly: 0.1,
      daily: 2.4,
      weekly: 16.8,
      monthly: 73,
      quarterly: 219,
      yearly: 876,
    });
  });

  it('rejects invalid cost inputs before they can skew reports', () => {
    expect(() => hourlyFromMonthly(Number.NaN)).toThrow(RangeError);
    expect(() => hourlyFromMonthly(-1)).toThrow(RangeError);
    expect(() => intervalCostsFromHourly(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => intervalCostsFromHourly(-0.01)).toThrow(RangeError);
  });

  it('rounds currency values to cents consistently', () => {
    expect(roundCurrency(10.005)).toBe(10.01);
    expect(roundCurrency(10.004)).toBe(10);
  });
});
