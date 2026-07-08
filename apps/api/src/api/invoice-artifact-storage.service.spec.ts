import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { SecretsReader } from '../secrets/secrets.service';
import { InvoiceArtifactBlobGovernance, InvoiceArtifactStorageBackend } from './billing.types';
import { InvoiceArtifactStorageService } from './invoice-artifact-storage.service';

const content = Buffer.from('invoice artifact bytes');

describe('InvoiceArtifactStorageService', () => {
  it('keeps local artifacts inline for database-backed storage', async () => {
    const service = new InvoiceArtifactStorageService(configService());

    await expect(service.store(storeInput('database-bytea'))).resolves.toMatchObject({
      storageBackend: 'database-bytea',
      inlineContent: content,
    });
  });

  it('writes AWS S3 artifacts with SigV4 and KMS headers', async () => {
    const fetcher = jest.fn(async () =>
      okResponse('', { etag: '"aws-etag"', 'x-amz-version-id': 'v1' }),
    );
    const service = new InvoiceArtifactStorageService(
      configService({
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'aws-s3',
        INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
      }),
      secretsReader({
        'polycost/artifacts/aws:access_key_id': 'AKIATEST',
        'polycost/artifacts/aws:secret_access_key': 'aws-secret-key',
      }),
      fetcher,
      () => new Date('2026-07-08T00:00:00.000Z'),
    );

    await expect(service.store(storeInput('aws-s3'))).resolves.toMatchObject({
      storageBackend: 'aws-s3',
      objectStoreBucket: 'polycost-invoice-artifacts',
      objectStoreRegion: 'us-east-1',
      objectStoreUri: expect.stringMatching(/^s3:\/\/polycost-invoice-artifacts\//),
      objectStoreETag: '"aws-etag"',
      objectStoreVersion: 'v1',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/polycost-invoice-artifacts\.s3\.us-east-1\.amazonaws\.com\//,
      ),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          authorization: expect.stringContaining('AWS4-HMAC-SHA256'),
          'x-amz-server-side-encryption': 'aws:kms',
          'x-amz-server-side-encryption-aws-kms-key-id':
            'arn:aws:kms:us-east-1:111122223333:key/demo',
          'x-amz-meta-polycost-sha256': 'd'.repeat(64),
        }),
        body: content,
      }),
    );
  });

  it('writes Azure Blob artifacts through SAS-backed native blob storage', async () => {
    const fetcher = jest.fn(async () =>
      okResponse('', { etag: '"azure-etag"', 'x-ms-version-id': '2' }),
    );
    const service = new InvoiceArtifactStorageService(
      configService({
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'azure-blob',
      }),
      secretsReader({
        'polycost/artifacts/azure:account_name': 'polycostartifacts',
        'polycost/artifacts/azure:sas_token': 'sv=2026&sig=signature',
      }),
      fetcher,
    );

    await expect(service.store(storeInput('azure-blob'))).resolves.toMatchObject({
      storageBackend: 'azure-blob',
      objectStoreBucket: 'polycost-invoice-artifacts',
      objectStoreUri: expect.stringMatching(
        /^azure-blob:\/\/polycostartifacts\/polycost-invoice-artifacts\//,
      ),
      objectStoreETag: '"azure-etag"',
      objectStoreVersion: '2',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/polycostartifacts\.blob\.core\.windows\.net\/polycost-invoice-artifacts\//,
      ),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-meta-polycost-sha256': 'd'.repeat(64),
        }),
        body: content,
      }),
    );
  });

  it('writes GCP Cloud Storage artifacts through the JSON upload API', async () => {
    const fetcher = jest.fn(async () =>
      okResponse(JSON.stringify({ etag: 'gcp-etag', generation: '3' })),
    );
    const service = new InvoiceArtifactStorageService(
      configService({
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'gcp-gcs',
        INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-central1',
      }),
      secretsReader({
        'polycost/artifacts/gcp:access_token': 'gcp-storage-token',
      }),
      fetcher,
    );

    await expect(service.store(storeInput('gcp-gcs'))).resolves.toMatchObject({
      storageBackend: 'gcp-gcs',
      objectStoreBucket: 'polycost-invoice-artifacts',
      objectStoreRegion: 'us-central1',
      objectStoreUri: expect.stringMatching(/^gs:\/\/polycost-invoice-artifacts\//),
      objectStoreETag: 'gcp-etag',
      objectStoreVersion: '3',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('https://storage.googleapis.com/upload/storage/v1/b/'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer gcp-storage-token',
          'x-goog-meta-polycost-sha256': 'd'.repeat(64),
        }),
        body: content,
      }),
    );
  });

  it('reads external object bytes and returns a buffer for checksum verification', async () => {
    const fetcher = jest.fn(async () => okBinaryResponse(content));
    const service = new InvoiceArtifactStorageService(
      configService({
        INVOICE_ARTIFACT_STORAGE_BACKEND: 'gcp-gcs',
      }),
      secretsReader({
        'polycost/artifacts/gcp:access_token': 'gcp-storage-token',
      }),
      fetcher,
    );

    await expect(
      service.read({
        storageBackend: 'gcp-gcs',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/demo.txt',
        objectStoreUri: 'gs://polycost-invoice-artifacts/invoice-artifacts/demo.txt',
      }),
    ).resolves.toEqual(content);
  });

  it('deletes AWS S3 artifact objects with SigV4 and version id support', async () => {
    const fetcher = jest.fn(async () => okResponse(''));
    const service = new InvoiceArtifactStorageService(
      configService({
        INVOICE_ARTIFACT_OBJECT_STORE_REGION: 'us-east-1',
      }),
      secretsReader({
        'polycost/artifacts/aws:access_key_id': 'AKIATEST',
        'polycost/artifacts/aws:secret_access_key': 'aws-secret-key',
      }),
      fetcher,
      () => new Date('2026-07-08T00:00:00.000Z'),
    );

    await expect(
      service.delete({
        storageBackend: 'aws-s3',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreRegion: 'us-east-1',
        objectStoreKey: 'invoice-artifacts/demo.txt',
        objectStoreUri: 's3://polycost-invoice-artifacts/invoice-artifacts/demo.txt',
        objectStoreVersion: 'v1',
      }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      'https://polycost-invoice-artifacts.s3.us-east-1.amazonaws.com/invoice-artifacts/demo.txt?versionId=v1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: expect.stringContaining('AWS4-HMAC-SHA256'),
        }),
      }),
    );
  });

  it('deletes Azure Blob artifact objects through SAS-backed REST calls', async () => {
    const fetcher = jest.fn(async () => okResponse(''));
    const service = new InvoiceArtifactStorageService(
      configService(),
      secretsReader({
        'polycost/artifacts/azure:account_name': 'polycostartifacts',
        'polycost/artifacts/azure:sas_token': 'sv=2026&sig=signature',
      }),
      fetcher,
    );

    await expect(
      service.delete({
        storageBackend: 'azure-blob',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/demo.txt',
        objectStoreUri: 'azure-blob://polycostartifacts/polycost-invoice-artifacts/demo.txt',
        objectStoreVersion: '2',
      }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      'https://polycostartifacts.blob.core.windows.net/polycost-invoice-artifacts/invoice-artifacts/demo.txt?versionid=2&sv=2026&sig=signature',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'x-ms-version': '2023-11-03',
        }),
      }),
    );
  });

  it('deletes GCP Cloud Storage artifact objects by generation', async () => {
    const fetcher = jest.fn(async () => okResponse(''));
    const service = new InvoiceArtifactStorageService(
      configService(),
      secretsReader({
        'polycost/artifacts/gcp:access_token': 'gcp-storage-token',
      }),
      fetcher,
    );

    await expect(
      service.delete({
        storageBackend: 'gcp-gcs',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/demo.txt',
        objectStoreUri: 'gs://polycost-invoice-artifacts/invoice-artifacts/demo.txt',
        objectStoreVersion: '3',
      }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      'https://storage.googleapis.com/storage/v1/b/polycost-invoice-artifacts/o/invoice-artifacts%2Fdemo.txt?generation=3',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer gcp-storage-token',
        }),
      }),
    );
  });

  it('treats missing provider objects as already deleted for retention retries', async () => {
    const fetcher = jest.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '',
    }));
    const service = new InvoiceArtifactStorageService(
      configService(),
      secretsReader({
        'polycost/artifacts/gcp:access_token': 'gcp-storage-token',
      }),
      fetcher,
    );

    await expect(
      service.delete({
        storageBackend: 'gcp-gcs',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreKey: 'invoice-artifacts/missing.txt',
        objectStoreUri: 'gs://polycost-invoice-artifacts/invoice-artifacts/missing.txt',
      }),
    ).resolves.toBeUndefined();
  });
});

function storeInput(storageBackend: InvoiceArtifactStorageBackend) {
  return {
    reconciliationId: '66666666-6666-4666-8666-666666666666',
    artifactId: 'artifact-1',
    teamId: '22222222-2222-4222-8222-222222222222',
    fileName: 'aws-invoice-control.txt',
    mimeType: 'text/plain',
    contentSha256: 'd'.repeat(64),
    content,
    uploadedAt: '2026-07-08T00:00:00.000Z',
    governance: governance(storageBackend),
  };
}

function governance(storageBackend: InvoiceArtifactStorageBackend): InvoiceArtifactBlobGovernance {
  return {
    storageProfile: {
      storageBackend,
      encryptionStatus:
        storageBackend === 'database-bytea' ? 'database-managed' : 'customer-managed-kms',
      objectStore: {
        bucketOrContainer: 'polycost-invoice-artifacts',
        prefix: 'invoice-artifacts',
        region: storageBackend === 'aws-s3' ? 'us-east-1' : undefined,
      },
      kmsKeyReference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
      kmsKeyRequiredForProduction: false,
    },
    retentionPolicy: {
      retentionUntil: '2027-07-08T00:00:00.000Z',
      retentionDays: 365,
      legalHold: false,
    },
    malwareScan: {
      status: 'passed',
      scanner: 'polycost-eicar-signature-v1',
      checkedAt: '2026-07-08T00:00:00.000Z',
      findings: [],
    },
  };
}

function configService(overrides: Partial<AppConfig> = {}): ConfigService<AppConfig, true> {
  const overrideMap = new Map(Object.entries(overrides));

  return {
    get: jest.fn((key: keyof AppConfig) => overrideMap.get(key)),
  } as unknown as ConfigService<AppConfig, true>;
}

function secretsReader(values: Record<string, string>): SecretsReader {
  const secretMap = new Map(Object.entries(values));

  return {
    getSecret: jest.fn(async (path: string, key: string) => {
      const value = secretMap.get(`${path}:${key}`);

      if (!value) {
        throw new Error(`missing secret ${path}:${key}`);
      }

      return value;
    }),
  };
}

function okResponse(body: string, headers: Record<string, string> = {}) {
  const headerMap = new Map(Object.entries(headers));

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: (name: string) => headerMap.get(name) ?? headerMap.get(name.toLowerCase()) ?? null,
    },
    text: async () => body,
  };
}

function okBinaryResponse(body: Buffer) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => body.toString('utf8'),
    arrayBuffer: async () => Uint8Array.from(body).buffer,
  };
}
