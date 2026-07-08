import { ProviderId } from '../adapters/common/cloud-provider-adapter';

export type BillingSourceType =
  'aws-cur' | 'azure-cost-management' | 'gcp-billing-export' | 'normalized-csv';
export type BillingImportStatus = 'processing' | 'completed' | 'failed';
export type InvoiceReconciliationStatus =
  'matched' | 'variance-warning' | 'variance-critical' | 'unmatched';
export type InvoiceGradeArtifactType =
  | 'provider-invoice'
  | 'provider-export-manifest'
  | 'control-total'
  | 'tax-invoice'
  | 'private-pricing-agreement'
  | 'commitment-inventory'
  | 'commitment-amortization-schedule'
  | 'allocation-map'
  | 'currency-policy'
  | 'provider-sku-map';
export type InvoiceGradeArtifactVerificationStatus = 'registered' | 'verified' | 'rejected';
export type InvoiceAdjustmentCategory =
  | 'usage'
  | 'credit'
  | 'discount'
  | 'tax'
  | 'support'
  | 'marketplace'
  | 'refund'
  | 'enterprise-adjustment'
  | 'commitment-covered-usage'
  | 'commitment-discount'
  | 'commitment-fee'
  | 'commitment-amortization'
  | 'fee'
  | 'unknown';

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

export interface InvoiceGradeArtifactRegistrationInput {
  type: InvoiceGradeArtifactType;
  displayName: string;
  reference: string;
  sha256?: string;
  controlTotalUsd?: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  notes?: string;
}

export interface InvoiceGradeArtifactVerificationInput {
  verificationStatus: Exclude<InvoiceGradeArtifactVerificationStatus, 'registered'>;
  evidenceReference: string;
  sha256?: string;
  controlTotalUsd?: number;
  notes?: string;
}

export interface InvoiceArtifactBlobUploadInput {
  fileName: string;
  mimeType: string;
  content: string;
  encoding?: 'text' | 'base64';
  sha256?: string;
}

export interface InvoiceArtifactBlobRecord {
  id: string;
  reconciliationId: string;
  artifactId: string;
  teamId?: string;
  fileName: string;
  mimeType: string;
  contentSha256: string;
  contentSizeBytes: number;
  contentBase64: string;
  uploadedByAccountId?: string;
  uploadedAt: string;
}

export interface InvoiceGradeArtifactRecord extends InvoiceGradeArtifactRegistrationInput {
  id: string;
  provider: ProviderId;
  verificationStatus: InvoiceGradeArtifactVerificationStatus;
  registeredAt: string;
  registeredByAccountId?: string;
  verifiedAt?: string;
  verifiedByAccountId?: string;
  rejectedAt?: string;
  rejectedByAccountId?: string;
  verificationEvidenceReference?: string;
  verificationNotes?: string;
  verifiedSha256?: string;
  verificationControlTotalUsd?: number;
  verificationControlTotalDeltaUsd?: number;
  storedBlob?: {
    storageStatus: 'stored';
    storageMode: 'database-bytea';
    fileName: string;
    mimeType: string;
    contentSha256: string;
    contentSizeBytes: number;
    uploadedAt: string;
    uploadedByAccountId?: string;
  };
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
