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
export type InvoiceArtifactProviderRetentionProofMode =
  'not-configured' | 'declared-config' | 'provider-control-plane';
export type InvoiceArtifactProviderRetentionProofStatus =
  'not-applicable' | 'missing' | 'declared' | 'provider-verified';
export type InvoiceEvidenceReceiptMode = 'metadata-only' | 'local-hmac' | 'external-webhook';
export type InvoiceEvidenceWormRetentionMode =
  'not-configured' | 'provider-object-lock' | 'external-worm-receiver';
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

export interface InvoiceArtifactProviderRetentionProofInput {
  proofReference: string;
  proofDigestSha256: string;
  checkedAt?: string;
  notes?: string;
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

export interface InvoiceArtifactProviderRetentionProof {
  schemaVersion: 'invoice-artifact-provider-retention-proof/v1';
  status: InvoiceArtifactProviderRetentionProofStatus;
  evidenceSource: 'not-required' | 'local-config' | 'provider-control-plane';
  storageBackend: InvoiceArtifactStorageBackend;
  checkedAt: string;
  retentionMode: InvoiceEvidenceWormRetentionMode;
  retentionUntil: string;
  legalHold: boolean;
  objectStore?: {
    bucketOrContainer: string;
    prefix?: string;
    region?: string;
    key?: string;
    uri?: string;
    eTag?: string;
    version?: string;
  };
  proofReference?: string;
  proofDigestSha256?: string;
  caveats: string[];
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
  providerRetentionProof: InvoiceArtifactProviderRetentionProof;
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
  providerRetentionProofMode: InvoiceArtifactProviderRetentionProofMode;
  providerRetentionProofReference?: string;
  providerRetentionProofSha256?: string;
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

export type InvoiceEvidencePacketStatus = 'empty' | 'blocked' | 'review-ready';

export interface InvoiceEvidencePacketIntegrity {
  schemaVersion: 'invoice-evidence-packet-integrity/v1';
  canonicalization: 'stable-json:v1';
  digestAlgorithm: 'sha256';
  payloadDigestSha256: string;
  payloadByteLength: number;
  subject: {
    reconciliationId: string;
    importRunId: string;
    comparisonId: string;
    provider: ProviderId;
  };
  artifactCount: number;
  storedArtifactCount: number;
  verifiedArtifactCount: number;
  caveatCount: number;
  disclaimerCount: number;
  generatedAt: string;
}

export interface InvoiceEvidencePacketArtifact {
  id: string;
  provider: ProviderId;
  type: InvoiceGradeArtifactType;
  displayName: string;
  reference: string;
  verificationStatus: InvoiceGradeArtifactVerificationStatus;
  registeredAt: string;
  stored: boolean;
  reviewed: boolean;
  invoiceControlValidationStatus: InvoiceControlValidationStatus;
  sha256?: string;
  verifiedSha256?: string;
  controlTotalUsd?: number;
  verificationControlTotalUsd?: number;
  invoiceControlTotalDeltaUsd?: number;
  invoiceControlImportDeltaUsd?: number;
  invoiceControlPeriodMatched?: boolean;
  storedBlob?: InvoiceGradeArtifactRecord['storedBlob'];
  reviewStatus?: InvoiceArtifactReviewStatus;
  policyExceptionStatus?: InvoiceArtifactPolicyExceptionStatus;
}

export interface InvoiceEvidencePacketGovernance {
  schemaVersion: 'invoice-evidence-governance/v1';
  generatedAt: string;
  storageReadiness: InvoiceArtifactStorageReadiness;
  accessControls: {
    requiresBillingAdmin: true;
    teamScoped: boolean;
    rawArtifactBytesExcluded: true;
    packetExportAuditAction: 'billing.reconciliation.evidence_packet_exported';
    artifactDownloadAuditAction: 'billing.reconciliation.artifact_blob_downloaded';
    verifierCommand: 'npm run invoice:evidence:verify -- <packet.json>';
  };
  storagePosture: {
    storageBackends: InvoiceArtifactStorageBackend[];
    storedArtifactCount: number;
    governanceManifestCount: number;
    databaseStoredCount: number;
    externalObjectStoreCount: number;
    customerManagedKmsCount: number;
    missingKmsCount: number;
    retentionPolicyCount: number;
    expiredRetentionCount: number;
    legalHoldCount: number;
    providerRetentionProofMissingCount: number;
    providerRetentionProofDeclaredCount: number;
    providerRetentionProofVerifiedCount: number;
    providerRetentionProofNotApplicableCount: number;
    malwareScanPassedCount: number;
    malwareScanFailedCount: number;
    malwareScannerEngines: string[];
    earliestRetentionUntil?: string;
    latestRetentionUntil?: string;
  };
  productionGates: {
    externalObjectStorageReady: boolean;
    customerManagedKmsReady: boolean;
    malwareScanningReady: boolean;
    retentionPolicyReady: boolean;
    retentionDeletionReady: boolean;
    providerRetentionProofReady: boolean;
    packetIntegrityReady: true;
    auditTrailReady: boolean;
  };
  gaps: string[];
}

export interface InvoiceEvidencePacketReceipt {
  schemaVersion: 'invoice-evidence-receipt/v1';
  mode: InvoiceEvidenceReceiptMode;
  status: 'metadata-only' | 'signed-local' | 'external-notary-ready';
  issuedAt: string;
  subject: InvoiceEvidencePacketIntegrity['subject'];
  basePayloadDigestSha256: string;
  basePayloadByteLength: number;
  signature?: {
    algorithm: 'hmac-sha256';
    keyReference: string;
    signedPayloadDigestSha256: string;
    signature: string;
    signedFields: string[];
  };
  notary?: {
    deliveryMode: 'operator-forwarded-webhook' | 'api-webhook';
    urlHost: string;
    urlSha256: string;
    deliveryEvidence: 'not-sent-by-api' | 'accepted-by-api' | 'failed-api-webhook';
    attemptedAt?: string;
    requestDigestSha256?: string;
    acceptedSubjectDigestSha256?: string;
    responseStatusCode?: number;
    message?: string;
  };
  wormReadiness: {
    retentionMode: InvoiceEvidenceWormRetentionMode;
    configured: boolean;
    objectStorageConfigured: boolean;
    customerManagedKmsConfigured: boolean;
    scannerWebhookConfigured: boolean;
    retentionDeleteExpiredConfigured: boolean;
    auditExportWebhookConfigured: boolean;
    signedReceiptConfigured: boolean;
    gaps: string[];
  };
  caveats: string[];
}

export interface InvoiceEvidencePacketResponse {
  packetVersion: 'invoice-evidence-packet/v1';
  packetStatus: InvoiceEvidencePacketStatus;
  generatedAt: string;
  integrity: InvoiceEvidencePacketIntegrity;
  reconciliation: Pick<
    InvoiceReconciliationRecord,
    | 'id'
    | 'importRunId'
    | 'comparisonId'
    | 'provider'
    | 'estimatedTotalUsd'
    | 'invoicedTotalUsd'
    | 'varianceUsd'
    | 'variancePercent'
    | 'status'
    | 'createdAt'
  >;
  importRun: Pick<
    BillingImportRecord,
    | 'id'
    | 'provider'
    | 'sourceType'
    | 'billingPeriodStart'
    | 'billingPeriodEnd'
    | 'originalFileSha256'
    | 'rowsAccepted'
    | 'rowsRejected'
    | 'totalCostUsd'
    | 'createdAt'
  >;
  readiness: Record<string, unknown>;
  matchSummary: Record<string, unknown>;
  artifactRegister: Record<string, unknown>;
  artifactGovernance: InvoiceEvidencePacketGovernance;
  receipt: InvoiceEvidencePacketReceipt;
  artifacts: InvoiceEvidencePacketArtifact[];
  controls: {
    registeredCount: number;
    verifiedCount: number;
    storedCount: number;
    reviewApprovedCount: number;
    policyExceptionApprovedCount: number;
    policyExceptionExpiredCount: number;
    invoiceControlMatchedCount: number;
    invoiceControlVarianceWarningCount: number;
    invoiceControlMismatchCount: number;
    invoiceControlNotRunCount: number;
  };
  caveats: string[];
  disclaimers: string[];
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
  // DB-computed md5 of the evidence JSON at read time, used as an optimistic
  // concurrency token so a stale read cannot silently clobber a concurrent write.
  evidenceHash: string;
  createdAt: string;
}
