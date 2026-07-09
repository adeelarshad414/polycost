#!/usr/bin/env node
import { createHmac, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const senderScript = path.join(root, 'scripts', 'invoice-artifact-scanner-webhook-smoke.mjs');
const secret =
  process.env.INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET ??
  'local-invoice-artifact-scanner-smoke-secret';
const received = [];
const strictBind = process.env.POLYCOST_INVOICE_ARTIFACT_SCANNER_LOCAL_SMOKE_STRICT === '1';

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST') {
    writeJson(response, 405, { status: 'failed', error: 'method_not_allowed' });
    return;
  }

  if (request.url !== '/scan') {
    writeJson(response, 404, { status: 'failed', error: 'not_found' });
    return;
  }

  const body = await readRequestBody(request);
  const expectedSignature = createHmac('sha256', secret).update(body).digest('hex');
  const receivedSignature = String(request.headers['x-polycost-artifact-signature'] ?? '').replace(
    /^sha256=/,
    '',
  );

  if (!safeEqualHex(expectedSignature, receivedSignature)) {
    writeJson(response, 401, { status: 'failed', error: 'invalid_signature' });
    return;
  }

  const payload = parseJson(body);
  const decoded = Buffer.from(String(payload.contentBase64 ?? ''), 'base64');

  received.push({
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    sha256: payload.sha256,
    contentSizeBytes: payload.contentSizeBytes,
    decodedBytes: decoded.length,
    runId: request.headers['x-polycost-scanner-smoke-run-id'],
  });

  writeJson(response, 200, {
    status: 'passed',
    verdict: 'clean',
    scanner: 'polycost-local-scanner-smoke',
    findings: [],
  });
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
} catch (error) {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;

  if (!strictBind && (code === 'EPERM' || code === 'EACCES')) {
    console.log(
      JSON.stringify(
        {
          status: 'skipped',
          schemaVersion: 'invoice-artifact-scanner-local-smoke/v1',
          reason: 'local TCP bind is not permitted in this sandbox',
          strictEnv: 'POLYCOST_INVOICE_ARTIFACT_SCANNER_LOCAL_SMOKE_STRICT=1',
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  throw error;
}

const address = server.address();
if (!address || typeof address !== 'object') {
  fail('Invoice artifact scanner local smoke receiver did not bind a TCP port.');
}

const url = `http://127.0.0.1:${address.port}/scan`;
const result = spawnSync(
  process.execPath,
  [senderScript, `--url=${url}`, `--secret=${secret}`, '--allow-http-local'],
  {
    encoding: 'utf8',
  },
);

await new Promise((resolve) => server.close(resolve));

if (result.status !== 0) {
  fail('Invoice artifact scanner webhook smoke sender failed.', result);
}

const parsed = parseJson(result.stdout);

if (parsed.status !== 'pass') {
  fail('Expected scanner webhook smoke sender to pass.', result);
}
if (received.length !== 1) {
  fail(`Expected one scanner canary request, got ${received.length}.`, result);
}
if (received[0].decodedBytes !== received[0].contentSizeBytes) {
  fail('Scanner canary decoded content size did not match declared size.', result);
}

console.log(
  JSON.stringify(
    {
      status: 'pass',
      schemaVersion: 'invoice-artifact-scanner-local-smoke/v1',
      receiverUrl: url,
      artifactSha256: parsed.artifactSha256,
      receivedCount: received.length,
      scanner: parsed.scanner,
    },
    null,
    2,
  ),
);

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('error', reject);
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function writeJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function safeEqualHex(expected, actual) {
  if (!/^[a-f0-9]{64}$/.test(actual)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    fail('Expected valid JSON.');
  }
}

function fail(message, result) {
  console.error(message);
  if (result?.stdout) {
    console.error(result.stdout);
  }
  if (result?.stderr) {
    console.error(result.stderr);
  }
  process.exit(1);
}
