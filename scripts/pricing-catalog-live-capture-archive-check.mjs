#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const ARCHIVE_SCHEMA = 'polycost-pricing-catalog-live-capture-archive/v1';
const CHECK_SCHEMA = 'polycost-pricing-catalog-live-capture-archive-check/v1';
const SNAPSHOT_CHECK_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence-check/v1';
const PREFLIGHT_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture-preflight/v1';
const CAPTURE_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture/v1';
const DEFAULT_ARCHIVE =
  'docs/operations/evidence/pricing-catalog-live-capture/pricing-catalog-live-capture-archive.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_LEVELS = new Set(['example-schema', 'live-provider-capture-archive']);
const SUPPORTED_PROVIDERS = new Set(['aws', 'azure', 'gcp']);
const REQUIRED_PREFLIGHT_CHECKS = [
  'live_guard',
  'operator_attestation',
  'previous_live_evidence',
  'gcp_cloud_billing_credential',
  'aws_public_catalog_endpoint',
  'azure_public_catalog_endpoint',
  'gcp_cloud_billing_endpoint',
  'no_raw_credential_output',
];
const REQUIRED_ATTESTATIONS = [
  'rawCatalogPayloadExcluded',
  'credentialsExcluded',
  'signedUrlsExcluded',
  'archiveDigestVerified',
  'strictSnapshotCheckerPassed',
  'productionClaimedByPolyCost',
];
const FORBIDDEN_RAW_KEYS = [
  /^rawCatalogPayload$/i,
  /^rawProviderResponse$/i,
  /^rawProviderResponses$/i,
  /^authorization$/i,
  /^authorizationHeader$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^apiKey$/i,
  /^password$/i,
  /^privateKey$/i,
  /^clientSecret$/i,
  /^secretAccessKey$/i,
  /^sasToken$/i,
  /^serviceAccountJson$/i,
];
const SECRET_VALUE_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /CHANGE_ME_DEV_ONLY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsig=[A-Za-z0-9%._~+/=-]{12,}/i,
  /\bX-Amz-Signature=/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live capture archive check error: ${message}`);
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
  const result = await checkArchive(args);

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
          archivePath: args.archivePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live capture archive check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    archivePath: DEFAULT_ARCHIVE,
    requireLiveArchive: false,
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
    if (arg === '--require-live-archive') {
      options.requireLiveArchive = true;
      continue;
    }
    if (arg === '--archive') {
      options.archivePath = readOptionValue(argv, index, '--archive');
      index += 1;
      continue;
    }
    if (arg.startsWith('--archive=')) {
      options.archivePath = arg.slice('--archive='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.archivePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one live capture archive manifest path.');
  }
  if (!options.archivePath) {
    throw new Error('Archive manifest path cannot be empty.');
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

async function checkArchive(options) {
  const root = process.cwd();
  const archivePath = path.resolve(root, options.archivePath);
  const archiveDir = path.dirname(archivePath);
  const archive = parseJsonObject(await readFile(archivePath, 'utf8'), options.archivePath);
  const failures = [];

  if (archive.schemaVersion !== ARCHIVE_SCHEMA) {
    failures.push(`archive.schemaVersion must be ${ARCHIVE_SCHEMA}.`);
  }
  if (!SUPPORTED_LEVELS.has(archive.evidenceLevel)) {
    failures.push('archive.evidenceLevel must be example-schema or live-provider-capture-archive.');
  }
  if (archive.productionClaim === true) {
    failures.push(
      'archive.productionClaim must remain false; catalog archive proof is not invoice-grade billing.',
    );
  }
  if (!isValidDateString(archive.archivedAt)) {
    failures.push('archive.archivedAt must be a valid ISO-8601 timestamp.');
  }
  if (options.requireLiveArchive && archive.evidenceLevel !== 'live-provider-capture-archive') {
    failures.push('archive.evidenceLevel must be live-provider-capture-archive.');
  }

  failures.push(...findForbiddenRawPayloads(archive));
  failures.push(...findSecretMaterial(archive));
  failures.push(...validateOperator(archive.operator, options));
  failures.push(...validatePreflight(archive.preflight, options));
  failures.push(...validateCapture(archive.capture, options));
  failures.push(...validateProviderCoverage(archive.providerCoverage, options));
  failures.push(...validateAttestations(archive.attestations, options));

  const snapshotEvidence = plainObject(archive.snapshotEvidence);
  let snapshotCheck = undefined;
  let snapshotEvidencePath = undefined;
  let snapshotEvidenceSha256 = undefined;
  if (!snapshotEvidence) {
    failures.push('archive.snapshotEvidence must be an object.');
  } else {
    const snapshotResult = await validateSnapshotEvidence({
      root,
      archiveDir,
      snapshotEvidence,
      requireLiveArchive: options.requireLiveArchive,
    });
    failures.push(...snapshotResult.failures);
    snapshotCheck = snapshotResult.snapshotCheck;
    snapshotEvidencePath = snapshotResult.snapshotEvidencePath;
    snapshotEvidenceSha256 = snapshotResult.snapshotEvidenceSha256;
  }

  const verifiedLiveSnapshot = snapshotCheck?.verifiedLiveProviderSnapshot === true;
  const verifiedExampleArchive =
    failures.length === 0 &&
    archive.evidenceLevel === 'example-schema' &&
    !options.requireLiveArchive;
  const verifiedLiveCaptureArchive =
    failures.length === 0 &&
    archive.evidenceLevel === 'live-provider-capture-archive' &&
    verifiedLiveSnapshot === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    archivePath,
    evidenceLevel: archive.evidenceLevel,
    archivedAt: archive.archivedAt,
    snapshotEvidencePath,
    snapshotEvidenceSha256,
    snapshotCheckerSchema: snapshotCheck?.schemaVersion,
    snapshotCheckerOk: snapshotCheck?.ok === true,
    verifiedLiveProviderSnapshot: verifiedLiveSnapshot,
    verifiedExampleArchive,
    verifiedLiveCaptureArchive,
    liveArchiveRequired: options.requireLiveArchive,
    providerCount: Array.isArray(archive.providerCoverage) ? archive.providerCoverage.length : 0,
    caveats: [
      archive.evidenceLevel === 'live-provider-capture-archive'
        ? 'This validates archived live catalog capture evidence and strict snapshot checker results; invoice-grade billing still requires provider invoices, private pricing, taxes, credits, commitments, and finance controls.'
        : 'This validates the archive manifest contract and digest handoff only; it is not live provider API proof.',
      'Raw provider payloads, credentials, signed URLs, authorization headers, and private billing artifacts must stay out of archive manifests.',
    ],
    failures,
  };
}

async function validateSnapshotEvidence({
  root,
  archiveDir,
  snapshotEvidence,
  requireLiveArchive,
}) {
  const failures = [];
  const evidencePathValue = stringValue(snapshotEvidence.path);
  if (!evidencePathValue) {
    return {
      failures: ['snapshotEvidence.path is required.'],
      snapshotCheck: undefined,
      snapshotEvidencePath: undefined,
      snapshotEvidenceSha256: undefined,
    };
  }

  const evidencePath = path.isAbsolute(evidencePathValue)
    ? evidencePathValue
    : path.resolve(archiveDir, evidencePathValue);
  const expectedSha256 = stringValue(snapshotEvidence.sha256);
  if (!SHA256_PATTERN.test(expectedSha256)) {
    failures.push('snapshotEvidence.sha256 must be a SHA-256 digest.');
  }

  let actualSha256;
  try {
    actualSha256 = sha256(await readFile(evidencePath));
  } catch {
    failures.push('snapshotEvidence.path must point to a readable evidence file.');
  }

  if (actualSha256 && SHA256_PATTERN.test(expectedSha256) && actualSha256 !== expectedSha256) {
    failures.push('snapshotEvidence.sha256 does not match the referenced evidence file.');
  }

  const checkerArgs = ['scripts/pricing-catalog-snapshot-evidence-check.mjs'];
  if (requireLiveArchive) {
    checkerArgs.push('--require-live-provider');
  }
  checkerArgs.push(evidencePath, '--json');
  const child = spawnSync(process.execPath, checkerArgs, {
    cwd: root,
    encoding: 'utf8',
  });
  const snapshotCheck = parseJsonOutput(child.stdout);

  if (snapshotCheck?.schemaVersion !== SNAPSHOT_CHECK_SCHEMA) {
    failures.push('snapshot evidence checker did not return the expected schema.');
  }
  if (child.status !== 0) {
    failures.push(
      requireLiveArchive
        ? 'snapshot evidence did not pass --require-live-provider.'
        : 'snapshot evidence did not pass the base evidence checker.',
    );
  }
  if (requireLiveArchive && snapshotEvidence.expectedVerifiedLiveProviderSnapshot !== true) {
    failures.push(
      'snapshotEvidence.expectedVerifiedLiveProviderSnapshot must be true for live archive proof.',
    );
  }
  if (requireLiveArchive && snapshotCheck?.verifiedLiveProviderSnapshot !== true) {
    failures.push('snapshot checker did not verify live provider snapshot proof.');
  }

  return {
    failures,
    snapshotCheck,
    snapshotEvidencePath: path.relative(root, evidencePath),
    snapshotEvidenceSha256: actualSha256,
  };
}

function validateOperator(operator, options) {
  const failures = [];
  const operatorObject = plainObject(operator);
  if (!operatorObject) {
    return ['operator must be an object.'];
  }

  if (!hasValue(operatorObject.name)) {
    failures.push('operator.name is required.');
  }
  if (!hasValue(operatorObject.role)) {
    failures.push('operator.role is required.');
  }
  if (!isValidDateString(operatorObject.attestedAt)) {
    failures.push('operator.attestedAt must be a valid ISO-8601 timestamp.');
  }
  if (options.requireLiveArchive && !hasRealOperator(operatorObject.name)) {
    failures.push('operator.name must identify a real reviewer for live archive proof.');
  }

  return failures;
}

function validatePreflight(preflight, options) {
  const failures = [];
  const preflightObject = plainObject(preflight);
  if (!preflightObject) {
    return ['preflight must be an object.'];
  }

  if (preflightObject.schemaVersion !== PREFLIGHT_SCHEMA) {
    failures.push(`preflight.schemaVersion must be ${PREFLIGHT_SCHEMA}.`);
  }
  if (!isValidDateString(preflightObject.checkedAt)) {
    failures.push('preflight.checkedAt must be a valid ISO-8601 timestamp.');
  }
  if (!Number.isInteger(preflightObject.warningCount) || preflightObject.warningCount < 0) {
    failures.push('preflight.warningCount must be a non-negative integer.');
  }
  if (!Number.isInteger(preflightObject.failureCount) || preflightObject.failureCount < 0) {
    failures.push('preflight.failureCount must be a non-negative integer.');
  }
  if (preflightObject.failureCount !== 0) {
    failures.push('preflight.failureCount must be zero before archive registration.');
  }

  const checkIds = Array.isArray(preflightObject.checkIds) ? preflightObject.checkIds : [];
  for (const checkId of REQUIRED_PREFLIGHT_CHECKS) {
    if (!checkIds.includes(checkId)) {
      failures.push(`preflight.checkIds must include ${checkId}.`);
    }
  }

  if (options.requireLiveArchive) {
    if (preflightObject.strictLive !== true) {
      failures.push('preflight.strictLive must be true for live archive proof.');
    }
    if (preflightObject.readyForLiveCapture !== true) {
      failures.push('preflight.readyForLiveCapture must be true for live archive proof.');
    }
    if (preflightObject.warningCount !== 0) {
      failures.push('preflight.warningCount must be zero for live archive proof.');
    }
  }

  return failures;
}

function validateCapture(capture, options) {
  const failures = [];
  const captureObject = plainObject(capture);
  if (!captureObject) {
    return ['capture must be an object.'];
  }

  if (captureObject.schemaVersion !== CAPTURE_SCHEMA) {
    failures.push(`capture.schemaVersion must be ${CAPTURE_SCHEMA}.`);
  }
  if (!isValidDateString(captureObject.capturedAt)) {
    failures.push('capture.capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (!hasValue(captureObject.command)) {
    failures.push('capture.command is required.');
  }
  if (!hasValue(captureObject.mode)) {
    failures.push('capture.mode is required.');
  }
  if (captureObject.verifiedLiveProviderSnapshot !== true && options.requireLiveArchive) {
    failures.push('capture.verifiedLiveProviderSnapshot must be true for live archive proof.');
  }
  if (options.requireLiveArchive && captureObject.mode !== 'live') {
    failures.push('capture.mode must be live for live archive proof.');
  }

  return failures;
}

function validateProviderCoverage(providerCoverage, options) {
  const failures = [];
  if (!Array.isArray(providerCoverage)) {
    return ['providerCoverage must be an array.'];
  }

  const seenProviders = new Set();
  for (const [index, provider] of providerCoverage.entries()) {
    const entry = plainObject(provider);
    if (!entry) {
      failures.push(`providerCoverage[${index}] must be an object.`);
      continue;
    }

    if (!SUPPORTED_PROVIDERS.has(entry.provider)) {
      failures.push(`providerCoverage[${index}].provider must be aws, azure, or gcp.`);
    } else {
      seenProviders.add(entry.provider);
    }
    if (!hasValue(entry.sourceSystem)) {
      failures.push(`providerCoverage[${index}].sourceSystem is required.`);
    }
    if (!hasValue(entry.sourceMode)) {
      failures.push(`providerCoverage[${index}].sourceMode is required.`);
    }
    if (options.requireLiveArchive && entry.sourceMode !== 'provider-api') {
      failures.push(`providerCoverage[${index}].sourceMode must be provider-api.`);
    }
    if (!Number.isInteger(entry.rowCount) || entry.rowCount < 0) {
      failures.push(`providerCoverage[${index}].rowCount must be a non-negative integer.`);
    }
    if (!Number.isInteger(entry.changedRowCount) || entry.changedRowCount < 0) {
      failures.push(`providerCoverage[${index}].changedRowCount must be a non-negative integer.`);
    }
  }

  for (const provider of SUPPORTED_PROVIDERS) {
    if (!seenProviders.has(provider)) {
      failures.push(`providerCoverage must include ${provider}.`);
    }
  }

  return failures;
}

function validateAttestations(attestations, options) {
  const failures = [];
  const attestationObject = plainObject(attestations);
  if (!attestationObject) {
    return ['attestations must be an object.'];
  }

  for (const key of REQUIRED_ATTESTATIONS) {
    if (typeof attestationObject[key] !== 'boolean') {
      failures.push(`attestations.${key} must be a boolean.`);
    }
  }

  for (const key of [
    'rawCatalogPayloadExcluded',
    'credentialsExcluded',
    'signedUrlsExcluded',
    'archiveDigestVerified',
  ]) {
    if (attestationObject[key] !== true) {
      failures.push(`attestations.${key} must be true.`);
    }
  }
  if (attestationObject.productionClaimedByPolyCost !== false) {
    failures.push('attestations.productionClaimedByPolyCost must be false.');
  }
  if (options.requireLiveArchive && attestationObject.strictSnapshotCheckerPassed !== true) {
    failures.push('attestations.strictSnapshotCheckerPassed must be true.');
  }

  return failures;
}

function parseJsonObject(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (!plainObject(parsed)) {
      throw new Error('not object');
    }
    return parsed;
  } catch {
    throw new Error(`${label} must contain a JSON object.`);
  }
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasValue(value) {
  return stringValue(value).length > 0;
}

function hasRealOperator(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    !/example|sample|demo|test|unknown/i.test(value)
  );
}

function isValidDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function findForbiddenRawPayloads(value, pathLabel = 'archive') {
  const failures = [];

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      failures.push(...findForbiddenRawPayloads(item, `${pathLabel}[${index}]`));
    });
    return failures;
  }

  if (!plainObject(value)) {
    return failures;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(
        `${pathLabel}.${key} must not contain raw provider payload or credential data.`,
      );
    }
    failures.push(...findForbiddenRawPayloads(nestedValue, `${pathLabel}.${key}`));
  }

  return failures;
}

function findSecretMaterial(value, pathLabel = 'archive') {
  const failures = [];

  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      failures.push(`${pathLabel} contains secret-like material.`);
    }
    return failures;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      failures.push(...findSecretMaterial(item, `${pathLabel}[${index}]`));
    });
    return failures;
  }

  if (!plainObject(value)) {
    return failures;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    failures.push(...findSecretMaterial(nestedValue, `${pathLabel}.${key}`));
  }

  return failures;
}

function printResult(result) {
  const status = result.verifiedLiveCaptureArchive
    ? 'verified live archive'
    : result.verifiedExampleArchive
      ? 'verified example archive'
      : 'failed';
  console.log(`Pricing catalog live capture archive check ${status}.`);
  console.log(
    `Providers: ${result.providerCount}; strict live required: ${result.liveArchiveRequired}; failures: ${result.failures.length}`,
  );
  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.log(`- ${failure}`);
    }
  }
}

function printHelp() {
  console.log(`Pricing catalog live capture archive check ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-capture-archive-check.mjs [archive.json] [options]

Options:
  --archive <path>              Archive manifest path
  --require-live-archive        Require strict live-provider capture archive proof
  --json                        Print machine-readable output
  --quiet                       Suppress human-readable output
  --version                     Print version
  --help                        Show this help
`);
}
