import { Injectable } from '@nestjs/common';
import { hourlyFromMonthly, intervalCostsFromHourly, roundCurrency } from '../cost-time';
import { CostIntervals } from './comparison.types';

@Injectable()
export class IntervalCostCalculator {
  calculate(baseMonthlyCostUsd: number): CostIntervals {
    if (!Number.isFinite(baseMonthlyCostUsd) || baseMonthlyCostUsd < 0) {
      throw new RangeError('baseMonthlyCostUsd must be a finite non-negative number');
    }

    const monthly = roundCurrency(baseMonthlyCostUsd);
    return intervalCostsFromHourly(hourlyFromMonthly(monthly));
  }
}
