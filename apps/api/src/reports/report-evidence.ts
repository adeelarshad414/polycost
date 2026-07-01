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

const REGION_VARIANCE_PROFILES = [
  {
    region: 'us-east',
    multiplier: 1,
    evidence: 'Baseline North America pricing sensitivity.',
  },
  {
    region: 'us-west',
    multiplier: 1.03,
    evidence: 'Modeled 3% regional premium for west-coast capacity sensitivity.',
  },
  {
    region: 'eu-west',
    multiplier: 1.08,
    evidence: 'Modeled 8% regional premium for EU residency/compliance sensitivity.',
  },
  {
    region: 'ap-southeast',
    multiplier: 1.12,
    evidence: 'Modeled 12% regional premium for APAC latency/residency sensitivity.',
  },
  {
    region: 'ap-south',
    multiplier: 0.96,
    evidence: 'Modeled 4% discount sensitivity for lower-cost APAC alternatives.',
  },
] as const;

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

  const workloadProfile = requirements.workloadProfile;
  const dataResidency = workloadProfile?.dataResidency;
  const usagePattern = workloadProfile?.usagePattern;
  const costAllocationTags =
    workloadProfile?.tags?.map((tag) => `${tag.key}:${tag.value}`).join(', ') ?? 'None supplied';

  return [
    ['Field', 'Value'],
    ['Workload name', requirements.workloadName ?? 'Unnamed workload'],
    ['Workload type', requirements.workloadType],
    ['Input source', requirements.sourceType],
    ['Region preference', requirements.regionPreference ?? 'Not specified'],
    ['Environment', workloadProfile?.environment ?? 'Not specified'],
    ['Operating system / license', workloadProfile?.operatingSystem ?? 'Not specified'],
    ['Support tier', workloadProfile?.supportTier ?? 'Not specified'],
    [
      'Commitment preference',
      workloadProfile?.commitmentPreferencePercent !== undefined
        ? `${workloadProfile.commitmentPreferencePercent}%`
        : 'Not specified',
    ],
    [
      'Usage pattern',
      usagePattern
        ? usagePattern.type === 'bursty'
          ? `bursty (${usagePattern.averageUtilizationPercent ?? 'unknown'}% average utilization)`
          : usagePattern.type === 'scheduled'
            ? `scheduled (${usagePattern.hoursPerDay ?? '?'} hrs/day, ${usagePattern.daysPerWeek ?? '?'} days/week)`
            : 'always on'
        : 'Not specified',
    ],
    [
      'Data residency',
      dataResidency
        ? `${dataResidency.scope}${dataResidency.complianceLocked ? ' (locked)' : ''}`
        : 'Not specified',
    ],
    ['Cost allocation tags', costAllocationTags],
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
      'Upfront cash USD',
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
        const upfront = model.available ? model.upfrontCostUsd : undefined;
        const termTco =
          monthly !== undefined && termMonths !== undefined
            ? monthly * termMonths + (upfront ?? 0)
            : undefined;

        return [
          provider.providerId,
          labelForPricingModel(pricingModel),
          model.available ? 'yes' : 'no',
          hourly !== undefined ? formatNumber(hourly) : '',
          monthly !== undefined ? formatNumber(monthly) : '',
          upfront !== undefined ? formatNumber(upfront) : '',
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
      'All values are USD estimates; taxes, credits, and private enterprise discounts are excluded unless present in the pricing catalog or modeled as explicit line items.',
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
      'Production-depth assumptions',
      'Support plans, Windows licensing, scheduled/bursty utilization, and resilience premiums appear as modeled line items when provided in the workload profile.',
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

export function optimizationOpportunityRows(result: ComparisonResult): string[][] {
  const rows: string[][] = [];
  const rankedOnDemand = rankedProviderScenarios(result, {
    interval: 'monthly',
    pricingModel: 'on-demand',
  }).filter((scenario) => scenario.available && scenario.monthlyCostUsd !== undefined);
  const cheapest = rankedOnDemand.find((scenario) => scenario.rank === 1);
  const highest = rankedOnDemand.at(-1);

  if (
    cheapest?.monthlyCostUsd !== undefined &&
    highest?.monthlyCostUsd !== undefined &&
    highest.providerId !== cheapest.providerId
  ) {
    const monthlySavings = highest.monthlyCostUsd - cheapest.monthlyCostUsd;
    rows.push([
      'Provider selection',
      `Shortlist ${cheapest.providerId} before committing to ${highest.providerId}.`,
      formatNumber(monthlySavings),
      formatNumber(monthlySavings * 12),
      'High',
      'Medium',
      `Provider delta from current cached comparison: ${highest.providerId} $${formatNumber(
        highest.monthlyCostUsd,
      )}/mo vs ${cheapest.providerId} $${formatNumber(cheapest.monthlyCostUsd)}/mo.`,
    ]);
  }

  for (const provider of result.providers) {
    const onDemand = modelCostForProvider(provider, 'on-demand');
    const targetCoveragePercent = commitmentPreferencePercent(result);
    const targetCoverageRate = targetCoveragePercent / 100;
    const bestCommitment = ['reserved-3yr', 'reserved-1yr', 'savings-plan']
      .map((pricingModel) => modelCostForProvider(provider, pricingModel as ReportPricingModel))
      .filter(
        (model) =>
          model.available &&
          model.monthlyCostUsd !== undefined &&
          onDemand.monthlyCostUsd !== undefined &&
          model.monthlyCostUsd < onDemand.monthlyCostUsd,
      )
      .sort((left, right) => (left.monthlyCostUsd ?? 0) - (right.monthlyCostUsd ?? 0))[0];

    if (bestCommitment?.monthlyCostUsd !== undefined && onDemand.monthlyCostUsd !== undefined) {
      const monthlySavings = onDemand.monthlyCostUsd - bestCommitment.monthlyCostUsd;
      const targetBlendMonthly =
        onDemand.monthlyCostUsd * (1 - targetCoverageRate) +
        bestCommitment.monthlyCostUsd * targetCoverageRate;
      const openGapMonthly = Math.max(0, targetBlendMonthly - bestCommitment.monthlyCostUsd);
      const remainingOpportunity = roundCurrency(openGapMonthly);

      if (remainingOpportunity <= 0) {
        continue;
      }

      rows.push([
        'Commitment coverage',
        `${provider.providerId} ${labelForPricingModel(
          bestCommitment.model,
        )} lowers recurring run rate; ${formatNumber(
          100 - targetCoveragePercent,
        )}% remains exposed at the target coverage setting.`,
        formatNumber(remainingOpportunity),
        formatNumber(remainingOpportunity * 12),
        remainingOpportunity > 100 ? 'High' : 'Medium',
        bestCommitment.model === 'reserved-3yr' ? 'High' : 'Medium',
        `${provider.providerId} on-demand $${formatNumber(
          onDemand.monthlyCostUsd,
        )}/mo vs ${bestCommitment.model} $${formatNumber(
          bestCommitment.monthlyCostUsd,
        )}/mo; ${formatNumber(targetCoveragePercent)}% target blend is $${formatNumber(
          targetBlendMonthly,
        )}/mo and 100% coverage would save $${formatNumber(monthlySavings)}/mo.`,
      ]);
    }
  }

  const usagePattern = result.requirements?.workloadProfile?.usagePattern;
  const averageUtilization =
    usagePattern?.type === 'bursty' ? usagePattern.averageUtilizationPercent : undefined;
  const rightSizingRate = rightSizingSavingsRate(averageUtilization);

  if (rightSizingRate > 0 && averageUtilization !== undefined) {
    for (const provider of result.providers) {
      const computeMonthly = componentMonthly(provider, 'compute');

      if (computeMonthly <= 0) {
        continue;
      }

      const monthlySavings = computeMonthly * rightSizingRate;

      rows.push([
        'Right-sizing',
        `${provider.providerId} compute averages ${formatNumber(
          averageUtilization,
        )}% utilization; evaluate smaller instance sizes, autoscaling bounds, or scheduled capacity before committing.`,
        formatNumber(monthlySavings),
        formatNumber(monthlySavings * 12),
        monthlySavings > 100 ? 'High' : 'Medium',
        'Medium',
        `Rule-based ${formatNumber(
          rightSizingRate * 100,
        )}% compute-spend opportunity from $${formatNumber(computeMonthly)}/mo compute baseline.`,
      ]);
    }
  }

  rows.push(...architectureRiskOpportunityRows(result));

  for (const provider of result.providers) {
    const egressMonthly = componentMonthly(provider, 'egress');
    const providerMonthly = provider.totals.monthly;

    if (providerMonthly > 0 && egressMonthly / providerMonthly >= 0.2) {
      const estimatedSavings = egressMonthly * 0.3;
      rows.push([
        'Egress optimization',
        `${provider.providerId} egress is ${formatNumber(
          (egressMonthly / providerMonthly) * 100,
        )}% of monthly spend; evaluate CDN offload and same-region data access.`,
        formatNumber(estimatedSavings),
        formatNumber(estimatedSavings * 12),
        'High',
        'Medium',
        `Rule-based 30% egress-reduction opportunity from $${formatNumber(egressMonthly)}/mo egress baseline.`,
      ]);
    }
  }

  for (const provider of result.providers) {
    const licensingMonthly = componentMonthly(provider, 'licensing');

    if (licensingMonthly > 0) {
      const linuxEquivalentMonthly = Math.max(0, provider.totals.monthly - licensingMonthly);
      const licensePath =
        provider.providerId === 'azure' ? 'Azure Hybrid Benefit/BYOL' : 'Linux equivalent or BYOL';

      rows.push([
        'License optimization',
        `${provider.providerId} includes Windows/licensing cost; validate ${licensePath} eligibility before committing.`,
        formatNumber(licensingMonthly),
        formatNumber(licensingMonthly * 12),
        'Medium',
        'Medium',
        `Windows run-rate $${formatNumber(
          provider.totals.monthly,
        )}/mo vs Linux/BYOL-equivalent $${formatNumber(
          linuxEquivalentMonthly,
        )}/mo; explicit licensing uplift is $${formatNumber(licensingMonthly)}/mo.`,
      ]);
    }
  }

  for (const provider of result.providers) {
    const approximateCount = provider.lineItems.filter((lineItem) => lineItem.isApproximate).length;

    if (approximateCount > 0) {
      rows.push([
        'Mapping validation',
        `${provider.providerId} has ${approximateCount} approximate mapped line item(s); review equivalence before proposal finalization.`,
        '',
        '',
        'Medium',
        'Low',
        'Approximate service mappings can change the recommended provider when SKUs are not truly equivalent.',
      ]);
    }
  }

  return [
    [
      'Opportunity',
      'Recommendation',
      'Estimated monthly savings USD',
      'Estimated annual savings USD',
      'Priority',
      'Effort',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [
          [
            'No material optimization opportunity detected',
            'Current comparison does not expose provider spread, commitment, egress, licensing, or mapping signals above thresholds.',
            '',
            '',
            'Low',
            'Low',
            'Continue validating SKU equivalence and private-discount assumptions.',
          ],
        ]),
  ];
}

export function egressNetworkingDetailRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) =>
    provider.lineItems
      .filter(
        (lineItem) =>
          lineItem.category === 'network' ||
          lineItem.costComponent === 'egress' ||
          networkDescription(lineItem.description),
      )
      .map((lineItem) => [
        provider.providerId,
        lineItem.costComponent ?? lineItem.category,
        lineItem.description,
        lineItem.region ?? '',
        formatNumber(lineItem.baseMonthlyCostUsd),
        provider.totals.monthly > 0
          ? `${formatNumber((lineItem.baseMonthlyCostUsd / provider.totals.monthly) * 100)}%`
          : '',
        lineItem.unit ?? '',
        lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
        lineItem.egressTiers?.length
          ? `${lineItem.egressTiers.length} tier(s): ${lineItem.egressTiers
              .map((tier) => `${tierBandLabel(tier.tierFromGb, tier.tierToGb)} @ $${formatNumber(tier.pricePerGb)}/GB`)
              .join('; ')}`
          : `${lineItem.pricingBasis ?? 'flat'} network cost evidence`,
      ]),
  );

  return [
    [
      'Provider',
      'Network component',
      'Description',
      'Region',
      'Monthly USD',
      'Share of provider total',
      'Unit',
      'Rate USD',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No networking or egress line items were attached to this comparison.', '', '', '', '', '', '', '', '']]),
  ];
}

export function regionComparisonRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) =>
    REGION_VARIANCE_PROFILES.map((profile) => {
      const modeledMonthly = roundCurrency(provider.totals.monthly * profile.multiplier);
      const delta = roundCurrency(modeledMonthly - provider.totals.monthly);

      return [
        provider.providerId,
        profile.region,
        providerRegionLabel(provider.providerId, profile.region),
        formatNumber(modeledMonthly),
        formatNumber(delta),
        formatNumber(profile.multiplier),
        profile.evidence,
      ];
    }),
  );

  return [
    [
      'Provider',
      'Comparison region',
      'Provider region',
      'Modeled monthly USD',
      'Delta vs selected region USD',
      'Multiplier',
      'Evidence',
    ],
    ...rows,
  ];
}

export function breakEvenSummaryRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) => {
    const onDemand = modelCostForProvider(provider, 'on-demand');

    if (onDemand.monthlyCostUsd === undefined) {
      return [];
    }

    const onDemandMonthly = onDemand.monthlyCostUsd;

    return ['reserved-1yr', 'reserved-3yr', 'savings-plan'].flatMap((pricingModel) => {
      const model = modelCostForProvider(provider, pricingModel as ReportPricingModel);

      if (!model.available || model.monthlyCostUsd === undefined) {
        return [];
      }

      const monthlySavings = onDemandMonthly - model.monthlyCostUsd;
      const upfront = model.upfrontCostUsd ?? 0;
      const breakEvenMonth =
        monthlySavings > 0 ? Math.max(0, Math.ceil(upfront / monthlySavings)) : undefined;

      return [
        [
          provider.providerId,
          labelForPricingModel(model.model),
          formatNumber(onDemandMonthly),
          formatNumber(model.monthlyCostUsd),
          formatNumber(upfront),
          monthlySavings > 0 ? formatNumber(monthlySavings) : '',
          breakEvenMonth !== undefined ? breakEvenMonth.toString() : 'No break-even',
          model.caveat ?? commitmentEvidence(model),
        ],
      ];
    });
  });

  return [
    [
      'Provider',
      'Pricing model',
      'On-demand monthly USD',
      'Committed monthly USD',
      'Upfront USD',
      'Monthly savings USD',
      'Break-even month',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No commitment model has enough pricing evidence for break-even analysis.', '', '', '', '', '', '', '']]),
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
    model.upfrontCostUsd !== undefined ? `upfront $${formatNumber(model.upfrontCostUsd)}` : undefined,
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

function componentMonthly(
  provider: ComparisonProviderResult,
  component: NonNullable<ComparisonLineItem['costComponent']>,
): number {
  return provider.lineItems
    .filter((lineItem) => (lineItem.costComponent ?? costComponentForCategory(lineItem.category)) === component)
    .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
}

function rightSizingSavingsRate(averageUtilizationPercent?: number): number {
  if (averageUtilizationPercent === undefined) {
    return 0;
  }

  if (averageUtilizationPercent <= 25) {
    return 0.35;
  }

  if (averageUtilizationPercent <= 40) {
    return 0.25;
  }

  if (averageUtilizationPercent <= 55) {
    return 0.15;
  }

  return 0;
}

function architectureRiskOpportunityRows(result: ComparisonResult): string[][] {
  const rows: string[][] = [];

  for (const provider of result.providers) {
    const egressMonthly = componentMonthly(provider, 'egress');
    const providerMonthly = provider.totals.monthly;

    if (providerMonthly > 0 && egressMonthly / providerMonthly >= 0.35) {
      rows.push([
        'Architecture risk',
        `${provider.providerId} data-transfer line items are ${formatNumber(
          (egressMonthly / providerMonthly) * 100,
        )}% of monthly spend; validate CDN, NAT, cross-AZ, and inter-region paths before sign-off.`,
        '',
        '',
        'High',
        'Medium',
        `Egress/networking risk from cached line items: $${formatNumber(
          egressMonthly,
        )}/mo of $${formatNumber(providerMonthly)}/mo.`,
      ]);
    }
  }

  for (const requirement of result.requirements?.serviceRequirements ?? []) {
    const scaleParams = requirement.scaleParams ?? {};

    if (requirement.serviceCategory === 'database') {
      const engine = String(scaleParams.engine ?? requirement.serviceType).toLowerCase();
      const ruPerSecond = numericScaleParam(scaleParams, 'ruPerSecond');
      const readUnits = numericScaleParam(scaleParams, 'nosqlReadRequestUnitsMillion');
      const writeUnits = numericScaleParam(scaleParams, 'nosqlWriteRequestUnitsMillion');
      const storageGrowthGb = numericScaleParam(scaleParams, 'storageGrowthGbPerMonth');
      const sizeGb = numericScaleParam(scaleParams, 'sizeGb');
      const replicaTransferGb = numericScaleParam(scaleParams, 'crossRegionReplicaTransferGb');
      const isNoSql =
        engine.includes('nosql') ||
        engine.includes('mongo') ||
        engine.includes('dynamo') ||
        engine.includes('cosmos') ||
        ruPerSecond > 0 ||
        readUnits + writeUnits > 0;

      if (isNoSql) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} uses NoSQL/RU-style throughput; validate provisioned vs on-demand break-even before production traffic.`,
          '',
          '',
          ruPerSecond >= 4000 || readUnits + writeUnits >= 100 ? 'High' : 'Medium',
          'Medium',
          `Requirement evidence: engine ${engine}, ${formatNumber(
            ruPerSecond,
          )} RU/s, ${formatNumber(readUnits + writeUnits)}M request units/month.`,
        ]);
      }

      if (sizeGb > 0 && storageGrowthGb > 0 && (storageGrowthGb * 12) / sizeGb >= 0.5) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} database storage may grow ${formatNumber(
            (storageGrowthGb * 12 * 100) / sizeGb,
          )}% annually; validate autoscaling, backup retention, and IOPS implications.`,
          '',
          '',
          (storageGrowthGb * 12) / sizeGb >= 1 ? 'High' : 'Medium',
          'Medium',
          `Requirement evidence: ${formatNumber(sizeGb)}GB current size and ${formatNumber(
            storageGrowthGb,
          )}GB/month growth.`,
        ]);
      }

      if (replicaTransferGb > 0) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} includes ${formatNumber(
            replicaTransferGb,
          )}GB/month cross-region replica transfer; validate DR topology and data-transfer rates.`,
          '',
          '',
          replicaTransferGb >= 500 ? 'High' : 'Medium',
          'Medium',
          'Cross-region read replicas can create recurring data-transfer and storage duplication costs.',
        ]);
      }
    }

    if (
      requirement.serviceCategory === 'storage' &&
      String(scaleParams.replication ?? '').toLowerCase() === 'cross-region'
    ) {
      rows.push([
        'Architecture risk',
        `${requirement.serviceType} uses cross-region replication; validate replication transfer and minimum-duration storage charges.`,
        '',
        '',
        'Medium',
        'Medium',
        'Cross-region object/block/file replication can multiply storage and data-transfer spend.',
      ]);
    }
  }

  return rows;
}

function commitmentPreferencePercent(result: ComparisonResult): number {
  const percent = result.requirements?.workloadProfile?.commitmentPreferencePercent;

  if (percent === undefined || !Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(percent)));
}

function numericScaleParam(params: Record<string, string | number | boolean>, key: string): number {
  const value = params[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function costComponentForCategory(
  category: ComparisonLineItem['category'],
): NonNullable<ComparisonLineItem['costComponent']> {
  return category === 'network' ? 'egress' : category;
}

function networkDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'egress',
    'load balancer',
    'nat',
    'cdn',
    'vpn',
    'direct connect',
    'interconnect',
    'dns',
    'cross-az',
    'inter-region',
  ].some((needle) => normalized.includes(needle));
}

function providerRegionLabel(providerId: string, comparisonRegion: string): string {
  const regionMap: Record<string, Record<string, string>> = {
    aws: {
      'us-east': 'us-east-1',
      'us-west': 'us-west-2',
      'eu-west': 'eu-west-1',
      'ap-southeast': 'ap-southeast-1',
      'ap-south': 'ap-south-1',
    },
    azure: {
      'us-east': 'eastus',
      'us-west': 'westus2',
      'eu-west': 'westeurope',
      'ap-southeast': 'southeastasia',
      'ap-south': 'centralindia',
    },
    gcp: {
      'us-east': 'us-east1',
      'us-west': 'us-west1',
      'eu-west': 'europe-west1',
      'ap-southeast': 'asia-southeast1',
      'ap-south': 'asia-south1',
    },
  };

  return regionMap[providerId]?.[comparisonRegion] ?? comparisonRegion;
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
