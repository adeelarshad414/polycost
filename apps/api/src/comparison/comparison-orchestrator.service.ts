import { Inject, Injectable } from '@nestjs/common';
import {
  CloudProviderAdapter,
  CostComponent,
  PricingModelCost,
  PricingModelKey,
  ProviderId,
  ProviderPricingResult,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';
import { HOURS_PER_MONTH } from '../cost-time';
import { NormalizedWorkloadSpec, ServiceRequirement } from '../nws/nws.types';
import { NWSValidator } from '../nws/nws-validator';
import {
  COMPARISON_CLOCK,
  COMPARISON_ID_FACTORY,
  COMPARISON_PROVIDER_ADAPTERS,
  ComparisonClock,
  ComparisonIdFactory,
} from './comparison.tokens';
import {
  ComparisonLineItem,
  ComparisonCostBreakdown,
  ComparisonProviderResult,
  ComparisonResult,
  ComparisonWarning,
} from './comparison.types';
import { EquivalentServiceMapper } from './equivalent-service-mapper';
import { IntervalCostCalculator } from './interval-cost-calculator';

interface ProviderSuccess {
  result: ProviderPricingResult;
}

interface ProviderFailure {
  providerId: ProviderId;
  error: unknown;
}

export class ComparisonUnavailableError extends Error {
  constructor(readonly failures: ComparisonWarning[]) {
    super('No provider pricing results were available');
    this.name = 'ComparisonUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

@Injectable()
export class ComparisonOrchestratorService {
  constructor(
    @Inject(COMPARISON_PROVIDER_ADAPTERS)
    private readonly adapters: CloudProviderAdapter[],
    private readonly intervalCostCalculator: IntervalCostCalculator,
    private readonly equivalentServiceMapper: EquivalentServiceMapper,
    @Inject(COMPARISON_ID_FACTORY) private readonly idFactory: ComparisonIdFactory,
    @Inject(COMPARISON_CLOCK) private readonly clock: ComparisonClock,
  ) {}

  async compare(input: unknown): Promise<ComparisonResult> {
    const nws = NWSValidator.validate(input);
    const providerOutcomes = await Promise.all(
      this.adapters.map((adapter) => this.priceProvider(adapter, nws)),
    );

    const failures = providerOutcomes.filter(isProviderFailure);
    const providers = providerOutcomes
      .filter(isProviderSuccess)
      .map((success) => this.toComparisonProviderResult(nws, success.result));

    const warnings = failures.map((failure) => this.toWarning(failure));

    if (providers.length === 0) {
      throw new ComparisonUnavailableError(warnings);
    }

    return {
      comparisonId: this.idFactory(),
      pricingAsOf: this.clock().toISOString(),
      requirements: this.requirementSummary(nws),
      providers,
      cheapestProviderId: this.cheapestProvider(providers),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  private async priceProvider(
    adapter: CloudProviderAdapter,
    nws: NormalizedWorkloadSpec,
  ): Promise<ProviderSuccess | ProviderFailure> {
    try {
      return {
        result: await adapter.priceWorkload(nws),
      };
    } catch (error) {
      return {
        providerId: adapter.providerId,
        error,
      };
    }
  }

  private toComparisonProviderResult(
    nws: NormalizedWorkloadSpec,
    result: ProviderPricingResult,
  ): ComparisonProviderResult {
    const lineItems = result.lineItems.map((lineItem): ComparisonLineItem => {
      const annotatedLineItem = this.equivalentServiceMapper.annotateLineItem(
        nws,
        result.providerId,
        lineItem,
      );
      const costComponent =
        annotatedLineItem.costComponent ??
        this.costComponentForCategory(annotatedLineItem.category);

      return {
        category: annotatedLineItem.category,
        costComponent,
        description: annotatedLineItem.description,
        isApproximate: annotatedLineItem.isApproximate,
        baseHourlyCostUsd: this.roundCurrency(
          annotatedLineItem.baseHourlyCostUsd ??
            annotatedLineItem.baseMonthlyCostUsd / HOURS_PER_MONTH,
        ),
        baseMonthlyCostUsd: this.roundCurrency(annotatedLineItem.baseMonthlyCostUsd),
        skuId: annotatedLineItem.skuId,
        region: annotatedLineItem.region,
        unit: annotatedLineItem.unit,
        unitPriceUsd: annotatedLineItem.unitPriceUsd,
        pricingBasis: annotatedLineItem.pricingBasis ?? 'flat',
        ...(annotatedLineItem.pricingModels
          ? {
              pricingModels: annotatedLineItem.pricingModels.map((model) => ({
                ...model,
                ...(model.monthlyCostUsd !== undefined && model.hourlyCostUsd === undefined
                  ? { hourlyCostUsd: this.roundCurrency(model.monthlyCostUsd / HOURS_PER_MONTH) }
                  : {}),
                ...(model.hourlyCostUsd !== undefined
                  ? { hourlyCostUsd: this.roundCurrency(model.hourlyCostUsd) }
                  : {}),
                ...(model.monthlyCostUsd !== undefined
                  ? { monthlyCostUsd: this.roundCurrency(model.monthlyCostUsd) }
                  : {}),
              })),
            }
          : {}),
      };
    });

    const monthlyCostUsd = this.roundCurrency(
      lineItems.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
    );
    const hourlyCostUsd = this.roundCurrency(
      lineItems.reduce(
        (sum, lineItem) =>
          sum + (lineItem.baseHourlyCostUsd ?? lineItem.baseMonthlyCostUsd / HOURS_PER_MONTH),
        0,
      ),
    );

    return {
      providerId: result.providerId,
      lineItems,
      totals: this.intervalCostCalculator.calculate(monthlyCostUsd),
      pricingModels: this.providerPricingModels(lineItems, monthlyCostUsd, hourlyCostUsd),
      breakdown: this.costBreakdown(lineItems),
    };
  }

  private providerPricingModels(
    lineItems: ComparisonLineItem[],
    onDemandMonthlyCostUsd: number,
    onDemandHourlyCostUsd: number,
  ): PricingModelCost[] {
    return [
      {
        model: 'on-demand',
        available: true,
        displayName: 'On-demand',
        providerTerm: 'On-demand',
        source: 'catalog',
        estimated: false,
        volatility: 'stable',
        hourlyCostUsd: onDemandHourlyCostUsd,
        monthlyCostUsd: onDemandMonthlyCostUsd,
        savingsPercentVsOnDemand: 0,
        caveat: 'No long-term commitment modeled.',
      },
      this.providerCommitmentModel(lineItems, 'reserved-1yr', onDemandMonthlyCostUsd),
      this.providerCommitmentModel(lineItems, 'reserved-3yr', onDemandMonthlyCostUsd),
      this.providerCommitmentModel(lineItems, 'spot', onDemandMonthlyCostUsd),
      this.providerCommitmentModel(lineItems, 'savings-plan', onDemandMonthlyCostUsd),
    ];
  }

  private providerCommitmentModel(
    lineItems: ComparisonLineItem[],
    pricingModel: PricingModelKey,
    onDemandMonthlyCostUsd: number,
  ): PricingModelCost {
    const computeLineItems = lineItems.filter((lineItem) => lineItem.costComponent === 'compute');

    if (computeLineItems.length === 0) {
      return {
        model: pricingModel,
        available: false,
        unavailableReason: 'No compute line items in this workload.',
      };
    }

    const commitmentCosts = computeLineItems.map((lineItem) =>
      lineItem.pricingModels?.find((model) => model.model === pricingModel),
    );
    const representativeModel = commitmentCosts.find(
      (model): model is PricingModelCost => model !== undefined,
    );
    const allCommitmentCostsAvailable = commitmentCosts.every(
      (model) => model?.available === true && model.monthlyCostUsd !== undefined,
    );

    if (!allCommitmentCostsAvailable) {
      return {
        model: pricingModel,
        available: false,
        unavailableReason: 'Not available for this configuration.',
      };
    }

    const nonComputeMonthlyCostUsd = lineItems
      .filter((lineItem) => lineItem.costComponent !== 'compute')
      .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const computeMonthlyCostUsd = commitmentCosts.reduce(
      (sum, model) => sum + (model?.monthlyCostUsd ?? 0),
      0,
    );
    const monthlyCostUsd = this.roundCurrency(nonComputeMonthlyCostUsd + computeMonthlyCostUsd);

    return {
      model: pricingModel,
      available: true,
      displayName: representativeModel?.displayName,
      providerTerm: representativeModel?.providerTerm,
      source: commitmentCosts.some((model) => model?.source === 'modeled-estimate')
        ? 'modeled-estimate'
        : representativeModel?.source,
      estimated: commitmentCosts.some((model) => model?.estimated === true),
      volatility: representativeModel?.volatility,
      ...(representativeModel?.upfrontOption
        ? { upfrontOption: representativeModel.upfrontOption }
        : {}),
      ...(representativeModel?.commitmentTermMonths
        ? { commitmentTermMonths: representativeModel.commitmentTermMonths }
        : {}),
      ...(representativeModel?.lastFetchedAt
        ? { lastFetchedAt: representativeModel.lastFetchedAt }
        : {}),
      caveat: representativeModel?.caveat,
      hourlyCostUsd: this.roundCurrency(monthlyCostUsd / HOURS_PER_MONTH),
      monthlyCostUsd,
      savingsPercentVsOnDemand: this.savingsPercent(monthlyCostUsd, onDemandMonthlyCostUsd),
    };
  }

  private costBreakdown(lineItems: ComparisonLineItem[]): ComparisonCostBreakdown {
    const computeMonthlyCostUsd = this.componentTotal(lineItems, 'compute');
    const storageMonthlyCostUsd = this.componentTotal(lineItems, 'storage');
    const egressMonthlyCostUsd = this.componentTotal(lineItems, 'egress');
    const databaseMonthlyCostUsd = this.componentTotal(lineItems, 'database');

    return {
      computeMonthlyCostUsd,
      storageMonthlyCostUsd,
      egressMonthlyCostUsd,
      databaseMonthlyCostUsd,
      scopedMonthlyCostUsd: this.roundCurrency(
        computeMonthlyCostUsd + storageMonthlyCostUsd + egressMonthlyCostUsd,
      ),
    };
  }

  private componentTotal(lineItems: ComparisonLineItem[], component: CostComponent): number {
    return this.roundCurrency(
      lineItems
        .filter((lineItem) => this.lineItemComponent(lineItem) === component)
        .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
    );
  }

  private lineItemComponent(lineItem: ComparisonLineItem): CostComponent {
    return lineItem.costComponent ?? this.costComponentForCategory(lineItem.category);
  }

  private costComponentForCategory(category: ServiceCategory): CostComponent {
    if (category === 'network') {
      return 'egress';
    }

    return category;
  }

  private cheapestProvider(providers: ComparisonProviderResult[]): ProviderId {
    return providers.reduce((cheapest, current) =>
      current.totals.monthly < cheapest.totals.monthly ? current : cheapest,
    ).providerId;
  }

  private requirementSummary(nws: NormalizedWorkloadSpec): ComparisonResult['requirements'] {
    return {
      sourceType: nws.metadata.sourceType,
      workloadType: nws.workload.type,
      ...(nws.workload.name ? { workloadName: nws.workload.name } : {}),
      ...(nws.workload.region.preference
        ? { regionPreference: nws.workload.region.preference }
        : {}),
      serviceRequirements: nws.serviceRequirements ?? this.serviceRequirementsFromNws(nws),
    };
  }

  private serviceRequirementsFromNws(nws: NormalizedWorkloadSpec): ServiceRequirement[] {
    const region = nws.workload.region.preference;
    const computeRequirements: ServiceRequirement[] = nws.compute.map((compute) => ({
      serviceCategory: 'compute',
      serviceType: compute.scalingType === 'autoscaling' ? 'autoscaling-compute' : 'vm-compute',
      instanceType:
        compute.vcpu !== undefined || compute.memoryGb !== undefined
          ? `${compute.vcpu ?? '?'} vCPU / ${compute.memoryGb ?? '?'} GB`
          : undefined,
      region,
      az: nws.availability.multiAz ? 'multi-az' : 'single-az',
      quantity: compute.instanceCount ?? compute.autoscalingRange?.min ?? 1,
      scaleParams: {
        role: compute.role,
        scalingType: compute.scalingType,
        ...(compute.autoscalingRange
          ? {
              min: compute.autoscalingRange.min,
              max: compute.autoscalingRange.max,
            }
          : {}),
      },
    }));
    const storageRequirements: ServiceRequirement[] = nws.storage.map((storage) => ({
      serviceCategory: 'storage',
      serviceType:
        storage.type === 'block'
          ? 'block-storage'
          : storage.type === 'file'
            ? 'file-storage'
            : storage.accessPattern === 'archive'
              ? 'archive-storage'
              : 'object-storage',
      tier: storage.accessPattern,
      region,
      quantity: 1,
      scaleParams: {
        role: storage.role,
        sizeGb: storage.sizeGb,
      },
    }));
    const databaseRequirements: ServiceRequirement[] = nws.database.map((database) => ({
      serviceCategory: 'database',
      serviceType: database.engine === 'redis' ? 'cache' : 'relational-database',
      tier: database.highAvailability ? 'high-availability' : 'single-zone',
      region,
      az: database.highAvailability ? 'multi-az' : 'single-az',
      quantity: 1,
      scaleParams: {
        role: database.role,
        engine: database.engine,
        ...(database.sizeGb !== undefined ? { sizeGb: database.sizeGb } : {}),
      },
    }));
    const networkRequirements: ServiceRequirement[] = [
      ...(nws.network.cdn
        ? [
            {
              serviceCategory: 'networking' as const,
              serviceType: 'cdn-edge',
              region,
              quantity: 1,
              scaleParams: {
                estimatedMonthlyEgressGb: nws.network.estimatedMonthlyEgressGb ?? 0,
              },
            },
          ]
        : []),
      ...(nws.network.loadBalancer
        ? [
            {
              serviceCategory: 'networking' as const,
              serviceType: 'load-balancing',
              region,
              az: nws.availability.multiAz ? 'multi-az' : 'single-az',
              quantity: 1,
            },
          ]
        : []),
    ];

    return [
      ...computeRequirements,
      ...storageRequirements,
      ...databaseRequirements,
      ...networkRequirements,
    ];
  }

  private toWarning(failure: ProviderFailure): ComparisonWarning {
    return {
      providerId: failure.providerId,
      code: 'provider_pricing_failed',
      message: `${failure.providerId} pricing failed: ${this.safeErrorMessage(failure.error)}`,
    };
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return 'Unknown provider pricing error';
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private savingsPercent(candidateMonthlyCostUsd: number, onDemandMonthlyCostUsd: number): number {
    if (onDemandMonthlyCostUsd <= 0) {
      return 0;
    }

    return this.roundCurrency(
      Math.max(
        0,
        ((onDemandMonthlyCostUsd - candidateMonthlyCostUsd) / onDemandMonthlyCostUsd) * 100,
      ),
    );
  }
}

function isProviderSuccess(outcome: ProviderSuccess | ProviderFailure): outcome is ProviderSuccess {
  return 'result' in outcome;
}

function isProviderFailure(outcome: ProviderSuccess | ProviderFailure): outcome is ProviderFailure {
  return 'error' in outcome;
}
