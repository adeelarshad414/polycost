import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { AuthIdentity } from './auth.types';
import { InvoiceEvidencePacketResponse } from './billing.types';
import { InvoiceEvidenceNotaryService } from './invoice-evidence-notary.service';

describe('InvoiceEvidenceNotaryService', () => {
  it('skips local and metadata-only modes without calling the webhook', async () => {
    const fetcher = jest.fn();
    const service = new InvoiceEvidenceNotaryService(configService({}), fetcher);

    const result = await service.deliverPacket({
      packet: evidencePacket(),
      identity,
      teamId: identity.teamId,
    });

    expect(result).toEqual({
      status: 'skipped',
      mode: 'disabled',
      message: 'External invoice evidence notary webhook mode is not enabled.',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends a signed external handoff request without leaking the signing secret', async () => {
    const fetcher = jest.fn(async () => new Response('', { status: 202 }));
    const service = new InvoiceEvidenceNotaryService(
      configService({
        INVOICE_EVIDENCE_RECEIPT_MODE: 'external-webhook',
        INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE:
          'arn:aws:kms:us-east-1:111122223333:alias/polycost-evidence-receipts',
        INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: 'production-evidence-receipt-signing-secret',
        INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL: 'https://worm.example.com/polycost/evidence-receipts',
      }),
      fetcher,
      () => new Date('2026-07-09T10:00:00.000Z'),
    );

    const result = await service.deliverPacket({
      packet: evidencePacket(),
      identity,
      teamId: identity.teamId,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(init.body);
    const headers = init.headers as Record<string, string>;

    expect(url).toBe('https://worm.example.com/polycost/evidence-receipts');
    expect(init.method).toBe('POST');
    expect(headers['x-polycost-event']).toBe('invoice_evidence_packet.exported');
    expect(headers['x-polycost-packet-digest-sha256']).toBe('d'.repeat(64));
    expect(headers['x-polycost-base-payload-digest-sha256']).toBe('b'.repeat(64));
    expect(headers['x-polycost-signing-key-reference']).toBe(
      'arn:aws:kms:us-east-1:111122223333:alias/polycost-evidence-receipts',
    );
    expect(headers['x-polycost-signature-sha256']).toBe(
      createHmac('sha256', 'production-evidence-receipt-signing-secret').update(body).digest('hex'),
    );
    expect(JSON.parse(body)).toMatchObject({
      schemaVersion: 'invoice-evidence-notary-handoff/v1',
      event: 'invoice_evidence_packet.exported',
      exportedAt: '2026-07-09T10:00:00.000Z',
      packetDigestSha256: 'd'.repeat(64),
      basePayloadDigestSha256: 'b'.repeat(64),
      actor: {
        accountId: identity.accountId,
        email: identity.email,
        teamId: identity.teamId,
      },
    });
    expect(body).not.toContain('production-evidence-receipt-signing-secret');
    expect(result).toMatchObject({
      status: 'accepted',
      mode: 'external-webhook',
      attemptedAt: '2026-07-09T10:00:00.000Z',
      urlHost: 'worm.example.com',
      urlSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      acceptedSubjectDigestSha256: 'b'.repeat(64),
      responseStatusCode: 202,
    });
  });

  it('returns failed evidence without exposing receiver response content', async () => {
    const fetcher = jest.fn(async () => new Response('receiver stack trace', { status: 503 }));
    const service = new InvoiceEvidenceNotaryService(
      configService({
        INVOICE_EVIDENCE_RECEIPT_MODE: 'external-webhook',
        INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: 'production-evidence-receipt-signing-secret',
        INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL: 'https://worm.example.com/polycost/evidence-receipts',
      }),
      fetcher,
      () => new Date('2026-07-09T10:00:00.000Z'),
    );

    const result = await service.deliverPacket({
      packet: evidencePacket(),
      identity,
      teamId: identity.teamId,
    });

    expect(result).toMatchObject({
      status: 'failed',
      mode: 'external-webhook',
      responseStatusCode: 503,
      message: 'External invoice evidence notary webhook returned HTTP 503.',
    });
    expect(JSON.stringify(result)).not.toContain('receiver stack trace');
  });
});

const identity: AuthIdentity = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'architect@example.com',
  displayName: 'Architect',
  teamId: '22222222-2222-4222-8222-222222222222',
  role: 'owner',
  sessionId: '33333333-3333-4333-8333-333333333333',
  expiresAt: '2026-07-09T12:00:00.000Z',
};

function evidencePacket(): InvoiceEvidencePacketResponse {
  return {
    packetVersion: 'invoice-evidence-packet/v1',
    packetStatus: 'review-ready',
    generatedAt: '2026-07-09T09:00:00.000Z',
    integrity: {
      schemaVersion: 'invoice-evidence-packet-integrity/v1',
      canonicalization: 'stable-json:v1',
      digestAlgorithm: 'sha256',
      payloadDigestSha256: 'd'.repeat(64),
      payloadByteLength: 1000,
      subject: {
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: '44444444-4444-4444-8444-444444444444',
        provider: 'aws',
      },
      artifactCount: 0,
      storedArtifactCount: 0,
      verifiedArtifactCount: 0,
      caveatCount: 0,
      disclaimerCount: 1,
      generatedAt: '2026-07-09T09:00:00.000Z',
    },
    reconciliation: {
      id: '66666666-6666-4666-8666-666666666666',
      importRunId: '55555555-5555-4555-8555-555555555555',
      comparisonId: '44444444-4444-4444-8444-444444444444',
      provider: 'aws',
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      createdAt: '2026-07-09T09:00:00.000Z',
    },
    importRun: {
      id: '55555555-5555-4555-8555-555555555555',
      provider: 'aws',
      sourceType: 'aws-cur',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-06-30',
      originalFileSha256: 'a'.repeat(64),
      rowsAccepted: 1,
      rowsRejected: 0,
      totalCostUsd: 107,
      createdAt: '2026-07-09T09:00:00.000Z',
    },
    readiness: {},
    matchSummary: {},
    artifactRegister: {},
    artifactGovernance: {
      schemaVersion: 'invoice-evidence-governance/v1',
      generatedAt: '2026-07-09T09:00:00.000Z',
      storageReadiness: {
        storageBackend: 'database-bytea',
        scannerMode: 'eicar-signature-only',
        retentionEnforcementMode: 'report-only',
        productionReady: false,
        credentialSource: 'database-connection',
        providerRetentionProofMode: 'not-configured',
        gaps: [],
      },
      accessControls: {
        requiresBillingAdmin: true,
        teamScoped: true,
        rawArtifactBytesExcluded: true,
        packetExportAuditAction: 'billing.reconciliation.evidence_packet_exported',
        artifactDownloadAuditAction: 'billing.reconciliation.artifact_blob_downloaded',
        verifierCommand: 'npm run invoice:evidence:verify -- <packet.json>',
      },
      storagePosture: {
        storageBackends: [],
        storedArtifactCount: 0,
        governanceManifestCount: 0,
        databaseStoredCount: 0,
        externalObjectStoreCount: 0,
        customerManagedKmsCount: 0,
        missingKmsCount: 0,
        retentionPolicyCount: 0,
        expiredRetentionCount: 0,
        legalHoldCount: 0,
        providerRetentionProofMissingCount: 0,
        providerRetentionProofDeclaredCount: 0,
        providerRetentionProofVerifiedCount: 0,
        providerRetentionProofNotApplicableCount: 0,
        malwareScanPassedCount: 0,
        malwareScanFailedCount: 0,
        malwareScannerEngines: [],
      },
      productionGates: {
        packetIntegrityReady: true,
        auditTrailReady: true,
        externalObjectStorageReady: false,
        customerManagedKmsReady: false,
        malwareScanningReady: false,
        retentionPolicyReady: false,
        retentionDeletionReady: false,
        providerRetentionProofReady: false,
      },
      gaps: [],
    },
    receipt: {
      schemaVersion: 'invoice-evidence-receipt/v1',
      mode: 'external-webhook',
      status: 'external-notary-ready',
      issuedAt: '2026-07-09T09:00:00.000Z',
      subject: {
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: '44444444-4444-4444-8444-444444444444',
        provider: 'aws',
      },
      basePayloadDigestSha256: 'b'.repeat(64),
      basePayloadByteLength: 900,
      signature: {
        algorithm: 'hmac-sha256',
        keyReference: 'arn:aws:kms:us-east-1:111122223333:alias/polycost-evidence-receipts',
        signedPayloadDigestSha256: 'c'.repeat(64),
        signature: 'e'.repeat(64),
        signedFields: ['basePayloadDigestSha256'],
      },
      notary: {
        deliveryMode: 'operator-forwarded-webhook',
        urlHost: 'worm.example.com',
        urlSha256: 'f'.repeat(64),
        deliveryEvidence: 'not-sent-by-api',
      },
      wormReadiness: {
        retentionMode: 'external-worm-receiver',
        configured: true,
        objectStorageConfigured: true,
        customerManagedKmsConfigured: true,
        scannerWebhookConfigured: true,
        retentionDeleteExpiredConfigured: true,
        auditExportWebhookConfigured: true,
        signedReceiptConfigured: true,
        gaps: [],
      },
      caveats: [],
    },
    artifacts: [],
    controls: {
      registeredCount: 0,
      verifiedCount: 0,
      storedCount: 0,
      reviewApprovedCount: 0,
      policyExceptionApprovedCount: 0,
      policyExceptionExpiredCount: 0,
      invoiceControlMatchedCount: 0,
      invoiceControlVarianceWarningCount: 0,
      invoiceControlMismatchCount: 0,
      invoiceControlNotRunCount: 0,
    },
    caveats: [],
    disclaimers: ['Full invoice-grade billing still requires provider invoice review.'],
  };
}

function configService(overrides: Partial<AppConfig>): ConfigService<AppConfig, true> {
  const values = new Map<keyof AppConfig, unknown>(
    Object.entries(overrides) as Array<[keyof AppConfig, unknown]>,
  );

  return {
    get: jest.fn((key: keyof AppConfig) => values.get(key)),
  } as unknown as ConfigService<AppConfig, true>;
}
