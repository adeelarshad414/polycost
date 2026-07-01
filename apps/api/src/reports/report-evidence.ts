import { PricingModelCost } from '../adapters/common/cloud-provider-adapter';
import {
  ComparisonLineItem,
  ComparisonProviderResult,
  ComparisonResult,
} from '../comparison/comparison.types';
import { ReportInterval, ReportOptions, ReportPricingModel } from './report.types';

const REPORT_PRICING_MODELS: ReportPricingModel[] = [
  'on-demand',
  'reserved-1yr',
  'reserved-3yr',
  'savings-plan',
  'spot',
];

interface ProviderScenario {
  providerId: string;
  available: boolean;
  intervalCostUsd?: number;
  monthlyCostUsd?: number;
  yearlyCostUsd?: number;
  caveat: string;
  approximateLineItemCount: number;
}

interface RankedProviderScenario extends ProviderScenario {
  rank?: number;
  deltaVsLowestMonthlyUsd?: number;
  annualAvoidableSpendUsd?: number;
}

export function reportContextRows(options: ReportOptions): string[][] {
  return [
    ['Selected interval', labelForInterval(options.interval ?? 'monthly')],
    ['Selected pricing model', labelForPricingModel(options.pricingModel ?? 'on-demand')],
  ];
}

export function workloadScopeRows(result: ComparisonResult): string[][] {
  const requirements = result.requirements;

  if (!requirements) {
    return [
      ['Field', 'Value'],
      ['Workload scope', 'No normalized workload summary was attached to this comparison.'],
    ];
  }

  return [
    ['Field', 'Value'],
    ['Workload name', requirements.workloadName ?? 'Unnamed workload'],
    ['Workload type', requirements.workloadType],
    ['Input source', requirements.sourceType],
    ['Region preference', requirements.regionPreference ?? 'Not specified'],
    ['Normalized service requirements', requirements.serviceRequirements.length.toString()],
  ];
}

export function decisionSummaryRows(
  result: ComparisonResult,
  options: ReportOptions,
): string[][] {
  const interval = options.interval ?? 'monthly';
  const pricingModel = options.pricingModel ?? 'on-demand';
  const rankedScenarios = rankedProviderScenarios(result, options);
  const best = rankedScenarios.find((scenario) => scenario.rank === 1);
  const eligible = rankedScenarios.filter((scenario) => scenario.rank !== undefined);
  const highest = eligible.at(-1);
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );
  const warningCount = result.warnings?.length ?? 0;

  return [
    ['Signal', 'Detail'],
    [
      'Cost baseline',
      best
        ? `${best.providerId} ranks #1 for ${labelForPricingModel(pricingModel)} at $${formatNumber(
            best.intervalCostUsd ?? 0,
          )} ${labelForInterval(interval).toLowerCase()} / $${formatNumber(
            best.monthlyCostUsd ?? 0,
          )} monthly.`
        : `No provider is eligible for the selected ${labelForPricingModel(pricingModel)} scenario.`,
    ],
    ['Selected scenario', `${labelForPricingModel(pricingModel)} viewed at ${labelForInterval(interval)} cadence.`],
    [
      'Savings spread',
      best && highest && highest.providerId !== best.providerId
        ? `$${formatNumber(
            (highest.monthlyCostUsd ?? 0) - (best.monthlyCostUsd ?? 0),
          )} monthly / $${formatNumber(
            (highest.yearlyCostUsd ?? 0) - (best.yearlyCostUsd ?? 0),
          )} annual separates the highest and lowest eligible provider.`
        : 'Not enough eligible providers to calculate a provider-to-provider spread.',
    ],
    ['Evidence confidence', evidenceConfidence(result.providers.length, approximateLineItems, warningCount)],
    [
      'Architecture validation',
      best
        ? `${best.providerId} still needs regional SKU, quota, resilience, data-transfer path, and service-equivalence validation before target-cloud commitment.`
        : 'Validate pricing model availability before this scenario is used for target-cloud commitment.',
    ],
  ];
}

export function providerRankingRows(
  result: ComparisonResult,
  options: ReportOptions,
): string[][] {
  const interval = options.interval ?? 'monthly';

  return [
    [
      'Provider',
      'Rank',
      'Selected model eligible',
      `${labelForInterval(interval)} USD`,
      'Monthly USD',
      'Yearly USD',
      'Delta vs lowest monthly USD',
      'Annual avoidable spend USD',
      'Approximate line items',
      'Evidence note',
    ],
    ...rankedProviderScenarios(result, options).map((scenario) => [
      scenario.providerId,
      scenario.rank !== undefined ? `#${scenario.rank}` : 'Not eligible',
      scenario.available ? 'yes' : 'no',
      scenario.intervalCostUsd !== undefined ? formatNumber(scenario.intervalCostUsd) : '',
      scenario.monthlyCostUsd !== undefined ? formatNumber(scenario.monthlyCostUsd) : '',
      scenario.yearlyCostUsd !== undefined ? formatNumber(scenario.yearlyCostUsd) : '',
      scenario.deltaVsLowestMonthlyUsd !== undefined
        ? formatNumber(scenario.deltaVsLowestMonthlyUsd)
        : '',
      scenario.annualAvoidableSpendUsd !== undefined
        ? formatNumber(scenario.annualAvoidableSpendUsd)
        : '',
      scenario.approximateLineItemCount.toString(),
      scenario.caveat,
    ]),
  ];
}

export function pricingModelAvailabilityRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      ...REPORT_PRICING_MODELS.map((pricingModel) => labelForPricingModel(pricingModel)),
      'Evidence note',
    ],
    ...result.providers.map((provider) => [
      provider.providerId,
      ...REPORT_PRICING_MODELS.map((pricingModel) => pricingModelStatus(provider, pricingModel)),
      providerAvailabilityNote(provider),
    ]),
  ];
}

export function commitmentTcoRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      'Pricing model',
      'Available',
      'Effective hourly USD',
      'Monthly recurring USD',
      'Payment option',
      'Term',
      'Term TCO USD',
      'Savings vs on-demand',
      'Evidence',
    ],
    ...result.providers.flatMap((provider) =>
      REPORT_PRICING_MODELS.map((pricingModel) => {
        const model = modelCostForProvider(provider, pricingModel);
        const termMonths = termMonthsForModel(model, pricingModel);
        const monthly = model.available ? model.monthlyCostUsd : undefined;
        const hourly =
          model.available && monthly !== undefined ? (model.hourlyCostUsd ?? monthly / 730) : undefined;
        const termTco = monthly !== undefined && termMonths !== undefined ? monthly * termMonths : undefined;

        return [
          provider.providerId,
          labelForPricingModel(pricingModel),
          model.available ? 'yes' : 'no',
          hourly !== undefined ? formatNumber(hourly) : '',
          monthly !== undefined ? formatNumber(monthly) : '',
          paymentOptionEvidence(model),
          termMonths !== undefined ? `${termMonths} months` : termEvidence(pricingModel),
          termTco !== undefined ? formatNumber(termTco) : '',
          model.savingsPercentVsOnDemand !== undefined
            ? `${formatNumber(model.savingsPercentVsOnDemand)}%`
            : '',
          commitmentEvidence(model),
        ];
      }),
    ),
  ];
}

export function egressTierBreakdownRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) =>
    provider.lineItems
      .filter((lineItem) => lineItem.costComponent === 'egress' || lineItem.category === 'network')
      .flatMap((lineItem) => {
        const tiers = lineItem.egressTiers ?? [];

        if (tiers.length > 0) {
          const totalBillableGb = tiers.reduce((sum, tier) => sum + tier.billableGb, 0);
          const effectiveRate =
            totalBillableGb > 0 ? lineItem.baseMonthlyCostUsd / totalBillableGb : undefined;

          return tiers.map((tier) => [
            provider.providerId,
            lineItem.region ?? '',
            tierBandLabel(tier.tierFromGb, tier.tierToGb),
            formatNumber(tier.billableGb),
            formatNumber(tier.pricePerGb),
            formatNumber(tier.monthlyCostUsd),
            effectiveRate !== undefined ? formatNumber(effectiveRate) : '',
            `${lineItem.pricingBasis ?? 'tiered'} catalog tier: ${lineItem.description}`,
          ]);
        }

        if (lineItem.baseMonthlyCostUsd <= 0) {
          return [];
        }

        return [
          [
            provider.providerId,
            lineItem.region ?? '',
            lineItem.pricingBasis === 'tiered' ? 'Tier subtotal' : 'Flat / blended',
            '',
            lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
            formatNumber(lineItem.baseMonthlyCostUsd),
            '',
            `${lineItem.pricingBasis ?? 'flat'} egress line item without tier trace rows: ${lineItem.description}`,
          ],
        ];
      }),
  );

  return [
    [
      'Provider',
      'Region',
      'Tier band',
      'Billable GB',
      'Rate per GB USD',
      'Tier subtotal USD',
      'Effective blended USD/GB',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No egress tier rows were attached to this comparison.', '', '', '', '', '', '', '']]),
  ];
}

export function reportAssumptionRows(result: ComparisonResult): string[][] {
  const warningCount = result.warnings?.length ?? 0;
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );

  return [
    ['Assumption', 'How to read it'],
    [
      'Currency',
      'All values are USD estimates; taxes, support plans, credits, and private enterprise discounts are excluded unless present in the pricing catalog.',
    ],
    [
      'Time normalization',
      'Monthly cost uses 730 hours. Quarterly and yearly figures are arithmetic projections from the selected monthly run rate.',
    ],
    [
      'Pricing source',
      warningCount > 0
        ? `Cached provider catalog rates with ${warningCount} warning(s) captured in this export.`
        : 'Cached provider catalog rates; live refresh results are reflected only when the comparison was refreshed successfully.',
    ],
    [
      'Commitment scenarios',
      'Reserved, Savings Plan/CUD, and Spot scenarios are ranked only when provider evidence is available. Non-compute line items remain on-demand in commitment views.',
    ],
    [
      'Approximate mappings',
      approximateLineItems > 0
        ? `${approximateLineItems} line item(s) are approximate and should be reviewed by a solution architect before commitment.`
        : 'No approximate line items were flagged by the service-equivalence mapper.',
    ],
    [
      'Decision use',
      'This report is designed for directional, decision-grade comparison, not invoice reconciliation to the cent.',
    ],
  ];
}

export function serviceRequirementRows(result: ComparisonResult): string[][] {
  const requirements = result.requirements?.serviceRequirements ?? [];

  if (requirements.length === 0) {
    return [['No normalized service requirements were attached to this comparison.']];
  }

  return [
    ['Category', 'Service type', 'Instance/tier', 'Region', 'AZ', 'Quantity', 'Scale parameters'],
    ...requirements.map((requirement) => [
      requirement.serviceCategory,
      requirement.serviceType,
      [requirement.instanceType, requirement.tier].filter(Boolean).join(' / '),
      requirement.region ?? '',
      requirement.az ?? '',
      requirement.quantity.toString(),
      requirement.scaleParams ? scaleParamsText(requirement.scaleParams) : '',
    ]),
  ];
}

export function selectedScenarioRows(result: ComparisonResult, options: ReportOptions): string[][] {
  const pricingModel = options.pricingModel ?? 'on-demand';
  const interval = options.interval ?? 'monthly';

  return [
    ['Provider', 'Available', `${labelForInterval(interval)} USD`, 'Monthly USD', 'Hourly USD', 'Caveat'],
    ...result.providers.map((provider) => {
      const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);
      const monthly = selectedMonthlyCost(model, provider.totals.monthly);
      const available = pricingModel === 'on-demand' || model?.available === true;

      return [
        provider.providerId,
        available ? 'yes' : 'no',
        available ? formatNumber(costForInterval(monthly, interval)) : '',
        available ? formatNumber(monthly) : '',
        available ? formatNumber(model?.hourlyCostUsd ?? monthly / 730) : '',
        scenarioCaveat(pricingModel, model),
      ];
    }),
  ];
}

export function lineItemEvidenceRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      'Category',
      'Description',
      'Region',
      'Unit',
      'Unit price USD',
      'Hourly USD',
      'Monthly USD',
      'Calculation',
      'Pricing model evidence',
    ],
    ...result.providers.flatMap((provider) =>
      provider.lineItems.map((lineItem) => [
        provider.providerId,
        lineItem.category,
        lineItem.description,
        lineItem.region ?? '',
        lineItem.unit ?? '',
        lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
        lineItem.baseHourlyCostUsd !== undefined ? formatNumber(lineItem.baseHourlyCostUsd) : '',
        formatNumber(lineItem.baseMonthlyCostUsd),
        calculationText(lineItem),
        pricingModelEvidence(lineItem),
      ]),
    ),
  ];
}

export function labelForInterval(interval: ReportInterval): string {
  switch (interval) {
    case 'hourly':
      return 'Hourly';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'yearly':
      return 'Yearly';
  }
}

export function labelForPricingModel(pricingModel: ReportPricingModel): string {
  switch (pricingModel) {
    case 'on-demand':
      return 'On-demand';
    case 'reserved-1yr':
      return 'Reserved 1-year';
    case 'reserved-3yr':
      return 'Reserved 3-year';
    case 'savings-plan':
      return 'Savings Plan / CUD';
    case 'spot':
      return 'Spot estimate range';
  }
}

function selectedMonthlyCost(model: PricingModelCost | undefined, fallbackMonthly: number): number {
  return model?.available === true && model.monthlyCostUsd !== undefined
    ? model.monthlyCostUsd
    : fallbackMonthly;
}

function modelCostForProvider(
  provider: ComparisonProviderResult,
  pricingModel: ReportPricingModel,
): PricingModelCost {
  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

  if (model) {
    return model;
  }

  if (pricingModel === 'on-demand') {
    return {
      model: 'on-demand',
      available: true,
      monthlyCostUsd: provider.totals.monthly,
      hourlyCostUsd: provider.totals.hourly ?? provider.totals.monthly / 730,
      savingsPercentVsOnDemand: 0,
    };
  }

  return {
    model: pricingModel,
    available: false,
    unavailableReason: 'Not available for this configuration.',
  };
}

function termMonthsForModel(
  model: PricingModelCost,
  pricingModel: ReportPricingModel,
): number | undefined {
  if (model.commitmentTermMonths !== undefined) {
    return model.commitmentTermMonths;
  }

  if (pricingModel === 'reserved-1yr' || pricingModel === 'savings-plan') {
    return 12;
  }

  if (pricingModel === 'reserved-3yr') {
    return 36;
  }

  return undefined;
}

function paymentOptionEvidence(model: PricingModelCost): string {
  if (!model.available) {
    return 'N/A';
  }

  if (model.upfrontOption === 'all') {
    return 'All upfront';
  }

  if (model.upfrontOption === 'partial') {
    return 'Partial upfront';
  }

  if (model.upfrontOption === 'none') {
    return 'No upfront';
  }

  if (
    model.model === 'reserved-1yr' ||
    model.model === 'reserved-3yr' ||
    model.model === 'savings-plan'
  ) {
    return 'Provider default / not published';
  }

  return 'No commitment';
}

function termEvidence(pricingModel: ReportPricingModel): string {
  if (pricingModel === 'spot') {
    return 'Interruptible';
  }

  return 'No fixed term';
}

function commitmentEvidence(model: PricingModelCost): string {
  if (!model.available) {
    return model.unavailableReason ?? 'Not available for this configuration.';
  }

  return [
    model.providerTerm ?? model.displayName ?? labelForPricingModel(model.model),
    model.estimated ? 'estimate' : undefined,
    model.volatility === 'volatile' ? 'volatile' : undefined,
    model.caveat,
  ]
    .filter(Boolean)
    .join(' · ');
}

function rankedProviderScenarios(
  result: ComparisonResult,
  options: ReportOptions,
): RankedProviderScenario[] {
  const scenarios = result.providers.map((provider) => providerScenario(provider, options));
  const eligible = scenarios
    .filter(
      (scenario): scenario is ProviderScenario & Required<Pick<ProviderScenario, 'monthlyCostUsd'>> =>
        scenario.available && scenario.monthlyCostUsd !== undefined,
    )
    .sort((left, right) => left.monthlyCostUsd - right.monthlyCostUsd);
  const lowestMonthly = eligible[0]?.monthlyCostUsd;
  const rankByProvider = new Map(
    eligible.map((scenario, index) => [scenario.providerId, index + 1]),
  );

  return [...eligible, ...scenarios.filter((scenario) => !scenario.available)].map(
    (scenario) => {
      const rank = rankByProvider.get(scenario.providerId);
      const deltaVsLowestMonthlyUsd =
        lowestMonthly !== undefined && scenario.monthlyCostUsd !== undefined
          ? roundCurrency(scenario.monthlyCostUsd - lowestMonthly)
          : undefined;

      return {
        ...scenario,
        ...(rank !== undefined ? { rank } : {}),
        ...(deltaVsLowestMonthlyUsd !== undefined
          ? {
              deltaVsLowestMonthlyUsd,
              annualAvoidableSpendUsd: roundCurrency(deltaVsLowestMonthlyUsd * 12),
            }
          : {}),
      };
    },
  );
}

function providerScenario(
  provider: ComparisonProviderResult,
  options: ReportOptions,
): ProviderScenario {
  const pricingModel = options.pricingModel ?? 'on-demand';
  const interval = options.interval ?? 'monthly';
  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);
  const available = pricingModel === 'on-demand' || model?.available === true;
  const monthlyCostUsd = available ? selectedMonthlyCost(model, provider.totals.monthly) : undefined;

  return {
    providerId: provider.providerId,
    available,
    ...(monthlyCostUsd !== undefined
      ? {
          intervalCostUsd: costForInterval(monthlyCostUsd, interval),
          monthlyCostUsd,
          yearlyCostUsd: monthlyCostUsd * 12,
        }
      : {}),
    caveat: scenarioCaveat(pricingModel, model),
    approximateLineItemCount: provider.lineItems.filter((lineItem) => lineItem.isApproximate)
      .length,
  };
}

function evidenceConfidence(
  providerCount: number,
  approximateLineItems: number,
  warningCount: number,
): string {
  if (providerCount === 3 && approximateLineItems === 0 && warningCount === 0) {
    return 'High - all three providers priced with exact mappings and no export warnings.';
  }

  if (providerCount >= 2 && warningCount === 0) {
    return `Medium - ${providerCount}/3 providers priced with ${approximateLineItems} approximate mapping(s).`;
  }

  return `Review required - ${providerCount}/3 providers priced, ${approximateLineItems} approximate mapping(s), ${warningCount} warning(s).`;
}

function pricingModelStatus(
  provider: ComparisonProviderResult,
  pricingModel: ReportPricingModel,
): string {
  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

  if (!model) {
    return pricingModel === 'on-demand' ? 'available' : 'not modeled';
  }

  if (!model.available) {
    return `unavailable: ${model.unavailableReason ?? 'not offered for this configuration'}`;
  }

  const savings =
    model.savingsPercentVsOnDemand !== undefined
      ? `; ${formatNumber(model.savingsPercentVsOnDemand)}% vs on-demand`
      : '';

  return `available${savings}`;
}

function providerAvailabilityNote(provider: ComparisonProviderResult): string {
  if (!provider.pricingModels || provider.pricingModels.length === 0) {
    return 'Only on-demand totals are modeled for this provider.';
  }

  const unavailableModels =
    provider.pricingModels
      ?.filter((model) => !model.available)
      .map((model) => `${labelForPricingModel(model.model)}: ${model.unavailableReason ?? 'unavailable'}`) ??
    [];

  if (unavailableModels.length === 0) {
    return 'All modeled pricing scenarios are eligible for ranking.';
  }

  return unavailableModels.join('; ');
}

function scenarioCaveat(
  pricingModel: ReportPricingModel,
  model: PricingModelCost | undefined,
): string {
  if (pricingModel === 'on-demand') {
    return 'Baseline pay-as-you-go cached price.';
  }

  if (!model || model.available !== true) {
    return model?.unavailableReason ?? 'Not available for this SKU/region.';
  }

  if (pricingModel === 'spot') {
    return model.caveat ?? 'Spot is interruptible and shown as an estimate, not a guarantee.';
  }

  return model.caveat ?? 'Commitment scenario based on cached provider pricing terms.';
}

function calculationText(lineItem: ComparisonLineItem): string {
  if (lineItem.baseHourlyCostUsd !== undefined) {
    return `$${formatNumber(lineItem.baseHourlyCostUsd)} hourly x 730 hours = $${formatNumber(
      lineItem.baseMonthlyCostUsd,
    )} monthly`;
  }

  if (lineItem.unitPriceUsd !== undefined) {
    return `$${formatNumber(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'} rolled into $${formatNumber(
      lineItem.baseMonthlyCostUsd,
    )} monthly`;
  }

  return `Provider adapter monthly subtotal = $${formatNumber(lineItem.baseMonthlyCostUsd)}`;
}

function pricingModelEvidence(lineItem: ComparisonLineItem): string {
  if (!lineItem.pricingModels || lineItem.pricingModels.length === 0) {
    return 'On-demand only for this line item.';
  }

  return lineItem.pricingModels
    .map((model) =>
      model.available
        ? `${model.model}: $${formatNumber(model.monthlyCostUsd ?? 0)} monthly`
        : `${model.model}: unavailable (${model.unavailableReason ?? 'not offered'})`,
    )
    .join('; ');
}

function costForInterval(monthly: number, interval: ReportInterval): number {
  switch (interval) {
    case 'hourly':
      return monthly / 730;
    case 'daily':
      return (monthly / 730) * 24;
    case 'weekly':
      return (monthly / 730) * 168;
    case 'monthly':
      return monthly;
    case 'quarterly':
      return monthly * 3;
    case 'yearly':
      return monthly * 12;
  }
}

function scaleParamsText(scaleParams: Record<string, string | number | boolean>): string {
  return Object.entries(scaleParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function tierBandLabel(tierFromGb: number, tierToGb?: number): string {
  return tierToGb !== undefined
    ? `${formatNumber(tierFromGb)}-${formatNumber(tierToGb)} GB`
    : `${formatNumber(tierFromGb)}+ GB`;
}

function formatNumber(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toString();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
