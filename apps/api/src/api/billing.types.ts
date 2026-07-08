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
export type InvoiceArtifactStorageBackend = 'database-bytea' | 'aws-s3' | 'azure-blob' | 'gcp-gcs';
export type InvoiceArtifactMalwareScannerMode = 'eicar-signature-only' | 'http-webhook';
export type InvoiceArtifactRetentionEnforcementMode = 'report-only' | 'delete-expired';
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
  retentionDays?: number;
  legalHold?: boolean;
  kmsKeyReference?: string;
}

export interface InvoiceArtifactLegalHoldInput {
  legalHold: boolean;
  reason?: string;
}

export type InvoiceArtifactReviewStatus = 'not-requested' | 'pending' | 'approved' | 'rejected';

export interface InvoiceArtifactReviewInput {
  reviewStatus: Exclude<InvoiceArtifactReviewStatus, 'not-requested'>;
  reviewer?: string;
  dueAt?: string;
  evidenceReference?: string;
  notes?: string;
}

export interface InvoiceArtifactReviewQueueItem {
  importRunId: string;
  reconciliationId: string;
  comparisonId: string;
  provider: ProviderId;
  artifactId: string;
  artifactType: InvoiceGradeArtifactType;
  displayName: string;
  verificationStatus: InvoiceGradeArtifactVerificationStatus;
  reviewStatus: InvoiceArtifactReviewStatus;
  artifactBlobStored: boolean;
  legalHold: boolean;
  reviewer?: string;
  dueAt?: string;
  reviewRequestedAt?: string;
  reviewRequestedByAccountId?: string;
  reviewedAt?: string;
  reviewedByAccountId?: string;
  evidenceReference?: string;
  notes?: string;
}

export type InvoiceArtifactPolicyExceptionStatus =
  'not-requested' | 'requested' | 'approved' | 'rejected' | 'expired';

export interface InvoiceArtifactPolicyExceptionInput {
  exceptionStatus: Exclude<InvoiceArtifactPolicyExceptionStatus, 'not-requested' | 'expired'>;
  reason: string;
  reviewer?: string;
  expiresAt?: string;
  evidenceReference?: string;
  notes?: string;
}

export interface InvoiceArtifactPolicyExceptionQueueItem {
  importRunId: string;
  reconciliationId: string;
  comparisonId: string;
  provider: ProviderId;
  artifactId: string;
  artifactType: InvoiceGradeArtifactType;
  displayName: string;
  verificationStatus: InvoiceGradeArtifactVerificationStatus;
  reviewStatus: InvoiceArtifactReviewStatus;
  exceptionStatus: InvoiceArtifactPolicyExceptionStatus;
  artifactBlobStored: boolean;
  legalHold: boolean;
  reason?: string;
  reviewer?: string;
  expiresAt?: string;
  requestedAt?: string;
  requestedByAccountId?: string;
  decidedAt?: string;
  decidedByAccountId?: string;
  evidenceReference?: string;
  notes?: string;
}

export type InvoiceControlValidationStatus =
  'not-run' | 'matched' | 'variance-warning' | 'mismatch';

export interface InvoiceControlValidationInput {
  acceptedVarianceUsd?: number;
  evidenceReference?: string;
  notes?: string;
}

export interface InvoiceArtifactBlobGovernance {
  storageProfile: {
    storageBackend: InvoiceArtifactStorageBackend;
    encryptionStatus: 'database-managed' | 'customer-managed-kms';
    objectStore?: {
      bucketOrContainer: string;
      prefix: string;
      region?: string;
      key?: string;
      uri?: string;
      eTag?: string;
      version?: string;
    };
    kmsKeyReference?: string;
    kmsKeyRequiredForProduction: boolean;
  };
  retentionPolicy: {
    retentionUntil: string;
    retentionDays: number;
    legalHold: boolean;
  };
  malwareScan: {
    status: 'passed' | 'failed';
    scanner: string;
    checkedAt: string;
    findings: string[];
  };
}

export interface InvoiceArtifactStorageReadiness {
  storageBackend: InvoiceArtifactStorageBackend;
  scannerMode: InvoiceArtifactMalwareScannerMode;
  retentionEnforcementMode: InvoiceArtifactRetentionEnforcementMode;
  productionReady: boolean;
  credentialSource: 'database-connection' | 'vault-or-workload-identity';
  objectStore?: {
    bucketOrContainer: string;
    prefix: string;
    region?: string;
  };
  kmsKeyReference?: string;
  gaps: string[];
}

export interface InvoiceArtifactRetentionEnforcementResult {
  mode: InvoiceArtifactRetentionEnforcementMode;
  evaluatedAt: string;
  dryRun: boolean;
  storageBackend: InvoiceArtifactStorageBackend;
  expiredCandidates: number;
  legalHoldSkipped: number;
  deleted: number;
}

export interface InvoiceArtifactBlobRecord extends InvoiceArtifactBlobGovernance {
  id: string;
  reconciliationId: string;
  artifactId: string;
  teamId?: string;
  fileName: string;
  mimeType: string;
  contentSha256: string;
  contentSizeBytes: number;
  contentBase64?: string;
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
  reviewStatus?: InvoiceArtifactReviewStatus;
  reviewRequestedAt?: string;
  reviewRequestedByAccountId?: string;
  reviewReviewer?: string;
  reviewDueAt?: string;
  reviewEvidenceReference?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  reviewedByAccountId?: string;
  policyExceptionStatus?: InvoiceArtifactPolicyExceptionStatus;
  policyExceptionRequestedAt?: string;
  policyExceptionRequestedByAccountId?: string;
  policyExceptionReviewer?: string;
  policyExceptionExpiresAt?: string;
  policyExceptionReason?: string;
  policyExceptionEvidenceReference?: string;
  policyExceptionNotes?: string;
  policyExceptionDecidedAt?: string;
  policyExceptionDecidedByAccountId?: string;
  invoiceControlValidationStatus?: InvoiceControlValidationStatus;
  invoiceControlValidatedAt?: string;
  invoiceControlValidatedByAccountId?: string;
  invoiceControlEvidenceReference?: string;
  invoiceControlNotes?: string;
  invoiceControlAcceptedVarianceUsd?: number;
  invoiceControlTotalDeltaUsd?: number;
  invoiceControlImportDeltaUsd?: number;
  invoiceControlPeriodMatched?: boolean;
  storedBlob?: {
    storageStatus: 'stored';
    storageMode: InvoiceArtifactStorageBackend;
    fileName: string;
    mimeType: string;
    contentSha256: string;
    contentSizeBytes: number;
    uploadedAt: string;
    uploadedByAccountId?: string;
    legalHoldUpdatedAt?: string;
    legalHoldUpdatedByAccountId?: string;
    legalHoldReason?: string;
    governance?: InvoiceArtifactBlobGovernance;
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
