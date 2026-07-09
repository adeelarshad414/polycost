#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const CORPUS_SCHEMA = 'polycost-diagram-llm-corpus/v1';
const EVIDENCE_SCHEMA = 'polycost-diagram-llm-corpus-evidence/v1';
const CHECK_SCHEMA = 'polycost-diagram-llm-corpus-check/v1';
const DEFAULT_CORPUS = 'fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json';
const DEFAULT_EVIDENCE = 'docs/operations/evidence/diagram-llm-corpus-evidence.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_MIN_CATEGORY_ACCURACY = 0.9;
const DEFAULT_MIN_SERVICE_TYPE_ACCURACY = 0.8;
const SECRET_VALUE_PATTERNS = [/BEGIN PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /CHANGE_ME_DEV_ONLY/i];
const FORBIDDEN_RAW_KEYS = [
  /^rawPrompt$/i,
  /^rawPrompts$/i,
  /^rawResponse$/i,
  /^rawResponses$/i,
  /promptTranscript/i,
  /responseTranscript/i,
  /apiKey/i,
  /authorization/i,
  /bearerToken/i,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Diagram LLM corpus check error: ${message}`);
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
  const result = await checkCorpusEvidence(args);

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
          corpusPath: args.corpusPath,
          evidencePath: args.evidencePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Diagram LLM corpus check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    corpusPath: DEFAULT_CORPUS,
    evidencePath: DEFAULT_EVIDENCE,
    requireLiveModel: false,
    minCategoryAccuracy: DEFAULT_MIN_CATEGORY_ACCURACY,
    minServiceTypeAccuracy: DEFAULT_MIN_SERVICE_TYPE_ACCURACY,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };
  const positionals = [];

  for (const arg of argv) {
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
    if (arg.startsWith('--corpus=')) {
      options.corpusPath = arg.slice('--corpus='.length).trim();
      continue;
    }
    if (arg.startsWith('--evidence=')) {
      options.evidencePath = arg.slice('--evidence='.length).trim();
      continue;
    }
    if (arg.startsWith('--min-category-accuracy=')) {
      options.minCategoryAccuracy = parseRatio(arg.slice('--min-category-accuracy='.length));
      continue;
    }
    if (arg.startsWith('--min-service-type-accuracy=')) {
      options.minServiceTypeAccuracy = parseRatio(arg.slice('--min-service-type-accuracy='.length));
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
    throw new Error('Expected at most one diagram LLM evidence bundle path.');
  }

  if (!options.corpusPath) {
    throw new Error('Corpus path cannot be empty.');
  }
  if (!options.evidencePath) {
    throw new Error('Evidence path cannot be empty.');
  }

  return options;
}

async function checkCorpusEvidence(options) {
  const root = process.cwd();
  const corpusPath = path.resolve(root, options.corpusPath);
  const evidencePath = path.resolve(root, options.evidencePath);
  const corpusBuffer = await readFile(corpusPath);
  const corpusSha256 = sha256(corpusBuffer);
  const corpus = parseJsonObject(corpusBuffer.toString('utf8'), options.corpusPath);
  const evidence = parseJsonObject(await readFile(evidencePath, 'utf8'), options.evidencePath);
  const failures = [];
  const evidenceLevel = stringValue(evidence.evidenceLevel);
  const modelEvidence = plainObject(evidence.modelEvidence);
  const run = plainObject(evidence.run);
  const operatorAttestations = plainObject(evidence.operatorAttestations);
  const corpusCases = Array.isArray(corpus.cases) ? corpus.cases : [];
  const predictions = Array.isArray(evidence.predictions) ? evidence.predictions : [];

  if (corpus.schemaVersion !== CORPUS_SCHEMA) {
    failures.push(`corpus.schemaVersion must be ${CORPUS_SCHEMA}.`);
  }
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    failures.push(`evidence.schemaVersion must be ${EVIDENCE_SCHEMA}.`);
  }
  if (!['example-schema', 'live-model'].includes(evidenceLevel)) {
    failures.push('evidence.evidenceLevel must be example-schema or live-model.');
  }
  if (evidence.productionClaim === true) {
    failures.push(
      'evidence.productionClaim must remain false; this validates classifier evidence, not production deployment.',
    );
  }
  if (!isValidDateString(evidence.evaluatedAt)) {
    failures.push('evidence.evaluatedAt must be a valid ISO-8601 timestamp.');
  }
  if (evidence.corpusSha256 !== corpusSha256) {
    failures.push('evidence.corpusSha256 must match the checked corpus file.');
  }

  failures.push(...findForbiddenRawPayloads(evidence));
  failures.push(...findSecretMaterial(evidence));
  failures.push(...validateCorpus(corpusCases));
  failures.push(...validateModelEvidence(modelEvidence, options));
  failures.push(...validateRun(run, options));
  failures.push(...validateOperatorAttestations(operatorAttestations, options));

  const metrics = evaluatePredictions(corpusCases, predictions);
  failures.push(...metrics.failures);

  if (metrics.categoryAccuracy < options.minCategoryAccuracy) {
    failures.push(
      `category accuracy ${formatRatio(metrics.categoryAccuracy)} is below threshold ${formatRatio(
        options.minCategoryAccuracy,
      )}.`,
    );
  }
  if (metrics.serviceTypeAccuracy < options.minServiceTypeAccuracy) {
    failures.push(
      `service-type accuracy ${formatRatio(
        metrics.serviceTypeAccuracy,
      )} is below threshold ${formatRatio(options.minServiceTypeAccuracy)}.`,
    );
  }
  if (options.requireLiveModel && evidenceLevel !== 'live-model') {
    failures.push('evidenceLevel must be live-model when --require-live-model is used.');
  }

  const verifiedLiveModel =
    failures.length === 0 &&
    evidenceLevel === 'live-model' &&
    modelEvidence?.endpointConfigured === true &&
    modelEvidence?.vaultSecretVerified === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    corpusPath,
    evidencePath,
    corpusSha256,
    evidenceLevel,
    productionClaim: evidence.productionClaim === true,
    caseCount: corpusCases.length,
    predictionCount: predictions.length,
    categoryAccuracy: roundMetric(metrics.categoryAccuracy),
    serviceTypeAccuracy: roundMetric(metrics.serviceTypeAccuracy),
    highConfidenceCoverage: roundMetric(metrics.highConfidenceCoverage),
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedLiveModel,
    liveModelRequired: evidenceLevel !== 'live-model',
    thresholds: {
      minCategoryAccuracy: options.minCategoryAccuracy,
      minServiceTypeAccuracy: options.minServiceTypeAccuracy,
    },
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the corpus/evidence contract with sanitized sample predictions; it is not production LLM proof.'
        : 'This validates archived model evaluation evidence; production quality still depends on ongoing monitored corpus refresh and false-positive review.',
      'Raw prompts, raw provider responses, API keys, and authorization headers must stay out of evidence bundles.',
    ],
    failures,
  };
}

function validateCorpus(corpusCases) {
  const failures = [];
  const ids = new Set();

  if (corpusCases.length < 8) {
    failures.push('corpus must contain at least 8 cases.');
  }

  for (const item of corpusCases) {
    if (!plainObject(item)) {
      failures.push('every corpus case must be an object.');
      continue;
    }
    if (!isNonEmptyString(item.id)) {
      failures.push('every corpus case must have id.');
    } else if (ids.has(item.id)) {
      failures.push(`duplicate corpus case id: ${item.id}.`);
    } else {
      ids.add(item.id);
    }
    if (!isNonEmptyString(item.displayLabel)) {
      failures.push(`${item.id ?? 'case'} must have displayLabel.`);
    }
    if (!plainObject(item.expected)) {
      failures.push(`${item.id ?? 'case'} must have expected classification.`);
      continue;
    }
    if (!isNonEmptyString(item.expected.serviceCategory)) {
      failures.push(`${item.id ?? 'case'} expected.serviceCategory is required.`);
    }
    if (!isNonEmptyString(item.expected.serviceType)) {
      failures.push(`${item.id ?? 'case'} expected.serviceType is required.`);
    }
  }

  return failures;
}

function validateModelEvidence(modelEvidence, options) {
  const failures = [];

  if (!modelEvidence) {
    return ['modelEvidence must be an object.'];
  }
  if (!['fixture', 'openai-compatible'].includes(modelEvidence.providerCompatibility)) {
    failures.push('modelEvidence.providerCompatibility must be fixture or openai-compatible.');
  }
  if (!isNonEmptyString(modelEvidence.modelRef)) {
    failures.push('modelEvidence.modelRef must be present.');
  }
  if (modelEvidence.secretPath !== 'secret/polycost/llm') {
    failures.push('modelEvidence.secretPath must be secret/polycost/llm.');
  }
  if (options.requireLiveModel) {
    if (modelEvidence.endpointConfigured !== true) {
      failures.push('modelEvidence.endpointConfigured must be true for live-model evidence.');
    }
    if (modelEvidence.vaultSecretVerified !== true) {
      failures.push('modelEvidence.vaultSecretVerified must be true for live-model evidence.');
    }
    if (modelEvidence.providerCompatibility !== 'openai-compatible') {
      failures.push(
        'modelEvidence.providerCompatibility must be openai-compatible for live-model evidence.',
      );
    }
  }

  return failures;
}

function validateRun(run, options) {
  const failures = [];

  if (!run) {
    return ['run must be an object.'];
  }
  if (!['fixture-evidence', 'live-endpoint'].includes(run.mode)) {
    failures.push('run.mode must be fixture-evidence or live-endpoint.');
  }
  if (run.rawPromptsExcluded !== true) {
    failures.push('run.rawPromptsExcluded must be true.');
  }
  if (run.rawResponsesExcluded !== true) {
    failures.push('run.rawResponsesExcluded must be true.');
  }
  if (run.schemaValidated !== true) {
    failures.push('run.schemaValidated must be true.');
  }
  if (options.requireLiveModel && run.mode !== 'live-endpoint') {
    failures.push('run.mode must be live-endpoint for live-model evidence.');
  }

  return failures;
}

function validateOperatorAttestations(attestations, options) {
  const failures = [];

  if (!attestations) {
    return ['operatorAttestations must be an object.'];
  }
  if (attestations.rawSecretsExcluded !== true) {
    failures.push('operatorAttestations.rawSecretsExcluded must be true.');
  }
  if (attestations.productionClaimedByPolyCost !== false) {
    failures.push('operatorAttestations.productionClaimedByPolyCost must be false.');
  }
  if (options.requireLiveModel) {
    if (attestations.productionEndpointReviewed !== true) {
      failures.push('operatorAttestations.productionEndpointReviewed must be true.');
    }
    if (!isNonEmptyString(attestations.operator) || attestations.operator === 'example-only') {
      failures.push('operatorAttestations.operator must name a real reviewer.');
    }
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
    if (prediction.confidence === 'high') {
      highConfidence += 1;
    }
    if (prediction.serviceCategory === expected.expected.serviceCategory) {
      categoryCorrect += 1;
    }
    if (
      prediction.serviceCategory === expected.expected.serviceCategory &&
      prediction.serviceType === expected.expected.serviceType
    ) {
      serviceTypeCorrect += 1;
    }
  }

  for (const corpusCase of corpusCases) {
    if (!seenPredictionIds.has(corpusCase.id)) {
      failures.push(`missing prediction for corpus case ${corpusCase.id}.`);
    }
  }

  const denominator = corpusCases.length || 1;

  return {
    failures,
    categoryAccuracy: categoryCorrect / denominator,
    serviceTypeAccuracy: serviceTypeCorrect / denominator,
    highConfidenceCoverage: highConfidence / denominator,
  };
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
      failures.push(`${keyTrail.join('.')} must not be included in evidence bundles.`);
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
    failures.push(`${trail.join('.') || 'evidence'} contains secret-like material.`);
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

function parseRatio(value) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Expected ratio between 0 and 1, got ${value}.`);
  }

  return parsed;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
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
      `Diagram LLM corpus check passed: ${result.caseCount} cases, category ${formatRatio(
        result.categoryAccuracy,
      )}, service-type ${formatRatio(result.serviceTypeAccuracy)}.`,
    );
    if (result.liveModelRequired) {
      console.log('Live model evidence is still required before claiming production LLM quality.');
    }
    return;
  }

  console.error('Diagram LLM corpus check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Diagram LLM corpus check ${PACKAGE_VERSION}

Usage:
  node scripts/diagram-llm-corpus-check.mjs [options]

Options:
  --corpus=<path>                    Corpus file. Defaults to ${DEFAULT_CORPUS}
  --evidence=<path>                  Evidence file. Defaults to ${DEFAULT_EVIDENCE}
  --require-live-model               Require live endpoint/Vault/operator evidence
  --min-category-accuracy=<ratio>    Minimum category accuracy, default ${DEFAULT_MIN_CATEGORY_ACCURACY}
  --min-service-type-accuracy=<ratio> Minimum service-type accuracy, default ${DEFAULT_MIN_SERVICE_TYPE_ACCURACY}
  --json                             Print machine-readable check output
  --quiet                            Suppress success output
  --version                          Print version
  --help                             Show this help
`);
}
