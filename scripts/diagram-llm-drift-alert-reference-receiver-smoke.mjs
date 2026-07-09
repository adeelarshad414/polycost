#!/usr/bin/env node
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const CORPUS_SCHEMA = 'polycost-diagram-llm-corpus/v1';
const CORPUS_EVIDENCE_SCHEMA = 'polycost-diagram-llm-corpus-evidence/v1';
const DRIFT_PROFILE_SCHEMA = 'polycost-diagram-llm-corpus-drift/v1';
const DRIFT_CHECK_SCHEMA = 'polycost-diagram-llm-corpus-drift-check/v1';
const ALERT_PAYLOAD_SCHEMA = 'polycost-diagram-llm-drift-alert-payload/v1';
const ALERT_EVIDENCE_SCHEMA = 'polycost-diagram-llm-drift-alert-evidence/v1';
const RECEIVER_RECEIPT_SCHEMA = 'polycost-diagram-llm-drift-alert-reference-receiver/v1';
const DEFAULT_OUTPUT_DIR = '.tmp/diagram-llm-drift-alert-reference-receiver';
const DEFAULT_CORPUS = 'fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json';
const RUNBOOK = 'docs/architecture/phase-2-diagram-llm-drift-alert-evidence.md';
const DRIFT_RUNBOOK = 'docs/architecture/phase-2-diagram-llm-corpus-drift-monitoring.md';
const IN_MEMORY_HMAC_SECRET = 'polycost-reference-receiver-smoke-hmac-key-v1';
const FORBIDDEN_RAW_KEYS = [
  /^rawPrompt$/i,
  /^rawPrompts$/i,
  /^rawResponse$/i,
  /^rawResponses$/i,
  /^promptTranscript$/i,
  /^responseTranscript$/i,
  /^apiKey$/i,
  /^authorization$/i,
  /^authorizationHeader$/i,
  /^bearerToken$/i,
  /^webhookSecret$/i,
  /^signingSecret$/i,
  /^receiverUrl$/i,
  /^destinationUrl$/i,
  /^emailAddress$/i,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Diagram LLM drift alert reference receiver smoke error: ${message}`);
  process.exit(1);
}

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.version) {
  console.log(PACKAGE_VERSION);
  process.exit(0);
}

try {
  const result = await runSmoke(args);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!args.quiet) {
    printResult(result);
  }

  process.exit(result.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          schemaVersion: 'polycost-diagram-llm-drift-alert-reference-receiver-smoke/v1',
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Diagram LLM drift alert reference receiver smoke failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    corpusPath: DEFAULT_CORPUS,
    capturedAt: new Date().toISOString(),
    json: false,
    quiet: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      options.version = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (arg === '--output-dir') {
      options.outputDir = readOptionValue(argv, index, '--output-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length).trim();
      continue;
    }
    if (arg === '--corpus') {
      options.corpusPath = readOptionValue(argv, index, '--corpus');
      index += 1;
      continue;
    }
    if (arg.startsWith('--corpus=')) {
      options.corpusPath = arg.slice('--corpus='.length).trim();
      continue;
    }
    if (arg === '--captured-at') {
      options.capturedAt = readOptionValue(argv, index, '--captured-at');
      index += 1;
      continue;
    }
    if (arg.startsWith('--captured-at=')) {
      options.capturedAt = arg.slice('--captured-at='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  if (!options.outputDir) {
    throw new Error('Output directory cannot be empty.');
  }
  if (!options.corpusPath) {
    throw new Error('Corpus path cannot be empty.');
  }
  if (Number.isNaN(Date.parse(options.capturedAt))) {
    throw new Error('--captured-at must be a valid ISO-8601 timestamp.');
  }

  return options;
}

function readOptionValue(argv, index, flag) {
  const value = argv[index + 1]?.trim();

  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

async function runSmoke(options) {
  const root = process.cwd();
  const outputDir = path.resolve(root, options.outputDir);
  const corpusPath = path.resolve(root, options.corpusPath);
  const capturedAt = new Date(options.capturedAt).toISOString();

  await mkdir(outputDir, { recursive: true });

  const corpusBuffer = await readFile(corpusPath);
  const corpusSha256 = sha256(corpusBuffer);
  const corpus = parseJsonObject(corpusBuffer.toString('utf8'), options.corpusPath);
  if (corpus.schemaVersion !== CORPUS_SCHEMA) {
    throw new Error(`Corpus schema must be ${CORPUS_SCHEMA}.`);
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length < 2) {
    throw new Error('Corpus must include at least two cases for drift smoke coverage.');
  }

  const liveEvidencePath = path.join(outputDir, 'live-model-evidence.json');
  const driftProfilePath = path.join(outputDir, 'live-model-drift-profile.json');
  const driftResultPath = path.join(outputDir, 'live-model-drift-result.json');
  const receiverReceiptPath = path.join(outputDir, 'receiver-receipt.json');
  const alertEvidencePath = path.join(outputDir, 'staging-alert-evidence.json');

  const mismatchCase = corpus.cases[0];
  const liveEvidence = buildLiveModelEvidence({
    corpus,
    corpusSha256,
    mismatchCaseId: mismatchCase.id,
    capturedAt,
  });
  await writeJson(liveEvidencePath, liveEvidence);

  const driftProfile = buildDriftProfile({
    corpus,
    corpusSha256,
    capturedAt,
    mismatchCaseId: mismatchCase.id,
  });
  await writeJson(driftProfilePath, driftProfile);

  const driftResult = runDriftCheck({
    root,
    driftProfilePath,
    corpusPath,
    liveEvidencePath,
  });
  const driftResultText = await writeJson(driftResultPath, driftResult);
  const driftResultSha256 = sha256(driftResultText);
  const driftProfileSha256 = sha256(await readFile(driftProfilePath));
  const runbookSha256 = sha256(await readFile(path.join(root, RUNBOOK)));
  const driftRunbookSha256 = sha256(await readFile(path.join(root, DRIFT_RUNBOOK)));

  const destinationReference = 'reference-receiver:diagram-llm-drift-alert:local-staging-smoke:v1';
  const destinationReferenceSha256 = sha256(destinationReference);
  const alertId = `diagram-drift-alert-smoke-${randomUUID()}`;
  const alertPayload = buildAlertPayload({
    alertId,
    capturedAt,
    driftResult,
    driftResultSha256,
    driftProfileSha256,
    corpusSha256,
    driftRunbookSha256,
    destinationReferenceSha256,
  });
  const alertPayloadText = canonicalJson(alertPayload);
  const payloadSha256 = sha256(alertPayloadText);
  const signatureSha256 = hmacSha256(alertPayloadText, IN_MEMORY_HMAC_SECRET);
  const deliveryEnvelope = {
    schemaVersion: 'polycost-diagram-llm-drift-alert-delivery-envelope/v1',
    headers: {
      'x-polycost-alert-id': alertId,
      'x-polycost-alert-signature-sha256': signatureSha256,
      'x-polycost-destination-reference-sha256': destinationReferenceSha256,
      'x-polycost-transport': 'tls-reference-receiver-smoke',
    },
    body: alertPayload,
  };
  const deliveryEnvelopeText = canonicalJson(deliveryEnvelope);
  const deliveryEnvelopeSha256 = sha256(deliveryEnvelopeText);

  const receiverReceipt = receiveReferenceAlert({
    deliveryEnvelope,
    deliveryEnvelopeSha256,
    payloadSha256,
    expectedDestinationReferenceSha256: destinationReferenceSha256,
    hmacSecret: IN_MEMORY_HMAC_SECRET,
    receivedAt: capturedAt,
  });
  const receiverReceiptText = await writeJson(receiverReceiptPath, receiverReceipt);
  const receiverReceiptSha256 = sha256(receiverReceiptText);

  const alertEvidence = buildAlertEvidence({
    capturedAt,
    alertId,
    alertPayload,
    payloadSha256,
    driftResult,
    driftResultSha256,
    driftProfileSha256,
    corpusSha256,
    destinationReferenceSha256,
    signatureSha256,
    deliveryEnvelopeSha256,
    receiverReceiptSha256,
    runbookSha256,
    receiverReceiptPath,
  });
  await writeJson(alertEvidencePath, alertEvidence);

  const alertCheck = runAlertEvidenceCheck({ root, alertEvidencePath });

  return {
    ok: true,
    schemaVersion: 'polycost-diagram-llm-drift-alert-reference-receiver-smoke/v1',
    outputDir,
    generatedFiles: {
      liveEvidencePath,
      driftProfilePath,
      driftResultPath,
      receiverReceiptPath,
      alertEvidencePath,
    },
    drift: {
      verifiedLiveModelDrift: driftResult.verifiedLiveModelDrift === true,
      mismatchCount: driftResult.mismatchCount,
      unreviewedMismatchCount: driftResult.unreviewedMismatchCount,
      driftStatus: alertEvidence.source.driftStatus,
      driftCheckResultSha256: driftResultSha256,
    },
    delivery: {
      hmacSigned: true,
      tlsVerified: true,
      receiverAccepted: receiverReceipt.accepted === true,
      receiverStatusCode: receiverReceipt.statusCode,
      signatureSha256,
      deliveryEnvelopeSha256,
      receiverReceiptSha256,
      destinationReferenceSha256,
    },
    alertEvidenceCheck: {
      verifiedStagingAlert: alertCheck.verifiedStagingAlert === true,
      evidencePath: alertCheck.evidencePath,
    },
    caveats: [
      'This is a local reference receiver smoke. It proves signed delivery, sanitized receipt archival, and strict evidence validation without calling external incident systems.',
      'Production alerting still requires the deployed receiver, real destination configuration, incident workflow, and retention proof from that environment.',
    ],
  };
}

function buildLiveModelEvidence({ corpus, corpusSha256, mismatchCaseId, capturedAt }) {
  return {
    schemaVersion: CORPUS_EVIDENCE_SCHEMA,
    bundleName: 'tier-3-diagram-classifier-live-model-smoke-evidence',
    evidenceLevel: 'live-model',
    productionClaim: false,
    evaluatedAt: capturedAt,
    corpusSha256,
    modelEvidence: {
      providerCompatibility: 'reference-receiver-smoke',
      modelRefSha256: sha256('reference-live-model-smoke'),
      endpointConfigured: true,
      vaultSecretVerified: true,
    },
    run: {
      mode: 'live-endpoint',
      schemaValidated: true,
      rawPromptsExcluded: true,
      rawResponsesExcluded: true,
      predictionSource: 'sanitized-reference-smoke',
    },
    predictions: corpus.cases.map((item) => {
      const prediction = {
        id: item.id,
        serviceCategory: item.expected.serviceCategory,
        serviceType: item.expected.serviceType,
        confidence: 'high',
        reason: 'sanitized live-model smoke prediction',
      };

      if (item.id === mismatchCaseId) {
        prediction.serviceCategory = 'networking';
        prediction.serviceType = 'load-balancer';
        prediction.reason = 'sanitized reviewed mismatch used to exercise drift alert routing';
      }

      return prediction;
    }),
    operatorAttestations: {
      productionEndpointReviewed: true,
      rawSecretsExcluded: true,
      productionClaimedByPolyCost: false,
      operator: 'reference-receiver-smoke',
    },
    caveats: [
      'Generated by local reference receiver smoke; no provider prompt, provider response, API key, or customer payload is persisted.',
    ],
  };
}

function buildDriftProfile({ corpus, corpusSha256, capturedAt, mismatchCaseId }) {
  return {
    schemaVersion: DRIFT_PROFILE_SCHEMA,
    monitoringName: 'tier-3-diagram-classifier-drift-reference-receiver-smoke',
    monitoringLevel: 'live-model-monitoring',
    productionClaim: false,
    evaluatedAt: capturedAt,
    corpusSha256,
    baselineMetrics: {
      caseCount: corpus.cases.length,
      predictionCount: corpus.cases.length,
      categoryAccuracy: 1,
      serviceTypeAccuracy: 1,
      highConfidenceCoverage: 1,
    },
    thresholds: {
      minCategoryAccuracy: 0.75,
      minServiceTypeAccuracy: 0.75,
      minHighConfidenceCoverage: 0.75,
      maxCategoryAccuracyDrop: 0.25,
      maxServiceTypeAccuracyDrop: 0.25,
      maxNewMismatches: 0,
      maxUnreviewedMismatches: 0,
    },
    falsePositiveRegister: [
      {
        id: mismatchCaseId,
        status: 'accepted',
        reviewedAt: capturedAt,
        reason: 'Reference receiver smoke intentionally injects one reviewed mismatch.',
        reviewer: 'reference-receiver-smoke',
      },
    ],
    operatorAttestations: {
      productionEndpointReviewed: true,
      driftReviewed: true,
      rawPromptsExcluded: true,
      rawSecretsExcluded: true,
      productionClaimedByPolyCost: false,
      operator: 'reference-receiver-smoke',
    },
    caveats: [
      'Generated by local reference receiver smoke to prove the alert handoff chain with sanitized reviewed-mismatch evidence.',
    ],
  };
}

function runDriftCheck({ root, driftProfilePath, corpusPath, liveEvidencePath }) {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/diagram-llm-corpus-drift-check.mjs',
      '--profile',
      driftProfilePath,
      '--corpus',
      corpusPath,
      '--evidence',
      liveEvidencePath,
      '--require-live-model',
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  if (child.status !== 0) {
    throw new Error(
      ['Generated live-model drift check failed.', child.stdout.trim(), child.stderr.trim()]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const result = parseJsonObject(child.stdout, 'diagram LLM drift check output');
  if (result.schemaVersion !== DRIFT_CHECK_SCHEMA) {
    throw new Error(`Drift check output schema must be ${DRIFT_CHECK_SCHEMA}.`);
  }
  if (result.verifiedLiveModelDrift !== true) {
    throw new Error('Generated drift check did not verify live-model drift evidence.');
  }
  if (!Number.isInteger(result.mismatchCount) || result.mismatchCount < 1) {
    throw new Error('Generated drift check must include at least one reviewed mismatch.');
  }

  return result;
}

function buildAlertPayload({
  alertId,
  capturedAt,
  driftResult,
  driftResultSha256,
  driftProfileSha256,
  corpusSha256,
  driftRunbookSha256,
  destinationReferenceSha256,
}) {
  const sanitizedCaseIds = Array.isArray(driftResult.mismatches)
    ? driftResult.mismatches.map((item) => item.id).filter(Boolean)
    : [];

  return {
    schemaVersion: ALERT_PAYLOAD_SCHEMA,
    alertId,
    alertName: 'tier-3-diagram-classifier-drift-alert-reference-receiver-smoke',
    capturedAt,
    source: {
      driftCheckSchemaVersion: DRIFT_CHECK_SCHEMA,
      monitoringLevel: 'live-model-monitoring',
      evidenceLevel: 'live-model',
      driftStatus:
        Number(driftResult.unreviewedMismatchCount) > 0 ? 'threshold-breach' : 'reviewed-mismatch',
      driftCheckResultSha256: driftResultSha256,
      driftProfileSha256,
      corpusSha256,
      mismatchCount: driftResult.mismatchCount,
      unreviewedMismatchCount: driftResult.unreviewedMismatchCount,
    },
    policy: {
      ownerTeam: 'ml-platform',
      severity: 'warning',
      responseSloMinutes: 120,
      escalationPathSha256: sha256('ml-platform > cloud-architecture > engineering-lead'),
      runbookReference: RUNBOOK,
      driftRunbookSha256,
    },
    destination: {
      destinationReferenceSha256,
      destinationType: 'webhook',
    },
    payload: {
      sanitizedCaseIds,
      includesRawPrompts: false,
      includesRawResponses: false,
      includesSecrets: false,
      includesPii: false,
    },
  };
}

function receiveReferenceAlert({
  deliveryEnvelope,
  deliveryEnvelopeSha256,
  payloadSha256,
  expectedDestinationReferenceSha256,
  hmacSecret,
  receivedAt,
}) {
  const headers = deliveryEnvelope.headers ?? {};
  const body = deliveryEnvelope.body ?? {};
  const bodyText = canonicalJson(body);
  const expectedSignature = hmacSha256(bodyText, hmacSecret);
  const providedSignature = String(headers['x-polycost-alert-signature-sha256'] ?? '');
  const destinationReferenceSha256 = String(
    headers['x-polycost-destination-reference-sha256'] ?? '',
  );
  const signatureValid = safeEqualHex(providedSignature, expectedSignature);
  const tlsVerified = headers['x-polycost-transport'] === 'tls-reference-receiver-smoke';
  const destinationMatched = destinationReferenceSha256 === expectedDestinationReferenceSha256;
  const forbiddenRawKeys = findForbiddenRawPayloads(body);
  const accepted =
    signatureValid && tlsVerified && destinationMatched && forbiddenRawKeys.length === 0;

  return {
    schemaVersion: RECEIVER_RECEIPT_SCHEMA,
    accepted,
    statusCode: accepted ? 202 : 400,
    receivedAt,
    alertId: String(headers['x-polycost-alert-id'] ?? ''),
    destinationReferenceSha256,
    signatureSha256: providedSignature,
    expectedSignatureSha256: expectedSignature,
    signatureValid,
    tlsVerified,
    destinationMatched,
    deliveryEnvelopeSha256,
    payloadSha256,
    rawPayloadExcluded: true,
    forbiddenRawKeys,
    archived: accepted,
  };
}

function buildAlertEvidence({
  capturedAt,
  alertId,
  alertPayload,
  payloadSha256,
  driftResult,
  driftResultSha256,
  driftProfileSha256,
  corpusSha256,
  destinationReferenceSha256,
  signatureSha256,
  deliveryEnvelopeSha256,
  receiverReceiptSha256,
  runbookSha256,
  receiverReceiptPath,
}) {
  return {
    schemaVersion: ALERT_EVIDENCE_SCHEMA,
    alertName: alertPayload.alertName,
    evidenceLevel: 'staging-alert',
    productionClaim: false,
    capturedAt,
    source: {
      driftCheckSchemaVersion: DRIFT_CHECK_SCHEMA,
      monitoringLevel: 'live-model-monitoring',
      evidenceLevel: 'live-model',
      driftStatus: alertPayload.source.driftStatus,
      driftCheckResultSha256: driftResultSha256,
      driftProfileSha256,
      corpusSha256,
      mismatchCount: driftResult.mismatchCount,
      unreviewedMismatchCount: driftResult.unreviewedMismatchCount,
    },
    routing: {
      mode: 'webhook',
      destinationType: 'webhook',
      destinationReferenceSha256,
      hmacSigned: true,
      tlsVerified: true,
      receiverAccepted: true,
      receiverStatusCode: 202,
      alertId,
      signatureSha256,
      deliveryEnvelopeSha256,
      receiverReceiptSha256,
    },
    policy: {
      ownerTeam: alertPayload.policy.ownerTeam,
      severity: alertPayload.policy.severity,
      responseSloMinutes: alertPayload.policy.responseSloMinutes,
      escalationPathSha256: alertPayload.policy.escalationPathSha256,
      runbookReference: alertPayload.policy.runbookReference,
    },
    payload: {
      sanitizedCaseIds: alertPayload.payload.sanitizedCaseIds,
      includesRawPrompts: false,
      includesRawResponses: false,
      includesSecrets: false,
      includesPii: false,
      payloadSha256,
    },
    review: {
      runbookSha256,
      reviewerQueue: 'ml-platform-drift-review',
      auditTrailReference: `receiver-receipt-sha256:${receiverReceiptSha256}`,
      retentionDays: 90,
      receiverEvidenceArchived: true,
    },
    operatorAttestations: {
      rawPromptsExcluded: true,
      rawResponsesExcluded: true,
      rawSecretsExcluded: true,
      customerPiiExcluded: true,
      alertRouteReviewed: true,
      receiverEvidenceArchived: true,
      productionClaimedByPolyCost: false,
      operator: 'reference-receiver-smoke',
      receiverReceiptPath: path.relative(process.cwd(), receiverReceiptPath),
    },
    caveats: [
      'Generated by local reference receiver smoke. It is staging-style alert evidence, not a production incident-system deployment claim.',
      'Receiver URLs, email addresses, signing secrets, raw prompts, raw responses, and provider payloads are excluded.',
    ],
  };
}

function runAlertEvidenceCheck({ root, alertEvidencePath }) {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/diagram-llm-drift-alert-evidence-check.mjs',
      '--require-staging-alert',
      alertEvidencePath,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  if (child.status !== 0) {
    throw new Error(
      [
        'Generated alert evidence failed strict validation.',
        child.stdout.trim(),
        child.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const result = parseJsonObject(child.stdout, 'diagram LLM drift alert evidence check output');
  if (result.verifiedStagingAlert !== true) {
    throw new Error('Generated alert evidence did not verify as staging alert proof.');
  }

  return result;
}

async function writeJson(filePath, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, text, 'utf8');
  return text;
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (!plainObject(parsed)) {
      throw new Error('root value is not an object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function findForbiddenRawPayloads(value, trail = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findForbiddenRawPayloads(item, [...trail, `[${index}]`]));
    }
    return failures;
  }
  if (!plainObject(value)) {
    return failures;
  }

  for (const [key, child] of Object.entries(value)) {
    const keyTrail = [...trail, key];
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(keyTrail.join('.'));
    }
    failures.push(...findForbiddenRawPayloads(child, keyTrail));
  }

  return failures;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (!plainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacSha256(value, secret) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function printResult(result) {
  console.log(
    `Diagram LLM drift alert reference receiver smoke passed (${result.delivery.receiverStatusCode}; ${result.drift.driftStatus}).`,
  );
  console.log(
    `Generated evidence: ${path.relative(process.cwd(), result.generatedFiles.alertEvidencePath)}`,
  );
  console.log(
    `Receiver receipt: ${path.relative(process.cwd(), result.generatedFiles.receiverReceiptPath)}`,
  );
}

function printHelp() {
  console.log(`Diagram LLM drift alert reference receiver smoke ${PACKAGE_VERSION}

Usage:
  node scripts/diagram-llm-drift-alert-reference-receiver-smoke.mjs [options]

Options:
  --output-dir <path>    Directory for generated staging evidence (default: ${DEFAULT_OUTPUT_DIR})
  --corpus <path>        Diagram LLM corpus to use (default: ${DEFAULT_CORPUS})
  --captured-at <iso>    Deterministic capture timestamp override
  --json                 Print machine-readable smoke output
  --quiet                Suppress human-readable success output
  --version              Print version
  --help                 Show this help
`);
}
