/* eslint-disable security/detect-object-injection -- Reviewed 2026-07-06: canonical header map access is generated from controlled HTTP signing inputs; see docs/SECURITY-SUPPRESSIONS.md. */
import { createHash, createHmac } from 'node:crypto';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface AwsSignedRequest {
  headers: Record<string, string>;
  body: string;
}

const hashHex = (value: string) => createHash('sha256').update(value).digest('hex');

const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

const hmacHex = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest('hex');

export function signAwsJsonRequest(params: {
  credentials: AwsCredentials;
  region: string;
  service: string;
  host: string;
  target: string;
  body: string;
  now: Date;
}): AwsSignedRequest {
  const amzDate = toAmzDate(params.now);
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host: params.host,
    'x-amz-date': amzDate,
    'x-amz-target': params.target,
  };

  if (params.credentials.sessionToken) {
    headers['x-amz-security-token'] = params.credentials.sessionToken;
  }

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${headers[name].trim()}`)
    .join('\n');
  const signedHeaders = sortedHeaderNames.join(';');
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `${canonicalHeaders}\n`,
    signedHeaders,
    hashHex(params.body),
  ].join('\n');
  const credentialScope = `${dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join('\n');
  const signingKey = getSignatureKey(
    params.credentials.secretAccessKey,
    dateStamp,
    params.region,
    params.service,
  );
  const signature = hmacHex(signingKey, stringToSign);

  headers.authorization = [
    `AWS4-HMAC-SHA256 Credential=${params.credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    headers,
    body: params.body,
  };
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, service);
  return hmac(dateRegionServiceKey, 'aws4_request');
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}
