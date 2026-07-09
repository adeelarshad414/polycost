#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const CAPTURE_SCHEMA = 'polycost-diagram-llm-corpus-evidence-capture/v1';
const EVIDENCE_SCHEMA = 'polycost-diagram-llm-corpus-evidence/v1';
const CAPTURE_RESULT_SCHEMA = 'polycost-diagram-llm-corpus-evidence-capture-result/v1';
const DEFAULT_PROFILE =
  'docs/operations/evidence/diagram-llm-corpus-capture/diagram-llm-corpus-capture.example.json';
const DEFAULT_OUTPUT = '.tmp/diagram-llm-corpus-capture/diagram-llm-corpus-evidence.json';
const DEFAULT_CORPUS = 'fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json';
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
  console.error(`Diagram LLM corpus evidence capture error: ${message}`);
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
  const result = await captureEvidence(args);

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
          schemaVersion: CAPTURE_RESULT_SCHEMA,
          profilePath: args.profilePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Diagram LLM corpus evidence capture failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    profilePath: DEFAULT_PROFILE,
    outputPath: undefined,
    corpusPath: DEFAULT_CORPUS,
    smoke: false,
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
    if (arg === '--smoke') {
      options.smoke = true;
      options.outputPath ??= DEFAULT_OUTPUT;
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
    if (arg === '--output') {
      options.outputPath = readOptionValue(argv, index, '--output');
      index += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      options.outputPath = arg.slice('--output='.length).trim();
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
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.profilePath = positionals.shift();
  }
  if (positionals[0]) {
    options.outputPath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one profile path and one output path.');
  }
  if (!options.profilePath) {
    throw new Error('Capture profile path cannot be empty.');
  }
  if (!options.corpusPath) {
    throw new Error('Corpus path cannot be empty.');
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

async function captureEvidence(options) {
  const root = process.cwd();
  const profilePath = path.resolve(root, options.profilePath);
  const profileDir = path.dirname(profilePath);
  const corpusPath = path.resolve(root, options.corpusPath);
  const corpusBuffer = await readFile(corpusPath);
  const corpusSha256 = sha256(corpusBuffer);
  const profile = parseJsonObject(await readFile(profilePath, 'utf8'), options.profilePath);
  const failures = [];

  if (profile.schemaVersion !== CAPTURE_SCHEMA) {
    failures.push(`profile.schemaVersion must be ${CAPTURE_SCHEMA}.`);
  }
  if (!['example-schema', 'live-model'].includes(profile.evidenceLevel)) {
    failures.push('profile.evidenceLevel must be example-schema or live-model.');
  }
  if (profile.productionClaim === true) {
    failures.push('profile.productionClaim must remain false.');
  }
  if (!isValidDateString(profile.evaluatedAt)) {
    failures.push('profile.evaluatedAt must be a valid ISO-8601 timestamp.');
  }

  failures.push(...findForbiddenRawPayloads(profile));
  failures.push(...findSecretMaterial(profile));

  const paths = plainObject(profile.paths);
  if (!paths) {
    failures.push('profile.paths must be an object.');
  }

  const predictionsPath = paths?.predictions
    ? resolveArtifactPath(profileDir, stringValue(paths.predictions))
    : undefined;
  if (!predictionsPath) {
    failures.push('profile.paths.predictions is required.');
  }

  const predictions = predictionsPath
    ? parseJsonArray(await readFile(predictionsPath, 'utf8'), paths.predictions)
    : [];
  failures.push(...findForbiddenRawPayloads(predictions));
  failures.push(...findSecretMaterial(predictions));

  const modelEvidence = plainObject(profile.modelEvidence);
  const run = plainObject(profile.run);
  const operatorAttestations = plainObject(profile.operatorAttestations);

  if (!modelEvidence) {
    failures.push('profile.modelEvidence must be an object.');
  }
  if (!run) {
    failures.push('profile.run must be an object.');
  }
  if (!operatorAttestations) {
    failures.push('profile.operatorAttestations must be an object.');
  }

  if (options.requireLiveModel || profile.evidenceLevel === 'live-model') {
    failures.push(...validateLiveProfile(profile, modelEvidence, run, operatorAttestations));
  }

  if (failures.length > 0) {
    return {
      ok: false,
      schemaVersion: CAPTURE_RESULT_SCHEMA,
      profilePath,
      outputPath: resolveOptionalOutput(root, options.outputPath),
      corpusPath,
      failures,
    };
  }

  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA,
    bundleName: stringValue(profile.bundleName),
    evidenceLevel: profile.evidenceLevel,
    productionClaim: false,
    evaluatedAt: profile.evaluatedAt,
    corpusSha256,
    modelEvidence,
    run,
    predictions,
    operatorAttestations,
    caveats: Array.isArray(profile.caveats)
      ? profile.caveats
      : defaultCaveats(profile.evidenceLevel),
  };
  const outputPath = resolveOptionalOutput(root, options.outputPath);

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }

  const downstreamValidation = outputPath
    ? runEvidenceChecker({
        corpusPath,
        evidencePath: outputPath,
        requireLiveModel: options.requireLiveModel,
      })
    : undefined;

  return {
    ok: !downstreamValidation || downstreamValidation.ok,
    schemaVersion: CAPTURE_RESULT_SCHEMA,
    profilePath,
    outputPath,
    corpusPath,
    corpusSha256,
    evidenceLevel: profile.evidenceLevel,
    predictionCount: predictions.length,
    downstreamValidation,
    verifiedExampleCapture:
      downstreamValidation?.ok === true && profile.evidenceLevel === 'example-schema',
    verifiedLiveCapture: downstreamValidation?.verifiedLiveModel === true,
    failures: downstreamValidation?.ok === false ? downstreamValidation.failures : [],
  };
}

function validateLiveProfile(profile, modelEvidence, run, operatorAttestations) {
  const failures = [];

  if (profile.evidenceLevel !== 'live-model') {
    failures.push('profile.evidenceLevel must be live-model when --require-live-model is used.');
  }
  if (modelEvidence?.providerCompatibility !== 'openai-compatible') {
    failures.push('profile.modelEvidence.providerCompatibility must be openai-compatible.');
  }
  if (modelEvidence?.endpointConfigured !== true) {
    failures.push('profile.modelEvidence.endpointConfigured must be true.');
  }
  if (modelEvidence?.vaultSecretVerified !== true) {
    failures.push('profile.modelEvidence.vaultSecretVerified must be true.');
  }
  if (modelEvidence?.secretPath !== 'secret/polycost/llm') {
    failures.push('profile.modelEvidence.secretPath must be secret/polycost/llm.');
  }
  if (run?.mode !== 'live-endpoint') {
    failures.push('profile.run.mode must be live-endpoint.');
  }
  for (const key of ['schemaValidated', 'rawPromptsExcluded', 'rawResponsesExcluded']) {
    if (run?.[key] !== true) {
      failures.push(`profile.run.${key} must be true.`);
    }
  }
  if (operatorAttestations?.productionEndpointReviewed !== true) {
    failures.push('profile.operatorAttestations.productionEndpointReviewed must be true.');
  }
  if (operatorAttestations?.rawSecretsExcluded !== true) {
    failures.push('profile.operatorAttestations.rawSecretsExcluded must be true.');
  }
  if (operatorAttestations?.productionClaimedByPolyCost !== false) {
    failures.push('profile.operatorAttestations.productionClaimedByPolyCost must be false.');
  }
  if (
    !isNonEmptyString(operatorAttestations?.operator) ||
    operatorAttestations.operator === 'example-only'
  ) {
    failures.push('profile.operatorAttestations.operator must name a real reviewer.');
  }

  return failures;
}

function runEvidenceChecker({ corpusPath, evidencePath, requireLiveModel }) {
  const args = [
    'scripts/diagram-llm-corpus-check.mjs',
    `--corpus=${path.relative(process.cwd(), corpusPath)}`,
    `--evidence=${path.relative(process.cwd(), evidencePath)}`,
    '--json',
  ];

  if (requireLiveModel) {
    args.push('--require-live-model');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });
  const stdout = result.stdout.trim();
  let parsed;

  try {
    parsed = stdout ? JSON.parse(stdout) : undefined;
  } catch {
    parsed = undefined;
  }

  if (parsed) {
    return parsed;
  }

  return {
    ok: false,
    schemaVersion: 'polycost-diagram-llm-corpus-check/v1',
    failures: [
      result.stderr.trim() ||
        stdout ||
        `diagram-llm-corpus-check exited with status ${result.status ?? 'unknown'}`,
    ],
  };
}

function resolveArtifactPath(profileDir, relativePath) {
  if (!isNonEmptyString(relativePath)) {
    return undefined;
  }
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.resolve(profileDir, relativePath);
}

function resolveOptionalOutput(root, outputPath) {
  if (!outputPath) {
    return undefined;
  }
  return path.resolve(root, outputPath);
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (!plainObject(parsed)) {
      throw new Error('expected a JSON object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function parseJsonArray(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('expected a JSON array');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
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
      failures.push(`${keyTrail.join('.')} must not be included in capture profiles.`);
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
    failures.push(`${trail.join('.') || 'capture'} contains secret-like material.`);
  }

  return failures;
}

function defaultCaveats(evidenceLevel) {
  if (evidenceLevel === 'live-model') {
    return [
      'This validates archived model evaluation evidence; production quality still depends on ongoing monitored corpus refresh and false-positive review.',
      'Raw prompts, raw provider responses, API keys, and authorization headers are excluded from this bundle.',
    ];
  }

  return [
    'This is sanitized sample evidence for CI/schema validation only.',
    'A real production bundle must use evidenceLevel=live-model after running the corpus against a configured endpoint/model and Vault-backed api_key.',
  ];
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `Diagram LLM corpus evidence capture passed (${result.evidenceLevel}; predictions ${result.predictionCount}).`,
    );
    if (result.outputPath) {
      console.log(`Evidence bundle: ${result.outputPath}`);
    }
    if (result.verifiedExampleCapture) {
      console.log('Verified sample capture only. Use --require-live-model for production proof.');
    }
    if (result.verifiedLiveCapture) {
      console.log('Verified live-model capture evidence.');
    }
    return;
  }

  console.error('Diagram LLM corpus evidence capture failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Usage: npm run diagram:llm-corpus:capture -- [options] [profile.json] [output.json]

Assembles sanitized diagram LLM corpus evidence from a capture profile and prediction artifact.

Options:
  --profile <path>       Capture profile path (default: ${DEFAULT_PROFILE})
  --output <path>        Evidence output path
  --corpus <path>        Corpus file path (default: ${DEFAULT_CORPUS})
  --smoke                Write to ${DEFAULT_OUTPUT} and run the downstream checker
  --require-live-model   Require live endpoint/Vault/operator evidence and strict downstream check
  --json                 Print JSON output
  --quiet                Suppress human-readable success output
  --version              Print version
  --help                 Show this help
`);
}
