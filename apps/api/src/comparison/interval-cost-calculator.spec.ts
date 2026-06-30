import { IntervalCostCalculator } from './interval-cost-calculator';

describe('IntervalCostCalculator', () => {
  const calculator = new IntervalCostCalculator();

  it('derives daily, weekly, quarterly, and yearly costs from a monthly base', () => {
    expect(calculator.calculate(71)).toEqual({
      hourly: 0.1,
      daily: 2.37,
      weekly: 16.59,
      monthly: 71,
      quarterly: 213,
      yearly: 852,
    });
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
      hourly: 0.01,
      daily: 0.33,
      weekly: 2.31,
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
