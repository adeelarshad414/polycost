#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const CORPUS_SCHEMA = 'polycost-diagram-llm-corpus/v1';
const EVIDENCE_SCHEMA = 'polycost-diagram-llm-corpus-evidence/v1';
const DRIFT_SCHEMA = 'polycost-diagram-llm-corpus-drift/v1';
const CHECK_SCHEMA = 'polycost-diagram-llm-corpus-drift-check/v1';
const DEFAULT_PROFILE =
  'docs/operations/evidence/diagram-llm-corpus-drift/diagram-llm-corpus-drift.example.json';
const DEFAULT_CORPUS = 'fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json';
const DEFAULT_EVIDENCE = 'docs/operations/evidence/diagram-llm-corpus-evidence.example.json';
const SECRET_VALUE_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /CHANGE_ME_DEV_ONLY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];
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
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Diagram LLM corpus drift check error: ${message}`);
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
  const result = await checkDrift(args);

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
          profilePath: args.profilePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Diagram LLM corpus drift check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    profilePath: DEFAULT_PROFILE,
    corpusPath: undefined,
    evidencePath: undefined,
    requireLiveModel: false,
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
    if (arg === '--require-live-model') {
      options.requireLiveModel = true;
      continue;
    }
    if (arg === '--profile') {
      options.profilePath = readOptionValue(argv, index, '--profile');
      index += 1;
      continue;
    }
    if (arg.startsWith('--profile=')) {
      options.profilePath = arg.slice('--profile='.length).trim();
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
    options.profilePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one drift profile path.');
  }
  if (!options.profilePath) {
    throw new Error('Drift profile path cannot be empty.');
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

async function checkDrift(options) {
  const root = process.cwd();
  const profilePath = path.resolve(root, options.profilePath);
  const profileDir = path.dirname(profilePath);
  const profile = parseJsonObject(await readFile(profilePath, 'utf8'), options.profilePath);
  const paths = plainObject(profile.paths);
  const corpusPath = resolveConfiguredPath({
    root,
    profileDir,
    explicitPath: options.corpusPath,
    configuredPath: paths?.corpus,
    defaultPath: DEFAULT_CORPUS,
  });
  const evidencePath = resolveConfiguredPath({
    root,
    profileDir,
    explicitPath: options.evidencePath,
    configuredPath: paths?.evidence,
    defaultPath: DEFAULT_EVIDENCE,
  });

  const corpusBuffer = await readFile(corpusPath);
  const evidenceBuffer = await readFile(evidencePath);
  const corpusSha256 = sha256(corpusBuffer);
  const evidenceSha256 = sha256(evidenceBuffer);
  const corpus = parseJsonObject(corpusBuffer.toString('utf8'), path.relative(root, corpusPath));
  const evidence = parseJsonObject(
    evidenceBuffer.toString('utf8'),
    path.relative(root, evidencePath),
  );
  const failures = [];
  const baselineMetrics = plainObject(profile.baselineMetrics);
  const thresholds = normalizeThresholds(profile.thresholds);
  const operatorAttestations = plainObject(profile.operatorAttestations);
  const falsePositiveRegister = Array.isArray(profile.falsePositiveRegister)
    ? profile.falsePositiveRegister
    : [];

  if (profile.schemaVersion !== DRIFT_SCHEMA) {
    failures.push(`profile.schemaVersion must be ${DRIFT_SCHEMA}.`);
  }
  if (!['example-schema', 'live-model-monitoring'].includes(profile.monitoringLevel)) {
    failures.push('profile.monitoringLevel must be example-schema or live-model-monitoring.');
  }
  if (profile.productionClaim === true) {
    failures.push(
      'profile.productionClaim must remain false; this validates monitoring evidence, not production deployment.',
    );
  }
  if (!isValidDateString(profile.evaluatedAt)) {
    failures.push('profile.evaluatedAt must be a valid ISO-8601 timestamp.');
  }
  if (profile.corpusSha256 && profile.corpusSha256 !== corpusSha256) {
    failures.push('profile.corpusSha256 must match the checked corpus file.');
  }

  if (corpus.schemaVersion !== CORPUS_SCHEMA) {
    failures.push(`corpus.schemaVersion must be ${CORPUS_SCHEMA}.`);
  }
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    failures.push(`evidence.schemaVersion must be ${EVIDENCE_SCHEMA}.`);
  }
  if (evidence.corpusSha256 !== corpusSha256) {
    failures.push('evidence.corpusSha256 must match the checked corpus file.');
  }
  if (evidence.productionClaim === true) {
    failures.push('evidence.productionClaim must remain false.');
  }

  failures.push(...findForbiddenRawPayloads(profile, ['profile']));
  failures.push(...findForbiddenRawPayloads(evidence, ['evidence']));
  failures.push(...findSecretMaterial(profile, ['profile']));
  failures.push(...findSecretMaterial(evidence, ['evidence']));
  failures.push(...validateBaselineMetrics(baselineMetrics));
  failures.push(...validateFalsePositiveRegister(falsePositiveRegister, options));
  failures.push(...validateOperatorAttestations(operatorAttestations, options));

  const corpusCases = Array.isArray(corpus.cases) ? corpus.cases : [];
  const predictions = Array.isArray(evidence.predictions) ? evidence.predictions : [];
  const metrics = evaluatePredictions(corpusCases, predictions);
  failures.push(...metrics.failures);

  const activeRegisterById = activeFalsePositiveRegister(falsePositiveRegister);
  const mismatchesWithReview = metrics.mismatches.map((mismatch) => ({
    ...mismatch,
    reviewed: activeRegisterById.has(mismatch.id),
    reviewStatus: activeRegisterById.get(mismatch.id)?.status,
  }));
  const unreviewedMismatches = mismatchesWithReview.filter((mismatch) => !mismatch.reviewed);
  const drift = calculateDrift(baselineMetrics, metrics);

  failures.push(...validateThresholds(metrics, drift, unreviewedMismatches, thresholds));
  if (options.requireLiveModel) {
    failures.push(...validateLiveMonitoring(profile, evidence, operatorAttestations));
  }

  const verifiedLiveModelDrift =
    failures.length === 0 &&
    profile.monitoringLevel === 'live-model-monitoring' &&
    evidence.evidenceLevel === 'live-model' &&
    operatorAttestations?.driftReviewed === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    profilePath,
    corpusPath,
    evidencePath,
    corpusSha256,
    evidenceSha256,
    monitoringLevel: profile.monitoringLevel,
    evidenceLevel: evidence.evidenceLevel,
    caseCount: corpusCases.length,
    predictionCount: predictions.length,
    baselineMetrics,
    currentMetrics: summarizeMetrics(metrics),
    drift,
    thresholds,
    mismatchCount: mismatchesWithReview.length,
    reviewedMismatchCount: mismatchesWithReview.length - unreviewedMismatches.length,
    unreviewedMismatchCount: unreviewedMismatches.length,
    mismatches: mismatchesWithReview,
    verifiedExampleDriftCheck:
      failures.length === 0 && profile.monitoringLevel === 'example-schema',
    verifiedLiveModelDrift,
    liveModelRequired: profile.monitoringLevel !== 'live-model-monitoring',
    caveats: [
      profile.monitoringLevel === 'example-schema'
        ? 'This validates the drift-monitoring contract with sanitized sample evidence; it is not production LLM monitoring proof.'
        : 'This validates archived drift-monitoring evidence; production quality still depends on live endpoint operations and ongoing reviewer workflow.',
      'Raw prompts, raw provider responses, API keys, and authorization headers must stay out of drift profiles and evidence bundles.',
    ],
    failures,
  };
}

function resolveConfiguredPath({ root, profileDir, explicitPath, configuredPath, defaultPath }) {
  if (explicitPath) {
    return path.resolve(root, explicitPath);
  }

  const configured = stringValue(configuredPath);
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(profileDir, configured);
  }

  return path.resolve(root, defaultPath);
}

function normalizeThresholds(value) {
  const thresholds = plainObject(value) ?? {};

  return {
    minCategoryAccuracy: ratioValue(thresholds.minCategoryAccuracy, 0.9),
    minServiceTypeAccuracy: ratioValue(thresholds.minServiceTypeAccuracy, 0.8),
    minHighConfidenceCoverage: ratioValue(thresholds.minHighConfidenceCoverage, 0.75),
    maxCategoryAccuracyDrop: ratioValue(thresholds.maxCategoryAccuracyDrop, 0.05),
    maxServiceTypeAccuracyDrop: ratioValue(thresholds.maxServiceTypeAccuracyDrop, 0.1),
    maxNewMismatches: integerValue(thresholds.maxNewMismatches, 0),
    maxUnreviewedMismatches: integerValue(thresholds.maxUnreviewedMismatches, 0),
  };
}

function validateBaselineMetrics(metrics) {
  const failures = [];

  if (!metrics) {
    return ['profile.baselineMetrics must be an object.'];
  }
  for (const key of ['categoryAccuracy', 'serviceTypeAccuracy', 'highConfidenceCoverage']) {
    if (!isRatio(metrics[key])) {
      failures.push(`profile.baselineMetrics.${key} must be a ratio between 0 and 1.`);
    }
  }
  if (!Number.isInteger(metrics.caseCount) || metrics.caseCount < 1) {
    failures.push('profile.baselineMetrics.caseCount must be a positive integer.');
  }
  if (!Number.isInteger(metrics.predictionCount) || metrics.predictionCount < 1) {
    failures.push('profile.baselineMetrics.predictionCount must be a positive integer.');
  }

  return failures;
}

function validateFalsePositiveRegister(register, options) {
  const failures = [];
  const seenIds = new Set();

  for (const [index, item] of register.entries()) {
    if (!plainObject(item)) {
      failures.push(`falsePositiveRegister[${index}] must be an object.`);
      continue;
    }
    if (!isNonEmptyString(item.id)) {
      failures.push(`falsePositiveRegister[${index}].id is required.`);
    } else if (seenIds.has(item.id)) {
      failures.push(`falsePositiveRegister contains duplicate id ${item.id}.`);
    } else {
      seenIds.add(item.id);
    }
    if (!['accepted', 'known-issue', 'waived'].includes(item.status)) {
      failures.push(`${item.id ?? `falsePositiveRegister[${index}]`}.status is invalid.`);
    }
    if (!isValidDateString(item.reviewedAt)) {
      failures.push(`${item.id ?? `falsePositiveRegister[${index}]`}.reviewedAt must be ISO-8601.`);
    }
    if (!isNonEmptyString(item.reason)) {
      failures.push(`${item.id ?? `falsePositiveRegister[${index}]`}.reason is required.`);
    }
    if (
      !isNonEmptyString(item.reviewer) ||
      (options.requireLiveModel && item.reviewer === 'example-only')
    ) {
      failures.push(
        `${item.id ?? `falsePositiveRegister[${index}]`}.reviewer must name a reviewer.`,
      );
    }
    if (item.expiresAt && !isValidDateString(item.expiresAt)) {
      failures.push(`${item.id ?? `falsePositiveRegister[${index}]`}.expiresAt must be ISO-8601.`);
    }
  }

  return failures;
}

function validateOperatorAttestations(attestations, options) {
  const failures = [];

  if (!attestations) {
    return ['profile.operatorAttestations must be an object.'];
  }
  if (attestations.rawSecretsExcluded !== true) {
    failures.push('profile.operatorAttestations.rawSecretsExcluded must be true.');
  }
  if (attestations.rawPromptsExcluded !== true) {
    failures.push('profile.operatorAttestations.rawPromptsExcluded must be true.');
  }
  if (attestations.productionClaimedByPolyCost !== false) {
    failures.push('profile.operatorAttestations.productionClaimedByPolyCost must be false.');
  }
  if (options.requireLiveModel) {
    if (attestations.productionEndpointReviewed !== true) {
      failures.push('profile.operatorAttestations.productionEndpointReviewed must be true.');
    }
    if (attestations.driftReviewed !== true) {
      failures.push('profile.operatorAttestations.driftReviewed must be true.');
    }
    if (!isNonEmptyString(attestations.operator) || attestations.operator === 'example-only') {
      failures.push('profile.operatorAttestations.operator must name a real reviewer.');
    }
  }

  return failures;
}

function validateLiveMonitoring(profile, evidence, attestations) {
  const failures = [];

  if (profile.monitoringLevel !== 'live-model-monitoring') {
    failures.push(
      'profile.monitoringLevel must be live-model-monitoring when --require-live-model is used.',
    );
  }
  if (evidence.evidenceLevel !== 'live-model') {
    failures.push('evidence.evidenceLevel must be live-model when --require-live-model is used.');
  }
  if (evidence.modelEvidence?.endpointConfigured !== true) {
    failures.push('evidence.modelEvidence.endpointConfigured must be true for live monitoring.');
  }
  if (evidence.modelEvidence?.vaultSecretVerified !== true) {
    failures.push('evidence.modelEvidence.vaultSecretVerified must be true for live monitoring.');
  }
  if (evidence.run?.mode !== 'live-endpoint') {
    failures.push('evidence.run.mode must be live-endpoint for live monitoring.');
  }
  if (attestations?.driftReviewed !== true) {
    failures.push('profile.operatorAttestations.driftReviewed must be true for live monitoring.');
  }

  return failures;
}

function validateThresholds(metrics, drift, unreviewedMismatches, thresholds) {
  const failures = [];

  if (metrics.categoryAccuracy < thresholds.minCategoryAccuracy) {
    failures.push(
      `category accuracy ${formatRatio(metrics.categoryAccuracy)} is below threshold ${formatRatio(
        thresholds.minCategoryAccuracy,
      )}.`,
    );
  }
  if (metrics.serviceTypeAccuracy < thresholds.minServiceTypeAccuracy) {
    failures.push(
      `service-type accuracy ${formatRatio(metrics.serviceTypeAccuracy)} is below threshold ${formatRatio(
        thresholds.minServiceTypeAccuracy,
      )}.`,
    );
  }
  if (metrics.highConfidenceCoverage < thresholds.minHighConfidenceCoverage) {
    failures.push(
      `high-confidence coverage ${formatRatio(metrics.highConfidenceCoverage)} is below threshold ${formatRatio(
        thresholds.minHighConfidenceCoverage,
      )}.`,
    );
  }
  if (drift.categoryAccuracyDrop > thresholds.maxCategoryAccuracyDrop) {
    failures.push(
      `category accuracy drop ${formatRatio(drift.categoryAccuracyDrop)} exceeds allowed ${formatRatio(
        thresholds.maxCategoryAccuracyDrop,
      )}.`,
    );
  }
  if (drift.serviceTypeAccuracyDrop > thresholds.maxServiceTypeAccuracyDrop) {
    failures.push(
      `service-type accuracy drop ${formatRatio(drift.serviceTypeAccuracyDrop)} exceeds allowed ${formatRatio(
        thresholds.maxServiceTypeAccuracyDrop,
      )}.`,
    );
  }
  if (unreviewedMismatches.length > thresholds.maxUnreviewedMismatches) {
    failures.push(
      `unreviewed mismatch count ${unreviewedMismatches.length} exceeds allowed ${thresholds.maxUnreviewedMismatches}.`,
    );
  }
  if (unreviewedMismatches.length > thresholds.maxNewMismatches) {
    failures.push(
      `new mismatch count ${unreviewedMismatches.length} exceeds allowed ${thresholds.maxNewMismatches}.`,
    );
  }

  return failures;
}

function evaluatePredictions(corpusCases, predictions) {
  const failures = [];
  const expectedById = new Map(corpusCases.map((item) => [item.id, item]));
  const seenPredictionIds = new Set();
  let categoryCorrect = 0;
  let serviceTypeCorrect = 0;
  let highConfidence = 0;
  const mismatches = [];

  for (const prediction of predictions) {
    if (!plainObject(prediction)) {
      failures.push('every prediction must be an object.');
      continue;
    }
    if (!isNonEmptyString(prediction.id)) {
      failures.push('every prediction must have id.');
      continue;
    }
    if (seenPredictionIds.has(prediction.id)) {
      failures.push(`duplicate prediction id: ${prediction.id}.`);
      continue;
    }
    seenPredictionIds.add(prediction.id);

    const expected = expectedById.get(prediction.id);
    if (!expected) {
      failures.push(`prediction id ${prediction.id} is not in the corpus.`);
      continue;
    }
    if (!isNonEmptyString(prediction.serviceCategory)) {
      failures.push(`${prediction.id} prediction.serviceCategory is required.`);
    }
    if (!isNonEmptyString(prediction.serviceType)) {
      failures.push(`${prediction.id} prediction.serviceType is required.`);
    }
    if (!['high', 'moderate', 'low'].includes(prediction.confidence)) {
      failures.push(`${prediction.id} prediction.confidence must be high, moderate, or low.`);
    }
    if (!isNonEmptyString(prediction.reason)) {
      failures.push(`${prediction.id} prediction.reason is required.`);
    }

    const categoryMatch = prediction.serviceCategory === expected.expected.serviceCategory;
    const serviceTypeMatch =
      categoryMatch && prediction.serviceType === expected.expected.serviceType;

    if (prediction.confidence === 'high') {
      highConfidence += 1;
    }
    if (categoryMatch) {
      categoryCorrect += 1;
    }
    if (serviceTypeMatch) {
      serviceTypeCorrect += 1;
    }
    if (!serviceTypeMatch) {
      mismatches.push({
        id: prediction.id,
        expectedServiceCategory: expected.expected.serviceCategory,
        expectedServiceType: expected.expected.serviceType,
        actualServiceCategory: prediction.serviceCategory,
        actualServiceType: prediction.serviceType,
        confidence: prediction.confidence,
      });
    }
  }

  for (const corpusCase of corpusCases) {
    if (!seenPredictionIds.has(corpusCase.id)) {
      failures.push(`missing prediction for corpus case ${corpusCase.id}.`);
      mismatches.push({
        id: corpusCase.id,
        expectedServiceCategory: corpusCase.expected?.serviceCategory,
        expectedServiceType: corpusCase.expected?.serviceType,
        actualServiceCategory: 'missing',
        actualServiceType: 'missing',
        confidence: 'missing',
      });
    }
  }

  const denominator = corpusCases.length || 1;

  return {
    failures,
    categoryAccuracy: categoryCorrect / denominator,
    serviceTypeAccuracy: serviceTypeCorrect / denominator,
    highConfidenceCoverage: highConfidence / denominator,
    mismatches,
  };
}

function activeFalsePositiveRegister(register) {
  const now = Date.now();
  const active = new Map();

  for (const item of register) {
    if (!plainObject(item) || !isNonEmptyString(item.id)) {
      continue;
    }
    if (item.expiresAt && Date.parse(item.expiresAt) <= now) {
      continue;
    }
    if (['accepted', 'known-issue', 'waived'].includes(item.status)) {
      active.set(item.id, item);
    }
  }

  return active;
}

function calculateDrift(baselineMetrics, metrics) {
  const baseline = baselineMetrics ?? {};

  return {
    categoryAccuracyDrop: roundMetric(
      Math.max(0, Number(baseline.categoryAccuracy ?? 0) - metrics.categoryAccuracy),
    ),
    serviceTypeAccuracyDrop: roundMetric(
      Math.max(0, Number(baseline.serviceTypeAccuracy ?? 0) - metrics.serviceTypeAccuracy),
    ),
    highConfidenceCoverageDrop: roundMetric(
      Math.max(0, Number(baseline.highConfidenceCoverage ?? 0) - metrics.highConfidenceCoverage),
    ),
  };
}

function summarizeMetrics(metrics) {
  return {
    categoryAccuracy: roundMetric(metrics.categoryAccuracy),
    serviceTypeAccuracy: roundMetric(metrics.serviceTypeAccuracy),
    highConfidenceCoverage: roundMetric(metrics.highConfidenceCoverage),
  };
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
      failures.push(`${keyTrail.join('.')} must not be included in drift profiles.`);
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
    failures.push(`${trail.join('.') || 'drift profile'} contains secret-like material.`);
  }

  return failures;
}

function ratioValue(value, fallback) {
  return isRatio(value) ? value : fallback;
}

function integerValue(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function isRatio(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function roundMetric(value) {
  return Math.round(value * 10000) / 10000;
}

function formatRatio(value) {
  return `${Math.round(value * 10000) / 100}%`;
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `Diagram LLM corpus drift check passed (${result.monitoringLevel}; mismatches ${result.mismatchCount}, unreviewed ${result.unreviewedMismatchCount}).`,
    );
    if (result.verifiedExampleDriftCheck) {
      console.log(
        'Verified sample drift contract only. Use --require-live-model for production monitoring proof.',
      );
    }
    if (result.verifiedLiveModelDrift) {
      console.log('Verified live-model drift monitoring evidence.');
    }
    return;
  }

  console.error('Diagram LLM corpus drift check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Diagram LLM corpus drift check ${PACKAGE_VERSION}

Usage:
  node scripts/diagram-llm-corpus-drift-check.mjs [options] [profile.json]

Options:
  --profile <path>       Drift profile path (default: ${DEFAULT_PROFILE})
  --corpus <path>        Corpus file override (default: profile path or ${DEFAULT_CORPUS})
  --evidence <path>      Evidence bundle override (default: profile path or ${DEFAULT_EVIDENCE})
  --require-live-model   Require live endpoint/model evidence plus operator drift review
  --json                 Print machine-readable check output
  --quiet                Suppress human-readable success output
  --version              Print version
  --help                 Show this help
`);
}
