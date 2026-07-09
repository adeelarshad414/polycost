import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { appendFile, access, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const devMode = args.dev === true;
const secret =
  args.secret ??
  process.env.INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET ??
  (devMode ? 'local-invoice-evidence-notary-reference-secret-32chars' : undefined);
const host =
  args.host ??
  process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_HOST ??
  (devMode ? '127.0.0.1' : '0.0.0.0');
const port = numberFrom(
  args.port ?? process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PORT ?? 61_780,
  'receiver port',
);
const receiverPath =
  args.path ??
  process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PATH ??
  '/polycost/evidence-receipts';
const artifactDir =
  args.artifactDir ??
  process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_ARTIFACT_DIR ??
  path.join(root, 'artifacts', 'invoice-evidence-notary-reference-receiver');
const maxBodyBytes = numberFrom(
  args.maxBytes ?? process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_MAX_BYTES ?? 512 * 1024,
  'max body bytes',
);
const rateLimitPerMinute = numberFrom(
  args.rateLimitPerMinute ??
    process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_RATE_LIMIT_PER_MINUTE ??
    120,
  'rate limit per minute',
);
const retentionMode =
  args.retentionMode ??
  process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_RETENTION_MODE ??
  'operator-managed-worm';

if (!receiverPath.startsWith('/')) {
  fail('POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PATH must start with /.');
}

if (!secret || secret.length < 32 || (!devMode && isDummyCredential(secret))) {
  fail(
    'INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET must be a non-dummy value of 32+ characters for the notary reference receiver.',
  );
}

await mkdir(artifactDir, { recursive: true, mode: 0o700 });
await access(artifactDir, fsConstants.W_OK);

const rateBuckets = new Map();

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'GET' && requestUrl.pathname === '/health/live') {
      writeJson(response, 200, {
        status: 'ok',
        service: 'polycost-invoice-evidence-notary-reference-receiver',
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/health/ready') {
      await access(artifactDir, fsConstants.W_OK);
      writeJson(response, 200, {
        status: 'ready',
        service: 'polycost-invoice-evidence-notary-reference-receiver',
        receiverPath,
        artifactDir,
        retentionMode,
        appendOnlyJsonl: true,
        immutableRetentionProved: false,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    if (request.method !== 'POST' || requestUrl.pathname !== receiverPath) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }

    const rateCheck = checkRateLimit(request.socket.remoteAddress ?? 'unknown');

    if (!rateCheck.allowed) {
      writeJson(response, 429, { error: 'rate_limited', retryAfterSeconds: rateCheck.retryAfter });
      return;
    }

    if (!hasJsonContentType(request.headers)) {
      writeJson(response, 415, { error: 'unsupported_media_type' });
      return;
    }

    const body = await readRequestBody(request, maxBodyBytes);
    const verification = verifySignature(request.headers, body, secret);

    if (!verification.ok) {
      writeJson(response, 401, { error: verification.error });
      return;
    }

    const payload = parsePayload(body);
    const validation = validateNotaryPayload(request.headers, payload);

    if (!validation.ok) {
      writeJson(response, 400, { error: validation.error });
      return;
    }

    const receivedAt = new Date().toISOString();
    const bodySha256 = sha256(body);
    const receiptId = sha256(`${bodySha256}:${receivedAt}:${randomUUID()}`);
    const artifactFile = path.join(
      artifactDir,
      `invoice-evidence-notary-receipts-${receivedAt.slice(0, 10)}.jsonl`,
    );
    const record = buildReceiptRecord({
      bodySha256,
      headers: request.headers,
      payload,
      receiptId,
      receivedAt,
      signature: verification.signature,
      validation,
    });

    await appendFile(artifactFile, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
      flag: 'a',
      mode: 0o600,
    });

    logEvent('accepted', {
      receiptId,
      reconciliationId: validation.reconciliationId,
      packetDigestSha256: validation.packetDigestSha256,
      artifactFile,
    });

    writeJson(response, 202, {
      status: 'accepted',
      receiptId,
      receivedAt,
      reconciliationId: validation.reconciliationId,
      packetDigestSha256: validation.packetDigestSha256,
      basePayloadDigestSha256: validation.basePayloadDigestSha256,
    });
  } catch (error) {
    writeJson(response, 500, {
      error:
        error instanceof Error && error.message === 'invoice_evidence_notary_payload_too_large'
          ? error.message
          : 'invoice_evidence_notary_reference_receiver_error',
    });
  }
});

await listen(server, port, host);

const address = server.address();
const listenPort = address && typeof address !== 'string' ? address.port : port;
const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const receiverUrl = `http://${displayHost}:${listenPort}${receiverPath}`;

console.log(
  JSON.stringify({
    status: 'listening',
    service: 'polycost-invoice-evidence-notary-reference-receiver',
    receiverUrl,
    healthReadyUrl: `http://${displayHost}:${listenPort}/health/ready`,
    artifactDir,
    retentionMode,
    devMode,
  }),
);

process.once('SIGINT', () => {
  shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});

function buildReceiptRecord({
  bodySha256,
  headers,
  payload,
  receiptId,
  receivedAt,
  signature,
  validation,
}) {
  return {
    schemaVersion: 'invoice-evidence-notary-reference-receiver/v1',
    receiptId,
    receivedAt,
    bodySha256,
    headers: {
      event: headerValue(headers, 'x-polycost-event'),
      reconciliationId: headerValue(headers, 'x-polycost-reconciliation-id'),
      packetDigestSha256: headerValue(headers, 'x-polycost-packet-digest-sha256'),
      basePayloadDigestSha256: headerValue(headers, 'x-polycost-base-payload-digest-sha256'),
      signingKeyReference: headerValue(headers, 'x-polycost-signing-key-reference'),
      signatureSha256Prefix: signature.slice(0, 12),
    },
    payload: {
      schemaVersion: payload.schemaVersion,
      event: payload.event,
      exportedAt: payload.exportedAt,
      receiptMode: payload.receiptMode,
      receiptStatus: payload.receiptStatus,
      runId: payload.packet?.readiness?.smokeRunId,
      subject: payload.subject,
      actor: payload.actor,
      receipt: {
        mode: payload.packet?.receipt?.mode,
        status: payload.packet?.receipt?.status,
        basePayloadDigestSha256: payload.packet?.receipt?.basePayloadDigestSha256,
        notaryDeliveryMode: payload.packet?.receipt?.notary?.deliveryMode,
        notaryUrlHost: payload.packet?.receipt?.notary?.urlHost,
        wormRetentionMode: payload.packet?.receipt?.wormReadiness?.retentionMode,
      },
      integrity: {
        payloadDigestSha256: payload.packet?.integrity?.payloadDigestSha256,
        payloadByteLength: payload.packet?.integrity?.payloadByteLength,
        canonicalization: payload.packet?.integrity?.canonicalization,
      },
    },
    validation: {
      reconciliationId: validation.reconciliationId,
      packetDigestSha256: validation.packetDigestSha256,
      basePayloadDigestSha256: validation.basePayloadDigestSha256,
    },
    retention: {
      mode: retentionMode,
      appendOnlyJsonl: true,
      immutableRetentionProved: false,
      operatorAction:
        'Back this artifact directory with object-lock/WORM storage, export access logs, and archive retention-policy evidence before claiming production immutability.',
    },
  };
}

function validateNotaryPayload(headers, payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'invalid_json_payload' };
  }

  const eventName = headerValue(headers, 'x-polycost-event');
  const reconciliationId = headerValue(headers, 'x-polycost-reconciliation-id');
  const packetDigestSha256 = headerValue(headers, 'x-polycost-packet-digest-sha256');
  const basePayloadDigestSha256 = headerValue(headers, 'x-polycost-base-payload-digest-sha256');

  if (eventName !== 'invoice_evidence_packet.exported') {
    return { ok: false, error: 'invalid_event_header' };
  }

  if (payload.schemaVersion !== 'invoice-evidence-notary-handoff/v1') {
    return { ok: false, error: 'invalid_schema_version' };
  }

  if (payload.event !== 'invoice_evidence_packet.exported') {
    return { ok: false, error: 'invalid_payload_event' };
  }

  if (payload.subject?.reconciliationId !== reconciliationId) {
    return { ok: false, error: 'subject_header_mismatch' };
  }

  if (payload.packetDigestSha256 !== packetDigestSha256) {
    return { ok: false, error: 'packet_digest_header_mismatch' };
  }

  if (payload.packet?.integrity?.payloadDigestSha256 !== packetDigestSha256) {
    return { ok: false, error: 'packet_integrity_digest_mismatch' };
  }

  if (payload.basePayloadDigestSha256 !== basePayloadDigestSha256) {
    return { ok: false, error: 'base_payload_digest_header_mismatch' };
  }

  if (payload.packet?.receipt?.basePayloadDigestSha256 !== basePayloadDigestSha256) {
    return { ok: false, error: 'receipt_base_payload_digest_mismatch' };
  }

  if (
    payload.receiptMode !== 'external-webhook' ||
    payload.packet?.receipt?.mode !== 'external-webhook'
  ) {
    return { ok: false, error: 'receipt_mode_not_external_webhook' };
  }

  if (payload.receiptStatus !== 'external-notary-ready') {
    return { ok: false, error: 'receipt_not_external_notary_ready' };
  }

  return {
    ok: true,
    reconciliationId,
    packetDigestSha256,
    basePayloadDigestSha256,
  };
}

function verifySignature(headers, body, signingSecret) {
  const eventName = headerValue(headers, 'x-polycost-event');
  const signature = headerValue(headers, 'x-polycost-signature-sha256') ?? '';

  if (eventName !== 'invoice_evidence_packet.exported') {
    return { ok: false, error: 'invalid_event_header', signature };
  }

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { ok: false, error: 'invalid_signature_header', signature };
  }

  const expected = createHmac('sha256', signingSecret).update(body).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(signature, 'hex');

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return { ok: false, error: 'signature_mismatch', signature };
  }

  return { ok: true, signature };
}

function checkRateLimit(remoteAddress) {
  if (rateLimitPerMinute <= 0) {
    return { allowed: true, retryAfter: 0 };
  }

  const minute = Math.floor(Date.now() / 60_000);
  const key = `${remoteAddress}:${minute}`;
  const count = (rateBuckets.get(key) ?? 0) + 1;
  rateBuckets.set(key, count);

  for (const bucketKey of rateBuckets.keys()) {
    if (!bucketKey.endsWith(`:${minute}`)) {
      rateBuckets.delete(bucketKey);
    }
  }

  return {
    allowed: count <= rateLimitPerMinute,
    retryAfter: 60 - Math.floor((Date.now() % 60_000) / 1000),
  };
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBytes) {
        reject(new Error('invoice_evidence_notary_payload_too_large'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

function listen(httpServer, listenPort, listenHost) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(listenPort, listenHost, resolve);
  });
}

function shutdown(signal) {
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({
          status: 'shutdown_error',
          signal,
          error: error.message,
        }),
      );
      process.exit(1);
      return;
    }

    console.log(JSON.stringify({ status: 'stopped', signal }));
    process.exit(0);
  });
}

function hasJsonContentType(headers) {
  const contentType = headerValue(headers, 'content-type') ?? '';

  return contentType.toLowerCase().split(';')[0].trim() === 'application/json';
}

function parsePayload(body) {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function headerValue(headers, name) {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (const arg of rawArgs) {
    if (arg === '--dev') {
      parsed.dev = true;
      continue;
    }

    if (arg.startsWith('--artifact-dir=')) {
      parsed.artifactDir = arg.slice('--artifact-dir='.length);
      continue;
    }

    if (arg.startsWith('--host=')) {
      parsed.host = arg.slice('--host='.length);
      continue;
    }

    if (arg.startsWith('--max-bytes=')) {
      parsed.maxBytes = arg.slice('--max-bytes='.length);
      continue;
    }

    if (arg.startsWith('--path=')) {
      parsed.path = arg.slice('--path='.length);
      continue;
    }

    if (arg.startsWith('--port=')) {
      parsed.port = arg.slice('--port='.length);
      continue;
    }

    if (arg.startsWith('--rate-limit-per-minute=')) {
      parsed.rateLimitPerMinute = arg.slice('--rate-limit-per-minute='.length);
      continue;
    }

    if (arg.startsWith('--retention-mode=')) {
      parsed.retentionMode = arg.slice('--retention-mode='.length);
      continue;
    }

    if (arg.startsWith('--secret=')) {
      parsed.secret = arg.slice('--secret='.length);
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function numberFrom(value, label) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`Invalid ${label}: ${value}`);
  }

  return parsed;
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

function logEvent(status, payload) {
  console.log(
    JSON.stringify({
      status,
      service: 'polycost-invoice-evidence-notary-reference-receiver',
      ...payload,
    }),
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
