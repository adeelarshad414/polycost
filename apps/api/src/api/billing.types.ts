import { ProviderId } from '../adapters/common/cloud-provider-adapter';

export type BillingSourceType =
  'aws-cur' | 'azure-cost-management' | 'gcp-billing-export' | 'normalized-csv';
export type BillingImportStatus = 'processing' | 'completed' | 'failed';
export type InvoiceReconciliationStatus =
  'matched' | 'variance-warning' | 'variance-critical' | 'unmatched';

export interface BillingImportRowInput {
  serviceName: string;
  skuId?: string;
  region?: string;
  resourceId?: string;
  usageStart?: string;
  usageEnd?: string;
  usageQuantity?: number;
  usageUnit?: string;
  costUsd: number;
  currency?: string;
  tags?: Record<string, string>;
  rawPayload?: Record<string, unknown>;
}

export interface BillingImportInput {
  provider: ProviderId;
  sourceType: BillingSourceType;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  originalFileSha256?: string;
  rows: BillingImportRowInput[];
}

export interface BillingProviderExportInput {
  provider: ProviderId;
  sourceType: BillingSourceType;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  content: string;
  encoding?: 'text' | 'base64';
  fileName?: string;
  originalFileSha256?: string;
}

export interface BillingImportRecord {
  id: string;
  teamId?: string;
  provider: ProviderId;
  sourceType: BillingSourceType;
  status: BillingImportStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  originalFileSha256: string;
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected: number;
  totalCostUsd: number;
  createdByAccountId?: string;
  createdAt: string;
  completedAt?: string;
  errorDetail?: string;
}

export interface InvoiceLineItemRecord extends BillingImportRowInput {
  id: string;
  importRunId: string;
  teamId?: string;
  provider: ProviderId;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  lineItemHash: string;
  matchedComparisonId?: string;
  matchedTraceKey?: string;
  createdAt: string;
}

export interface BillingImportResponse {
  importRun: BillingImportRecord;
  acceptedRows: number;
  rejectedRows: number;
  lineItems: InvoiceLineItemRecord[];
}

export interface InvoiceReconciliationRecord {
  id: string;
  importRunId: string;
  comparisonId: string;
  provider: ProviderId;
  estimatedTotalUsd: number;
  invoicedTotalUsd: number;
  varianceUsd: number;
  variancePercent: number;
  status: InvoiceReconciliationStatus;
  evidence: Record<string, unknown>;
  createdAt: string;
}
