import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { ApiForbiddenError, ApiNotFoundError, ApiValidationError } from './api-errors';
import { ApiDatabaseRepository } from './api-database.repository';
import { AuthIdentity } from './auth.types';
import {
  BillingImportInput,
  BillingImportResponse,
  BillingImportRowInput,
  BillingSourceType,
  InvoiceReconciliationRecord,
  InvoiceReconciliationStatus,
} from './billing.types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_IMPORT_ROWS = 10_000;
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
