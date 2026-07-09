#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const EVIDENCE_SCHEMA = 'polycost-diagram-llm-drift-alert-evidence/v1';
const CHECK_SCHEMA = 'polycost-diagram-llm-drift-alert-evidence-check/v1';
const DRIFT_CHECK_SCHEMA = 'polycost-diagram-llm-corpus-drift-check/v1';
const DEFAULT_EVIDENCE =
  'docs/operations/evidence/diagram-llm-drift-alert/diagram-llm-drift-alert.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_LEVELS = new Set(['example-schema', 'staging-alert']);
const SUPPORTED_ROUTING_MODES = new Set(['sample', 'webhook', 'incident-system']);
const SUPPORTED_DESTINATION_TYPES = new Set([
  'example',
  'webhook',
  'slack',
  'pagerduty',
  'opsgenie',
  'jira',
  'email',
  'siem',
]);
const SUPPORTED_DRIFT_STATUSES = new Set(['no-drift', 'threshold-breach', 'reviewed-mismatch']);
const SUPPORTED_SEVERITIES = new Set(['info', 'warning', 'critical']);
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
const SECRET_VALUE_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /CHANGE_ME_DEV_ONLY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsig=[A-Za-z0-9%._~+/=-]{12,}/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /https?:\/\/[^\s"']+/i,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Diagram LLM drift alert evidence check error: ${message}`);
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
  const result = await checkEvidence(args);

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
          schemaVersion: CHECK_SCHEMA,
          evidencePath: args.evidencePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Diagram LLM drift alert evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    evidencePath: DEFAULT_EVIDENCE,
    requireStagingAlert: false,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };
  const positionals = [];

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
    if (arg === '--require-staging-alert') {
      options.requireStagingAlert = true;
      continue;
    }
    if (arg === '--evidence') {
      options.evidencePath = readOptionValue(argv, index, '--evidence');
      index += 1;
      continue;
    }
    if (arg.startsWith('--evidence=')) {
      options.evidencePath = arg.slice('--evidence='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.evidencePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one alert evidence path.');
  }
  if (!options.evidencePath) {
    throw new Error('Alert evidence path cannot be empty.');
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

async function checkEvidence(options) {
  const root = process.cwd();
  const evidencePath = path.resolve(root, options.evidencePath);
  const evidence = parseJsonObject(await readFile(evidencePath, 'utf8'), options.evidencePath);
  const failures = [];
  const evidenceLevel = stringValue(evidence.evidenceLevel);
  const source = plainObject(evidence.source);
  const routing = plainObject(evidence.routing);
  const policy = plainObject(evidence.policy);
  const payload = plainObject(evidence.payload);
  const review = plainObject(evidence.review);
  const operatorAttestations = plainObject(evidence.operatorAttestations);

  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    failures.push(`schemaVersion must be ${EVIDENCE_SCHEMA}.`);
  }
  if (!SUPPORTED_LEVELS.has(evidenceLevel)) {
    failures.push('evidenceLevel must be example-schema or staging-alert.');
  }
  if (evidence.productionClaim === true) {
    failures.push(
      'productionClaim must remain false; this validates alert evidence, not production deployment.',
    );
  }
  if (!isValidDateString(evidence.capturedAt)) {
    failures.push('capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (options.requireStagingAlert && evidenceLevel !== 'staging-alert') {
    failures.push('evidenceLevel must be staging-alert when --require-staging-alert is used.');
  }

  failures.push(...findForbiddenRawPayloads(evidence));
  failures.push(...findSecretMaterial(evidence));
  failures.push(...validateSource(source, options));
  failures.push(...validateRouting(routing, options));
  failures.push(...validatePolicy(policy));
  failures.push(...validatePayload(payload));
  failures.push(...validateReview(review, options));
  failures.push(...validateOperatorAttestations(operatorAttestations, options));

  const verifiedStagingAlert =
    failures.length === 0 &&
    evidenceLevel === 'staging-alert' &&
    routing?.receiverAccepted === true &&
    operatorAttestations?.alertRouteReviewed === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    evidencePath,
    evidenceLevel,
    alertName: stringValue(evidence.alertName),
    severity: policy?.severity,
    ownerTeam: policy?.ownerTeam,
    routingMode: routing?.mode,
    destinationType: routing?.destinationType,
    driftStatus: source?.driftStatus,
    mismatchCount: nonNegativeInteger(source?.mismatchCount) ? source.mismatchCount : undefined,
    unreviewedMismatchCount: nonNegativeInteger(source?.unreviewedMismatchCount)
      ? source.unreviewedMismatchCount
      : undefined,
    sanitizedCaseCount: Array.isArray(payload?.sanitizedCaseIds)
      ? payload.sanitizedCaseIds.length
      : 0,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedStagingAlert,
    stagingAlertRequired: evidenceLevel !== 'staging-alert',
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the drift-alert evidence contract with sanitized sample data; it is not production alert proof.'
        : 'This validates archived staging alert evidence; production alert readiness still depends on the deployed receiver and incident workflow.',
      'Raw prompts, raw provider responses, receiver URLs, email addresses, API keys, and signing secrets must stay out of alert evidence bundles.',
    ],
    failures,
  };
}

function validateSource(source, options) {
  const failures = [];

  if (!source) {
    return ['source must be an object.'];
  }
  if (source.driftCheckSchemaVersion !== DRIFT_CHECK_SCHEMA) {
    failures.push(`source.driftCheckSchemaVersion must be ${DRIFT_CHECK_SCHEMA}.`);
  }
  if (!['example-schema', 'live-model-monitoring'].includes(source.monitoringLevel)) {
    failures.push('source.monitoringLevel must be example-schema or live-model-monitoring.');
  }
  if (!['example-schema', 'live-model'].includes(source.evidenceLevel)) {
    failures.push('source.evidenceLevel must be example-schema or live-model.');
  }
  if (!SUPPORTED_DRIFT_STATUSES.has(source.driftStatus)) {
    failures.push('source.driftStatus must be no-drift, threshold-breach, or reviewed-mismatch.');
  }
  for (const key of ['driftCheckResultSha256', 'driftProfileSha256', 'corpusSha256']) {
    if (!SHA256_PATTERN.test(String(source[key] ?? ''))) {
      failures.push(`source.${key} must be a SHA-256 hex digest.`);
    }
  }
  if (!nonNegativeInteger(source.mismatchCount)) {
    failures.push('source.mismatchCount must be a non-negative integer.');
  }
  if (!nonNegativeInteger(source.unreviewedMismatchCount)) {
    failures.push('source.unreviewedMismatchCount must be a non-negative integer.');
  }
  if (options.requireStagingAlert) {
    if (source.monitoringLevel !== 'live-model-monitoring') {
      failures.push(
        'source.monitoringLevel must be live-model-monitoring for staging alert proof.',
      );
    }
    if (source.evidenceLevel !== 'live-model') {
      failures.push('source.evidenceLevel must be live-model for staging alert proof.');
    }
    if (source.driftStatus === 'no-drift') {
      failures.push('source.driftStatus must represent a drift event for staging alert proof.');
    }
    if (source.mismatchCount < 1) {
      failures.push('source.mismatchCount must be at least 1 for staging alert proof.');
    }
  }

  return failures;
}

function validateRouting(routing, options) {
  const failures = [];

  if (!routing) {
    return ['routing must be an object.'];
  }
  if (!SUPPORTED_ROUTING_MODES.has(routing.mode)) {
    failures.push('routing.mode must be sample, webhook, or incident-system.');
  }
  if (!SUPPORTED_DESTINATION_TYPES.has(routing.destinationType)) {
    failures.push('routing.destinationType is not supported.');
  }
  if (!SHA256_PATTERN.test(String(routing.destinationReferenceSha256 ?? ''))) {
    failures.push('routing.destinationReferenceSha256 must be a SHA-256 hex digest.');
  }
  if (typeof routing.hmacSigned !== 'boolean') {
    failures.push('routing.hmacSigned must be boolean.');
  }
  if (typeof routing.tlsVerified !== 'boolean') {
    failures.push('routing.tlsVerified must be boolean.');
  }
  if (typeof routing.receiverAccepted !== 'boolean') {
    failures.push('routing.receiverAccepted must be boolean.');
  }
  if (
    routing.receiverStatusCode !== undefined &&
    (!Number.isInteger(routing.receiverStatusCode) ||
      routing.receiverStatusCode < 100 ||
      routing.receiverStatusCode > 599)
  ) {
    failures.push('routing.receiverStatusCode must be an HTTP status integer.');
  }
  if (!isNonEmptyString(routing.alertId)) {
    failures.push('routing.alertId is required.');
  }
  for (const key of ['signatureSha256', 'deliveryEnvelopeSha256', 'receiverReceiptSha256']) {
    if (routing[key] !== undefined && !SHA256_PATTERN.test(String(routing[key] ?? ''))) {
      failures.push(`routing.${key} must be a SHA-256 hex digest when present.`);
    }
  }

  if (options.requireStagingAlert) {
    if (routing.mode === 'sample') {
      failures.push('routing.mode must be webhook or incident-system for staging alert proof.');
    }
    if (routing.destinationType === 'example') {
      failures.push('routing.destinationType must not be example for staging alert proof.');
    }
    if (routing.hmacSigned !== true) {
      failures.push('routing.hmacSigned must be true for staging alert proof.');
    }
    if (routing.tlsVerified !== true) {
      failures.push('routing.tlsVerified must be true for staging alert proof.');
    }
    if (routing.receiverAccepted !== true) {
      failures.push('routing.receiverAccepted must be true for staging alert proof.');
    }
    if (
      !Number.isInteger(routing.receiverStatusCode) ||
      routing.receiverStatusCode < 200 ||
      routing.receiverStatusCode > 299
    ) {
      failures.push('routing.receiverStatusCode must be 2xx for staging alert proof.');
    }
    if (routing.alertId === 'example-only') {
      failures.push('routing.alertId must identify the staging alert event.');
    }
    for (const key of ['signatureSha256', 'deliveryEnvelopeSha256', 'receiverReceiptSha256']) {
      if (!SHA256_PATTERN.test(String(routing[key] ?? ''))) {
        failures.push(`routing.${key} is required for staging alert proof.`);
      }
    }
  }

  return failures;
}

function validatePolicy(policy) {
  const failures = [];

  if (!policy) {
    return ['policy must be an object.'];
  }
  if (!isNonEmptyString(policy.ownerTeam) || policy.ownerTeam === 'example-only') {
    failures.push('policy.ownerTeam must name the owning team.');
  }
  if (!SUPPORTED_SEVERITIES.has(policy.severity)) {
    failures.push('policy.severity must be info, warning, or critical.');
  }
  if (!Number.isInteger(policy.responseSloMinutes) || policy.responseSloMinutes <= 0) {
    failures.push('policy.responseSloMinutes must be a positive integer.');
  }
  if (!SHA256_PATTERN.test(String(policy.escalationPathSha256 ?? ''))) {
    failures.push('policy.escalationPathSha256 must be a SHA-256 hex digest.');
  }
  if (!isNonEmptyString(policy.runbookReference)) {
    failures.push('policy.runbookReference is required.');
  }

  return failures;
}

function validatePayload(payload) {
  const failures = [];

  if (!payload) {
    return ['payload must be an object.'];
  }
  if (!Array.isArray(payload.sanitizedCaseIds)) {
    failures.push('payload.sanitizedCaseIds must be an array.');
  } else {
    for (const [index, item] of payload.sanitizedCaseIds.entries()) {
      if (!isNonEmptyString(item)) {
        failures.push(`payload.sanitizedCaseIds[${index}] must be a non-empty string.`);
      }
    }
  }
  for (const key of [
    'includesRawPrompts',
    'includesRawResponses',
    'includesSecrets',
    'includesPii',
  ]) {
    if (payload[key] !== false) {
      failures.push(`payload.${key} must be false.`);
    }
  }
  if (!SHA256_PATTERN.test(String(payload.payloadSha256 ?? ''))) {
    failures.push('payload.payloadSha256 must be a SHA-256 hex digest.');
  }

  return failures;
}

function validateReview(review, options) {
  const failures = [];

  if (!review) {
    return ['review must be an object.'];
  }
  if (!SHA256_PATTERN.test(String(review.runbookSha256 ?? ''))) {
    failures.push('review.runbookSha256 must be a SHA-256 hex digest.');
  }
  if (
    !isNonEmptyString(review.reviewerQueue) ||
    (options.requireStagingAlert && review.reviewerQueue === 'example-only')
  ) {
    failures.push('review.reviewerQueue must name the reviewer queue.');
  }
  if (!isNonEmptyString(review.auditTrailReference)) {
    failures.push('review.auditTrailReference is required.');
  }
  if (!Number.isInteger(review.retentionDays) || review.retentionDays < 30) {
    failures.push('review.retentionDays must be at least 30.');
  }
  if (options.requireStagingAlert && review.receiverEvidenceArchived !== true) {
    failures.push('review.receiverEvidenceArchived must be true for staging alert proof.');
  }

  return failures;
}

function validateOperatorAttestations(attestations, options) {
  const failures = [];

  if (!attestations) {
    return ['operatorAttestations must be an object.'];
  }
  for (const key of [
    'rawPromptsExcluded',
    'rawResponsesExcluded',
    'rawSecretsExcluded',
    'customerPiiExcluded',
  ]) {
    if (attestations[key] !== true) {
      failures.push(`operatorAttestations.${key} must be true.`);
    }
  }
  if (attestations.productionClaimedByPolyCost !== false) {
    failures.push('operatorAttestations.productionClaimedByPolyCost must be false.');
  }
  if (options.requireStagingAlert) {
    if (attestations.alertRouteReviewed !== true) {
      failures.push(
        'operatorAttestations.alertRouteReviewed must be true for staging alert proof.',
      );
    }
    if (attestations.receiverEvidenceArchived !== true) {
      failures.push(
        'operatorAttestations.receiverEvidenceArchived must be true for staging alert proof.',
      );
    }
    if (!isNonEmptyString(attestations.operator) || attestations.operator === 'example-only') {
      failures.push('operatorAttestations.operator must name a real reviewer.');
    }
  }

  return failures;
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
      failures.push(`${keyTrail.join('.')} must not be included in alert evidence.`);
    }
    failures.push(...findForbiddenRawPayloads(child, keyTrail));
  }

  return failures;
}

function findSecretMaterial(value, trail = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findSecretMaterial(item, [...trail, `[${index}]`]));
    }
    return failures;
  }
  if (plainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      failures.push(...findSecretMaterial(child, [...trail, key]));
    }
    return failures;
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    failures.push(`${trail.join('.') || 'alert evidence'} contains secret-like material.`);
  }

  return failures;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `Diagram LLM drift alert evidence check passed (${result.evidenceLevel}; ${result.routingMode}/${result.destinationType}).`,
    );
    if (result.verifiedExampleSchema) {
      console.log(
        'Verified sample alert contract only. Use --require-staging-alert for receiver proof.',
      );
    }
    if (result.verifiedStagingAlert) {
      console.log('Verified staging drift alert evidence.');
    }
    return;
  }

  console.error('Diagram LLM drift alert evidence check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Diagram LLM drift alert evidence check ${PACKAGE_VERSION}

Usage:
  node scripts/diagram-llm-drift-alert-evidence-check.mjs [options] [evidence.json]

Options:
  --evidence <path>          Alert evidence bundle (default: ${DEFAULT_EVIDENCE})
  --require-staging-alert    Require signed/TLS receiver acceptance and real reviewer evidence
  --json                     Print machine-readable check output
  --quiet                    Suppress human-readable success output
  --version                  Print version
  --help                     Show this help
`);
}
