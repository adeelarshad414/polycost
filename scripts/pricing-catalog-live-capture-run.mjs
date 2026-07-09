#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const RUN_SCHEMA = 'polycost-pricing-catalog-live-capture-run/v1';
const PLAN_SCHEMA = 'polycost-pricing-catalog-live-capture-run-plan/v1';
const SMOKE_SCHEMA = 'polycost-pricing-catalog-live-capture-run-smoke/v1';
const LIVE_GUARD_ENV = 'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE';
const DEFAULT_OUTPUT_DIR = '.tmp/pricing-catalog-live-capture-run';
const DEFAULT_OPERATOR_ROLE = 'release-operator';

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live capture run error: ${message}`);
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
  const result = args.smoke
    ? await runSmoke(args)
    : args.live
      ? await runLive(args)
      : runPlan(args);

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
          schemaVersion: args.smoke ? SMOKE_SCHEMA : args.live ? RUN_SCHEMA : PLAN_SCHEMA,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live capture run failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    plan: true,
    smoke: false,
    live: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    operator: process.env.POLYCOST_OPERATOR,
    operatorRole: DEFAULT_OPERATOR_ROLE,
    previousEvidencePath: process.env.PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE,
    sampleLimit: '2',
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
    if (arg === '--plan') {
      options.plan = true;
      options.smoke = false;
      options.live = false;
      continue;
    }
    if (arg === '--smoke') {
      options.plan = false;
      options.smoke = true;
      options.live = false;
      continue;
    }
    if (arg === '--live') {
      options.plan = false;
      options.smoke = false;
      options.live = true;
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
    if (arg === '--previous-evidence') {
      options.previousEvidencePath = readOptionValue(argv, index, '--previous-evidence');
      index += 1;
      continue;
    }
    if (arg.startsWith('--previous-evidence=')) {
      options.previousEvidencePath = arg.slice('--previous-evidence='.length).trim();
      continue;
    }
    if (arg === '--sample-limit') {
      options.sampleLimit = readPositiveInteger(readOptionValue(argv, index, '--sample-limit'));
      index += 1;
      continue;
    }
    if (arg.startsWith('--sample-limit=')) {
      options.sampleLimit = readPositiveInteger(arg.slice('--sample-limit='.length).trim());
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  options.sampleLimit = readPositiveInteger(options.sampleLimit);

  return options;
}

function readOptionValue(argv, index, flag) {
  const value = argv[index + 1]?.trim();

  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('--sample-limit must be a positive integer.');
  }

  return String(parsed);
}

function runPlan(options) {
  const outputDir = path.resolve(process.cwd(), options.outputDir);

  return {
    ok: true,
    schemaVersion: PLAN_SCHEMA,
    outputDir,
    liveGuardEnv: LIVE_GUARD_ENV,
    liveGuardRequiredValue: 'true',
    requiredInputs: [
      'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true',
      'POLYCOST_OPERATOR or --operator',
      'PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE or --previous-evidence',
      'GCP_CLOUD_BILLING_ACCESS_TOKEN, GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE, or Vault token file',
    ],
    artifacts: {
      preflight: path.join(outputDir, 'preflight.json'),
      capture: path.join(outputDir, 'capture.json'),
      snapshotEvidence: path.join(
        outputDir,
        'capture-output',
        'pricing-catalog-live-snapshot-evidence.json',
      ),
      archive: path.join(outputDir, 'archive.json'),
      runSummary: path.join(outputDir, 'run-summary.json'),
    },
    commandSequence: [
      'pricing:catalog:snapshot:capture:preflight:strict',
      'pricing:catalog:snapshot:capture -- --live',
      'pricing:catalog:snapshot:capture:archive:build -- --require-live-archive',
      'pricing:catalog:snapshot:capture:archive:strict',
    ],
    caveats: [
      'Plan mode performs no provider calls and does not inspect credentials.',
      'Live mode validates catalog list-price evidence only; invoice-grade billing requires provider invoice controls.',
    ],
  };
}

async function runSmoke(options) {
  const root = process.cwd();
  const outputDir = path.resolve(root, options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const plan = runPlan({ ...options, outputDir });
  const archiveBuild = runJsonCommand({
    root,
    label: 'archive builder smoke',
    args: [
      'scripts/pricing-catalog-live-capture-archive-build.mjs',
      '--smoke',
      '--smoke-output-dir',
      path.join(outputDir, 'archive-build-smoke'),
      '--json',
    ],
    env: scrubbedEnv(),
  });
  const summary = {
    ok: true,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    plan,
    archiveBuild,
    strictLiveRejectedFixtureArchive: archiveBuild.strictLiveRejectedFixtureArchive === true,
    verifiedExampleArchive: archiveBuild.verifiedExampleArchive === true,
    verifiedLiveCaptureArchive: archiveBuild.verifiedLiveCaptureArchive === true,
    caveats: [
      'Smoke mode proves orchestration through local fixture capture and archive-builder smoke.',
      'Smoke mode does not call provider APIs and must not be used as live-provider proof.',
    ],
  };
  await writeJson(path.join(outputDir, 'run-summary.json'), summary);

  return summary;
}

async function runLive(options) {
  const root = process.cwd();
  const outputDir = path.resolve(root, options.outputDir);
  const captureOutputDir = path.join(outputDir, 'capture-output');
  const preflightPath = path.join(outputDir, 'preflight.json');
  const capturePath = path.join(outputDir, 'capture.json');
  const archivePath = path.join(outputDir, 'archive.json');

  assertLiveInputs(options);
  await mkdir(outputDir, { recursive: true });
  await mkdir(captureOutputDir, { recursive: true });

  const preflight = runJsonCommand({
    root,
    label: 'strict live preflight',
    args: [
      'scripts/pricing-catalog-live-snapshot-capture-preflight.mjs',
      '--strict-live',
      '--operator',
      options.operator,
      '--previous-evidence',
      options.previousEvidencePath,
      '--json',
    ],
    env: process.env,
  });
  await writeJson(preflightPath, preflight);

  const capture = runJsonCommand({
    root,
    label: 'live capture',
    args: [
      'scripts/pricing-catalog-live-snapshot-capture.mjs',
      '--live',
      '--operator',
      options.operator,
      '--previous-evidence',
      options.previousEvidencePath,
      '--output-dir',
      captureOutputDir,
      '--sample-limit',
      options.sampleLimit,
      '--json',
    ],
    env: {
      ...process.env,
      [LIVE_GUARD_ENV]: 'true',
    },
  });
  await writeJson(capturePath, capture);
  const snapshotEvidencePath = requireString(capture.evidencePath, 'live capture evidencePath');

  const archiveBuild = runJsonCommand({
    root,
    label: 'live archive build',
    args: [
      'scripts/pricing-catalog-live-capture-archive-build.mjs',
      '--preflight',
      preflightPath,
      '--capture',
      capturePath,
      '--snapshot-evidence',
      snapshotEvidencePath,
      '--operator',
      options.operator,
      '--operator-role',
      options.operatorRole,
      '--capture-command',
      'npm run pricing:catalog:snapshot:capture -- --live',
      '--output',
      archivePath,
      '--require-live-archive',
      '--json',
    ],
    env: process.env,
  });

  const summary = {
    ok: archiveBuild.ok === true && archiveBuild.verifiedLiveCaptureArchive === true,
    schemaVersion: RUN_SCHEMA,
    outputDir,
    preflightPath,
    capturePath,
    snapshotEvidencePath,
    archivePath,
    preflightReady: preflight.readyForLiveCapture === true,
    verifiedLiveProviderSnapshot: capture.verifiedLiveProviderSnapshot === true,
    verifiedLiveCaptureArchive: archiveBuild.verifiedLiveCaptureArchive === true,
    caveats: [
      'This run validates live provider catalog capture and archive proof, not invoice-grade billing.',
      'Raw provider payloads and credentials are intentionally excluded from generated artifacts.',
    ],
  };
  await writeJson(path.join(outputDir, 'run-summary.json'), summary);

  return summary;
}

function requireString(value, label) {
  if (!hasValue(value)) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function assertLiveInputs(options) {
  const missing = [];

  if (process.env[LIVE_GUARD_ENV] !== 'true') {
    missing.push(`${LIVE_GUARD_ENV}=true`);
  }
  if (!hasRealOperator(options.operator)) {
    missing.push('--operator <reviewer-name>');
  }
  if (!hasValue(options.previousEvidencePath)) {
    missing.push('--previous-evidence <prior-live-provider-bundle.json>');
  }

  if (missing.length > 0) {
    throw new Error(`Live run requires ${missing.join(', ')}.`);
  }
}

function runJsonCommand({ root, args, label, env }) {
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env,
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

function parseJsonOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasRealOperator(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    !/example|sample|demo|test|unknown/i.test(value)
  );
}

function scrubbedEnv() {
  const env = { ...process.env };
  for (const key of [
    LIVE_GUARD_ENV,
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
  if (result.schemaVersion === PLAN_SCHEMA) {
    console.log('Pricing catalog live capture run plan is ready.');
    console.log(`Output directory: ${path.relative(process.cwd(), result.outputDir)}`);
    console.log(`Live guard: ${result.liveGuardEnv}=${result.liveGuardRequiredValue}`);
    return;
  }

  if (result.schemaVersion === SMOKE_SCHEMA) {
    console.log('Pricing catalog live capture run smoke passed.');
    console.log(`Output directory: ${path.relative(process.cwd(), result.outputDir)}`);
    console.log(`Strict live rejected fixture archive: ${result.strictLiveRejectedFixtureArchive}`);
    return;
  }

  console.log('Pricing catalog live capture run completed.');
  console.log(`Archive manifest: ${path.relative(process.cwd(), result.archivePath)}`);
  console.log(`Verified live archive: ${result.verifiedLiveCaptureArchive}`);
}

function printHelp() {
  console.log(`Pricing catalog live capture run ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-capture-run.mjs --plan [options]
  node scripts/pricing-catalog-live-capture-run.mjs --smoke [options]
  POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true node scripts/pricing-catalog-live-capture-run.mjs --live --operator <name> --previous-evidence <bundle.json>

Options:
  --plan                         Print the target-environment live run plan without provider calls (default)
  --smoke                        Run credential-free local orchestration smoke
  --live                         Execute strict preflight, live capture, archive build, and strict archive verification
  --output-dir <path>            Output directory for generated artifacts (default: ${DEFAULT_OUTPUT_DIR})
  --operator <name>              Human/operator reviewer name
  --operator-role <role>         Operator role label (default: ${DEFAULT_OPERATOR_ROLE})
  --previous-evidence <path>     Prior live-provider evidence bundle
  --sample-limit <number>        Provider row sample limit for capture artifacts (default: 2)
  --json                         Print machine-readable output
  --quiet                        Suppress human-readable output
  --version                      Print version
  --help                         Show this help
`);
}
