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

interface UsageAdjustment {
  factor: number;
  label: string;
  monthlyHours: number;
}

interface NetworkDimensionRates {
  crossAzPerGb: number;
  interRegionPerGb: number;
  cdnViewerPerGb: number;
  cdnOriginPerGb: number;
  natHourly: number;
  natPerGb: number;
  dnsZoneMonthly: number;
  dnsPerMillionQueries: number;
  loadBalancerHourly: number;
  loadBalancerPerGb: number;
}

interface StorageDimensionRates {
  putPerThousand: number;
  getPerThousand: number;
  deletePerThousand: number;
  listPerThousand: number;
  retrievalPerGb: Partial<Record<StorageClassKey, number>>;
  replicationSameRegionPerGb: number;
  replicationCrossRegionPerGb: number;
  lifecyclePerThousand: number;
  snapshotPerGbMonth: number;
  iopsMonth: number;
  throughputMbpsMonth: number;
}

type StorageClassKey = NonNullable<NormalizedWorkloadSpec['storage'][number]['storageClass']>;

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
    // PHASE_3_HOOK: validated NWS/serviceRequirements can feed Terraform generation before pricing.
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
    const catalogLineItems = result.lineItems.map((lineItem): ComparisonLineItem => {
      const annotatedLineItem = this.equivalentServiceMapper.annotateLineItem(
        nws,
        result.providerId,
        lineItem,
      );
      const costComponent =
        annotatedLineItem.costComponent ??
        this.costComponentForCategory(annotatedLineItem.category);

      return this.normalizeLineItem({
        category: annotatedLineItem.category,
        costComponent,
        description: annotatedLineItem.description,
        isApproximate: annotatedLineItem.isApproximate,
        baseHourlyCostUsd:
          annotatedLineItem.baseHourlyCostUsd ??
          annotatedLineItem.baseMonthlyCostUsd / HOURS_PER_MONTH,
        baseMonthlyCostUsd: annotatedLineItem.baseMonthlyCostUsd,
        skuId: annotatedLineItem.skuId,
        region: annotatedLineItem.region,
        unit: annotatedLineItem.unit,
        unitPriceUsd: annotatedLineItem.unitPriceUsd,
        pricingBasis: annotatedLineItem.pricingBasis ?? 'flat',
        ...(annotatedLineItem.egressTiers ? { egressTiers: annotatedLineItem.egressTiers } : {}),
        ...(annotatedLineItem.pricingModels
          ? { pricingModels: this.normalizePricingModels(annotatedLineItem.pricingModels) }
          : {}),
      });
    });
    const usageAdjustedLineItems = this.applyUsageProfile(nws, catalogLineItems);
    const lineItems = [
      ...usageAdjustedLineItems,
      ...this.modeledLineItems(nws, result.providerId, usageAdjustedLineItems),
    ];

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
    const upfrontCostUsd = commitmentCosts.some((model) => model?.upfrontCostUsd !== undefined)
      ? this.roundCurrency(
          commitmentCosts.reduce((sum, model) => sum + (model?.upfrontCostUsd ?? 0), 0),
        )
      : undefined;
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
      ...(upfrontCostUsd !== undefined ? { upfrontCostUsd } : {}),
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
    const supportMonthlyCostUsd = this.componentTotal(lineItems, 'support');
    const licensingMonthlyCostUsd = this.componentTotal(lineItems, 'licensing');
    const operationsMonthlyCostUsd = this.componentTotal(lineItems, 'operations');

    return {
      computeMonthlyCostUsd,
      storageMonthlyCostUsd,
      egressMonthlyCostUsd,
      databaseMonthlyCostUsd,
      supportMonthlyCostUsd,
      licensingMonthlyCostUsd,
      operationsMonthlyCostUsd,
      scopedMonthlyCostUsd: this.roundCurrency(
        computeMonthlyCostUsd +
          storageMonthlyCostUsd +
          egressMonthlyCostUsd +
          databaseMonthlyCostUsd +
          supportMonthlyCostUsd +
          licensingMonthlyCostUsd +
          operationsMonthlyCostUsd,
      ),
    };
  }

  private normalizeLineItem(lineItem: ComparisonLineItem): ComparisonLineItem {
    return {
      ...lineItem,
      baseHourlyCostUsd:
        lineItem.baseHourlyCostUsd !== undefined
          ? this.roundCurrency(lineItem.baseHourlyCostUsd)
          : this.roundCurrency(lineItem.baseMonthlyCostUsd / HOURS_PER_MONTH),
      baseMonthlyCostUsd: this.roundCurrency(lineItem.baseMonthlyCostUsd),
      ...(lineItem.pricingModels
        ? { pricingModels: this.normalizePricingModels(lineItem.pricingModels) }
        : {}),
    };
  }

  private normalizePricingModels(pricingModels: PricingModelCost[]): PricingModelCost[] {
    return pricingModels.map((model) => ({
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
      ...(model.upfrontCostUsd !== undefined
        ? { upfrontCostUsd: this.roundCurrency(model.upfrontCostUsd) }
        : {}),
    }));
  }

  private applyUsageProfile(
    nws: NormalizedWorkloadSpec,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem[] {
    const usageAdjustment = this.usageAdjustment(nws);

    if (!usageAdjustment || usageAdjustment.factor >= 0.995) {
      return lineItems;
    }

    return lineItems.map((lineItem) => {
      if (this.lineItemComponent(lineItem) !== 'compute') {
        return lineItem;
      }

      const adjustedMonthlyCostUsd = this.roundCurrency(
        lineItem.baseMonthlyCostUsd * usageAdjustment.factor,
      );

      return this.normalizeLineItem({
        ...lineItem,
        description: `${lineItem.description} (${usageAdjustment.label})`,
        baseMonthlyCostUsd: adjustedMonthlyCostUsd,
        baseHourlyCostUsd: this.roundCurrency(adjustedMonthlyCostUsd / HOURS_PER_MONTH),
        pricingModels: lineItem.pricingModels?.map((model) =>
          model.available && model.monthlyCostUsd !== undefined
            ? {
                ...model,
                monthlyCostUsd: this.roundCurrency(model.monthlyCostUsd * usageAdjustment.factor),
                hourlyCostUsd: this.roundCurrency(
                  (model.monthlyCostUsd * usageAdjustment.factor) / HOURS_PER_MONTH,
                ),
                caveat: [model.caveat, usageAdjustment.label].filter(Boolean).join(' '),
              }
            : model,
        ),
      });
    });
  }

  private modeledLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem[] {
    const supportLineItem = this.supportLineItem(nws, providerId, lineItems);
    const licensingLineItem = this.licensingLineItem(nws, providerId);
    const resilienceLineItem = this.resilienceLineItem(nws, providerId, lineItems);
    const storageLineItems = this.storageDimensionLineItems(nws, providerId);
    const networkLineItems = this.networkDimensionLineItems(nws, providerId);

    return [
      supportLineItem,
      licensingLineItem,
      resilienceLineItem,
      ...storageLineItems,
      ...networkLineItems,
    ].filter((lineItem): lineItem is ComparisonLineItem => lineItem !== undefined);
  }

  private supportLineItem(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem | undefined {
    const supportTier = nws.workloadProfile?.supportTier ?? 'none';

    if (supportTier === 'none') {
      return undefined;
    }

    const subtotal = lineItems.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const supportCost = this.supportCost(providerId, supportTier, subtotal);

    if (supportCost <= 0) {
      return undefined;
    }

    return this.normalizeLineItem({
      category: 'support',
      costComponent: 'support',
      description: `${providerLabel(providerId)} ${supportTierLabel(supportTier)} support estimate`,
      isApproximate: true,
      baseMonthlyCostUsd: supportCost,
      baseHourlyCostUsd: supportCost / HOURS_PER_MONTH,
      unit: 'month',
      unitPriceUsd: supportCost,
      pricingBasis: 'flat',
    });
  }

  private supportCost(
    providerId: ProviderId,
    supportTier: NonNullable<NormalizedWorkloadSpec['workloadProfile']>['supportTier'],
    subtotal: number,
  ): number {
    switch (supportTier) {
      case 'developer':
        return providerId === 'gcp' ? 29 : 29;
      case 'business':
        return this.roundCurrency(Math.max(100, subtotal * 0.1));
      case 'enterprise':
        return this.roundCurrency(Math.max(providerId === 'azure' ? 1000 : 1500, subtotal * 0.15));
      case 'none':
      case undefined:
        return 0;
    }
  }

  private licensingLineItem(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem | undefined {
    const operatingSystem = nws.workloadProfile?.operatingSystem ?? 'linux';

    if (operatingSystem !== 'windows') {
      return undefined;
    }

    const vcpuHours = this.computeVcpuHours(nws);
    const unitPriceUsd = this.windowsLicenseRate(providerId);
    const monthlyCostUsd = this.roundCurrency(vcpuHours * unitPriceUsd);

    if (monthlyCostUsd <= 0) {
      return undefined;
    }

    return this.normalizeLineItem({
      category: 'licensing',
      costComponent: 'licensing',
      description: `${providerLabel(providerId)} Windows OS licensing estimate`,
      isApproximate: true,
      baseMonthlyCostUsd: monthlyCostUsd,
      baseHourlyCostUsd: monthlyCostUsd / HOURS_PER_MONTH,
      unit: 'vCPU-hour',
      unitPriceUsd,
      pricingBasis: 'flat',
    });
  }

  private resilienceLineItem(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem | undefined {
    const faultTolerance = this.faultTolerance(nws);

    if (faultTolerance === 'single-zone') {
      return undefined;
    }

    const subtotal = lineItems.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const statefulSubtotal = lineItems
      .filter((lineItem) =>
        ['database', 'storage', 'egress'].includes(this.lineItemComponent(lineItem)),
      )
      .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const monthlyCostUsd = this.roundCurrency(
      faultTolerance === 'active-active'
        ? subtotal
        : faultTolerance === 'multi-region'
          ? subtotal * 0.65
          : statefulSubtotal * 0.08,
    );

    if (monthlyCostUsd <= 0) {
      return undefined;
    }

    return this.normalizeLineItem({
      category: 'operations',
      costComponent: 'operations',
      description: `${providerLabel(providerId)} ${faultToleranceLabel(
        faultTolerance,
      )} resilience premium estimate`,
      isApproximate: true,
      baseMonthlyCostUsd: monthlyCostUsd,
      baseHourlyCostUsd: monthlyCostUsd / HOURS_PER_MONTH,
      unit: 'month',
      unitPriceUsd: monthlyCostUsd,
      pricingBasis: 'flat',
    });
  }

  private networkDimensionLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const rates = networkDimensionRates(providerId);
    const lineItems: ComparisonLineItem[] = [];
    const network = nws.network;
    const regionLabel = nws.workload.region.preference ?? 'default region';

    if (network.crossAzTransferGb && network.crossAzTransferGb > 0) {
      lineItems.push(
        this.networkLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-cross-az-transfer',
          description: `${providerLabel(providerId)} cross-AZ data transfer estimate`,
          quantity: network.crossAzTransferGb,
          unit: 'GB',
          unitPriceUsd: rates.crossAzPerGb,
        }),
      );
    }

    if (network.interRegionTransferGb && network.interRegionTransferGb > 0) {
      lineItems.push(
        this.networkLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-inter-region-transfer',
          description: `${providerLabel(providerId)} inter-region data transfer estimate`,
          quantity: network.interRegionTransferGb,
          unit: 'GB',
          unitPriceUsd: rates.interRegionPerGb,
        }),
      );
    }

    if (network.cdn && network.cdnTrafficGb && network.cdnTrafficGb > 0) {
      const cacheHitRatio = network.cdnCacheHitRatioPercent ?? 85;
      const originMissGb = network.cdnTrafficGb * ((100 - cacheHitRatio) / 100);
      const monthlyCostUsd = this.roundCurrency(
        network.cdnTrafficGb * rates.cdnViewerPerGb + originMissGb * rates.cdnOriginPerGb,
      );

      lineItems.push(
        this.networkLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-cdn-delivery',
          description: `${providerLabel(
            providerId,
          )} CDN delivery estimate (${Math.round(cacheHitRatio)}% cache hit, ${this.roundCurrency(
            originMissGb,
          )} GB origin miss)`,
          monthlyCostUsd,
          unit: 'month',
          unitPriceUsd: monthlyCostUsd,
        }),
      );
    }

    if ((network.natGatewayGb && network.natGatewayGb > 0) || network.natGatewayHours) {
      const hours = network.natGatewayHours ?? 0;
      const processedGb = network.natGatewayGb ?? 0;
      const monthlyCostUsd = this.roundCurrency(
        hours * rates.natHourly + processedGb * rates.natPerGb,
      );

      if (monthlyCostUsd > 0) {
        lineItems.push(
          this.networkLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-nat-gateway',
            description: `${providerLabel(
              providerId,
            )} NAT gateway estimate (${hours} hrs, ${processedGb} GB processed)`,
            monthlyCostUsd,
            unit: 'month',
            unitPriceUsd: monthlyCostUsd,
          }),
        );
      }
    }

    if ((network.dnsHostedZones && network.dnsHostedZones > 0) || network.dnsQueriesMillion) {
      const zones = network.dnsHostedZones ?? 0;
      const queryMillions = network.dnsQueriesMillion ?? 0;
      const monthlyCostUsd = this.roundCurrency(
        zones * rates.dnsZoneMonthly + queryMillions * rates.dnsPerMillionQueries,
      );

      if (monthlyCostUsd > 0) {
        lineItems.push(
          this.networkLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-dns',
            description: `${providerLabel(
              providerId,
            )} DNS estimate (${zones} hosted zones, ${queryMillions}M queries)`,
            monthlyCostUsd,
            unit: 'month',
            unitPriceUsd: monthlyCostUsd,
          }),
        );
      }
    }

    if (
      network.loadBalancer &&
      ((network.loadBalancerProcessedGb && network.loadBalancerProcessedGb > 0) ||
        network.loadBalancerHours)
    ) {
      const hours = network.loadBalancerHours ?? 0;
      const processedGb = network.loadBalancerProcessedGb ?? 0;
      const monthlyCostUsd = this.roundCurrency(
        hours * rates.loadBalancerHourly + processedGb * rates.loadBalancerPerGb,
      );

      if (monthlyCostUsd > 0) {
        lineItems.push(
          this.networkLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-load-balancer-capacity',
            description: `${providerLabel(
              providerId,
            )} load balancer capacity estimate (${hours} hrs, ${processedGb} GB processed)`,
            monthlyCostUsd,
            unit: 'month',
            unitPriceUsd: monthlyCostUsd,
          }),
        );
      }
    }

    return lineItems;
  }

  private networkLineItem(input: {
    providerId: ProviderId;
    regionLabel: string;
    skuId: string;
    description: string;
    quantity?: number;
    monthlyCostUsd?: number;
    unit: string;
    unitPriceUsd: number;
  }): ComparisonLineItem {
    const monthlyCostUsd =
      input.monthlyCostUsd ?? this.roundCurrency((input.quantity ?? 0) * input.unitPriceUsd);

    return this.normalizeLineItem({
      category: 'network',
      costComponent: 'egress',
      description: input.description,
      isApproximate: true,
      baseMonthlyCostUsd: monthlyCostUsd,
      baseHourlyCostUsd: monthlyCostUsd / HOURS_PER_MONTH,
      skuId: input.skuId,
      region: input.regionLabel,
      unit: input.unit,
      unitPriceUsd: input.unitPriceUsd,
      pricingBasis: 'flat',
    });
  }

  private usageAdjustment(nws: NormalizedWorkloadSpec): UsageAdjustment | undefined {
    const usagePattern = nws.workloadProfile?.usagePattern;

    if (!usagePattern || usagePattern.type === 'always_on') {
      return undefined;
    }

    if (usagePattern.type === 'scheduled') {
      const hoursPerDay = usagePattern.hoursPerDay ?? 24;
      const daysPerWeek = usagePattern.daysPerWeek ?? 7;
      const monthlyHours = Math.min(HOURS_PER_MONTH, (hoursPerDay * daysPerWeek * 52) / 12);
      const factor = Math.max(0.05, monthlyHours / HOURS_PER_MONTH);

      return {
        factor,
        monthlyHours,
        label: `scheduled duty cycle ${Math.round(factor * 100)}% (${Math.round(
          monthlyHours,
        )} hrs/mo)`,
      };
    }

    const utilization = usagePattern.averageUtilizationPercent ?? 55;
    const factor = Math.max(0.1, utilization / 100);

    return {
      factor,
      monthlyHours: HOURS_PER_MONTH * factor,
      label: `bursty utilization model ${Math.round(factor * 100)}% average`,
    };
  }

  private computeVcpuHours(nws: NormalizedWorkloadSpec): number {
    const usageAdjustment = this.usageAdjustment(nws);
    const monthlyHours = usageAdjustment?.monthlyHours ?? HOURS_PER_MONTH;

    return nws.compute.reduce((sum, compute) => {
      const quantity =
        compute.scalingType === 'autoscaling' && compute.autoscalingRange
          ? (compute.autoscalingRange.min + compute.autoscalingRange.max) / 2
          : (compute.instanceCount ?? 1);

      return sum + (compute.vcpu ?? 2) * quantity * monthlyHours;
    }, 0);
  }

  private windowsLicenseRate(providerId: ProviderId): number {
    switch (providerId) {
      case 'aws':
        return 0.046;
      case 'azure':
        return 0.041;
      case 'gcp':
        return 0.04;
    }
  }

  private faultTolerance(
    nws: NormalizedWorkloadSpec,
  ): NonNullable<NormalizedWorkloadSpec['availability']['faultTolerance']> {
    if (nws.availability.faultTolerance) {
      return nws.availability.faultTolerance;
    }

    if (nws.availability.multiRegion) {
      return 'multi-region';
    }

    if (nws.availability.multiAz) {
      return 'multi-az';
    }

    return 'single-zone';
  }

  private storageDimensionLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const rates = storageDimensionRates(providerId);
    const lineItems: ComparisonLineItem[] = [];
    const regionLabel = nws.workload.region.preference ?? 'default region';

    for (const storage of nws.storage) {
      const storageClass =
        storage.storageClass ?? storageClassFromAccessPattern(storage.accessPattern);
      const role = storage.role;

      const requestDimensions: Array<{
        quantity: number | undefined;
        rate: number;
        skuId: string;
        label: string;
      }> = [
        {
          quantity: storage.monthlyPutRequestsThousand,
          rate: rates.putPerThousand,
          skuId: 'modeled-storage-put-requests',
          label: 'PUT/write',
        },
        {
          quantity: storage.monthlyGetRequestsThousand,
          rate: rates.getPerThousand,
          skuId: 'modeled-storage-get-requests',
          label: 'GET/read',
        },
        {
          quantity: storage.monthlyDeleteRequestsThousand,
          rate: rates.deletePerThousand,
          skuId: 'modeled-storage-delete-requests',
          label: 'DELETE',
        },
        {
          quantity: storage.monthlyListRequestsThousand,
          rate: rates.listPerThousand,
          skuId: 'modeled-storage-list-requests',
          label: 'LIST',
        },
      ];

      for (const dimension of requestDimensions) {
        if (dimension.quantity !== undefined && dimension.quantity > 0 && dimension.rate > 0) {
          lineItems.push(
            this.storageLineItem({
              providerId,
              regionLabel,
              skuId: dimension.skuId,
              description: `${providerLabel(providerId)} ${role} ${dimension.label} storage operation estimate`,
              quantity: dimension.quantity,
              unit: '1K requests',
              unitPriceUsd: dimension.rate,
            }),
          );
        }
      }

      const retrievalGb = storage.monthlyRetrievalGb ?? 0;
      const retrievalRate = rates.retrievalPerGb[storageClass] ?? 0;
      if (retrievalGb > 0 && retrievalRate > 0) {
        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-retrieval',
            description: `${providerLabel(providerId)} ${role} ${storageClassLabel(
              storageClass,
            )} retrieval estimate`,
            quantity: retrievalGb,
            unit: 'GB retrieved',
            unitPriceUsd: retrievalRate,
          }),
        );
      }

      if (storage.replication && storage.replication !== 'none') {
        const unitPriceUsd =
          storage.replication === 'cross-region'
            ? rates.replicationCrossRegionPerGb
            : rates.replicationSameRegionPerGb;

        if (storage.sizeGb > 0 && unitPriceUsd > 0) {
          lineItems.push(
            this.storageLineItem({
              providerId,
              regionLabel,
              skuId: `modeled-storage-${storage.replication}-replication`,
              description: `${providerLabel(providerId)} ${role} ${storage.replication} replication estimate`,
              quantity: storage.sizeGb,
              unit: 'GB replicated',
              unitPriceUsd,
            }),
          );
        }
      }

      if (
        storage.lifecycleTransitionsThousand !== undefined &&
        storage.lifecycleTransitionsThousand > 0 &&
        rates.lifecyclePerThousand > 0
      ) {
        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-lifecycle-transitions',
            description: `${providerLabel(providerId)} ${role} lifecycle transition estimate`,
            quantity: storage.lifecycleTransitionsThousand,
            unit: '1K transitions',
            unitPriceUsd: rates.lifecyclePerThousand,
          }),
        );
      }

      if (storage.snapshotSizeGb !== undefined && storage.snapshotSizeGb > 0) {
        const retentionFactor =
          storage.snapshotRetentionDays !== undefined
            ? Math.max(0, storage.snapshotRetentionDays) / 30
            : 1;
        const snapshotGbMonth = storage.snapshotSizeGb * retentionFactor;

        if (snapshotGbMonth > 0 && rates.snapshotPerGbMonth > 0) {
          lineItems.push(
            this.storageLineItem({
              providerId,
              regionLabel,
              skuId: 'modeled-storage-snapshots',
              description: `${providerLabel(providerId)} ${role} snapshot retention estimate`,
              quantity: snapshotGbMonth,
              unit: 'GB-month',
              unitPriceUsd: rates.snapshotPerGbMonth,
            }),
          );
        }
      }

      if (
        storage.provisionedIops !== undefined &&
        storage.provisionedIops > 0 &&
        rates.iopsMonth > 0
      ) {
        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-provisioned-iops',
            description: `${providerLabel(providerId)} ${role} provisioned IOPS estimate`,
            quantity: storage.provisionedIops,
            unit: 'IOPS-month',
            unitPriceUsd: rates.iopsMonth,
          }),
        );
      }

      if (
        storage.provisionedThroughputMbps !== undefined &&
        storage.provisionedThroughputMbps > 0 &&
        rates.throughputMbpsMonth > 0
      ) {
        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-provisioned-throughput',
            description: `${providerLabel(providerId)} ${role} provisioned throughput estimate`,
            quantity: storage.provisionedThroughputMbps,
            unit: 'MB/s-month',
            unitPriceUsd: rates.throughputMbpsMonth,
          }),
        );
      }
    }

    return lineItems;
  }

  private storageLineItem(input: {
    providerId: ProviderId;
    regionLabel: string;
    skuId: string;
    description: string;
    quantity: number;
    unit: string;
    unitPriceUsd: number;
  }): ComparisonLineItem {
    const monthlyCostUsd = this.roundCurrency(input.quantity * input.unitPriceUsd);

    return this.normalizeLineItem({
      category: 'storage',
      costComponent: 'storage',
      description: input.description,
      isApproximate: true,
      baseMonthlyCostUsd: monthlyCostUsd,
      baseHourlyCostUsd: monthlyCostUsd / HOURS_PER_MONTH,
      skuId: input.skuId,
      region: input.regionLabel,
      unit: input.unit,
      unitPriceUsd: input.unitPriceUsd,
      pricingBasis: 'flat',
    });
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
        compute.vcpu !== undefined ||
        compute.memoryGb !== undefined ||
        compute.instanceFamily ||
        compute.processorArchitecture ||
        compute.tenancy
          ? `${compute.instanceFamily ?? 'general-purpose'} / ${
              compute.processorArchitecture ?? 'x86_64'
            } / ${compute.tenancy ?? 'shared'} / ${compute.vcpu ?? '?'} vCPU / ${
              compute.memoryGb ?? '?'
            } GB`
          : undefined,
      region,
      az: nws.availability.multiAz ? 'multi-az' : 'single-az',
      quantity: compute.instanceCount ?? compute.autoscalingRange?.min ?? 1,
      scaleParams: {
        role: compute.role,
        ...(compute.instanceFamily ? { instanceFamily: compute.instanceFamily } : {}),
        ...(compute.processorArchitecture
          ? { processorArchitecture: compute.processorArchitecture }
          : {}),
        ...(compute.tenancy ? { tenancy: compute.tenancy } : {}),
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
      instanceType: `${storage.type} / ${storageClassLabel(
        storage.storageClass ?? storageClassFromAccessPattern(storage.accessPattern),
      )} - ${storage.sizeGb} GB`,
      tier: storage.storageClass ?? storage.accessPattern,
      region,
      quantity: 1,
      scaleParams: {
        role: storage.role,
        sizeGb: storage.sizeGb,
        ...(storage.accessPattern ? { storageAccessPattern: storage.accessPattern } : {}),
        ...(storage.storageClass ? { storageClass: storage.storageClass } : {}),
        ...(storage.monthlyPutRequestsThousand !== undefined
          ? { monthlyPutRequestsThousand: storage.monthlyPutRequestsThousand }
          : {}),
        ...(storage.monthlyGetRequestsThousand !== undefined
          ? { monthlyGetRequestsThousand: storage.monthlyGetRequestsThousand }
          : {}),
        ...(storage.monthlyDeleteRequestsThousand !== undefined
          ? { monthlyDeleteRequestsThousand: storage.monthlyDeleteRequestsThousand }
          : {}),
        ...(storage.monthlyListRequestsThousand !== undefined
          ? { monthlyListRequestsThousand: storage.monthlyListRequestsThousand }
          : {}),
        ...(storage.monthlyRetrievalGb !== undefined
          ? { monthlyRetrievalGb: storage.monthlyRetrievalGb }
          : {}),
        ...(storage.replication ? { replication: storage.replication } : {}),
        ...(storage.lifecycleTransitionsThousand !== undefined
          ? { lifecycleTransitionsThousand: storage.lifecycleTransitionsThousand }
          : {}),
        ...(storage.snapshotSizeGb !== undefined ? { snapshotSizeGb: storage.snapshotSizeGb } : {}),
        ...(storage.snapshotRetentionDays !== undefined
          ? { snapshotRetentionDays: storage.snapshotRetentionDays }
          : {}),
        ...(storage.provisionedIops !== undefined
          ? { provisionedIops: storage.provisionedIops }
          : {}),
        ...(storage.provisionedThroughputMbps !== undefined
          ? { provisionedThroughputMbps: storage.provisionedThroughputMbps }
          : {}),
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

function supportTierLabel(
  supportTier: NonNullable<NormalizedWorkloadSpec['workloadProfile']>['supportTier'],
): string {
  switch (supportTier) {
    case 'developer':
      return 'Developer';
    case 'business':
      return 'Business';
    case 'enterprise':
      return 'Enterprise';
    case 'none':
    case undefined:
      return 'No';
  }
}

function faultToleranceLabel(
  faultTolerance: NonNullable<NormalizedWorkloadSpec['availability']['faultTolerance']>,
): string {
  switch (faultTolerance) {
    case 'single-zone':
      return 'single-zone';
    case 'multi-az':
      return 'multi-AZ';
    case 'multi-region':
      return 'multi-region';
    case 'active-active':
      return 'active-active';
  }
}

function storageClassFromAccessPattern(
  accessPattern: NormalizedWorkloadSpec['storage'][number]['accessPattern'],
): StorageClassKey {
  switch (accessPattern) {
    case 'archive':
      return 'archive';
    case 'infrequent':
      return 'infrequent-access';
    case 'frequent':
    case undefined:
      return 'standard';
  }
}

function storageClassLabel(storageClass: StorageClassKey): string {
  switch (storageClass) {
    case 'standard':
      return 'standard';
    case 'hot':
      return 'hot';
    case 'cool':
      return 'cool';
    case 'cold':
      return 'cold';
    case 'nearline':
      return 'nearline';
    case 'coldline':
      return 'coldline';
    case 'intelligent-tiering':
      return 'intelligent-tiering';
    case 'infrequent-access':
      return 'infrequent access';
    case 'one-zone-infrequent-access':
      return 'one-zone infrequent access';
    case 'archive-instant':
      return 'archive instant';
    case 'archive':
      return 'archive';
    case 'deep-archive':
      return 'deep archive';
    case 'premium':
      return 'premium';
    case 'ultra':
      return 'ultra';
  }
}

function storageDimensionRates(providerId: ProviderId): StorageDimensionRates {
  switch (providerId) {
    case 'aws':
      return {
        putPerThousand: 0.005,
        getPerThousand: 0.0004,
        deletePerThousand: 0,
        listPerThousand: 0.005,
        retrievalPerGb: {
          'intelligent-tiering': 0.003,
          'infrequent-access': 0.01,
          'one-zone-infrequent-access': 0.01,
          'archive-instant': 0.03,
          archive: 0.03,
          'deep-archive': 0.02,
          cool: 0.01,
          cold: 0.02,
          nearline: 0.01,
          coldline: 0.02,
        },
        replicationSameRegionPerGb: 0.01,
        replicationCrossRegionPerGb: 0.02,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.05,
        iopsMonth: 0.005,
        throughputMbpsMonth: 0.04,
      };
    case 'azure':
      return {
        putPerThousand: 0.004,
        getPerThousand: 0.0004,
        deletePerThousand: 0,
        listPerThousand: 0.004,
        retrievalPerGb: {
          cool: 0.01,
          cold: 0.02,
          archive: 0.02,
          'deep-archive': 0.02,
          'infrequent-access': 0.01,
          nearline: 0.01,
          coldline: 0.02,
        },
        replicationSameRegionPerGb: 0.008,
        replicationCrossRegionPerGb: 0.018,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.045,
        iopsMonth: 0.004,
        throughputMbpsMonth: 0.035,
      };
    case 'gcp':
      return {
        putPerThousand: 0.005,
        getPerThousand: 0.0004,
        deletePerThousand: 0,
        listPerThousand: 0.005,
        retrievalPerGb: {
          nearline: 0.01,
          coldline: 0.02,
          archive: 0.05,
          'deep-archive': 0.05,
          cool: 0.01,
          cold: 0.02,
          'infrequent-access': 0.01,
        },
        replicationSameRegionPerGb: 0.01,
        replicationCrossRegionPerGb: 0.02,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.026,
        iopsMonth: 0.0045,
        throughputMbpsMonth: 0.032,
      };
  }
}

function networkDimensionRates(providerId: ProviderId): NetworkDimensionRates {
  switch (providerId) {
    case 'aws':
      return {
        crossAzPerGb: 0.01,
        interRegionPerGb: 0.02,
        cdnViewerPerGb: 0.085,
        cdnOriginPerGb: 0.01,
        natHourly: 0.045,
        natPerGb: 0.045,
        dnsZoneMonthly: 0.5,
        dnsPerMillionQueries: 0.4,
        loadBalancerHourly: 0.0225,
        loadBalancerPerGb: 0.008,
      };
    case 'azure':
      return {
        crossAzPerGb: 0.01,
        interRegionPerGb: 0.02,
        cdnViewerPerGb: 0.081,
        cdnOriginPerGb: 0.01,
        natHourly: 0.045,
        natPerGb: 0.045,
        dnsZoneMonthly: 0.5,
        dnsPerMillionQueries: 0.4,
        loadBalancerHourly: 0.025,
        loadBalancerPerGb: 0.005,
      };
    case 'gcp':
      return {
        crossAzPerGb: 0.01,
        interRegionPerGb: 0.02,
        cdnViewerPerGb: 0.08,
        cdnOriginPerGb: 0.01,
        natHourly: 0.0014,
        natPerGb: 0.045,
        dnsZoneMonthly: 0.2,
        dnsPerMillionQueries: 0.4,
        loadBalancerHourly: 0.025,
        loadBalancerPerGb: 0.008,
      };
  }
}
