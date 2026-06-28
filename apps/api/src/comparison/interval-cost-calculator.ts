import { Injectable } from '@nestjs/common';
import { CostIntervals } from './comparison.types';

const DAYS_PER_MONTH = 30;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_QUARTER = 3;
const MONTHS_PER_YEAR = 12;

@Injectable()
export class IntervalCostCalculator {
  calculate(baseMonthlyCostUsd: number): CostIntervals {
    if (!Number.isFinite(baseMonthlyCostUsd) || baseMonthlyCostUsd < 0) {
      throw new RangeError('baseMonthlyCostUsd must be a finite non-negative number');
    }

    const monthly = this.roundCurrency(baseMonthlyCostUsd);
    const daily = this.roundCurrency(monthly / DAYS_PER_MONTH);

    return {
      daily,
      weekly: this.roundCurrency(daily * DAYS_PER_WEEK),
      monthly,
      quarterly: this.roundCurrency(monthly * MONTHS_PER_QUARTER),
      yearly: this.roundCurrency(monthly * MONTHS_PER_YEAR),
    };
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
