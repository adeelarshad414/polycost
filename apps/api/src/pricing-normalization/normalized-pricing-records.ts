import {
  PricingCatalogRecord,
  PricingModelKey,
  ProviderId,
} from '../adapters/common/cloud-provider-adapter';
import { normalizeInstanceFamily, NormalizedInstanceFamily } from './family-normalizer';

export type NormalizedPricingTerm =
  'on_demand' | 'reserved_1yr' | 'reserved_3yr' | 'spot' | 'savings_plan';
export type NormalizedStorageTier = 'standard' | 'infrequent_access' | 'archive';

export interface NormalizedComputePricingRecord {
  provider: ProviderId;
  providerSkuId: string;
  family: NormalizedInstanceFamily;
  vcpu: number;
  memoryGb: number;
  region: string;
  os: string;
  rawPayload: Record<string, unknown>;
  lastSyncedAt: string;
  term: NormalizedPricingTerm;
  pricePerHour: number;
  currency: 'USD';
  effectiveDate: string;
}

export interface NormalizedStoragePricingRecord {
  provider: ProviderId;
  region: string;
  tier: NormalizedStorageTier;
  pricePerGbMonth: number;
  currency: 'USD';
  effectiveDate: string;
}

export interface NormalizedEgressTierRateRecord {
  provider: ProviderId;
  region: string;
  tierFromGb: number;
  tierToGb?: number;
  pricePerGb: number;
  effectiveDate: string;
}

export interface NormalizedPricingRecords {
  compute: NormalizedComputePricingRecord[];
  storage: NormalizedStoragePricingRecord[];
  egress: NormalizedEgressTierRateRecord[];
  skipped: number;
}

interface ComputeShape {
  providerSkuId: string;
  family: NormalizedInstanceFamily;
  vcpu: number;
  memoryGb: number;
}

const GCP_STANDARD_SHAPE_VCPUS = [2, 4, 8] as const;

export function normalizePricingCatalogRecords(
  records: PricingCatalogRecord[],
): NormalizedPricingRecords {
  const normalized: NormalizedPricingRecords = {
    compute: [],
    storage: [],
    egress: [],
    skipped: 0,
  };

  for (const record of records) {
    const compute = normalizeDirectComputeRecord(record);
    if (compute) {
      normalized.compute.push(compute);
      continue;
    }

    const storage = normalizeStorageRecord(record);
    if (storage) {
      normalized.storage.push(storage);
      continue;
    }

    const egress = normalizeEgressRecord(record);
    if (egress.length > 0) {
      normalized.egress.push(...egress);
      continue;
    }

    normalized.skipped += 1;
  }

  normalized.compute.push(...normalizeGcpComponentCompute(records));
  normalized.compute = uniqueComputeRecords(normalized.compute);
  normalized.storage = uniqueStorageRecords(normalized.storage);
  normalized.egress = uniqueEgressRecords(normalized.egress);

  return normalized;
}

function normalizeDirectComputeRecord(
  record: PricingCatalogRecord,
): NormalizedComputePricingRecord | undefined {
  if (record.serviceCategory !== 'compute' || record.unitPriceUsd <= 0) {
    return undefined;
  }

  const term = normalizePricingTerm(record);
  const shape = computeShapeFromRecord(record);

  if (!term || !shape) {
    return undefined;
  }

  return {
    provider: record.provider,
    providerSkuId: shape.providerSkuId,
    family: shape.family,
    vcpu: shape.vcpu,
    memoryGb: shape.memoryGb,
    region: record.region,
    os: normalizeOs(record),
    rawPayload: { sourceRecord: record },
    lastSyncedAt: record.fetchedAt,
    term,
    pricePerHour: roundCurrency(record.unitPriceUsd),
    currency: 'USD',
    effectiveDate: record.effectiveDate,
  };
}

function computeShapeFromRecord(record: PricingCatalogRecord): ComputeShape | undefined {
  const directVcpu = numberAttribute(record, 'vcpu');
  const directMemoryGb = numberAttribute(record, 'memoryGb');
  const providerSkuId = providerComputeSkuId(record);
  const derivedShape = providerSpecificShape(record, providerSkuId);
  const vcpu = directVcpu ?? derivedShape?.vcpu;
  const memoryGb = directMemoryGb ?? derivedShape?.memoryGb;
  const family =
    localSeedComputeFamily(record) ??
    derivedShape?.family ??
    normalizeInstanceFamily(record.provider, providerSkuId) ??
    normalizeInstanceFamily(record.provider, String(record.attributes?.skuName ?? ''));

  if (!family || !Number.isFinite(vcpu) || !Number.isFinite(memoryGb)) {
    return undefined;
  }

  if (!vcpu || !memoryGb || vcpu <= 0 || memoryGb <= 0) {
    return undefined;
  }

  return {
    providerSkuId,
    family,
    vcpu,
    memoryGb,
  };
}

function providerSpecificShape(
  record: PricingCatalogRecord,
  providerSkuId: string,
): Omit<ComputeShape, 'providerSkuId'> | undefined {
  switch (record.provider) {
    case 'azure':
      return azureVmShape(providerSkuId, record);
    case 'gcp':
      return gcpMachineShape(providerSkuId);
    case 'aws':
      return undefined;
  }
}

function localSeedComputeFamily(
  record: PricingCatalogRecord,
): NormalizedInstanceFamily | undefined {
  if (record.attributes?.source !== 'local_seed') {
    return undefined;
  }

  const descriptor = `${record.serviceName} ${record.skuId}`.toLowerCase();
  return descriptor.includes('compute') ? 'general-purpose' : undefined;
}

function providerComputeSkuId(record: PricingCatalogRecord): string {
  switch (record.provider) {
    case 'aws':
      return String(record.attributes?.instanceType ?? record.skuId);
    case 'azure':
      return String(record.attributes?.armSkuName ?? record.attributes?.skuName ?? record.skuId);
    case 'gcp':
      return String(
        record.attributes?.machineType ??
          gcpMachineTypeFromSyntheticSku(record.skuId) ??
          record.skuId,
      );
  }
}

function azureVmShape(
  providerSkuId: string,
  record: PricingCatalogRecord,
): Omit<ComputeShape, 'providerSkuId'> | undefined {
  const normalized = normalizeAzureSkuName(
    providerSkuId || String(record.attributes?.skuName ?? ''),
  );
  const match = normalized.match(/^(?<family>[a-z]+)(?<vcpu>\d+)(?<variant>[a-z]*)v?\d*$/i);
  const familyPrefix = match?.groups?.family?.[0]?.toLowerCase();
  const vcpu = match?.groups?.vcpu ? Number.parseInt(match.groups.vcpu, 10) : undefined;
  const variant = match?.groups?.variant ?? '';

  if (!familyPrefix || !vcpu) {
    return undefined;
  }

  const normalizedFamily = normalizeInstanceFamily('azure', familyPrefix);
  const memoryGb = azureMemoryGb(familyPrefix, vcpu, variant);

  if (!normalizedFamily || !memoryGb) {
    return undefined;
  }

  return {
    family: normalizedFamily,
    vcpu,
    memoryGb,
  };
}

function normalizeAzureSkuName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^standard[_\s-]?/, '')
    .replace(/[_\s-]/g, '');
}

function azureMemoryGb(familyPrefix: string, vcpu: number, variant: string): number | undefined {
  switch (familyPrefix) {
    case 'b':
      if (vcpu === 1) {
        return variant.includes('m') ? 2 : 1;
      }
      return variant.includes('m') ? vcpu * 4 : vcpu * 2;
    case 'd':
      return vcpu * 4;
    case 'e':
      return vcpu * 8;
    case 'f':
      return vcpu * 2;
    case 'l':
      return vcpu * 8;
    case 'm':
      return vcpu * 16;
    case 'n':
      return vcpu * 7;
    default:
      return undefined;
  }
}

function gcpMachineShape(providerSkuId: string): Omit<ComputeShape, 'providerSkuId'> | undefined {
  const normalized = providerSkuId.toLowerCase();
  const match = normalized.match(
    /^(?<family>e2|n1|n2|c2|c3|t2d|m1|m2|m3)-(?<profile>standard|highmem|highcpu)-(?<vcpu>\d+)$/,
  );

  if (!match?.groups) {
    return undefined;
  }

  const vcpu = Number.parseInt(match.groups.vcpu, 10);
  const family = normalizeInstanceFamily('gcp', match.groups.family);
  const memoryGb = gcpMemoryGb(match.groups.profile, vcpu);

  if (!family || !memoryGb) {
    return undefined;
  }

  return {
    family,
    vcpu,
    memoryGb,
  };
}

function gcpMachineTypeFromSyntheticSku(skuId: string): string | undefined {
  const match = skuId.toLowerCase().match(/^gcp-(?<family>[a-z0-9]+)-standard-(?<vcpu>\d+)$/);
  return match?.groups ? `${match.groups.family}-standard-${match.groups.vcpu}` : undefined;
}

function gcpMemoryGb(profile: string, vcpu: number): number | undefined {
  switch (profile) {
    case 'standard':
      return vcpu * 4;
    case 'highmem':
      return vcpu * 8;
    case 'highcpu':
      return vcpu;
    default:
      return undefined;
  }
}

function normalizeGcpComponentCompute(
  records: PricingCatalogRecord[],
): NormalizedComputePricingRecord[] {
  const gcpComputeRecords = records.filter(
    (record) => record.provider === 'gcp' && record.serviceCategory === 'compute',
  );
  const byRegionFamily = new Map<
    string,
    { family: string; region: string; core?: PricingCatalogRecord; ram?: PricingCatalogRecord }
  >();

  for (const record of gcpComputeRecords) {
    const family = gcpFamilyFromRecord(record);
    if (!family) {
      continue;
    }

    const key = `${record.region}:${family}`;
    const group = byRegionFamily.get(key) ?? { family, region: record.region };
    const description = record.skuDescription?.toLowerCase() ?? record.serviceName.toLowerCase();

    if (description.includes('core') && record.unitPriceUsd > 0) {
      group.core = record;
    }
    if (
      (description.includes('ram') || description.includes('memory')) &&
      record.unitPriceUsd > 0
    ) {
      group.ram = record;
    }

    byRegionFamily.set(key, group);
  }

  return [...byRegionFamily.values()].flatMap((group): NormalizedComputePricingRecord[] => {
    const core = group.core;
    const ram = group.ram;

    if (!core || !ram) {
      return [];
    }

    const records: NormalizedComputePricingRecord[] = [];

    for (const vcpu of GCP_STANDARD_SHAPE_VCPUS) {
      const memoryGb = gcpMemoryGb('standard', vcpu) ?? 0;
      const providerSkuId = `${group.family}-standard-${vcpu}`;
      const family = normalizeInstanceFamily('gcp', providerSkuId);

      if (!family || memoryGb <= 0) {
        continue;
      }

      records.push({
        provider: 'gcp' as const,
        providerSkuId,
        family,
        vcpu,
        memoryGb,
        region: group.region,
        os: 'linux',
        rawPayload: {
          sourceRecords: {
            core,
            ram,
          },
        },
        lastSyncedAt: maxIso(core.fetchedAt, ram.fetchedAt),
        term: 'on_demand' as const,
        pricePerHour: roundCurrency(core.unitPriceUsd * vcpu + ram.unitPriceUsd * memoryGb),
        currency: 'USD' as const,
        effectiveDate: core.effectiveDate,
      });
    }

    return records;
  });
}

function gcpFamilyFromRecord(record: PricingCatalogRecord): string | undefined {
  const description = `${record.skuDescription ?? ''} ${record.serviceName}`.toLowerCase();
  const descriptionMatch = description.match(/\b(?<family>e2|n1|n2|c2|c3|t2d|m1|m2|m3)\b/);
  if (descriptionMatch?.groups?.family) {
    return descriptionMatch.groups.family;
  }

  const resourceGroup = String(record.attributes?.resourceGroup ?? '').toLowerCase();
  const resourceMatch = resourceGroup.match(/^(?<family>e2|n1|n2|c2|c3|t2d|m1|m2|m3)/);
  return resourceMatch?.groups?.family;
}

function normalizeStorageRecord(
  record: PricingCatalogRecord,
): NormalizedStoragePricingRecord | undefined {
  if (
    record.serviceCategory !== 'storage' ||
    record.unitPriceUsd < 0 ||
    !isStorageUnit(record.unit)
  ) {
    return undefined;
  }

  if (record.attributes?.source === 'local_seed' && record.attributes.type !== 'object') {
    return undefined;
  }

  const tier = normalizeStorageTier(record);
  if (!tier) {
    return undefined;
  }

  return {
    provider: record.provider,
    region: record.region,
    tier,
    pricePerGbMonth: roundCurrency(record.unitPriceUsd),
    currency: 'USD',
    effectiveDate: record.effectiveDate,
  };
}

function normalizeStorageTier(record: PricingCatalogRecord): NormalizedStorageTier | undefined {
  const text = [
    record.skuDescription,
    record.serviceName,
    record.attributes?.skuName,
    record.attributes?.storageClass,
    record.attributes?.resourceGroup,
    record.attributes?.accessPattern,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('archive')) {
    return 'archive';
  }
  if (text.includes('cool') || text.includes('infrequent') || text.includes('nearline')) {
    return 'infrequent_access';
  }
  if (text.includes('standard') || text.includes('hot') || text.includes('general purpose')) {
    return 'standard';
  }

  return undefined;
}

function normalizeEgressRecord(record: PricingCatalogRecord): NormalizedEgressTierRateRecord[] {
  if (record.serviceCategory !== 'network') {
    return [];
  }

  const tiers = normalizeEgressTiers(record);
  if (tiers.length > 0) {
    return tiers;
  }

  if (record.unitPriceUsd >= 0 && isGbUnit(record.unit)) {
    return [
      {
        provider: record.provider,
        region: record.region,
        tierFromGb: 0,
        pricePerGb: roundCurrency(record.unitPriceUsd),
        effectiveDate: record.effectiveDate,
      },
    ];
  }

  return [];
}

function normalizeEgressTiers(record: PricingCatalogRecord): NormalizedEgressTierRateRecord[] {
  const sourceTiers = record.attributes?.egressTiers;

  if (!Array.isArray(sourceTiers)) {
    return [];
  }

  return sourceTiers
    .map((tier) => {
      if (!isObjectRecord(tier)) {
        return undefined;
      }

      const tierFromGb = numberFromUnknown(tier.startGb ?? tier.startUsageAmount);
      const pricePerGb = numberFromUnknown(tier.unitPriceUsd ?? tier.pricePerGb);

      if (tierFromGb === undefined || pricePerGb === undefined || pricePerGb < 0) {
        return undefined;
      }

      return {
        tierFromGb,
        pricePerGb,
      };
    })
    .filter((tier): tier is { tierFromGb: number; pricePerGb: number } => tier !== undefined)
    .sort((left, right) => left.tierFromGb - right.tierFromGb)
    .map((tier, index, sortedTiers) => ({
      provider: record.provider,
      region: record.region,
      tierFromGb: tier.tierFromGb,
      ...(sortedTiers[index + 1] ? { tierToGb: sortedTiers[index + 1].tierFromGb } : {}),
      pricePerGb: roundCurrency(tier.pricePerGb),
      effectiveDate: record.effectiveDate,
    }));
}

function normalizePricingTerm(record: PricingCatalogRecord): NormalizedPricingTerm | undefined {
  const pricingModel = record.attributes?.pricingModel as PricingModelKey | undefined;

  switch (pricingModel) {
    case undefined:
    case 'on-demand':
      return 'on_demand';
    case 'reserved-1yr':
      return 'reserved_1yr';
    case 'reserved-3yr':
      return 'reserved_3yr';
    case 'spot':
      return 'spot';
    case 'savings-plan':
      return 'savings_plan';
    default:
      return undefined;
  }
}

function normalizeOs(record: PricingCatalogRecord): string {
  const os = String(record.attributes?.operatingSystem ?? record.attributes?.os ?? 'linux');
  return os.toLowerCase().includes('windows') ? 'windows' : 'linux';
}

function isStorageUnit(unit: string): boolean {
  const normalized = unit.toLowerCase();
  return (
    isGbUnit(unit) &&
    (normalized.includes('month') || normalized.includes('mo') || normalized.includes('mo.'))
  );
}

function isGbUnit(unit: string): boolean {
  const normalized = unit.toLowerCase();
  return normalized.includes('gb') || normalized.includes('gib') || normalized.includes('giby');
}

function numberAttribute(
  record: PricingCatalogRecord,
  key: 'vcpu' | 'memoryGb',
): number | undefined {
  switch (key) {
    case 'vcpu':
      return numberFromUnknown(record.attributes?.vcpu);
    case 'memoryGb':
      return numberFromUnknown(record.attributes?.memoryGb);
  }
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function uniqueComputeRecords(
  records: NormalizedComputePricingRecord[],
): NormalizedComputePricingRecord[] {
  return uniqueBy(records, (record) =>
    [record.provider, record.providerSkuId, record.region, record.term, record.effectiveDate].join(
      ':',
    ),
  );
}

function uniqueStorageRecords(
  records: NormalizedStoragePricingRecord[],
): NormalizedStoragePricingRecord[] {
  return uniqueBy(records, (record) =>
    [record.provider, record.region, record.tier, record.effectiveDate].join(':'),
  );
}

function uniqueEgressRecords(
  records: NormalizedEgressTierRateRecord[],
): NormalizedEgressTierRateRecord[] {
  return uniqueBy(records, (record) =>
    [record.provider, record.region, record.tierFromGb, record.effectiveDate].join(':'),
  );
}

function uniqueBy<T>(records: T[], keyFactory: (record: T) => string): T[] {
  const byKey = new Map<string, T>();

  for (const record of records) {
    byKey.set(keyFactory(record), record);
  }

  return [...byKey.values()];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maxIso(left: string, right: string): string {
  return left > right ? left : right;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}
