import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { ApiValidationError } from './api-errors';
import { InvoiceArtifactGovernanceService } from './invoice-artifact-governance.service';

describe('InvoiceArtifactGovernanceService', () => {
  it('reports local database storage as not production ready', () => {
    const service = new InvoiceArtifactGovernanceService(configService());

    expect(service.storageReadiness()).toMatchObject({
      storageBackend: 'database-bytea',
      scannerMode: 'eicar-signature-only',
      retentionEnforcementMode: 'report-only',
      credentialSource: 'database-connection',
      productionReady: false,
      gaps: expect.arrayContaining([
        'database-bytea keeps artifact bytes in Postgres and is not invoice-grade storage',
        'malware scanning is limited to the local EICAR signature hook',
        'retention enforcement is report-only and will not purge expired artifacts',
      ]),
    });
  });

  it('reports production artifact controls as ready when object storage, KMS, scanner, and retention are configured', () => {
    const service = new InvoiceArtifactGovernanceService(
      configService({
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
        INVOICE_ARTIFACT_OBJECT_STORE_NAME: 'polycost-invoice-artifacts',
        INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
        INVOICE_ARTIFACT_OBJECT_STORE_PREFIX: 'invoice-artifacts',
        INVOICE_ARTIFACT_KMS_KEY_REFERENCE: 'arn:aws:kms:us-east-1:111122223333:key/demo',
        INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: 'http-webhook',
        INVOICE_ARTIFACT_MALWARE_SCANNER_URL: 'https://scanner.example.com/polycost/artifacts',
        INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET: 'production-scanner-webhook-secret',
        INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE: 'delete-expired',
        INVOICE_EVIDENCE_WORM_RETENTION_MODE: 'provider-object-lock',
        INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE: 'provider-control-plane',
        INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE:
          's3://polycost-invoice-artifacts/object-lock-proof.json',
        INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256: 'b'.repeat(64),
      }),
    );

    expect(service.storageReadiness()).toEqual({
      storageBackend: 'aws-s3',
      scannerMode: 'http-webhook',
      retentionEnforcementMode: 'delete-expired',
      productionReady: true,
      credentialSource: 'vault-or-workload-identity',
      objectStore: {
        bucketOrContainer: 'polycost-invoice-artifacts',
        prefix: 'invoice-artifacts',
        region: 'us-east-1',
      },
      kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
      providerRetentionProofMode: 'provider-control-plane',
      providerRetentionProofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
      providerRetentionProofSha256: 'b'.repeat(64),
      gaps: [],
    });
  });

  it('records provider control-plane retention proof when digest and reference are configured', async () => {
    const content = Buffer.from('invoice artifact bytes');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const service = new InvoiceArtifactGovernanceService(
      configService({
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
        INVOICE_ARTIFACT_OBJECT_STORE_NAME: 'polycost-invoice-artifacts',
        INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
        INVOICE_ARTIFACT_OBJECT_STORE_PREFIX: 'invoice-artifacts',
        INVOICE_ARTIFACT_KMS_KEY_REFERENCE: 'arn:aws:kms:us-east-1:111122223333:key/demo',
        INVOICE_EVIDENCE_WORM_RETENTION_MODE: 'provider-object-lock',
        INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE: 'provider-control-plane',
        INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE:
          's3://polycost-invoice-artifacts/object-lock-proof.json',
        INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256: 'c'.repeat(64),
      }),
    );

    await expect(
      service.buildGovernance(
        {
          fileName: 'invoice.txt',
          mimeType: 'text/plain',
          content: 'ignored',
          encoding: 'text',
          retentionDays: 400,
        },
        content,
        sha256,
        '2026-07-08T00:00:00.000Z',
      ),
    ).resolves.toMatchObject({
      providerRetentionProof: {
        schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
        status: 'provider-verified',
        evidenceSource: 'provider-control-plane',
        storageBackend: 'aws-s3',
        retentionMode: 'provider-object-lock',
        retentionUntil: '2027-08-12T00:00:00.000Z',
        proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
        proofDigestSha256: 'c'.repeat(64),
        objectStore: {
          bucketOrContainer: 'polycost-invoice-artifacts',
          prefix: 'invoice-artifacts',
          region: 'us-east-1',
        },
        caveats: [],
      },
    });
  });

  it('blocks EICAR test content before governance is returned', async () => {
    const service = new InvoiceArtifactGovernanceService(configService());

    await expect(
      service.buildGovernance(
        {
          fileName: 'eicar.txt',
          mimeType: 'text/plain',
          content: 'ignored',
          encoding: 'text',
        },
        Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
        'd'.repeat(64),
        '2026-07-08T00:00:00.000Z',
      ),
    ).rejects.toThrow(ApiValidationError);
  });

  it('calls the signed scanner webhook when configured', async () => {
    const content = Buffer.from('invoice artifact bytes');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const fetcher = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          status: 'passed',
          scanner: 'clamav-gateway',
          findings: ['clean'],
        }),
    }));
    const service = new InvoiceArtifactGovernanceService(
      configService({
        INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: 'http-webhook',
        INVOICE_ARTIFACT_MALWARE_SCANNER_URL: 'https://scanner.example.com/polycost/artifacts',
        INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET: 'production-scanner-webhook-secret',
      }),
      fetcher,
    );

    await expect(
      service.buildGovernance(
        {
          fileName: 'invoice.txt',
          mimeType: 'text/plain',
          content: 'ignored',
          encoding: 'text',
          retentionDays: 30,
        },
        content,
        sha256,
        '2026-07-08T00:00:00.000Z',
      ),
    ).resolves.toMatchObject({
      retentionPolicy: {
        retentionDays: 30,
        retentionUntil: '2026-08-07T00:00:00.000Z',
      },
      malwareScan: {
        status: 'passed',
        scanner: 'clamav-gateway',
        findings: ['clean'],
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://scanner.example.com/polycost/artifacts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-polycost-artifact-signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
        }),
        body: expect.stringContaining('"contentBase64"'),
      }),
    );
  });

  it('rejects webhook scanner failures', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          status: 'failed',
          scanner: 'clamav-gateway',
          findings: ['malware signature found'],
        }),
    }));
    const service = new InvoiceArtifactGovernanceService(
      configService({
        INVOICE_ARTIFACT_MALWARE_SCANNER_MODE: 'http-webhook',
        INVOICE_ARTIFACT_MALWARE_SCANNER_URL: 'https://scanner.example.com/polycost/artifacts',
        INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET: 'production-scanner-webhook-secret',
      }),
      fetcher,
    );

    await expect(
      service.buildGovernance(
        {
          fileName: 'invoice.txt',
          mimeType: 'text/plain',
          content: 'ignored',
          encoding: 'text',
        },
        Buffer.from('invoice artifact bytes'),
        'd'.repeat(64),
        '2026-07-08T00:00:00.000Z',
      ),
    ).rejects.toThrow(ApiValidationError);
  });
});

function configService(overrides: Partial<AppConfig> = {}): ConfigService<AppConfig, true> {
  const overrideMap = new Map(Object.entries(overrides));

  return {
    get: jest.fn((key: keyof AppConfig) => overrideMap.get(key)),
  } as unknown as ConfigService<AppConfig, true>;
}
