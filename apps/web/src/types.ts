import type {
  AiCostNarrative as SharedAiCostNarrative,
  NormalizedRequirement as SharedNormalizedRequirement,
  ProviderCostResult as SharedProviderCostResult,
} from '@polycost/types';

export type NormalizedRequirement = SharedNormalizedRequirement;
export type ProviderCostResult = SharedProviderCostResult;
export type AiCostNarrative = SharedAiCostNarrative;

export const PROVIDER_ORDER = ['aws', 'azure', 'gcp'] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];
export type TerraformTargetCloud = ProviderId;
export type TerraformRuntimeTarget = 'vm' | 'containers' | 'serverless' | 'kubernetes';
export type TerraformNetworkTopology = 'public' | 'private' | 'landing-zone';
export type TerraformAvailabilityMode =
  'single-region' | 'multi-az' | 'multi-region-dr' | 'active-active';
export interface TerraformGenerateOptions {
  runtimeTarget?: TerraformRuntimeTarget;
  networkTopology?: TerraformNetworkTopology;
  availabilityMode?: TerraformAvailabilityMode;
  includePolicyPack?: boolean;
  includeModuleScaffold?: boolean;
}
export type ServiceCategory =
  'compute' | 'storage' | 'database' | 'network' | 'support' | 'licensing' | 'operations';
export type CostComponent =
  | 'compute'
  | 'storage'
  | 'database'
  | 'egress'
  | 'networking'
  | 'support'
  | 'licensing'
  | 'operations';
export type PricingModelKey =
  'on-demand' | 'reserved-1yr' | 'reserved-3yr' | 'spot' | 'savings-plan';
export type PricingBasis = 'flat' | 'tiered';
export type PricingVolatility = 'stable' | 'variable' | 'volatile';
export type PricingSource = 'catalog' | 'modeled-estimate';
export type IntervalKey = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type NormalizedInstanceFamily =
  | 'general-purpose'
  | 'burstable'
  | 'compute-optimized'
  | 'memory-optimized'
  | 'storage-optimized'
  | 'accelerated-computing';
export type ProcessorArchitecture = 'x86_64' | 'arm64' | 'gpu';
export type ComputeTenancy = 'shared' | 'dedicated-host' | 'sole-tenant';
export type CachedPricingTerm =
  'on_demand' | 'reserved_1yr' | 'reserved_3yr' | 'spot' | 'savings_plan';
export type PricingTermCode =
  | 'on_demand'
  | 'reserved_1yr'
  | 'reserved_3yr'
  | 'savings_plan_1yr'
  | 'savings_plan_3yr'
  | 'spot_estimate';
export type PaymentOptionCode = 'no_upfront' | 'partial_upfront' | 'all_upfront' | 'n_a';
export type StoragePricingTier = 'standard' | 'infrequent_access' | 'archive';
export type StorageClass =
  | 'standard'
  | 'hot'
  | 'cool'
  | 'cold'
  | 'nearline'
  | 'coldline'
  | 'intelligent-tiering'
  | 'infrequent-access'
  | 'one-zone-infrequent-access'
  | 'archive-instant'
  | 'archive'
  | 'deep-archive'
  | 'premium'
  | 'ultra';
export type StorageReplication = 'none' | 'same-region' | 'cross-region';

export const INTERVALS: Array<{ key: IntervalKey; label: string }> = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
];

export interface NormalizedWorkloadSpec {
  schemaVersion: '1.0';
  metadata: {
    sourceType: 'natural_language' | 'structured_form' | 'drawio_diagram' | 'terraform';
    rawInput?: string;
    createdAt: string;
  };
  workload: {
    name?: string;
    type:
      | 'web_app'
      | 'api_backend'
      | 'static_site'
      | 'batch_processing'
      | 'data_pipeline'
      | 'ml_workload'
      | 'other';
    expectedUsers?: {
      dailyActiveUsers?: number;
      peakConcurrentUsers?: number;
    };
    region: {
      preference?: string;
      isDefault: boolean;
    };
  };
  compute: Array<{
    role: string;
    instanceFamily?: NormalizedInstanceFamily;
    processorArchitecture?: ProcessorArchitecture;
    tenancy?: ComputeTenancy;
    vcpu?: number;
    memoryGb?: number;
    instanceCount?: number;
    scalingType: 'fixed' | 'autoscaling';
    autoscalingRange?: {
      min: number;
      max: number;
    };
  }>;
  storage: Array<{
    role: string;
    type: 'object' | 'block' | 'file';
    sizeGb: number;
    accessPattern?: 'frequent' | 'infrequent' | 'archive';
    storageClass?: StorageClass;
    monthlyPutRequestsThousand?: number;
    monthlyGetRequestsThousand?: number;
    monthlyDeleteRequestsThousand?: number;
    monthlyListRequestsThousand?: number;
    monthlyRetrievalGb?: number;
    objectCountThousand?: number;
    objectRetentionDays?: number;
    replication?: StorageReplication;
    lifecycleTransitionsThousand?: number;
    snapshotSizeGb?: number;
    snapshotRetentionDays?: number;
    provisionedIops?: number;
    provisionedThroughputMbps?: number;
    multiAttachEnabled?: boolean;
  }>;
  database: Array<{
    role: string;
    engine:
      | 'postgres'
      | 'mysql'
      | 'sql_server'
      | 'mongodb'
      | 'redis'
      | 'generic_relational'
      | 'generic_nosql';
    sizeGb?: number;
    highAvailability: boolean;
    managedServicePreference?: string;
    backupStorageGb?: number;
    backupRetentionDays?: number;
    provisionedIops?: number;
    readReplicaCount?: number;
    crossRegionReplicaTransferGb?: number;
    nosqlReadRequestUnitsMillion?: number;
    nosqlWriteRequestUnitsMillion?: number;
    ruPerSecond?: number;
    queryDataTb?: number;
    cacheReplicaCount?: number;
    storageGrowthGbPerMonth?: number;
    searchNodeCount?: number;
    searchNodeHours?: number;
    searchStorageGb?: number;
    searchQueriesMillion?: number;
  }>;
  network: {
    estimatedMonthlyEgressGb?: number;
    crossAzTransferGb?: number;
    interRegionTransferGb?: number;
    interRegionDestination?: string;
    cdnTrafficGb?: number;
    cdnCacheHitRatioPercent?: number;
    cdnRequestsMillion?: number;
    natGatewayGb?: number;
    natGatewayHours?: number;
    dnsHostedZones?: number;
    dnsQueriesMillion?: number;
    loadBalancerProcessedGb?: number;
    loadBalancerHours?: number;
    loadBalancerNewConnectionsPerSecond?: number;
    loadBalancerActiveConnections?: number;
    loadBalancerRuleEvaluationsPerSecond?: number;
    vpnConnectionCount?: number;
    vpnConnectionHours?: number;
    vpnDataTransferGb?: number;
    privateCircuitCount?: number;
    privateCircuitPortHours?: number;
    privateCircuitDataTransferGb?: number;
    cdn: boolean;
    loadBalancer: boolean;
  };
  availability: {
    multiAz: boolean;
    multiRegion: boolean;
    slaTarget?: string;
    faultTolerance?: 'single-zone' | 'multi-az' | 'multi-region' | 'active-active';
  };
  workloadProfile?: {
    environment?: 'production' | 'staging' | 'development' | 'test';
    commitmentPreferencePercent?: number;
    dataResidency?: {
      scope: string;
      complianceLocked: boolean;
      frameworks?: string[];
    };
    operatingSystem?: 'linux' | 'windows' | 'byol';
    supportTier?: 'none' | 'developer' | 'business' | 'enterprise_onramp' | 'enterprise';
    usagePattern?: {
      type: 'always_on' | 'scheduled' | 'bursty';
      hoursPerDay?: number;
      daysPerWeek?: number;
      averageUtilizationPercent?: number;
    };
    tags?: Array<{
      key: string;
      value: string;
    }>;
  };
  serviceRequirements?: ServiceRequirement[];
  sourceTraceability?: Array<{
    nwsPath: string;
    sourceRef: string;
  }>;
}

export interface ServiceRequirement {
  serviceCategory:
    | 'compute'
    | 'containers'
    | 'application'
    | 'storage'
    | 'database'
    | 'analytics'
    | 'ai'
    | 'integration'
    | 'networking'
    | 'security'
    | 'operations'
    | 'devops'
    | 'migration'
    | 'edge'
    | 'business';
  serviceType: string;
  instanceType?: string;
  tier?: string;
  region?: string;
  az?: string;
  quantity: number;
  scaleParams?: Record<string, string | number | boolean>;
}

export interface ParsedNwsDraft {
  draftNws: NormalizedWorkloadSpec;
  parserConfidence: 'low' | 'medium' | 'high';
  fieldsRequiringReview: string[];
}

export interface TerraformGenerationResult {
  targetCloud: TerraformTargetCloud;
  generatedAt: string;
  bundleName: string;
  workspaceName: string;
  region: string;
  generationProfile: {
    runtimeTarget: TerraformRuntimeTarget;
    networkTopology: TerraformNetworkTopology;
    availabilityMode: TerraformAvailabilityMode;
    policyPackIncluded: boolean;
    moduleScaffoldIncluded: boolean;
  };
  source: {
    schemaVersion: NormalizedWorkloadSpec['schemaVersion'];
    workloadName?: string;
    workloadType: NormalizedWorkloadSpec['workload']['type'];
    sourceType: NormalizedWorkloadSpec['metadata']['sourceType'];
  };
  resourceSummary: {
    computeInstances: number;
    objectStorageBuckets: number;
    blockStorageVolumes: number;
    fileShares: number;
    relationalDatabases: number;
    loadBalancers: number;
    cdnEnabled: boolean;
    multiAz: boolean;
    multiRegion: boolean;
  };
  serviceMappings: Array<{
    requirement: string;
    terraformResource: string;
    confidence: 'direct' | 'approximate' | 'manual-review';
    note: string;
  }>;
  files: Array<{
    path: string;
    content: string;
    sha256: string;
  }>;
  archive: {
    filename: string;
    format: 'zip';
    mimeType: 'application/zip';
    contentBase64: string;
    sha256: string;
    sizeBytes: number;
  };
  validation: {
    status: 'passed' | 'warning' | 'failed';
    executionMode: 'static' | 'static-plus-policy';
    checks: Array<{
      id: string;
      status: 'passed' | 'warning' | 'failed';
      message: string;
    }>;
    commands: Array<{
      command: string;
      status: 'not-run' | 'passed' | 'failed';
      message: string;
    }>;
  };
  assumptions: string[];
  securityNotes: string[];
  nextSteps: string[];
}

export type DiagramInputFormat = 'mermaid' | 'drawio' | 'lucid_csv' | 'vsdx';
export type DiagramClassificationConfidence = 'high' | 'moderate' | 'low';

export type TeamRole = 'owner' | 'admin' | 'member';

export interface AuthSessionResponse {
  token: string;
  expiresAt: string;
  account: {
    id: string;
    email: string;
    displayName?: string;
  };
  team?: {
    id: string;
    name: string;
    role: TeamRole;
  };
}

export interface AuthMeResponse {
  account: {
    id: string;
    email: string;
    displayName?: string;
  };
  activeTeam?: {
    id: string;
    name: string;
    role: TeamRole;
  };
  teams: Array<{
    teamId: string;
    teamName: string;
    role: TeamRole;
  }>;
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface TeamSwitchResponse {
  activeTeam: {
    id: string;
    name: string;
    role: TeamRole;
  };
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface TeamMemberRecord {
  accountId: string;
  email: string;
  displayName?: string;
  role: TeamRole;
  createdAt: string;
  lastActiveAt?: string;
}

export interface TeamInvitationRecord {
  id: string;
  teamId: string;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedByAccountId: string;
  acceptedByAccountId?: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  inviteToken?: string;
  inviteUrl?: string;
  delivery?: TeamInvitationDeliveryReceipt;
}

export interface TeamInvitationDeliveryReceipt {
  mode: 'panel' | 'webhook';
  status: 'not_configured' | 'accepted' | 'failed';
  message: string;
  tokenExposedInResponse: boolean;
  deliveredAt?: string;
}

export type TeamAuditAction =
  | 'team.created'
  | 'team.settings.updated'
  | 'team.invitation.created'
  | 'team.invitation.resent'
  | 'team.invitation.revoked'
  | 'team.invitation.accepted'
  | 'team.member.role_updated'
  | 'team.member.removed'
  | 'team.sso.configured'
  | 'billing.import.created'
  | 'billing.reconciliation.created'
  | 'billing.reconciliation.artifact_registered'
  | 'billing.reconciliation.artifact_verified'
  | 'billing.reconciliation.artifact_blob_uploaded'
  | 'billing.reconciliation.artifact_legal_hold_updated'
  | 'billing.reconciliation.artifact_review_updated'
  | 'billing.reconciliation.artifact_exception_updated'
  | 'billing.reconciliation.invoice_control_validated';

export type TeamAuditTargetType =
  'team' | 'invitation' | 'member' | 'sso_provider' | 'billing_import' | 'billing_reconciliation';

export interface TeamAuditEventRecord {
  id: string;
  teamId: string;
  actorAccountId?: string;
  actorEmail?: string;
  action: TeamAuditAction;
  targetType: TeamAuditTargetType;
  targetId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TeamInvitationPreview {
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'invalid';
  email?: string;
  role?: Exclude<TeamRole, 'owner'>;
  teamId?: string;
  expiresAt?: string;
  acceptedAt?: string;
  revokedAt?: string;
  message: string;
}

export interface AccountSessionRecord {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  hasUserAgent: boolean;
  hasIp: boolean;
}

export interface AccountProfileResponse {
  id: string;
  email: string;
  displayName?: string;
  status: 'active' | 'disabled' | 'invited';
}

export interface TeamSettingsRecord {
  teamId: string;
  teamName: string;
  plan: 'oss' | 'team' | 'enterprise';
  role: TeamRole;
  updatedAt: string;
}

export interface SsoConfigurationStatus {
  localLoginEnabled: boolean;
  oidcConfigured: boolean;
  samlConfigured: boolean;
  configuredProviders: Array<{
    providerType: 'oidc' | 'saml';
    displayName: string;
    issuerUrl: string;
    status: 'configured' | 'disabled';
  }>;
  callbackUrls: {
    oidc: string;
    saml: string;
  };
}

export interface SsoConnectionTestResult {
  ok: boolean;
  providerType: 'oidc' | 'saml';
  issuerUrl: string;
  checkedAt: string;
  message: string;
}

export interface SsoStartResponse {
  providerType: 'oidc';
  mode: 'mock';
  authorizationUrl: string;
  callbackUrl: string;
  state: string;
  expiresAt: string;
}

export interface SsoCallbackResponse extends AuthSessionResponse {
  sso: {
    providerType: 'oidc';
    issuerUrl: string;
    subjectHash: string;
    stateVerified: true;
  };
}

export type BillingSourceType =
  'aws-cur' | 'azure-cost-management' | 'gcp-billing-export' | 'normalized-csv';
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
export type InvoiceArtifactStorageBackend = 'database-bytea' | 'aws-s3' | 'azure-blob' | 'gcp-gcs';
export type InvoiceArtifactMalwareScannerMode = 'eicar-signature-only' | 'http-webhook';
export type InvoiceArtifactRetentionEnforcementMode = 'report-only' | 'delete-expired';

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
  verificationStatus: 'verified' | 'rejected';
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
  verificationStatus: 'registered' | 'verified' | 'rejected';
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
  verificationStatus: 'registered' | 'verified' | 'rejected';
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

export type InvoiceEvidencePacketStatus = 'empty' | 'blocked' | 'review-ready';

export interface InvoiceEvidencePacketArtifact {
  id: string;
  provider: ProviderId;
  type: InvoiceGradeArtifactType;
  displayName: string;
  reference: string;
  verificationStatus: 'registered' | 'verified' | 'rejected';
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
  reviewStatus?: InvoiceArtifactReviewStatus;
  policyExceptionStatus?: InvoiceArtifactPolicyExceptionStatus;
}

export interface InvoiceEvidencePacketResponse {
  packetVersion: 'invoice-evidence-packet/v1';
  packetStatus: InvoiceEvidencePacketStatus;
  generatedAt: string;
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
    BillingImportResponse['importRun'],
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

export interface BillingImportResponse {
  importRun: {
    id: string;
    teamId?: string;
    provider: ProviderId;
    sourceType: BillingSourceType;
    status: 'processing' | 'completed' | 'failed';
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
  };
  acceptedRows: number;
  rejectedRows: number;
  lineItems: Array<
    BillingImportRowInput & {
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
  >;
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
  status: 'matched' | 'variance-warning' | 'variance-critical' | 'unmatched';
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface DiagramParseRequest {
  content: string;
  encoding?: 'text' | 'base64';
  fileName?: string;
  mimeType?: string;
  inputFormat?: DiagramInputFormat | 'auto';
}

export interface DiagramParseResult {
  importId: string;
  parserConfidence: ParsedNwsDraft['parserConfidence'];
  fieldsRequiringReview: string[];
  source: {
    format: DiagramInputFormat;
    fileName?: string;
    mimeType?: string;
    sizeBytes: number;
    sha256: string;
    parsedAt: string;
    persisted: boolean;
    tempFileStored: boolean;
    expiresAt?: string;
  };
  graph: {
    format: DiagramInputFormat;
    visualPreviews?: Array<{
      format: 'svg';
      renderingMode: 'approximate-vsdx-svg';
      pageRef?: string;
      pageName?: string;
      width: number;
      height: number;
      nodeCount: number;
      edgeCount: number;
      svg: string;
      warnings: string[];
    }>;
    nodes: Array<{
      id: string;
      displayLabel: string;
      kind: 'resource' | 'connector' | 'decorative' | 'unknown';
      sourceRef: string;
      stencilId?: string;
      bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      visual?: {
        pageRef?: string;
        pageId?: string;
        pageName?: string;
        pageWidth?: number;
        pageHeight?: number;
        masterId?: string;
        masterName?: string;
        containerId?: string;
        containerLabel?: string;
        fillColor?: string;
        lineColor?: string;
        normalizedBounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        geometryHint?: 'rectangle' | 'connector' | 'group' | 'unknown';
        renderingMode?: 'layout-extraction';
        renderingWarnings?: string[];
      };
    }>;
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      displayLabel?: string;
    }>;
    ignoredNodes: Array<{
      id: string;
      displayLabel: string;
      reason: string;
      sourceRef: string;
    }>;
  };
  review: {
    components: Array<{
      nodeId: string;
      displayLabel: string;
      serviceCategory: ServiceRequirement['serviceCategory'];
      serviceType: string;
      confidence: DiagramClassificationConfidence;
      sourceRef: string;
      assumedDefaults: string[];
      evidence: string;
      editable: true;
    }>;
    unresolvedClassifications: Array<{
      id: string;
      displayLabel: string;
      reason: string;
      sourceRef: string;
    }>;
    ignoredNodes: Array<{
      id: string;
      displayLabel: string;
      reason: string;
      sourceRef: string;
    }>;
    assumedDefaults: string[];
  };
  draftNws: NormalizedWorkloadSpec;
}

export interface CostIntervals {
  hourly?: number;
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
  yearly: number;
}

export interface EgressTierBreakdown {
  tierFromGb: number;
  tierToGb?: number;
  pricePerGb: number;
  billableGb: number;
  monthlyCostUsd: number;
}

export interface ComparisonLineItem {
  category: ServiceCategory;
  costComponent?: CostComponent;
  description: string;
  isApproximate: boolean;
  baseHourlyCostUsd?: number;
  baseMonthlyCostUsd: number;
  skuId?: string;
  region?: string;
  unit?: string;
  unitPriceUsd?: number;
  pricingBasis?: PricingBasis;
  rateSource?: 'pricing_catalog' | 'pricing_rates' | 'modeled_estimate' | 'manual_model';
  rateSourceSkuId?: string;
  pricingTermCode?: string;
  paymentOptionCode?: string;
  rateCurrency?: string;
  rateValidFrom?: string;
  rateSourceFetchedAt?: string;
  pricingTrace?: {
    providerId: ProviderId;
    serviceCategory: ServiceCategory;
    costComponent?: CostComponent;
    source: 'pricing_catalog' | 'pricing_rates' | 'modeled_estimate' | 'manual_model';
    sourceRecordKey: string;
    resolvedSkuId?: string;
    sourceSkuId?: string;
    providerServiceName?: string;
    skuDescription?: string;
    region?: string;
    catalogRegion?: string;
    unit?: string;
    unitPriceUsd?: number;
    currency?: string;
    effectiveDate?: string;
    fetchedAt?: string;
    sourceEndpoint?: string;
    sourceRecordId?: string;
    transformVersion?: string;
    sourcePayloadHash?: string;
    derivation?: {
      expression: string;
      unitPriceUsd?: number;
      quantity: number;
      monthlyCostUsd: number;
      hourlyCostUsd?: number;
      monthlyHours?: number;
    };
    equivalenceConfidence?: 'direct' | 'approximate' | 'modeled';
    pricingTermCode?: string;
    paymentOptionCode?: string;
    pricingBasis?: PricingBasis;
    isApproximate: boolean;
    isEstimate: boolean;
  };
  egressTiers?: EgressTierBreakdown[];
  pricingModels?: PricingModelCost[];
}

export interface PricingModelCost {
  model: PricingModelKey;
  available: boolean;
  displayName?: string;
  providerTerm?: string;
  source?: PricingSource;
  estimated?: boolean;
  volatility?: PricingVolatility;
  monthlyCostUsd?: number;
  hourlyCostUsd?: number;
  savingsPercentVsOnDemand?: number;
  upfrontOption?: 'none' | 'partial' | 'all';
  upfrontCostUsd?: number;
  commitmentTermMonths?: number;
  lastFetchedAt?: string;
  caveat?: string;
  unavailableReason?: string;
}

export interface ComparisonCostBreakdown {
  computeMonthlyCostUsd: number;
  storageMonthlyCostUsd: number;
  egressMonthlyCostUsd: number;
  networkingMonthlyCostUsd: number;
  databaseMonthlyCostUsd: number;
  supportMonthlyCostUsd: number;
  licensingMonthlyCostUsd: number;
  operationsMonthlyCostUsd: number;
  scopedMonthlyCostUsd: number;
}

export interface ComparisonProviderResult {
  providerId: ProviderId;
  lineItems: ComparisonLineItem[];
  totals: CostIntervals;
  pricingModels?: PricingModelCost[];
  breakdown?: ComparisonCostBreakdown;
}

export interface PricingModelRecommendation {
  preferredModel: PricingModelKey;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  sourceSignals: {
    environment?: NonNullable<NormalizedWorkloadSpec['workloadProfile']>['environment'];
    commitmentPreferencePercent?: number;
    flexibilityBias: 'flexibility' | 'balanced' | 'cost-optimized';
  };
}

export interface ComparisonResult {
  comparisonId: string;
  pricingAsOf: string;
  requirements?: {
    sourceType: NormalizedWorkloadSpec['metadata']['sourceType'];
    workloadName?: string;
    workloadType: NormalizedWorkloadSpec['workload']['type'];
    regionPreference?: string;
    availability?: Pick<
      NormalizedWorkloadSpec['availability'],
      'multiAz' | 'multiRegion' | 'slaTarget' | 'faultTolerance'
    >;
    workloadProfile?: Pick<
      NonNullable<NormalizedWorkloadSpec['workloadProfile']>,
      | 'environment'
      | 'commitmentPreferencePercent'
      | 'dataResidency'
      | 'operatingSystem'
      | 'supportTier'
      | 'usagePattern'
      | 'tags'
    >;
    serviceRequirements: ServiceRequirement[];
  };
  providers: ComparisonProviderResult[];
  cheapestProviderId: ProviderId;
  pricingModelRecommendation?: PricingModelRecommendation;
  warnings?: Array<{
    providerId?: ProviderId;
    code?: string;
    message: string;
  }>;
}

export interface ComparisonPricingEvidenceRow {
  evidenceId: string;
  providerId: ProviderId;
  lineItemIndex: number;
  category: ServiceCategory;
  costComponent?: CostComponent;
  description: string;
  displayedAmounts: {
    monthlyCostUsd: number;
    hourlyCostUsd?: number;
    providerTotals: CostIntervals;
  };
  sku: {
    resolvedSkuId?: string;
    sourceSkuId?: string;
    rateSourceSkuId?: string;
    providerServiceName?: string;
    skuDescription?: string;
    region?: string;
    catalogRegion?: string;
  };
  rate: {
    source: 'pricing_catalog' | 'pricing_rates' | 'modeled_estimate' | 'manual_model' | string;
    sourceRecordKey: string;
    sourceEndpoint?: string;
    sourceRecordId?: string;
    transformVersion?: string;
    sourcePayloadHash?: string;
    unit?: string;
    unitPriceUsd?: number;
    currency?: string;
    effectiveDate?: string;
    fetchedAt?: string;
    pricingTermCode?: string;
    paymentOptionCode?: string;
    pricingBasis?: PricingBasis;
  };
  derivation: {
    expression: string;
    quantity?: number;
    unitPriceUsd?: number;
    hourlyCostUsd?: number;
    monthlyCostUsd: number;
    monthlyHours?: number;
  };
  equivalence: {
    confidence: 'direct' | 'approximate' | 'modeled';
    isApproximate: boolean;
    isEstimate: boolean;
  };
  egressTiers?: EgressTierBreakdown[];
  pricingModels?: PricingModelCost[];
}

export interface ComparisonPricingEvidenceResponse {
  comparisonId: string;
  pricingAsOf: string;
  generatedAt: string;
  providerCount: number;
  lineItemCount: number;
  evidence: ComparisonPricingEvidenceRow[];
}

export type AnalyticsDimension =
  | 'compute'
  | 'storage'
  | 'egress'
  | 'networking'
  | 'database'
  | 'support'
  | 'licensing'
  | 'operations'
  | 'other';

export interface CostCompositionItem {
  dimension: AnalyticsDimension;
  label: string;
  monthlyCostUsd: number;
  percentOfProviderTotal: number;
  runningMonthlyUsd: number;
  topDriver?: string;
}

export interface ProviderCostComposition {
  providerId: ProviderId;
  totalMonthlyUsd: number;
  items: CostCompositionItem[];
}

export interface ProviderDeltaAnalysis {
  dimension: AnalyticsDimension;
  label: string;
  cheapestProviderId: ProviderId;
  mostExpensiveProviderId: ProviderId;
  cheapestMonthlyUsd: number;
  mostExpensiveMonthlyUsd: number;
  deltaMonthlyUsd: number;
  deltaPercentVsMostExpensive: number;
  explanation: string;
}

export interface RegionVarianceProviderCost {
  providerId: ProviderId;
  providerRegion: string;
  modeledMonthlyUsd: number;
  deltaVsSelectedMonthlyUsd: number;
  isLowest: boolean;
}

export interface RegionVarianceHeatMapRow {
  comparisonRegion: string;
  label: string;
  regionSummary: string;
  multiplier: number;
  evidence: string;
  isSelected: boolean;
  complianceEligible: boolean;
  lowestProviderId?: ProviderId;
  providers: RegionVarianceProviderCost[];
}

export interface EgressNetworkingDetailRow {
  id: string;
  providerId: ProviderId;
  networkComponent: string;
  description: string;
  region?: string;
  monthlyCostUsd: number;
  shareOfProviderTotalPercent: number;
  unit?: string;
  rateUsd?: number;
  evidence: string;
}

export interface SensitivityScenarioRow {
  variable: 'compute_capacity' | 'storage_volume' | 'egress_traffic' | 'database_capacity';
  label: string;
  changePercent: number;
  providerId: ProviderId;
  baselineMonthlyUsd: number;
  adjustedMonthlyUsd: number;
  deltaMonthlyUsd: number;
}

export interface CommitmentRoiTimeline {
  providerId: ProviderId;
  pricingModel: Exclude<PricingModelKey, 'on-demand' | 'spot'>;
  label: string;
  baselineMonthlyUsd: number;
  committedMonthlyUsd: number;
  upfrontCostUsd: number;
  monthlySavingsUsd: number;
  breakEvenMonth?: number;
  points: Array<{
    month: number;
    onDemandCumulativeUsd: number;
    committedCumulativeUsd: number;
    savingsUsd: number;
  }>;
}

export interface CommitmentCoverageRow {
  providerId: ProviderId;
  eligibleMonthlyUsd: number;
  coveredPercentOfSpend: number;
  onDemandExposureMonthlyUsd: number;
  zeroCommitmentMonthlyUsd: number;
  targetCoveragePercent: number;
  targetBlendMonthlyUsd: number;
  fullyCommittedMonthlyUsd: number;
  ineligibleMonthlyUsd: number;
  targetOnDemandExposureMonthlyUsd: number;
  exposedPercentOfSpend: number;
  targetSavingsMonthlyUsd: number;
  remainingOpportunityMonthlyUsd: number;
  maxMonthlySavingsUsd: number;
  recommendation: string;
}

export interface TcoSignal {
  providerId: ProviderId;
  egressLockInMonthlyUsd: number;
  supportMonthlyUsd: number;
  licensingMonthlyUsd: number;
  freeTierApplicability: 'possible' | 'unlikely';
  note: string;
}

export interface OptimizationOpportunity {
  id: string;
  category: string;
  recommendation: string;
  estimatedMonthlySavingsUsd?: number;
  estimatedAnnualSavingsUsd?: number;
  priority: 'High' | 'Medium' | 'Low';
  effort: 'High' | 'Medium' | 'Low';
  evidence: string;
}

export interface FinOpsFinding {
  id: string;
  severity: 'info' | 'review' | 'warning' | 'critical';
  category:
    | 'cost-driver'
    | 'right-sizing'
    | 'commitment'
    | 'egress'
    | 'licensing'
    | 'support'
    | 'mapping'
    | 'risk';
  title: string;
  recommendation: string;
  estimatedMonthlyImpactUsd?: number;
  providerId?: ProviderId;
}

export interface ExecutiveForecast {
  horizonDays: 90;
  assumption: string;
  providerForecasts: Array<{
    providerId: ProviderId;
    monthlyRunRateUsd: number;
    ninetyDayRunRateUsd: number;
    annualizedRunRateUsd: number;
  }>;
}

export interface CostCoverageMapEntry {
  providerId: ProviderId;
  dimension: string;
  status: string;
  pricedRows: number;
  approximateRows: number;
  monthlyUsd?: number;
  evidence: string;
  reviewCue: string;
}

export interface ComparisonAnalyticsResponse {
  comparisonId: string;
  generatedAt: string;
  pricingAsOf: string;
  executiveForecast: ExecutiveForecast;
  costCoverageMap: CostCoverageMapEntry[];
  costComposition: ProviderCostComposition[];
  providerDeltaAnalysis: ProviderDeltaAnalysis[];
  regionVarianceHeatMap: RegionVarianceHeatMapRow[];
  egressNetworkingDetails: EgressNetworkingDetailRow[];
  sensitivityScenarios: SensitivityScenarioRow[];
  commitmentRoiTimelines: CommitmentRoiTimeline[];
  commitmentCoverage: CommitmentCoverageRow[];
  tcoSignals: TcoSignal[];
  optimizationOpportunities: OptimizationOpportunity[];
  finOpsFindings: FinOpsFinding[];
}

export interface PricingStatusResponse {
  providers: Array<{
    providerId: ProviderId;
    status: 'success' | 'partial' | 'failed';
    lastSuccessfulRun?: string;
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
  }>;
}

export interface DataHealthResponse {
  generatedAt: string;
  freshnessPolicyHours: number;
  overallStatus: 'fresh' | 'stale' | 'degraded';
  alertCount: number;
  alerts: Array<{
    providerId?: ProviderId;
    severity: 'warning' | 'critical';
    message: string;
  }>;
  providers: Array<{
    providerId: ProviderId;
    status: 'success' | 'partial' | 'failed';
    freshness: 'fresh' | 'stale' | 'missing' | 'failed';
    lastSuccessfulRun?: string;
    ageHours?: number;
    recordsUpdated: number;
    recordsRejected: number;
    recordsSkipped: number;
    cache: {
      catalogRows: number;
      currentRateRows: number;
      latestCatalogSyncAt?: string;
      latestRateSyncAt?: string;
      ageHours?: number;
      freshness: 'fresh' | 'stale' | 'missing';
      syncStatusCounts: {
        success: number;
        partial: number;
        failed: number;
      };
    };
    message: string;
  }>;
}

export interface PricingModelCatalogEntry {
  model: PricingModelKey;
  cachedTerm: CachedPricingTerm;
  label: string;
  default: boolean;
  volatility: PricingVolatility;
  providerTerms: Record<ProviderId, string>;
  caveat: string;
}

export interface PricingModelCatalogResponse {
  models: PricingModelCatalogEntry[];
  defaultModel: PricingModelKey;
  generatedAt: string;
}

export interface PricingModelsForServiceResponse {
  schemaVersion: 2;
  provider: ProviderId;
  service: string;
  region: string;
  generatedAt: string;
  models: Array<{
    code: PricingTermCode;
    label: string;
    termMonths?: number;
    requiresPaymentOption: boolean;
    isEstimateOnly: boolean;
    paymentOptions: Array<{
      code: PaymentOptionCode;
      label: string;
    }>;
    defaultPaymentOption?: PaymentOptionCode;
  }>;
}

export interface BackendHealthResponse {
  status: 'ok' | string;
  service: string;
}

export type RegionCatalogSource = 'live' | 'fallback';

export interface CloudRegion {
  providerId: ProviderId;
  id: string;
  label: string;
  location?: string;
  source: RegionCatalogSource;
}

export interface CloudRegionProviderCatalog {
  providerId: ProviderId;
  label: string;
  source: RegionCatalogSource;
  sourceUrl: string;
  calculatorUrl: string;
  regions: CloudRegion[];
}

export interface RegionCatalogResponse {
  generatedAt: string;
  cacheTtlSeconds: number;
  providers: CloudRegionProviderCatalog[];
}

export interface WorkloadInput {
  instanceFamily: NormalizedInstanceFamily;
  vcpu: number;
  memoryGb: number;
  region: string;
  instanceCount: number;
  hoursPerMonth: number;
  storageGb: number;
  storageTier: StoragePricingTier;
  egressGbPerMonth: number;
}

export interface WorkloadRecord extends WorkloadInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetInput {
  workloadId: string;
  thresholdUsd: number;
  alertOnAnomalyPercent?: number;
}

export interface BudgetRecord extends BudgetInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  workloadId: string;
  budgetId?: string;
  alertType: 'budget_threshold' | 'anomaly';
  message: string;
  thresholdUsd?: number;
  observedUsd?: number;
  anomalyPercent?: number;
  dismissed: boolean;
  triggeredAt: string;
  dismissedAt?: string;
}

export interface ProviderCostBreakdown {
  provider: ProviderId;
  region: string;
  compute: number;
  storage: number;
  egress: number;
  total: number;
  currency: 'USD';
}

export interface WorkloadCostBreakdown {
  workloadId: string;
  term: CachedPricingTerm;
  providers: ProviderCostBreakdown[];
}

export interface ShareLinkResponse {
  token: string;
  url: string;
}

export interface SharedReportResponse {
  token: string;
  watermark: boolean;
  expiresAt: string;
  pricingModel: PricingModelKey;
  granularity: IntervalKey;
  passwordProtected: boolean;
  workload: WorkloadRecord;
  breakdown: WorkloadCostBreakdown;
}

export interface ShareLinkAnalyticsResponse {
  token: string;
  totalViews: number;
  lastViewedAt?: string;
  countryViews: Array<{
    countryCode: string;
    views: number;
  }>;
  sectionViews: Array<{
    section: string;
    views: number;
    lastViewedAt?: string;
  }>;
}

export interface ExchangeRatesResponse {
  base: string;
  lastUpdated?: string;
  rates: Record<string, number>;
}

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';
export type ReportExportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReportExportJobResponse {
  jobId: string;
  comparisonId: string;
  format: ReportFormat;
  interval?: IntervalKey;
  pricingModel?: PricingModelKey;
  status: ReportExportJobStatus;
  fileName?: string;
  contentType?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  statusUrl: string;
  downloadUrl?: string;
}

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}
