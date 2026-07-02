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
  canonicalRegionForPreference,
  canonicalRegionForResidencyLock,
} from '../pricing-normalization/region-map';
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
  PricingModelRecommendation,
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

interface ResilienceCapacityProfile {
  faultTolerance: NonNullable<NormalizedWorkloadSpec['availability']['faultTolerance']>;
  factor: number;
  label: string;
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
  loadBalancerLcuHour: number;
  vpnConnectionHourly: number;
  vpnDataTransferPerGb: number;
  privateCircuitPortHourly: number;
  privateCircuitDataTransferPerGb: number;
}

interface StorageDimensionRates {
  putPerThousand: number;
  getPerThousand: number;
  deletePerThousand: number;
  listPerThousand: number;
  retrievalPerGb: Partial<Record<StorageClassKey, number>>;
  storagePerGbMonth: Partial<Record<StorageClassKey, number>>;
  minimumDurationDays: Partial<Record<StorageClassKey, number>>;
  intelligentTieringMonitoringPerThousandObjects: number;
  replicationSameRegionPerGb: number;
  replicationCrossRegionPerGb: number;
  lifecyclePerThousand: number;
  snapshotPerGbMonth: number;
  iopsMonth: number;
  throughputMbpsMonth: number;
  multiAttachPerGbMonth: number;
}

interface DatabaseDimensionRates {
  backupPerGbMonth: number;
  provisionedIopsMonth: number;
  readReplicaMonthlyFactor: number;
  highAvailabilityStandbyFactor: number;
  crossRegionReplicaTransferPerGb: number;
  nosqlReadPerMillion: number;
  nosqlWritePerMillion: number;
  ruPerSecondMonth: number;
  queryPerTb: number;
  cacheReplicaMonthly: number;
  storageGrowthPerGbMonth: number;
  searchNodeHour: number;
  searchStoragePerGbMonth: number;
  searchQueryPerMillion: number;
}

interface SupportingServicesRates {
  metricPerMillion: number;
  logIngestPerGb: number;
  logRetentionPerGbMonth: number;
  alarmMonthly: number;
  dashboardMonthly: number;
  tracePerMillion: number;
  secretMonthly: number;
  secretApiPerTenThousand: number;
  securityResourceMonthly: number;
  securityFindingPerThousand: number;
  wafAclMonthly: number;
  wafRuleMonthly: number;
  wafRequestPerMillion: number;
  ddosProtectedResourceMonthly: number;
}

interface RuntimeServicesRates {
  functionRequestPerMillion: number;
  functionGbSecond: number;
  appPlatformRequestPerMillion: number;
  appPlatformVcpuHour: number;
  appPlatformMemoryGbHour: number;
  appPlatformAlwaysOnVcpuHour: number;
  appPlatformAlwaysOnMemoryGbHour: number;
  kubernetesControlPlaneMonthly: number;
  kubernetesNodeOverheadMonthly: number;
  registryStoragePerGbMonth: number;
  registryEgressPerGb: number;
}

interface AnalyticsServicesRates {
  warehouseStoragePerGbMonth: number;
  warehouseQueryPerTb: number;
  dataLakeStoragePerGbMonth: number;
  integrationJobHour: number;
  streamingIngestPerGb: number;
  biUserMonthly: number;
}

interface AiServicesRates {
  trainingGpuHour: number;
  modelHostingHour: number;
  inferenceRequestPerMillion: number;
  vectorStoragePerGbMonth: number;
  vectorQueryPerMillion: number;
  apiInputTokenPerMillion: number;
  apiOutputTokenPerMillion: number;
}

interface IntegrationServicesRates {
  queueMessagePerMillion: number;
  eventRoutingPerMillion: number;
  workflowTransitionPerThousand: number;
  apiGatewayRequestPerMillion: number;
}

type StorageClassKey = NonNullable<NormalizedWorkloadSpec['storage'][number]['storageClass']>;
type WorkloadEnvironment = NonNullable<NormalizedWorkloadSpec['workloadProfile']>['environment'];
type ComputeTenancy = NonNullable<NormalizedWorkloadSpec['compute'][number]['tenancy']>;
type DedicatedComputeTenancy = Extract<ComputeTenancy, 'dedicated-host' | 'sole-tenant'>;

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

    const warnings = [
      ...failures.map((failure) => this.toWarning(failure)),
      ...this.dataResidencyWarnings(nws),
    ];

    if (providers.length === 0) {
      throw new ComparisonUnavailableError(warnings);
    }

    return {
      comparisonId: this.idFactory(),
      pricingAsOf: this.clock().toISOString(),
      requirements: this.requirementSummary(nws),
      providers,
      cheapestProviderId: this.cheapestProvider(providers),
      pricingModelRecommendation: this.pricingModelRecommendation(nws, providers),
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
    const resilienceAdjustedLineItems = this.applyResilienceCapacityProfile(
      nws,
      usageAdjustedLineItems,
    );
    const lineItems = [
      ...resilienceAdjustedLineItems,
      ...this.modeledLineItems(nws, result.providerId, resilienceAdjustedLineItems),
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
    const networkingMonthlyCostUsd = this.componentTotal(lineItems, 'networking');
    const databaseMonthlyCostUsd = this.componentTotal(lineItems, 'database');
    const supportMonthlyCostUsd = this.componentTotal(lineItems, 'support');
    const licensingMonthlyCostUsd = this.componentTotal(lineItems, 'licensing');
    const operationsMonthlyCostUsd = this.componentTotal(lineItems, 'operations');

    return {
      computeMonthlyCostUsd,
      storageMonthlyCostUsd,
      egressMonthlyCostUsd,
      networkingMonthlyCostUsd,
      databaseMonthlyCostUsd,
      supportMonthlyCostUsd,
      licensingMonthlyCostUsd,
      operationsMonthlyCostUsd,
      scopedMonthlyCostUsd: this.roundCurrency(
        computeMonthlyCostUsd +
          storageMonthlyCostUsd +
          egressMonthlyCostUsd +
          networkingMonthlyCostUsd +
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

  private applyResilienceCapacityProfile(
    nws: NormalizedWorkloadSpec,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem[] {
    const resilienceProfile = this.resilienceCapacityProfile(nws);

    if (resilienceProfile.factor <= 1) {
      return lineItems;
    }

    return lineItems.map((lineItem) => {
      if (this.lineItemComponent(lineItem) !== 'compute') {
        return lineItem;
      }

      const adjustedMonthlyCostUsd = this.roundCurrency(
        lineItem.baseMonthlyCostUsd * resilienceProfile.factor,
      );

      return this.normalizeLineItem({
        ...lineItem,
        description: `${lineItem.description} (${resilienceProfile.label})`,
        baseMonthlyCostUsd: adjustedMonthlyCostUsd,
        baseHourlyCostUsd: this.roundCurrency(adjustedMonthlyCostUsd / HOURS_PER_MONTH),
        pricingModels: lineItem.pricingModels?.map((model) =>
          model.available && model.monthlyCostUsd !== undefined
            ? {
                ...model,
                monthlyCostUsd: this.roundCurrency(model.monthlyCostUsd * resilienceProfile.factor),
                hourlyCostUsd: this.roundCurrency(
                  (model.monthlyCostUsd * resilienceProfile.factor) / HOURS_PER_MONTH,
                ),
                ...(model.upfrontCostUsd !== undefined
                  ? {
                      upfrontCostUsd: this.roundCurrency(
                        model.upfrontCostUsd * resilienceProfile.factor,
                      ),
                    }
                  : {}),
                caveat: [model.caveat, resilienceProfile.label].filter(Boolean).join(' '),
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
    const tenancyLineItem = this.tenancyLineItem(nws, providerId, lineItems);
    const resilienceLineItem = this.resilienceLineItem(nws, providerId, lineItems);
    const storageLineItems = this.storageDimensionLineItems(nws, providerId);
    const databaseLineItems = this.databaseDimensionLineItems(nws, providerId, lineItems);
    const supportingServicesLineItems = this.supportingServicesLineItems(nws, providerId);
    const runtimeServicesLineItems = this.runtimeServicesLineItems(nws, providerId);
    const analyticsServicesLineItems = this.analyticsServicesLineItems(nws, providerId);
    const aiServicesLineItems = this.aiServicesLineItems(nws, providerId);
    const integrationServicesLineItems = this.integrationServicesLineItems(nws, providerId);
    const networkLineItems = this.networkDimensionLineItems(nws, providerId);

    return [
      supportLineItem,
      licensingLineItem,
      tenancyLineItem,
      resilienceLineItem,
      ...storageLineItems,
      ...databaseLineItems,
      ...supportingServicesLineItems,
      ...runtimeServicesLineItems,
      ...analyticsServicesLineItems,
      ...aiServicesLineItems,
      ...integrationServicesLineItems,
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
      description: `${providerLabel(providerId)} ${providerSupportPlanLabel(
        providerId,
        supportTier,
      )} support estimate`,
      isApproximate: true,
      baseMonthlyCostUsd: supportCost,
      baseHourlyCostUsd: supportCost / HOURS_PER_MONTH,
      skuId: `modeled-support-${supportTier}`,
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
    if (!supportTier || supportTier === 'none') {
      return 0;
    }

    if (providerId === 'azure') {
      return azureSupportCost(supportTier);
    }

    if (providerId === 'gcp') {
      return this.roundCurrency(gcpSupportCost(supportTier, subtotal));
    }

    return this.roundCurrency(awsSupportCost(supportTier, subtotal));
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

  private tenancyLineItem(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem | undefined {
    const dedicatedComponents = nws.compute.filter(
      (component) => component.tenancy === 'dedicated-host' || component.tenancy === 'sole-tenant',
    );

    if (dedicatedComponents.length === 0) {
      return undefined;
    }

    const componentsNeedingPremium = dedicatedComponents.filter(
      (component) =>
        !this.hasNativeTenancyCatalogCoverage(component.role, component.tenancy, lineItems),
    );

    if (componentsNeedingPremium.length === 0) {
      return undefined;
    }

    const usageAdjustment = this.usageAdjustment(nws);
    const monthlyHours = usageAdjustment?.monthlyHours ?? HOURS_PER_MONTH;
    const resilienceMultiplier = this.resilienceCapacityProfile(nws).factor;
    const sharedVcpuHourlyRate = tenancySharedVcpuHourlyRate(providerId);
    let premiumMonthlyCostUsd = 0;
    const densityNotes: string[] = [];

    for (const component of componentsNeedingPremium) {
      const tenancy = component.tenancy as DedicatedComputeTenancy;
      const vcpu = component.vcpu ?? 2;
      const quantity =
        component.scalingType === 'autoscaling' && component.autoscalingRange
          ? (component.autoscalingRange.min + component.autoscalingRange.max) / 2
          : (component.instanceCount ?? 1);
      const adjustedQuantity = quantity * resilienceMultiplier;
      const instancesPerHost = Math.max(1, Math.floor(TENANCY_REFERENCE_HOST_VCPU / vcpu));
      const hosts = Math.max(1, Math.ceil(adjustedQuantity / instancesPerHost));
      const hostMonthlyCostUsd = hosts * tenancyHostMonthlyRate(providerId, tenancy);
      const sharedBaselineMonthlyCostUsd =
        vcpu * adjustedQuantity * monthlyHours * sharedVcpuHourlyRate;
      const componentPremiumMonthlyCostUsd = Math.max(
        0,
        hostMonthlyCostUsd - sharedBaselineMonthlyCostUsd,
      );

      premiumMonthlyCostUsd += componentPremiumMonthlyCostUsd;
      densityNotes.push(
        `${component.role}: ${hosts} ${TENANCY_REFERENCE_HOST_VCPU}-vCPU host(s), ${instancesPerHost} instance(s)/host density`,
      );
    }

    const monthlyCostUsd = this.roundCurrency(premiumMonthlyCostUsd);

    if (monthlyCostUsd <= 0) {
      return undefined;
    }

    const dominantTenancy = componentsNeedingPremium[0].tenancy as DedicatedComputeTenancy;

    return this.normalizeLineItem({
      category: 'compute',
      costComponent: 'compute',
      description: `${providerLabel(providerId)} ${computeTenancyLabel(
        dominantTenancy,
      )} tenancy premium estimate (${densityNotes.join('; ')})`,
      isApproximate: true,
      baseMonthlyCostUsd: monthlyCostUsd,
      baseHourlyCostUsd: monthlyCostUsd / HOURS_PER_MONTH,
      skuId: `modeled-compute-${dominantTenancy}-premium`,
      unit: 'host-month premium',
      unitPriceUsd: tenancyHostMonthlyRate(providerId, dominantTenancy),
      pricingBasis: 'flat',
      pricingModels: this.tenancyPricingModels(providerId, monthlyCostUsd),
    });
  }

  private hasNativeTenancyCatalogCoverage(
    role: string,
    tenancy: ComputeTenancy | undefined,
    lineItems: ComparisonLineItem[],
  ): boolean {
    if (tenancy !== 'dedicated-host' && tenancy !== 'sole-tenant') {
      return false;
    }

    const rolePrefix = role.toLowerCase();

    return lineItems.some((lineItem) => {
      if (lineItem.costComponent !== 'compute' || lineItem.isApproximate) {
        return false;
      }

      const descriptor = `${lineItem.description} ${lineItem.skuId ?? ''}`.toLowerCase();

      return descriptor.includes(rolePrefix) && tenancyDescriptorMatches(descriptor, tenancy);
    });
  }

  private tenancyPricingModels(providerId: ProviderId, monthlyCostUsd: number): PricingModelCost[] {
    const models: Array<{
      model: PricingModelKey;
      factor: number;
      caveat: string;
    }> = [
      {
        model: 'on-demand',
        factor: 1,
        caveat: 'Modeled as incremental dedicated host / sole-tenant premium above shared compute.',
      },
      {
        model: 'reserved-1yr',
        factor: 0.82,
        caveat:
          'Planning estimate for one-year host reservation or committed-use discount coverage.',
      },
      {
        model: 'reserved-3yr',
        factor: 0.64,
        caveat:
          'Planning estimate for three-year host reservation or committed-use discount coverage.',
      },
      {
        model: 'spot',
        factor: 1,
        caveat:
          'Dedicated host and sole-tenant capacity is modeled without spot discount until provider-specific placement is validated.',
      },
      {
        model: 'savings-plan',
        factor: 0.86,
        caveat:
          'Planning estimate for eligible savings-plan or committed-use coverage; validate tenancy eligibility before purchase.',
      },
    ];

    return models.map(({ model, factor, caveat }) => {
      const modelMonthlyCostUsd = this.roundCurrency(monthlyCostUsd * factor);

      return {
        model,
        available: true,
        displayName: pricingModelDisplayName(model),
        providerTerm: tenancyPricingProviderTerm(providerId, model),
        source: 'modeled-estimate',
        estimated: true,
        volatility:
          model === 'spot' ? 'volatile' : model === 'savings-plan' ? 'variable' : 'stable',
        monthlyCostUsd: modelMonthlyCostUsd,
        hourlyCostUsd: this.roundCurrency(modelMonthlyCostUsd / HOURS_PER_MONTH),
        savingsPercentVsOnDemand: this.savingsPercent(modelMonthlyCostUsd, monthlyCostUsd),
        ...(model === 'reserved-1yr' ? { commitmentTermMonths: 12 } : {}),
        ...(model === 'reserved-3yr' ? { commitmentTermMonths: 36 } : {}),
        caveat,
      };
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

    const statefulSubtotal = lineItems
      .filter((lineItem) =>
        ['database', 'storage', 'egress'].includes(this.lineItemComponent(lineItem)),
      )
      .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const monthlyCostUsd = this.roundCurrency(
      statefulSubtotal * resilienceStatefulOverheadFactor(faultTolerance),
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
          costComponent: 'networking',
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
          costComponent: 'networking',
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
            costComponent: 'networking',
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
            costComponent: 'networking',
          }),
        );
      }
    }

    if (
      network.loadBalancer &&
      ((network.loadBalancerProcessedGb && network.loadBalancerProcessedGb > 0) ||
        network.loadBalancerHours ||
        network.loadBalancerNewConnectionsPerSecond ||
        network.loadBalancerActiveConnections ||
        network.loadBalancerRuleEvaluationsPerSecond)
    ) {
      const hasLcuDriver = Boolean(
        network.loadBalancerNewConnectionsPerSecond ||
        network.loadBalancerActiveConnections ||
        network.loadBalancerRuleEvaluationsPerSecond,
      );
      const hours = network.loadBalancerHours ?? (hasLcuDriver ? HOURS_PER_MONTH : 0);
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
            costComponent: 'networking',
          }),
        );
      }

      const lcuProfile = loadBalancerLcuProfile(network, hours, processedGb);
      const lcuMonthlyCostUsd = this.roundCurrency(lcuProfile.lcuHours * rates.loadBalancerLcuHour);

      if (lcuMonthlyCostUsd > 0) {
        lineItems.push(
          this.networkLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-load-balancer-lcu',
            description: `${providerLabel(
              providerId,
            )} load balancer LCU/capacity-unit estimate (${lcuProfile.peakLcu.toFixed(
              2,
            )} LCU peak from ${lcuProfile.dominantDriver}, ${this.roundCurrency(
              lcuProfile.lcuHours,
            )} LCU-hrs)`,
            monthlyCostUsd: lcuMonthlyCostUsd,
            unit: 'LCU-hour',
            unitPriceUsd: rates.loadBalancerLcuHour,
            costComponent: 'networking',
          }),
        );
      }
    }

    if (
      (network.vpnConnectionCount && network.vpnConnectionCount > 0) ||
      (network.vpnConnectionHours && network.vpnConnectionHours > 0) ||
      (network.vpnDataTransferGb && network.vpnDataTransferGb > 0)
    ) {
      const connections = network.vpnConnectionCount ?? 1;
      const hours = network.vpnConnectionHours ?? 0;
      const transferGb = network.vpnDataTransferGb ?? 0;
      const monthlyCostUsd = this.roundCurrency(
        connections * hours * rates.vpnConnectionHourly + transferGb * rates.vpnDataTransferPerGb,
      );

      if (monthlyCostUsd > 0) {
        lineItems.push(
          this.networkLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-vpn-connectivity',
            description: `${providerLabel(
              providerId,
            )} VPN connectivity estimate (${connections} connection(s), ${hours} hrs, ${transferGb} GB transfer)`,
            monthlyCostUsd,
            unit: 'month',
            unitPriceUsd: monthlyCostUsd,
            costComponent: 'networking',
          }),
        );
      }
    }

    if (
      (network.privateCircuitCount && network.privateCircuitCount > 0) ||
      (network.privateCircuitPortHours && network.privateCircuitPortHours > 0) ||
      (network.privateCircuitDataTransferGb && network.privateCircuitDataTransferGb > 0)
    ) {
      const circuits = network.privateCircuitCount ?? 1;
      const portHours = network.privateCircuitPortHours ?? 0;
      const transferGb = network.privateCircuitDataTransferGb ?? 0;
      const monthlyCostUsd = this.roundCurrency(
        circuits * portHours * rates.privateCircuitPortHourly +
          transferGb * rates.privateCircuitDataTransferPerGb,
      );

      if (monthlyCostUsd > 0) {
        lineItems.push(
          this.networkLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-private-circuit',
            description: `${providerLabel(
              providerId,
            )} private circuit estimate (${circuits} circuit(s), ${portHours} port hrs, ${transferGb} GB transfer)`,
            monthlyCostUsd,
            unit: 'month',
            unitPriceUsd: monthlyCostUsd,
            costComponent: 'networking',
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
    costComponent?: Extract<CostComponent, 'egress' | 'networking'>;
  }): ComparisonLineItem {
    const monthlyCostUsd =
      input.monthlyCostUsd ?? this.roundCurrency((input.quantity ?? 0) * input.unitPriceUsd);

    return this.normalizeLineItem({
      category: 'network',
      costComponent: input.costComponent ?? 'egress',
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
    const resilienceMultiplier = this.resilienceCapacityProfile(nws).factor;

    return nws.compute.reduce((sum, compute) => {
      const quantity =
        compute.scalingType === 'autoscaling' && compute.autoscalingRange
          ? (compute.autoscalingRange.min + compute.autoscalingRange.max) / 2
          : (compute.instanceCount ?? 1);

      return sum + (compute.vcpu ?? 2) * quantity * monthlyHours * resilienceMultiplier;
    }, 0);
  }

  private resilienceCapacityProfile(nws: NormalizedWorkloadSpec): ResilienceCapacityProfile {
    const faultTolerance = this.faultTolerance(nws);
    const factor = resilienceCapacityMultiplier(faultTolerance);

    return {
      faultTolerance,
      factor,
      label: `${faultToleranceLabel(faultTolerance)} resilience capacity x${factor.toFixed(2)}`,
    };
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

      if (
        storageClass === 'intelligent-tiering' &&
        storage.objectCountThousand !== undefined &&
        storage.objectCountThousand > 0 &&
        rates.intelligentTieringMonitoringPerThousandObjects > 0
      ) {
        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-intelligent-tiering-monitoring',
            description: `${providerLabel(providerId)} ${role} intelligent-tiering monitoring estimate`,
            quantity: storage.objectCountThousand,
            unit: '1K objects',
            unitPriceUsd: rates.intelligentTieringMonitoringPerThousandObjects,
          }),
        );
      }

      const minimumDurationDays = rates.minimumDurationDays[storageClass] ?? 0;
      const plannedRetentionDays = storage.objectRetentionDays;
      const storageRate = rates.storagePerGbMonth[storageClass] ?? 0;
      if (
        plannedRetentionDays !== undefined &&
        plannedRetentionDays < minimumDurationDays &&
        minimumDurationDays > 0 &&
        storageRate > 0
      ) {
        const extraBillableGbMonth =
          storage.sizeGb * ((minimumDurationDays - plannedRetentionDays) / 30);

        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-minimum-duration',
            description: `${providerLabel(providerId)} ${role} ${storageClassLabel(
              storageClass,
            )} minimum-duration exposure estimate (${plannedRetentionDays}d planned, ${minimumDurationDays}d billable minimum)`,
            quantity: extraBillableGbMonth,
            unit: 'GB-month exposure',
            unitPriceUsd: storageRate,
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
        storage.type === 'block' &&
        storage.multiAttachEnabled === true &&
        rates.multiAttachPerGbMonth > 0
      ) {
        lineItems.push(
          this.storageLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-storage-multi-attach',
            description: `${providerLabel(providerId)} ${role} multi-attach block storage capability estimate`,
            quantity: storage.sizeGb,
            unit: 'GB-month',
            unitPriceUsd: rates.multiAttachPerGbMonth,
          }),
        );
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

  private databaseDimensionLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
    lineItems: ComparisonLineItem[],
  ): ComparisonLineItem[] {
    const rates = databaseDimensionRates(providerId);
    const regionLabel = nws.workload.region.preference ?? 'default region';
    const requirementDatabaseComponents = databaseComponentsFromRequirements(nws);
    const databaseComponents =
      nws.database.length === 0
        ? requirementDatabaseComponents
        : nws.database.some(databaseHasManagedSearchAssumption)
          ? nws.database
          : [...nws.database, ...requirementDatabaseComponents];

    if (databaseComponents.length === 0) {
      return [];
    }

    const databaseBaseMonthlyCostUsd =
      lineItems
        .filter((lineItem) => this.lineItemComponent(lineItem) === 'database')
        .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0) /
      databaseComponents.length;
    const representativeBaseCost = Number.isFinite(databaseBaseMonthlyCostUsd)
      ? databaseBaseMonthlyCostUsd
      : 0;
    const modeledLineItems: ComparisonLineItem[] = [];

    for (const database of databaseComponents) {
      const role = database.role;

      if (database.highAvailability && representativeBaseCost > 0) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-ha-standby',
            description: `${providerLabel(providerId)} ${role} multi-AZ standby estimate`,
            monthlyCostUsd: this.roundCurrency(
              representativeBaseCost * rates.highAvailabilityStandbyFactor,
            ),
            unit: 'month',
            unitPriceUsd: this.roundCurrency(
              representativeBaseCost * rates.highAvailabilityStandbyFactor,
            ),
          }),
        );
      }

      if (database.backupStorageGb !== undefined && database.backupStorageGb > 0) {
        const retentionFactor =
          database.backupRetentionDays !== undefined
            ? Math.max(0, database.backupRetentionDays) / 30
            : 1;
        const backupGbMonth = database.backupStorageGb * retentionFactor;

        if (backupGbMonth > 0 && rates.backupPerGbMonth > 0) {
          modeledLineItems.push(
            this.databaseLineItem({
              providerId,
              regionLabel,
              skuId: 'modeled-database-backup-storage',
              description: `${providerLabel(providerId)} ${role} backup retention estimate`,
              quantity: backupGbMonth,
              unit: 'GB-month',
              unitPriceUsd: rates.backupPerGbMonth,
            }),
          );
        }
      }

      if (
        database.provisionedIops !== undefined &&
        database.provisionedIops > 0 &&
        rates.provisionedIopsMonth > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-provisioned-iops',
            description: `${providerLabel(providerId)} ${role} provisioned database IOPS estimate`,
            quantity: database.provisionedIops,
            unit: 'IOPS-month',
            unitPriceUsd: rates.provisionedIopsMonth,
          }),
        );
      }

      if (
        database.readReplicaCount !== undefined &&
        database.readReplicaCount > 0 &&
        representativeBaseCost > 0
      ) {
        const monthlyCostUsd = this.roundCurrency(
          representativeBaseCost * database.readReplicaCount * rates.readReplicaMonthlyFactor,
        );

        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-read-replicas',
            description: `${providerLabel(providerId)} ${role} read replica capacity estimate`,
            monthlyCostUsd,
            unit: 'month',
            unitPriceUsd: monthlyCostUsd,
          }),
        );
      }

      if (
        database.crossRegionReplicaTransferGb !== undefined &&
        database.crossRegionReplicaTransferGb > 0 &&
        rates.crossRegionReplicaTransferPerGb > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-replica-transfer',
            description: `${providerLabel(providerId)} ${role} cross-region replica transfer estimate`,
            quantity: database.crossRegionReplicaTransferGb,
            unit: 'GB',
            unitPriceUsd: rates.crossRegionReplicaTransferPerGb,
          }),
        );
      }

      if (
        database.nosqlReadRequestUnitsMillion !== undefined &&
        database.nosqlReadRequestUnitsMillion > 0 &&
        rates.nosqlReadPerMillion > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-nosql-read-units',
            description: `${providerLabel(providerId)} ${role} NoSQL read unit estimate`,
            quantity: database.nosqlReadRequestUnitsMillion,
            unit: '1M read units',
            unitPriceUsd: rates.nosqlReadPerMillion,
          }),
        );
      }

      if (
        database.nosqlWriteRequestUnitsMillion !== undefined &&
        database.nosqlWriteRequestUnitsMillion > 0 &&
        rates.nosqlWritePerMillion > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-nosql-write-units',
            description: `${providerLabel(providerId)} ${role} NoSQL write unit estimate`,
            quantity: database.nosqlWriteRequestUnitsMillion,
            unit: '1M write units',
            unitPriceUsd: rates.nosqlWritePerMillion,
          }),
        );
      }

      if (
        database.ruPerSecond !== undefined &&
        database.ruPerSecond > 0 &&
        rates.ruPerSecondMonth > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-ru-capacity',
            description: `${providerLabel(providerId)} ${role} RU/s provisioned capacity estimate`,
            quantity: database.ruPerSecond,
            unit: 'RU/s-month',
            unitPriceUsd: rates.ruPerSecondMonth,
          }),
        );
      }

      if (database.queryDataTb !== undefined && database.queryDataTb > 0 && rates.queryPerTb > 0) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-query-processing',
            description: `${providerLabel(providerId)} ${role} analytical query processing estimate`,
            quantity: database.queryDataTb,
            unit: 'TB queried',
            unitPriceUsd: rates.queryPerTb,
          }),
        );
      }

      if (
        database.cacheReplicaCount !== undefined &&
        database.cacheReplicaCount > 0 &&
        rates.cacheReplicaMonthly > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-cache-replicas',
            description: `${providerLabel(providerId)} ${role} cache replica estimate`,
            quantity: database.cacheReplicaCount,
            unit: 'replica-month',
            unitPriceUsd: rates.cacheReplicaMonthly,
          }),
        );
      }

      if (
        database.storageGrowthGbPerMonth !== undefined &&
        database.storageGrowthGbPerMonth > 0 &&
        rates.storageGrowthPerGbMonth > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-storage-growth',
            description: `${providerLabel(providerId)} ${role} projected storage growth estimate`,
            quantity: database.storageGrowthGbPerMonth,
            unit: 'GB-month',
            unitPriceUsd: rates.storageGrowthPerGbMonth,
          }),
        );
      }

      if (
        database.searchNodeCount !== undefined &&
        database.searchNodeCount > 0 &&
        database.searchNodeHours !== undefined &&
        database.searchNodeHours > 0 &&
        rates.searchNodeHour > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-search-capacity',
            description: `${providerManagedSearchLabel(providerId)} capacity estimate`,
            quantity: database.searchNodeCount * database.searchNodeHours,
            unit: 'node-hour',
            unitPriceUsd: rates.searchNodeHour,
          }),
        );
      }

      if (
        database.searchStorageGb !== undefined &&
        database.searchStorageGb > 0 &&
        rates.searchStoragePerGbMonth > 0
      ) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-search-storage',
            description: `${providerManagedSearchLabel(providerId)} index storage estimate`,
            quantity: database.searchStorageGb,
            unit: 'GB-month',
            unitPriceUsd: rates.searchStoragePerGbMonth,
          }),
        );
      }

      if (database.searchQueriesMillion !== undefined && database.searchQueriesMillion > 0) {
        modeledLineItems.push(
          this.databaseLineItem({
            providerId,
            regionLabel,
            skuId: 'modeled-database-search-queries',
            description: `${providerManagedSearchLabel(providerId)} search query estimate`,
            quantity: database.searchQueriesMillion,
            unit: '1M queries',
            unitPriceUsd: rates.searchQueryPerMillion,
          }),
        );
      }
    }

    return modeledLineItems;
  }

  private databaseLineItem(input: {
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
      category: 'database',
      costComponent: 'database',
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

  private supportingServicesLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const requirements = nws.serviceRequirements ?? [];
    const serviceTypes = new Set(requirements.map((requirement) => requirement.serviceType));
    const rates = supportingServicesRates(providerId);
    const regionLabel = nws.workload.region.preference ?? 'default region';
    const values = supportingServicesAssumptions(requirements);
    const lineItems: ComparisonLineItem[] = [];

    if (serviceTypes.has('monitoring') && values.observabilityMetricsMillion > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-operations-metrics',
          description: `${providerLabel(providerId)} monitoring custom metric sample estimate`,
          quantity: values.observabilityMetricsMillion,
          unit: '1M metric samples',
          unitPriceUsd: rates.metricPerMillion,
        }),
      );
    }

    if (serviceTypes.has('logging-audit') && values.observabilityLogsIngestGb > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-operations-log-ingestion',
          description: `${providerLabel(providerId)} log ingestion estimate`,
          quantity: values.observabilityLogsIngestGb,
          unit: 'GB ingested',
          unitPriceUsd: rates.logIngestPerGb,
        }),
      );
    }

    if (serviceTypes.has('logging-audit') && values.observabilityLogRetentionGb > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-operations-log-retention',
          description: `${providerLabel(providerId)} log retention storage estimate`,
          quantity: values.observabilityLogRetentionGb,
          unit: 'GB-month',
          unitPriceUsd: rates.logRetentionPerGbMonth,
        }),
      );
    }

    if (serviceTypes.has('monitoring') && values.observabilityAlarms > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-operations-alarms',
          description: `${providerLabel(providerId)} monitoring alarm estimate`,
          quantity: values.observabilityAlarms,
          unit: 'alarm-month',
          unitPriceUsd: rates.alarmMonthly,
        }),
      );
    }

    if (serviceTypes.has('monitoring') && values.observabilityDashboards > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-operations-dashboards',
          description: `${providerLabel(providerId)} dashboard estimate`,
          quantity: values.observabilityDashboards,
          unit: 'dashboard-month',
          unitPriceUsd: rates.dashboardMonthly,
        }),
      );
    }

    if (serviceTypes.has('tracing-apm') && values.observabilityTracesMillion > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-operations-traces',
          description: `${providerLabel(providerId)} trace span estimate`,
          quantity: values.observabilityTracesMillion,
          unit: '1M traces',
          unitPriceUsd: rates.tracePerMillion,
        }),
      );
    }

    if (serviceTypes.has('keys-secrets') && values.secretsCount > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-secrets',
          description: `${providerLabel(providerId)} managed secrets estimate`,
          quantity: values.secretsCount,
          unit: 'secret-month',
          unitPriceUsd: rates.secretMonthly,
        }),
      );
    }

    if (serviceTypes.has('keys-secrets') && values.secretApiCallsTenThousand > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-secret-api-calls',
          description: `${providerLabel(providerId)} secret API call estimate`,
          quantity: values.secretApiCallsTenThousand,
          unit: '10k calls',
          unitPriceUsd: rates.secretApiPerTenThousand,
        }),
      );
    }

    if (serviceTypes.has('security-posture') && values.securityProtectedResources > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-posture-resources',
          description: `${providerLabel(providerId)} security posture protected resource estimate`,
          quantity: values.securityProtectedResources,
          unit: 'protected resource-month',
          unitPriceUsd: rates.securityResourceMonthly,
        }),
      );
    }

    if (serviceTypes.has('security-posture') && values.securityFindingsThousand > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-posture-findings',
          description: `${providerLabel(providerId)} security finding ingestion estimate`,
          quantity: values.securityFindingsThousand,
          unit: '1k findings',
          unitPriceUsd: rates.securityFindingPerThousand,
        }),
      );
    }

    if (serviceTypes.has('waf-ddos') && values.wafWebAclCount > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-waf-acls',
          description: `${providerLabel(providerId)} WAF web ACL estimate`,
          quantity: values.wafWebAclCount,
          unit: 'web ACL-month',
          unitPriceUsd: rates.wafAclMonthly,
        }),
      );
    }

    if (serviceTypes.has('waf-ddos') && values.wafRuleCount > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-waf-rules',
          description: `${providerLabel(providerId)} WAF rule estimate`,
          quantity: values.wafRuleCount,
          unit: 'rule-month',
          unitPriceUsd: rates.wafRuleMonthly,
        }),
      );
    }

    if (serviceTypes.has('waf-ddos') && values.wafRequestsMillion > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-waf-requests',
          description: `${providerLabel(providerId)} WAF request inspection estimate`,
          quantity: values.wafRequestsMillion,
          unit: '1M requests',
          unitPriceUsd: rates.wafRequestPerMillion,
        }),
      );
    }

    if (serviceTypes.has('waf-ddos') && values.ddosProtectedResources > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-security-ddos-protection',
          description: `${providerLabel(providerId)} managed DDoS protection estimate`,
          quantity: values.ddosProtectedResources,
          unit: 'protected resource-month',
          unitPriceUsd: rates.ddosProtectedResourceMonthly,
        }),
      );
    }

    return lineItems;
  }

  private operationsLineItem(input: {
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
      category: 'operations',
      costComponent: 'operations',
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

  private runtimeServicesLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const requirements = nws.serviceRequirements ?? [];
    const serviceTypes = new Set(requirements.map((requirement) => requirement.serviceType));
    const rates = runtimeServicesRates(providerId);
    const regionLabel = nws.workload.region.preference ?? 'default region';
    const values = runtimeServicesAssumptions(requirements);
    const lineItems: ComparisonLineItem[] = [];

    if (serviceTypes.has('serverless-functions') && values.functionInvocationsMillion > 0) {
      const invocations = values.functionInvocationsMillion * 1_000_000;
      const durationSeconds = values.functionDurationMs / 1000;
      const memoryGb = values.functionMemoryMb / 1024;
      const gbSeconds = invocations * durationSeconds * memoryGb;
      const requestCost = values.functionInvocationsMillion * rates.functionRequestPerMillion;
      const durationCost = gbSeconds * rates.functionGbSecond;

      lineItems.push(
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-serverless-function-requests',
          description: `${providerLabel(providerId)} serverless function request estimate`,
          monthlyCostUsd: this.roundCurrency(requestCost),
          unit: '1M requests',
          unitPriceUsd: rates.functionRequestPerMillion,
        }),
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-serverless-function-duration',
          description: `${providerLabel(providerId)} serverless function GB-second estimate`,
          monthlyCostUsd: this.roundCurrency(durationCost),
          unit: 'GB-second',
          unitPriceUsd: rates.functionGbSecond,
        }),
      );
    }

    if (serviceTypes.has('app-platform') && values.appPlatformRequestsMillion > 0) {
      const activeHours =
        (values.appPlatformRequestsMillion *
          1_000_000 *
          (values.appPlatformRequestDurationMs / 1000)) /
        3600;
      const requestCost = values.appPlatformRequestsMillion * rates.appPlatformRequestPerMillion;
      const computeCost = activeHours * values.appPlatformVcpu * rates.appPlatformVcpuHour;
      const memoryCost = activeHours * values.appPlatformMemoryGb * rates.appPlatformMemoryGbHour;

      lineItems.push(
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-app-platform-requests',
          description: `${providerLabel(providerId)} managed app platform request estimate`,
          monthlyCostUsd: this.roundCurrency(requestCost),
          unit: '1M requests',
          unitPriceUsd: rates.appPlatformRequestPerMillion,
        }),
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-app-platform-request-compute',
          description: `${providerLabel(providerId)} managed app platform active vCPU estimate`,
          monthlyCostUsd: this.roundCurrency(computeCost),
          unit: 'vCPU-hour',
          unitPriceUsd: rates.appPlatformVcpuHour,
        }),
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-app-platform-request-memory',
          description: `${providerLabel(providerId)} managed app platform active memory estimate`,
          monthlyCostUsd: this.roundCurrency(memoryCost),
          unit: 'GB-hour',
          unitPriceUsd: rates.appPlatformMemoryGbHour,
        }),
      );
    }

    if (serviceTypes.has('container-orchestration') && values.kubernetesClusterCount > 0) {
      lineItems.push(
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-kubernetes-control-plane',
          description: `${providerLabel(providerId)} managed Kubernetes control plane estimate`,
          monthlyCostUsd: this.roundCurrency(
            values.kubernetesClusterCount * rates.kubernetesControlPlaneMonthly,
          ),
          unit: 'cluster-month',
          unitPriceUsd: rates.kubernetesControlPlaneMonthly,
        }),
      );
    }

    if (serviceTypes.has('container-orchestration') && values.kubernetesWorkerNodeCount > 0) {
      lineItems.push(
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-kubernetes-node-overhead',
          description: `${providerLabel(providerId)} Kubernetes node networking/operations overhead estimate`,
          monthlyCostUsd: this.roundCurrency(
            values.kubernetesWorkerNodeCount * rates.kubernetesNodeOverheadMonthly,
          ),
          unit: 'node-month',
          unitPriceUsd: rates.kubernetesNodeOverheadMonthly,
        }),
      );
    }

    if (serviceTypes.has('container-registry') && values.registryStorageGb > 0) {
      lineItems.push(
        this.storageLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-container-registry-storage',
          description: `${providerLabel(providerId)} container registry storage estimate`,
          quantity: values.registryStorageGb,
          unit: 'GB-month',
          unitPriceUsd: rates.registryStoragePerGbMonth,
        }),
      );
    }

    if (serviceTypes.has('container-registry') && values.registryEgressGb > 0) {
      lineItems.push(
        this.networkLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-container-registry-egress',
          description: `${providerLabel(providerId)} container registry egress estimate`,
          quantity: values.registryEgressGb,
          unit: 'GB',
          unitPriceUsd: rates.registryEgressPerGb,
        }),
      );
    }

    return lineItems;
  }

  private analyticsServicesLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const requirements = nws.serviceRequirements ?? [];
    const serviceTypes = new Set(requirements.map((requirement) => requirement.serviceType));
    const rates = analyticsServicesRates(providerId);
    const regionLabel = nws.workload.region.preference ?? 'default region';
    const values = analyticsServicesAssumptions(requirements);
    const lineItems: ComparisonLineItem[] = [];

    if (serviceTypes.has('data-warehouse') && values.analyticsWarehouseStorageGb > 0) {
      lineItems.push(
        this.storageLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-analytics-warehouse-storage',
          description: `${providerLabel(providerId)} data warehouse storage estimate`,
          quantity: values.analyticsWarehouseStorageGb,
          unit: 'GB-month',
          unitPriceUsd: rates.warehouseStoragePerGbMonth,
        }),
      );
    }

    if (serviceTypes.has('data-warehouse') && values.analyticsWarehouseQueryTb > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-analytics-warehouse-query',
          description: `${providerLabel(providerId)} data warehouse query processing estimate`,
          quantity: values.analyticsWarehouseQueryTb,
          unit: 'TB queried',
          unitPriceUsd: rates.warehouseQueryPerTb,
        }),
      );
    }

    if (serviceTypes.has('data-lake') && values.analyticsDataLakeStorageGb > 0) {
      lineItems.push(
        this.storageLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-analytics-data-lake-storage',
          description: `${providerLabel(providerId)} data lake storage/catalog estimate`,
          quantity: values.analyticsDataLakeStorageGb,
          unit: 'GB-month',
          unitPriceUsd: rates.dataLakeStoragePerGbMonth,
        }),
      );
    }

    if (serviceTypes.has('data-integration') && values.analyticsIntegrationJobHours > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-analytics-integration-job-hours',
          description: `${providerLabel(providerId)} data integration job-hour estimate`,
          quantity: values.analyticsIntegrationJobHours,
          unit: 'job-hour',
          unitPriceUsd: rates.integrationJobHour,
        }),
      );
    }

    if (serviceTypes.has('streaming-analytics') && values.analyticsStreamingIngestGb > 0) {
      lineItems.push(
        this.networkLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-analytics-streaming-ingest',
          description: `${providerLabel(providerId)} streaming analytics ingest estimate`,
          quantity: values.analyticsStreamingIngestGb,
          unit: 'GB ingested',
          unitPriceUsd: rates.streamingIngestPerGb,
          costComponent: 'networking',
        }),
      );
    }

    if (serviceTypes.has('business-intelligence') && values.analyticsBiUsers > 0) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-analytics-bi-users',
          description: `${providerLabel(providerId)} business intelligence user estimate`,
          quantity: values.analyticsBiUsers,
          unit: 'user-month',
          unitPriceUsd: rates.biUserMonthly,
        }),
      );
    }

    return lineItems;
  }

  private aiServicesLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const requirements = nws.serviceRequirements ?? [];
    const serviceTypes = new Set(requirements.map((requirement) => requirement.serviceType));
    const rates = aiServicesRates(providerId);
    const regionLabel = nws.workload.region.preference ?? 'default region';
    const values = aiServicesAssumptions(requirements);
    const lineItems: ComparisonLineItem[] = [];

    if (
      (serviceTypes.has('ml-training') || values.aiTrainingGpuHours > 0) &&
      values.aiTrainingGpuHours > 0
    ) {
      lineItems.push(
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-training-gpu-hours',
          description: `${providerLabel(providerId)} AI/ML training GPU-hour estimate`,
          monthlyCostUsd: this.roundCurrency(values.aiTrainingGpuHours * rates.trainingGpuHour),
          unit: 'GPU-hour',
          unitPriceUsd: rates.trainingGpuHour,
        }),
      );
    }

    if (
      (serviceTypes.has('model-hosting') || values.aiModelHostingHours > 0) &&
      values.aiModelHostingHours > 0
    ) {
      lineItems.push(
        this.computeModeledLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-model-hosting-hours',
          description: `${providerLabel(providerId)} managed model hosting endpoint estimate`,
          monthlyCostUsd: this.roundCurrency(values.aiModelHostingHours * rates.modelHostingHour),
          unit: 'endpoint-hour',
          unitPriceUsd: rates.modelHostingHour,
        }),
      );
    }

    if (
      (serviceTypes.has('ai-inference') || values.aiInferenceRequestsMillion > 0) &&
      values.aiInferenceRequestsMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-inference-requests',
          description: `${providerLabel(providerId)} AI inference request estimate`,
          quantity: values.aiInferenceRequestsMillion,
          unit: '1M requests',
          unitPriceUsd: rates.inferenceRequestPerMillion,
        }),
      );
    }

    if (
      (serviceTypes.has('vector-search') || values.aiVectorStorageGb > 0) &&
      values.aiVectorStorageGb > 0
    ) {
      lineItems.push(
        this.storageLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-vector-storage',
          description: `${providerLabel(providerId)} vector index storage estimate`,
          quantity: values.aiVectorStorageGb,
          unit: 'GB-month',
          unitPriceUsd: rates.vectorStoragePerGbMonth,
        }),
      );
    }

    if (
      (serviceTypes.has('vector-search') || values.aiVectorQueriesMillion > 0) &&
      values.aiVectorQueriesMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-vector-queries',
          description: `${providerLabel(providerId)} vector search query estimate`,
          quantity: values.aiVectorQueriesMillion,
          unit: '1M vector queries',
          unitPriceUsd: rates.vectorQueryPerMillion,
        }),
      );
    }

    if (
      (serviceTypes.has('generative-ai-api') || values.aiApiInputTokensMillion > 0) &&
      values.aiApiInputTokensMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-api-input-tokens',
          description: `${providerLabel(providerId)} generative AI input token estimate`,
          quantity: values.aiApiInputTokensMillion,
          unit: '1M input tokens',
          unitPriceUsd: rates.apiInputTokenPerMillion,
        }),
      );
    }

    if (
      (serviceTypes.has('generative-ai-api') || values.aiApiOutputTokensMillion > 0) &&
      values.aiApiOutputTokensMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-ai-api-output-tokens',
          description: `${providerLabel(providerId)} generative AI output token estimate`,
          quantity: values.aiApiOutputTokensMillion,
          unit: '1M output tokens',
          unitPriceUsd: rates.apiOutputTokenPerMillion,
        }),
      );
    }

    return lineItems;
  }

  private integrationServicesLineItems(
    nws: NormalizedWorkloadSpec,
    providerId: ProviderId,
  ): ComparisonLineItem[] {
    const requirements = nws.serviceRequirements ?? [];
    const serviceTypes = new Set(requirements.map((requirement) => requirement.serviceType));
    const rates = integrationServicesRates(providerId);
    const regionLabel = nws.workload.region.preference ?? 'default region';
    const values = integrationServicesAssumptions(requirements);
    const lineItems: ComparisonLineItem[] = [];

    if (
      (serviceTypes.has('queues-messaging') || values.integrationQueueMessagesMillion > 0) &&
      values.integrationQueueMessagesMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-integration-queue-messages',
          description: `${providerLabel(providerId)} queue and messaging operation estimate`,
          quantity: values.integrationQueueMessagesMillion,
          unit: '1M messages',
          unitPriceUsd: rates.queueMessagePerMillion,
        }),
      );
    }

    if (
      (serviceTypes.has('eventing') || values.integrationEventsMillion > 0) &&
      values.integrationEventsMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-integration-event-routing',
          description: `${providerLabel(providerId)} event routing estimate`,
          quantity: values.integrationEventsMillion,
          unit: '1M events',
          unitPriceUsd: rates.eventRoutingPerMillion,
        }),
      );
    }

    if (
      (serviceTypes.has('workflow-orchestration') ||
        values.integrationWorkflowTransitionsThousand > 0) &&
      values.integrationWorkflowTransitionsThousand > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-integration-workflow-transitions',
          description: `${providerLabel(providerId)} workflow transition estimate`,
          quantity: values.integrationWorkflowTransitionsThousand,
          unit: '1K transitions',
          unitPriceUsd: rates.workflowTransitionPerThousand,
        }),
      );
    }

    if (
      (serviceTypes.has('api-gateway') || values.integrationApiGatewayRequestsMillion > 0) &&
      values.integrationApiGatewayRequestsMillion > 0
    ) {
      lineItems.push(
        this.operationsLineItem({
          providerId,
          regionLabel,
          skuId: 'modeled-application-api-gateway-requests',
          description: `${providerLabel(providerId)} API gateway request estimate`,
          quantity: values.integrationApiGatewayRequestsMillion,
          unit: '1M requests',
          unitPriceUsd: rates.apiGatewayRequestPerMillion,
        }),
      );
    }

    return lineItems;
  }

  private computeModeledLineItem(input: {
    providerId: ProviderId;
    regionLabel: string;
    skuId: string;
    description: string;
    monthlyCostUsd: number;
    unit: string;
    unitPriceUsd: number;
  }): ComparisonLineItem {
    return this.normalizeLineItem({
      category: 'compute',
      costComponent: 'compute',
      description: input.description,
      isApproximate: true,
      baseMonthlyCostUsd: input.monthlyCostUsd,
      baseHourlyCostUsd: input.monthlyCostUsd / HOURS_PER_MONTH,
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

  private pricingModelRecommendation(
    nws: NormalizedWorkloadSpec,
    providers: ComparisonProviderResult[],
  ): PricingModelRecommendation {
    const environment = nws.workloadProfile?.environment;
    const commitmentPreferencePercent =
      nws.workloadProfile?.commitmentPreferencePercent !== undefined
        ? Math.min(100, Math.max(0, nws.workloadProfile.commitmentPreferencePercent))
        : undefined;
    const flexibilityBias = this.flexibilityBias(commitmentPreferencePercent);
    const candidates = this.pricingModelRecommendationCandidates(
      environment,
      commitmentPreferencePercent,
    );
    const preferredModel =
      candidates.find((model) => this.pricingModelAvailableAcrossProviders(providers, model)) ??
      'on-demand';
    const candidateWasUnavailable = preferredModel !== candidates[0];
    const confidence = this.pricingModelRecommendationConfidence(
      preferredModel,
      candidateWasUnavailable,
    );

    return {
      preferredModel,
      confidence,
      rationale: this.pricingModelRecommendationRationale({
        environment,
        commitmentPreferencePercent,
        preferredModel,
        candidateWasUnavailable,
      }),
      sourceSignals: {
        ...(environment ? { environment } : {}),
        ...(commitmentPreferencePercent !== undefined ? { commitmentPreferencePercent } : {}),
        flexibilityBias,
      },
    };
  }

  private pricingModelRecommendationCandidates(
    environment: WorkloadEnvironment | undefined,
    commitmentPreferencePercent?: number,
  ): PricingModelKey[] {
    if (commitmentPreferencePercent === undefined || commitmentPreferencePercent < 35) {
      return ['on-demand'];
    }

    const isProduction = environment === 'production';
    const isNonProduction =
      environment === 'development' || environment === 'test' || environment === 'staging';

    if (isNonProduction) {
      if (commitmentPreferencePercent >= 85) {
        return ['savings-plan', 'reserved-1yr', 'on-demand'];
      }

      return ['on-demand'];
    }

    if (isProduction && commitmentPreferencePercent >= 85) {
      return ['reserved-3yr', 'savings-plan', 'reserved-1yr', 'on-demand'];
    }

    if (commitmentPreferencePercent >= 65) {
      return ['reserved-1yr', 'savings-plan', 'on-demand'];
    }

    return ['savings-plan', 'reserved-1yr', 'on-demand'];
  }

  private pricingModelAvailableAcrossProviders(
    providers: ComparisonProviderResult[],
    pricingModel: PricingModelKey,
  ): boolean {
    if (pricingModel === 'on-demand') {
      return providers.length > 0;
    }

    return providers.every((provider) =>
      provider.pricingModels?.some((model) => model.model === pricingModel && model.available),
    );
  }

  private pricingModelRecommendationConfidence(
    preferredModel: PricingModelKey,
    candidateWasUnavailable: boolean,
  ): PricingModelRecommendation['confidence'] {
    if (candidateWasUnavailable) {
      return preferredModel === 'on-demand' ? 'low' : 'medium';
    }

    return 'high';
  }

  private flexibilityBias(
    commitmentPreferencePercent?: number,
  ): PricingModelRecommendation['sourceSignals']['flexibilityBias'] {
    if (commitmentPreferencePercent === undefined || commitmentPreferencePercent < 35) {
      return 'flexibility';
    }

    if (commitmentPreferencePercent >= 75) {
      return 'cost-optimized';
    }

    return 'balanced';
  }

  private pricingModelRecommendationRationale({
    environment,
    commitmentPreferencePercent,
    preferredModel,
    candidateWasUnavailable,
  }: {
    environment?: WorkloadEnvironment;
    commitmentPreferencePercent?: number;
    preferredModel: PricingModelKey;
    candidateWasUnavailable: boolean;
  }): string {
    const environmentLabel = environment ? environment.replace('-', ' ') : 'unspecified';
    const environmentArticle = environment ? 'a' : 'an';
    const commitmentLabel =
      commitmentPreferencePercent !== undefined
        ? `${commitmentPreferencePercent}% commitment preference`
        : 'no commitment preference signal';
    const fallbackCopy = candidateWasUnavailable
      ? ' The first-choice commitment model was not available across all priced providers, so PolyCost selected the nearest comparable option.'
      : '';

    if (preferredModel === 'on-demand') {
      return `Defaulting to on-demand for ${environmentArticle} ${environmentLabel} workload with ${commitmentLabel}, preserving flexibility and avoiding unsupported long-term commitments.${fallbackCopy}`;
    }

    if (preferredModel === 'reserved-3yr') {
      return `Defaulting to 3-year reserved pricing because this is a production workload with ${commitmentLabel} and all priced providers expose comparable long-term commitment data.${fallbackCopy}`;
    }

    if (preferredModel === 'reserved-1yr') {
      return `Defaulting to 1-year reserved pricing for a ${environmentLabel} workload with ${commitmentLabel}, balancing savings with a shorter commitment window.${fallbackCopy}`;
    }

    if (preferredModel === 'savings-plan') {
      return `Defaulting to savings-plan style pricing for a ${environmentLabel} workload with ${commitmentLabel}, prioritizing commitment savings while keeping more flexibility than 3-year reservations.${fallbackCopy}`;
    }

    return `Defaulting to spot pricing for a ${environmentLabel} workload with ${commitmentLabel}; verify interruption tolerance before using this as the operating scenario.${fallbackCopy}`;
  }

  private dataResidencyWarnings(nws: NormalizedWorkloadSpec): ComparisonWarning[] {
    const dataResidency = nws.workloadProfile?.dataResidency;

    if (!dataResidency?.complianceLocked) {
      return [];
    }

    const effectiveRegion = canonicalRegionForResidencyLock(
      nws.workload.region.preference,
      dataResidency.scope,
    );

    if (!effectiveRegion) {
      return [];
    }

    const requestedRegion = canonicalRegionForPreference(nws.workload.region.preference);

    if (requestedRegion === effectiveRegion) {
      return [];
    }

    return [
      {
        code: 'data_residency_region_adjusted',
        message: `Data residency lock '${dataResidency.scope}' constrained pricing to ${effectiveRegion}; requested region '${nws.workload.region.preference ?? 'provider default'}' is outside the allowed geography.`,
      },
    ];
  }

  private requirementSummary(nws: NormalizedWorkloadSpec): ComparisonResult['requirements'] {
    const profile = nws.workloadProfile;

    return {
      sourceType: nws.metadata.sourceType,
      workloadType: nws.workload.type,
      ...(nws.workload.name ? { workloadName: nws.workload.name } : {}),
      ...(nws.workload.region.preference
        ? { regionPreference: nws.workload.region.preference }
        : {}),
      availability: {
        multiAz: nws.availability.multiAz,
        multiRegion: nws.availability.multiRegion,
        ...(nws.availability.slaTarget ? { slaTarget: nws.availability.slaTarget } : {}),
        ...(nws.availability.faultTolerance
          ? { faultTolerance: nws.availability.faultTolerance }
          : {}),
      },
      ...(profile
        ? {
            workloadProfile: {
              ...(profile.environment ? { environment: profile.environment } : {}),
              ...(profile.commitmentPreferencePercent !== undefined
                ? { commitmentPreferencePercent: profile.commitmentPreferencePercent }
                : {}),
              ...(profile.dataResidency ? { dataResidency: profile.dataResidency } : {}),
              ...(profile.operatingSystem ? { operatingSystem: profile.operatingSystem } : {}),
              ...(profile.supportTier ? { supportTier: profile.supportTier } : {}),
              ...(profile.usagePattern ? { usagePattern: profile.usagePattern } : {}),
              ...(profile.tags && profile.tags.length > 0 ? { tags: profile.tags } : {}),
            },
          }
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
        ...(storage.objectCountThousand !== undefined
          ? { objectCountThousand: storage.objectCountThousand }
          : {}),
        ...(storage.objectRetentionDays !== undefined
          ? { objectRetentionDays: storage.objectRetentionDays }
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
        ...(storage.multiAttachEnabled !== undefined
          ? { multiAttachEnabled: storage.multiAttachEnabled }
          : {}),
      },
    }));
    const databaseRequirements: ServiceRequirement[] = nws.database.map((database) => ({
      serviceCategory: 'database',
      serviceType: databaseServiceType(database),
      instanceType: `${database.engine} - ${database.sizeGb ?? 'provider default'}GB`,
      tier: database.highAvailability ? 'high-availability' : 'single-zone',
      region,
      az: database.highAvailability ? 'multi-az' : 'single-az',
      quantity: 1,
      scaleParams: {
        role: database.role,
        engine: database.engine,
        ...(database.sizeGb !== undefined ? { sizeGb: database.sizeGb } : {}),
        ...(database.backupStorageGb !== undefined
          ? { backupStorageGb: database.backupStorageGb }
          : {}),
        ...(database.backupRetentionDays !== undefined
          ? { backupRetentionDays: database.backupRetentionDays }
          : {}),
        ...(database.provisionedIops !== undefined
          ? { provisionedIops: database.provisionedIops }
          : {}),
        ...(database.readReplicaCount !== undefined
          ? { readReplicaCount: database.readReplicaCount }
          : {}),
        ...(database.crossRegionReplicaTransferGb !== undefined
          ? { crossRegionReplicaTransferGb: database.crossRegionReplicaTransferGb }
          : {}),
        ...(database.nosqlReadRequestUnitsMillion !== undefined
          ? { nosqlReadRequestUnitsMillion: database.nosqlReadRequestUnitsMillion }
          : {}),
        ...(database.nosqlWriteRequestUnitsMillion !== undefined
          ? { nosqlWriteRequestUnitsMillion: database.nosqlWriteRequestUnitsMillion }
          : {}),
        ...(database.ruPerSecond !== undefined ? { ruPerSecond: database.ruPerSecond } : {}),
        ...(database.queryDataTb !== undefined ? { queryDataTb: database.queryDataTb } : {}),
        ...(database.cacheReplicaCount !== undefined
          ? { cacheReplicaCount: database.cacheReplicaCount }
          : {}),
        ...(database.storageGrowthGbPerMonth !== undefined
          ? { storageGrowthGbPerMonth: database.storageGrowthGbPerMonth }
          : {}),
        ...(database.searchNodeCount !== undefined
          ? { searchNodeCount: database.searchNodeCount }
          : {}),
        ...(database.searchNodeHours !== undefined
          ? { searchNodeHours: database.searchNodeHours }
          : {}),
        ...(database.searchStorageGb !== undefined
          ? { searchStorageGb: database.searchStorageGb }
          : {}),
        ...(database.searchQueriesMillion !== undefined
          ? { searchQueriesMillion: database.searchQueriesMillion }
          : {}),
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
                cdnTrafficGb: nws.network.cdnTrafficGb ?? 0,
                cdnCacheHitRatioPercent: nws.network.cdnCacheHitRatioPercent ?? 85,
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
              scaleParams: {
                loadBalancerProcessedGb: nws.network.loadBalancerProcessedGb ?? 0,
                loadBalancerHours: nws.network.loadBalancerHours ?? 0,
                loadBalancerNewConnectionsPerSecond:
                  nws.network.loadBalancerNewConnectionsPerSecond ?? 0,
                loadBalancerActiveConnections: nws.network.loadBalancerActiveConnections ?? 0,
                loadBalancerRuleEvaluationsPerSecond:
                  nws.network.loadBalancerRuleEvaluationsPerSecond ?? 0,
              },
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

const TENANCY_REFERENCE_HOST_VCPU = 64;

function tenancyHostMonthlyRate(providerId: ProviderId, tenancy: DedicatedComputeTenancy): number {
  switch (providerId) {
    case 'aws':
      return tenancy === 'sole-tenant' ? 2950 : 2950;
    case 'azure':
      return tenancy === 'sole-tenant' ? 3100 : 3100;
    case 'gcp':
      return tenancy === 'sole-tenant' ? 2850 : 2850;
  }
}

function tenancySharedVcpuHourlyRate(providerId: ProviderId): number {
  switch (providerId) {
    case 'aws':
      return 0.0208;
    case 'azure':
      return 0.0226;
    case 'gcp':
      return 0.02;
  }
}

function computeTenancyLabel(tenancy: DedicatedComputeTenancy): string {
  switch (tenancy) {
    case 'dedicated-host':
      return 'Dedicated host';
    case 'sole-tenant':
      return 'Sole-tenant';
  }
}

function tenancyDescriptorMatches(descriptor: string, tenancy: DedicatedComputeTenancy): boolean {
  if (tenancy === 'dedicated-host') {
    return /dedicated[- ]?(host|instance|tenancy)/i.test(descriptor);
  }

  return /sole[- ]?tenant|single[- ]tenant/i.test(descriptor);
}

function pricingModelDisplayName(model: PricingModelKey): string {
  switch (model) {
    case 'on-demand':
      return 'On-demand';
    case 'reserved-1yr':
      return 'Reserved 1 year';
    case 'reserved-3yr':
      return 'Reserved 3 year';
    case 'spot':
      return 'Spot';
    case 'savings-plan':
      return 'Savings / committed use';
  }
}

function tenancyPricingProviderTerm(providerId: ProviderId, model: PricingModelKey): string {
  switch (model) {
    case 'on-demand':
      return 'Dedicated capacity on-demand';
    case 'reserved-1yr':
      return tenancyCommitmentProviderTerm(providerId, 12);
    case 'reserved-3yr':
      return tenancyCommitmentProviderTerm(providerId, 36);
    case 'spot':
      return 'No spot discount modeled';
    case 'savings-plan':
      return tenancySavingsProviderTerm(providerId);
  }
}

function tenancyCommitmentProviderTerm(providerId: ProviderId, months: 12 | 36): string {
  switch (providerId) {
    case 'aws':
      return `Dedicated Host Reservation ${months / 12}yr`;
    case 'azure':
      return `Azure Dedicated Host reservation ${months / 12}yr`;
    case 'gcp':
      return `Sole-tenant committed use ${months / 12}yr`;
  }
}

function tenancySavingsProviderTerm(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'Savings Plan eligibility estimate';
    case 'azure':
      return 'Azure savings plan eligibility estimate';
    case 'gcp':
      return 'Committed-use eligibility estimate';
  }
}

type SupportTier = NonNullable<NormalizedWorkloadSpec['workloadProfile']>['supportTier'];

interface TieredSupportBracket {
  upTo?: number;
  rate: number;
}

const AWS_BUSINESS_SUPPORT_BRACKETS: TieredSupportBracket[] = [
  { upTo: 10_000, rate: 0.09 },
  { upTo: 80_000, rate: 0.07 },
  { upTo: 250_000, rate: 0.05 },
  { rate: 0.03 },
];

const AWS_ENTERPRISE_SUPPORT_BRACKETS: TieredSupportBracket[] = [
  { upTo: 150_000, rate: 0.1 },
  { upTo: 500_000, rate: 0.07 },
  { upTo: 1_000_000, rate: 0.05 },
  { rate: 0.03 },
];

const GCP_ENHANCED_SUPPORT_BRACKETS: TieredSupportBracket[] = [
  { upTo: 10_000, rate: 0.1 },
  { upTo: 80_000, rate: 0.07 },
  { upTo: 250_000, rate: 0.05 },
  { rate: 0.03 },
];

const GCP_PREMIUM_SUPPORT_BRACKETS: TieredSupportBracket[] = [
  { upTo: 150_000, rate: 0.1 },
  { upTo: 500_000, rate: 0.07 },
  { upTo: 1_000_000, rate: 0.05 },
  { rate: 0.03 },
];

function awsSupportCost(supportTier: SupportTier, subtotal: number): number {
  switch (supportTier) {
    case 'developer':
      return 29;
    case 'business':
      return Math.max(29, tieredSupportCharge(subtotal, AWS_BUSINESS_SUPPORT_BRACKETS));
    case 'enterprise':
      return Math.max(5_000, tieredSupportCharge(subtotal, AWS_ENTERPRISE_SUPPORT_BRACKETS));
    case 'none':
    case undefined:
      return 0;
  }
}

function azureSupportCost(supportTier: SupportTier): number {
  switch (supportTier) {
    case 'developer':
      return 29;
    case 'business':
      return 100;
    case 'enterprise':
      return 1_000;
    case 'none':
    case undefined:
      return 0;
  }
}

function gcpSupportCost(supportTier: SupportTier, subtotal: number): number {
  switch (supportTier) {
    case 'developer':
      return Math.max(29, subtotal * 0.03);
    case 'business':
      return Math.max(100, tieredSupportCharge(subtotal, GCP_ENHANCED_SUPPORT_BRACKETS));
    case 'enterprise':
      return Math.max(15_000, tieredSupportCharge(subtotal, GCP_PREMIUM_SUPPORT_BRACKETS));
    case 'none':
    case undefined:
      return 0;
  }
}

function tieredSupportCharge(subtotal: number, brackets: TieredSupportBracket[]): number {
  const chargeableSubtotal = Math.max(0, subtotal);
  let previousLimit = 0;
  let remaining = chargeableSubtotal;
  let charge = 0;

  for (const bracket of brackets) {
    if (remaining <= 0) {
      break;
    }

    const bracketSize =
      bracket.upTo === undefined ? remaining : Math.max(0, bracket.upTo - previousLimit);
    const taxableAmount = Math.min(remaining, bracketSize);

    charge += taxableAmount * bracket.rate;
    remaining -= taxableAmount;

    if (bracket.upTo !== undefined) {
      previousLimit = bracket.upTo;
    }
  }

  return charge;
}

function providerSupportPlanLabel(providerId: ProviderId, supportTier: SupportTier): string {
  switch (providerId) {
    case 'aws':
      return awsSupportPlanLabel(supportTier);
    case 'azure':
      return azureSupportPlanLabel(supportTier);
    case 'gcp':
      return gcpSupportPlanLabel(supportTier);
  }
}

function awsSupportPlanLabel(supportTier: SupportTier): string {
  switch (supportTier) {
    case 'developer':
      return 'Business Support+ minimum';
    case 'business':
      return 'Business Support+';
    case 'enterprise':
      return 'Enterprise Support';
    case 'none':
    case undefined:
      return 'No';
  }
}

function azureSupportPlanLabel(supportTier: SupportTier): string {
  switch (supportTier) {
    case 'developer':
      return 'Developer';
    case 'business':
      return 'Standard';
    case 'enterprise':
      return 'Professional Direct';
    case 'none':
    case undefined:
      return 'No';
  }
}

function gcpSupportPlanLabel(supportTier: SupportTier): string {
  switch (supportTier) {
    case 'developer':
      return 'Standard';
    case 'business':
      return 'Enhanced';
    case 'enterprise':
      return 'Premium';
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

function resilienceCapacityMultiplier(
  faultTolerance: NonNullable<NormalizedWorkloadSpec['availability']['faultTolerance']>,
): number {
  switch (faultTolerance) {
    case 'single-zone':
      return 1;
    case 'multi-az':
      return 1.2;
    case 'multi-region':
      return 1.65;
    case 'active-active':
      return 2;
  }
}

function resilienceStatefulOverheadFactor(
  faultTolerance: NonNullable<NormalizedWorkloadSpec['availability']['faultTolerance']>,
): number {
  switch (faultTolerance) {
    case 'single-zone':
      return 0;
    case 'multi-az':
      return 0.08;
    case 'multi-region':
      return 0.35;
    case 'active-active':
      return 1;
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
        storagePerGbMonth: {
          standard: 0.023,
          hot: 0.023,
          'intelligent-tiering': 0.023,
          'infrequent-access': 0.0125,
          'one-zone-infrequent-access': 0.01,
          'archive-instant': 0.004,
          archive: 0.0036,
          'deep-archive': 0.00099,
          cool: 0.0125,
          cold: 0.004,
          nearline: 0.0125,
          coldline: 0.004,
        },
        minimumDurationDays: {
          'infrequent-access': 30,
          'one-zone-infrequent-access': 30,
          'archive-instant': 90,
          archive: 90,
          'deep-archive': 180,
          cool: 30,
          cold: 90,
          nearline: 30,
          coldline: 90,
        },
        intelligentTieringMonitoringPerThousandObjects: 0.0025,
        replicationSameRegionPerGb: 0.01,
        replicationCrossRegionPerGb: 0.02,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.05,
        iopsMonth: 0.005,
        throughputMbpsMonth: 0.04,
        multiAttachPerGbMonth: 0.02,
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
        storagePerGbMonth: {
          standard: 0.0184,
          hot: 0.0184,
          cool: 0.01,
          cold: 0.0036,
          archive: 0.00099,
          'deep-archive': 0.00099,
          'infrequent-access': 0.01,
          nearline: 0.01,
          coldline: 0.0036,
          premium: 0.15,
          ultra: 0.18,
        },
        minimumDurationDays: {
          cool: 30,
          cold: 90,
          archive: 180,
          'deep-archive': 180,
          'infrequent-access': 30,
          nearline: 30,
          coldline: 90,
        },
        intelligentTieringMonitoringPerThousandObjects: 0.0025,
        replicationSameRegionPerGb: 0.008,
        replicationCrossRegionPerGb: 0.018,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.045,
        iopsMonth: 0.004,
        throughputMbpsMonth: 0.035,
        multiAttachPerGbMonth: 0.015,
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
        storagePerGbMonth: {
          standard: 0.02,
          hot: 0.02,
          nearline: 0.01,
          coldline: 0.004,
          archive: 0.0012,
          'deep-archive': 0.0012,
          cool: 0.01,
          cold: 0.004,
          'infrequent-access': 0.01,
        },
        minimumDurationDays: {
          nearline: 30,
          coldline: 90,
          archive: 365,
          'deep-archive': 365,
          cool: 30,
          cold: 90,
          'infrequent-access': 30,
        },
        intelligentTieringMonitoringPerThousandObjects: 0.0025,
        replicationSameRegionPerGb: 0.01,
        replicationCrossRegionPerGb: 0.02,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.026,
        iopsMonth: 0.0045,
        throughputMbpsMonth: 0.032,
        multiAttachPerGbMonth: 0.012,
      };
  }
}

function databaseDimensionRates(providerId: ProviderId): DatabaseDimensionRates {
  switch (providerId) {
    case 'aws':
      return {
        backupPerGbMonth: 0.095,
        provisionedIopsMonth: 0.1,
        readReplicaMonthlyFactor: 0.85,
        highAvailabilityStandbyFactor: 0.55,
        crossRegionReplicaTransferPerGb: 0.02,
        nosqlReadPerMillion: 0.25,
        nosqlWritePerMillion: 1.25,
        ruPerSecondMonth: 0.008,
        queryPerTb: 5,
        cacheReplicaMonthly: 45,
        storageGrowthPerGbMonth: 0.115,
        searchNodeHour: 0.24,
        searchStoragePerGbMonth: 0.135,
        searchQueryPerMillion: 0,
      };
    case 'azure':
      return {
        backupPerGbMonth: 0.1,
        provisionedIopsMonth: 0.065,
        readReplicaMonthlyFactor: 0.9,
        highAvailabilityStandbyFactor: 0.6,
        crossRegionReplicaTransferPerGb: 0.018,
        nosqlReadPerMillion: 0.3,
        nosqlWritePerMillion: 1.2,
        ruPerSecondMonth: 0.008,
        queryPerTb: 5,
        cacheReplicaMonthly: 42,
        storageGrowthPerGbMonth: 0.12,
        searchNodeHour: 0.336,
        searchStoragePerGbMonth: 0.1,
        searchQueryPerMillion: 0,
      };
    case 'gcp':
      return {
        backupPerGbMonth: 0.08,
        provisionedIopsMonth: 0.065,
        readReplicaMonthlyFactor: 0.85,
        highAvailabilityStandbyFactor: 0.55,
        crossRegionReplicaTransferPerGb: 0.02,
        nosqlReadPerMillion: 0.18,
        nosqlWritePerMillion: 1.08,
        ruPerSecondMonth: 0.0075,
        queryPerTb: 5,
        cacheReplicaMonthly: 40,
        storageGrowthPerGbMonth: 0.17,
        searchNodeHour: 0.008219,
        searchStoragePerGbMonth: 5,
        searchQueryPerMillion: 1500,
      };
  }
}

function databaseServiceType(
  database: NormalizedWorkloadSpec['database'][number],
): 'cache' | 'managed-search' | 'nosql-database' | 'relational-database' {
  if (databaseHasManagedSearchAssumption(database)) {
    return 'managed-search';
  }

  if (database.engine === 'redis') {
    return 'cache';
  }

  if (database.engine === 'mongodb' || database.engine === 'generic_nosql') {
    return 'nosql-database';
  }

  return 'relational-database';
}

function databaseComponentsFromRequirements(
  nws: NormalizedWorkloadSpec,
): NormalizedWorkloadSpec['database'] {
  return (nws.serviceRequirements ?? [])
    .filter(
      (requirement) =>
        requirement.serviceCategory === 'database' && requirement.serviceType.includes('search'),
    )
    .map((requirement) => {
      const searchNodeCount = scaleParamNumber(requirement.scaleParams, 'searchNodeCount');
      const searchNodeHours =
        scaleParamNumber(requirement.scaleParams, 'searchNodeHours') ||
        (searchNodeCount > 0 ? HOURS_PER_MONTH : 0);
      const searchStorageGb = scaleParamNumber(requirement.scaleParams, 'searchStorageGb');
      const searchQueriesMillion = scaleParamNumber(
        requirement.scaleParams,
        'searchQueriesMillion',
      );
      const sizeGb =
        scaleParamNumber(requirement.scaleParams, 'databaseSizeGb') ||
        scaleParamNumber(requirement.scaleParams, 'sizeGb') ||
        searchStorageGb;

      return {
        role: String(requirement.scaleParams?.databaseRole ?? requirement.serviceType),
        engine: 'generic_nosql' as const,
        ...(sizeGb > 0 ? { sizeGb } : {}),
        highAvailability: scaleParamBoolean(requirement.scaleParams, 'databaseHighAvailability'),
        ...(searchNodeCount > 0 ? { searchNodeCount } : {}),
        ...(searchNodeHours > 0 ? { searchNodeHours } : {}),
        ...(searchStorageGb > 0 ? { searchStorageGb } : {}),
        ...(searchQueriesMillion > 0 ? { searchQueriesMillion } : {}),
      };
    });
}

function scaleParamNumber(
  scaleParams: ServiceRequirement['scaleParams'] | undefined,
  key: string,
): number {
  const value = scaleParams?.[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return 0;
}

function scaleParamBoolean(
  scaleParams: ServiceRequirement['scaleParams'] | undefined,
  key: string,
): boolean {
  const value = scaleParams?.[key];

  return value === true || value === 'true';
}

function databaseHasManagedSearchAssumption(
  database: NormalizedWorkloadSpec['database'][number],
): boolean {
  return (
    (database.searchNodeCount !== undefined && database.searchNodeCount > 0) ||
    (database.searchStorageGb !== undefined && database.searchStorageGb > 0) ||
    (database.searchQueriesMillion !== undefined && database.searchQueriesMillion > 0)
  );
}

function providerManagedSearchLabel(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'Amazon OpenSearch Service';
    case 'azure':
      return 'Azure AI Search';
    case 'gcp':
      return 'Google Cloud Search / Vertex AI Search';
  }
}

function supportingServicesRates(providerId: ProviderId): SupportingServicesRates {
  switch (providerId) {
    case 'aws':
      return {
        metricPerMillion: 0.3,
        logIngestPerGb: 0.5,
        logRetentionPerGbMonth: 0.03,
        alarmMonthly: 0.1,
        dashboardMonthly: 3,
        tracePerMillion: 5,
        secretMonthly: 0.4,
        secretApiPerTenThousand: 0.05,
        securityResourceMonthly: 0.03,
        securityFindingPerThousand: 0.2,
        wafAclMonthly: 5,
        wafRuleMonthly: 1,
        wafRequestPerMillion: 0.6,
        ddosProtectedResourceMonthly: 3000,
      };
    case 'azure':
      return {
        metricPerMillion: 0.258,
        logIngestPerGb: 2.76,
        logRetentionPerGbMonth: 0.12,
        alarmMonthly: 0.1,
        dashboardMonthly: 3,
        tracePerMillion: 2.3,
        secretMonthly: 0.03,
        secretApiPerTenThousand: 0.03,
        securityResourceMonthly: 0.02,
        securityFindingPerThousand: 0.15,
        wafAclMonthly: 20,
        wafRuleMonthly: 1,
        wafRequestPerMillion: 0.6,
        ddosProtectedResourceMonthly: 199,
      };
    case 'gcp':
      return {
        metricPerMillion: 0.258,
        logIngestPerGb: 0.5,
        logRetentionPerGbMonth: 0.01,
        alarmMonthly: 0.1,
        dashboardMonthly: 3,
        tracePerMillion: 0.2,
        secretMonthly: 0.06,
        secretApiPerTenThousand: 0.03,
        securityResourceMonthly: 0.02,
        securityFindingPerThousand: 0.1,
        wafAclMonthly: 5,
        wafRuleMonthly: 1,
        wafRequestPerMillion: 0.75,
        ddosProtectedResourceMonthly: 3000,
      };
  }
}

function supportingServicesAssumptions(
  requirements: ServiceRequirement[],
): Record<
  | 'observabilityMetricsMillion'
  | 'observabilityLogsIngestGb'
  | 'observabilityLogRetentionGb'
  | 'observabilityAlarms'
  | 'observabilityDashboards'
  | 'observabilityTracesMillion'
  | 'secretsCount'
  | 'secretApiCallsTenThousand'
  | 'securityProtectedResources'
  | 'securityFindingsThousand'
  | 'wafWebAclCount'
  | 'wafRuleCount'
  | 'wafRequestsMillion'
  | 'ddosProtectedResources',
  number
> {
  return {
    observabilityMetricsMillion: maxScaleParam(requirements, 'observabilityMetricsMillion'),
    observabilityLogsIngestGb: maxScaleParam(requirements, 'observabilityLogsIngestGb'),
    observabilityLogRetentionGb: maxScaleParam(requirements, 'observabilityLogRetentionGb'),
    observabilityAlarms: maxScaleParam(requirements, 'observabilityAlarms'),
    observabilityDashboards: maxScaleParam(requirements, 'observabilityDashboards'),
    observabilityTracesMillion: maxScaleParam(requirements, 'observabilityTracesMillion'),
    secretsCount: maxScaleParam(requirements, 'secretsCount'),
    secretApiCallsTenThousand: maxScaleParam(requirements, 'secretApiCallsTenThousand'),
    securityProtectedResources: maxScaleParam(requirements, 'securityProtectedResources'),
    securityFindingsThousand: maxScaleParam(requirements, 'securityFindingsThousand'),
    wafWebAclCount: maxScaleParam(requirements, 'wafWebAclCount'),
    wafRuleCount: maxScaleParam(requirements, 'wafRuleCount'),
    wafRequestsMillion: maxScaleParam(requirements, 'wafRequestsMillion'),
    ddosProtectedResources: maxScaleParam(requirements, 'ddosProtectedResources'),
  };
}

function maxScaleParam(requirements: ServiceRequirement[], key: string): number {
  return Math.max(
    0,
    ...requirements.map((requirement) => {
      const value = requirement.scaleParams?.[key];

      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }),
  );
}

function runtimeServicesRates(providerId: ProviderId): RuntimeServicesRates {
  switch (providerId) {
    case 'aws':
      return {
        functionRequestPerMillion: 0.2,
        functionGbSecond: 0.0000166667,
        appPlatformRequestPerMillion: 0,
        appPlatformVcpuHour: 0.064,
        appPlatformMemoryGbHour: 0.007,
        appPlatformAlwaysOnVcpuHour: 0.064,
        appPlatformAlwaysOnMemoryGbHour: 0.007,
        kubernetesControlPlaneMonthly: 73,
        kubernetesNodeOverheadMonthly: 8,
        registryStoragePerGbMonth: 0.1,
        registryEgressPerGb: 0.09,
      };
    case 'azure':
      return {
        functionRequestPerMillion: 0.2,
        functionGbSecond: 0.000016,
        appPlatformRequestPerMillion: 0.4,
        appPlatformVcpuHour: 0.0864,
        appPlatformMemoryGbHour: 0.009,
        appPlatformAlwaysOnVcpuHour: 0.095,
        appPlatformAlwaysOnMemoryGbHour: 0.012,
        kubernetesControlPlaneMonthly: 0,
        kubernetesNodeOverheadMonthly: 6,
        registryStoragePerGbMonth: 0.167,
        registryEgressPerGb: 0.087,
      };
    case 'gcp':
      return {
        functionRequestPerMillion: 0.4,
        functionGbSecond: 0.0000025,
        appPlatformRequestPerMillion: 0.4,
        appPlatformVcpuHour: 0.0864,
        appPlatformMemoryGbHour: 0.009,
        appPlatformAlwaysOnVcpuHour: 0.0648,
        appPlatformAlwaysOnMemoryGbHour: 0.00675,
        kubernetesControlPlaneMonthly: 73,
        kubernetesNodeOverheadMonthly: 7,
        registryStoragePerGbMonth: 0.1,
        registryEgressPerGb: 0.12,
      };
  }
}

function runtimeServicesAssumptions(
  requirements: ServiceRequirement[],
): Record<
  | 'functionInvocationsMillion'
  | 'functionDurationMs'
  | 'functionMemoryMb'
  | 'appPlatformRequestsMillion'
  | 'appPlatformRequestDurationMs'
  | 'appPlatformVcpu'
  | 'appPlatformMemoryGb'
  | 'appPlatformAlwaysOnHours'
  | 'appPlatformMinInstances'
  | 'kubernetesClusterCount'
  | 'kubernetesWorkerNodeCount'
  | 'registryStorageGb'
  | 'registryEgressGb',
  number
> {
  return {
    functionInvocationsMillion: maxScaleParam(requirements, 'functionInvocationsMillion'),
    functionDurationMs: maxScaleParam(requirements, 'functionDurationMs') || 100,
    functionMemoryMb: maxScaleParam(requirements, 'functionMemoryMb') || 512,
    appPlatformRequestsMillion: maxScaleParam(requirements, 'appPlatformRequestsMillion'),
    appPlatformRequestDurationMs:
      maxScaleParam(requirements, 'appPlatformRequestDurationMs') || 400,
    appPlatformVcpu: maxScaleParam(requirements, 'appPlatformVcpu') || 1,
    appPlatformMemoryGb: maxScaleParam(requirements, 'appPlatformMemoryGb') || 0.5,
    appPlatformAlwaysOnHours:
      maxScaleParam(requirements, 'appPlatformAlwaysOnHours') || HOURS_PER_MONTH,
    appPlatformMinInstances: maxScaleParam(requirements, 'appPlatformMinInstances') || 1,
    kubernetesClusterCount: maxScaleParam(requirements, 'kubernetesClusterCount'),
    kubernetesWorkerNodeCount: maxScaleParam(requirements, 'kubernetesWorkerNodeCount'),
    registryStorageGb: maxScaleParam(requirements, 'registryStorageGb'),
    registryEgressGb: maxScaleParam(requirements, 'registryEgressGb'),
  };
}

function analyticsServicesRates(providerId: ProviderId): AnalyticsServicesRates {
  switch (providerId) {
    case 'aws':
      return {
        warehouseStoragePerGbMonth: 0.024,
        warehouseQueryPerTb: 5,
        dataLakeStoragePerGbMonth: 0.023,
        integrationJobHour: 0.44,
        streamingIngestPerGb: 0.014,
        biUserMonthly: 24,
      };
    case 'azure':
      return {
        warehouseStoragePerGbMonth: 0.024,
        warehouseQueryPerTb: 5,
        dataLakeStoragePerGbMonth: 0.0208,
        integrationJobHour: 0.25,
        streamingIngestPerGb: 0.03,
        biUserMonthly: 10,
      };
    case 'gcp':
      return {
        warehouseStoragePerGbMonth: 0.02,
        warehouseQueryPerTb: 6.25,
        dataLakeStoragePerGbMonth: 0.02,
        integrationJobHour: 0.18,
        streamingIngestPerGb: 0.04,
        biUserMonthly: 30,
      };
  }
}

function analyticsServicesAssumptions(
  requirements: ServiceRequirement[],
): Record<
  | 'analyticsWarehouseStorageGb'
  | 'analyticsWarehouseQueryTb'
  | 'analyticsDataLakeStorageGb'
  | 'analyticsIntegrationJobHours'
  | 'analyticsStreamingIngestGb'
  | 'analyticsBiUsers',
  number
> {
  return {
    analyticsWarehouseStorageGb: maxScaleParam(requirements, 'analyticsWarehouseStorageGb'),
    analyticsWarehouseQueryTb: maxScaleParam(requirements, 'analyticsWarehouseQueryTb'),
    analyticsDataLakeStorageGb: maxScaleParam(requirements, 'analyticsDataLakeStorageGb'),
    analyticsIntegrationJobHours: maxScaleParam(requirements, 'analyticsIntegrationJobHours'),
    analyticsStreamingIngestGb: maxScaleParam(requirements, 'analyticsStreamingIngestGb'),
    analyticsBiUsers: maxScaleParam(requirements, 'analyticsBiUsers'),
  };
}

function aiServicesRates(providerId: ProviderId): AiServicesRates {
  switch (providerId) {
    case 'aws':
      return {
        trainingGpuHour: 3.06,
        modelHostingHour: 0.24,
        inferenceRequestPerMillion: 0.2,
        vectorStoragePerGbMonth: 0.25,
        vectorQueryPerMillion: 0.1,
        apiInputTokenPerMillion: 0.8,
        apiOutputTokenPerMillion: 2.4,
      };
    case 'azure':
      return {
        trainingGpuHour: 3.67,
        modelHostingHour: 0.28,
        inferenceRequestPerMillion: 0.18,
        vectorStoragePerGbMonth: 0.23,
        vectorQueryPerMillion: 0.12,
        apiInputTokenPerMillion: 0.5,
        apiOutputTokenPerMillion: 1.5,
      };
    case 'gcp':
      return {
        trainingGpuHour: 2.93,
        modelHostingHour: 0.22,
        inferenceRequestPerMillion: 0.25,
        vectorStoragePerGbMonth: 0.2,
        vectorQueryPerMillion: 0.08,
        apiInputTokenPerMillion: 0.35,
        apiOutputTokenPerMillion: 1.05,
      };
  }
}

function aiServicesAssumptions(
  requirements: ServiceRequirement[],
): Record<
  | 'aiTrainingGpuHours'
  | 'aiModelHostingHours'
  | 'aiInferenceRequestsMillion'
  | 'aiVectorStorageGb'
  | 'aiVectorQueriesMillion'
  | 'aiApiInputTokensMillion'
  | 'aiApiOutputTokensMillion',
  number
> {
  return {
    aiTrainingGpuHours: maxScaleParam(requirements, 'aiTrainingGpuHours'),
    aiModelHostingHours: maxScaleParam(requirements, 'aiModelHostingHours'),
    aiInferenceRequestsMillion: maxScaleParam(requirements, 'aiInferenceRequestsMillion'),
    aiVectorStorageGb: maxScaleParam(requirements, 'aiVectorStorageGb'),
    aiVectorQueriesMillion: maxScaleParam(requirements, 'aiVectorQueriesMillion'),
    aiApiInputTokensMillion: maxScaleParam(requirements, 'aiApiInputTokensMillion'),
    aiApiOutputTokensMillion: maxScaleParam(requirements, 'aiApiOutputTokensMillion'),
  };
}

function integrationServicesRates(providerId: ProviderId): IntegrationServicesRates {
  switch (providerId) {
    case 'aws':
      return {
        queueMessagePerMillion: 0.4,
        eventRoutingPerMillion: 1,
        workflowTransitionPerThousand: 0.025,
        apiGatewayRequestPerMillion: 3.5,
      };
    case 'azure':
      return {
        queueMessagePerMillion: 0.05,
        eventRoutingPerMillion: 0.6,
        workflowTransitionPerThousand: 0.025,
        apiGatewayRequestPerMillion: 3.5,
      };
    case 'gcp':
      return {
        queueMessagePerMillion: 0.4,
        eventRoutingPerMillion: 0.6,
        workflowTransitionPerThousand: 0.025,
        apiGatewayRequestPerMillion: 3,
      };
  }
}

function integrationServicesAssumptions(
  requirements: ServiceRequirement[],
): Record<
  | 'integrationQueueMessagesMillion'
  | 'integrationEventsMillion'
  | 'integrationWorkflowTransitionsThousand'
  | 'integrationApiGatewayRequestsMillion',
  number
> {
  return {
    integrationQueueMessagesMillion: maxScaleParam(requirements, 'integrationQueueMessagesMillion'),
    integrationEventsMillion: maxScaleParam(requirements, 'integrationEventsMillion'),
    integrationWorkflowTransitionsThousand: maxScaleParam(
      requirements,
      'integrationWorkflowTransitionsThousand',
    ),
    integrationApiGatewayRequestsMillion: maxScaleParam(
      requirements,
      'integrationApiGatewayRequestsMillion',
    ),
  };
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
        loadBalancerLcuHour: 0.008,
        vpnConnectionHourly: 0.05,
        vpnDataTransferPerGb: 0.09,
        privateCircuitPortHourly: 0.3,
        privateCircuitDataTransferPerGb: 0.02,
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
        loadBalancerLcuHour: 0.008,
        vpnConnectionHourly: 0.05,
        vpnDataTransferPerGb: 0.087,
        privateCircuitPortHourly: 0.42,
        privateCircuitDataTransferPerGb: 0.025,
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
        loadBalancerLcuHour: 0.008,
        vpnConnectionHourly: 0.05,
        vpnDataTransferPerGb: 0.12,
        privateCircuitPortHourly: 2.428,
        privateCircuitDataTransferPerGb: 0.02,
      };
  }
}

function loadBalancerLcuProfile(
  network: NormalizedWorkloadSpec['network'],
  hours: number,
  processedGb: number,
): { dominantDriver: string; lcuHours: number; peakLcu: number } {
  const effectiveHours = Math.max(1, hours);
  const processedGbPerHour = processedGb / effectiveHours;
  const dimensions = [
    {
      driver: 'new connections',
      lcu: (network.loadBalancerNewConnectionsPerSecond ?? 0) / 25,
    },
    {
      driver: 'active connections',
      lcu: (network.loadBalancerActiveConnections ?? 0) / 3000,
    },
    {
      driver: 'processed bandwidth',
      lcu: processedGbPerHour,
    },
    {
      driver: 'rule evaluations',
      lcu: (network.loadBalancerRuleEvaluationsPerSecond ?? 0) / 1000,
    },
  ].sort((left, right) => right.lcu - left.lcu);
  const dominant = dimensions[0];
  const peakLcu = Math.max(0, dominant?.lcu ?? 0);

  return {
    dominantDriver: dominant?.driver ?? 'capacity dimensions',
    lcuHours: peakLcu * hours,
    peakLcu,
  };
}
