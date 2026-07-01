import { Injectable } from '@nestjs/common';
import { PricingModelKey, ProviderId } from '../adapters/common/cloud-provider-adapter';
import {
  ComparisonLineItem,
  ComparisonProviderResult,
  ComparisonResult,
} from '../comparison/comparison.types';
import { costCoverageMapRows, regionComparisonEvidenceRows } from '../reports/report-evidence';

type AnalyticsDimension =
  | 'compute'
  | 'storage'
  | 'egress'
  | 'networking'
  | 'database'
  | 'support'
  | 'licensing'
  | 'operations'
  | 'other';

interface ProviderDimensionAmount {
  providerId: ProviderId;
  monthlyCostUsd: number;
  topDriver?: string;
}

export interface CostCompositionItem {
  dimension: AnalyticsDimension;
  label: string;
  monthlyCostUsd: number;
  percentOfProviderTotal: number;
  runningMonthlyUsd: number;
  topDriver?: string;
}

export interface ProviderCostComposition {
  providerId: ProviderId;
  totalMonthlyUsd: number;
  items: CostCompositionItem[];
}

export interface ProviderDeltaAnalysis {
  dimension: AnalyticsDimension;
  label: string;
  cheapestProviderId: ProviderId;
  mostExpensiveProviderId: ProviderId;
  cheapestMonthlyUsd: number;
  mostExpensiveMonthlyUsd: number;
  deltaMonthlyUsd: number;
  deltaPercentVsMostExpensive: number;
  explanation: string;
}

export interface RegionVarianceProviderCost {
  providerId: ProviderId;
  providerRegion: string;
  modeledMonthlyUsd: number;
  deltaVsSelectedMonthlyUsd: number;
  isLowest: boolean;
}

export interface RegionVarianceHeatMapRow {
  comparisonRegion: string;
  label: string;
  regionSummary: string;
  multiplier: number;
  evidence: string;
  isSelected: boolean;
  complianceEligible: boolean;
  lowestProviderId?: ProviderId;
  providers: RegionVarianceProviderCost[];
}

export interface SensitivityScenarioRow {
  variable: 'compute_capacity' | 'storage_volume' | 'egress_traffic' | 'database_capacity';
  label: string;
  changePercent: number;
  providerId: ProviderId;
  baselineMonthlyUsd: number;
  adjustedMonthlyUsd: number;
  deltaMonthlyUsd: number;
}

export interface CommitmentRoiPoint {
  month: number;
  onDemandCumulativeUsd: number;
  committedCumulativeUsd: number;
  savingsUsd: number;
}

export interface CommitmentRoiTimeline {
  providerId: ProviderId;
  pricingModel: Exclude<PricingModelKey, 'on-demand' | 'spot'>;
  label: string;
  baselineMonthlyUsd: number;
  committedMonthlyUsd: number;
  upfrontCostUsd: number;
  monthlySavingsUsd: number;
  breakEvenMonth?: number;
  points: CommitmentRoiPoint[];
}

export interface CommitmentCoverageRow {
  providerId: ProviderId;
  eligibleMonthlyUsd: number;
  coveredPercentOfSpend: number;
  onDemandExposureMonthlyUsd: number;
  zeroCommitmentMonthlyUsd: number;
  targetCoveragePercent: number;
  targetBlendMonthlyUsd: number;
  fullyCommittedMonthlyUsd: number;
  ineligibleMonthlyUsd: number;
  targetOnDemandExposureMonthlyUsd: number;
  exposedPercentOfSpend: number;
  targetSavingsMonthlyUsd: number;
  remainingOpportunityMonthlyUsd: number;
  maxMonthlySavingsUsd: number;
  recommendation: string;
}

export interface TcoSignal {
  providerId: ProviderId;
  egressLockInMonthlyUsd: number;
  supportMonthlyUsd: number;
  licensingMonthlyUsd: number;
  freeTierApplicability: 'possible' | 'unlikely';
  note: string;
}

export interface FinOpsFinding {
  id: string;
  severity: 'info' | 'review' | 'warning' | 'critical';
  category:
    | 'cost-driver'
    | 'right-sizing'
    | 'commitment'
    | 'egress'
    | 'licensing'
    | 'support'
    | 'mapping'
    | 'risk';
  title: string;
  recommendation: string;
  estimatedMonthlyImpactUsd?: number;
  providerId?: ProviderId;
}

export interface ExecutiveForecastProvider {
  providerId: ProviderId;
  monthlyRunRateUsd: number;
  ninetyDayRunRateUsd: number;
  annualizedRunRateUsd: number;
}

export interface ExecutiveForecast {
  horizonDays: 90;
  assumption: string;
  providerForecasts: ExecutiveForecastProvider[];
}

export interface CostCoverageMapEntry {
  providerId: ProviderId;
  dimension: string;
  status: string;
  pricedRows: number;
  approximateRows: number;
  monthlyUsd?: number;
  evidence: string;
  reviewCue: string;
}

export interface ComparisonAnalyticsResponse {
  comparisonId: string;
  generatedAt: string;
  pricingAsOf: string;
  executiveForecast: ExecutiveForecast;
  costCoverageMap: CostCoverageMapEntry[];
  costComposition: ProviderCostComposition[];
  providerDeltaAnalysis: ProviderDeltaAnalysis[];
  regionVarianceHeatMap: RegionVarianceHeatMapRow[];
  sensitivityScenarios: SensitivityScenarioRow[];
  commitmentRoiTimelines: CommitmentRoiTimeline[];
  commitmentCoverage: CommitmentCoverageRow[];
  tcoSignals: TcoSignal[];
  finOpsFindings: FinOpsFinding[];
}

interface SensitivityVariable {
  variable: SensitivityScenarioRow['variable'];
  label: string;
  dimension: AnalyticsDimension;
}

const DIMENSION_ORDER: AnalyticsDimension[] = [
  'compute',
  'storage',
  'database',
  'egress',
  'networking',
  'operations',
  'support',
  'licensing',
  'other',
];

const DIMENSION_LABELS: Record<AnalyticsDimension, string> = {
  compute: 'Compute',
  storage: 'Storage',
  egress: 'Internet egress',
  networking: 'Networking overhead',
  database: 'Database',
  support: 'Support',
  licensing: 'Licensing',
  operations: 'Operations',
  other: 'Other services',
};

const SENSITIVITY_VARIABLES: SensitivityVariable[] = [
  {
    variable: 'compute_capacity',
    label: 'Compute capacity',
    dimension: 'compute',
  },
  {
    variable: 'storage_volume',
    label: 'Storage volume',
    dimension: 'storage',
  },
  {
    variable: 'egress_traffic',
    label: 'Egress traffic',
    dimension: 'egress',
  },
  {
    variable: 'database_capacity',
    label: 'Database capacity',
    dimension: 'database',
  },
];

const SENSITIVITY_CHANGES = [-50, -20, 20, 50];
const ROI_CHECKPOINT_MONTHS = [1, 6, 12, 24, 36];
const COMMITMENT_MODELS: Array<Exclude<PricingModelKey, 'on-demand' | 'spot'>> = [
  'reserved-1yr',
  'reserved-3yr',
  'savings-plan',
];

const COMPARISON_REGION_IDS = [
  'us-east',
  'us-west',
  'eu-west',
  'ap-southeast',
  'ap-south',
] as const;

const COMPARISON_REGION_PROVIDER_REGIONS: Record<string, string[]> = {
  'us-east': ['us-east-1', 'eastus', 'us-east1'],
  'us-west': ['us-west-2', 'westus2', 'us-west1'],
  'eu-west': ['eu-west-1', 'westeurope', 'europe-west1'],
  'ap-southeast': ['ap-southeast-1', 'southeastasia', 'asia-southeast1'],
  'ap-south': ['ap-south-1', 'centralindia', 'asia-south1'],
};

const PROVIDER_SORT_ORDER: ProviderId[] = ['aws', 'azure', 'gcp'];

@Injectable()
export class ComparisonAnalyticsService {
  build(result: ComparisonResult, generatedAt = new Date()): ComparisonAnalyticsResponse {
    const providerDimensionAmounts = result.providers.map((provider) => ({
      provider,
      amounts: providerDimensionAmountsForProvider(provider),
    }));

    return {
      comparisonId: result.comparisonId,
      generatedAt: generatedAt.toISOString(),
      pricingAsOf: result.pricingAsOf,
      executiveForecast: executiveForecast(result.providers),
      costCoverageMap: costCoverageMap(result),
      costComposition: providerDimensionAmounts.map(({ provider, amounts }) =>
        costComposition(provider, amounts),
      ),
      providerDeltaAnalysis: providerDeltaAnalysis(providerDimensionAmounts),
      regionVarianceHeatMap: regionVarianceHeatMap(result),
      sensitivityScenarios: sensitivityScenarios(providerDimensionAmounts),
      commitmentRoiTimelines: commitmentRoiTimelines(result.providers),
      commitmentCoverage: commitmentCoverage(result),
      tcoSignals: tcoSignals(providerDimensionAmounts),
      finOpsFindings: finOpsFindings(result, providerDimensionAmounts),
    };
  }
}

function regionVarianceHeatMap(result: ComparisonResult): RegionVarianceHeatMapRow[] {
  const selectedRegion =
    canonicalRegionForRegionPreference(result.requirements?.regionPreference ?? '') ?? 'us-east';
  const dataResidency = result.requirements?.workloadProfile?.dataResidency;
  const allowedRegions = dataResidency?.complianceLocked
    ? canonicalRegionsForResidencyScope(dataResidency.scope)
    : undefined;
  const rowsByRegion = new Map<string, ReturnType<typeof regionComparisonEvidenceRows>>();

  for (const row of regionComparisonEvidenceRows(result)) {
    if (allowedRegions && !allowedRegions.includes(row.comparisonRegion)) {
      continue;
    }

    const rows = rowsByRegion.get(row.comparisonRegion) ?? [];
    rows.push(row);
    rowsByRegion.set(row.comparisonRegion, rows);
  }

  return [...rowsByRegion.entries()].map(([comparisonRegion, rows]) => {
    const sortedRows = [...rows].sort(
      (left, right) => left.modeledMonthlyUsd - right.modeledMonthlyUsd,
    );
    const lowestProviderId = sortedRows[0]?.providerId as ProviderId | undefined;
    const providers = rows
      .map((row) => ({
        providerId: row.providerId as ProviderId,
        providerRegion: row.providerRegion,
        modeledMonthlyUsd: row.modeledMonthlyUsd,
        deltaVsSelectedMonthlyUsd: row.deltaVsSelectedMonthlyUsd,
        isLowest: row.providerId === lowestProviderId,
      }))
      .sort(
        (left, right) => providerSortIndex(left.providerId) - providerSortIndex(right.providerId),
      );

    return {
      comparisonRegion,
      label: comparisonRegionLabel(comparisonRegion),
      regionSummary: providers
        .map((provider) => `${providerLabel(provider.providerId)} ${provider.providerRegion}`)
        .join(' · '),
      multiplier: rows[0]?.multiplier ?? 1,
      evidence: rows[0]?.evidence ?? 'Modeled regional pricing sensitivity.',
      isSelected: selectedRegion === comparisonRegion,
      complianceEligible: !allowedRegions || allowedRegions.includes(comparisonRegion),
      ...(lowestProviderId ? { lowestProviderId } : {}),
      providers,
    };
  });
}

function costCoverageMap(result: ComparisonResult): CostCoverageMapEntry[] {
  return costCoverageMapRows(result)
    .slice(1)
    .map((row) => ({
      providerId: row[0] as ProviderId,
      dimension: row[1],
      status: row[2],
      pricedRows: Number(row[3]),
      approximateRows: Number(row[4]),
      ...(row[5] ? { monthlyUsd: Number(row[5]) } : {}),
      evidence: row[6],
      reviewCue: row[7],
    }));
}

function executiveForecast(providers: ComparisonProviderResult[]): ExecutiveForecast {
  return {
    horizonDays: 90,
    assumption:
      '90-day projection uses current monthly run rate x 3; no historical trend or seasonality is inferred.',
    providerForecasts: providers.map((provider) => ({
      providerId: provider.providerId,
      monthlyRunRateUsd: roundCurrency(provider.totals.monthly),
      ninetyDayRunRateUsd: roundCurrency(provider.totals.monthly * 3),
      annualizedRunRateUsd: roundCurrency(provider.totals.monthly * 12),
    })),
  };
}

function costComposition(
  provider: ComparisonProviderResult,
  amounts: Map<AnalyticsDimension, ProviderDimensionAmount>,
): ProviderCostComposition {
  let runningMonthlyUsd = 0;
  const items = DIMENSION_ORDER.flatMap((dimension): CostCompositionItem[] => {
    const amount = amounts.get(dimension);

    if (!amount || amount.monthlyCostUsd <= 0) {
      return [];
    }

    runningMonthlyUsd = roundCurrency(runningMonthlyUsd + amount.monthlyCostUsd);

    return [
      {
        dimension,
        label: DIMENSION_LABELS[dimension],
        monthlyCostUsd: amount.monthlyCostUsd,
        percentOfProviderTotal: percent(amount.monthlyCostUsd, provider.totals.monthly),
        runningMonthlyUsd,
        ...(amount.topDriver ? { topDriver: amount.topDriver } : {}),
      },
    ];
  });

  return {
    providerId: provider.providerId,
    totalMonthlyUsd: roundCurrency(provider.totals.monthly),
    items,
  };
}

function providerDeltaAnalysis(
  providerDimensionAmounts: Array<{
    provider: ComparisonProviderResult;
    amounts: Map<AnalyticsDimension, ProviderDimensionAmount>;
  }>,
): ProviderDeltaAnalysis[] {
  return DIMENSION_ORDER.flatMap((dimension): ProviderDeltaAnalysis[] => {
    const priced = providerDimensionAmounts
      .map(({ provider, amounts }) => ({
        providerId: provider.providerId,
        monthlyCostUsd: amounts.get(dimension)?.monthlyCostUsd ?? 0,
        topDriver: amounts.get(dimension)?.topDriver,
      }))
      .filter((row) => row.monthlyCostUsd > 0)
      .sort((left, right) => left.monthlyCostUsd - right.monthlyCostUsd);

    if (priced.length < 2) {
      return [];
    }

    const cheapest = priced[0];
    const mostExpensive = priced[priced.length - 1];
    const deltaMonthlyUsd = roundCurrency(mostExpensive.monthlyCostUsd - cheapest.monthlyCostUsd);

    return [
      {
        dimension,
        label: DIMENSION_LABELS[dimension],
        cheapestProviderId: cheapest.providerId,
        mostExpensiveProviderId: mostExpensive.providerId,
        cheapestMonthlyUsd: cheapest.monthlyCostUsd,
        mostExpensiveMonthlyUsd: mostExpensive.monthlyCostUsd,
        deltaMonthlyUsd,
        deltaPercentVsMostExpensive: percent(deltaMonthlyUsd, mostExpensive.monthlyCostUsd),
        explanation: `${cheapest.providerId} is $${formatNumber(
          deltaMonthlyUsd,
        )}/mo lower for ${DIMENSION_LABELS[dimension].toLowerCase()} than ${
          mostExpensive.providerId
        }; largest observed driver is ${mostExpensive.topDriver ?? 'not itemized'}.`,
      },
    ];
  });
}

function sensitivityScenarios(
  providerDimensionAmounts: Array<{
    provider: ComparisonProviderResult;
    amounts: Map<AnalyticsDimension, ProviderDimensionAmount>;
  }>,
): SensitivityScenarioRow[] {
  return SENSITIVITY_VARIABLES.flatMap((variable) => {
    const hasSignal = providerDimensionAmounts.some(
      ({ amounts }) => (amounts.get(variable.dimension)?.monthlyCostUsd ?? 0) > 0,
    );

    if (!hasSignal) {
      return [];
    }

    return SENSITIVITY_CHANGES.flatMap((changePercent) =>
      providerDimensionAmounts.map(({ provider, amounts }) => {
        const baseline = roundCurrency(provider.totals.monthly);
        const dimensionMonthly = amounts.get(variable.dimension)?.monthlyCostUsd ?? 0;
        const deltaMonthlyUsd = roundCurrency(dimensionMonthly * (changePercent / 100));

        return {
          variable: variable.variable,
          label: variable.label,
          changePercent,
          providerId: provider.providerId,
          baselineMonthlyUsd: baseline,
          adjustedMonthlyUsd: roundCurrency(baseline + deltaMonthlyUsd),
          deltaMonthlyUsd,
        };
      }),
    );
  });
}

function commitmentRoiTimelines(providers: ComparisonProviderResult[]): CommitmentRoiTimeline[] {
  return providers.flatMap((provider) => {
    const baselineMonthlyUsd =
      provider.pricingModels?.find((model) => model.model === 'on-demand' && model.available)
        ?.monthlyCostUsd ?? provider.totals.monthly;

    return COMMITMENT_MODELS.flatMap((pricingModel): CommitmentRoiTimeline[] => {
      const model = provider.pricingModels?.find(
        (candidate) => candidate.model === pricingModel && candidate.available,
      );

      if (!model?.monthlyCostUsd) {
        return [];
      }

      const committedMonthlyUsd = model.monthlyCostUsd;
      const upfrontCostUsd = model.upfrontCostUsd ?? 0;
      const monthlySavingsUsd = roundCurrency(baselineMonthlyUsd - committedMonthlyUsd);
      const termMonths = model.commitmentTermMonths ?? defaultTermMonths(pricingModel);
      const checkpoints = ROI_CHECKPOINT_MONTHS.filter((month) => month <= termMonths);

      return [
        {
          providerId: provider.providerId,
          pricingModel,
          label: model.displayName ?? pricingModel,
          baselineMonthlyUsd: roundCurrency(baselineMonthlyUsd),
          committedMonthlyUsd: roundCurrency(committedMonthlyUsd),
          upfrontCostUsd: roundCurrency(upfrontCostUsd),
          monthlySavingsUsd,
          ...(monthlySavingsUsd > 0
            ? { breakEvenMonth: Math.max(1, Math.ceil(upfrontCostUsd / monthlySavingsUsd)) }
            : {}),
          points: checkpoints.map((month) => {
            const onDemandCumulativeUsd = roundCurrency(baselineMonthlyUsd * month);
            const committedCumulativeUsd = roundCurrency(
              upfrontCostUsd + committedMonthlyUsd * month,
            );

            return {
              month,
              onDemandCumulativeUsd,
              committedCumulativeUsd,
              savingsUsd: roundCurrency(onDemandCumulativeUsd - committedCumulativeUsd),
            };
          }),
        },
      ];
    });
  });
}

function commitmentCoverage(result: ComparisonResult): CommitmentCoverageRow[] {
  const targetCoveragePercent = clampPercent(
    result.requirements?.workloadProfile?.commitmentPreferencePercent ?? 0,
  );
  const targetCoverageRate = targetCoveragePercent / 100;

  return result.providers.map((provider) => {
    const zeroCommitmentMonthlyUsd = roundCurrency(
      provider.pricingModels?.find((model) => model.model === 'on-demand' && model.available)
        ?.monthlyCostUsd ?? provider.totals.monthly,
    );
    const eligibleMonthlyUsd = roundCurrency(
      provider.lineItems
        .filter((lineItem) =>
          lineItem.pricingModels?.some(
            (model) =>
              model.model !== 'on-demand' &&
              model.model !== 'spot' &&
              model.available &&
              model.monthlyCostUsd !== undefined,
          ),
        )
        .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
    );
    const maxMonthlySavingsUsd = roundCurrency(
      provider.lineItems.reduce((sum, lineItem) => sum + lineItemCommitmentSavings(lineItem), 0),
    );
    const ineligibleMonthlyUsd = roundCurrency(
      Math.max(0, zeroCommitmentMonthlyUsd - eligibleMonthlyUsd),
    );
    const fullyCommittedMonthlyUsd = roundCurrency(
      Math.max(0, zeroCommitmentMonthlyUsd - maxMonthlySavingsUsd),
    );
    const targetSavingsMonthlyUsd = roundCurrency(maxMonthlySavingsUsd * targetCoverageRate);
    const targetBlendMonthlyUsd = roundCurrency(
      Math.max(0, zeroCommitmentMonthlyUsd - targetSavingsMonthlyUsd),
    );
    const remainingOpportunityMonthlyUsd = roundCurrency(
      Math.max(0, maxMonthlySavingsUsd - targetSavingsMonthlyUsd),
    );
    const targetOnDemandExposureMonthlyUsd = roundCurrency(
      ineligibleMonthlyUsd + eligibleMonthlyUsd * (1 - targetCoverageRate),
    );
    const exposedPercentOfSpend = percent(
      targetOnDemandExposureMonthlyUsd,
      zeroCommitmentMonthlyUsd,
    );

    return {
      providerId: provider.providerId,
      eligibleMonthlyUsd,
      coveredPercentOfSpend: percent(eligibleMonthlyUsd, provider.totals.monthly),
      onDemandExposureMonthlyUsd: roundCurrency(
        Math.max(0, provider.totals.monthly - eligibleMonthlyUsd),
      ),
      zeroCommitmentMonthlyUsd,
      targetCoveragePercent,
      targetBlendMonthlyUsd,
      fullyCommittedMonthlyUsd,
      ineligibleMonthlyUsd,
      targetOnDemandExposureMonthlyUsd,
      exposedPercentOfSpend,
      targetSavingsMonthlyUsd,
      remainingOpportunityMonthlyUsd,
      maxMonthlySavingsUsd,
      recommendation:
        maxMonthlySavingsUsd > 0
          ? `${provider.providerId} can move from $${formatNumber(
              zeroCommitmentMonthlyUsd,
            )}/mo at 0% commitment coverage to $${formatNumber(
              fullyCommittedMonthlyUsd,
            )}/mo at 100%; target blend is $${formatNumber(targetBlendMonthlyUsd)}/mo.`
          : `${provider.providerId} has no modeled commitment discount for the current service mix.`,
    };
  });
}

function tcoSignals(
  providerDimensionAmounts: Array<{
    provider: ComparisonProviderResult;
    amounts: Map<AnalyticsDimension, ProviderDimensionAmount>;
  }>,
): TcoSignal[] {
  return providerDimensionAmounts.map(({ provider, amounts }) => {
    const egressLockInMonthlyUsd = amounts.get('egress')?.monthlyCostUsd ?? 0;
    const supportMonthlyUsd = amounts.get('support')?.monthlyCostUsd ?? 0;
    const licensingMonthlyUsd = amounts.get('licensing')?.monthlyCostUsd ?? 0;
    const freeTierApplicability =
      provider.totals.monthly <= 50 && egressLockInMonthlyUsd <= 5 ? 'possible' : 'unlikely';

    return {
      providerId: provider.providerId,
      egressLockInMonthlyUsd,
      supportMonthlyUsd,
      licensingMonthlyUsd,
      freeTierApplicability,
      note:
        egressLockInMonthlyUsd > 0
          ? `Modeled exit exposure starts with roughly $${formatNumber(
              egressLockInMonthlyUsd,
            )}/mo of outbound data-transfer cost.`
          : 'No material modeled egress lock-in signal in this comparison.',
    };
  });
}

function finOpsFindings(
  result: ComparisonResult,
  providerDimensionAmounts: Array<{
    provider: ComparisonProviderResult;
    amounts: Map<AnalyticsDimension, ProviderDimensionAmount>;
  }>,
): FinOpsFinding[] {
  const findings: FinOpsFinding[] = [];
  const providersByMonthly = [...result.providers].sort(
    (left, right) => left.totals.monthly - right.totals.monthly,
  );
  const lowest = providersByMonthly[0];
  const highest = providersByMonthly[providersByMonthly.length - 1];

  if (lowest && highest && lowest.providerId !== highest.providerId) {
    findings.push({
      id: 'provider-spread',
      severity: 'review',
      category: 'cost-driver',
      title: 'Provider spread is proposal-relevant',
      recommendation: `${lowest.providerId} is $${formatNumber(
        highest.totals.monthly - lowest.totals.monthly,
      )}/mo below ${highest.providerId}; validate service equivalence before positioning the spread as savings.`,
      estimatedMonthlyImpactUsd: roundCurrency(highest.totals.monthly - lowest.totals.monthly),
      providerId: lowest.providerId,
    });
  }

  for (const { provider, amounts } of providerDimensionAmounts) {
    const egressMonthlyUsd = amounts.get('egress')?.monthlyCostUsd ?? 0;
    const egressPercent = percent(egressMonthlyUsd, provider.totals.monthly);
    const approximateRows = provider.lineItems.filter((lineItem) => lineItem.isApproximate).length;
    const supportMonthlyUsd = amounts.get('support')?.monthlyCostUsd ?? 0;
    const licensingMonthlyUsd = amounts.get('licensing')?.monthlyCostUsd ?? 0;

    if (egressPercent >= 20) {
      findings.push({
        id: `${provider.providerId}-egress-driver`,
        severity: egressPercent >= 35 ? 'warning' : 'review',
        category: 'egress',
        title: `${provider.providerId} egress is a major cost driver`,
        recommendation:
          'Model CDN offload, same-region data access, NAT path reduction, and private connectivity before final commitment.',
        estimatedMonthlyImpactUsd: roundCurrency(egressMonthlyUsd * 0.2),
        providerId: provider.providerId,
      });
    }

    if (approximateRows > 0) {
      findings.push({
        id: `${provider.providerId}-mapping-review`,
        severity: 'review',
        category: 'mapping',
        title: `${provider.providerId} includes approximate mappings`,
        recommendation: `Review ${approximateRows} approximate line item(s) before using this estimate in a client proposal.`,
        providerId: provider.providerId,
      });
    }

    if (supportMonthlyUsd > 0) {
      findings.push({
        id: `${provider.providerId}-support-plan`,
        severity: 'info',
        category: 'support',
        title: `${provider.providerId} support plan is itemized`,
        recommendation:
          'Confirm the selected support tier matches incident response expectations and procurement policy.',
        estimatedMonthlyImpactUsd: supportMonthlyUsd,
        providerId: provider.providerId,
      });
    }

    if (licensingMonthlyUsd > 0) {
      findings.push({
        id: `${provider.providerId}-license-optimization`,
        severity: 'review',
        category: 'licensing',
        title: `${provider.providerId} licensing cost is visible`,
        recommendation:
          'Compare Linux, BYOL, and provider license-included options before locking the operating system assumption.',
        estimatedMonthlyImpactUsd: licensingMonthlyUsd,
        providerId: provider.providerId,
      });
    }
  }

  const utilizationPercent =
    result.requirements?.workloadProfile?.usagePattern?.averageUtilizationPercent;
  if (utilizationPercent !== undefined && utilizationPercent <= 30 && lowest) {
    const computeMonthlyUsd =
      providerDimensionAmounts
        .find(({ provider }) => provider.providerId === lowest.providerId)
        ?.amounts.get('compute')?.monthlyCostUsd ?? 0;

    if (computeMonthlyUsd > 0) {
      findings.push({
        id: 'low-utilization-right-sizing',
        severity: 'warning',
        category: 'right-sizing',
        title: 'Low utilization suggests right-sizing upside',
        recommendation: `Average utilization is ${utilizationPercent}%; model a smaller family or scheduled capacity before approving steady-state spend.`,
        estimatedMonthlyImpactUsd: roundCurrency(computeMonthlyUsd * 0.25),
        providerId: lowest.providerId,
      });
    }
  }

  const commitmentPreference =
    result.requirements?.workloadProfile?.commitmentPreferencePercent ?? 0;
  if (commitmentPreference >= 65) {
    for (const coverage of commitmentCoverage(result)) {
      if (coverage.coveredPercentOfSpend < 60 && coverage.maxMonthlySavingsUsd > 0) {
        findings.push({
          id: `${coverage.providerId}-commitment-gap`,
          severity: 'review',
          category: 'commitment',
          title: `${coverage.providerId} has a commitment coverage gap`,
          recommendation: `${formatNumber(
            coverage.coveredPercentOfSpend,
          )}% of spend is commitment-eligible in this model; review uncovered on-demand exposure.`,
          estimatedMonthlyImpactUsd: coverage.maxMonthlySavingsUsd,
          providerId: coverage.providerId,
        });
      }
    }
  }

  return findings;
}

function providerDimensionAmountsForProvider(
  provider: ComparisonProviderResult,
): Map<AnalyticsDimension, ProviderDimensionAmount> {
  const amounts = new Map<AnalyticsDimension, ProviderDimensionAmount>();

  for (const lineItem of provider.lineItems) {
    const dimension = dimensionForLineItem(lineItem);
    const current = amounts.get(dimension);
    const monthlyCostUsd = roundCurrency(
      (current?.monthlyCostUsd ?? 0) + lineItem.baseMonthlyCostUsd,
    );
    const topDriver =
      !current?.topDriver ||
      lineItem.baseMonthlyCostUsd > topLineMonthly(provider.lineItems, current.topDriver)
        ? lineItem.description
        : current.topDriver;

    amounts.set(dimension, {
      providerId: provider.providerId,
      monthlyCostUsd,
      topDriver,
    });
  }

  return amounts;
}

function dimensionForLineItem(lineItem: ComparisonLineItem): AnalyticsDimension {
  if (lineItem.category === 'network') {
    return lineItem.costComponent === 'egress' ? 'egress' : 'networking';
  }

  if (lineItem.category === 'compute') {
    return 'compute';
  }

  if (lineItem.category === 'storage') {
    return 'storage';
  }

  if (lineItem.category === 'database') {
    return 'database';
  }

  if (lineItem.category === 'support') {
    return 'support';
  }

  if (lineItem.category === 'licensing') {
    return 'licensing';
  }

  if (lineItem.category === 'operations') {
    return 'operations';
  }

  return 'other';
}

function lineItemCommitmentSavings(lineItem: ComparisonLineItem): number {
  const onDemand =
    lineItem.pricingModels?.find((model) => model.model === 'on-demand' && model.available)
      ?.monthlyCostUsd ?? lineItem.baseMonthlyCostUsd;
  const bestCommitted = lineItem.pricingModels
    ?.filter(
      (model) =>
        model.model !== 'on-demand' &&
        model.model !== 'spot' &&
        model.available &&
        model.monthlyCostUsd !== undefined,
    )
    .map((model) => model.monthlyCostUsd ?? onDemand)
    .sort((left, right) => left - right)[0];

  if (bestCommitted === undefined) {
    return 0;
  }

  return Math.max(0, onDemand - bestCommitted);
}

function defaultTermMonths(pricingModel: Exclude<PricingModelKey, 'on-demand' | 'spot'>): number {
  if (pricingModel === 'reserved-3yr') {
    return 36;
  }

  return 12;
}

function canonicalRegionForRegionPreference(regionPreference: string): string | undefined {
  const normalizedRegion = regionPreference.trim().toLowerCase();

  if (!normalizedRegion) {
    return undefined;
  }

  if (COMPARISON_REGION_IDS.some((regionId) => regionId === normalizedRegion)) {
    return normalizedRegion;
  }

  return Object.entries(COMPARISON_REGION_PROVIDER_REGIONS).find(([, providerRegions]) =>
    providerRegions.includes(normalizedRegion),
  )?.[0];
}

function canonicalRegionsForResidencyScope(scope: string): string[] | undefined {
  switch (normalizedResidencyScope(scope)) {
    case 'us':
      return ['us-east', 'us-west'];
    case 'eu':
      return ['eu-west'];
    case 'apac':
      return ['ap-south', 'ap-southeast'];
    default:
      return undefined;
  }
}

function normalizedResidencyScope(scope: string): 'us' | 'eu' | 'apac' | undefined {
  const normalizedScope = scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (!normalizedScope || normalizedScope === 'global' || normalizedScope === 'anywhere') {
    return undefined;
  }

  if (
    normalizedScope === 'us' ||
    normalizedScope === 'usa' ||
    normalizedScope === 'unitedstates' ||
    normalizedScope === 'america'
  ) {
    return 'us';
  }

  if (
    normalizedScope === 'eu' ||
    normalizedScope === 'europe' ||
    normalizedScope === 'europeanunion' ||
    normalizedScope === 'eea' ||
    normalizedScope === 'gdpr'
  ) {
    return 'eu';
  }

  if (
    normalizedScope === 'apac' ||
    normalizedScope === 'asia' ||
    normalizedScope === 'asiapacific'
  ) {
    return 'apac';
  }

  return undefined;
}

function providerSortIndex(providerId: ProviderId): number {
  const index = PROVIDER_SORT_ORDER.indexOf(providerId);

  return index === -1 ? PROVIDER_SORT_ORDER.length : index;
}

function providerLabel(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
  }
}

function comparisonRegionLabel(comparisonRegion: string): string {
  switch (comparisonRegion) {
    case 'us-east':
      return 'US East';
    case 'us-west':
      return 'US West';
    case 'eu-west':
      return 'Europe West';
    case 'ap-southeast':
      return 'Asia Pacific Southeast';
    case 'ap-south':
      return 'Asia Pacific South';
    default:
      return comparisonRegion;
  }
}

function topLineMonthly(lineItems: ComparisonLineItem[], description: string): number {
  return (
    lineItems.find((lineItem) => lineItem.description === description)?.baseMonthlyCostUsd ?? 0
  );
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return roundCurrency((numerator / denominator) * 100);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatNumber(value: number): string {
  return roundCurrency(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}
