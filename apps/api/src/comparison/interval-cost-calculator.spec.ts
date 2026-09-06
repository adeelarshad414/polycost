import { describe, it, expect } from '@jest/globals';
import { IntervalCostCalculator } from './interval-cost-calculator.js';

describe('IntervalCostCalculator', () => {
  const calculator = new IntervalCostCalculator();

  it('derives daily, weekly, quarterly, and yearly costs from a monthly base', () => {
    expect(calculator.calculate(71)).toEqual({
      hourly: 0.09726, // 71 / 730, a rate (6dp) so hourly x 730 reconciles to monthly
      daily: 2.33,
      weekly: 16.34,
      monthly: 71,
      quarterly: 213,
      yearly: 852,
    });
  });

  it('keeps hourly fine enough that hourly x 730 reconciles with the monthly total', () => {
    // Regression for H2: a sub-cent rate ($9.93/mo -> $0.0136/hr) must not round
    // to $0.01/hr, which would imply $7.30/mo instead of $9.93.
    const result = calculator.calculate(9.93);
    expect(Math.round((result.hourly ?? 0) * 730 * 100) / 100).toBe(result.monthly);
    expect(result.hourly).not.toBe(0.01);
  });

  it('supports zero-cost workloads', () => {
    expect(calculator.calculate(0)).toEqual({
      hourly: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      quarterly: 0,
      yearly: 0,
    });
  });

  it('rounds monetary values to cents', () => {
    expect(calculator.calculate(10.005)).toEqual({
      hourly: 0.013712, // 10.01 (cents-rounded monthly) / 730 as a 6dp rate
      daily: 0.33,
      weekly: 2.3,
      monthly: 10.01,
      quarterly: 30.03,
      yearly: 120.12,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid monthly cost %s',
    (monthlyCost) => {
      expect(() => calculator.calculate(monthlyCost)).toThrow(
        'baseMonthlyCostUsd must be a finite non-negative number',
      );
    },
  );
});
