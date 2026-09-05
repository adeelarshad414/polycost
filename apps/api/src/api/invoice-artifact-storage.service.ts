import { createHash, createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { defaultFetch } from '../adapters/common/http-client';
import type { FetchLike } from '../adapters/common/http-client';
import { AppConfig } from '../config/config.schema';
import type { SecretsReader } from '../secrets/secrets.service';
import { ApiValidationError } from './api-errors';
import { InvoiceArtifactBlobGovernance, InvoiceArtifactStorageBackend } from './billing.types';

const AWS_ARTIFACT_SECRET_PATH = 'polycost/artifacts/aws';
const AZURE_ARTIFACT_SECRET_PATH = 'polycost/artifacts/azure';
const GCP_ARTIFACT_SECRET_PATH = 'polycost/artifacts/gcp';
const GCP_PROVIDER_SECRET_PATH = 'polycost/providers/gcp';

export interface StoredInvoiceArtifactObject {
  storageBackend: InvoiceArtifactStorageBackend;
  inlineContent?: Buffer;
  objectStoreBucket?: string;
  objectStoreRegion?: string;
  objectStoreKey?: string;
  objectStoreUri?: string;
  objectStoreETag?: string;
  objectStoreVersion?: string;
}

export interface InvoiceArtifactObjectPointer {
  storageBackend: InvoiceArtifactStorageBackend;
  objectStoreBucket?: string;
  objectStoreRegion?: string;
  objectStoreKey?: string;
  objectStoreUri?: string;
  objectStoreVersion?: string;
}

interface StoreInput {
  reconciliationId: string;
  artifactId: string;
  teamId?: string;
  fileName: string;
  mimeType: string;
  contentSha256: string;
  content: Buffer;
  uploadedAt: string;
  governance: InvoiceArtifactBlobGovernance;
}

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

@Injectable()
export class InvoiceArtifactStorageService {
  constructor(
    private readonly configService?: ConfigService<AppConfig, true>,
    private readonly secretsReader?: SecretsReader,
    private readonly fetcher: FetchLike = defaultFetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async store(input: StoreInput): Promise<StoredInvoiceArtifactObject> {
    const backend = this.storageBackend();

    if (backend === 'database-bytea') {
      return {
        storageBackend: 'database-bytea',
        inlineContent: input.content,
      };
    }

    const objectStore = requiredObjectStore(input.governance);
    const key = objectKey({
      prefix: objectStore.prefix,
      teamId: input.teamId,
      reconciliationId: input.reconciliationId,
      artifactId: input.artifactId,
      contentSha256: input.contentSha256,
      fileName: input.fileName,
    });

    switch (backend) {
      case 'aws-s3':
        return this.storeAwsS3(input, objectStore.bucketOrContainer, key, objectStore.region);
      case 'azure-blob':
        return this.storeAzureBlob(input, objectStore.bucketOrContainer, key);
      case 'gcp-gcs':
        return this.storeGcpGcs(input, objectStore.bucketOrContainer, key, objectStore.region);
      default:
        return assertNeverStorageBackend(backend);
    }
  }

  async read(pointer: InvoiceArtifactObjectPointer): Promise<Buffer | undefined> {
    if (pointer.storageBackend === 'database-bytea') {
      return undefined;
    }

    validateExternalPointer(pointer);

    switch (pointer.storageBackend) {
      case 'aws-s3':
        return this.readAwsS3(pointer);
      case 'azure-blob':
        return this.readAzureBlob(pointer);
      case 'gcp-gcs':
        return this.readGcpGcs(pointer);
      default:
        return assertNeverStorageBackend(pointer.storageBackend);
    }
  }

  async delete(pointer: InvoiceArtifactObjectPointer): Promise<void> {
    if (pointer.storageBackend === 'database-bytea') {
      return;
    }

    validateExternalPointer(pointer);

    switch (pointer.storageBackend) {
      case 'aws-s3':
        return this.deleteAwsS3(pointer);
      case 'azure-blob':
        return this.deleteAzureBlob(pointer);
      case 'gcp-gcs':
        return this.deleteGcpGcs(pointer);
      default:
        return assertNeverStorageBackend(pointer.storageBackend);
    }
  }

  private async storeAwsS3(
    input: StoreInput,
    bucket: string,
    key: string,
    region: string | undefined,
  ): Promise<StoredInvoiceArtifactObject> {
    const effectiveRegion = region ?? this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_REGION');
    const kmsKeyReference = input.governance.storageProfile.kmsKeyReference;

    if (!effectiveRegion) {
      throw storageConfigError('INVOICE_ARTIFACT_OBJECT_STORE_REGION is required for AWS S3');
    }

    const host = `${bucket}.s3.${effectiveRegion}.amazonaws.com`;
    const path = objectPath(key);
    const url = `https://${host}${path}`;
    const credentials = await this.awsCredentials();
    const headers = awsSignedHeaders({
      credentials,
      method: 'PUT',
      host,
      path,
      region: effectiveRegion,
      content: input.content,
      contentType: input.mimeType,
      now: this.now(),
      extraHeaders: {
        ...(kmsKeyReference
          ? {
              'x-amz-server-side-encryption': 'aws:kms',
              'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyReference,
            }
          : {}),
        'x-amz-meta-polycost-sha256': input.contentSha256,
      },
    });
    const response = await this.fetcher(url, {
      method: 'PUT',
      headers,
      body: input.content,
    });

    if (!response.ok) {
      throw storageProviderError('AWS S3', response.status, response.statusText);
    }

    return {
      storageBackend: 'aws-s3',
      objectStoreBucket: bucket,
      objectStoreRegion: effectiveRegion,
      objectStoreKey: key,
      objectStoreUri: `s3://${bucket}/${key}`,
      objectStoreETag: headerValue(response, 'etag'),
      objectStoreVersion: headerValue(response, 'x-amz-version-id'),
    };
  }

  private async readAwsS3(pointer: InvoiceArtifactObjectPointer): Promise<Buffer> {
    const region =
      pointer.objectStoreRegion ?? this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_REGION');

    if (!region) {
      throw storageConfigError('INVOICE_ARTIFACT_OBJECT_STORE_REGION is required for AWS S3');
    }

    const bucket = pointer.objectStoreBucket!;
    const key = pointer.objectStoreKey!;
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const path = objectPath(key);
    const credentials = await this.awsCredentials();
    const response = await this.fetcher(`https://${host}${path}`, {
      method: 'GET',
      headers: awsSignedHeaders({
        credentials,
        method: 'GET',
        host,
        path,
        region,
        content: Buffer.alloc(0),
        now: this.now(),
      }),
    });

    if (!response.ok) {
      throw storageProviderError('AWS S3', response.status, response.statusText);
    }

    return responseBuffer(response);
  }

  private async deleteAwsS3(pointer: InvoiceArtifactObjectPointer): Promise<void> {
    const region =
      pointer.objectStoreRegion ?? this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_REGION');

    if (!region) {
      throw storageConfigError('INVOICE_ARTIFACT_OBJECT_STORE_REGION is required for AWS S3');
    }

    const bucket = pointer.objectStoreBucket!;
    const key = pointer.objectStoreKey!;
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const path = objectPath(key);
    const query = pointer.objectStoreVersion
      ? `versionId=${awsQueryEncode(pointer.objectStoreVersion)}`
      : '';
    const credentials = await this.awsCredentials();
    const response = await this.fetcher(`https://${host}${path}${query ? `?${query}` : ''}`, {
      method: 'DELETE',
      headers: awsSignedHeaders({
        credentials,
        method: 'DELETE',
        host,
        path,
        query,
        region,
        content: Buffer.alloc(0),
        now: this.now(),
      }),
    });

    if (!response.ok && response.status !== 404) {
      throw storageProviderError('AWS S3', response.status, response.statusText);
    }
  }

  private async storeAzureBlob(
    input: StoreInput,
    configuredContainer: string,
    key: string,
  ): Promise<StoredInvoiceArtifactObject> {
    const azureTarget = await this.azureTarget(configuredContainer);
    const url = azureBlobUrl(
      azureTarget.accountName,
      azureTarget.containerName,
      key,
      azureTarget.sasToken,
    );
    const response = await this.fetcher(url, {
      method: 'PUT',
      headers: {
        'content-type': input.mimeType,
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-meta-polycost-sha256': input.contentSha256,
        'x-ms-version': '2023-11-03',
      },
      body: input.content,
    });

    if (!response.ok) {
      throw storageProviderError('Azure Blob Storage', response.status, response.statusText);
    }

    return {
      storageBackend: 'azure-blob',
      objectStoreBucket: azureTarget.containerName,
      objectStoreRegion: this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_REGION'),
      objectStoreKey: key,
      objectStoreUri: `azure-blob://${azureTarget.accountName}/${azureTarget.containerName}/${key}`,
      objectStoreETag: headerValue(response, 'etag'),
      objectStoreVersion: headerValue(response, 'x-ms-version-id'),
    };
  }

  private async readAzureBlob(pointer: InvoiceArtifactObjectPointer): Promise<Buffer> {
    const azureTarget = await this.azureTarget(pointer.objectStoreBucket!);
    const response = await this.fetcher(
      azureBlobUrl(
        azureTarget.accountName,
        azureTarget.containerName,
        pointer.objectStoreKey!,
        azureTarget.sasToken,
        { versionId: pointer.objectStoreVersion },
      ),
    );

    if (!response.ok) {
      throw storageProviderError('Azure Blob Storage', response.status, response.statusText);
    }

    return responseBuffer(response);
  }

  private async deleteAzureBlob(pointer: InvoiceArtifactObjectPointer): Promise<void> {
    const azureTarget = await this.azureTarget(pointer.objectStoreBucket!);
    const response = await this.fetcher(
      azureBlobUrl(
        azureTarget.accountName,
        azureTarget.containerName,
        pointer.objectStoreKey!,
        azureTarget.sasToken,
        { versionId: pointer.objectStoreVersion },
      ),
      {
        method: 'DELETE',
        headers: {
          'x-ms-version': '2023-11-03',
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw storageProviderError('Azure Blob Storage', response.status, response.statusText);
    }
  }

  private async storeGcpGcs(
    input: StoreInput,
    bucket: string,
    key: string,
    region: string | undefined,
  ): Promise<StoredInvoiceArtifactObject> {
    const token = await this.gcpAccessToken();
    const response = await this.fetcher(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
        bucket,
      )}/o?uploadType=media&name=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': input.mimeType,
          'x-goog-meta-polycost-sha256': input.contentSha256,
        },
        body: input.content,
      },
    );
    const body = await response.text();

    if (!response.ok) {
      throw storageProviderError('GCP Cloud Storage', response.status, response.statusText);
    }

    const metadata = parseGcpObjectMetadata(body);

    return {
      storageBackend: 'gcp-gcs',
      objectStoreBucket: bucket,
      objectStoreRegion: region ?? this.optionalConfig('INVOICE_ARTIFACT_OBJECT_STORE_REGION'),
      objectStoreKey: key,
      objectStoreUri: `gs://${bucket}/${key}`,
      objectStoreETag: metadata.eTag,
      objectStoreVersion: metadata.generation,
    };
  }

  private async readGcpGcs(pointer: InvoiceArtifactObjectPointer): Promise<Buffer> {
    const token = await this.gcpAccessToken();
    const response = await this.fetcher(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        pointer.objectStoreBucket!,
      )}/o/${encodeURIComponent(pointer.objectStoreKey!)}?alt=media`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw storageProviderError('GCP Cloud Storage', response.status, response.statusText);
    }

    return responseBuffer(response);
  }

  private async deleteGcpGcs(pointer: InvoiceArtifactObjectPointer): Promise<void> {
    const token = await this.gcpAccessToken();
    const generationQuery = pointer.objectStoreVersion
      ? `?generation=${encodeURIComponent(pointer.objectStoreVersion)}`
      : '';
    const response = await this.fetcher(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        pointer.objectStoreBucket!,
      )}/o/${encodeURIComponent(pointer.objectStoreKey!)}${generationQuery}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw storageProviderError('GCP Cloud Storage', response.status, response.statusText);
    }
  }

  private storageBackend(): InvoiceArtifactStorageBackend {
    return (
      this.configService?.get('INVOICE_ARTIFACT_STORAGE_BACKEND', { infer: true }) ??
      'database-bytea'
    );
  }

  private optionalConfig(key: keyof AppConfig): string | undefined {
    const value = this.configService?.get(key, { infer: true });

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private async secret(path: string, key: string): Promise<string> {
    if (!this.secretsReader) {
      throw storageConfigError('Vault secret reader is required for external artifact storage');
    }

    const value = await this.secretsReader.getSecret(path, key);

    if (!value.trim() || isDummyCredential(value)) {
      throw storageConfigError(`Vault secret ${path}:${key} is missing or still a dummy value`);
    }

    return value.trim();
  }

  private async optionalSecret(path: string, key: string): Promise<string | undefined> {
    try {
      return await this.secret(path, key);
    } catch {
      return undefined;
    }
  }

  private async awsCredentials(): Promise<AwsCredentials> {
    return {
      accessKeyId: await this.secret(AWS_ARTIFACT_SECRET_PATH, 'access_key_id'),
      secretAccessKey: await this.secret(AWS_ARTIFACT_SECRET_PATH, 'secret_access_key'),
      ...(await this.optionalSecret(AWS_ARTIFACT_SECRET_PATH, 'session_token').then(
        (sessionToken) => (sessionToken ? { sessionToken } : {}),
      )),
    };
  }

  private async azureTarget(configuredContainer: string): Promise<{
    accountName: string;
    containerName: string;
    sasToken: string;
  }> {
    const [configuredAccountName, configuredContainerName] = configuredContainer.includes('/')
      ? configuredContainer.split('/', 2)
      : [undefined, configuredContainer];

    const accountName =
      configuredAccountName ?? (await this.secret(AZURE_ARTIFACT_SECRET_PATH, 'account_name'));
    const sasToken = await this.secret(AZURE_ARTIFACT_SECRET_PATH, 'sas_token');

    return {
      accountName,
      containerName: configuredContainerName,
      sasToken,
    };
  }

  private async gcpAccessToken(): Promise<string> {
    return (
      (await this.optionalSecret(GCP_ARTIFACT_SECRET_PATH, 'access_token')) ??
      (await this.secret(GCP_PROVIDER_SECRET_PATH, 'access_token'))
    );
  }
}

function awsSignedHeaders(input: {
  credentials: AwsCredentials;
  method: 'DELETE' | 'GET' | 'PUT';
  host: string;
  path: string;
  query?: string;
  region: string;
  content: Buffer;
  contentType?: string;
  now: Date;
  extraHeaders?: Record<string, string>;
}): Record<string, string> {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const contentHash = sha256Hex(input.content);
  const headers = new Map<string, string>([
    ['host', input.host],
    ['x-amz-content-sha256', contentHash],
    ['x-amz-date', amzDate],
  ]);

  if (input.contentType) {
    headers.set('content-type', input.contentType);
  }

  if (input.credentials.sessionToken) {
    headers.set('x-amz-security-token', input.credentials.sessionToken);
  }

  for (const [name, value] of Object.entries(input.extraHeaders ?? {})) {
    headers.set(name.toLowerCase(), value);
  }

  const sortedHeaderNames = Array.from(headers.keys()).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${headers.get(name)?.trim() ?? ''}`)
    .join('\n');
  const signedHeaders = sortedHeaderNames.join(';');
  const canonicalRequest = [
    input.method,
    input.path,
    input.query ?? '',
    `${canonicalHeaders}\n`,
    signedHeaders,
    contentHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');
  const signingKey = awsSignatureKey(input.credentials.secretAccessKey, dateStamp, input.region);
  const signature = hmacHex(signingKey, stringToSign);
  const fetchHeaders = Object.fromEntries(headers.entries());

  return {
    ...fetchHeaders,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
  };
}

function awsSignatureKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, 's3');
  return hmac(dateRegionServiceKey, 'aws4_request');
}

function requiredObjectStore(
  governance: InvoiceArtifactBlobGovernance,
): NonNullable<InvoiceArtifactBlobGovernance['storageProfile']['objectStore']> {
  const objectStore = governance.storageProfile.objectStore;

  if (!objectStore) {
    throw storageConfigError('external invoice artifact storage requires an object-store target');
  }

  return objectStore;
}

function objectKey(input: {
  prefix: string;
  teamId?: string;
  reconciliationId: string;
  artifactId: string;
  contentSha256: string;
  fileName: string;
}): string {
  const prefix = input.prefix
    .split('/')
    .map((part) => safeObjectSegment(part))
    .filter(Boolean)
    .join('/');
  const suffix = safeObjectSegment(input.fileName);
  const segments = [
    prefix,
    input.teamId ? `team-${safeObjectSegment(input.teamId)}` : 'team-unassigned',
    `reconciliation-${safeObjectSegment(input.reconciliationId)}`,
    `artifact-${safeObjectSegment(input.artifactId)}`,
    `${input.contentSha256.slice(0, 16)}-${suffix}`,
  ].filter(Boolean);

  return segments.join('/');
}

function safeObjectSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._=-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function objectPath(key: string): string {
  return `/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function awsQueryEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function azureBlobUrl(
  accountName: string,
  containerName: string,
  key: string,
  sasToken: string,
  options: { versionId?: string } = {},
): string {
  const normalizedSasToken = sasToken.startsWith('?') ? sasToken.slice(1) : sasToken;
  const query = [
    options.versionId ? `versionid=${encodeURIComponent(options.versionId)}` : undefined,
    normalizedSasToken,
  ]
    .filter(Boolean)
    .join('&');

  return `https://${accountName}.blob.core.windows.net/${encodeURIComponent(
    containerName,
  )}/${key.split('/').map(encodeURIComponent).join('/')}?${query}`;
}

function validateExternalPointer(
  pointer: InvoiceArtifactObjectPointer,
): asserts pointer is InvoiceArtifactObjectPointer & {
  objectStoreBucket: string;
  objectStoreKey: string;
  objectStoreUri: string;
} {
  if (!pointer.objectStoreBucket || !pointer.objectStoreKey || !pointer.objectStoreUri) {
    throw new ApiValidationError('invoice artifact object pointer is incomplete', [
      {
        field: 'artifactId',
        issue: 'external artifact rows must include bucket/container, key, and URI',
      },
    ]);
  }
}

async function responseBuffer(response: {
  arrayBuffer?(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}): Promise<Buffer> {
  if (response.arrayBuffer) {
    return Buffer.from(await response.arrayBuffer());
  }

  return Buffer.from(await response.text(), 'utf8');
}

function parseGcpObjectMetadata(body: string): { eTag?: string; generation?: string } {
  try {
    const parsed = JSON.parse(body) as { etag?: unknown; generation?: unknown };

    return {
      ...(typeof parsed.etag === 'string' ? { eTag: parsed.etag } : {}),
      ...(typeof parsed.generation === 'string' ? { generation: parsed.generation } : {}),
    };
  } catch {
    return {};
  }
}

function headerValue(
  response: { headers?: { get(name: string): string | null } },
  name: string,
): string | undefined {
  return response.headers?.get(name) ?? response.headers?.get(name.toLowerCase()) ?? undefined;
}

function storageConfigError(issue: string): ApiValidationError {
  return new ApiValidationError('invoice artifact object storage is not configured', [
    {
      field: 'content',
      issue,
    },
  ]);
}

function storageProviderError(
  provider: string,
  status: number,
  statusText: string,
): ApiValidationError {
  return new ApiValidationError('invoice artifact object storage request failed', [
    {
      field: 'content',
      issue: `${provider} returned HTTP ${status} ${statusText}`.trim(),
    },
  ]);
}

function isDummyCredential(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'change_me_dev_only' ||
    normalized === 'dummy' ||
    normalized === 'example' ||
    normalized.includes('change_me')
  );
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function assertNeverStorageBackend(value: never): never {
  throw new Error(`Unsupported invoice artifact storage backend: ${String(value)}`);
}
