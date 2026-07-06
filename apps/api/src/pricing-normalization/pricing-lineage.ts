import { createHash } from 'node:crypto';
import {
  PricingCatalogRecord,
  ProviderId,
  ServiceCategory,
} from '../adapters/common/cloud-provider-adapter';

export const PRICING_TRANSFORM_VERSION = 'pricing-normalization-v3';

export interface PricingSourceLineage {
  sourceEndpoint: string;
  sourceRecordId: string;
  sourceRecordKey: string;
  fetchTimestamp: string;
  transformVersion: string;
  sourcePayloadHash: string;
}

export function pricingLineageForCatalogRecord(record: PricingCatalogRecord): PricingSourceLineage {
  return {
    sourceEndpoint: sourceEndpointForRecord(record),
    sourceRecordId: sourceRecordIdForRecord(record),
    sourceRecordKey: pricingSourceRecordKey(record),
    fetchTimestamp: record.fetchedAt,
    transformVersion: PRICING_TRANSFORM_VERSION,
    sourcePayloadHash: sha256StableJson({
      provider: record.provider,
      serviceCategory: record.serviceCategory,
      serviceName: record.serviceName,
      skuId: record.skuId,
      skuDescription: record.skuDescription,
      region: record.region,
      unit: record.unit,
      unitPriceUsd: record.unitPriceUsd,
      attributes: record.attributes ?? {},
      effectiveDate: record.effectiveDate,
      fetchedAt: record.fetchedAt,
    }),
  };
}

export function pricingLineageForCatalogRecordLike(
  value: unknown,
): PricingSourceLineage | undefined {
  if (!isPricingCatalogRecordLike(value)) {
    return undefined;
  }

  return pricingLineageForCatalogRecord(value);
}

export function combinePricingLineage(
  records: PricingCatalogRecord[],
): PricingSourceLineage | undefined {
  const lineages = records.map(pricingLineageForCatalogRecord);

  if (lineages.length === 0) {
    return undefined;
  }

  return {
    sourceEndpoint: unique(lineages.map((lineage) => lineage.sourceEndpoint)).join(' + '),
    sourceRecordId: lineages.map((lineage) => lineage.sourceRecordId).join(' + '),
    sourceRecordKey: lineages.map((lineage) => lineage.sourceRecordKey).join(' + '),
    fetchTimestamp: maxIso(lineages.map((lineage) => lineage.fetchTimestamp)),
    transformVersion: PRICING_TRANSFORM_VERSION,
    sourcePayloadHash: sha256StableJson(
      lineages.map((lineage) => ({
        sourceRecordKey: lineage.sourceRecordKey,
        sourcePayloadHash: lineage.sourcePayloadHash,
      })),
    ),
  };
}

export function lineageFromRawPayload(
  rawPayload: Record<string, unknown>,
): PricingSourceLineage | undefined {
  const direct = pricingLineageForCatalogRecordLike(rawPayload.sourceRecord);

  if (direct) {
    return direct;
  }

  const sourceRecords = rawPayload.sourceRecords;
  if (!isObjectRecord(sourceRecords)) {
    return undefined;
  }

  const catalogRecords = Object.values(sourceRecords).filter(
    (value): value is PricingCatalogRecord => isPricingCatalogRecordLike(value),
  );

  return combinePricingLineage(catalogRecords);
}

export function sourceEndpointForProviderCategory(
  provider: ProviderId,
  serviceCategory: ServiceCategory,
): string {
  switch (provider) {
    case 'aws':
      return `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${awsServiceCode(
        serviceCategory,
      )}/current/index.json`;
    case 'azure':
      return 'https://prices.azure.com/api/retail/prices';
    case 'gcp':
      return 'https://cloudbilling.googleapis.com/v1/services';
  }
}

export function pricingSourceRecordKey(record: PricingCatalogRecord): string {
  return [
    record.provider,
    record.serviceCategory,
    record.skuId,
    record.region,
    record.unit,
    record.effectiveDate,
  ].join('|');
}

function sourceEndpointForRecord(record: PricingCatalogRecord): string {
  const sourceEndpoint =
    stringAttribute(record, 'sourceEndpoint') ??
    stringAttribute(record, 'sourceUrl') ??
    stringAttribute(record, 'providerEndpoint');

  if (sourceEndpoint) {
    return sourceEndpoint;
  }

  if (record.attributes?.source === 'mock_provider') {
    return `fixture://mock-pricing/${record.provider}/${record.serviceCategory}`;
  }

  if (record.attributes?.source === 'local_seed') {
    return `fixture://local-seed/${record.provider}/${record.serviceCategory}`;
  }

  return sourceEndpointForProviderCategory(record.provider, record.serviceCategory);
}

function sourceRecordIdForRecord(record: PricingCatalogRecord): string {
  const rawId =
    stringAttribute(record, 'rawSourceRecordId') ??
    stringAttribute(record, 'sourceRecordId') ??
    stringAttribute(record, 'meterId') ??
    stringAttribute(record, 'productId') ??
    stringAttribute(record, 'serviceName');

  return rawId ?? record.skuId;
}

type LineageAttributeKey =
  | 'sourceEndpoint'
  | 'sourceUrl'
  | 'providerEndpoint'
  | 'rawSourceRecordId'
  | 'sourceRecordId'
  | 'meterId'
  | 'productId'
  | 'serviceName';

function stringAttribute(
  record: PricingCatalogRecord,
  key: LineageAttributeKey,
): string | undefined {
  const attributes = record.attributes;

  if (!attributes) {
    return undefined;
  }

  switch (key) {
    case 'sourceEndpoint':
      return stringFromUnknown(attributes.sourceEndpoint);
    case 'sourceUrl':
      return stringFromUnknown(attributes.sourceUrl);
    case 'providerEndpoint':
      return stringFromUnknown(attributes.providerEndpoint);
    case 'rawSourceRecordId':
      return stringFromUnknown(attributes.rawSourceRecordId);
    case 'sourceRecordId':
      return stringFromUnknown(attributes.sourceRecordId);
    case 'meterId':
      return stringFromUnknown(attributes.meterId);
    case 'productId':
      return stringFromUnknown(attributes.productId);
    case 'serviceName':
      return stringFromUnknown(attributes.serviceName);
  }
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function awsServiceCode(serviceCategory: ServiceCategory): string {
  switch (serviceCategory) {
    case 'compute':
      return 'AmazonEC2';
    case 'storage':
      return 'AmazonS3';
    case 'database':
      return 'AmazonRDS';
    case 'network':
      return 'AmazonVPC';
    case 'support':
    case 'licensing':
    case 'operations':
      return 'AWSBudgets';
  }
}

function isPricingCatalogRecordLike(value: unknown): value is PricingCatalogRecord {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    isProviderId(value.provider) &&
    isServiceCategory(value.serviceCategory) &&
    typeof value.serviceName === 'string' &&
    typeof value.skuId === 'string' &&
    typeof value.region === 'string' &&
    typeof value.unit === 'string' &&
    typeof value.unitPriceUsd === 'number' &&
    typeof value.effectiveDate === 'string' &&
    typeof value.fetchedAt === 'string'
  );
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'aws' || value === 'azure' || value === 'gcp';
}

function isServiceCategory(value: unknown): value is ServiceCategory {
  return (
    value === 'compute' ||
    value === 'storage' ||
    value === 'database' ||
    value === 'network' ||
    value === 'support' ||
    value === 'licensing' ||
    value === 'operations'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256StableJson(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (isObjectRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function maxIso(values: string[]): string {
  return values.reduce((current, value) => (value > current ? value : current), values[0] ?? '');
}
