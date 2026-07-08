import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FetchLike, defaultFetch } from '../adapters/common/http-client';
import { AppConfig } from '../config/config.schema';
import { ApiValidationError } from './api-errors';
import {
  InvoiceArtifactBlobGovernance,
  InvoiceArtifactBlobUploadInput,
  InvoiceArtifactMalwareScannerMode,
  InvoiceArtifactRetentionEnforcementMode,
  InvoiceArtifactStorageBackend,
  InvoiceArtifactStorageReadiness,
} from './billing.types';

const EICAR_TEST_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';
const DEFAULT_INVOICE_ARTIFACT_RETENTION_DAYS = 365;
const MAX_SCANNER_FINDING_LENGTH = 400;

interface ArtifactScanInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
  contentSha256: string;
  checkedAt: string;
}

interface ScannerWebhookResponse {
  status?: unknown;
  verdict?: unknown;
  scanner?: unknown;
  findings?: unknown;
}

@Injectable()
export class InvoiceArtifactGovernanceService {
  constructor(
    private readonly configService?: ConfigService<AppConfig, true>,
    private readonly fetcher: FetchLike = defaultFetch,
  ) {}

  storageReadiness(): InvoiceArtifactStorageReadiness {
    const storageBackend = this.storageBackend();
    const scannerMode = this.scannerMode();
    const retentionEnforcementMode = this.retentionEnforcementMode();
    const objectStore = this.objectStore();
    const kmsKeyReference = this.optionalConfig('INVOICE_ARTIFACT_KMS_KEY_REFERENCE');
    const gaps: string[] = [];

    if (storageBackend === 'database-bytea') {
      gaps.push('database-bytea keeps artifact bytes in Postgres and is not invoice-grade storage');
    } else {
      if (!objectStore?.bucketOrContainer) {
        gaps.push('external object storage bucket/container is not configured');
      }
      if (!objectStore?.region) {
        gaps.push('external object storage region is not configured');
      }
    }

    if (!kmsKeyReference) {
      gaps.push('customer-managed KMS key reference is not configured');
    }

    if (scannerMode !== 'http-webhook') {
      gaps.push('malware scanning is limited to the local EICAR signature hook');
    } else {
      if (!this.optionalConfig('INVOICE_ARTIFACT_MALWARE_SCANNER_URL')) {
        gaps.push('scanner webhook URL is not configured');
      }
      if (!this.optionalConfig('INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET')) {
        gaps.push('scanner webhook signing secret is not configured');
      }
    }

    if (retentionEnforcementMode !== 'delete-expired') {
      gaps.push('retention enforcement is report-only and will not purge expired artifacts');
    }

    return {
      storageBackend,
      scannerMode,
      retentionEnforcementMode,
      productionReady: gaps.length === 0,
      credentialSource:
        storageBackend === 'database-bytea' ? 'database-connection' : 'vault-or-workload-identity',
      ...(objectStore ? { objectStore } : {}),
      ...(kmsKeyReference ? { kmsKeyReference } : {}),
      gaps,
    };
  }

  retentionMode(): InvoiceArtifactRetentionEnforcementMode {
    return this.retentionEnforcementMode();
  }

  async buildGovernance(
    input: InvoiceArtifactBlobUploadInput,
    content: Buffer,
    contentSha256: string,
    uploadedAt: string,
  ): Promise<InvoiceArtifactBlobGovernance> {
    const readiness = this.storageReadiness();
    const scan = await this.scanArtifact({
      fileName: input.fileName,
      mimeType: input.mimeType,
      content,
      contentSha256,
      checkedAt: uploadedAt,
    });
    const retentionDays = input.retentionDays ?? DEFAULT_INVOICE_ARTIFACT_RETENTION_DAYS;
    const retentionUntil = addDays(uploadedAt, retentionDays);
    const kmsKeyReference =
      input.kmsKeyReference ?? this.optionalConfig('INVOICE_ARTIFACT_KMS_KEY_REFERENCE');

    return {
      storageProfile: {
        storageBackend: readiness.storageBackend,
        encryptionStatus:
          readiness.storageBackend === 'database-bytea'
            ? 'database-managed'
            : 'customer-managed-kms',
        ...(readiness.objectStore ? { objectStore: readiness.objectStore } : {}),
        ...(kmsKeyReference ? { kmsKeyReference } : {}),
        kmsKeyRequiredForProduction: !kmsKeyReference,
      },
      retentionPolicy: {
        retentionUntil,
        retentionDays,
        legalHold: input.legalHold ?? false,
      },
      malwareScan: scan,
    };
  }

  private async scanArtifact(
    input: ArtifactScanInput,
  ): Promise<InvoiceArtifactBlobGovernance['malwareScan']> {
    const scannerMode = this.scannerMode();

    if (scannerMode === 'eicar-signature-only') {
      assertEicarScanPassed(input.content);

      return {
        status: 'passed',
        scanner: 'polycost-eicar-signature-v1',
        checkedAt: input.checkedAt,
        findings: [],
      };
    }

    return this.scanWithWebhook(input);
  }

  private async scanWithWebhook(
    input: ArtifactScanInput,
  ): Promise<InvoiceArtifactBlobGovernance['malwareScan']> {
    const url = this.optionalConfig('INVOICE_ARTIFACT_MALWARE_SCANNER_URL');
    const secret = this.optionalConfig('INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET');

    if (!url || !secret) {
      throw new ApiValidationError('invoice artifact malware scanner is not configured', [
        {
          field: 'content',
          issue: 'webhook scanner mode requires a scanner URL and signing secret',
        },
      ]);
    }

    const body = JSON.stringify({
      fileName: input.fileName,
      mimeType: input.mimeType,
      sha256: input.contentSha256,
      contentSizeBytes: input.content.length,
      contentBase64: input.content.toString('base64'),
    });
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    let responseText = '';

    try {
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-polycost-artifact-signature': `sha256=${signature}`,
        },
        body,
      });
      responseText = await response.text();

      if (!response.ok) {
        throw new ApiValidationError('invoice artifact malware scanner rejected the upload', [
          {
            field: 'content',
            issue: `scanner returned HTTP ${response.status}`,
          },
        ]);
      }
    } catch (error) {
      if (error instanceof ApiValidationError) {
        throw error;
      }

      throw new ApiValidationError('invoice artifact malware scanner is unavailable', [
        {
          field: 'content',
          issue: 'scanner webhook could not be reached',
        },
      ]);
    }

    const parsed = parseScannerWebhookResponse(responseText);
    const passed = parsed.status === 'passed' || parsed.verdict === 'clean';
    const failed = parsed.status === 'failed' || parsed.verdict === 'malicious';
    const findings = parseScannerFindings(parsed.findings);

    if (!passed || failed) {
      throw new ApiValidationError('invoice artifact malware scan failed', [
        {
          field: 'content',
          issue: findings[0] ?? 'scanner did not return a clean verdict',
        },
      ]);
    }

    return {
      status: 'passed',
      scanner: parseScannerName(parsed.scanner),
      checkedAt: input.checkedAt,
      findings,
    };
  }

  private storageBackend(): InvoiceArtifactStorageBackend {
    return (
      this.configService?.get('INVOICE_ARTIFACT_STORAGE_BACKEND', { infer: true }) ??
      'database-bytea'
    );
  }

  private scannerMode(): InvoiceArtifactMalwareScannerMode {
    return (
      this.configService?.get('INVOICE_ARTIFACT_MALWARE_SCANNER_MODE', { infer: true }) ??
      'eicar-signature-only'
    );
  }

  private retentionEnforcementMode(): InvoiceArtifactRetentionEnforcementMode {
    return (
      this.configService?.get('INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE', { infer: true }) ??
      'report-only'
    );
  }

  private objectStore(): InvoiceArtifactStorageReadiness['objectStore'] | undefined {
    const bucketOrContainer = this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_NAME');

    if (!bucketOrContainer) {
      return undefined;
    }

    const region = this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_REGION');

    return {
      bucketOrContainer,
      prefix: this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_PREFIX') ?? 'invoice-artifacts',
      ...(region ? { region } : {}),
    };
  }

  private optionalConfig(key: keyof AppConfig): string | undefined {
    const value = this.configService?.get(key, { infer: true });

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}

function assertEicarScanPassed(content: Buffer): void {
  if (!content.toString('utf8').includes(EICAR_TEST_SIGNATURE)) {
    return;
  }

  throw new ApiValidationError('invoice artifact malware scan failed', [
    {
      field: 'content',
      issue: 'blocked by PolyCost artifact scan hook using the EICAR test signature',
    },
  ]);
}

function parseScannerWebhookResponse(body: string): ScannerWebhookResponse {
  try {
    const parsed = JSON.parse(body) as unknown;

    return parsed && typeof parsed === 'object' ? (parsed as ScannerWebhookResponse) : {};
  } catch {
    throw new ApiValidationError('invoice artifact malware scanner returned invalid JSON', [
      {
        field: 'content',
        issue: 'scanner response must be JSON',
      },
    ]);
  }
}

function parseScannerName(value: unknown): string {
  return typeof value === 'string' && value.trim() && !hasControlCharacter(value)
    ? value.trim().slice(0, 120)
    : 'polycost-http-webhook-scanner';
}

function parseScannerFindings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((finding): finding is string => typeof finding === 'string')
    .map((finding) => finding.trim())
    .filter((finding) => finding.length > 0 && !hasControlCharacter(finding))
    .map((finding) => finding.slice(0, MAX_SCANNER_FINDING_LENGTH))
    .slice(0, 10);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);

    return code < 32 || code === 127;
  });
}

function addDays(isoTimestamp: string, days: number): string {
  const date = new Date(isoTimestamp);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString();
}
