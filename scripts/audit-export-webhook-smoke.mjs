import { createHmac, randomUUID } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const webhookUrl = args.url ?? process.env.AUTH_AUDIT_EXPORT_WEBHOOK_URL;
const webhookSecret = args.secret ?? process.env.AUTH_AUDIT_EXPORT_WEBHOOK_SECRET;
const timeoutMs = Number(
  args.timeoutMs ?? process.env.POLYCOST_AUDIT_EXPORT_SMOKE_TIMEOUT_MS ?? 15_000,
);

if (!webhookUrl) {
  fail('AUTH_AUDIT_EXPORT_WEBHOOK_URL or --url is required.');
}

if (!webhookSecret || webhookSecret.length < 16 || isDummyCredential(webhookSecret)) {
  fail('AUTH_AUDIT_EXPORT_WEBHOOK_SECRET or --secret must be a non-dummy value of 16+ chars.');
}

const parsedUrl = parseWebhookUrl(webhookUrl);
const localHttpAllowed =
  args.allowHttpLocal === true && parsedUrl.protocol === 'http:' && isLocalhost(parsedUrl.hostname);

if (parsedUrl.protocol !== 'https:' && !localHttpAllowed) {
  fail('Audit export smoke targets must use HTTPS unless --allow-http-local is set for localhost.');
}

const ranAt = new Date().toISOString();
const payload = buildSmokePayload(ranAt);
const body = JSON.stringify(payload);
const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(parsedUrl, {
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
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    fail(
      `Audit export webhook smoke failed with HTTP ${response.status}: ${responseText.slice(
        0,
        240,
      )}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        receiver: redactUrl(parsedUrl),
        httpStatus: response.status,
        runId: payload.auditEvent.metadata.runId,
        exportId: payload.exportId,
        auditEventId: payload.auditEvent.id,
        responseBytes: responseText.length,
        ranAt,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  fail(`Audit export webhook smoke request failed: ${message}`);
} finally {
  clearTimeout(timeout);
}

function buildSmokePayload(ranAt) {
  const runId =
    process.env.POLYCOST_AUDIT_EXPORT_SMOKE_RUN_ID ??
    `audit-export-smoke-${Date.now()}-${randomUUID()}`;

  return {
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
        runId,
        generatedAt: ranAt,
        purpose: 'audit-export-webhook-contract',
      },
      createdAt: ranAt,
    },
  };
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
    fail('Audit export webhook URL is not a valid URL.');
  }
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
