import { HOURS_PER_MONTH, intervalCostsFromHourly } from '../cost-time';
import { ComparisonResult } from '../comparison/comparison.types';
import {
  calculateEgressCost,
  calculateEgressTierBreakdown,
  EgressTierRate,
} from '../pricing-normalization/egress-tier-calculator';
import { ComparisonAnalyticsService } from './comparison-analytics.service';

describe('FinOps proof checks', () => {
  it('uses the shared 730-hour constant for all interval math', () => {
    const hourlyCostUsd = 2;
    const intervals = intervalCostsFromHourly(hourlyCostUsd);

    expect(HOURS_PER_MONTH).toBe(730);
    expect(intervals).toEqual({
      hourly: 2,
      daily: 48,
      weekly: 336,
      monthly: 1460,
      quarterly: 4380,
      yearly: 17520,
    });
  });

  it('matches independent 80TB tiered-egress math against the calculator output', () => {
    const tiers: EgressTierRate[] = [
      { tierFromGb: 0, tierToGb: 10_240, pricePerGb: 0.09 },
      { tierFromGb: 10_240, tierToGb: 51_200, pricePerGb: 0.085 },
      { tierFromGb: 51_200, tierToGb: null, pricePerGb: 0.07 },
    ];
    const gbPerMonth = 80 * 1024;
    const manualTierCosts = [
      10_240 * 0.09,
      (51_200 - 10_240) * 0.085,
      (gbPerMonth - 51_200) * 0.07,
    ];
    const manualMonthlyCostUsd = roundCurrency(
      manualTierCosts.reduce((sum, tierCost) => sum + tierCost, 0),
    );

    expect(manualMonthlyCostUsd).toBe(6553.6);
    expect(calculateEgressCost(tiers, gbPerMonth)).toBe(manualMonthlyCostUsd);
    expect(
      calculateEgressTierBreakdown(tiers, gbPerMonth).map((tier) => tier.monthlyCostUsd),
    ).toEqual(manualTierCosts.map(roundCurrency));
  });

  it('matches manual commitment break-even math and keeps reserved terms distinct', () => {
    const analytics = new ComparisonAnalyticsService().build(finOpsComparison());
    const awsTimelines = analytics.commitmentRoiTimelines.filter(
      (timeline) => timeline.providerId === 'aws',
    );
    const reserved1yr = awsTimelines.find((timeline) => timeline.pricingModel === 'reserved-1yr');
    const reserved3yr = awsTimelines.find((timeline) => timeline.pricingModel === 'reserved-3yr');

    expect(reserved1yr).toEqual(
      expect.objectContaining({
        baselineMonthlyUsd: 1000,
        committedMonthlyUsd: 850,
        upfrontCostUsd: 600,
        monthlySavingsUsd: 150,
        breakEvenMonth: Math.ceil(600 / (1000 - 850)),
      }),
    );
    expect(reserved3yr).toEqual(
      expect.objectContaining({
        baselineMonthlyUsd: 1000,
        committedMonthlyUsd: 700,
        upfrontCostUsd: 2400,
        monthlySavingsUsd: 300,
        breakEvenMonth: Math.ceil(2400 / (1000 - 700)),
      }),
    );
    expect(reserved1yr?.committedMonthlyUsd).not.toBe(reserved3yr?.committedMonthlyUsd);
    expect(reserved1yr?.breakEvenMonth).not.toBe(reserved3yr?.breakEvenMonth);
  });

  it('preserves estimate flags and spot volatility through pricing evidence', () => {
    const result = finOpsComparison();
    const provider = result.providers[0];
    const spotModel = provider.pricingModels?.find((model) => model.model === 'spot');
    const estimatedLineItem = provider.lineItems.find((lineItem) => lineItem.isApproximate);

    expect(spotModel).toEqual(
      expect.objectContaining({
        available: true,
        estimated: true,
        volatility: 'volatile',
      }),
    );
    expect(estimatedLineItem).toEqual(
      expect.objectContaining({
        description: 'spot-capacity compute',
        isApproximate: true,
      }),
    );
  });
});

function finOpsComparison(): ComparisonResult {
  return {
    comparisonId: 'finops-proof-comparison',
    pricingAsOf: '2026-07-01T00:00:00.000Z',
    cheapestProviderId: 'aws',
    requirements: {
      sourceType: 'structured_form',
      workloadName: 'FinOps proof workload',
      workloadType: 'web_app',
      regionPreference: 'us-east',
      serviceRequirements: [
        {
          serviceCategory: 'compute',
          serviceType: 'vm-compute',
          quantity: 1,
        },
      ],
    },
    providers: [
      {
        providerId: 'aws',
        totals: {
          hourly: roundCurrency(1000 / HOURS_PER_MONTH),
          daily: 32.88,
          weekly: 230.14,
          monthly: 1000,
          quarterly: 3000,
          yearly: 12000,
        },
        pricingModels: [
          {
            model: 'on-demand',
            available: true,
            monthlyCostUsd: 1000,
            hourlyCostUsd: roundCurrency(1000 / HOURS_PER_MONTH),
          },
          {
            model: 'reserved-1yr',
            available: true,
            displayName: 'Reserved 1yr',
            monthlyCostUsd: 850,
            hourlyCostUsd: roundCurrency(850 / HOURS_PER_MONTH),
            upfrontCostUsd: 600,
            commitmentTermMonths: 12,
          },
          {
            model: 'reserved-3yr',
            available: true,
            displayName: 'Reserved 3yr',
            monthlyCostUsd: 700,
            hourlyCostUsd: roundCurrency(700 / HOURS_PER_MONTH),
            upfrontCostUsd: 2400,
            commitmentTermMonths: 36,
          },
          {
            model: 'spot',
            available: true,
            monthlyCostUsd: 420,
            hourlyCostUsd: roundCurrency(420 / HOURS_PER_MONTH),
            estimated: true,
            volatility: 'volatile',
          },
        ],
        lineItems: [
          {
            category: 'compute',
            costComponent: 'compute',
            description: 'on-demand compute',
            isApproximate: false,
            baseMonthlyCostUsd: 580,
            baseHourlyCostUsd: roundCurrency(580 / HOURS_PER_MONTH),
          },
          {
            category: 'compute',
            costComponent: 'compute',
            description: 'spot-capacity compute',
            isApproximate: true,
            baseMonthlyCostUsd: 420,
            baseHourlyCostUsd: roundCurrency(420 / HOURS_PER_MONTH),
            pricingModels: [
              {
                model: 'spot',
                available: true,
                monthlyCostUsd: 420,
                hourlyCostUsd: roundCurrency(420 / HOURS_PER_MONTH),
                estimated: true,
                volatility: 'volatile',
              },
            ],
          },
        ],
        breakdown: {
          computeMonthlyCostUsd: 1000,
          storageMonthlyCostUsd: 0,
          egressMonthlyCostUsd: 0,
          networkingMonthlyCostUsd: 0,
          databaseMonthlyCostUsd: 0,
          supportMonthlyCostUsd: 0,
          licensingMonthlyCostUsd: 0,
          operationsMonthlyCostUsd: 0,
          scopedMonthlyCostUsd: 1000,
        },
      },
    ],
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
