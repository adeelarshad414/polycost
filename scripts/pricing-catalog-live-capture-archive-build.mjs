#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const BUILD_SCHEMA = 'polycost-pricing-catalog-live-capture-archive-build/v1';
const ARCHIVE_SCHEMA = 'polycost-pricing-catalog-live-capture-archive/v1';
const CAPTURE_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture/v1';
const SMOKE_SCHEMA = 'polycost-pricing-catalog-live-capture-archive-build-smoke/v1';
const SNAPSHOT_EVIDENCE_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence/v1';
const PREFLIGHT_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture-preflight/v1';
const DEFAULT_OUTPUT = '.tmp/pricing-catalog-live-capture-archive/archive.json';
const DEFAULT_SMOKE_DIR = '.tmp/pricing-catalog-live-capture-archive-build-smoke';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_PROVIDERS = new Set(['aws', 'azure', 'gcp']);

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live capture archive build error: ${message}`);
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
  const result = args.smoke ? await runSmoke(args) : await buildArchive(args);

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
          schemaVersion: args.smoke ? SMOKE_SCHEMA : BUILD_SCHEMA,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live capture archive build failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    preflightPath: undefined,
    capturePath: undefined,
    snapshotEvidencePath: undefined,
    outputPath: DEFAULT_OUTPUT,
    operator: undefined,
    operatorRole: 'release-operator',
    archiveName: 'pricing-catalog-live-capture-archive',
    captureCommand: 'npm run pricing:catalog:snapshot:capture',
    requireLiveArchive: false,
    verify: true,
    smoke: false,
    smokeOutputDir: DEFAULT_SMOKE_DIR,
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
    if (arg === '--smoke') {
      options.smoke = true;
      continue;
    }
    if (arg === '--require-live-archive') {
      options.requireLiveArchive = true;
      continue;
    }
    if (arg === '--no-verify') {
      options.verify = false;
      continue;
    }
    if (arg === '--preflight') {
      options.preflightPath = readOptionValue(argv, index, '--preflight');
      index += 1;
      continue;
    }
    if (arg.startsWith('--preflight=')) {
      options.preflightPath = arg.slice('--preflight='.length).trim();
      continue;
    }
    if (arg === '--capture') {
      options.capturePath = readOptionValue(argv, index, '--capture');
      index += 1;
      continue;
    }
    if (arg.startsWith('--capture=')) {
      options.capturePath = arg.slice('--capture='.length).trim();
      continue;
    }
    if (arg === '--snapshot-evidence') {
      options.snapshotEvidencePath = readOptionValue(argv, index, '--snapshot-evidence');
      index += 1;
      continue;
    }
    if (arg.startsWith('--snapshot-evidence=')) {
      options.snapshotEvidencePath = arg.slice('--snapshot-evidence='.length).trim();
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
    if (arg === '--smoke-output-dir') {
      options.smokeOutputDir = readOptionValue(argv, index, '--smoke-output-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--smoke-output-dir=')) {
      options.smokeOutputDir = arg.slice('--smoke-output-dir='.length).trim();
      continue;
    }
    if (arg === '--operator') {
      options.operator = readOptionValue(argv, index, '--operator');
      index += 1;
      continue;
    }
    if (arg.startsWith('--operator=')) {
      options.operator = arg.slice('--operator='.length).trim();
      continue;
    }
    if (arg === '--operator-role') {
      options.operatorRole = readOptionValue(argv, index, '--operator-role');
      index += 1;
      continue;
    }
    if (arg.startsWith('--operator-role=')) {
      options.operatorRole = arg.slice('--operator-role='.length).trim();
      continue;
    }
    if (arg === '--archive-name') {
      options.archiveName = readOptionValue(argv, index, '--archive-name');
      index += 1;
      continue;
    }
    if (arg.startsWith('--archive-name=')) {
      options.archiveName = arg.slice('--archive-name='.length).trim();
      continue;
    }
    if (arg === '--capture-command') {
      options.captureCommand = readOptionValue(argv, index, '--capture-command');
      index += 1;
      continue;
    }
    if (arg.startsWith('--capture-command=')) {
      options.captureCommand = arg.slice('--capture-command='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
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
  const preflightPath = path.join(outputDir, 'preflight.json');
  const smokeCapturePath = path.join(outputDir, 'capture-smoke.json');
  const archivePath = path.join(outputDir, 'archive.json');

  await mkdir(outputDir, { recursive: true });

  const preflight = runJsonCommand({
    root,
    command: [
      process.execPath,
      ['scripts/pricing-catalog-live-snapshot-capture-preflight.mjs', '--json'],
    ],
    label: 'preflight',
  });
  await writeJson(preflightPath, preflight);

  const captureSmoke = runJsonCommand({
    root,
    command: [
      process.execPath,
      [
        'scripts/pricing-catalog-live-snapshot-capture-smoke.mjs',
        '--output-dir',
        path.join(outputDir, 'capture-smoke'),
        '--json',
      ],
    ],
    label: 'capture smoke',
  });
  await writeJson(smokeCapturePath, captureSmoke);

  const archiveBuild = await buildArchive({
    ...options,
    smoke: false,
    preflightPath,
    capturePath: smokeCapturePath,
    snapshotEvidencePath: captureSmoke.evidencePath,
    outputPath: archivePath,
    operator: 'archive-builder-smoke',
    operatorRole: 'release-operator',
    archiveName: 'pricing-catalog-live-capture-archive-build-smoke',
    captureCommand: 'npm run pricing:catalog:snapshot:capture:smoke',
    requireLiveArchive: false,
    verify: true,
  });
  const strictCheck = runArchiveCheck({
    root,
    archivePath,
    requireLiveArchive: true,
  });

  return {
    ok: archiveBuild.ok && strictCheck.status !== 0,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    preflightPath,
    captureSmokePath: smokeCapturePath,
    archivePath,
    snapshotEvidencePath: captureSmoke.evidencePath,
    verifiedExampleArchive: archiveBuild.verifiedExampleArchive,
    verifiedLiveCaptureArchive: archiveBuild.verifiedLiveCaptureArchive,
    strictLiveRejectedFixtureArchive: strictCheck.status !== 0,
    caveats: [
      'This smoke generates an archive manifest from advisory preflight output and provider-native fixture capture evidence.',
      'It proves archive-builder and archive-checker handoff without provider network calls or cloud credentials.',
    ],
  };
}

async function buildArchive(options) {
  const root = process.cwd();
  assertBuildInputs(options);

  const outputPath = path.resolve(root, options.outputPath);
  const outputDir = path.dirname(outputPath);
  const preflightPath = path.resolve(root, options.preflightPath);
  const capturePath = path.resolve(root, options.capturePath);
  const preflight = parseJsonObject(await readFile(preflightPath, 'utf8'), options.preflightPath);
  const capture = parseJsonObject(await readFile(capturePath, 'utf8'), options.capturePath);
  const snapshotEvidencePath = path.resolve(
    root,
    options.snapshotEvidencePath || capture.evidencePath,
  );
  const snapshotEvidenceBuffer = await readFile(snapshotEvidencePath);
  const snapshotEvidenceSha256 = sha256(snapshotEvidenceBuffer);
  const snapshotEvidence = parseJsonObject(
    snapshotEvidenceBuffer.toString('utf8'),
    snapshotEvidencePath,
  );
  const strictSnapshotCheck = runSnapshotEvidenceCheck({
    root,
    evidencePath: snapshotEvidencePath,
    requireLiveProvider: true,
  });
  const archive = buildArchiveManifest({
    root,
    outputDir,
    preflight,
    capture,
    snapshotEvidence,
    snapshotEvidencePath,
    snapshotEvidenceSha256,
    strictSnapshotCheck,
    options,
  });

  await mkdir(outputDir, { recursive: true });
  await writeJson(outputPath, archive);

  const archiveCheck = options.verify
    ? runArchiveCheck({
        root,
        archivePath: outputPath,
        requireLiveArchive: options.requireLiveArchive,
      })
    : undefined;
  const ok = options.verify ? archiveCheck.status === 0 : true;
  const parsedArchiveCheck = archiveCheck ? parseJsonOutput(archiveCheck.stdout) : undefined;

  return {
    ok,
    schemaVersion: BUILD_SCHEMA,
    archivePath: outputPath,
    evidenceLevel: archive.evidenceLevel,
    snapshotEvidencePath: path.relative(root, snapshotEvidencePath),
    snapshotEvidenceSha256,
    strictSnapshotCheckerPassed: strictSnapshotCheck.status === 0,
    verifiedExampleArchive: parsedArchiveCheck?.verifiedExampleArchive === true,
    verifiedLiveCaptureArchive: parsedArchiveCheck?.verifiedLiveCaptureArchive === true,
    archiveCheckerExitCode: archiveCheck?.status,
    caveats: [
      archive.evidenceLevel === 'live-provider-capture-archive'
        ? 'The generated manifest is shaped for live-provider archive proof, but invoice-grade billing still requires provider invoice controls.'
        : 'The generated manifest validates archive plumbing only; it is not live-provider proof.',
    ],
  };
}

function assertBuildInputs(options) {
  const missing = [];
  if (!options.preflightPath) {
    missing.push('--preflight');
  }
  if (!options.capturePath) {
    missing.push('--capture');
  }
  if (!options.snapshotEvidencePath) {
    missing.push('--snapshot-evidence');
  }
  if (!options.operator) {
    missing.push('--operator');
  }
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} required unless --smoke is used.`);
  }
}

function buildArchiveManifest({
  root,
  outputDir,
  preflight,
  capture,
  snapshotEvidence,
  snapshotEvidencePath,
  snapshotEvidenceSha256,
  strictSnapshotCheck,
  options,
}) {
  validateSourceShapes({ preflight, capture, snapshotEvidence });

  const strictSnapshotCheckerPassed = strictSnapshotCheck.status === 0;
  const captureMode = stringValue(capture.mode) || 'unknown';
  const verifiedLiveProviderSnapshot =
    capture.verifiedLiveProviderSnapshot === true && strictSnapshotCheckerPassed;
  const evidenceLevel = verifiedLiveProviderSnapshot
    ? 'live-provider-capture-archive'
    : 'example-schema';
  const relativeSnapshotPath = path.relative(outputDir, snapshotEvidencePath);
  const providerSnapshots = Array.isArray(snapshotEvidence.providerSnapshots)
    ? snapshotEvidence.providerSnapshots
    : [];

  return {
    schemaVersion: ARCHIVE_SCHEMA,
    archiveName: options.archiveName,
    evidenceLevel,
    productionClaim: false,
    archivedAt: new Date().toISOString(),
    operator: {
      name: options.operator,
      role: options.operatorRole,
      attestedAt: new Date().toISOString(),
    },
    preflight: {
      schemaVersion: preflight.schemaVersion,
      checkedAt: preflight.checkedAt,
      strictLive: preflight.strictLive === true,
      readyForLiveCapture: preflight.readyForLiveCapture === true,
      warningCount: nonNegativeInteger(preflight.warningCount),
      failureCount: nonNegativeInteger(preflight.failureCount),
      checkIds: Array.isArray(preflight.checks)
        ? preflight.checks.map((check) => check?.id).filter(Boolean)
        : [],
    },
    capture: {
      schemaVersion: CAPTURE_SCHEMA,
      mode: captureMode,
      capturedAt: snapshotEvidence.capturedAt || capture.checkedAt || new Date().toISOString(),
      command: options.captureCommand,
      verifiedLiveProviderSnapshot,
    },
    snapshotEvidence: {
      path: relativeSnapshotPath,
      sha256: snapshotEvidenceSha256,
      expectedVerifiedLiveProviderSnapshot: verifiedLiveProviderSnapshot,
      requiredChecker:
        'npm run pricing:catalog:snapshot:check -- --require-live-provider <bundle.json>',
    },
    providerCoverage: providerSnapshots.map((snapshot) => ({
      provider: snapshot.provider,
      sourceSystem: snapshot.sourceSystem,
      sourceMode: snapshot.sourceMode,
      rowCount: nonNegativeInteger(snapshot.rowCount),
      changedRowCount: nonNegativeInteger(snapshot.changedRowCount),
    })),
    attestations: {
      rawCatalogPayloadExcluded: true,
      credentialsExcluded: true,
      signedUrlsExcluded: true,
      archiveDigestVerified: SHA256_PATTERN.test(snapshotEvidenceSha256),
      strictSnapshotCheckerPassed,
      productionClaimedByPolyCost: false,
    },
    caveats: [
      evidenceLevel === 'live-provider-capture-archive'
        ? 'This manifest was generated from live-provider snapshot evidence and strict snapshot checker output.'
        : 'This manifest was generated from non-live or sample evidence and must not be used as live provider proof.',
      'PolyCost still does not provide invoice-grade billing, private discounts, taxes, actual invoices, or legal invoice-of-record reconciliation.',
    ],
  };
}

function validateSourceShapes({ preflight, capture, snapshotEvidence }) {
  const failures = [];

  if (preflight.schemaVersion !== PREFLIGHT_SCHEMA) {
    failures.push(`preflight.schemaVersion must be ${PREFLIGHT_SCHEMA}.`);
  }
  if (!hasValue(preflight.checkedAt)) {
    failures.push('preflight.checkedAt is required.');
  }
  if (!Array.isArray(preflight.checks)) {
    failures.push('preflight.checks must be an array.');
  }
  if (
    ![CAPTURE_SCHEMA, 'polycost-pricing-catalog-live-snapshot-capture-smoke/v1'].includes(
      capture.schemaVersion,
    )
  ) {
    failures.push(
      `capture.schemaVersion must be ${CAPTURE_SCHEMA} or the live capture smoke schema.`,
    );
  }
  if (!hasValue(capture.mode) && !hasValue(capture.evidencePath)) {
    failures.push('capture.mode or capture.evidencePath is required.');
  }
  if (snapshotEvidence.schemaVersion !== SNAPSHOT_EVIDENCE_SCHEMA) {
    failures.push(`snapshot evidence schemaVersion must be ${SNAPSHOT_EVIDENCE_SCHEMA}.`);
  }
  if (!Array.isArray(snapshotEvidence.providerSnapshots)) {
    failures.push('snapshot evidence providerSnapshots must be an array.');
  } else {
    const providers = new Set(
      snapshotEvidence.providerSnapshots.map((snapshot) => snapshot?.provider),
    );
    for (const provider of SUPPORTED_PROVIDERS) {
      if (!providers.has(provider)) {
        failures.push(`snapshot evidence providerSnapshots must include ${provider}.`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

function runJsonCommand({ root, command, label }) {
  const [cmd, args] = command;
  const child = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: scrubbedEnv(),
  });
  const parsed = parseJsonOutput(child.stdout);

  if (child.status !== 0 || !parsed) {
    throw new Error(`${label} command failed or did not emit JSON.`);
  }

  return parsed;
}

function runSnapshotEvidenceCheck({ root, evidencePath, requireLiveProvider }) {
  const args = ['scripts/pricing-catalog-snapshot-evidence-check.mjs'];
  if (requireLiveProvider) {
    args.push('--require-live-provider');
  }
  args.push(evidencePath, '--json');

  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: scrubbedEnv(),
  });
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
    env: scrubbedEnv(),
  });
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function scrubbedEnv() {
  const env = { ...process.env };
  for (const key of [
    'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE',
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
    console.log('Pricing catalog live capture archive builder smoke passed.');
    console.log(`Archive manifest: ${path.relative(process.cwd(), result.archivePath)}`);
    console.log(`Strict live rejected fixture archive: ${result.strictLiveRejectedFixtureArchive}`);
    return;
  }

  console.log('Pricing catalog live capture archive manifest built.');
  console.log(`Archive manifest: ${path.relative(process.cwd(), result.archivePath)}`);
  console.log(`Evidence level: ${result.evidenceLevel}`);
  console.log(`Archive checker exit code: ${result.archiveCheckerExitCode ?? 'not-run'}`);
}

function printHelp() {
  console.log(`Pricing catalog live capture archive build ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-capture-archive-build.mjs --preflight <preflight.json> --capture <capture.json> --snapshot-evidence <evidence.json> --operator <name> [options]
  node scripts/pricing-catalog-live-capture-archive-build.mjs --smoke [options]

Options:
  --preflight <path>             Preflight JSON emitted by pricing catalog live preflight --json
  --capture <path>               Capture JSON emitted by pricing catalog live capture --json
  --snapshot-evidence <path>     Sanitized snapshot evidence JSON referenced by capture
  --output <path>                Archive manifest output path (default: ${DEFAULT_OUTPUT})
  --operator <name>              Human/operator attestation name
  --operator-role <role>         Operator role label (default: release-operator)
  --archive-name <name>          Archive manifest name
  --capture-command <command>    Command recorded in the archive manifest
  --require-live-archive         Verify generated manifest in strict live archive mode
  --no-verify                    Write manifest without invoking the archive checker
  --smoke                        Generate local preflight/fixture capture inputs and validate archive-builder handoff
  --smoke-output-dir <path>      Smoke output directory (default: ${DEFAULT_SMOKE_DIR})
  --json                         Print machine-readable output
  --quiet                        Suppress human-readable output
  --version                      Print version
  --help                         Show this help
`);
}
