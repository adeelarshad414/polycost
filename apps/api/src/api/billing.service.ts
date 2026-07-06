import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { ApiForbiddenError, ApiNotFoundError, ApiValidationError } from './api-errors';
import { ApiDatabaseRepository } from './api-database.repository';
import { AuthIdentity } from './auth.types';
import {
  BillingImportInput,
  BillingImportResponse,
  BillingProviderExportInput,
  BillingImportRowInput,
  BillingSourceType,
  InvoiceReconciliationRecord,
  InvoiceReconciliationStatus,
} from './billing.types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_IMPORT_ROWS = 10_000;
const MAX_PROVIDER_EXPORT_BYTES = 4 * 1024 * 1024;
const SOURCE_TYPES: BillingSourceType[] = [
  'aws-cur',
  'azure-cost-management',
  'gcp-billing-export',
  'normalized-csv',
];

@Injectable()
export class BillingService {
  constructor(private readonly repository: ApiDatabaseRepository) {}

  async importActuals(body: unknown, identity: AuthIdentity): Promise<BillingImportResponse> {
    const parsed = parseBillingImportInput(body);
    const originalFileSha256 = parsed.originalFileSha256 ?? sha256(stableJson(parsed));
    const rows = parsed.rows.map((row, index) => ({
      ...row,
      lineItemHash: sha256(
        stableJson({
          sourceIndex: index,
          provider: parsed.provider,
          billingPeriodStart: parsed.billingPeriodStart,
          billingPeriodEnd: parsed.billingPeriodEnd,
          row,
        }),
      ),
    }));
    const saved = await this.repository.createBillingImport({
      importInput: parsed,
      originalFileSha256,
      ...(identity.teamId ? { teamId: identity.teamId } : {}),
      createdByAccountId: identity.accountId,
      rows,
    });

    return {
      importRun: saved.importRun,
      acceptedRows: saved.importRun.rowsAccepted,
      rejectedRows: saved.importRun.rowsRejected,
      lineItems: saved.lineItems,
    };
  }

  async importProviderExport(
    body: unknown,
    identity: AuthIdentity,
  ): Promise<BillingImportResponse> {
    const input = parseBillingProviderExportInput(body);
    const decoded = decodeProviderExport(input);
    const rows = providerExportRows(input, decoded.text);

    return this.importActuals(
      {
        provider: input.provider,
        sourceType: input.sourceType,
        billingPeriodStart: input.billingPeriodStart,
        billingPeriodEnd: input.billingPeriodEnd,
        originalFileSha256: input.originalFileSha256 ?? decoded.sha256,
        rows,
      },
      identity,
    );
  }

  async reconcile(
    importRunId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord> {
    const comparisonId = parseComparisonId(body);
    const importRun = await this.repository.getBillingImport(importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(`Billing import ${importRunId} was not found`);
    }

    assertTeamAccess(importRun.teamId, identity);

    const [lineItems, comparison] = await Promise.all([
      this.repository.listInvoiceLineItems(importRunId),
      this.repository.getComparison(comparisonId),
    ]);

    if (!comparison) {
      throw new ApiNotFoundError(`Comparison ${comparisonId} was not found`);
    }

    const provider = comparison.resultSnapshot.providers.find(
      (candidate) => candidate.providerId === importRun.provider,
    );

    if (!provider) {
      throw new ApiValidationError('comparison does not contain imported provider', [
        {
          field: 'comparisonId',
          issue: `comparison does not include ${importRun.provider}`,
        },
      ]);
    }

    const estimatedTotalUsd = roundCurrency(provider.totals.monthly);
    const invoicedTotalUsd = roundCurrency(
      lineItems.reduce((total, item) => total + item.costUsd, 0),
    );
    const varianceUsd = roundCurrency(invoicedTotalUsd - estimatedTotalUsd);
    const variancePercent =
      estimatedTotalUsd === 0
        ? invoicedTotalUsd === 0
          ? 0
          : 100
        : roundPercent((varianceUsd / estimatedTotalUsd) * 100);
    const status = reconciliationStatus(estimatedTotalUsd, variancePercent);
    const evidence = reconciliationEvidence(comparison.resultSnapshot, importRunId, lineItems);

    return this.repository.saveInvoiceReconciliation({
      importRunId,
      comparisonId,
      provider: importRun.provider,
      estimatedTotalUsd,
      invoicedTotalUsd,
      varianceUsd,
      variancePercent,
      status,
      evidence,
    });
  }

  async listReconciliations(
    importRunId: string,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord[]> {
    const importRun = await this.repository.getBillingImport(importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(`Billing import ${importRunId} was not found`);
    }

    assertTeamAccess(importRun.teamId, identity);

    return this.repository.listInvoiceReconciliations(importRunId);
  }
}

function parseBillingImportInput(body: unknown): BillingImportInput {
  const record = requireRecord(body, 'Billing import request body must be an object');
  const provider = parseProvider(record.provider);
  const sourceType = parseSourceType(record.sourceType);
  const billingPeriodStart = parseDate(record.billingPeriodStart, 'billingPeriodStart');
  const billingPeriodEnd = parseDate(record.billingPeriodEnd, 'billingPeriodEnd');
  const originalFileSha256 = parseOptionalSha256(record.originalFileSha256);
  const rows = parseRows(record.rows);

  if (billingPeriodEnd < billingPeriodStart) {
    throw new ApiValidationError('billing period is invalid', [
      {
        field: 'billingPeriodEnd',
        issue: 'must be on or after billingPeriodStart',
      },
    ]);
  }

  return {
    provider,
    sourceType,
    billingPeriodStart,
    billingPeriodEnd,
    ...(originalFileSha256 ? { originalFileSha256 } : {}),
    rows,
  };
}

function parseBillingProviderExportInput(body: unknown): BillingProviderExportInput {
  const record = requireRecord(body, 'Provider billing export request body must be an object');
  const provider = parseProvider(record.provider);
  const sourceType = parseSourceType(record.sourceType);
  assertProviderSourceType(provider, sourceType);
  const billingPeriodStart = parseDate(record.billingPeriodStart, 'billingPeriodStart');
  const billingPeriodEnd = parseDate(record.billingPeriodEnd, 'billingPeriodEnd');
  const originalFileSha256 = parseOptionalSha256(record.originalFileSha256);
  const content = parseRequiredString(record.content, 'content', MAX_PROVIDER_EXPORT_BYTES * 2);
  const encoding = record.encoding === 'base64' ? 'base64' : 'text';
  const fileName = parseOptionalString(record.fileName, 180);

  if (billingPeriodEnd < billingPeriodStart) {
    throw new ApiValidationError('billing period is invalid', [
      {
        field: 'billingPeriodEnd',
        issue: 'must be on or after billingPeriodStart',
      },
    ]);
  }

  return {
    provider,
    sourceType,
    billingPeriodStart,
    billingPeriodEnd,
    content,
    encoding,
    ...(fileName ? { fileName } : {}),
    ...(originalFileSha256 ? { originalFileSha256 } : {}),
  };
}

function decodeProviderExport(input: BillingProviderExportInput): {
  text: string;
  sha256: string;
} {
  const buffer =
    input.encoding === 'base64'
      ? Buffer.from(input.content, 'base64')
      : Buffer.from(input.content, 'utf8');

  if (buffer.length === 0 || buffer.length > MAX_PROVIDER_EXPORT_BYTES) {
    throw new ApiValidationError('provider billing export size is invalid', [
      {
        field: 'content',
        issue: `must be between 1 byte and ${MAX_PROVIDER_EXPORT_BYTES} bytes`,
      },
    ]);
  }

  return {
    text: buffer.toString('utf8'),
    sha256: sha256(buffer.toString('base64')),
  };
}

function providerExportRows(
  input: BillingProviderExportInput,
  content: string,
): BillingImportRowInput[] {
  const trimmed = content.trim();
  const rawRows = trimmed.startsWith('[')
    ? parseJsonRows(trimmed)
    : parseCsvRows(trimmed, input.fileName ?? input.sourceType);

  if (rawRows.length === 0) {
    throw new ApiValidationError('provider billing export did not contain rows', [
      {
        field: 'content',
        issue: 'must include at least one usage/cost row',
      },
    ]);
  }

  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new ApiValidationError('provider billing export has too many rows', [
      {
        field: 'content',
        issue: `must contain ${MAX_IMPORT_ROWS} or fewer rows`,
      },
    ]);
  }

  return rawRows.map((row, index) => providerExportRow(input.provider, row, index));
}

function providerExportRow(
  provider: BillingImportInput['provider'],
  row: Record<string, unknown>,
  index: number,
): BillingImportRowInput {
  switch (provider) {
    case 'aws':
      return awsCurRow(row, index);
    case 'azure':
      return azureCostRow(row, index);
    case 'gcp':
      return gcpBillingRow(row, index);
  }
}

function awsCurRow(row: Record<string, unknown>, index: number): BillingImportRowInput {
  return providerRow({
    row,
    index,
    provider: 'aws',
    serviceName:
      firstString(row, ['lineItem/ProductCode', 'product/ProductName', 'product/productName']) ??
      'AWS usage',
    skuId: firstString(row, ['product/sku', 'pricing/RateId', 'lineItem/UsageType']),
    region: firstString(row, ['product/region', 'product/regionCode', 'lineItem/AvailabilityZone']),
    resourceId: firstString(row, ['lineItem/ResourceId']),
    usageStart: firstIso(row, ['lineItem/UsageStartDate']),
    usageEnd: firstIso(row, ['lineItem/UsageEndDate']),
    usageQuantity: firstNumber(row, ['lineItem/UsageAmount']),
    usageUnit: firstString(row, ['pricing/unit', 'lineItem/UsageType']),
    costUsd: firstNumber(row, [
      'lineItem/NetUnblendedCost',
      'lineItem/UnblendedCost',
      'lineItem/BlendedCost',
    ]),
    currency: firstString(row, ['lineItem/CurrencyCode', 'bill/BillingCurrencyCode']),
    tags: prefixedTags(row, ['resourceTags/user:', 'resourceTags/aws:']),
  });
}

function azureCostRow(row: Record<string, unknown>, index: number): BillingImportRowInput {
  return providerRow({
    row,
    index,
    provider: 'azure',
    serviceName:
      firstString(row, ['ServiceName', 'serviceName', 'ConsumedService', 'consumedService']) ??
      'Azure usage',
    skuId: firstString(row, ['MeterId', 'meterId', 'ProductId', 'productId']),
    region: firstString(row, ['ResourceLocation', 'resourceLocation', 'Region', 'region']),
    resourceId: firstString(row, ['ResourceId', 'resourceId', 'InstanceId', 'instanceId']),
    usageStart: firstIso(row, ['UsageDateTime', 'usageDateTime', 'Date', 'date']),
    usageEnd: firstIso(row, ['UsageEndDate', 'usageEndDate']),
    usageQuantity: firstNumber(row, ['Quantity', 'quantity']),
    usageUnit: firstString(row, ['UnitOfMeasure', 'unitOfMeasure', 'Unit', 'unit']),
    costUsd: firstNumber(row, ['CostInUSD', 'costInUSD', 'CostUSD', 'costUSD']),
    fallbackCost: firstNumber(row, [
      'CostInBillingCurrency',
      'costInBillingCurrency',
      'PreTaxCost',
      'pretaxCost',
    ]),
    currency: firstString(row, [
      'BillingCurrencyCode',
      'billingCurrencyCode',
      'Currency',
      'currency',
    ]),
    tags: tagsFromJsonish(row, ['Tags', 'tags']),
  });
}

function gcpBillingRow(row: Record<string, unknown>, index: number): BillingImportRowInput {
  return providerRow({
    row,
    index,
    provider: 'gcp',
    serviceName:
      firstString(row, [
        'service.description',
        'service_description',
        'service.id',
        'service_id',
      ]) ?? 'GCP usage',
    skuId: firstString(row, ['sku.id', 'sku_id', 'sku.description', 'sku_description']),
    region: firstString(row, ['location.region', 'location_region', 'region']),
    resourceId: firstString(row, ['resource.name', 'resource_name', 'project.id', 'project_id']),
    usageStart: firstIso(row, ['usage_start_time', 'usage.start_time', 'usageStartTime']),
    usageEnd: firstIso(row, ['usage_end_time', 'usage.end_time', 'usageEndTime']),
    usageQuantity: firstNumber(row, ['usage.amount', 'usage_amount']),
    usageUnit: firstString(row, ['usage.unit', 'usage_unit']),
    costUsd: firstNumber(row, ['cost']),
    currency: firstString(row, ['currency']),
    tags: tagsFromJsonish(row, ['labels', 'project.labels', 'system_labels']),
  });
}

function providerRow(input: {
  row: Record<string, unknown>;
  index: number;
  provider: BillingImportInput['provider'];
  serviceName: string;
  skuId?: string;
  region?: string;
  resourceId?: string;
  usageStart?: string;
  usageEnd?: string;
  usageQuantity?: number;
  usageUnit?: string;
  costUsd?: number;
  fallbackCost?: number;
  currency?: string;
  tags: Record<string, string>;
}): BillingImportRowInput {
  const costUsd = input.costUsd ?? input.fallbackCost;

  if (costUsd === undefined) {
    throw new ApiValidationError(`${input.provider} billing row is missing cost`, [
      {
        field: `rows.${input.index}.cost`,
        issue: 'must include a provider cost column',
      },
    ]);
  }

  return {
    serviceName: input.serviceName,
    ...(input.skuId ? { skuId: input.skuId } : {}),
    ...(input.region ? { region: input.region } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.usageStart ? { usageStart: input.usageStart } : {}),
    ...(input.usageEnd ? { usageEnd: input.usageEnd } : {}),
    ...(input.usageQuantity !== undefined ? { usageQuantity: input.usageQuantity } : {}),
    ...(input.usageUnit ? { usageUnit: input.usageUnit } : {}),
    costUsd,
    currency: input.currency ?? 'USD',
    tags: input.tags,
    rawPayload: input.row,
  };
}

function parseJsonRows(content: string): Record<string, unknown>[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ApiValidationError('provider billing export JSON is invalid', [
      {
        field: 'content',
        issue: 'must be a JSON array of billing rows',
      },
    ]);
  }

  if (!Array.isArray(parsed)) {
    throw new ApiValidationError('provider billing export JSON must be an array', [
      {
        field: 'content',
        issue: 'must be a JSON array of billing rows',
      },
    ]);
  }

  return parsed.map((row, index) =>
    requireRecord(row, `provider export JSON row ${index} must be an object`),
  );
}

function parseCsvRows(content: string, sourceLabel: string): Record<string, unknown>[] {
  const lines = csvRecords(content);

  if (lines.length < 2) {
    throw new ApiValidationError(`${sourceLabel} CSV did not contain data rows`, [
      {
        field: 'content',
        issue: 'must include a header row and at least one data row',
      },
    ]);
  }

  const headers = lines[0].map((header) => header.trim());

  return lines
    .slice(1)
    .map(
      (line) =>
        Object.fromEntries(
          headers.flatMap((header, index) => (header ? [[header, line.at(index) ?? '']] : [])),
        ) as Record<string, unknown>,
    );
}

function csvRecords(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content.charAt(index);
    const nextChar = content.charAt(index + 1);

    if (char === '"' && inQuotes && nextChar === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim())) {
    rows.push(currentRow);
  }

  if (inQuotes) {
    throw new ApiValidationError('provider billing export CSV has unclosed quotes', [
      {
        field: 'content',
        issue: 'CSV quotes must be balanced',
      },
    ]);
  }

  return rows;
}

function parseRows(value: unknown): BillingImportRowInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiValidationError('rows are required', [
      {
        field: 'rows',
        issue: 'must include at least one billing line item',
      },
    ]);
  }

  if (value.length > MAX_IMPORT_ROWS) {
    throw new ApiValidationError('billing import has too many rows', [
      {
        field: 'rows',
        issue: `must contain ${MAX_IMPORT_ROWS} or fewer rows`,
      },
    ]);
  }

  return value.map((row, index) => parseRow(row, index));
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = rowValue(row, key);

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = rowValue(row, key);
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number.parseFloat(value)
          : Number.NaN;

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function firstIso(row: Record<string, unknown>, keys: string[]): string | undefined {
  const value = firstString(row, keys);

  if (!value || Number.isNaN(Date.parse(value))) {
    return undefined;
  }

  return new Date(value).toISOString();
}

function prefixedTags(row: Record<string, unknown>, prefixes: string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).flatMap(([key, value]) => {
      const prefix = prefixes.find((candidate) => key.startsWith(candidate));

      return prefix && typeof value === 'string' && value.trim()
        ? [[key.slice(prefix.length, prefix.length + 120), value.trim().slice(0, 240)]]
        : [];
    }),
  );
}

function tagsFromJsonish(row: Record<string, unknown>, keys: string[]): Record<string, string> {
  for (const key of keys) {
    const value = rowValue(row, key);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return stringifyTagValues(value as Record<string, unknown>);
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return stringifyTagValues(parsed as Record<string, unknown>);
        }
      } catch {
        return Object.fromEntries(
          value
            .split(';')
            .map((pair) => pair.split(':'))
            .filter(([tagKey, tagValue]) => Boolean(tagKey?.trim() && tagValue?.trim()))
            .map(([tagKey, tagValue]) => [
              tagKey.trim().slice(0, 120),
              tagValue.trim().slice(0, 240),
            ]),
        );
      }
    }
  }

  return {};
}

function stringifyTagValues(tags: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).flatMap(([key, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? [[key.slice(0, 120), String(value).slice(0, 240)]]
        : [],
    ),
  );
}

function assertProviderSourceType(
  provider: BillingImportInput['provider'],
  sourceType: BillingSourceType,
): void {
  const expected = expectedSourceTypeForProvider(provider);

  if (sourceType !== expected && sourceType !== 'normalized-csv') {
    throw new ApiValidationError('sourceType does not match provider', [
      {
        field: 'sourceType',
        issue: `${provider} provider exports must use ${expected}`,
      },
    ]);
  }
}

function rowValue(row: Record<string, unknown>, key: string): unknown {
  return Object.entries(row).find(([candidate]) => candidate === key)?.[1];
}

function expectedSourceTypeForProvider(
  provider: BillingImportInput['provider'],
): BillingSourceType {
  switch (provider) {
    case 'aws':
      return 'aws-cur';
    case 'azure':
      return 'azure-cost-management';
    case 'gcp':
      return 'gcp-billing-export';
  }
}

function parseRow(value: unknown, index: number): BillingImportRowInput {
  const fieldPrefix = `rows.${index}`;
  const record = requireRecord(value, `${fieldPrefix} must be an object`);
  const serviceName = parseRequiredString(record.serviceName, `${fieldPrefix}.serviceName`, 180);
  const costUsd = parseFiniteNumber(record.costUsd, `${fieldPrefix}.costUsd`);

  return {
    serviceName,
    ...(parseOptionalString(record.skuId, 180)
      ? { skuId: parseOptionalString(record.skuId, 180) }
      : {}),
    ...(parseOptionalString(record.region, 120)
      ? { region: parseOptionalString(record.region, 120) }
      : {}),
    ...(parseOptionalString(record.resourceId, 240)
      ? { resourceId: parseOptionalString(record.resourceId, 240) }
      : {}),
    ...(record.usageStart !== undefined
      ? { usageStart: parseIsoDateTime(record.usageStart, `${fieldPrefix}.usageStart`) }
      : {}),
    ...(record.usageEnd !== undefined
      ? { usageEnd: parseIsoDateTime(record.usageEnd, `${fieldPrefix}.usageEnd`) }
      : {}),
    ...(record.usageQuantity !== undefined
      ? { usageQuantity: parseFiniteNumber(record.usageQuantity, `${fieldPrefix}.usageQuantity`) }
      : {}),
    ...(parseOptionalString(record.usageUnit, 80)
      ? { usageUnit: parseOptionalString(record.usageUnit, 80) }
      : {}),
    costUsd,
    currency: parseOptionalString(record.currency, 12) ?? 'USD',
    tags: parseTags(record.tags, `${fieldPrefix}.tags`),
    rawPayload: parseObject(record.rawPayload, `${fieldPrefix}.rawPayload`),
  };
}

function parseComparisonId(body: unknown): string {
  const record = requireRecord(body, 'Reconciliation request body must be an object');

  return parseRequiredString(record.comparisonId, 'comparisonId', 80);
}

function parseProvider(value: unknown): BillingImportInput['provider'] {
  if (value === 'aws' || value === 'azure' || value === 'gcp') {
    return value;
  }

  throw new ApiValidationError('provider must be aws, azure, or gcp', [
    {
      field: 'provider',
      issue: 'must be aws, azure, or gcp',
    },
  ]);
}

function parseSourceType(value: unknown): BillingSourceType {
  if (typeof value === 'string' && SOURCE_TYPES.includes(value as BillingSourceType)) {
    return value as BillingSourceType;
  }

  throw new ApiValidationError('sourceType is unsupported', [
    {
      field: 'sourceType',
      issue: 'must be aws-cur, azure-cost-management, gcp-billing-export, or normalized-csv',
    },
  ]);
}

function parseDate(value: unknown, field: string): string {
  const parsed = parseRequiredString(value, field, 10);

  if (!DATE_PATTERN.test(parsed) || Number.isNaN(Date.parse(`${parsed}T00:00:00.000Z`))) {
    throw new ApiValidationError(`${field} must be a date`, [
      {
        field,
        issue: 'must be YYYY-MM-DD',
      },
    ]);
  }

  return parsed;
}

function parseIsoDateTime(value: unknown, field: string): string {
  const parsed = parseRequiredString(value, field, 40);

  if (Number.isNaN(Date.parse(parsed))) {
    throw new ApiValidationError(`${field} must be an ISO timestamp`, [
      {
        field,
        issue: 'must be a valid ISO timestamp',
      },
    ]);
  }

  return new Date(parsed).toISOString();
}

function parseRequiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiValidationError(`${field} is required`, [
      {
        field,
        issue: 'is required',
      },
    ]);
  }

  return value.trim().slice(0, maxLength);
}

function parseOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  return value.trim().slice(0, maxLength);
}

function parseOptionalSha256(value: unknown): string | undefined {
  const parsed = parseOptionalString(value, 64);

  if (!parsed) {
    return undefined;
  }

  if (!SHA256_PATTERN.test(parsed)) {
    throw new ApiValidationError('originalFileSha256 must be a SHA-256 hex digest', [
      {
        field: 'originalFileSha256',
        issue: 'must be a 64-character lowercase SHA-256 hex digest',
      },
    ]);
  }

  return parsed;
}

function parseFiniteNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(parsed)) {
    throw new ApiValidationError(`${field} must be a number`, [
      {
        field,
        issue: 'must be a finite number',
      },
    ]);
  }

  return parsed;
}

function parseTags(value: unknown, field: string): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  const record = parseObject(value, field);
  const tags: Record<string, string> = {};

  for (const [key, tagValue] of Object.entries(record)) {
    if (typeof tagValue === 'string') {
      tags[key.slice(0, 120)] = tagValue.slice(0, 240);
    }
  }

  return tags;
}

function parseObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiValidationError(`${field} must be an object`, [
      {
        field,
        issue: 'must be an object',
      },
    ]);
  }

  return value as Record<string, unknown>;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiValidationError(message);
  }

  return value as Record<string, unknown>;
}

function assertTeamAccess(teamId: string | undefined, identity: AuthIdentity): void {
  if (teamId && teamId !== identity.teamId) {
    throw new ApiForbiddenError('Billing import belongs to a different active team');
  }
}

function reconciliationStatus(
  estimatedTotalUsd: number,
  variancePercent: number,
): InvoiceReconciliationStatus {
  if (estimatedTotalUsd === 0) {
    return 'unmatched';
  }

  const absoluteVariance = Math.abs(variancePercent);

  if (absoluteVariance <= 5) {
    return 'matched';
  }

  return absoluteVariance <= 15 ? 'variance-warning' : 'variance-critical';
}

function reconciliationEvidence(
  comparison: ComparisonResult,
  importRunId: string,
  lineItems: Array<{ lineItemHash: string; skuId?: string; serviceName: string }>,
): Record<string, unknown> {
  const traceKeys = comparison.providers.flatMap((provider) =>
    provider.lineItems.map((lineItem) => ({
      providerId: provider.providerId,
      category: lineItem.category,
      skuId: lineItem.skuId ?? lineItem.rateSourceSkuId ?? null,
      rateSource: lineItem.rateSource ?? null,
      pricingTrace: lineItem.pricingTrace ?? null,
    })),
  );

  return {
    importRunId,
    comparisonId: comparison.comparisonId,
    pricingAsOf: comparison.pricingAsOf,
    invoiceLineItemHashes: lineItems.map((lineItem) => lineItem.lineItemHash),
    invoiceSkuIds: [...new Set(lineItems.map((lineItem) => lineItem.skuId).filter(Boolean))],
    invoiceServices: [...new Set(lineItems.map((lineItem) => lineItem.serviceName))],
    comparisonTraceKeys: traceKeys,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
