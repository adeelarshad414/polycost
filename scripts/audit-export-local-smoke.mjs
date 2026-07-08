import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secret =
  process.env.AUTH_AUDIT_EXPORT_WEBHOOK_SECRET ?? 'local-audit-export-smoke-secret-32chars';
const receiverPath = process.env.POLYCOST_AUDIT_EXPORT_SMOKE_PATH ?? '/polycost/audit-events';
const requestedPort = Number(process.env.POLYCOST_AUDIT_EXPORT_SMOKE_PORT ?? 0);
const artifactDir =
  process.env.POLYCOST_AUDIT_EXPORT_SMOKE_DIR ?? path.join(root, 'artifacts', 'audit-export-smoke');
const artifactFile = path.join(
  artifactDir,
  `audit-events-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
);

let acceptedEvents = 0;
let rejectedEvents = 0;

await mkdir(artifactDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method !== 'POST' || requestUrl.pathname !== receiverPath) {
      rejectedEvents += 1;
      writeJson(response, 404, { error: 'not_found' });
      return;
    }

    const body = await readRequestBody(request, 256 * 1024);
    const verification = verifySignature(request.headers, body, secret);

    if (!verification.ok) {
      rejectedEvents += 1;
      writeJson(response, 401, { error: verification.error });
      return;
    }

    const payload = parsePayload(body);
    const exportId = headerValue(request.headers, 'x-polycost-audit-export-id');

    if (
      !payload ||
      payload.event !== 'team_audit_event.recorded' ||
      payload.exportId !== exportId
    ) {
      rejectedEvents += 1;
      writeJson(response, 400, { error: 'invalid_audit_export_payload' });
      return;
    }

    const record = {
      schemaVersion: '1.0',
      receivedAt: new Date().toISOString(),
      bodySha256: createHash('sha256').update(body).digest('hex'),
      headers: {
        event: headerValue(request.headers, 'x-polycost-event'),
        exportId,
        signatureSha256Prefix: verification.signature.slice(0, 12),
      },
      payload,
    };

    await appendFile(artifactFile, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
      flag: 'a',
    });
    acceptedEvents += 1;
    writeJson(response, 202, { status: 'accepted', exportId });
  } catch (error) {
    rejectedEvents += 1;
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'audit_export_receiver_error',
    });
  }
});

await listen(server, requestedPort);

const address = server.address();
if (!address || typeof address === 'string') {
  await close(server);
  fail('Audit export local smoke receiver did not bind a TCP port.');
}

const receiverUrl = `http://127.0.0.1:${address.port}${receiverPath}`;
console.log(`Audit export local receiver listening at ${receiverUrl}`);

await sendSignedCanary(receiverUrl, secret);

await close(server);

if (acceptedEvents !== 1 || rejectedEvents !== 0) {
  fail(`Expected one accepted event and zero rejects; got ${acceptedEvents}/${rejectedEvents}.`);
}

const lines = (await readFile(artifactFile, 'utf8')).trim().split('\n');

if (lines.length !== 1) {
  fail(`Expected one appended JSONL event in ${artifactFile}; got ${lines.length}.`);
}

console.log(
  JSON.stringify(
    {
      status: 'pass',
      acceptedEvents,
      rejectedEvents,
      artifactFile,
    },
    null,
    2,
  ),
);

function listen(httpServer, port) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', resolve);
  });
}

async function sendSignedCanary(receiverUrl, signingSecret) {
  const ranAt = new Date().toISOString();
  const payload = {
    event: 'team_audit_event.recorded',
    exportId: randomUUID(),
    auditEvent: {
      id: randomUUID(),
      teamId: randomUUID(),
      actorAccountId: null,
      actorEmail: 'audit-export-smoke@polycost.local',
      action: 'team.updated',
      targetType: 'team',
      targetId: randomUUID(),
      metadata: {
        smokeTest: true,
        runId: `audit-export-local-smoke-${Date.now()}-${randomUUID()}`,
        generatedAt: ranAt,
        purpose: 'audit-export-webhook-contract',
      },
      createdAt: ranAt,
    },
  };
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', signingSecret).update(body).digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(receiverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'polycost-audit-export-smoke/1.0',
        'x-polycost-event': 'team_audit_event.recorded',
        'x-polycost-audit-export-id': payload.exportId,
        'x-polycost-signature-sha256': signature,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      fail(`Audit export local receiver rejected the canary with HTTP ${response.status}.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function close(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBytes) {
        reject(new Error('audit_export_payload_too_large'));
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

function verifySignature(headers, body, signingSecret) {
  const eventName = headerValue(headers, 'x-polycost-event');
  const signature = headerValue(headers, 'x-polycost-signature-sha256') ?? '';

  if (eventName !== 'team_audit_event.recorded') {
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
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
