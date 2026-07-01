import { PricingModelCost } from '../adapters/common/cloud-provider-adapter';
import { ComparisonLineItem, ComparisonResult } from '../comparison/comparison.types';
import { ReportInterval, ReportOptions, ReportPricingModel } from './report.types';

export function reportContextRows(options: ReportOptions): string[][] {
  return [
    ['Selected interval', labelForInterval(options.interval ?? 'monthly')],
    ['Selected pricing model', labelForPricingModel(options.pricingModel ?? 'on-demand')],
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

function formatNumber(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toString();
}
