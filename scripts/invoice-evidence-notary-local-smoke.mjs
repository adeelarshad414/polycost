import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secret =
  process.env.INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET ??
  'local-invoice-evidence-notary-smoke-secret-32chars';
const receiverPath =
  process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_SMOKE_PATH ?? '/polycost/evidence-receipts';
const requestedPort = Number(process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_SMOKE_PORT ?? 0);
const artifactDir =
  process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_SMOKE_DIR ??
  path.join(root, 'artifacts', 'invoice-evidence-notary-smoke');
const artifactFile = path.join(
  artifactDir,
  `invoice-evidence-notary-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
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

    const body = await readRequestBody(request, 512 * 1024);
    const verification = verifySignature(request.headers, body, secret);

    if (!verification.ok) {
      rejectedEvents += 1;
      writeJson(response, 401, { error: verification.error });
      return;
    }

    const payload = parsePayload(body);
    const validation = validateNotaryPayload(request.headers, payload);

    if (!validation.ok) {
      rejectedEvents += 1;
      writeJson(response, 400, { error: validation.error });
      return;
    }

    const record = {
      schemaVersion: 'invoice-evidence-notary-receiver-smoke/v1',
      receivedAt: new Date().toISOString(),
      bodySha256: sha256(body),
      headers: {
        event: headerValue(request.headers, 'x-polycost-event'),
        reconciliationId: headerValue(request.headers, 'x-polycost-reconciliation-id'),
        packetDigestSha256: headerValue(request.headers, 'x-polycost-packet-digest-sha256'),
        basePayloadDigestSha256: headerValue(
          request.headers,
          'x-polycost-base-payload-digest-sha256',
        ),
        signatureSha256Prefix: verification.signature.slice(0, 12),
      },
      payload: {
        schemaVersion: payload.schemaVersion,
        event: payload.event,
        exportedAt: payload.exportedAt,
        runId: payload.packet?.readiness?.smokeRunId,
        subject: payload.subject,
        receiptMode: payload.receiptMode,
        receiptStatus: payload.receiptStatus,
        actor: payload.actor,
      },
      archive: {
        localArtifactOnly: true,
        immutableRetentionProved: false,
        operatorAction:
          'Archive the real receiver record, retention policy, access controls, and object-lock/WORM evidence for staging or production.',
      },
    };

    await appendFile(artifactFile, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
      flag: 'a',
    });
    acceptedEvents += 1;
    writeJson(response, 202, {
      status: 'accepted',
      reconciliationId: validation.reconciliationId,
      packetDigestSha256: validation.packetDigestSha256,
      basePayloadDigestSha256: validation.basePayloadDigestSha256,
    });
  } catch (error) {
    rejectedEvents += 1;
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'invoice_evidence_notary_receiver_error',
    });
  }
});

await listen(server, requestedPort);

const address = server.address();
if (!address || typeof address === 'string') {
  await close(server);
  fail('Invoice evidence notary local smoke receiver did not bind a TCP port.');
}

const receiverUrl = `http://127.0.0.1:${address.port}${receiverPath}`;
console.log(`Invoice evidence notary local receiver listening at ${receiverUrl}`);

await sendSignedCanary(receiverUrl, secret);

await close(server);

if (acceptedEvents !== 1 || rejectedEvents !== 0) {
  fail(`Expected one accepted handoff and zero rejects; got ${acceptedEvents}/${rejectedEvents}.`);
}

const lines = (await readFile(artifactFile, 'utf8')).trim().split('\n');

if (lines.length !== 1) {
  fail(`Expected one appended JSONL handoff in ${artifactFile}; got ${lines.length}.`);
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
  const payload = buildSmokeHandoffPayload();
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', signingSecret).update(body).digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(receiverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'polycost-invoice-evidence-notary-smoke/1.0',
        'x-polycost-event': 'invoice_evidence_packet.exported',
        'x-polycost-reconciliation-id': payload.subject.reconciliationId,
        'x-polycost-packet-digest-sha256': payload.packetDigestSha256,
        'x-polycost-base-payload-digest-sha256': payload.basePayloadDigestSha256,
        'x-polycost-signature-sha256': signature,
        'x-polycost-signing-key-reference': 'local://invoice-evidence-notary-smoke-signing-key',
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      fail(
        `Invoice evidence notary local receiver rejected the canary with HTTP ${response.status}.`,
      );
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

function buildSmokeHandoffPayload() {
  const exportedAt = new Date().toISOString();
  const runId =
    process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_SMOKE_RUN_ID ??
    `invoice-evidence-notary-smoke-${Date.now()}-${randomUUID()}`;
  const subject = {
    reconciliationId: randomUUID(),
    importRunId: randomUUID(),
    comparisonId: randomUUID(),
    provider: 'aws',
  };
  const basePacketPayload = {
    packetVersion: 'invoice-evidence-packet/v1',
    packetStatus: 'review-ready',
    generatedAt: exportedAt,
    reconciliation: {
      id: subject.reconciliationId,
      importRunId: subject.importRunId,
      comparisonId: subject.comparisonId,
      provider: subject.provider,
      estimatedTotalUsd: 100,
      invoicedTotalUsd: 107,
      varianceUsd: 7,
      variancePercent: 7,
      status: 'variance-warning',
      createdAt: exportedAt,
    },
    importRun: {
      id: subject.importRunId,
      provider: subject.provider,
      sourceType: 'aws-cur',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-06-30',
      originalFileSha256: sha256(`invoice-evidence-notary-smoke:${runId}:source`),
      rowsAccepted: 1,
      rowsRejected: 0,
      totalCostUsd: 107,
      createdAt: exportedAt,
    },
    readiness: {
      smokeRunId: runId,
      purpose: 'invoice-evidence-notary-webhook-contract',
    },
    matchSummary: {
      readiness: 'audit-ready-with-caveats',
    },
    artifactRegister: {
      registeredCount: 0,
      verifiedCount: 0,
      artifacts: [],
    },
    artifactGovernance: {
      schemaVersion: 'invoice-evidence-governance/v1',
      generatedAt: exportedAt,
      storageReadiness: {
        storageBackend: 'database-bytea',
        scannerMode: 'eicar-signature-only',
        retentionEnforcementMode: 'report-only',
        productionReady: false,
        credentialSource: 'database-connection',
        gaps: ['local smoke artifact is not immutable retention proof'],
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
        malwareScanPassedCount: 0,
        malwareScanFailedCount: 0,
        malwareScannerEngines: [],
      },
      productionGates: {
        externalObjectStorageReady: false,
        customerManagedKmsReady: false,
        malwareScanningReady: false,
        retentionPolicyReady: false,
        retentionDeletionReady: false,
        packetIntegrityReady: true,
        auditTrailReady: true,
      },
      gaps: ['local smoke receiver is not production WORM storage'],
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
    caveats: ['This is a notary/WORM receiver smoke packet, not a customer invoice.'],
    disclaimers: ['Full invoice-grade billing still requires provider invoice review.'],
  };
  const basePayloadDigestSha256 = sha256(stableJson(basePacketPayload));
  const receipt = {
    schemaVersion: 'invoice-evidence-receipt/v1',
    mode: 'external-webhook',
    status: 'external-notary-ready',
    issuedAt: exportedAt,
    subject,
    basePayloadDigestSha256,
    basePayloadByteLength: Buffer.byteLength(stableJson(basePacketPayload), 'utf8'),
    signature: {
      algorithm: 'hmac-sha256',
      keyReference: 'local://invoice-evidence-notary-smoke-signing-key',
      signedPayloadDigestSha256: sha256(
        stableJson({
          schemaVersion: 'invoice-evidence-receipt-signature/v1',
          issuedAt: exportedAt,
          subject,
          basePayloadDigestSha256,
          basePayloadByteLength: Buffer.byteLength(stableJson(basePacketPayload), 'utf8'),
          mode: 'external-webhook',
          wormRetentionMode: 'external-worm-receiver',
        }),
      ),
      signature: sha256(`invoice-evidence-notary-smoke:${runId}:receipt`),
      signedFields: [
        'basePayloadByteLength',
        'basePayloadDigestSha256',
        'issuedAt',
        'mode',
        'schemaVersion',
        'subject',
        'wormRetentionMode',
      ],
    },
    notary: {
      deliveryMode: 'operator-forwarded-webhook',
      urlHost: '127.0.0.1',
      urlSha256: sha256(receiverPath),
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
    caveats: ['Local receiver smoke proves signature validation, not immutable retention.'],
  };
  const packetPayload = {
    ...basePacketPayload,
    receipt,
  };
  const packet = {
    ...packetPayload,
    integrity: {
      schemaVersion: 'invoice-evidence-packet-integrity/v1',
      canonicalization: 'stable-json:v1',
      digestAlgorithm: 'sha256',
      payloadDigestSha256: sha256(stableJson(packetPayload)),
      payloadByteLength: Buffer.byteLength(stableJson(packetPayload), 'utf8'),
      subject,
      artifactCount: 0,
      storedArtifactCount: 0,
      verifiedArtifactCount: 0,
      caveatCount: packetPayload.caveats.length,
      disclaimerCount: packetPayload.disclaimers.length,
      generatedAt: exportedAt,
    },
  };

  return {
    schemaVersion: 'invoice-evidence-notary-handoff/v1',
    event: 'invoice_evidence_packet.exported',
    exportedAt,
    subject,
    packetDigestSha256: packet.integrity.payloadDigestSha256,
    basePayloadDigestSha256,
    receiptStatus: receipt.status,
    receiptMode: receipt.mode,
    actor: {
      accountId: randomUUID(),
      email: 'invoice-evidence-notary-smoke@polycost.local',
      teamId: randomUUID(),
    },
    packet,
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

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
