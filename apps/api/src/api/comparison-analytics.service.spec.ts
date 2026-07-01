import { ComparisonResult } from '../comparison/comparison.types';
import { ComparisonAnalyticsService } from './comparison-analytics.service';

const comparison: ComparisonResult = {
  comparisonId: 'analytics-comparison-1',
  pricingAsOf: '2026-07-02T00:00:00.000Z',
  cheapestProviderId: 'azure',
  requirements: {
    sourceType: 'structured_form',
    workloadName: 'Production API',
    workloadType: 'api_backend',
    regionPreference: 'eu-west',
    workloadProfile: {
      environment: 'production',
      commitmentPreferencePercent: 80,
      dataResidency: {
        scope: 'EU',
        complianceLocked: true,
      },
      operatingSystem: 'windows',
      supportTier: 'business',
      usagePattern: {
        type: 'bursty',
        averageUtilizationPercent: 20,
      },
    },
    serviceRequirements: [
      {
        serviceCategory: 'compute',
        serviceType: 'vm-compute',
        quantity: 3,
      },
    ],
  },
  providers: [
    {
      providerId: 'aws',
      totals: {
        daily: 33.33,
        weekly: 233.33,
        monthly: 1000,
        quarterly: 3000,
        yearly: 12000,
      },
      pricingModels: [
        { model: 'on-demand', available: true, monthlyCostUsd: 1000 },
        {
          model: 'reserved-1yr',
          available: true,
          displayName: 'Reserved 1yr',
          monthlyCostUsd: 850,
          upfrontCostUsd: 600,
          commitmentTermMonths: 12,
        },
        {
          model: 'reserved-3yr',
          available: true,
          displayName: 'Reserved 3yr',
          monthlyCostUsd: 700,
          upfrontCostUsd: 2400,
          commitmentTermMonths: 36,
        },
      ],
      lineItems: [
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'web compute',
          isApproximate: false,
          baseMonthlyCostUsd: 400,
          pricingModels: [
            { model: 'on-demand', available: true, monthlyCostUsd: 400 },
            { model: 'reserved-1yr', available: true, monthlyCostUsd: 300 },
          ],
        },
        {
          category: 'storage',
          costComponent: 'storage',
          description: 'object storage',
          isApproximate: false,
          baseMonthlyCostUsd: 100,
        },
        {
          category: 'network',
          costComponent: 'egress',
          description: 'internet egress',
          isApproximate: false,
          baseMonthlyCostUsd: 250,
        },
        {
          category: 'network',
          description: 'nat and load balancing',
          isApproximate: false,
          baseMonthlyCostUsd: 50,
        },
        {
          category: 'support',
          costComponent: 'support',
          description: 'business support',
          isApproximate: true,
          baseMonthlyCostUsd: 100,
        },
        {
          category: 'licensing',
          costComponent: 'licensing',
          description: 'windows license',
          isApproximate: true,
          baseMonthlyCostUsd: 100,
        },
      ],
    },
    {
      providerId: 'azure',
      totals: {
        daily: 26.67,
        weekly: 186.67,
        monthly: 800,
        quarterly: 2400,
        yearly: 9600,
      },
      pricingModels: [
        { model: 'on-demand', available: true, monthlyCostUsd: 800 },
        {
          model: 'savings-plan',
          available: true,
          displayName: 'Savings plan',
          monthlyCostUsd: 680,
          commitmentTermMonths: 12,
        },
      ],
      lineItems: [
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'api compute',
          isApproximate: false,
          baseMonthlyCostUsd: 300,
          pricingModels: [
            { model: 'on-demand', available: true, monthlyCostUsd: 300 },
            { model: 'savings-plan', available: true, monthlyCostUsd: 240 },
          ],
        },
        {
          category: 'storage',
          costComponent: 'storage',
          description: 'managed disk',
          isApproximate: false,
          baseMonthlyCostUsd: 100,
        },
        {
          category: 'database',
          costComponent: 'database',
          description: 'sql database',
          isApproximate: true,
          baseMonthlyCostUsd: 250,
        },
        {
          category: 'network',
          costComponent: 'egress',
          description: 'internet egress',
          isApproximate: false,
          baseMonthlyCostUsd: 80,
        },
        {
          category: 'support',
          costComponent: 'support',
          description: 'business support',
          isApproximate: true,
          baseMonthlyCostUsd: 70,
        },
      ],
    },
    {
      providerId: 'gcp',
      totals: {
        daily: 30,
        weekly: 210,
        monthly: 900,
        quarterly: 2700,
        yearly: 10800,
      },
      pricingModels: [{ model: 'on-demand', available: true, monthlyCostUsd: 900 }],
      lineItems: [
        {
          category: 'compute',
          costComponent: 'compute',
          description: 'n2 compute',
          isApproximate: false,
          baseMonthlyCostUsd: 450,
        },
        {
          category: 'storage',
          costComponent: 'storage',
          description: 'cloud storage',
          isApproximate: false,
          baseMonthlyCostUsd: 150,
        },
        {
          category: 'database',
          costComponent: 'database',
          description: 'cloud sql',
          isApproximate: false,
          baseMonthlyCostUsd: 200,
        },
        {
          category: 'network',
          costComponent: 'egress',
          description: 'internet egress',
          isApproximate: false,
          baseMonthlyCostUsd: 100,
        },
      ],
    },
  ],
};

describe('ComparisonAnalyticsService', () => {
  it('builds reproducible FinOps analytics from a cached comparison snapshot', () => {
    const service = new ComparisonAnalyticsService();
    const analytics = service.build(comparison, new Date('2026-07-02T12:00:00.000Z'));

    expect(analytics).toMatchObject({
      comparisonId: 'analytics-comparison-1',
      generatedAt: '2026-07-02T12:00:00.000Z',
      pricingAsOf: '2026-07-02T00:00:00.000Z',
    });
    expect(analytics.costComposition).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          items: expect.arrayContaining([
            expect.objectContaining({
              dimension: 'egress',
              monthlyCostUsd: 250,
              percentOfProviderTotal: 25,
              topDriver: 'internet egress',
            }),
            expect.objectContaining({
              dimension: 'licensing',
              monthlyCostUsd: 100,
            }),
          ]),
        }),
      ]),
    );
    expect(analytics.executiveForecast).toEqual({
      horizonDays: 90,
      assumption:
        '90-day projection uses current monthly run rate x 3; no historical trend or seasonality is inferred.',
      providerForecasts: expect.arrayContaining([
        {
          providerId: 'azure',
          monthlyRunRateUsd: 800,
          ninetyDayRunRateUsd: 2400,
          annualizedRunRateUsd: 9600,
        },
      ]),
    });
    expect(analytics.costCoverageMap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          dimension: 'Compute families and sizing',
          status: 'Covered',
          pricedRows: 1,
          approximateRows: 0,
          monthlyUsd: 400,
        }),
        expect.objectContaining({
          providerId: 'aws',
          dimension: 'Support plans and OS/licensing',
          status: 'Partial',
          pricedRows: 2,
          approximateRows: 2,
        }),
        expect.objectContaining({
          providerId: 'gcp',
          dimension: 'Pricing models, commitments, and spot estimates',
          status: 'Missing priced row',
        }),
      ]),
    );
    expect(analytics.providerDeltaAnalysis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: 'compute',
          cheapestProviderId: 'azure',
          mostExpensiveProviderId: 'gcp',
          deltaMonthlyUsd: 150,
          deltaPercentVsMostExpensive: 33.33,
        }),
      ]),
    );
    expect(analytics.regionVarianceHeatMap).toEqual([
      expect.objectContaining({
        comparisonRegion: 'eu-west',
        label: 'Europe West',
        multiplier: 1.08,
        isSelected: true,
        complianceEligible: true,
        lowestProviderId: 'azure',
        providers: [
          {
            providerId: 'aws',
            providerRegion: 'eu-west-1',
            modeledMonthlyUsd: 1080,
            deltaVsSelectedMonthlyUsd: 80,
            isLowest: false,
          },
          {
            providerId: 'azure',
            providerRegion: 'westeurope',
            modeledMonthlyUsd: 864,
            deltaVsSelectedMonthlyUsd: 64,
            isLowest: true,
          },
          {
            providerId: 'gcp',
            providerRegion: 'europe-west1',
            modeledMonthlyUsd: 972,
            deltaVsSelectedMonthlyUsd: 72,
            isLowest: false,
          },
        ],
      }),
    ]);
    expect(analytics.sensitivityScenarios).toEqual(
      expect.arrayContaining([
        {
          variable: 'egress_traffic',
          label: 'Egress traffic',
          changePercent: 50,
          providerId: 'aws',
          baselineMonthlyUsd: 1000,
          adjustedMonthlyUsd: 1125,
          deltaMonthlyUsd: 125,
        },
      ]),
    );
    expect(analytics.commitmentRoiTimelines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          pricingModel: 'reserved-1yr',
          baselineMonthlyUsd: 1000,
          committedMonthlyUsd: 850,
          upfrontCostUsd: 600,
          monthlySavingsUsd: 150,
          breakEvenMonth: 4,
          points: expect.arrayContaining([
            {
              month: 6,
              onDemandCumulativeUsd: 6000,
              committedCumulativeUsd: 5700,
              savingsUsd: 300,
            },
          ]),
        }),
      ]),
    );
    expect(analytics.commitmentCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          eligibleMonthlyUsd: 400,
          coveredPercentOfSpend: 40,
          onDemandExposureMonthlyUsd: 600,
          zeroCommitmentMonthlyUsd: 1000,
          targetCoveragePercent: 80,
          targetBlendMonthlyUsd: 920,
          fullyCommittedMonthlyUsd: 900,
          ineligibleMonthlyUsd: 600,
          targetOnDemandExposureMonthlyUsd: 680,
          exposedPercentOfSpend: 68,
          targetSavingsMonthlyUsd: 80,
          remainingOpportunityMonthlyUsd: 20,
          maxMonthlySavingsUsd: 100,
          recommendation:
            'aws can move from $1,000/mo at 0% commitment coverage to $900/mo at 100%; target blend is $920/mo.',
        }),
      ]),
    );
    expect(analytics.tcoSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'aws',
          egressLockInMonthlyUsd: 250,
          supportMonthlyUsd: 100,
          licensingMonthlyUsd: 100,
          freeTierApplicability: 'unlikely',
        }),
      ]),
    );
    expect(analytics.optimizationOpportunities.length).toBeLessThanOrEqual(5);
    expect(analytics.optimizationOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'provider-selection-1',
          category: 'Provider selection',
          estimatedMonthlySavingsUsd: 200,
          estimatedAnnualSavingsUsd: 2400,
          priority: 'High',
          effort: 'Medium',
          evidence: 'Provider delta from current cached comparison: aws $1000/mo vs azure $800/mo.',
        }),
      ]),
    );
    expect(analytics.finOpsFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'aws-egress-driver',
          category: 'egress',
          estimatedMonthlyImpactUsd: 50,
        }),
        expect.objectContaining({
          id: 'low-utilization-right-sizing',
          category: 'right-sizing',
          estimatedMonthlyImpactUsd: 75,
        }),
        expect.objectContaining({
          id: 'aws-commitment-gap',
          category: 'commitment',
        }),
        expect.objectContaining({
          id: 'aws-license-optimization',
          category: 'licensing',
        }),
      ]),
    );
  });
});
