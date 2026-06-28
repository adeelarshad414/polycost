import { NWSValidator } from '../../nws/nws-validator';
import {
  CloudProviderAdapter,
  PricingCatalogReader,
  PricingCatalogRecord,
  ProviderId,
  ProviderPricingLineItem,
  ProviderPricingResult,
  RefreshPricingCatalogOptions,
  ServiceCategory,
} from './cloud-provider-adapter';
import { AdapterPricingError } from './adapter-errors';

const HOURS_PER_MONTH = 730;

export abstract class BaseCloudProviderAdapter implements CloudProviderAdapter {
  abstract readonly providerId: ProviderId;

  protected constructor(
    private readonly catalogReader: PricingCatalogReader,
    private readonly defaultRegion: string,
  ) {}

  async priceWorkload(input: unknown): Promise<ProviderPricingResult> {
    const nws = NWSValidator.validate(input);
    const region = nws.workload.region.preference ?? this.defaultRegion;
    const lineItems: ProviderPricingLineItem[] = [];

    for (const component of nws.compute) {
      const record = await this.selectComputeRecord(region, component.vcpu, component.memoryGb);
      const quantity =
        component.scalingType === 'autoscaling' && component.autoscalingRange
          ? (component.autoscalingRange.min + component.autoscalingRange.max) / 2
          : (component.instanceCount ?? 1);

      lineItems.push(this.toLineItem('compute', record, quantity, `${component.role} compute`));
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

    return {
      providerId: this.providerId,
      lineItems,
      baseMonthlyCostUsd,
    };
  }

  abstract refreshPricingCatalog(
    options?: RefreshPricingCatalogOptions,
  ): Promise<PricingCatalogRecord[]>;

  abstract refreshLivePricing(serviceIds: string[]): Promise<PricingCatalogRecord[]>;

  protected async findCatalogRecords(
    category: ServiceCategory,
    region: string,
  ): Promise<PricingCatalogRecord[]> {
    return this.catalogReader.find({
      provider: this.providerId,
      category,
      region,
    });
  }

  private async selectComputeRecord(
    region: string,
    vcpu?: number,
    memoryGb?: number,
  ): Promise<PricingCatalogRecord> {
    return this.selectRecord('compute', region, (candidate) => {
      const candidateVcpu = this.numberAttribute(candidate, 'vcpu');
      const candidateMemoryGb = this.numberAttribute(candidate, 'memoryGb');

      return (
        (vcpu === undefined || candidateVcpu === undefined || candidateVcpu >= vcpu) &&
        (memoryGb === undefined || candidateMemoryGb === undefined || candidateMemoryGb >= memoryGb)
      );
    });
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
  ): ProviderPricingLineItem {
    const baseMonthlyCostUsd = this.roundCurrency(
      this.monthlyQuantity(record.unit, quantity) * record.unitPriceUsd,
    );

    return {
      category,
      description: `${descriptionPrefix}: ${record.serviceName}`,
      isApproximate: record.attributes?.isApproximate === true,
      baseMonthlyCostUsd,
      skuId: record.skuId,
      unit: record.unit,
      unitPriceUsd: record.unitPriceUsd,
    };
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

  private resourceFitRank(record: PricingCatalogRecord): number {
    return (
      (this.numberAttribute(record, 'vcpu') ?? 0) * 1000 +
      (this.numberAttribute(record, 'memoryGb') ?? 0)
    );
  }

  private numberAttribute(record: PricingCatalogRecord, key: string): number | undefined {
    const value = record.attributes?.[key];

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
