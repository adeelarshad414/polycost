#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const EVIDENCE_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence/v1';
const CHECK_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence-check/v1';
const DEFAULT_EVIDENCE =
  'docs/operations/evidence/pricing-catalog-snapshot/pricing-catalog-snapshot.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_LEVELS = new Set([
  'example-schema',
  'provider-snapshot-smoke',
  'live-provider-snapshot',
]);
const SUPPORTED_PROVIDERS = new Set(['aws', 'azure', 'gcp']);
const SUPPORTED_SOURCE_MODES = new Set(['sample', 'fixture-replay', 'provider-api']);
const REQUIRED_ATTESTATIONS = [
  'rawCatalogPayloadExcluded',
  'credentialsExcluded',
  'signedUrlsExcluded',
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
  console.error(`Pricing catalog snapshot evidence check error: ${message}`);
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
    console.error(`Pricing catalog snapshot evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    evidencePath: DEFAULT_EVIDENCE,
    requireProviderSnapshot: false,
    requireLiveProvider: false,
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
    if (arg === '--require-provider-snapshot') {
      options.requireProviderSnapshot = true;
      continue;
    }
    if (arg === '--require-live-provider') {
      options.requireLiveProvider = true;
      options.requireProviderSnapshot = true;
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
    throw new Error('Expected at most one pricing catalog snapshot evidence path.');
  }
  if (!options.evidencePath) {
    throw new Error('Evidence path cannot be empty.');
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
  const snapshotWindow = plainObject(evidence.snapshotWindow);
  const providerSnapshots = Array.isArray(evidence.providerSnapshots)
    ? evidence.providerSnapshots
    : [];
  const operatorAttestations = plainObject(evidence.operatorAttestations);

  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    failures.push(`evidence.schemaVersion must be ${EVIDENCE_SCHEMA}.`);
  }
  if (!SUPPORTED_LEVELS.has(evidenceLevel)) {
    failures.push(
      'evidence.evidenceLevel must be example-schema, provider-snapshot-smoke, or live-provider-snapshot.',
    );
  }
  if (evidence.productionClaim === true) {
    failures.push(
      'evidence.productionClaim must remain false; this validates catalog evidence, not invoice-grade live billing.',
    );
  }
  if (!isValidDateString(evidence.capturedAt)) {
    failures.push('evidence.capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (!Number.isInteger(evidence.freshnessSlaHours) || evidence.freshnessSlaHours <= 0) {
    failures.push('evidence.freshnessSlaHours must be a positive integer.');
  }
  if (options.requireProviderSnapshot && evidenceLevel === 'example-schema') {
    failures.push(
      'evidenceLevel must not be example-schema when provider snapshot proof is required.',
    );
  }
  if (options.requireLiveProvider && evidenceLevel !== 'live-provider-snapshot') {
    failures.push(
      'evidenceLevel must be live-provider-snapshot when --require-live-provider is used.',
    );
  }

  failures.push(...findForbiddenRawPayloads(evidence));
  failures.push(...findSecretMaterial(evidence));
  failures.push(...validateSnapshotWindow(snapshotWindow, options));
  failures.push(
    ...validateProviderSnapshots(providerSnapshots, {
      capturedAt: evidence.capturedAt,
      freshnessSlaHours: evidence.freshnessSlaHours,
      requireProviderSnapshot: options.requireProviderSnapshot,
      requireLiveProvider: options.requireLiveProvider,
    }),
  );
  failures.push(...validateOperatorAttestations(operatorAttestations, options));

  const providerIds = new Set(
    providerSnapshots
      .map((snapshot) => plainObject(snapshot)?.provider)
      .filter((provider) => typeof provider === 'string'),
  );
  for (const provider of SUPPORTED_PROVIDERS) {
    if (!providerIds.has(provider)) {
      failures.push(`providerSnapshots must include ${provider}.`);
    }
  }

  const verifiedProviderSnapshot =
    failures.length === 0 &&
    (evidenceLevel === 'provider-snapshot-smoke' || evidenceLevel === 'live-provider-snapshot') &&
    snapshotWindow?.exactRowChangeVerified === true;
  const verifiedLiveProviderSnapshot =
    verifiedProviderSnapshot &&
    evidenceLevel === 'live-provider-snapshot' &&
    providerSnapshots.every((snapshot) => plainObject(snapshot)?.sourceMode === 'provider-api');

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    evidencePath,
    evidenceLevel,
    capturedAt: evidence.capturedAt,
    providerCount: providerSnapshots.length,
    changedRowCount: snapshotWindow?.changedRowCount,
    priceChangedSkuCount: snapshotWindow?.priceChangedSkuCount,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedProviderSnapshot,
    verifiedLiveProviderSnapshot,
    providerSnapshotRequired: evidenceLevel === 'example-schema',
    providerSummaries: providerSnapshots
      .map((snapshot) => plainObject(snapshot))
      .filter(Boolean)
      .map((snapshot) => ({
        provider: snapshot.provider,
        sourceMode: snapshot.sourceMode,
        rowCount: snapshot.rowCount,
        changedRowCount: snapshot.changedRowCount,
        sourcePayloadHashCoverage: snapshot.sourcePayloadHashCoverage,
      })),
    caveats: [
      evidenceLevel === 'live-provider-snapshot'
        ? 'This validates archived live provider catalog snapshot evidence; invoice-grade billing still depends on private pricing, taxes, actual invoices, and finance controls.'
        : 'This validates catalog snapshot evidence shape and local snapshot comparison; it is not live provider API proof.',
      'Raw catalog payloads, signed URLs, credentials, and provider authorization headers must stay out of evidence bundles.',
    ],
    failures,
  };
}

function validateSnapshotWindow(snapshotWindow, options) {
  if (!snapshotWindow) {
    return ['snapshotWindow must be an object.'];
  }

  const failures = [];
  for (const key of ['currentSnapshotSha256', 'previousSnapshotSha256']) {
    if (!hasSha256(snapshotWindow[key])) {
      failures.push(`snapshotWindow.${key} must be a SHA-256 digest.`);
    }
  }
  for (const key of [
    'currentRowCount',
    'previousRowCount',
    'changedRowCount',
    'unchangedRowCount',
    'addedSkuCount',
    'removedSkuCount',
    'priceChangedSkuCount',
  ]) {
    if (!Number.isInteger(snapshotWindow[key]) || snapshotWindow[key] < 0) {
      failures.push(`snapshotWindow.${key} must be a non-negative integer.`);
    }
  }
  if (!hasValue(snapshotWindow.rowHashAlgorithm)) {
    failures.push('snapshotWindow.rowHashAlgorithm is required.');
  }
  if (snapshotWindow.exactRowChangeVerified !== true && options.requireProviderSnapshot) {
    failures.push(
      'snapshotWindow.exactRowChangeVerified must be true for provider snapshot proof.',
    );
  }
  if (
    options.requireProviderSnapshot &&
    snapshotWindow.changedRowCount !==
      snapshotWindow.addedSkuCount +
        snapshotWindow.removedSkuCount +
        snapshotWindow.priceChangedSkuCount
  ) {
    failures.push(
      'snapshotWindow changed row totals must match added, removed, and price changed rows.',
    );
  }

  return failures;
}

function validateProviderSnapshots(providerSnapshots, options) {
  const failures = [];
  if (providerSnapshots.length === 0) {
    return ['providerSnapshots must contain AWS, Azure, and GCP entries.'];
  }

  for (const [index, snapshot] of providerSnapshots.entries()) {
    const providerSnapshot = plainObject(snapshot);
    if (!providerSnapshot) {
      failures.push(`providerSnapshots[${index}] must be an object.`);
      continue;
    }

    failures.push(...validateProviderSnapshot(providerSnapshot, index, options));
  }

  return failures;
}

function validateProviderSnapshot(snapshot, index, options) {
  const failures = [];
  const label = `providerSnapshots[${index}]`;

  if (!SUPPORTED_PROVIDERS.has(snapshot.provider)) {
    failures.push(`${label}.provider must be aws, azure, or gcp.`);
  }
  if (!SUPPORTED_SOURCE_MODES.has(snapshot.sourceMode)) {
    failures.push(`${label}.sourceMode must be sample, fixture-replay, or provider-api.`);
  }
  if (!hasValue(snapshot.sourceSystem)) {
    failures.push(`${label}.sourceSystem is required.`);
  }
  if (options.requireLiveProvider && snapshot.sourceMode !== 'provider-api') {
    failures.push(`${label}.sourceMode must be provider-api for live provider proof.`);
  }
  if (options.requireLiveProvider && /fixture|mock|sample/i.test(String(snapshot.sourceSystem))) {
    failures.push(`${label}.sourceSystem must not be fixture/mock/sample for live provider proof.`);
  }
  if (!isValidDateString(snapshot.catalogGeneratedAt)) {
    failures.push(`${label}.catalogGeneratedAt must be a valid ISO-8601 timestamp.`);
  } else if (
    options.requireProviderSnapshot &&
    hoursBetween(options.capturedAt, snapshot.catalogGeneratedAt) > options.freshnessSlaHours
  ) {
    failures.push(`${label}.catalogGeneratedAt is outside the freshness SLA.`);
  }
  for (const key of ['snapshotSha256', 'previousSnapshotSha256', 'changedRowsSha256']) {
    if (!hasSha256(snapshot[key])) {
      failures.push(`${label}.${key} must be a SHA-256 digest.`);
    }
  }
  for (const key of [
    'rowCount',
    'previousRowCount',
    'changedRowCount',
    'unchangedRowCount',
    'addedSkuCount',
    'removedSkuCount',
    'priceChangedSkuCount',
    'sourceEndpointCount',
    'sourceRecordCount',
    'regionCount',
    'serviceCategoryCount',
  ]) {
    if (!Number.isInteger(snapshot[key]) || snapshot[key] < 0) {
      failures.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  for (const key of ['sourcePayloadHashCoverage', 'sourceRecordKeyCoverage', 'rowHashCoverage']) {
    if (!isRatioAtLeast(snapshot[key], options.requireProviderSnapshot ? 1 : 0.95)) {
      failures.push(
        `${label}.${key} must be ${options.requireProviderSnapshot ? '1' : 'at least 0.95'}.`,
      );
    }
  }
  if (snapshot.exactRowChangeVerified !== true && options.requireProviderSnapshot) {
    failures.push(`${label}.exactRowChangeVerified must be true for provider snapshot proof.`);
  }
  if (snapshot.rawCatalogPayloadExcluded !== true) {
    failures.push(`${label}.rawCatalogPayloadExcluded must be true.`);
  }
  if (!Array.isArray(snapshot.publicEndpoints) || snapshot.publicEndpoints.length < 1) {
    failures.push(`${label}.publicEndpoints must include at least one public endpoint reference.`);
  }
  if (!Array.isArray(snapshot.rowSamples) || snapshot.rowSamples.length < 1) {
    failures.push(`${label}.rowSamples must include sanitized row samples.`);
  } else {
    for (const [rowIndex, row] of snapshot.rowSamples.entries()) {
      failures.push(
        ...validateRowSample(row, `${label}.rowSamples[${rowIndex}]`, snapshot.provider),
      );
    }
  }

  return failures;
}

function validateRowSample(row, label, provider) {
  const rowObject = plainObject(row);
  if (!rowObject) {
    return [`${label} must be an object.`];
  }

  const failures = [];
  for (const key of [
    'provider',
    'serviceCategory',
    'skuId',
    'region',
    'unit',
    'sourceEndpoint',
    'sourceRecordId',
    'sourceRecordKey',
    'sourcePayloadHash',
    'rowSha256',
    'transformVersion',
    'fetchedAt',
    'effectiveDate',
  ]) {
    if (!hasValue(rowObject[key])) {
      failures.push(`${label}.${key} is required.`);
    }
  }
  if (rowObject.provider !== provider) {
    failures.push(`${label}.provider must match its provider snapshot.`);
  }
  if (!Number.isFinite(rowObject.unitPriceUsd) || rowObject.unitPriceUsd < 0) {
    failures.push(`${label}.unitPriceUsd must be a non-negative number.`);
  }
  for (const key of ['sourcePayloadHash', 'rowSha256']) {
    if (!hasSha256(rowObject[key])) {
      failures.push(`${label}.${key} must be a SHA-256 digest.`);
    }
  }
  if (!isValidDateString(rowObject.fetchedAt)) {
    failures.push(`${label}.fetchedAt must be ISO-8601.`);
  }
  if (!isValidDateString(rowObject.effectiveDate)) {
    failures.push(`${label}.effectiveDate must be ISO-8601.`);
  }

  return failures;
}

function validateOperatorAttestations(attestations, options) {
  if (!attestations) {
    return ['operatorAttestations must be an object.'];
  }

  const failures = [];
  for (const key of REQUIRED_ATTESTATIONS) {
    if (key === 'productionClaimedByPolyCost') {
      if (attestations[key] !== false) {
        failures.push('operatorAttestations.productionClaimedByPolyCost must be false.');
      }
      continue;
    }
    if (attestations[key] !== true) {
      failures.push(`operatorAttestations.${key} must be true.`);
    }
  }
  if (options.requireLiveProvider && attestations.liveProviderEndpointsReviewed !== true) {
    failures.push(
      'operatorAttestations.liveProviderEndpointsReviewed must be true for live provider proof.',
    );
  }
  if (!hasValue(attestations.operator)) {
    failures.push('operatorAttestations.operator is required.');
  }
  if (options.requireLiveProvider && attestations.operator === 'example-only') {
    failures.push(
      'operatorAttestations.operator must name a real reviewer for live provider proof.',
    );
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
    const childTrail = [...trail, key];
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(`${childTrail.join('.')} must not be present in sanitized evidence.`);
      continue;
    }
    failures.push(...findForbiddenRawPayloads(child, childTrail));
  }

  return failures;
}

function findSecretMaterial(value, trail = []) {
  const failures = [];

  if (typeof value === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        failures.push(`${trail.join('.') || '<root>'} appears to contain secret material.`);
      }
    }
    return failures;
  }
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
  }

  return failures;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hasValue(value) {
  return stringValue(value) !== undefined;
}

function hasSha256(value) {
  return hasValue(value) && SHA256_PATTERN.test(value);
}

function isValidDateString(value) {
  return hasValue(value) && !Number.isNaN(Date.parse(value));
}

function isRatioAtLeast(value, floor) {
  return typeof value === 'number' && Number.isFinite(value) && value >= floor && value <= 1;
}

function hoursBetween(laterIso, earlierIso) {
  return Math.abs(Date.parse(laterIso) - Date.parse(earlierIso)) / (1000 * 60 * 60);
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `Pricing catalog snapshot evidence check passed (${result.evidenceLevel}; providers ${result.providerCount}).`,
    );
    if (result.verifiedExampleSchema) {
      console.log(
        'Verified sample schema only. Use --require-provider-snapshot for snapshot comparison proof.',
      );
    }
    if (result.verifiedProviderSnapshot) {
      console.log('Verified provider catalog snapshot comparison evidence.');
    }
    if (result.verifiedLiveProviderSnapshot) {
      console.log('Verified live provider catalog snapshot evidence.');
    }
    return;
  }

  console.error('Pricing catalog snapshot evidence check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Pricing catalog snapshot evidence check ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-snapshot-evidence-check.mjs [options] [evidence.json]

Options:
  --evidence <path>             Evidence bundle (default: ${DEFAULT_EVIDENCE})
  --require-provider-snapshot   Require snapshot freshness and exact row-change proof
  --require-live-provider       Require archived live provider API snapshot proof
  --json                        Print machine-readable check output
  --quiet                       Suppress human-readable success output
  --version                     Print version
  --help                        Show this help
`);
}
