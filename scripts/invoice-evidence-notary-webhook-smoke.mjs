import { createHash, createHmac, randomUUID } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const webhookUrl = args.url ?? process.env.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL;
const webhookSecret = args.secret ?? process.env.INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET;
const signingKeyReference =
  args.keyReference ??
  process.env.INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE ??
  'operator-provided-notary-smoke-key';
const timeoutMs = Number(
  args.timeoutMs ?? process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_SMOKE_TIMEOUT_MS ?? 15_000,
);

if (!webhookUrl) {
  fail('INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL or --url is required.');
}

if (!webhookSecret || webhookSecret.length < 32 || isDummyCredential(webhookSecret)) {
  fail(
    'INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET or --secret must be a non-dummy value of 32+ chars.',
  );
}

const parsedUrl = parseWebhookUrl(webhookUrl);
const localHttpAllowed =
  args.allowHttpLocal === true && parsedUrl.protocol === 'http:' && isLocalhost(parsedUrl.hostname);

if (parsedUrl.protocol !== 'https:' && !localHttpAllowed) {
  fail(
    'Invoice evidence notary smoke targets must use HTTPS unless --allow-http-local is set for localhost.',
  );
}

const payload = buildSmokeHandoffPayload(parsedUrl);
const body = JSON.stringify(payload);
const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(parsedUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'polycost-invoice-evidence-notary-smoke/1.0',
      'x-polycost-event': 'invoice_evidence_packet.exported',
      'x-polycost-reconciliation-id': payload.subject.reconciliationId,
      'x-polycost-packet-digest-sha256': payload.packetDigestSha256,
      'x-polycost-base-payload-digest-sha256': payload.basePayloadDigestSha256,
      'x-polycost-signature-sha256': signature,
      'x-polycost-signing-key-reference': signingKeyReference,
    },
    body,
    signal: controller.signal,
  });
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    fail(
      `Invoice evidence notary webhook smoke failed with HTTP ${response.status}: ${responseText.slice(
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
        runId: payload.packet.readiness.smokeRunId,
        reconciliationId: payload.subject.reconciliationId,
        packetDigestSha256: payload.packetDigestSha256,
        basePayloadDigestSha256: payload.basePayloadDigestSha256,
        responseBytes: responseText.length,
        exportedAt: payload.exportedAt,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  fail(`Invoice evidence notary webhook smoke request failed: ${message}`);
} finally {
  clearTimeout(timeout);
}

function buildSmokeHandoffPayload(receiverUrl) {
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
        gaps: ['smoke packet is not immutable retention proof'],
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
      gaps: ['smoke packet is not production WORM storage'],
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
  const basePayloadByteLength = Buffer.byteLength(stableJson(basePacketPayload), 'utf8');
  const receipt = {
    schemaVersion: 'invoice-evidence-receipt/v1',
    mode: 'external-webhook',
    status: 'external-notary-ready',
    issuedAt: exportedAt,
    subject,
    basePayloadDigestSha256,
    basePayloadByteLength,
    signature: {
      algorithm: 'hmac-sha256',
      keyReference: signingKeyReference,
      signedPayloadDigestSha256: sha256(
        stableJson({
          schemaVersion: 'invoice-evidence-receipt-signature/v1',
          issuedAt: exportedAt,
          subject,
          basePayloadDigestSha256,
          basePayloadByteLength,
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
      urlHost: receiverUrl.host,
      urlSha256: sha256(receiverUrl.toString()),
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
    caveats: ['Smoke packet proves receiver contract only; archive receiver-side WORM evidence.'],
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

    if (arg.startsWith('--key-reference=')) {
      parsed.keyReference = arg.slice('--key-reference='.length);
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
    fail('Invoice evidence notary webhook URL is not a valid URL.');
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
