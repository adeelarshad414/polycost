#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const CHECK_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-check/v1';
const SMOKE_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-check-smoke/v1';
const RUN_SCHEMA = 'polycost-pricing-catalog-live-capture-run/v1';
const CAPTURE_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture/v1';
const CAPTURE_SMOKE_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture-smoke/v1';
const PREFLIGHT_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture-preflight/v1';
const ARCHIVE_CHECK_SCHEMA = 'polycost-pricing-catalog-live-capture-archive-check/v1';
const SNAPSHOT_EVIDENCE_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence/v1';
const DEFAULT_RUN_SUMMARY = '.tmp/pricing-catalog-live-capture-run/run-summary.json';
const DEFAULT_SMOKE_DIR = '.tmp/pricing-catalog-live-capture-run-evidence-check';
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
  console.error(`Pricing catalog live capture run evidence check error: ${message}`);
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
  const result = args.smoke ? await runSmoke(args) : await checkRunSummary(args);

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
          schemaVersion: args.smoke ? SMOKE_SCHEMA : CHECK_SCHEMA,
          runSummaryPath: args.runSummaryPath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live capture run evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    runSummaryPath: DEFAULT_RUN_SUMMARY,
    runDir: undefined,
    requireLiveRun: false,
    smoke: false,
    smokeOutputDir: DEFAULT_SMOKE_DIR,
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
    if (arg === '--require-live-run') {
      options.requireLiveRun = true;
      continue;
    }
    if (arg === '--smoke') {
      options.smoke = true;
      continue;
    }
    if (arg === '--run-summary') {
      options.runSummaryPath = readOptionValue(argv, index, '--run-summary');
      index += 1;
      continue;
    }
    if (arg.startsWith('--run-summary=')) {
      options.runSummaryPath = arg.slice('--run-summary='.length).trim();
      continue;
    }
    if (arg === '--run-dir') {
      options.runDir = readOptionValue(argv, index, '--run-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--run-dir=')) {
      options.runDir = arg.slice('--run-dir='.length).trim();
      continue;
    }
    if (arg === '--smoke-output-dir') {
      options.smokeOutputDir = readOptionValue(argv, index, '--smoke-output-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--smoke-output-dir=')) {
      options.smokeOutputDir = arg.slice('--smoke-output-dir='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.runSummaryPath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one live capture run summary path.');
  }
  if (options.runDir) {
    options.runSummaryPath = path.join(options.runDir, 'run-summary.json');
  }
  if (!options.runSummaryPath) {
    throw new Error('Run summary path cannot be empty.');
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
  const outputDir = path.resolve(root, options.smokeOutputDir);
  const runnerSmokeOutputDir = path.join(outputDir, 'runner-smoke');
  const syntheticSummaryPath = path.join(outputDir, 'fixture-run-summary.json');

  await mkdir(outputDir, { recursive: true });

  const runnerSmoke = runJsonCommand({
    root,
    args: [
      'scripts/pricing-catalog-live-capture-run.mjs',
      '--smoke',
      '--output-dir',
      runnerSmokeOutputDir,
      '--json',
    ],
    label: 'live capture runner smoke',
  });
  const archiveBuild = runnerSmoke.archiveBuild;
  if (!archiveBuild) {
    throw new Error('Runner smoke did not emit archiveBuild evidence.');
  }

  const syntheticSummary = {
    ok: false,
    schemaVersion: RUN_SCHEMA,
    outputDir,
    preflightPath: archiveBuild.preflightPath,
    capturePath: archiveBuild.captureSmokePath,
    snapshotEvidencePath: archiveBuild.snapshotEvidencePath,
    archivePath: archiveBuild.archivePath,
    preflightReady: false,
    verifiedLiveProviderSnapshot: false,
    verifiedLiveCaptureArchive: false,
    caveats: [
      'Synthetic fixture run summary for evidence-check smoke only.',
      'This must validate base artifact wiring and fail --require-live-run.',
    ],
  };
  await writeJson(syntheticSummaryPath, syntheticSummary);

  const baseCheck = await checkRunSummary({
    ...options,
    smoke: false,
    runSummaryPath: syntheticSummaryPath,
    requireLiveRun: false,
  });
  const strictCheck = await checkRunSummary({
    ...options,
    smoke: false,
    runSummaryPath: syntheticSummaryPath,
    requireLiveRun: true,
  });

  const ok = baseCheck.ok === true && strictCheck.ok === false;
  return {
    ok,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    syntheticSummaryPath,
    runnerSmokeSchema: runnerSmoke.schemaVersion,
    baseFixtureRunAccepted: baseCheck.ok === true,
    strictLiveRejectedFixtureRun: strictCheck.ok === false,
    baseCheck,
    strictCheck,
    caveats: [
      'Smoke mode validates run-summary, preflight, capture, snapshot, and archive wiring with fixture evidence.',
      'Smoke mode proves fixture evidence is rejected as live run proof.',
    ],
    failures: ok
      ? []
      : [
          'Base fixture run wiring must pass while --require-live-run rejects the same fixture evidence.',
        ],
  };
}

async function checkRunSummary(options) {
  const root = process.cwd();
  const runSummaryPath = path.resolve(root, options.runSummaryPath);
  const runSummaryDir = path.dirname(runSummaryPath);
  const failures = [];
  let summary;

  try {
    summary = parseJsonObject(await readFile(runSummaryPath, 'utf8'), runSummaryPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedCheck({
      runSummaryPath,
      requireLiveRun: options.requireLiveRun,
      failures: [`run summary is not readable JSON: ${message}`],
    });
  }

  if (summary.schemaVersion !== RUN_SCHEMA) {
    failures.push(`runSummary.schemaVersion must be ${RUN_SCHEMA}.`);
  }
  if (options.requireLiveRun && summary.ok !== true) {
    failures.push('runSummary.ok must be true for --require-live-run.');
  }

  const paths = resolveRunPaths({ root, runSummaryDir, summary });
  failures.push(...paths.failures);
  const evidence = await readEvidenceFiles(paths.resolved);
  failures.push(...evidence.failures);

  if (evidence.preflight && evidence.preflight.schemaVersion !== PREFLIGHT_SCHEMA) {
    failures.push(`preflight.schemaVersion must be ${PREFLIGHT_SCHEMA}.`);
  }
  if (
    evidence.capture &&
    ![CAPTURE_SCHEMA, CAPTURE_SMOKE_SCHEMA].includes(evidence.capture.schemaVersion)
  ) {
    failures.push(`capture.schemaVersion must be ${CAPTURE_SCHEMA} or ${CAPTURE_SMOKE_SCHEMA}.`);
  }
  if (evidence.snapshot && evidence.snapshot.schemaVersion !== SNAPSHOT_EVIDENCE_SCHEMA) {
    failures.push(`snapshot evidence schemaVersion must be ${SNAPSHOT_EVIDENCE_SCHEMA}.`);
  }

  const archiveCheck = paths.resolved.archivePath
    ? runArchiveCheck({
        root,
        archivePath: paths.resolved.archivePath,
        requireLiveArchive: options.requireLiveRun,
      })
    : undefined;
  const parsedArchiveCheck = archiveCheck ? parseJsonOutput(archiveCheck.stdout) : undefined;

  if (archiveCheck && parsedArchiveCheck?.schemaVersion !== ARCHIVE_CHECK_SCHEMA) {
    failures.push('archive checker did not return the expected schema.');
  }
  if (archiveCheck && archiveCheck.status !== 0) {
    failures.push(
      options.requireLiveRun
        ? 'archive did not pass --require-live-archive.'
        : 'archive did not pass the base archive checker.',
    );
  }

  failures.push(
    ...validateSummaryConsistency({
      summary,
      paths: paths.resolved,
      preflight: evidence.preflight,
      capture: evidence.capture,
      archive: evidence.archive,
      archiveCheck: parsedArchiveCheck,
      requireLiveRun: options.requireLiveRun,
    }),
  );
  failures.push(...findForbiddenRawPayloads(summary, 'runSummary'));
  failures.push(...findSecretMaterial(summary, 'runSummary'));
  for (const [label, value] of Object.entries(evidence.documents)) {
    failures.push(...findForbiddenRawPayloads(value, label));
    failures.push(...findSecretMaterial(value, label));
  }

  const fileDigests = {};
  for (const [key, filePath] of Object.entries(paths.resolved)) {
    if (filePath && evidence.fileBuffers[key]) {
      fileDigests[key] = sha256(evidence.fileBuffers[key]);
    }
  }

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    runSummaryPath,
    strictLiveRequired: options.requireLiveRun,
    runSummaryOk: summary.ok === true,
    preflightReady: summary.preflightReady === true,
    verifiedLiveProviderSnapshot: summary.verifiedLiveProviderSnapshot === true,
    verifiedLiveCaptureArchive: summary.verifiedLiveCaptureArchive === true,
    archiveCheckerOk: parsedArchiveCheck?.ok === true,
    archiveEvidenceLevel: parsedArchiveCheck?.evidenceLevel,
    archiveCheckerVerifiedLiveCaptureArchive:
      parsedArchiveCheck?.verifiedLiveCaptureArchive === true,
    providerCount: parsedArchiveCheck?.providerCount,
    paths: relativizePaths(root, paths.resolved),
    fileDigests,
    caveats: [
      options.requireLiveRun
        ? 'This proves a target-environment live catalog capture run artifact set is internally consistent; it is still not invoice-grade billing proof.'
        : 'This validates run artifact wiring and archive checker handoff; use --require-live-run for target-environment live proof.',
      'Raw provider payloads, credentials, signed URLs, authorization headers, and private billing artifacts must stay out of run evidence.',
    ],
    failures,
  };
}

function failedCheck({ runSummaryPath, requireLiveRun, failures }) {
  return {
    ok: false,
    schemaVersion: CHECK_SCHEMA,
    runSummaryPath,
    strictLiveRequired: requireLiveRun,
    failures,
  };
}

function resolveRunPaths({ root, runSummaryDir, summary }) {
  const failures = [];
  const resolved = {};
  for (const key of ['preflightPath', 'capturePath', 'snapshotEvidencePath', 'archivePath']) {
    const value = stringValue(summary[key]);
    if (!value) {
      failures.push(`runSummary.${key} is required.`);
      continue;
    }
    resolved[key] = path.isAbsolute(value)
      ? value
      : path.resolve(key === 'snapshotEvidencePath' ? runSummaryDir : root, value);
  }

  return { failures, resolved };
}

async function readEvidenceFiles(paths) {
  const failures = [];
  const documents = {};
  const fileBuffers = {};
  const map = {
    preflightPath: 'preflight',
    capturePath: 'capture',
    snapshotEvidencePath: 'snapshot',
    archivePath: 'archive',
  };

  for (const [pathKey, label] of Object.entries(map)) {
    const filePath = paths[pathKey];
    if (!filePath) {
      continue;
    }

    try {
      const buffer = await readFile(filePath);
      fileBuffers[pathKey] = buffer;
      documents[label] = parseJsonObject(buffer.toString('utf8'), filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label} evidence file is not readable JSON: ${message}`);
    }
  }

  return {
    failures,
    documents,
    fileBuffers,
    preflight: documents.preflight,
    capture: documents.capture,
    snapshot: documents.snapshot,
    archive: documents.archive,
  };
}

function validateSummaryConsistency({
  summary,
  paths,
  preflight,
  capture,
  archive,
  archiveCheck,
  requireLiveRun,
}) {
  const failures = [];

  if (preflight) {
    if (summary.preflightReady !== (preflight.readyForLiveCapture === true)) {
      failures.push('runSummary.preflightReady must match preflight.readyForLiveCapture.');
    }
    if (requireLiveRun) {
      if (preflight.strictLive !== true) {
        failures.push('preflight.strictLive must be true for --require-live-run.');
      }
      if (preflight.readyForLiveCapture !== true) {
        failures.push('preflight.readyForLiveCapture must be true for --require-live-run.');
      }
      if (preflight.failureCount !== 0 || preflight.warningCount !== 0) {
        failures.push('preflight failureCount and warningCount must both be zero.');
      }
      failures.push(...validateLivePreflightChecks(preflight));
    }
  }

  if (capture) {
    if (
      hasValue(capture.evidencePath) &&
      !sameResolvedPath(capture.evidencePath, paths.snapshotEvidencePath)
    ) {
      failures.push('capture.evidencePath must match runSummary.snapshotEvidencePath.');
    }
    if (summary.verifiedLiveProviderSnapshot !== (capture.verifiedLiveProviderSnapshot === true)) {
      failures.push(
        'runSummary.verifiedLiveProviderSnapshot must match capture.verifiedLiveProviderSnapshot.',
      );
    }
    if (requireLiveRun && capture.schemaVersion !== CAPTURE_SCHEMA) {
      failures.push(`capture.schemaVersion must be ${CAPTURE_SCHEMA} for --require-live-run.`);
    }
    if (requireLiveRun && capture.mode !== 'live') {
      failures.push('capture.mode must be live for --require-live-run.');
    }
    if (requireLiveRun && capture.verifiedLiveProviderSnapshot !== true) {
      failures.push('capture.verifiedLiveProviderSnapshot must be true for --require-live-run.');
    }
  }

  if (archive) {
    const archiveSnapshotPath = stringValue(archive.snapshotEvidence?.path);
    if (archiveSnapshotPath) {
      const resolvedArchiveSnapshotPath = path.resolve(
        path.dirname(paths.archivePath),
        archiveSnapshotPath,
      );
      if (!sameResolvedPath(resolvedArchiveSnapshotPath, paths.snapshotEvidencePath)) {
        failures.push(
          'archive.snapshotEvidence.path must resolve to runSummary.snapshotEvidencePath.',
        );
      }
    }
  }

  if (archiveCheck) {
    if (summary.verifiedLiveCaptureArchive !== (archiveCheck.verifiedLiveCaptureArchive === true)) {
      failures.push(
        'runSummary.verifiedLiveCaptureArchive must match archive checker verifiedLiveCaptureArchive.',
      );
    }
    if (requireLiveRun && archiveCheck.verifiedLiveCaptureArchive !== true) {
      failures.push('archive checker must verify live capture archive for --require-live-run.');
    }
    if (requireLiveRun && archiveCheck.verifiedLiveProviderSnapshot !== true) {
      failures.push('archive checker must verify live provider snapshot for --require-live-run.');
    }
    if (requireLiveRun && archiveCheck.providerCount !== 3) {
      failures.push('archive checker providerCount must be 3 for --require-live-run.');
    }
  }

  if (requireLiveRun && summary.verifiedLiveCaptureArchive !== true) {
    failures.push('runSummary.verifiedLiveCaptureArchive must be true for --require-live-run.');
  }

  return failures;
}

function validateLivePreflightChecks(preflight) {
  const failures = [];
  const checks = Array.isArray(preflight.checks) ? preflight.checks : [];
  const checkById = new Map(checks.map((check) => [check?.id, check]));

  for (const id of REQUIRED_PREFLIGHT_CHECKS) {
    const check = checkById.get(id);
    if (!check) {
      failures.push(`preflight.checks must include ${id}.`);
      continue;
    }
    if (check.status !== 'pass') {
      failures.push(`preflight check ${id} must pass for --require-live-run.`);
    }
  }

  return failures;
}

function runArchiveCheck({ root, archivePath, requireLiveArchive }) {
  const args = ['scripts/pricing-catalog-live-capture-archive-check.mjs'];
  if (requireLiveArchive) {
    args.push('--require-live-archive');
  }
  args.push(archivePath, '--json');

  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
  });
}

function runJsonCommand({ root, args, label }) {
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: scrubbedEnv(),
  });
  const parsed = parseJsonOutput(child.stdout);

  if (child.status !== 0 || !parsed) {
    throw new Error(`${label} failed or did not emit JSON.`);
  }

  return parsed;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonObject(value, label) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }

  return parsed;
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function findForbiddenRawPayloads(value, context, trail = context) {
  const failures = [];
  if (!value || typeof value !== 'object') {
    return failures;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextTrail = `${trail}.${key}`;
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(`${nextTrail} must not contain raw provider payload or credential fields.`);
    }
    failures.push(...findForbiddenRawPayloads(nested, context, nextTrail));
  }

  return failures;
}

function findSecretMaterial(value, context, trail = context) {
  const failures = [];
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      failures.push(`${trail} appears to contain secret material.`);
    }
    return failures;
  }
  if (!value || typeof value !== 'object') {
    return failures;
  }
  for (const [key, nested] of Object.entries(value)) {
    failures.push(...findSecretMaterial(nested, context, `${trail}.${key}`));
  }

  return failures;
}

function relativizePaths(root, paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([key, value]) => [
      key,
      value ? path.relative(root, value) || '.' : undefined,
    ]),
  );
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function sameResolvedPath(left, right) {
  if (!left || !right) {
    return false;
  }

  return path.resolve(left) === path.resolve(right);
}

function scrubbedEnv() {
  const env = { ...process.env };
  for (const key of [
    'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE',
    'POLYCOST_OPERATOR',
    'PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE',
    'GCP_CLOUD_BILLING_ACCESS_TOKEN',
    'GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE',
    'VAULT_TOKEN',
    'VAULT_TOKEN_FILE',
  ]) {
    delete env[key];
  }

  return env;
}

function printResult(result) {
  if (result.schemaVersion === SMOKE_SCHEMA) {
    console.log('Pricing catalog live capture run evidence smoke passed.');
    console.log(`Output directory: ${path.relative(process.cwd(), result.outputDir)}`);
    console.log(`Base fixture run accepted: ${result.baseFixtureRunAccepted}`);
    console.log(`Strict live rejected fixture run: ${result.strictLiveRejectedFixtureRun}`);
    return;
  }

  if (result.ok) {
    console.log('Pricing catalog live capture run evidence check passed.');
  } else {
    console.log('Pricing catalog live capture run evidence check failed.');
  }
  console.log(`Run summary: ${path.relative(process.cwd(), result.runSummaryPath)}`);
  console.log(`Strict live required: ${result.strictLiveRequired}`);
  console.log(`Verified live archive: ${result.verifiedLiveCaptureArchive}`);
  if (Array.isArray(result.failures) && result.failures.length > 0) {
    console.log(`Failures: ${result.failures.length}`);
  }
}

function printHelp() {
  console.log(`Pricing catalog live capture run evidence check ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-capture-run-evidence-check.mjs [run-summary.json] [options]
  node scripts/pricing-catalog-live-capture-run-evidence-check.mjs --run-dir <dir> [options]
  node scripts/pricing-catalog-live-capture-run-evidence-check.mjs --smoke

Options:
  --run-summary <path>       Run summary JSON emitted by pricing-catalog-live-capture-run.mjs
  --run-dir <path>           Directory containing run-summary.json
  --require-live-run         Require strict live preflight, live capture, and verified archive proof
  --smoke                    Generate fixture artifacts and prove strict live mode rejects them
  --smoke-output-dir <path>  Output directory for generated smoke artifacts (default: ${DEFAULT_SMOKE_DIR})
  --json                     Print machine-readable output
  --quiet                    Suppress human-readable output
  --version                  Print version
  --help                     Show this help
`);
}
