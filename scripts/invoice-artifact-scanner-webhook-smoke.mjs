#!/usr/bin/env node
import { createHash, createHmac, randomUUID } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const scannerUrl = args.url ?? process.env.INVOICE_ARTIFACT_MALWARE_SCANNER_URL;
const scannerSecret = args.secret ?? process.env.INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET;
const timeoutMs = Number(
  args.timeoutMs ?? process.env.POLYCOST_INVOICE_ARTIFACT_SCANNER_SMOKE_TIMEOUT_MS ?? 15_000,
);

if (!scannerUrl) {
  fail('INVOICE_ARTIFACT_MALWARE_SCANNER_URL or --url is required.');
}

if (!scannerSecret || scannerSecret.length < 16 || isDummyCredential(scannerSecret)) {
  fail(
    'INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET or --secret must be a non-dummy value of 16+ chars.',
  );
}

const parsedUrl = parseWebhookUrl(scannerUrl);
const localHttpAllowed =
  args.allowHttpLocal === true && parsedUrl.protocol === 'http:' && isLocalhost(parsedUrl.hostname);

if (parsedUrl.protocol !== 'https:' && !localHttpAllowed) {
  fail(
    'Invoice artifact scanner smoke targets must use HTTPS unless --allow-http-local is set for localhost.',
  );
}

const runId =
  process.env.POLYCOST_INVOICE_ARTIFACT_SCANNER_SMOKE_RUN_ID ??
  `invoice-artifact-scanner-smoke-${Date.now()}-${randomUUID()}`;
const content = Buffer.from(`polycost scanner canary ${runId}`, 'utf8');
const artifactSha256 = sha256(content);
const payload = {
  fileName: `polycost-scanner-canary-${runId}.txt`,
  mimeType: 'text/plain',
  sha256: artifactSha256,
  contentSizeBytes: content.length,
  contentBase64: content.toString('base64'),
};
const body = JSON.stringify(payload);
const signature = createHmac('sha256', scannerSecret).update(body).digest('hex');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(parsedUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'polycost-invoice-artifact-scanner-smoke/1.0',
      'x-polycost-artifact-signature': `sha256=${signature}`,
      'x-polycost-artifact-sha256': artifactSha256,
      'x-polycost-scanner-smoke-run-id': runId,
    },
    body,
    signal: controller.signal,
  });
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    fail(
      `Invoice artifact scanner smoke failed with HTTP ${response.status}: ${responseText.slice(
        0,
        240,
      )}`,
    );
  }

  const parsedResponse = parseScannerResponse(responseText);
  const clean =
    parsedResponse.status === 'passed' ||
    parsedResponse.verdict === 'clean' ||
    parsedResponse.verdict === 'passed';

  if (!clean) {
    fail('Invoice artifact scanner smoke did not receive a clean/passed verdict.');
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        scanner: typeof parsedResponse.scanner === 'string' ? parsedResponse.scanner : undefined,
        receiver: redactUrl(parsedUrl),
        httpStatus: response.status,
        runId,
        artifactSha256,
        contentSizeBytes: content.length,
        findingCount: Array.isArray(parsedResponse.findings) ? parsedResponse.findings.length : 0,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  fail(`Invoice artifact scanner smoke request failed: ${message}`);
} finally {
  clearTimeout(timeout);
}

function parseArgs(rawArgs) {
  const parsed = {
    allowHttpLocal: false,
  };

  for (const arg of rawArgs) {
    if (arg === '--allow-http-local') {
      parsed.allowHttpLocal = true;
      continue;
    }
    if (arg.startsWith('--url=')) {
      parsed.url = arg.slice('--url='.length);
      continue;
    }
    if (arg.startsWith('--secret=')) {
      parsed.secret = arg.slice('--secret='.length);
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      parsed.timeoutMs = arg.slice('--timeout-ms='.length);
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function parseWebhookUrl(value) {
  try {
    return new URL(value);
  } catch {
    fail('Invoice artifact scanner webhook URL is not a valid URL.');
  }
}

function parseScannerResponse(responseText) {
  if (!responseText.trim()) {
    return {
      status: 'passed',
      verdict: 'clean',
    };
  }

  try {
    const parsed = JSON.parse(responseText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('Invoice artifact scanner response must be a JSON object.');
    }
    return parsed;
  } catch {
    fail('Invoice artifact scanner response must be valid JSON.');
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isLocalhost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isDummyCredential(value) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === 'dummy' ||
    normalized === 'example' ||
    normalized.includes('change_me') ||
    normalized.includes('dev_only')
  );
}

function redactUrl(url) {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
