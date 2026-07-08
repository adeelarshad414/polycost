import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import { ApiForbiddenError, ApiNotFoundError, ApiValidationError } from './api-errors';
import {
  ApiDatabaseRepository,
  InvoiceArtifactBlobDeletionCandidate,
} from './api-database.repository';
import { AuthIdentity } from './auth.types';
import {
  InvoiceArtifactRetentionEnforcementResult,
  InvoiceArtifactBlobGovernance,
  InvoiceArtifactLegalHoldInput,
  InvoiceArtifactBlobRecord,
  InvoiceArtifactBlobUploadInput,
  InvoiceArtifactStorageReadiness,
  BillingImportInput,
  BillingImportResponse,
  BillingProviderExportInput,
  BillingImportRowInput,
  BillingSourceType,
  InvoiceGradeArtifactRecord,
  InvoiceGradeArtifactRegistrationInput,
  InvoiceGradeArtifactType,
  InvoiceGradeArtifactVerificationInput,
  InvoiceAdjustmentCategory,
  InvoiceReconciliationRecord,
  InvoiceReconciliationStatus,
} from './billing.types';
import { InvoiceArtifactGovernanceService } from './invoice-artifact-governance.service';
import {
  InvoiceArtifactObjectPointer,
  InvoiceArtifactStorageService,
  StoredInvoiceArtifactObject,
} from './invoice-artifact-storage.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_IMPORT_ROWS = 10_000;
const MAX_PROVIDER_EXPORT_BYTES = 4 * 1024 * 1024;
const MAX_INVOICE_ARTIFACT_BLOB_BYTES = 1024 * 1024;
const MAX_INVOICE_ARTIFACT_RETENTION_DAYS = 3650;
const INVOICE_ARTIFACT_MIME_TYPES = [
  'application/pdf',
  'application/json',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
] as const;
const SOURCE_TYPES: BillingSourceType[] = [
  'aws-cur',
  'azure-cost-management',
  'gcp-billing-export',
  'normalized-csv',
];
const INVOICE_GRADE_ARTIFACT_TYPES: InvoiceGradeArtifactType[] = [
  'provider-invoice',
  'provider-export-manifest',
  'control-total',
  'tax-invoice',
  'private-pricing-agreement',
  'commitment-inventory',
  'commitment-amortization-schedule',
  'allocation-map',
  'currency-policy',
  'provider-sku-map',
];
const INVOICE_GRADE_ARTIFACT_CHECK_COVERAGE: Record<string, InvoiceGradeArtifactType[]> = {
  'provider-invoice-control': ['provider-invoice', 'control-total'],
  'source-row-traceability': ['provider-export-manifest'],
  'sku-service-match': ['provider-sku-map'],
  'allocation-evidence': ['allocation-map'],
  'billing-period-currency': ['currency-policy', 'provider-invoice'],
  'adjustment-support': ['provider-invoice', 'tax-invoice'],
  'commitment-amortization': ['commitment-inventory', 'commitment-amortization-schedule'],
  'private-pricing': ['private-pricing-agreement'],
  'tax-jurisdiction': ['tax-invoice'],
  'provider-column-completeness': ['provider-export-manifest'],
};

const AWS_CUR_COLUMNS = {
  serviceName: ['lineItem/ProductCode', 'product/ProductName', 'product/productName'],
  skuId: ['product/sku', 'pricing/RateId', 'lineItem/UsageType'],
  region: ['product/region', 'product/regionCode', 'lineItem/AvailabilityZone'],
  resourceId: ['lineItem/ResourceId'],
  usageStart: ['lineItem/UsageStartDate'],
  usageEnd: ['lineItem/UsageEndDate'],
  usageQuantity: ['lineItem/UsageAmount'],
  usageUnit: ['pricing/unit', 'lineItem/UsageType'],
  costUsd: ['lineItem/NetUnblendedCost', 'lineItem/UnblendedCost', 'lineItem/BlendedCost'],
  currency: ['lineItem/CurrencyCode', 'bill/BillingCurrencyCode'],
} as const;

const AZURE_COST_COLUMNS = {
  serviceName: ['ServiceName', 'serviceName', 'ConsumedService', 'consumedService'],
  skuId: ['MeterId', 'meterId', 'ProductId', 'productId'],
  region: ['ResourceLocation', 'resourceLocation', 'Region', 'region'],
  resourceId: ['ResourceId', 'resourceId', 'InstanceId', 'instanceId'],
  usageStart: ['UsageDateTime', 'usageDateTime', 'Date', 'date'],
  usageEnd: ['UsageEndDate', 'usageEndDate'],
  usageQuantity: ['Quantity', 'quantity'],
  usageUnit: ['UnitOfMeasure', 'unitOfMeasure', 'Unit', 'unit'],
  costUsd: ['CostInUSD', 'costInUSD', 'CostUSD', 'costUSD'],
  fallbackCost: ['CostInBillingCurrency', 'costInBillingCurrency', 'PreTaxCost', 'pretaxCost'],
  currency: ['BillingCurrencyCode', 'billingCurrencyCode', 'Currency', 'currency'],
  tags: ['Tags', 'tags'],
} as const;

const GCP_BILLING_COLUMNS = {
  serviceName: ['service.description', 'service_description', 'service.id', 'service_id'],
  skuId: ['sku.id', 'sku_id', 'sku.description', 'sku_description'],
  region: ['location.region', 'location_region', 'region'],
  resourceId: ['resource.name', 'resource_name', 'project.id', 'project_id'],
  usageStart: ['usage_start_time', 'usage.start_time', 'usageStartTime'],
  usageEnd: ['usage_end_time', 'usage.end_time', 'usageEndTime'],
  usageQuantity: ['usage.amount', 'usage_amount'],
  usageUnit: ['usage.unit', 'usage_unit'],
  costUsd: ['cost'],
  currency: ['currency'],
  tags: ['labels', 'project.labels', 'system_labels'],
} as const;

type ProviderExportColumnMap = Record<string, readonly string[]>;

interface InvoiceAdjustmentClassification {
  category: InvoiceAdjustmentCategory;
  isAdjustment: boolean;
  reason: string;
  sourceSignals: string[];
  commitmentEvidence?: InvoiceCommitmentEvidence;
}

type InvoiceCommitmentKind =
  'savings-plan' | 'reserved-capacity' | 'committed-use' | 'sustained-use' | 'benefit' | 'unknown';

type InvoiceCommitmentTreatment = 'covered-usage' | 'discount' | 'fee' | 'amortization' | 'unused';

interface InvoiceCommitmentEvidence {
  kind: InvoiceCommitmentKind;
  treatment: InvoiceCommitmentTreatment;
  requiresProviderInventory: boolean;
  requiresAmortizationPeriod: boolean;
  requiresAllocationEvidence: boolean;
  evidenceSignals: string[];
  caveats: string[];
}

type InvoiceGradeReadinessCheckStatus = 'present' | 'partial' | 'missing' | 'not-applicable';

interface InvoiceGradeReadinessCheck {
  id: string;
  label: string;
  status: InvoiceGradeReadinessCheckStatus;
  evidence: string;
  requiredArtifact: string;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly repository: ApiDatabaseRepository,
    private readonly artifactGovernanceService: InvoiceArtifactGovernanceService = new InvoiceArtifactGovernanceService(),
    private readonly artifactStorageService: InvoiceArtifactStorageService = new InvoiceArtifactStorageService(),
  ) {}

  async importActuals(body: unknown, identity: AuthIdentity): Promise<BillingImportResponse> {
    assertBillingAdmin(identity);
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
      ...(identity.teamId
        ? {
            audit: {
              actorAccountId: identity.accountId,
              action: 'billing.import.created',
              targetType: 'billing_import',
            },
          }
        : {}),
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
    assertBillingAdmin(identity);
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
    assertBillingAdmin(identity);
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
    const evidence = reconciliationEvidence(
      comparison.resultSnapshot,
      importRunId,
      lineItems,
      estimatedTotalUsd,
    );

    const reconciliation = await this.repository.saveInvoiceReconciliation({
      importRunId,
      comparisonId,
      provider: importRun.provider,
      estimatedTotalUsd,
      invoicedTotalUsd,
      varianceUsd,
      variancePercent,
      status,
      evidence,
      ...(importRun.teamId
        ? {
            audit: {
              teamId: importRun.teamId,
              actorAccountId: identity.accountId,
              action: 'billing.reconciliation.created',
              targetType: 'billing_reconciliation',
            },
          }
        : {}),
    });

    return reconciliation;
  }

  async listReconciliations(
    importRunId: string,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord[]> {
    assertBillingAdmin(identity);
    const importRun = await this.repository.getBillingImport(importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(`Billing import ${importRunId} was not found`);
    }

    assertTeamAccess(importRun.teamId, identity);

    return this.repository.listInvoiceReconciliations(importRunId);
  }

  async registerInvoiceGradeArtifact(
    reconciliationId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord> {
    assertBillingAdmin(identity);
    const input = parseInvoiceGradeArtifactRegistrationInput(body);
    const reconciliation = await this.repository.getInvoiceReconciliation(reconciliationId);

    if (!reconciliation) {
      throw new ApiNotFoundError(`Invoice reconciliation ${reconciliationId} was not found`);
    }

    const importRun = await this.repository.getBillingImport(reconciliation.importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(
        `Billing import ${reconciliation.importRunId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    assertTeamAccess(importRun.teamId, identity);

    const artifact: InvoiceGradeArtifactRecord = {
      id: randomUUID(),
      provider: reconciliation.provider,
      type: input.type,
      displayName: input.displayName,
      reference: input.reference,
      verificationStatus: 'registered',
      registeredAt: new Date().toISOString(),
      registeredByAccountId: identity.accountId,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      ...(input.controlTotalUsd !== undefined ? { controlTotalUsd: input.controlTotalUsd } : {}),
      ...(input.billingPeriodStart ? { billingPeriodStart: input.billingPeriodStart } : {}),
      ...(input.billingPeriodEnd ? { billingPeriodEnd: input.billingPeriodEnd } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    };
    const evidence = appendInvoiceGradeArtifactEvidence(reconciliation, artifact);

    return this.repository.updateInvoiceReconciliationEvidence({
      reconciliationId,
      evidence,
      ...(importRun.teamId
        ? {
            audit: {
              teamId: importRun.teamId,
              actorAccountId: identity.accountId,
              action: 'billing.reconciliation.artifact_registered',
              targetType: 'billing_reconciliation',
              targetId: reconciliationId,
              metadata: {
                importRunId: importRun.id,
                comparisonId: reconciliation.comparisonId,
                provider: reconciliation.provider,
                artifactId: artifact.id,
                artifactType: artifact.type,
                verificationStatus: artifact.verificationStatus,
              },
            },
          }
        : {}),
    });
  }

  async verifyInvoiceGradeArtifact(
    reconciliationId: string,
    artifactId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord> {
    assertBillingAdmin(identity);
    const input = parseInvoiceGradeArtifactVerificationInput(body);
    const reconciliation = await this.repository.getInvoiceReconciliation(reconciliationId);

    if (!reconciliation) {
      throw new ApiNotFoundError(`Invoice reconciliation ${reconciliationId} was not found`);
    }

    const importRun = await this.repository.getBillingImport(reconciliation.importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(
        `Billing import ${reconciliation.importRunId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    assertTeamAccess(importRun.teamId, identity);

    const artifacts = invoiceGradeArtifactsFromEvidence(reconciliation.evidence);
    const existingArtifact = artifacts.find((artifact) => artifact.id === artifactId);

    if (!existingArtifact) {
      throw new ApiNotFoundError(
        `Invoice artifact ${artifactId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    const artifact = verifiedInvoiceGradeArtifact(
      existingArtifact,
      input,
      reconciliation,
      identity,
    );
    const evidence = replaceInvoiceGradeArtifactEvidence(reconciliation, artifact);

    return this.repository.updateInvoiceReconciliationEvidence({
      reconciliationId,
      evidence,
      ...(importRun.teamId
        ? {
            audit: {
              teamId: importRun.teamId,
              actorAccountId: identity.accountId,
              action: 'billing.reconciliation.artifact_verified',
              targetType: 'billing_reconciliation',
              targetId: reconciliationId,
              metadata: {
                importRunId: importRun.id,
                comparisonId: reconciliation.comparisonId,
                provider: reconciliation.provider,
                artifactId: artifact.id,
                artifactType: artifact.type,
                verificationStatus: artifact.verificationStatus,
              },
            },
          }
        : {}),
    });
  }

  async uploadInvoiceArtifactBlob(
    reconciliationId: string,
    artifactId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord> {
    assertBillingAdmin(identity);
    const input = parseInvoiceArtifactBlobUploadInput(body);
    const decoded = decodeInvoiceArtifactBlob(input);
    const reconciliation = await this.repository.getInvoiceReconciliation(reconciliationId);

    if (!reconciliation) {
      throw new ApiNotFoundError(`Invoice reconciliation ${reconciliationId} was not found`);
    }

    const importRun = await this.repository.getBillingImport(reconciliation.importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(
        `Billing import ${reconciliation.importRunId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    assertTeamAccess(importRun.teamId, identity);

    const artifacts = invoiceGradeArtifactsFromEvidence(reconciliation.evidence);
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);

    if (!artifact) {
      throw new ApiNotFoundError(
        `Invoice artifact ${artifactId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    if (artifact.sha256 && artifact.sha256 !== decoded.sha256) {
      throw new ApiValidationError('artifact upload checksum does not match registered metadata', [
        {
          field: 'content',
          issue:
            'decoded artifact bytes must match the SHA-256 digest registered for this artifact',
        },
      ]);
    }

    const uploadedAt = new Date().toISOString();
    const governance = await this.artifactGovernanceService.buildGovernance(
      input,
      decoded.content,
      decoded.sha256,
      uploadedAt,
    );
    const storedObject = await this.artifactStorageService.store({
      reconciliationId,
      artifactId,
      ...(importRun.teamId ? { teamId: importRun.teamId } : {}),
      fileName: decoded.fileName,
      mimeType: decoded.mimeType,
      contentSha256: decoded.sha256,
      content: decoded.content,
      uploadedAt,
      governance,
    });
    const storedGovernance = governanceWithStoredObject(governance, storedObject);
    const evidence = replaceInvoiceGradeArtifactEvidence(
      reconciliation,
      storedInvoiceGradeArtifact(artifact, decoded, uploadedAt, identity, storedGovernance),
    );

    return this.repository.saveInvoiceArtifactBlobAndUpdateEvidence({
      reconciliationId,
      artifactId,
      ...(importRun.teamId ? { teamId: importRun.teamId } : {}),
      fileName: decoded.fileName,
      mimeType: decoded.mimeType,
      contentSha256: decoded.sha256,
      contentSizeBytes: decoded.content.length,
      storageBackend: storedObject.storageBackend,
      ...(storedObject.inlineContent ? { content: storedObject.inlineContent } : {}),
      ...(storedObject.objectStoreBucket
        ? { objectStoreBucket: storedObject.objectStoreBucket }
        : {}),
      ...(storedObject.objectStoreRegion
        ? { objectStoreRegion: storedObject.objectStoreRegion }
        : {}),
      ...(storedObject.objectStoreKey ? { objectStoreKey: storedObject.objectStoreKey } : {}),
      ...(storedObject.objectStoreUri ? { objectStoreUri: storedObject.objectStoreUri } : {}),
      ...(storedObject.objectStoreETag ? { objectStoreETag: storedObject.objectStoreETag } : {}),
      ...(storedObject.objectStoreVersion
        ? { objectStoreVersion: storedObject.objectStoreVersion }
        : {}),
      uploadedByAccountId: identity.accountId,
      uploadedAt,
      ...(storedGovernance.storageProfile.kmsKeyReference
        ? { kmsKeyReference: storedGovernance.storageProfile.kmsKeyReference }
        : {}),
      retentionUntil: storedGovernance.retentionPolicy.retentionUntil,
      legalHold: storedGovernance.retentionPolicy.legalHold,
      malwareScanCheckedAt: storedGovernance.malwareScan.checkedAt,
      evidence,
      ...(importRun.teamId
        ? {
            audit: {
              teamId: importRun.teamId,
              actorAccountId: identity.accountId,
              action: 'billing.reconciliation.artifact_blob_uploaded',
              targetType: 'billing_reconciliation',
              targetId: reconciliationId,
              metadata: {
                importRunId: importRun.id,
                comparisonId: reconciliation.comparisonId,
                provider: reconciliation.provider,
                artifactId,
                fileName: decoded.fileName,
                mimeType: decoded.mimeType,
                contentSha256: decoded.sha256,
                contentSizeBytes: decoded.content.length,
                storageBackend: storedGovernance.storageProfile.storageBackend,
                objectStoreUri: storedObject.objectStoreUri,
                kmsKeyConfigured: !storedGovernance.storageProfile.kmsKeyRequiredForProduction,
                retentionUntil: storedGovernance.retentionPolicy.retentionUntil,
                legalHold: storedGovernance.retentionPolicy.legalHold,
                malwareScanStatus: storedGovernance.malwareScan.status,
                malwareScanScanner: storedGovernance.malwareScan.scanner,
              },
            },
          }
        : {}),
    });
  }

  async setInvoiceArtifactLegalHold(
    reconciliationId: string,
    artifactId: string,
    body: unknown,
    identity: AuthIdentity,
  ): Promise<InvoiceReconciliationRecord> {
    assertBillingAdmin(identity);
    const input = parseInvoiceArtifactLegalHoldInput(body);
    const reconciliation = await this.repository.getInvoiceReconciliation(reconciliationId);

    if (!reconciliation) {
      throw new ApiNotFoundError(`Invoice reconciliation ${reconciliationId} was not found`);
    }

    const importRun = await this.repository.getBillingImport(reconciliation.importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(
        `Billing import ${reconciliation.importRunId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    assertTeamAccess(importRun.teamId, identity);

    const artifacts = invoiceGradeArtifactsFromEvidence(reconciliation.evidence);
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);

    if (!artifact) {
      throw new ApiNotFoundError(
        `Invoice artifact ${artifactId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    if (!artifact.storedBlob) {
      throw new ApiValidationError('invoice artifact file is not stored', [
        {
          field: 'artifactId',
          issue: 'store the artifact file before changing legal hold state',
        },
      ]);
    }

    const evidence = replaceInvoiceGradeArtifactEvidence(
      reconciliation,
      legalHoldInvoiceGradeArtifact(artifact, input, identity),
    );

    return this.repository.updateInvoiceArtifactLegalHoldAndEvidence({
      reconciliationId,
      artifactId,
      legalHold: input.legalHold,
      evidence,
      ...(importRun.teamId
        ? {
            audit: {
              teamId: importRun.teamId,
              actorAccountId: identity.accountId,
              action: 'billing.reconciliation.artifact_legal_hold_updated',
              targetType: 'billing_reconciliation',
              targetId: reconciliationId,
              metadata: {
                importRunId: importRun.id,
                comparisonId: reconciliation.comparisonId,
                provider: reconciliation.provider,
                artifactId,
                legalHold: input.legalHold,
                ...(input.reason ? { reason: input.reason } : {}),
              },
            },
          }
        : {}),
    });
  }

  async downloadInvoiceArtifactBlob(
    reconciliationId: string,
    artifactId: string,
    identity: AuthIdentity,
  ): Promise<InvoiceArtifactBlobRecord> {
    assertBillingAdmin(identity);
    const reconciliation = await this.repository.getInvoiceReconciliation(reconciliationId);

    if (!reconciliation) {
      throw new ApiNotFoundError(`Invoice reconciliation ${reconciliationId} was not found`);
    }

    const importRun = await this.repository.getBillingImport(reconciliation.importRunId);

    if (!importRun) {
      throw new ApiNotFoundError(
        `Billing import ${reconciliation.importRunId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    assertTeamAccess(importRun.teamId, identity);

    const artifacts = invoiceGradeArtifactsFromEvidence(reconciliation.evidence);

    if (!artifacts.some((artifact) => artifact.id === artifactId)) {
      throw new ApiNotFoundError(
        `Invoice artifact ${artifactId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    const blob = await this.repository.getInvoiceArtifactBlob(reconciliationId, artifactId);

    if (!blob) {
      throw new ApiNotFoundError(
        `Invoice artifact blob ${artifactId} was not found for reconciliation ${reconciliationId}`,
      );
    }

    if (blob.contentBase64) {
      return blob;
    }

    const content = await this.artifactStorageService.read(blobObjectPointer(blob));

    if (!content) {
      return blob;
    }

    const fetchedSha256 = sha256Buffer(content);

    if (fetchedSha256 !== blob.contentSha256) {
      throw new ApiValidationError('invoice artifact object checksum mismatch', [
        {
          field: 'artifactId',
          issue: 'external object bytes no longer match the stored SHA-256 digest',
        },
      ]);
    }

    return {
      ...blob,
      contentBase64: content.toString('base64'),
    };
  }

  getInvoiceArtifactStorageReadiness(identity: AuthIdentity): InvoiceArtifactStorageReadiness {
    assertBillingAdmin(identity);

    return this.artifactGovernanceService.storageReadiness();
  }

  async enforceInvoiceArtifactRetention(
    body: unknown,
    identity: AuthIdentity,
  ): Promise<InvoiceArtifactRetentionEnforcementResult> {
    assertBillingAdmin(identity);
    const input = parseInvoiceArtifactRetentionEnforcementInput(body);
    const evaluatedAt = new Date().toISOString();
    const summary = await this.repository.summarizeInvoiceArtifactRetention(evaluatedAt);
    const configuredMode = this.artifactGovernanceService.retentionMode();
    const dryRun = input.dryRun || configuredMode === 'report-only';
    const deletionCandidates = dryRun
      ? []
      : await this.repository.listExpiredInvoiceArtifactBlobDeletionCandidates(evaluatedAt);

    if (!dryRun) {
      for (const candidate of deletionCandidates) {
        if (candidate.storageBackend !== 'database-bytea') {
          await this.artifactStorageService.delete(deletionCandidateObjectPointer(candidate));
        }
      }
    }

    const deleted = dryRun
      ? 0
      : await this.repository.deleteInvoiceArtifactBlobsByIds(
          deletionCandidates.map((candidate) => candidate.id),
          evaluatedAt,
        );

    return {
      mode: configuredMode,
      evaluatedAt,
      dryRun,
      storageBackend: this.artifactGovernanceService.storageReadiness().storageBackend,
      expiredCandidates: summary.expiredCandidates,
      legalHoldSkipped: summary.legalHoldSkipped,
      deleted,
    };
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
    columnMap: AWS_CUR_COLUMNS,
    serviceName: firstString(row, AWS_CUR_COLUMNS.serviceName) ?? 'AWS usage',
    skuId: firstString(row, AWS_CUR_COLUMNS.skuId),
    region: firstString(row, AWS_CUR_COLUMNS.region),
    resourceId: firstString(row, AWS_CUR_COLUMNS.resourceId),
    usageStart: firstIso(row, AWS_CUR_COLUMNS.usageStart),
    usageEnd: firstIso(row, AWS_CUR_COLUMNS.usageEnd),
    usageQuantity: firstNumber(row, AWS_CUR_COLUMNS.usageQuantity),
    usageUnit: firstString(row, AWS_CUR_COLUMNS.usageUnit),
    costUsd: firstNumber(row, AWS_CUR_COLUMNS.costUsd),
    currency: firstString(row, AWS_CUR_COLUMNS.currency),
    tags: prefixedTags(row, ['resourceTags/user:', 'resourceTags/aws:']),
  });
}

function azureCostRow(row: Record<string, unknown>, index: number): BillingImportRowInput {
  return providerRow({
    row,
    index,
    provider: 'azure',
    columnMap: AZURE_COST_COLUMNS,
    serviceName: firstString(row, AZURE_COST_COLUMNS.serviceName) ?? 'Azure usage',
    skuId: firstString(row, AZURE_COST_COLUMNS.skuId),
    region: firstString(row, AZURE_COST_COLUMNS.region),
    resourceId: firstString(row, AZURE_COST_COLUMNS.resourceId),
    usageStart: firstIso(row, AZURE_COST_COLUMNS.usageStart),
    usageEnd: firstIso(row, AZURE_COST_COLUMNS.usageEnd),
    usageQuantity: firstNumber(row, AZURE_COST_COLUMNS.usageQuantity),
    usageUnit: firstString(row, AZURE_COST_COLUMNS.usageUnit),
    costUsd: firstNumber(row, AZURE_COST_COLUMNS.costUsd),
    fallbackCost: firstNumber(row, AZURE_COST_COLUMNS.fallbackCost),
    currency: firstString(row, AZURE_COST_COLUMNS.currency),
    tags: tagsFromJsonish(row, ['Tags', 'tags']),
  });
}

function gcpBillingRow(row: Record<string, unknown>, index: number): BillingImportRowInput {
  return providerRow({
    row,
    index,
    provider: 'gcp',
    columnMap: GCP_BILLING_COLUMNS,
    serviceName: firstString(row, GCP_BILLING_COLUMNS.serviceName) ?? 'GCP usage',
    skuId: firstString(row, GCP_BILLING_COLUMNS.skuId),
    region: firstString(row, GCP_BILLING_COLUMNS.region),
    resourceId: firstString(row, GCP_BILLING_COLUMNS.resourceId),
    usageStart: firstIso(row, GCP_BILLING_COLUMNS.usageStart),
    usageEnd: firstIso(row, GCP_BILLING_COLUMNS.usageEnd),
    usageQuantity: firstNumber(row, GCP_BILLING_COLUMNS.usageQuantity),
    usageUnit: firstString(row, GCP_BILLING_COLUMNS.usageUnit),
    costUsd: firstNumber(row, GCP_BILLING_COLUMNS.costUsd),
    currency: firstString(row, GCP_BILLING_COLUMNS.currency),
    tags: tagsFromJsonish(row, ['labels', 'project.labels', 'system_labels']),
  });
}

function providerRow(input: {
  row: Record<string, unknown>;
  index: number;
  provider: BillingImportInput['provider'];
  columnMap: ProviderExportColumnMap;
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

  const adjustmentClassification = classifyInvoiceAdjustment({
    row: input.row,
    serviceName: input.serviceName,
    skuId: input.skuId,
    costUsd,
  });

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
    rawPayload: withNormalizationAudit(
      input.row,
      input.provider,
      input.columnMap,
      adjustmentClassification,
    ),
  };
}

function withNormalizationAudit(
  row: Record<string, unknown>,
  provider: BillingImportInput['provider'],
  columnMap: ProviderExportColumnMap,
  adjustmentClassification: InvoiceAdjustmentClassification,
): Record<string, unknown> {
  const missingFields = missingRecommendedFields(row, columnMap);

  return {
    ...row,
    _polycost: {
      version: 1,
      provider,
      sourceRowFingerprint: sha256(stableJson(row)),
      recognizedColumns: recognizedSourceColumns(row, columnMap),
      missingRecommendedFields: missingFields,
      normalizationStatus: missingFields.length
        ? 'partial-provider-export'
        : 'provider-export-audit-ready',
      invoiceAdjustmentClassification: adjustmentClassification,
    },
  };
}

function recognizedSourceColumns(
  row: Record<string, unknown>,
  columnMap: ProviderExportColumnMap,
): string[] {
  return [
    ...new Set(
      Object.values(columnMap).flatMap((keys) => keys.filter((key) => hasSourceValue(row, key))),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function missingRecommendedFields(
  row: Record<string, unknown>,
  columnMap: ProviderExportColumnMap,
): string[] {
  return Object.entries(columnMap)
    .filter(([field]) => field !== 'fallbackCost')
    .filter(([field, keys]) => {
      if (
        field === 'costUsd' &&
        'fallbackCost' in columnMap &&
        columnMap.fallbackCost.some((key) => hasSourceValue(row, key))
      ) {
        return false;
      }

      return !keys.some((key) => hasSourceValue(row, key));
    })
    .map(([field]) => field);
}

function classifyInvoiceAdjustment(input: {
  row: Record<string, unknown>;
  serviceName: string;
  skuId?: string;
  costUsd: number;
}): InvoiceAdjustmentClassification {
  const signals = invoiceAdjustmentSignals(input.row, input.serviceName, input.skuId);
  const text = signals.join(' ').toLowerCase();

  if (matchesAny(text, ['refund', 'refunded'])) {
    return adjustment('refund', 'row is marked as a refund', signals);
  }

  if (matchesAny(text, ['tax', 'vat', 'gst', 'hst', 'sales tax'])) {
    return adjustment('tax', 'row is marked as tax', signals);
  }

  if (
    matchesAny(text, ['support', 'developer support', 'business support', 'enterprise support'])
  ) {
    return adjustment('support', 'row is marked as provider support', signals);
  }

  if (matchesAny(text, ['marketplace', 'private offer', 'publisher'])) {
    return adjustment(
      'marketplace',
      'row is marked as marketplace or private-offer spend',
      signals,
    );
  }

  if (
    matchesAny(text, [
      'savingsplancoveredusage',
      'discountedusage',
      'covered usage',
      'reservation usage',
      'reserved instance usage',
      'benefit usage',
      'reservation applied',
      'savings plan applied',
    ])
  ) {
    return commitmentClassification(
      'commitment-covered-usage',
      'row appears to be usage covered by a provider commitment',
      signals,
      text,
    );
  }

  if (
    matchesAny(text, [
      'savingsplannegation',
      'reservation discount',
      'reserved instance discount',
      'ri volume discount',
      'committed use discount',
      'sustained use discount',
      'cud credit',
      'commitment credit',
      'benefit discount',
    ])
  ) {
    return commitmentClassification(
      'commitment-discount',
      'row is marked as a commitment discount or usage negation',
      signals,
      text,
    );
  }

  if (
    matchesAny(text, [
      'savingsplanrecurringfee',
      'savingsplanupfrontfee',
      'rifee',
      'reservation fee',
      'reserved instance fee',
      'reservation purchase',
      'savings plan purchase',
      'commitment fee',
      'committed use fee',
      'recurring commitment',
    ])
  ) {
    return commitmentClassification(
      'commitment-fee',
      'row is marked as a recurring or upfront commitment fee',
      signals,
      text,
    );
  }

  if (
    matchesAny(text, [
      'amortized',
      'amortization',
      'unusedreservation',
      'unused reservation',
      'unusedsavingsplan',
      'unused savings plan',
      'unused commitment',
      'reservation amortization',
      'savings plan amortization',
    ])
  ) {
    return commitmentClassification(
      'commitment-amortization',
      'row is marked as commitment amortization or unused commitment cost',
      signals,
      text,
    );
  }

  if (
    matchesAny(text, [
      'discount',
      'savingsplannegation',
      'edp discount',
      'private rate discount',
      'discounted usage discount',
    ])
  ) {
    return adjustment('discount', 'row is marked as a discount or savings-plan negation', signals);
  }

  if (matchesAny(text, ['credit', 'promotional credit', 'service credit']) || input.costUsd < 0) {
    return adjustment('credit', 'row is marked as a credit or negative adjustment', signals);
  }

  if (matchesAny(text, ['enterprise', 'edp', 'true-up', 'trueup', 'billing adjustment'])) {
    return adjustment(
      'enterprise-adjustment',
      'row is marked as an enterprise adjustment',
      signals,
    );
  }

  if (matchesAny(text, ['fee', 'subscription', 'reservation fee', 'savings plan recurring'])) {
    return adjustment('fee', 'row is marked as a recurring fee or subscription charge', signals);
  }

  if (matchesAny(text, ['usage', 'covered usage', 'discountedusage', 'compute', 'storage'])) {
    return {
      category: 'usage',
      isAdjustment: false,
      reason: 'row appears to be estimate-comparable usage',
      sourceSignals: signals.slice(0, 12),
    };
  }

  return {
    category: 'unknown',
    isAdjustment: true,
    reason: 'row could not be proven estimate-comparable usage',
    sourceSignals: signals.slice(0, 12),
  };
}

function invoiceAdjustmentSignals(
  row: Record<string, unknown>,
  serviceName: string,
  skuId: string | undefined,
): string[] {
  const flattened = flattenPrimitiveValues(row);
  const signals = [serviceName, skuId, ...flattened]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim().slice(0, 180));

  return [...new Set(signals)].slice(0, 40);
}

function flattenPrimitiveValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenPrimitiveValues);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [
      key,
      ...flattenPrimitiveValues(nested),
    ]);
  }

  return [];
}

function matchesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function adjustment(
  category: Exclude<InvoiceAdjustmentCategory, 'usage' | 'unknown'>,
  reason: string,
  signals: string[],
): InvoiceAdjustmentClassification {
  return {
    category,
    isAdjustment: true,
    reason,
    sourceSignals: signals.slice(0, 12),
  };
}

function commitmentClassification(
  category:
    | 'commitment-covered-usage'
    | 'commitment-discount'
    | 'commitment-fee'
    | 'commitment-amortization',
  reason: string,
  signals: string[],
  text: string,
): InvoiceAdjustmentClassification {
  return {
    category,
    isAdjustment: !isEstimateComparableInvoiceCategory(category),
    reason,
    sourceSignals: signals.slice(0, 12),
    commitmentEvidence: commitmentEvidenceForCategory(category, signals, text),
  };
}

function commitmentEvidenceForCategory(
  category:
    | 'commitment-covered-usage'
    | 'commitment-discount'
    | 'commitment-fee'
    | 'commitment-amortization',
  signals: string[],
  text: string,
): InvoiceCommitmentEvidence {
  const treatment = commitmentTreatmentForCategory(category, text);

  return {
    kind: commitmentKindFromSignals(text),
    treatment,
    requiresProviderInventory: true,
    requiresAmortizationPeriod:
      treatment === 'fee' || treatment === 'amortization' || treatment === 'unused',
    requiresAllocationEvidence: true,
    evidenceSignals: signals.slice(0, 12),
    caveats: commitmentEvidenceCaveats(treatment),
  };
}

function commitmentKindFromSignals(text: string): InvoiceCommitmentKind {
  if (matchesAny(text, ['savingsplan', 'savings plan'])) {
    return 'savings-plan';
  }

  if (matchesAny(text, ['rifee', 'reserved instance', 'reservation'])) {
    return 'reserved-capacity';
  }

  if (matchesAny(text, ['committed use', 'committed-use', 'cud', 'commitment'])) {
    return 'committed-use';
  }

  if (matchesAny(text, ['sustained use', 'sustained-use'])) {
    return 'sustained-use';
  }

  if (matchesAny(text, ['benefit'])) {
    return 'benefit';
  }

  return 'unknown';
}

function commitmentTreatmentForCategory(
  category:
    | 'commitment-covered-usage'
    | 'commitment-discount'
    | 'commitment-fee'
    | 'commitment-amortization',
  text: string,
): InvoiceCommitmentTreatment {
  if (category === 'commitment-covered-usage') {
    return 'covered-usage';
  }

  if (category === 'commitment-discount') {
    return 'discount';
  }

  if (category === 'commitment-fee') {
    return 'fee';
  }

  return matchesAny(text, ['unused']) ? 'unused' : 'amortization';
}

function commitmentEvidenceCaveats(treatment: InvoiceCommitmentTreatment): string[] {
  const caveats = [
    'Provider commitment inventory is required before treating this as invoice-grade amortization evidence.',
    'Allocation requires account, subscription, or project ownership context from the provider export.',
  ];

  if (treatment === 'fee' || treatment === 'amortization' || treatment === 'unused') {
    caveats.push(
      'Amortization period and unused commitment allocation must be proven by provider/account data.',
    );
  }

  return caveats;
}

function hasSourceValue(row: Record<string, unknown>, key: string): boolean {
  const value = rowValue(row, key);

  return value !== undefined && value !== null && String(value).trim() !== '';
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

function firstString(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
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

function firstNumber(row: Record<string, unknown>, keys: readonly string[]): number | undefined {
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

function firstIso(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
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

function hasAllocationTags(tags: Record<string, string> | undefined): boolean {
  return Boolean(tags && Object.entries(tags).some(([key, value]) => key.trim() && value.trim()));
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
  const direct = Object.entries(row).find(([candidate]) => candidate === key)?.[1];

  if (direct !== undefined) {
    return direct;
  }

  if (!key.includes('.')) {
    return undefined;
  }

  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }

    return Object.entries(current as Record<string, unknown>).find(
      ([candidate]) => candidate === segment,
    )?.[1];
  }, row);
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

function parseInvoiceGradeArtifactRegistrationInput(
  body: unknown,
): InvoiceGradeArtifactRegistrationInput {
  const record = requireRecord(
    body,
    'Invoice-grade artifact registration request body must be an object',
  );
  const billingPeriodStart =
    record.billingPeriodStart !== undefined
      ? parseDate(record.billingPeriodStart, 'billingPeriodStart')
      : undefined;
  const billingPeriodEnd =
    record.billingPeriodEnd !== undefined
      ? parseDate(record.billingPeriodEnd, 'billingPeriodEnd')
      : undefined;

  if (billingPeriodStart && billingPeriodEnd && billingPeriodEnd < billingPeriodStart) {
    throw new ApiValidationError('artifact billing period is invalid', [
      {
        field: 'billingPeriodEnd',
        issue: 'must be on or after billingPeriodStart',
      },
    ]);
  }

  return {
    type: parseArtifactType(record.type),
    displayName: parseRequiredString(record.displayName, 'displayName', 160),
    reference: parseRequiredString(record.reference, 'reference', 500),
    ...(record.sha256 !== undefined ? { sha256: parseSha256(record.sha256, 'sha256') } : {}),
    ...(record.controlTotalUsd !== undefined
      ? { controlTotalUsd: parseFiniteNumber(record.controlTotalUsd, 'controlTotalUsd') }
      : {}),
    ...(billingPeriodStart ? { billingPeriodStart } : {}),
    ...(billingPeriodEnd ? { billingPeriodEnd } : {}),
    ...(parseOptionalString(record.notes, 600)
      ? { notes: parseOptionalString(record.notes, 600) }
      : {}),
  };
}

function parseArtifactType(value: unknown): InvoiceGradeArtifactType {
  if (
    typeof value === 'string' &&
    INVOICE_GRADE_ARTIFACT_TYPES.includes(value as InvoiceGradeArtifactType)
  ) {
    return value as InvoiceGradeArtifactType;
  }

  throw new ApiValidationError('artifact type is unsupported', [
    {
      field: 'type',
      issue: `must be one of ${INVOICE_GRADE_ARTIFACT_TYPES.join(', ')}`,
    },
  ]);
}

function parseInvoiceGradeArtifactVerificationInput(
  body: unknown,
): InvoiceGradeArtifactVerificationInput {
  const record = requireRecord(
    body,
    'Invoice-grade artifact verification request body must be an object',
  );

  return {
    verificationStatus: parseArtifactVerificationStatus(record.verificationStatus),
    evidenceReference: parseRequiredString(record.evidenceReference, 'evidenceReference', 500),
    ...(record.sha256 !== undefined ? { sha256: parseSha256(record.sha256, 'sha256') } : {}),
    ...(record.controlTotalUsd !== undefined
      ? { controlTotalUsd: parseFiniteNumber(record.controlTotalUsd, 'controlTotalUsd') }
      : {}),
    ...(parseOptionalString(record.notes, 600)
      ? { notes: parseOptionalString(record.notes, 600) }
      : {}),
  };
}

function parseArtifactVerificationStatus(
  value: unknown,
): InvoiceGradeArtifactVerificationInput['verificationStatus'] {
  if (value === 'verified' || value === 'rejected') {
    return value;
  }

  throw new ApiValidationError('artifact verification status is unsupported', [
    {
      field: 'verificationStatus',
      issue: 'must be verified or rejected',
    },
  ]);
}

function parseInvoiceArtifactBlobUploadInput(body: unknown): InvoiceArtifactBlobUploadInput {
  const record = requireRecord(body, 'Invoice artifact blob upload request body must be an object');
  const fileName = parseArtifactFileName(record.fileName);
  const mimeType = parseArtifactMimeType(record.mimeType);
  const content = parseRequiredString(
    record.content,
    'content',
    MAX_INVOICE_ARTIFACT_BLOB_BYTES * 2,
  );
  const encoding = record.encoding === 'base64' ? 'base64' : 'text';
  const retentionDays = parseOptionalRetentionDays(record.retentionDays);
  const legalHold = parseOptionalBoolean(record.legalHold, 'legalHold');
  const kmsKeyReference = parseArtifactGovernanceReference(
    record.kmsKeyReference,
    'kmsKeyReference',
  );

  return {
    fileName,
    mimeType,
    content,
    encoding,
    ...(record.sha256 !== undefined ? { sha256: parseSha256(record.sha256, 'sha256') } : {}),
    ...(retentionDays !== undefined ? { retentionDays } : {}),
    ...(legalHold !== undefined ? { legalHold } : {}),
    ...(kmsKeyReference ? { kmsKeyReference } : {}),
  };
}

function parseInvoiceArtifactLegalHoldInput(body: unknown): InvoiceArtifactLegalHoldInput {
  const record = requireRecord(body, 'Invoice artifact legal-hold request body must be an object');
  const reason = parseOptionalString(record.reason, 400);

  return {
    legalHold: parseRequiredBoolean(record.legalHold, 'legalHold'),
    ...(reason ? { reason } : {}),
  };
}

function parseArtifactFileName(value: unknown): string {
  const fileName = parseRequiredString(value, 'fileName', 180);

  if (
    fileName.includes('/') ||
    fileName.includes('\\') ||
    hasControlCharacter(fileName) ||
    fileName === '.' ||
    fileName === '..'
  ) {
    throw new ApiValidationError('fileName is invalid', [
      {
        field: 'fileName',
        issue: 'must be a plain file name without path separators',
      },
    ]);
  }

  return fileName;
}

function parseArtifactMimeType(value: unknown): (typeof INVOICE_ARTIFACT_MIME_TYPES)[number] {
  const mimeType = parseRequiredString(value, 'mimeType', 80).toLowerCase();

  if (
    INVOICE_ARTIFACT_MIME_TYPES.includes(mimeType as (typeof INVOICE_ARTIFACT_MIME_TYPES)[number])
  ) {
    return mimeType as (typeof INVOICE_ARTIFACT_MIME_TYPES)[number];
  }

  throw new ApiValidationError('mimeType is unsupported', [
    {
      field: 'mimeType',
      issue: `must be one of ${INVOICE_ARTIFACT_MIME_TYPES.join(', ')}`,
    },
  ]);
}

function parseOptionalRetentionDays(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_INVOICE_ARTIFACT_RETENTION_DAYS) {
    throw new ApiValidationError('retentionDays is invalid', [
      {
        field: 'retentionDays',
        issue: `must be an integer between 1 and ${MAX_INVOICE_ARTIFACT_RETENTION_DAYS}`,
      },
    ]);
  }

  return parsed;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredBoolean(value, field);
}

function parseRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new ApiValidationError(`${field} must be boolean`, [
    {
      field,
      issue: 'must be true or false',
    },
  ]);
}

function parseArtifactGovernanceReference(value: unknown, field: string): string | undefined {
  const parsed = parseOptionalString(value, 240);

  if (!parsed) {
    return undefined;
  }

  if (hasControlCharacter(parsed)) {
    throw new ApiValidationError(`${field} is invalid`, [
      {
        field,
        issue: 'must not contain control characters',
      },
    ]);
  }

  return parsed;
}

function parseInvoiceArtifactRetentionEnforcementInput(body: unknown): { dryRun: boolean } {
  const record =
    body === undefined || body === null
      ? {}
      : requireRecord(
          body,
          'Invoice artifact retention enforcement request body must be an object',
        );

  return {
    dryRun: parseOptionalBoolean(record.dryRun, 'dryRun') ?? false,
  };
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);

    return code < 32 || code === 127;
  });
}

function decodeInvoiceArtifactBlob(input: InvoiceArtifactBlobUploadInput): {
  fileName: string;
  mimeType: string;
  content: Buffer;
  sha256: string;
} {
  const content =
    input.encoding === 'base64'
      ? decodeBase64ArtifactContent(input.content)
      : Buffer.from(input.content, 'utf8');

  if (content.length === 0 || content.length > MAX_INVOICE_ARTIFACT_BLOB_BYTES) {
    throw new ApiValidationError('invoice artifact blob size is invalid', [
      {
        field: 'content',
        issue: `must decode to between 1 byte and ${MAX_INVOICE_ARTIFACT_BLOB_BYTES} bytes`,
      },
    ]);
  }

  const contentSha256 = sha256Buffer(content);

  if (input.sha256 && input.sha256 !== contentSha256) {
    throw new ApiValidationError('invoice artifact blob checksum is invalid', [
      {
        field: 'sha256',
        issue: 'must match the decoded content SHA-256 digest',
      },
    ]);
  }

  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    content,
    sha256: contentSha256,
  };
}

function decodeBase64ArtifactContent(content: string): Buffer {
  const normalized = content.replace(/\s+/g, '');

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new ApiValidationError('content must be base64 encoded', [
      {
        field: 'content',
        issue: 'must be valid base64 when encoding is base64',
      },
    ]);
  }

  return Buffer.from(normalized, 'base64');
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

  return parseSha256(parsed, 'originalFileSha256');
}

function parseSha256(value: unknown, field: string): string {
  const parsed = parseRequiredString(value, field, 64);

  if (!SHA256_PATTERN.test(parsed)) {
    throw new ApiValidationError(`${field} must be a SHA-256 hex digest`, [
      {
        field,
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

function assertBillingAdmin(identity: AuthIdentity): void {
  if (!identity.teamId || (identity.role !== 'owner' && identity.role !== 'admin')) {
    throw new ApiForbiddenError('Team admin access is required for billing reconciliation');
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
  lineItems: Array<{
    lineItemHash: string;
    skuId?: string;
    serviceName: string;
    provider?: BillingImportInput['provider'];
    region?: string;
    resourceId?: string;
    usageStart?: string;
    usageEnd?: string;
    costUsd: number;
    currency?: string;
    tags?: Record<string, string>;
    rawPayload?: Record<string, unknown>;
  }>,
  estimatedTotalUsd: number,
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
  const invoiceSkuIds = [
    ...new Set(
      lineItems
        .map((lineItem) => lineItem.skuId)
        .filter((skuId): skuId is string => typeof skuId === 'string' && Boolean(skuId)),
    ),
  ];
  const invoiceServices = [...new Set(lineItems.map((lineItem) => lineItem.serviceName))];
  const comparisonSkuIds = [
    ...new Set(
      traceKeys
        .map((trace) => trace.skuId)
        .filter((skuId): skuId is string => typeof skuId === 'string' && Boolean(skuId)),
    ),
  ];
  const comparisonCategories = [
    ...new Set(traceKeys.map((trace) => trace.category).filter(Boolean)),
  ];
  const sourceFingerprints = lineItems
    .map((lineItem) => sourceRowFingerprint(lineItem.rawPayload))
    .filter((fingerprint): fingerprint is string => Boolean(fingerprint));
  const missingRecommendedFields = [
    ...new Set(lineItems.flatMap((lineItem) => sourceMissingFields(lineItem.rawPayload))),
  ].sort((left, right) => left.localeCompare(right));
  const skuMatches = invoiceSkuIds.filter((skuId) => comparisonSkuIds.includes(skuId));
  const serviceMatches = invoiceServices.filter((serviceName) =>
    comparisonCategories.some(
      (category) =>
        serviceName.toLowerCase().includes(String(category).toLowerCase()) ||
        String(category).toLowerCase().includes(serviceName.toLowerCase()),
    ),
  );
  const rowsWithUsageWindow = lineItems.filter(
    (lineItem) => lineItem.usageStart && lineItem.usageEnd,
  ).length;
  const rowCount = lineItems.length;
  const adjustmentSummary = invoiceAdjustmentSummary(lineItems, estimatedTotalUsd);
  const traceCoverage = {
    rowCount,
    rowsWithSkuId: lineItems.filter((lineItem) => lineItem.skuId).length,
    rowsWithRegion: lineItems.filter((lineItem) => lineItem.region).length,
    rowsWithResourceId: lineItems.filter((lineItem) => lineItem.resourceId).length,
    rowsWithUsageWindow,
    rowsWithCurrency: lineItems.filter((lineItem) => lineItem.currency).length,
    rowsWithAllocationTags: lineItems.filter((lineItem) => hasAllocationTags(lineItem.tags)).length,
    rowsWithSourceFingerprint: sourceFingerprints.length,
    skuMatchCount: skuMatches.length,
    serviceMatchCount: serviceMatches.length,
    skuMatchPercent: percentOf(skuMatches.length, Math.max(invoiceSkuIds.length, 1)),
    sourceFingerprintPercent: percentOf(sourceFingerprints.length, Math.max(rowCount, 1)),
    currencyCoveragePercent: percentOf(
      lineItems.filter((lineItem) => lineItem.currency).length,
      Math.max(rowCount, 1),
    ),
    allocationTagCoveragePercent: percentOf(
      lineItems.filter((lineItem) => hasAllocationTags(lineItem.tags)).length,
      Math.max(rowCount, 1),
    ),
  };
  const invoiceGradeReadiness = invoiceGradeReadinessMatrix(
    lineItems,
    traceCoverage,
    adjustmentSummary,
    missingRecommendedFields,
  );

  return {
    importRunId,
    comparisonId: comparison.comparisonId,
    pricingAsOf: comparison.pricingAsOf,
    invoiceLineItemHashes: lineItems.map((lineItem) => lineItem.lineItemHash),
    invoiceSkuIds,
    invoiceServices,
    invoiceSourceRowFingerprints: sourceFingerprints,
    invoiceSourceMissingRecommendedFields: missingRecommendedFields,
    invoiceCoverage: {
      totalCostUsd: roundCurrency(
        lineItems.reduce((total, lineItem) => total + lineItem.costUsd, 0),
      ),
      ...traceCoverage,
    },
    invoiceAdjustmentSummary: adjustmentSummary,
    invoiceGradeReadiness,
    invoiceMatchSummary: {
      comparisonSkuIds,
      comparisonCategories,
      matchedSkuIds: skuMatches,
      matchedServices: serviceMatches,
      readiness: invoiceEvidenceReadiness(traceCoverage, missingRecommendedFields),
      caveats: invoiceEvidenceCaveats(
        traceCoverage,
        missingRecommendedFields,
        adjustmentSummary.adjustmentLineItemCount,
        adjustmentSummary.commitmentLineItemCount,
        adjustmentSummary.commitmentEvidence.rowsRequiringAmortizationPeriod,
      ),
    },
    comparisonTraceKeys: traceKeys,
  };
}

function invoiceAdjustmentSummary(
  lineItems: Array<{
    serviceName: string;
    skuId?: string;
    costUsd: number;
    rawPayload?: Record<string, unknown>;
  }>,
  estimatedTotalUsd: number,
): {
  grossInvoiceTotalUsd: number;
  estimateComparableUsageCostUsd: number;
  adjustmentCostUsd: number;
  usageLineItemCount: number;
  adjustmentLineItemCount: number;
  commitmentLineItemCount: number;
  commitmentNetCostUsd: number;
  commitmentEvidence: {
    status: 'not-applicable' | 'provider-inventory-required';
    rowsRequiringProviderInventory: number;
    rowsRequiringAmortizationPeriod: number;
    rowsRequiringAllocationEvidence: number;
    categories: Array<{
      kind: InvoiceCommitmentKind;
      treatment: InvoiceCommitmentTreatment;
      rowCount: number;
      totalCostUsd: number;
    }>;
    caveats: string[];
  };
  estimateComparableVarianceUsd: number;
  estimateComparableVariancePercent: number;
  categories: Array<{
    category: InvoiceAdjustmentCategory;
    rowCount: number;
    totalCostUsd: number;
    exampleServices: string[];
    reasons: string[];
  }>;
} {
  const categories = new Map<
    InvoiceAdjustmentCategory,
    {
      rowCount: number;
      totalCostUsd: number;
      exampleServices: Set<string>;
      reasons: Set<string>;
    }
  >();
  let usageSubtotal = 0;
  let adjustmentSubtotal = 0;
  let usageLineItemCount = 0;
  let adjustmentLineItemCount = 0;
  let commitmentLineItemCount = 0;
  let commitmentNetCostUsd = 0;
  let rowsRequiringProviderInventory = 0;
  let rowsRequiringAmortizationPeriod = 0;
  let rowsRequiringAllocationEvidence = 0;
  const commitmentEvidenceCategories = new Map<
    string,
    {
      kind: InvoiceCommitmentKind;
      treatment: InvoiceCommitmentTreatment;
      rowCount: number;
      totalCostUsd: number;
    }
  >();
  const commitmentEvidenceCaveatSet = new Set<string>();

  for (const lineItem of lineItems) {
    const classification = lineItemAdjustmentClassification(lineItem);
    const existing = categories.get(classification.category) ?? {
      rowCount: 0,
      totalCostUsd: 0,
      exampleServices: new Set<string>(),
      reasons: new Set<string>(),
    };

    existing.rowCount += 1;
    existing.totalCostUsd = roundCurrency(existing.totalCostUsd + lineItem.costUsd);
    existing.exampleServices.add(lineItem.serviceName);
    existing.reasons.add(classification.reason);
    categories.set(classification.category, existing);

    if (isCommitmentInvoiceCategory(classification.category)) {
      commitmentLineItemCount += 1;
      commitmentNetCostUsd = roundCurrency(commitmentNetCostUsd + lineItem.costUsd);
    }

    if (classification.commitmentEvidence) {
      if (classification.commitmentEvidence.requiresProviderInventory) {
        rowsRequiringProviderInventory += 1;
      }

      if (classification.commitmentEvidence.requiresAmortizationPeriod) {
        rowsRequiringAmortizationPeriod += 1;
      }

      if (classification.commitmentEvidence.requiresAllocationEvidence) {
        rowsRequiringAllocationEvidence += 1;
      }

      const commitmentKey = [
        classification.commitmentEvidence.kind,
        classification.commitmentEvidence.treatment,
      ].join(':');
      const existingCommitment = commitmentEvidenceCategories.get(commitmentKey) ?? {
        kind: classification.commitmentEvidence.kind,
        treatment: classification.commitmentEvidence.treatment,
        rowCount: 0,
        totalCostUsd: 0,
      };
      existingCommitment.rowCount += 1;
      existingCommitment.totalCostUsd = roundCurrency(
        existingCommitment.totalCostUsd + lineItem.costUsd,
      );
      commitmentEvidenceCategories.set(commitmentKey, existingCommitment);

      for (const caveat of classification.commitmentEvidence.caveats) {
        commitmentEvidenceCaveatSet.add(caveat);
      }
    }

    if (!classification.isAdjustment) {
      usageLineItemCount += 1;
      usageSubtotal = roundCurrency(usageSubtotal + lineItem.costUsd);
    } else {
      adjustmentLineItemCount += 1;
      adjustmentSubtotal = roundCurrency(adjustmentSubtotal + lineItem.costUsd);
    }
  }

  const estimateComparableVarianceUsd = roundCurrency(usageSubtotal - estimatedTotalUsd);

  return {
    grossInvoiceTotalUsd: roundCurrency(usageSubtotal + adjustmentSubtotal),
    estimateComparableUsageCostUsd: usageSubtotal,
    adjustmentCostUsd: adjustmentSubtotal,
    usageLineItemCount,
    adjustmentLineItemCount,
    commitmentLineItemCount,
    commitmentNetCostUsd,
    commitmentEvidence: {
      status: commitmentLineItemCount > 0 ? 'provider-inventory-required' : 'not-applicable',
      rowsRequiringProviderInventory,
      rowsRequiringAmortizationPeriod,
      rowsRequiringAllocationEvidence,
      categories: [...commitmentEvidenceCategories.values()].sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind.localeCompare(right.kind);
        }

        return left.treatment.localeCompare(right.treatment);
      }),
      caveats: [...commitmentEvidenceCaveatSet],
    },
    estimateComparableVarianceUsd,
    estimateComparableVariancePercent:
      estimatedTotalUsd === 0
        ? usageSubtotal === 0
          ? 0
          : 100
        : roundPercent((estimateComparableVarianceUsd / estimatedTotalUsd) * 100),
    categories: [...categories.entries()]
      .map(([category, summary]) => ({
        category,
        rowCount: summary.rowCount,
        totalCostUsd: roundCurrency(summary.totalCostUsd),
        exampleServices: [...summary.exampleServices].slice(0, 4),
        reasons: [...summary.reasons].slice(0, 4),
      }))
      .sort((left, right) => {
        if (left.category === 'usage') {
          return -1;
        }

        if (right.category === 'usage') {
          return 1;
        }

        return Math.abs(right.totalCostUsd) - Math.abs(left.totalCostUsd);
      }),
  };
}

function invoiceGradeReadinessMatrix(
  lineItems: Array<{
    provider?: BillingImportInput['provider'];
    serviceName: string;
    skuId?: string;
    resourceId?: string;
    usageStart?: string;
    usageEnd?: string;
    currency?: string;
    tags?: Record<string, string>;
  }>,
  coverage: {
    rowCount: number;
    rowsWithSourceFingerprint: number;
    rowsWithSkuId: number;
    rowsWithResourceId: number;
    rowsWithUsageWindow: number;
    rowsWithCurrency: number;
    rowsWithAllocationTags: number;
    skuMatchCount: number;
    serviceMatchCount: number;
    sourceFingerprintPercent: number;
    skuMatchPercent: number;
    currencyCoveragePercent: number;
    allocationTagCoveragePercent: number;
  },
  adjustmentSummary: {
    adjustmentLineItemCount: number;
    commitmentLineItemCount: number;
    commitmentEvidence: {
      rowsRequiringProviderInventory: number;
      rowsRequiringAmortizationPeriod: number;
      rowsRequiringAllocationEvidence: number;
    };
    categories: Array<{
      category: InvoiceAdjustmentCategory;
      rowCount: number;
      totalCostUsd: number;
    }>;
  },
  missingRecommendedFields: string[],
): {
  status: 'invoice-grade-blocked' | 'invoice-grade-review-ready';
  presentCount: number;
  partialCount: number;
  missingCount: number;
  notApplicableCount: number;
  blockers: string[];
  requiredArtifacts: string[];
  checks: InvoiceGradeReadinessCheck[];
} {
  const provider = lineItems.find((lineItem) => lineItem.provider)?.provider;
  const rowCount = Math.max(coverage.rowCount, 1);
  const hasPrivatePricingRows = invoiceCategoryTotal(adjustmentSummary, [
    'discount',
    'enterprise-adjustment',
    'commitment-discount',
  ]);
  const hasTaxRows = invoiceCategoryTotal(adjustmentSummary, ['tax']);
  const checks: InvoiceGradeReadinessCheck[] = [
    {
      id: 'provider-invoice-control',
      label: 'Provider invoice control total',
      status: 'missing',
      evidence: 'PolyCost has normalized provider export rows, not the provider invoice of record.',
      requiredArtifact: providerInvoiceArtifact(provider),
    },
    {
      id: 'source-row-traceability',
      label: 'Source-row traceability',
      status:
        coverage.rowsWithSourceFingerprint === coverage.rowCount
          ? 'present'
          : coverage.rowsWithSourceFingerprint > 0
            ? 'partial'
            : 'missing',
      evidence: `${coverage.sourceFingerprintPercent}% of imported rows have PolyCost source-row fingerprints.`,
      requiredArtifact:
        'Provider export with stable row IDs, source file hash, and import manifest.',
    },
    {
      id: 'sku-service-match',
      label: 'SKU/service match to estimate',
      status:
        coverage.skuMatchPercent === 100
          ? 'present'
          : coverage.skuMatchCount > 0 || coverage.serviceMatchCount > 0
            ? 'partial'
            : 'missing',
      evidence: `${coverage.skuMatchCount} SKU match(es), ${coverage.serviceMatchCount} service-name match(es).`,
      requiredArtifact: 'Provider SKU/meter-to-estimate mapping reviewed for the billing period.',
    },
    {
      id: 'allocation-evidence',
      label: 'Cost allocation evidence',
      status:
        coverage.rowsWithAllocationTags === coverage.rowCount ||
        coverage.rowsWithResourceId === rowCount
          ? 'present'
          : coverage.rowsWithAllocationTags > 0 || coverage.rowsWithResourceId > 0
            ? 'partial'
            : 'missing',
      evidence: `${coverage.allocationTagCoveragePercent}% rows have allocation tags; ${coverage.rowsWithResourceId}/${coverage.rowCount} rows have resource IDs.`,
      requiredArtifact:
        'Cost allocation tag policy, account/subscription/project ownership map, and resource-owner evidence.',
    },
    {
      id: 'billing-period-currency',
      label: 'Billing period and currency completeness',
      status:
        coverage.rowsWithUsageWindow === coverage.rowCount &&
        coverage.rowsWithCurrency === coverage.rowCount
          ? 'present'
          : coverage.rowsWithUsageWindow > 0 || coverage.rowsWithCurrency > 0
            ? 'partial'
            : 'missing',
      evidence: `${coverage.rowsWithUsageWindow}/${coverage.rowCount} rows have usage windows; ${coverage.currencyCoveragePercent}% rows have currency.`,
      requiredArtifact:
        'Provider billing-period boundaries, currency/exchange-rate policy, and invoice issue date.',
    },
    {
      id: 'adjustment-support',
      label: 'Invoice adjustment support',
      status: adjustmentSummary.adjustmentLineItemCount > 0 ? 'partial' : 'not-applicable',
      evidence: `${adjustmentSummary.adjustmentLineItemCount} non-usage adjustment row(s) classified.`,
      requiredArtifact:
        'Provider support, marketplace, credit, refund, fee, and adjustment documents for each non-usage row.',
    },
    {
      id: 'commitment-amortization',
      label: 'Commitment amortization evidence',
      status:
        adjustmentSummary.commitmentLineItemCount === 0
          ? 'not-applicable'
          : adjustmentSummary.commitmentEvidence.rowsRequiringAmortizationPeriod > 0
            ? 'missing'
            : 'partial',
      evidence: `${adjustmentSummary.commitmentLineItemCount} commitment row(s); ${adjustmentSummary.commitmentEvidence.rowsRequiringAmortizationPeriod} require amortization-period proof.`,
      requiredArtifact:
        'Provider commitment inventory, benefit coverage report, amortization schedule, and unused commitment allocation.',
    },
    {
      id: 'private-pricing',
      label: 'Private pricing and discount proof',
      status: hasPrivatePricingRows > 0 ? 'missing' : 'not-applicable',
      evidence: `${hasPrivatePricingRows} private-pricing, discount, or enterprise-adjustment row(s) detected.`,
      requiredArtifact:
        'Private rate card, enterprise agreement, EDP/EA terms, discount schedule, or provider contract extract.',
    },
    {
      id: 'tax-jurisdiction',
      label: 'Tax jurisdiction evidence',
      status: hasTaxRows > 0 ? 'missing' : 'not-applicable',
      evidence: `${hasTaxRows} tax row(s) detected.`,
      requiredArtifact:
        'Provider tax invoice, jurisdiction mapping, VAT/GST/sales-tax treatment, and legal-entity mapping.',
    },
  ];

  if (missingRecommendedFields.length > 0) {
    checks.push({
      id: 'provider-column-completeness',
      label: 'Provider export column completeness',
      status: 'partial',
      evidence: `Missing recommended normalized fields: ${missingRecommendedFields.join(', ')}.`,
      requiredArtifact:
        'Native provider export with recommended SKU, region, usage, cost, currency, and resource columns.',
    });
  }

  const presentCount = checks.filter((check) => check.status === 'present').length;
  const partialCount = checks.filter((check) => check.status === 'partial').length;
  const missingCount = checks.filter((check) => check.status === 'missing').length;
  const notApplicableCount = checks.filter((check) => check.status === 'not-applicable').length;
  const blockingChecks = checks.filter((check) => check.status === 'missing');

  return {
    status: blockingChecks.length > 0 ? 'invoice-grade-blocked' : 'invoice-grade-review-ready',
    presentCount,
    partialCount,
    missingCount,
    notApplicableCount,
    blockers: blockingChecks.map((check) => check.label),
    requiredArtifacts: [...new Set(blockingChecks.map((check) => check.requiredArtifact))],
    checks,
  };
}

function invoiceCategoryTotal(
  adjustmentSummary: {
    categories: Array<{
      category: InvoiceAdjustmentCategory;
      rowCount: number;
    }>;
  },
  categories: InvoiceAdjustmentCategory[],
): number {
  return adjustmentSummary.categories
    .filter((summary) => categories.includes(summary.category))
    .reduce((total, summary) => total + summary.rowCount, 0);
}

function providerInvoiceArtifact(provider: BillingImportInput['provider'] | undefined): string {
  switch (provider) {
    case 'aws':
      return 'AWS invoice PDF/tax invoice, CUR manifest, payer-account billing period, and Cost Explorer control total.';
    case 'azure':
      return 'Azure invoice PDF, Cost Management export manifest, billing profile/invoice section, and cost control total.';
    case 'gcp':
      return 'GCP Cloud Billing invoice, billing account export manifest, project/legal-entity mapping, and invoice control total.';
    default:
      return 'Provider invoice of record, billing export manifest, account scope, and invoice control total.';
  }
}

function appendInvoiceGradeArtifactEvidence(
  reconciliation: InvoiceReconciliationRecord,
  artifact: InvoiceGradeArtifactRecord,
): Record<string, unknown> {
  const existingArtifacts = invoiceGradeArtifactsFromEvidence(reconciliation.evidence);
  const artifacts = [...existingArtifacts, artifact];
  const register = invoiceGradeArtifactRegister(artifacts, reconciliation);

  return {
    ...reconciliation.evidence,
    invoiceGradeReadiness: annotateInvoiceGradeReadinessWithArtifacts(
      reconciliation.evidence.invoiceGradeReadiness,
      register,
    ),
    invoiceGradeArtifactRegister: register,
  };
}

function replaceInvoiceGradeArtifactEvidence(
  reconciliation: InvoiceReconciliationRecord,
  artifact: InvoiceGradeArtifactRecord,
): Record<string, unknown> {
  const artifacts = invoiceGradeArtifactsFromEvidence(reconciliation.evidence).map((candidate) =>
    candidate.id === artifact.id ? artifact : candidate,
  );
  const register = invoiceGradeArtifactRegister(artifacts, reconciliation);

  return {
    ...reconciliation.evidence,
    invoiceGradeReadiness: annotateInvoiceGradeReadinessWithArtifacts(
      reconciliation.evidence.invoiceGradeReadiness,
      register,
    ),
    invoiceGradeArtifactRegister: register,
  };
}

function verifiedInvoiceGradeArtifact(
  artifact: InvoiceGradeArtifactRecord,
  input: InvoiceGradeArtifactVerificationInput,
  reconciliation: InvoiceReconciliationRecord,
  identity: AuthIdentity,
): InvoiceGradeArtifactRecord {
  if (artifact.sha256 && input.sha256 && artifact.sha256 !== input.sha256) {
    throw new ApiValidationError('artifact checksum does not match registered checksum', [
      {
        field: 'sha256',
        issue: 'must match the SHA-256 digest registered for this artifact',
      },
    ]);
  }

  if (
    artifact.controlTotalUsd !== undefined &&
    input.controlTotalUsd !== undefined &&
    roundCurrency(artifact.controlTotalUsd - input.controlTotalUsd) !== 0
  ) {
    throw new ApiValidationError('artifact control total does not match registered metadata', [
      {
        field: 'controlTotalUsd',
        issue: 'must match the registered control total for this artifact',
      },
    ]);
  }

  const timestamp = new Date().toISOString();
  const verifiedSha256 = input.sha256 ?? artifact.sha256;
  const verificationControlTotalUsd = input.controlTotalUsd ?? artifact.controlTotalUsd;

  if (
    input.verificationStatus === 'verified' &&
    !verifiedSha256 &&
    verificationControlTotalUsd === undefined
  ) {
    throw new ApiValidationError('verified artifact requires checksum or control total evidence', [
      {
        field: 'sha256',
        issue: 'supply a verified SHA-256 digest or controlTotalUsd before marking verified',
      },
    ]);
  }

  if (input.verificationStatus === 'rejected') {
    return {
      ...artifact,
      verificationStatus: 'rejected',
      verificationEvidenceReference: input.evidenceReference,
      ...(input.notes ? { verificationNotes: input.notes } : {}),
      rejectedAt: timestamp,
      rejectedByAccountId: identity.accountId,
      verifiedAt: undefined,
      verifiedByAccountId: undefined,
      verifiedSha256: undefined,
      verificationControlTotalUsd: undefined,
      verificationControlTotalDeltaUsd: undefined,
    };
  }

  return {
    ...artifact,
    verificationStatus: 'verified',
    verificationEvidenceReference: input.evidenceReference,
    ...(input.notes ? { verificationNotes: input.notes } : {}),
    ...(verifiedSha256 ? { verifiedSha256 } : {}),
    ...(verificationControlTotalUsd !== undefined
      ? {
          verificationControlTotalUsd,
          verificationControlTotalDeltaUsd: roundCurrency(
            verificationControlTotalUsd - reconciliation.invoicedTotalUsd,
          ),
        }
      : {}),
    verifiedAt: timestamp,
    verifiedByAccountId: identity.accountId,
    rejectedAt: undefined,
    rejectedByAccountId: undefined,
  };
}

function storedInvoiceGradeArtifact(
  artifact: InvoiceGradeArtifactRecord,
  blob: {
    fileName: string;
    mimeType: string;
    content: Buffer;
    sha256: string;
  },
  uploadedAt: string,
  identity: AuthIdentity,
  governance: InvoiceArtifactBlobGovernance,
): InvoiceGradeArtifactRecord {
  return {
    ...artifact,
    sha256: artifact.sha256 ?? blob.sha256,
    storedBlob: {
      storageStatus: 'stored',
      storageMode: governance.storageProfile.storageBackend,
      fileName: blob.fileName,
      mimeType: blob.mimeType,
      contentSha256: blob.sha256,
      contentSizeBytes: blob.content.length,
      uploadedAt,
      uploadedByAccountId: identity.accountId,
      governance,
    },
  };
}

function legalHoldInvoiceGradeArtifact(
  artifact: InvoiceGradeArtifactRecord,
  input: InvoiceArtifactLegalHoldInput,
  identity: AuthIdentity,
): InvoiceGradeArtifactRecord {
  const storedBlob = artifact.storedBlob;

  if (!storedBlob) {
    throw new ApiValidationError('invoice artifact file is not stored', [
      {
        field: 'artifactId',
        issue: 'store the artifact file before changing legal hold state',
      },
    ]);
  }

  const timestamp = new Date().toISOString();
  const governance = storedBlob.governance;

  return {
    ...artifact,
    storedBlob: {
      ...storedBlob,
      legalHoldUpdatedAt: timestamp,
      legalHoldUpdatedByAccountId: identity.accountId,
      ...(input.reason ? { legalHoldReason: input.reason } : {}),
      ...(governance
        ? {
            governance: {
              ...governance,
              retentionPolicy: {
                ...governance.retentionPolicy,
                legalHold: input.legalHold,
              },
            },
          }
        : {}),
    },
  };
}

function governanceWithStoredObject(
  governance: InvoiceArtifactBlobGovernance,
  storedObject: StoredInvoiceArtifactObject,
): InvoiceArtifactBlobGovernance {
  if (storedObject.storageBackend === 'database-bytea') {
    return governance;
  }

  const existingObjectStore = governance.storageProfile.objectStore;

  return {
    ...governance,
    storageProfile: {
      ...governance.storageProfile,
      storageBackend: storedObject.storageBackend,
      objectStore: {
        bucketOrContainer:
          storedObject.objectStoreBucket ?? existingObjectStore?.bucketOrContainer ?? 'unknown',
        prefix: existingObjectStore?.prefix ?? 'invoice-artifacts',
        ...(storedObject.objectStoreRegion
          ? { region: storedObject.objectStoreRegion }
          : existingObjectStore?.region
            ? { region: existingObjectStore.region }
            : {}),
        ...(storedObject.objectStoreKey ? { key: storedObject.objectStoreKey } : {}),
        ...(storedObject.objectStoreUri ? { uri: storedObject.objectStoreUri } : {}),
        ...(storedObject.objectStoreETag ? { eTag: storedObject.objectStoreETag } : {}),
        ...(storedObject.objectStoreVersion ? { version: storedObject.objectStoreVersion } : {}),
      },
    },
  };
}

function blobObjectPointer(blob: InvoiceArtifactBlobRecord): InvoiceArtifactObjectPointer {
  return {
    storageBackend: blob.storageProfile.storageBackend,
    objectStoreBucket: blob.storageProfile.objectStore?.bucketOrContainer,
    objectStoreRegion: blob.storageProfile.objectStore?.region,
    objectStoreKey: blob.storageProfile.objectStore?.key,
    objectStoreUri: blob.storageProfile.objectStore?.uri,
    objectStoreVersion: blob.storageProfile.objectStore?.version,
  };
}

function deletionCandidateObjectPointer(
  candidate: InvoiceArtifactBlobDeletionCandidate,
): InvoiceArtifactObjectPointer {
  return {
    storageBackend: candidate.storageBackend,
    objectStoreBucket: candidate.objectStoreBucket,
    objectStoreRegion: candidate.objectStoreRegion,
    objectStoreKey: candidate.objectStoreKey,
    objectStoreUri: candidate.objectStoreUri,
    objectStoreVersion: candidate.objectStoreVersion,
  };
}

function invoiceGradeArtifactsFromEvidence(
  evidence: Record<string, unknown>,
): InvoiceGradeArtifactRecord[] {
  const register = recordValue(evidence.invoiceGradeArtifactRegister);

  return arrayValue(register.artifacts)
    .map((artifact) => recordValue(artifact))
    .filter((artifact) => typeof artifact.id === 'string')
    .filter((artifact) => typeof artifact.type === 'string')
    .filter((artifact) => typeof artifact.displayName === 'string')
    .filter((artifact) => typeof artifact.reference === 'string')
    .filter((artifact) => typeof artifact.provider === 'string')
    .map((artifact) => artifact as unknown as InvoiceGradeArtifactRecord);
}

function invoiceGradeArtifactRegister(
  artifacts: InvoiceGradeArtifactRecord[],
  reconciliation: InvoiceReconciliationRecord,
): Record<string, unknown> {
  const registeredCount = artifacts.length;
  const verifiedCount = artifacts.filter(
    (artifact) => artifact.verificationStatus === 'verified',
  ).length;
  const artifactCountsByType = artifacts.reduce<Record<string, number>>((counts, artifact) => {
    counts[artifact.type] = (counts[artifact.type] ?? 0) + 1;

    return counts;
  }, {});
  const coverage = Object.entries(INVOICE_GRADE_ARTIFACT_CHECK_COVERAGE).map(
    ([readinessCheckId, acceptedTypes]) => {
      const matchingArtifacts = artifacts.filter((artifact) =>
        acceptedTypes.some((acceptedType) => artifactCoversAcceptedType(artifact, acceptedType)),
      );
      const matchingVerifiedArtifacts = matchingArtifacts.filter(
        (artifact) => artifact.verificationStatus === 'verified',
      );
      const verifiedArtifactTypes = [
        ...new Set(
          matchingVerifiedArtifacts.flatMap((artifact) =>
            acceptedTypes.filter((acceptedType) =>
              artifactVerifiesAcceptedType(artifact, acceptedType),
            ),
          ),
        ),
      ];

      return {
        readinessCheckId,
        acceptedArtifactTypes: acceptedTypes,
        verifiedArtifactTypes,
        missingAcceptedArtifactTypes: acceptedTypes.filter(
          (type) => !verifiedArtifactTypes.includes(type),
        ),
        registeredCount: matchingArtifacts.length,
        verifiedCount: matchingVerifiedArtifacts.length,
        status:
          matchingVerifiedArtifacts.length > 0
            ? 'verified-artifact-present'
            : matchingArtifacts.length > 0
              ? 'metadata-registered-not-verified'
              : 'missing',
        registeredArtifacts: matchingArtifacts.map((artifact) => ({
          id: artifact.id,
          type: artifact.type,
          displayName: artifact.displayName,
          verificationStatus: artifact.verificationStatus,
        })),
      };
    },
  );
  const controlTotalDeltas = artifacts
    .filter(
      (artifact) =>
        typeof artifact.controlTotalUsd === 'number' ||
        typeof artifact.verificationControlTotalUsd === 'number',
    )
    .map((artifact) => ({
      artifactId: artifact.id,
      artifactType: artifact.type,
      controlTotalUsd: artifact.controlTotalUsd,
      verificationControlTotalUsd: artifact.verificationControlTotalUsd,
      reconciliationInvoicedTotalUsd: reconciliation.invoicedTotalUsd,
      deltaUsd: roundCurrency(
        (artifact.verificationControlTotalUsd ?? artifact.controlTotalUsd ?? 0) -
          reconciliation.invoicedTotalUsd,
      ),
    }));

  return {
    status:
      registeredCount === 0
        ? 'no-artifacts-registered'
        : verifiedCount > 0
          ? 'registered-with-verified-artifacts'
          : 'metadata-registered-not-verified',
    provider: reconciliation.provider,
    registeredCount,
    verifiedCount,
    artifactCountsByType,
    coverage,
    artifacts,
    controlTotalDeltas,
    caveats: [
      'Artifact metadata is registered for traceability only; files, contracts, and invoice controls are not verified by PolyCost yet.',
      'Invoice-grade status remains blocked until provider invoice controls, private pricing, tax, commitment, and allocation evidence are independently verified.',
    ],
  };
}

function artifactCoversAcceptedType(
  artifact: InvoiceGradeArtifactRecord,
  acceptedType: InvoiceGradeArtifactType,
): boolean {
  if (artifact.type === acceptedType) {
    return true;
  }

  return acceptedType === 'control-total' && typeof artifact.controlTotalUsd === 'number';
}

function artifactVerifiesAcceptedType(
  artifact: InvoiceGradeArtifactRecord,
  acceptedType: InvoiceGradeArtifactType,
): boolean {
  if (artifact.verificationStatus !== 'verified') {
    return false;
  }

  if (artifact.type === acceptedType) {
    return true;
  }

  return (
    acceptedType === 'control-total' && typeof artifact.verificationControlTotalUsd === 'number'
  );
}

function annotateInvoiceGradeReadinessWithArtifacts(
  readinessValue: unknown,
  register: Record<string, unknown>,
): Record<string, unknown> {
  const readiness = recordValue(readinessValue);
  const coverage = arrayValue(register.coverage).map((item) => recordValue(item));
  const checks = arrayValue(readiness.checks).map((checkValue) => {
    const check = recordValue(checkValue);
    const checkId = typeof check.id === 'string' ? check.id : '';
    const currentStatus = invoiceGradeReadinessStatus(check.status);
    const matchingCoverage = coverage.find(
      (coverageItem) => coverageItem.readinessCheckId === checkId,
    );

    if (!matchingCoverage) {
      return check;
    }

    const nextStatus = invoiceGradeReadinessStatusWithArtifacts(currentStatus, matchingCoverage);

    return {
      ...check,
      status: nextStatus,
      artifactRegisterStatus: matchingCoverage.status,
      registeredArtifactCount: matchingCoverage.registeredCount,
      verifiedArtifactCount: matchingCoverage.verifiedCount,
      verifiedArtifactTypes: matchingCoverage.verifiedArtifactTypes,
      missingAcceptedArtifactTypes: matchingCoverage.missingAcceptedArtifactTypes,
      registeredArtifacts: matchingCoverage.registeredArtifacts,
    };
  });
  const presentCount = checks.filter((check) => check.status === 'present').length;
  const partialCount = checks.filter((check) => check.status === 'partial').length;
  const missingCount = checks.filter((check) => check.status === 'missing').length;
  const notApplicableCount = checks.filter((check) => check.status === 'not-applicable').length;
  const blockingChecks = checks.filter((check) => check.status === 'missing');

  return {
    ...readiness,
    status: blockingChecks.length > 0 ? 'invoice-grade-blocked' : 'invoice-grade-review-ready',
    presentCount,
    partialCount,
    missingCount,
    notApplicableCount,
    blockers: blockingChecks
      .map((check) => (typeof check.label === 'string' ? check.label : undefined))
      .filter((label): label is string => Boolean(label)),
    requiredArtifacts: [
      ...new Set(
        blockingChecks
          .map((check) =>
            typeof check.requiredArtifact === 'string' ? check.requiredArtifact : undefined,
          )
          .filter((artifact): artifact is string => Boolean(artifact)),
      ),
    ],
    artifactRegisterStatus: register.status,
    registeredArtifactCount: register.registeredCount,
    verifiedArtifactCount: register.verifiedCount,
    checks,
  };
}

function invoiceGradeReadinessStatus(value: unknown): InvoiceGradeReadinessCheckStatus {
  if (
    value === 'present' ||
    value === 'partial' ||
    value === 'missing' ||
    value === 'not-applicable'
  ) {
    return value;
  }

  return 'missing';
}

function invoiceGradeReadinessStatusWithArtifacts(
  currentStatus: InvoiceGradeReadinessCheckStatus,
  coverage: Record<string, unknown>,
): InvoiceGradeReadinessCheckStatus {
  if (currentStatus === 'present' || currentStatus === 'not-applicable') {
    return currentStatus;
  }

  if (numberFromUnknown(coverage.verifiedCount) === 0) {
    return currentStatus;
  }

  const missingAcceptedArtifactTypes = stringArray(coverage.missingAcceptedArtifactTypes);

  if (missingAcceptedArtifactTypes.length === 0) {
    return 'present';
  }

  return 'partial';
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberFromUnknown(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function lineItemAdjustmentClassification(lineItem: {
  serviceName: string;
  skuId?: string;
  costUsd: number;
  rawPayload?: Record<string, unknown>;
}): InvoiceAdjustmentClassification {
  const metadata = lineItem.rawPayload?._polycost;

  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const classification = (metadata as Record<string, unknown>).invoiceAdjustmentClassification;

    if (classification && typeof classification === 'object' && !Array.isArray(classification)) {
      const record = classification as Record<string, unknown>;
      const category = record.category;
      const reason = record.reason;

      if (isInvoiceAdjustmentCategory(category) && typeof reason === 'string') {
        const explicitIsAdjustment =
          typeof record.isAdjustment === 'boolean' ? record.isAdjustment : undefined;
        const sourceSignals = Array.isArray(record.sourceSignals)
          ? record.sourceSignals.filter((signal): signal is string => typeof signal === 'string')
          : [];
        const commitmentEvidence =
          commitmentEvidenceFromUnknown(record.commitmentEvidence) ??
          (isCommitmentInvoiceCategory(category)
            ? commitmentEvidenceForCategory(
                category,
                sourceSignals,
                sourceSignals.join(' ').toLowerCase(),
              )
            : undefined);

        return {
          category,
          isAdjustment: explicitIsAdjustment ?? !isEstimateComparableInvoiceCategory(category),
          reason,
          sourceSignals,
          ...(commitmentEvidence ? { commitmentEvidence } : {}),
        };
      }
    }
  }

  return classifyInvoiceAdjustment({
    row: lineItem.rawPayload ?? {},
    serviceName: lineItem.serviceName,
    skuId: lineItem.skuId,
    costUsd: lineItem.costUsd,
  });
}

function isInvoiceAdjustmentCategory(value: unknown): value is InvoiceAdjustmentCategory {
  return (
    value === 'usage' ||
    value === 'credit' ||
    value === 'discount' ||
    value === 'tax' ||
    value === 'support' ||
    value === 'marketplace' ||
    value === 'refund' ||
    value === 'enterprise-adjustment' ||
    value === 'commitment-covered-usage' ||
    value === 'commitment-discount' ||
    value === 'commitment-fee' ||
    value === 'commitment-amortization' ||
    value === 'fee' ||
    value === 'unknown'
  );
}

function isEstimateComparableInvoiceCategory(category: InvoiceAdjustmentCategory): boolean {
  return category === 'usage' || category === 'commitment-covered-usage';
}

function isCommitmentInvoiceCategory(
  category: InvoiceAdjustmentCategory,
): category is
  | 'commitment-covered-usage'
  | 'commitment-discount'
  | 'commitment-fee'
  | 'commitment-amortization' {
  return (
    category === 'commitment-covered-usage' ||
    category === 'commitment-discount' ||
    category === 'commitment-fee' ||
    category === 'commitment-amortization'
  );
}

function commitmentEvidenceFromUnknown(value: unknown): InvoiceCommitmentEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind;
  const treatment = record.treatment;

  if (!isInvoiceCommitmentKind(kind) || !isInvoiceCommitmentTreatment(treatment)) {
    return undefined;
  }

  return {
    kind,
    treatment,
    requiresProviderInventory: record.requiresProviderInventory === true,
    requiresAmortizationPeriod: record.requiresAmortizationPeriod === true,
    requiresAllocationEvidence: record.requiresAllocationEvidence === true,
    evidenceSignals: stringArray(record.evidenceSignals),
    caveats: stringArray(record.caveats),
  };
}

function isInvoiceCommitmentKind(value: unknown): value is InvoiceCommitmentKind {
  return (
    value === 'savings-plan' ||
    value === 'reserved-capacity' ||
    value === 'committed-use' ||
    value === 'sustained-use' ||
    value === 'benefit' ||
    value === 'unknown'
  );
}

function isInvoiceCommitmentTreatment(value: unknown): value is InvoiceCommitmentTreatment {
  return (
    value === 'covered-usage' ||
    value === 'discount' ||
    value === 'fee' ||
    value === 'amortization' ||
    value === 'unused'
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function sourceRowFingerprint(rawPayload: Record<string, unknown> | undefined): string | undefined {
  const metadata = rawPayload?._polycost;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  const fingerprint = (metadata as Record<string, unknown>).sourceRowFingerprint;

  return typeof fingerprint === 'string' ? fingerprint : undefined;
}

function sourceMissingFields(rawPayload: Record<string, unknown> | undefined): string[] {
  const metadata = rawPayload?._polycost;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }

  const fields = (metadata as Record<string, unknown>).missingRecommendedFields;

  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === 'string')
    : [];
}

function invoiceEvidenceReadiness(
  coverage: {
    rowCount: number;
    rowsWithSourceFingerprint: number;
    skuMatchCount: number;
    serviceMatchCount: number;
  },
  missingRecommendedFields: string[],
): 'audit-ready-with-caveats' | 'reconciled-evidence-ready' | 'reconciliation-foundation' {
  if (coverage.rowCount === 0 || coverage.rowsWithSourceFingerprint === 0) {
    return 'reconciliation-foundation';
  }

  if (missingRecommendedFields.length === 0 && coverage.skuMatchCount > 0) {
    return 'audit-ready-with-caveats';
  }

  if (coverage.skuMatchCount > 0 || coverage.serviceMatchCount > 0) {
    return 'reconciled-evidence-ready';
  }

  return 'reconciliation-foundation';
}

function invoiceEvidenceCaveats(
  coverage: {
    rowsWithSourceFingerprint: number;
    skuMatchCount: number;
    serviceMatchCount: number;
  },
  missingRecommendedFields: string[],
  adjustmentLineItemCount: number,
  commitmentLineItemCount: number,
  commitmentRowsRequiringAmortizationPeriod: number,
): string[] {
  const caveats: string[] = [
    'Reconciliation compares provider-export actuals with PolyCost estimate evidence; it is not an invoice-of-record.',
  ];

  if (commitmentLineItemCount > 0) {
    caveats.push(
      `${commitmentLineItemCount} commitment, reservation, or savings-plan row(s) were classified separately; amortization remains provider-specific evidence.`,
    );
  }

  if (commitmentRowsRequiringAmortizationPeriod > 0) {
    caveats.push(
      `${commitmentRowsRequiringAmortizationPeriod} commitment row(s) require amortization-period and unused-commitment allocation proof from provider/account inventory.`,
    );
  }

  if (adjustmentLineItemCount > 0) {
    caveats.push(
      `${adjustmentLineItemCount} non-usage invoice adjustment row(s) were separated from estimate-comparable usage.`,
    );
  }

  if (coverage.rowsWithSourceFingerprint === 0) {
    caveats.push('No provider source-row fingerprints were available for imported rows.');
  }

  if (coverage.skuMatchCount === 0 && coverage.serviceMatchCount === 0) {
    caveats.push('No direct SKU or service-name match was found against comparison line items.');
  }

  if (missingRecommendedFields.length > 0) {
    caveats.push(
      `Provider export is missing recommended fields: ${missingRecommendedFields.join(', ')}.`,
    );
  }

  return caveats;
}

function percentOf(value: number, total: number): number {
  return total === 0 ? 0 : roundPercent((value / total) * 100);
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

function sha256Buffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
