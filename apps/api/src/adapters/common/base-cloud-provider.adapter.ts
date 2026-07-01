import { NWSValidator } from '../../nws/nws-validator';
import { NormalizedWorkloadSpec } from '../../nws/nws.types';
import {
  calculateEgressCost,
  EgressTierRate,
} from '../../pricing-normalization/egress-tier-calculator';
import {
  canonicalRegionForProviderRegion,
  providerRegionForCanonicalRegion,
} from '../../pricing-normalization/region-map';
import {
  CloudProviderAdapter,
  CostComponent,
  PricingCatalogReader,
  PricingCatalogRecord,
  PricingModelCost,
  PricingModelKey,
  ProviderId,
  ProviderPricingLineItem,
  ProviderPricingResult,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from './cloud-provider-adapter';
import { AdapterPricingError } from './adapter-errors';
import { HOURS_PER_MONTH } from '../../cost-time';
import {
  normalizeInstanceFamily,
  NormalizedInstanceFamily,
} from '../../pricing-normalization/family-normalizer';

const CATALOG_COMMITMENT_PRICING_MODELS: PricingModelKey[] = ['reserved-1yr', 'reserved-3yr'];
const ESTIMATED_COMPUTE_PRICING_MODELS: PricingModelKey[] = ['spot', 'savings-plan'];
const PRICING_MODEL_UNAVAILABLE = 'Not available for this configuration.';

type ComputeProcessorArchitecture = NonNullable<
  NormalizedWorkloadSpec['compute'][number]['processorArchitecture']
>;
type ComputeTenancy = NonNullable<NormalizedWorkloadSpec['compute'][number]['tenancy']>;

interface CostCalculation {
  hourlyCostUsd: number;
  monthlyCostUsd: number;
  pricingBasis: 'flat' | 'tiered';
  egressTiers?: Array<{
    tierFromGb: number;
    tierToGb?: number;
    pricePerGb: number;
    billableGb: number;
    monthlyCostUsd: number;
  }>;
}

export abstract class BaseCloudProviderAdapter implements CloudProviderAdapter {
  abstract readonly providerId: ProviderId;

  protected constructor(
    private readonly catalogReader: PricingCatalogReader,
    private readonly defaultRegion: string,
  ) {}

  async priceWorkload(input: unknown): Promise<ProviderPricingResult> {
    const nws = NWSValidator.validate(input);
    const region = this.providerRegionForPreference(nws.workload.region.preference);
    const lineItems: ProviderPricingLineItem[] = [];

    for (const component of nws.compute) {
      const record = await this.selectComputeRecord(
        region,
        component.vcpu,
        component.memoryGb,
        'on-demand',
        component.instanceFamily,
        component.processorArchitecture,
        component.tenancy,
      );
      const quantity =
        component.scalingType === 'autoscaling' && component.autoscalingRange
          ? (component.autoscalingRange.min + component.autoscalingRange.max) / 2
          : (component.instanceCount ?? 1);

      lineItems.push(
        this.toLineItem('compute', record, quantity, `${component.role} compute`, {
          pricingModels: await this.computePricingModels(
            region,
            component.vcpu,
            component.memoryGb,
            quantity,
            record,
            component.instanceFamily,
            component.processorArchitecture,
            component.tenancy,
          ),
        }),
      );
    }

    for (const component of nws.storage) {
      const record = await this.selectRecord('storage', region, (candidate) => {
        const type = candidate.attributes?.type;
        const accessPattern = candidate.attributes?.accessPattern;
        return (
          (type === undefined || type === component.type) &&
          (accessPattern === undefined ||
            component.accessPattern === undefined ||
            accessPattern === component.accessPattern)
        );
      });

      lineItems.push(
        this.toLineItem('storage', record, component.sizeGb, `${component.role} storage`),
      );
    }

    for (const component of nws.database) {
      const record = await this.selectRecord('database', region, (candidate) => {
        const engine = candidate.attributes?.engine;
        return (
          candidate.attributes?.usage !== 'storage' &&
          (engine === undefined || engine === component.engine)
        );
      });

      lineItems.push(this.toLineItem('database', record, 1, `${component.role} database`));

      if (component.sizeGb !== undefined) {
        const storageRecord = await this.selectOptionalRecord(
          'database',
          region,
          (candidate) => candidate.attributes?.usage === 'storage',
        );

        if (storageRecord) {
          lineItems.push(
            this.toLineItem(
              'database',
              storageRecord,
              component.sizeGb,
              `${component.role} database storage`,
            ),
          );
        }
      }
    }

    if (nws.network.estimatedMonthlyEgressGb && nws.network.estimatedMonthlyEgressGb > 0) {
      const record = await this.selectRecord('network', region);
      lineItems.push(
        this.toLineItem('network', record, nws.network.estimatedMonthlyEgressGb, 'internet egress'),
      );
    }

    const baseMonthlyCostUsd = this.roundCurrency(
      lineItems.reduce((sum, item) => sum + item.baseMonthlyCostUsd, 0),
    );
    const baseHourlyCostUsd = this.roundCurrency(
      lineItems.reduce(
        (sum, item) => sum + (item.baseHourlyCostUsd ?? item.baseMonthlyCostUsd / HOURS_PER_MONTH),
        0,
      ),
    );

    return {
      providerId: this.providerId,
      lineItems,
      baseHourlyCostUsd,
      baseMonthlyCostUsd,
    };
  }

  abstract refreshPricingCatalog(
    options?: RefreshPricingCatalogOptions,
  ): Promise<PricingCatalogRecord[]>;

  abstract refreshLivePricing(
    serviceIds: string[],
    options?: RefreshPricingCatalogOptions,
  ): Promise<PricingCatalogRecord[]>;

  private providerRegionForPreference(regionPreference: string | undefined): string {
    const preference = regionPreference?.trim();

    if (!preference) {
      return this.defaultRegion;
    }

    const canonicalRegion = canonicalRegionForProviderRegion(preference) ?? preference;

    return providerRegionForCanonicalRegion(canonicalRegion, this.providerId) ?? preference;
  }

  protected async findCatalogRecords(
    category: ServiceCategory,
    region: string,
  ): Promise<PricingCatalogRecord[]> {
    const exactMatches = await this.catalogReader.find({
      provider: this.providerId,
      category,
      region,
    });

    if (exactMatches.length > 0 || region === this.defaultRegion) {
      return exactMatches;
    }

    const fallbackMatches = await this.catalogReader.find({
      provider: this.providerId,
      category,
      region: this.defaultRegion,
    });

    return fallbackMatches.map((record) => ({
      ...record,
      attributes: {
        ...(record.attributes ?? {}),
        isApproximate: true,
        regionFallbackFrom: region,
        regionFallbackTo: this.defaultRegion,
      },
    }));
  }

  private async selectComputeRecord(
    region: string,
    vcpu?: number,
    memoryGb?: number,
    pricingModel: PricingModelKey = 'on-demand',
    instanceFamily?: NormalizedInstanceFamily,
    processorArchitecture?: ComputeProcessorArchitecture,
    tenancy?: ComputeTenancy,
  ): Promise<PricingCatalogRecord> {
    const record = await this.selectOptionalComputeRecord(
      region,
      vcpu,
      memoryGb,
      pricingModel,
      instanceFamily,
      processorArchitecture,
      tenancy,
    );

    if (!record) {
      throw new AdapterPricingError(
        this.providerId,
        `no compute pricing catalog record found for region ${region}`,
      );
    }

    return record;
  }

  private async selectOptionalComputeRecord(
    region: string,
    vcpu: number | undefined,
    memoryGb: number | undefined,
    pricingModel: PricingModelKey,
    instanceFamily?: NormalizedInstanceFamily,
    processorArchitecture?: ComputeProcessorArchitecture,
    tenancy?: ComputeTenancy,
  ): Promise<PricingCatalogRecord | undefined> {
    const records = await this.findCatalogRecords('compute', region);
    let candidates = records.filter(
      this.computeRecordPredicate(
        vcpu,
        memoryGb,
        pricingModel,
        instanceFamily,
        processorArchitecture,
        tenancy,
      ),
    );

    if (candidates.length === 0 && (instanceFamily || processorArchitecture || tenancy)) {
      candidates = records
        .filter(this.computeRecordPredicate(vcpu, memoryGb, pricingModel))
        .map((record) => ({
          ...record,
          attributes: {
            ...(record.attributes ?? {}),
            isApproximate: true,
            familyFallbackFrom: instanceFamily,
            familyFallbackTo: this.recordInstanceFamily(record) ?? 'unspecified',
            architectureFallbackFrom: processorArchitecture,
            architectureFallbackTo: this.recordProcessorArchitecture(record) ?? 'unspecified',
            tenancyFallbackFrom: tenancy,
            tenancyFallbackTo: this.recordComputeTenancy(record) ?? 'unspecified',
          },
        }));
    }

    const selected = candidates.sort((left, right) => {
      const leftFamilyRank = this.instanceFamilyFitRank(left, instanceFamily);
      const rightFamilyRank = this.instanceFamilyFitRank(right, instanceFamily);
      const leftArchitectureRank = this.processorArchitectureFitRank(left, processorArchitecture);
      const rightArchitectureRank = this.processorArchitectureFitRank(right, processorArchitecture);
      const leftTenancyRank = this.computeTenancyFitRank(left, tenancy);
      const rightTenancyRank = this.computeTenancyFitRank(right, tenancy);

      if (leftFamilyRank !== rightFamilyRank) {
        return leftFamilyRank - rightFamilyRank;
      }

      if (leftArchitectureRank !== rightArchitectureRank) {
        return leftArchitectureRank - rightArchitectureRank;
      }

      if (leftTenancyRank !== rightTenancyRank) {
        return leftTenancyRank - rightTenancyRank;
      }

      const leftRank = this.resourceFitRank(left);
      const rightRank = this.resourceFitRank(right);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.unitPriceUsd - right.unitPriceUsd;
    })[0];

    return this.annotateComputeIntentApproximation(
      selected,
      instanceFamily,
      processorArchitecture,
      tenancy,
    );
  }

  private computeRecordPredicate(
    vcpu: number | undefined,
    memoryGb: number | undefined,
    pricingModel: PricingModelKey,
    instanceFamily?: NormalizedInstanceFamily,
    processorArchitecture?: ComputeProcessorArchitecture,
    tenancy?: ComputeTenancy,
  ): (record: PricingCatalogRecord) => boolean {
    return (candidate) => {
      const candidateVcpu = this.numberAttribute(candidate, 'vcpu');
      const candidateMemoryGb = this.numberAttribute(candidate, 'memoryGb');
      const candidateFamily = this.recordInstanceFamily(candidate);
      const candidateArchitecture = this.recordProcessorArchitecture(candidate);
      const candidateTenancy = this.recordComputeTenancy(candidate);

      return (
        this.matchesPricingModel(candidate, pricingModel) &&
        (instanceFamily === undefined ||
          candidateFamily === undefined ||
          candidateFamily === instanceFamily) &&
        (processorArchitecture === undefined ||
          candidateArchitecture === undefined ||
          candidateArchitecture === processorArchitecture) &&
        (tenancy === undefined || candidateTenancy === undefined || candidateTenancy === tenancy) &&
        (vcpu === undefined || candidateVcpu === undefined || candidateVcpu >= vcpu) &&
        (memoryGb === undefined || candidateMemoryGb === undefined || candidateMemoryGb >= memoryGb)
      );
    };
  }

  private async computePricingModels(
    region: string,
    vcpu: number | undefined,
    memoryGb: number | undefined,
    quantity: number,
    onDemandRecord: PricingCatalogRecord,
    instanceFamily?: NormalizedInstanceFamily,
    processorArchitecture?: ComputeProcessorArchitecture,
    tenancy?: ComputeTenancy,
  ): Promise<PricingModelCost[]> {
    const models: PricingModelCost[] = [
      {
        model: 'on-demand',
        available: true,
        ...this.pricingModelMetadata('on-demand', onDemandRecord),
        ...this.pricingModelCost(onDemandRecord, quantity),
      },
    ];

    for (const pricingModel of CATALOG_COMMITMENT_PRICING_MODELS) {
      const record = await this.selectOptionalComputeRecord(
        region,
        vcpu,
        memoryGb,
        pricingModel,
        instanceFamily,
        processorArchitecture,
        tenancy,
      );

      if (!record) {
        models.push({
          model: pricingModel,
          available: false,
          ...this.pricingModelMetadata(pricingModel, onDemandRecord),
          unavailableReason: PRICING_MODEL_UNAVAILABLE,
        });
        continue;
      }

      models.push({
        model: pricingModel,
        available: true,
        ...this.pricingModelMetadata(pricingModel, record),
        ...this.pricingModelCost(record, quantity),
      });
    }

    for (const pricingModel of ESTIMATED_COMPUTE_PRICING_MODELS) {
      models.push(this.estimatedComputePricingModel(pricingModel, onDemandRecord, quantity));
    }

    return models;
  }

  private matchesPricingModel(
    record: PricingCatalogRecord,
    pricingModel: PricingModelKey,
  ): boolean {
    const recordPricingModel = record.attributes?.pricingModel;

    if (pricingModel === 'on-demand') {
      return recordPricingModel === undefined || recordPricingModel === 'on-demand';
    }

    return recordPricingModel === pricingModel;
  }

  private async selectRecord(
    category: ServiceCategory,
    region: string,
    predicate: (record: PricingCatalogRecord) => boolean = () => true,
  ): Promise<PricingCatalogRecord> {
    const record = await this.selectOptionalRecord(category, region, predicate);

    if (!record) {
      throw new AdapterPricingError(
        this.providerId,
        `no ${category} pricing catalog record found for region ${region}`,
      );
    }

    return record;
  }

  private async selectOptionalRecord(
    category: ServiceCategory,
    region: string,
    predicate: (record: PricingCatalogRecord) => boolean,
  ): Promise<PricingCatalogRecord | undefined> {
    const candidates = (await this.findCatalogRecords(category, region)).filter(predicate);

    return candidates.sort((left, right) => {
      const leftRank = this.resourceFitRank(left);
      const rightRank = this.resourceFitRank(right);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.unitPriceUsd - right.unitPriceUsd;
    })[0];
  }

  private toLineItem(
    category: ServiceCategory,
    record: PricingCatalogRecord,
    quantity: number,
    descriptionPrefix: string,
    options: {
      costComponent?: CostComponent;
      pricingModels?: PricingModelCost[];
    } = {},
  ): ProviderPricingLineItem {
    const cost = this.monthlyCost(record, quantity);

    return {
      category,
      costComponent: options.costComponent ?? this.costComponentForCategory(category),
      description: `${descriptionPrefix}: ${record.serviceName}`,
      isApproximate: record.attributes?.isApproximate === true,
      baseHourlyCostUsd: cost.hourlyCostUsd,
      baseMonthlyCostUsd: cost.monthlyCostUsd,
      skuId: record.skuId,
      region: record.region,
      unit: record.unit,
      unitPriceUsd: record.unitPriceUsd,
      pricingBasis: cost.pricingBasis,
      ...(cost.egressTiers && cost.egressTiers.length > 0 ? { egressTiers: cost.egressTiers } : {}),
      ...(options.pricingModels ? { pricingModels: options.pricingModels } : {}),
    };
  }

  private monthlyCost(record: PricingCatalogRecord, quantity: number): CostCalculation {
    const tiers = record.serviceCategory === 'network' ? this.egressTiers(record) : [];

    if (tiers.length > 0) {
      const egressTiers = this.egressTierBreakdown(tiers, quantity);
      const monthlyCostUsd = this.roundCurrency(calculateEgressCost(tiers, quantity));

      return {
        hourlyCostUsd: this.roundCurrency(monthlyCostUsd / HOURS_PER_MONTH),
        monthlyCostUsd,
        pricingBasis: 'tiered',
        egressTiers,
      };
    }

    const monthlyCostUsd = this.roundCurrency(
      this.monthlyQuantity(record.unit, quantity) * record.unitPriceUsd,
    );

    return {
      hourlyCostUsd: this.roundCurrency(
        this.hourlyQuantity(record.unit, quantity) * record.unitPriceUsd,
      ),
      monthlyCostUsd,
      pricingBasis: 'flat',
    };
  }

  private pricingModelCost(
    record: PricingCatalogRecord,
    quantity: number,
  ): Pick<PricingModelCost, 'hourlyCostUsd' | 'monthlyCostUsd'> {
    const cost = this.monthlyCost(record, quantity);

    return {
      hourlyCostUsd: cost.hourlyCostUsd,
      monthlyCostUsd: cost.monthlyCostUsd,
    };
  }

  private estimatedComputePricingModel(
    pricingModel: PricingModelKey,
    onDemandRecord: PricingCatalogRecord,
    quantity: number,
  ): PricingModelCost {
    const onDemandCost = this.monthlyCost(onDemandRecord, quantity);
    const factor = this.estimatedDiscountFactor(pricingModel);
    const monthlyCostUsd = this.roundCurrency(onDemandCost.monthlyCostUsd * factor);
    const hourlyCostUsd = this.roundCurrency(monthlyCostUsd / HOURS_PER_MONTH);

    return {
      model: pricingModel,
      available: true,
      ...this.pricingModelMetadata(pricingModel, onDemandRecord),
      source: 'modeled-estimate',
      estimated: true,
      hourlyCostUsd,
      monthlyCostUsd,
      savingsPercentVsOnDemand: this.savingsPercent(monthlyCostUsd, onDemandCost.monthlyCostUsd),
    };
  }

  private pricingModelMetadata(
    pricingModel: PricingModelKey,
    record: PricingCatalogRecord,
  ): Omit<PricingModelCost, 'model' | 'available' | 'monthlyCostUsd' | 'hourlyCostUsd'> {
    const metadata = providerPricingModelMetadata(this.providerId, pricingModel);
    const upfrontCostUsd = this.numberAttribute(record, 'upfrontCostUsd');

    return {
      displayName: metadata.displayName,
      providerTerm: metadata.providerTerm,
      source: 'catalog',
      estimated: false,
      volatility: metadata.volatility,
      ...(metadata.commitmentTermMonths
        ? { commitmentTermMonths: metadata.commitmentTermMonths }
        : {}),
      ...(typeof record.attributes?.upfrontOption === 'string'
        ? { upfrontOption: normalizeUpfrontOption(record.attributes.upfrontOption) }
        : {}),
      ...(upfrontCostUsd !== undefined && upfrontCostUsd >= 0
        ? { upfrontCostUsd: this.roundCurrency(upfrontCostUsd) }
        : {}),
      lastFetchedAt: record.fetchedAt,
      caveat: metadata.caveat,
    };
  }

  private estimatedDiscountFactor(pricingModel: PricingModelKey): number {
    if (pricingModel === 'spot') {
      switch (this.providerId) {
        case 'aws':
          return 0.35;
        case 'azure':
          return 0.4;
        case 'gcp':
          return 0.45;
      }
    }

    if (pricingModel === 'savings-plan') {
      switch (this.providerId) {
        case 'aws':
          return 0.72;
        case 'azure':
          return 0.7;
        case 'gcp':
          return 0.68;
      }
    }

    return 1;
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

  private egressTiers(record: PricingCatalogRecord): EgressTierRate[] {
    const value = record.attributes?.egressTiers;

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.toEgressTier(item))
      .filter((item): item is EgressTierRate => item !== undefined)
      .sort((left, right) => left.tierFromGb - right.tierFromGb);
  }

  private egressTierBreakdown(
    tiers: EgressTierRate[],
    gbPerMonth: number,
  ): NonNullable<CostCalculation['egressTiers']> {
    const sortedTiers = [...tiers].sort((left, right) => left.tierFromGb - right.tierFromGb);

    return sortedTiers
      .map((tier, index) => {
        const nextTier = sortedTiers[index + 1];
        const tierCeiling = tier.tierToGb ?? nextTier?.tierFromGb ?? Number.POSITIVE_INFINITY;
        const billableGb = Math.max(0, Math.min(gbPerMonth, tierCeiling) - tier.tierFromGb);

        return {
          tierFromGb: tier.tierFromGb,
          ...(Number.isFinite(tierCeiling) ? { tierToGb: tierCeiling } : {}),
          pricePerGb: tier.pricePerGb,
          billableGb: this.roundCurrency(billableGb),
          monthlyCostUsd: this.roundCurrency(billableGb * tier.pricePerGb),
        };
      })
      .filter((tier) => tier.billableGb > 0);
  }

  private toEgressTier(value: unknown): EgressTierRate | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const tierFromGb =
      this.numberValue(record.tierFromGb) ??
      this.numberValue(record.startGb) ??
      this.numberValue(record.startUsageAmount) ??
      this.numberValue(record.startUsageAmountGb);
    const tierToGb =
      this.numberValue(record.tierToGb) ??
      this.numberValue(record.endGb) ??
      this.numberValue(record.endUsageAmount) ??
      this.numberValue(record.endUsageAmountGb);
    const pricePerGb =
      this.numberValue(record.pricePerGb) ??
      this.numberValue(record.unitPriceUsd) ??
      this.numberValue(record.pricePerGbUsd) ??
      this.numberValue(record.pricePerUnitUsd);

    if (tierFromGb === undefined || pricePerGb === undefined) {
      return undefined;
    }

    return {
      tierFromGb,
      ...(tierToGb !== undefined ? { tierToGb } : {}),
      pricePerGb,
    };
  }

  private costComponentForCategory(category: ServiceCategory): CostComponent {
    if (category === 'network') {
      return 'egress';
    }

    return category;
  }

  private monthlyQuantity(unit: string, quantity: number): number {
    const normalizedUnit = unit.toLowerCase();

    if (
      normalizedUnit.includes('hour') ||
      normalizedUnit.includes('hrs') ||
      normalizedUnit === 'h'
    ) {
      return quantity * HOURS_PER_MONTH;
    }

    return quantity;
  }

  private hourlyQuantity(unit: string, quantity: number): number {
    const normalizedUnit = unit.toLowerCase();

    if (
      normalizedUnit.includes('hour') ||
      normalizedUnit.includes('hrs') ||
      normalizedUnit === 'h'
    ) {
      return quantity;
    }

    return quantity / HOURS_PER_MONTH;
  }

  private resourceFitRank(record: PricingCatalogRecord): number {
    return (
      (this.numberAttribute(record, 'vcpu') ?? 0) * 1000 +
      (this.numberAttribute(record, 'memoryGb') ?? 0)
    );
  }

  private recordInstanceFamily(record: PricingCatalogRecord): NormalizedInstanceFamily | undefined {
    const explicitFamily =
      this.stringAttribute(record, 'family') ??
      this.stringAttribute(record, 'instanceFamily') ??
      this.stringAttribute(record, 'normalizedFamily');

    if (isNormalizedInstanceFamily(explicitFamily)) {
      return explicitFamily;
    }

    const descriptors = [
      record.skuId,
      record.serviceName,
      record.skuDescription,
      this.stringAttribute(record, 'instanceType'),
      this.stringAttribute(record, 'skuName'),
      this.stringAttribute(record, 'armSkuName'),
      this.stringAttribute(record, 'machineType'),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    for (const descriptor of descriptors) {
      const family = normalizeInstanceFamily(this.providerId, descriptor);

      if (family) {
        return family;
      }
    }

    return undefined;
  }

  private recordProcessorArchitecture(
    record: PricingCatalogRecord,
  ): ComputeProcessorArchitecture | undefined {
    const explicitArchitecture =
      this.stringAttribute(record, 'processorArchitecture') ??
      this.stringAttribute(record, 'architecture') ??
      this.stringAttribute(record, 'cpuArchitecture');

    if (isComputeProcessorArchitecture(explicitArchitecture)) {
      return explicitArchitecture;
    }

    const descriptors = this.recordDescriptors(record);

    if (
      descriptors.some((descriptor) =>
        /\b(gpu|nvidia|a100|h100|v100|p4d|g5|nc|nd|a2|g2)\b/i.test(descriptor),
      )
    ) {
      return 'gpu';
    }

    if (
      descriptors.some((descriptor) =>
        /\b(arm|arm64|aarch64|graviton|ampere|t2a)\b/i.test(descriptor),
      )
    ) {
      return 'arm64';
    }

    if (
      descriptors.some((descriptor) =>
        /\b(x86|x64|intel|amd|xeon|epyc|m\d|c\d|r\d|d\d|fsv2)\b/i.test(descriptor),
      )
    ) {
      return 'x86_64';
    }

    return undefined;
  }

  private recordComputeTenancy(record: PricingCatalogRecord): ComputeTenancy | undefined {
    const explicitTenancy =
      this.stringAttribute(record, 'tenancy') ??
      this.stringAttribute(record, 'hostTenancy') ??
      this.stringAttribute(record, 'computeTenancy');

    if (isComputeTenancy(explicitTenancy)) {
      return explicitTenancy;
    }

    const descriptors = this.recordDescriptors(record);

    if (
      descriptors.some((descriptor) =>
        /\b(sole[- ]tenant|sole tenant|single tenant)\b/i.test(descriptor),
      )
    ) {
      return 'sole-tenant';
    }

    if (
      descriptors.some((descriptor) =>
        /\b(dedicated host|dedicated instance|dedicated tenancy)\b/i.test(descriptor),
      )
    ) {
      return 'dedicated-host';
    }

    return undefined;
  }

  private instanceFamilyFitRank(
    record: PricingCatalogRecord,
    requestedFamily: NormalizedInstanceFamily | undefined,
  ): number {
    if (!requestedFamily) {
      return 0;
    }

    const candidateFamily = this.recordInstanceFamily(record);

    if (candidateFamily === requestedFamily) {
      return 0;
    }

    return candidateFamily === undefined ? 1 : 2;
  }

  private processorArchitectureFitRank(
    record: PricingCatalogRecord,
    requestedArchitecture: ComputeProcessorArchitecture | undefined,
  ): number {
    if (!requestedArchitecture) {
      return 0;
    }

    const candidateArchitecture = this.recordProcessorArchitecture(record);

    if (candidateArchitecture === requestedArchitecture) {
      return 0;
    }

    return candidateArchitecture === undefined ? 1 : 2;
  }

  private computeTenancyFitRank(
    record: PricingCatalogRecord,
    requestedTenancy: ComputeTenancy | undefined,
  ): number {
    if (!requestedTenancy) {
      return 0;
    }

    const candidateTenancy = this.recordComputeTenancy(record);

    if (candidateTenancy === requestedTenancy) {
      return 0;
    }

    return candidateTenancy === undefined ? 1 : 2;
  }

  private annotateComputeIntentApproximation(
    record: PricingCatalogRecord | undefined,
    requestedFamily: NormalizedInstanceFamily | undefined,
    requestedArchitecture: ComputeProcessorArchitecture | undefined,
    requestedTenancy: ComputeTenancy | undefined,
  ): PricingCatalogRecord | undefined {
    if (!record) {
      return undefined;
    }

    const candidateFamily = this.recordInstanceFamily(record);
    const candidateArchitecture = this.recordProcessorArchitecture(record);
    const candidateTenancy = this.recordComputeTenancy(record);
    const familyApproximate =
      requestedFamily !== undefined &&
      requestedFamily !== 'general-purpose' &&
      candidateFamily !== requestedFamily;
    const architectureApproximate =
      requestedArchitecture !== undefined &&
      requestedArchitecture !== 'x86_64' &&
      candidateArchitecture !== requestedArchitecture;
    const tenancyApproximate =
      requestedTenancy !== undefined &&
      requestedTenancy !== 'shared' &&
      candidateTenancy !== requestedTenancy;

    if (!familyApproximate && !architectureApproximate && !tenancyApproximate) {
      return record;
    }

    return {
      ...record,
      attributes: {
        ...(record.attributes ?? {}),
        isApproximate: true,
        familyFallbackFrom: requestedFamily,
        familyFallbackTo: candidateFamily ?? 'unspecified',
        architectureFallbackFrom: requestedArchitecture,
        architectureFallbackTo: candidateArchitecture ?? 'unspecified',
        tenancyFallbackFrom: requestedTenancy,
        tenancyFallbackTo: candidateTenancy ?? 'unspecified',
      },
    };
  }

  private numberAttribute(record: PricingCatalogRecord, key: string): number | undefined {
    return this.numberValue(record.attributes?.[key]);
  }

  private recordDescriptors(record: PricingCatalogRecord): string[] {
    return [
      record.skuId,
      record.serviceName,
      record.skuDescription,
      this.stringAttribute(record, 'instanceType'),
      this.stringAttribute(record, 'skuName'),
      this.stringAttribute(record, 'armSkuName'),
      this.stringAttribute(record, 'machineType'),
      this.stringAttribute(record, 'processor'),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private stringAttribute(record: PricingCatalogRecord, key: string): string | undefined {
    const value = record.attributes?.[key];

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private numberValue(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  protected roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

function isNormalizedInstanceFamily(value: string | undefined): value is NormalizedInstanceFamily {
  return (
    value === 'general-purpose' ||
    value === 'compute-optimized' ||
    value === 'memory-optimized' ||
    value === 'storage-optimized' ||
    value === 'accelerated-computing'
  );
}

function isComputeProcessorArchitecture(
  value: string | undefined,
): value is ComputeProcessorArchitecture {
  return value === 'x86_64' || value === 'arm64' || value === 'gpu';
}

function isComputeTenancy(value: string | undefined): value is ComputeTenancy {
  return value === 'shared' || value === 'dedicated-host' || value === 'sole-tenant';
}

function providerPricingModelMetadata(
  providerId: ProviderId,
  pricingModel: PricingModelKey,
): Pick<
  PricingModelCost,
  'displayName' | 'providerTerm' | 'volatility' | 'commitmentTermMonths' | 'caveat'
> {
  switch (pricingModel) {
    case 'on-demand':
      return {
        displayName: 'On-demand',
        providerTerm: 'On-demand',
        volatility: 'stable',
        caveat: 'No long-term commitment modeled.',
      };
    case 'reserved-1yr':
      return {
        displayName: 'Reserved 1 year',
        providerTerm: commitmentProviderTerm(providerId, 12),
        volatility: 'stable',
        commitmentTermMonths: 12,
        caveat:
          'Commitment pricing depends on SKU availability, payment option, operating system, and tenancy.',
      };
    case 'reserved-3yr':
      return {
        displayName: 'Reserved 3 year',
        providerTerm: commitmentProviderTerm(providerId, 36),
        volatility: 'stable',
        commitmentTermMonths: 36,
        caveat:
          'Commitment pricing depends on SKU availability, payment option, operating system, and tenancy.',
      };
    case 'spot':
      return {
        displayName: 'Spot',
        providerTerm: spotProviderTerm(providerId),
        volatility: 'volatile',
        caveat:
          'Spot pricing is interruptible and volatile; modeled values are planning estimates unless catalog rows are present.',
      };
    case 'savings-plan':
      return {
        displayName: 'Savings / committed use',
        providerTerm: savingsProviderTerm(providerId),
        volatility: 'variable',
        caveat:
          'Savings-plan and committed-use benefits differ by provider and require usage commitment validation.',
      };
  }
}

function commitmentProviderTerm(providerId: ProviderId, months: 12 | 36): string {
  switch (providerId) {
    case 'aws':
      return `EC2 Reserved Instance ${months / 12}yr`;
    case 'azure':
      return `Azure Reserved VM Instance ${months / 12}yr`;
    case 'gcp':
      return `Google Cloud CUD ${months / 12}yr`;
  }
}

function spotProviderTerm(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'EC2 Spot Instances';
    case 'azure':
      return 'Azure Spot VMs';
    case 'gcp':
      return 'Google Cloud Spot VMs';
  }
}

function savingsProviderTerm(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'AWS Savings Plans';
    case 'azure':
      return 'Azure Reservations';
    case 'gcp':
      return 'Google Cloud committed use discounts';
  }
}

function normalizeUpfrontOption(value: string): 'none' | 'partial' | 'all' {
  const normalized = value.toLowerCase();

  if (normalized.includes('all')) {
    return 'all';
  }

  if (normalized.includes('partial')) {
    return 'partial';
  }

  return 'none';
}
