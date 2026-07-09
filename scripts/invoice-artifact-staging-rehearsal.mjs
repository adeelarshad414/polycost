#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const SCHEMA_VERSION = 'polycost-invoice-artifact-staging-rehearsal/v1';
const DEFAULT_PROFILE = 'docs/operations/invoice-artifact-production-profile.example.json';

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invoice artifact staging rehearsal error: ${message}`);
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
  const result = await runRehearsal(args);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!args.quiet) {
    printResult(result);
  }

  process.exit(result.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const result = {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    mode: args.live ? 'live' : 'plan',
    profilePath: args.profilePath,
    failures: [message],
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(`Invoice artifact staging rehearsal failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    profilePath: DEFAULT_PROFILE,
    live: false,
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
    if (arg === '--live') {
      options.live = true;
      continue;
    }
    if (arg === '--plan' || arg === '--plan-only') {
      options.live = false;
      continue;
    }
    if (arg.startsWith('--profile=')) {
      options.profilePath = arg.slice('--profile='.length).trim();
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
    throw new Error('Expected at most one profile path.');
  }
  if (!options.profilePath) {
    throw new Error('Profile path cannot be empty.');
  }

  return options;
}

async function runRehearsal(options) {
  const root = process.cwd();
  const profilePath = path.resolve(root, options.profilePath);
  const profile = parseJsonObject(await readFile(profilePath, 'utf8'), options.profilePath);
  const runtimeConfig = plainObject(profile.runtimeConfig) ?? {};
  const evidence = plainObject(profile.evidence) ?? {};
  const secretReferences = plainObject(profile.secretReferences) ?? {};
  const plan = buildPlan({
    profilePath: path.relative(root, profilePath),
    profile,
    runtimeConfig,
    evidence,
    secretReferences,
  });
  const steps = [];
  const failures = [];

  steps.push(
    runCommand('profile-check', profileCheckCommand(plan.profilePath), { parseJson: true }),
  );

  if (options.live) {
    const liveEnv = {
      ...process.env,
      ...runtimeConfig,
    };

    steps.push(
      runCommand(
        'provider-credentials-strict',
        [process.execPath, providerCredentialsScript(), '--strict'],
        {
          env: liveEnv,
        },
      ),
    );
    steps.push(
      runCommand('scanner-webhook-smoke', [process.execPath, scannerSmokeScript()], {
        env: liveEnv,
        parseJson: true,
      }),
    );
    steps.push(
      runCommand('notary-webhook-smoke', [process.execPath, notarySmokeScript()], {
        env: liveEnv,
        parseJson: true,
      }),
    );
    steps.push(
      runCommand('audit-export-smoke', [process.execPath, auditSmokeScript()], {
        env: liveEnv,
        parseJson: true,
      }),
    );
  }

  for (const step of steps) {
    if (step.status !== 'pass') {
      failures.push(`${step.name} failed${step.error ? `: ${step.error}` : ''}`);
    }
  }

  return {
    ok: failures.length === 0,
    schemaVersion: SCHEMA_VERSION,
    mode: options.live ? 'live' : 'plan',
    profilePath,
    profileName: stringValue(profile.profileName),
    provider: stringValue(profile.provider),
    verificationLevel: stringValue(profile.verificationLevel),
    liveCloudEvidenceRequired: true,
    plan,
    steps,
    caveats: [
      options.live
        ? 'Live mode proves configured endpoints and Vault/provider readiness available to this shell; archive returned canary receipts in operator WORM storage.'
        : 'Plan mode validates the profile and produces the exact live rehearsal checklist without reading Vault or calling external endpoints.',
      'This rehearsal does not make PolyCost an invoice system; it proves artifact governance readiness around customer-provided invoice evidence.',
    ],
    failures,
  };
}

function buildPlan({ profilePath, profile, runtimeConfig, evidence, secretReferences }) {
  const proof = plainObject(evidence.providerRetentionProof) ?? {};
  const canaries = ['scannerCanary', 'notaryReceiverCanary', 'auditExportCanary']
    .map((name) => ({
      name,
      archiveReference: stringValue(plainObject(evidence[name])?.archiveReference),
    }))
    .filter((entry) => entry.archiveReference);

  return {
    schemaVersion: 'polycost-invoice-artifact-staging-rehearsal-plan/v1',
    profilePath,
    profileName: stringValue(profile.profileName),
    provider: stringValue(profile.provider),
    runtimeConfigKeys: Object.keys(runtimeConfig).sort(),
    requiredSecretReferences: Object.entries(secretReferences).map(([name, reference]) => ({
      name,
      path: stringValue(plainObject(reference)?.path),
      requiredKeys: arrayOfStrings(plainObject(reference)?.requiredKeys),
      rotationOwner: stringValue(plainObject(reference)?.rotationOwner),
    })),
    providerRetentionProof: {
      file: stringValue(proof.file),
      reference: stringValue(proof.reference),
      expectedSha256: stringValue(proof.expectedSha256),
    },
    requiredCanaryArchives: canaries,
    liveCommands: [
      `npm run invoice:artifact-profile:check -- ${shellQuote(profilePath)}`,
      'npm run provider:credentials:check:strict',
      'npm run invoice:artifact-scanner:smoke',
      'npm run invoice:evidence:notary:smoke',
      'npm run audit:export:smoke',
    ],
    operatorEvidenceToArchive: [
      'profile-check JSON output',
      'strict provider credential check output',
      'scanner webhook smoke JSON output',
      'notary webhook smoke JSON output',
      'audit export smoke JSON output',
      'provider retention proof verifier JSON output',
      'receiver-side WORM/object-lock retention evidence for all canary archives',
    ],
    secretHandling:
      'raw secrets must stay in Vault/runtime env and must not be copied into the profile JSON',
  };
}

function profileCheckCommand(profilePath) {
  return [process.execPath, profileCheckScript(), profilePath, '--json'];
}

function runCommand(name, command, options = {}) {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  let parsedOutput;

  if (options.parseJson && result.stdout) {
    parsedOutput = parseOptionalJson(result.stdout);
  }

  return {
    name,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    command: redactCommand(command),
    ...(parsedOutput ? { parsedOutput } : {}),
    ...(result.status === 0 ? {} : { error: output.slice(0, 800) }),
  };
}

function parseOptionalJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function profileCheckScript() {
  return path.join(process.cwd(), 'scripts/invoice-artifact-production-profile-check.mjs');
}

function providerCredentialsScript() {
  return path.join(process.cwd(), 'scripts/provider-credential-check.mjs');
}

function scannerSmokeScript() {
  return path.join(process.cwd(), 'scripts/invoice-artifact-scanner-webhook-smoke.mjs');
}

function notarySmokeScript() {
  return path.join(process.cwd(), 'scripts/invoice-evidence-notary-webhook-smoke.mjs');
}

function auditSmokeScript() {
  return path.join(process.cwd(), 'scripts/audit-export-webhook-smoke.mjs');
}

function redactCommand(command) {
  return command.map((part) => {
    if (/secret|token|key|password/i.test(part)) {
      return '<redacted>';
    }
    return part;
  });
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    const object = plainObject(parsed);

    if (!object) {
      throw new Error(`${label} must contain a JSON object.`);
    }

    return object;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${label}: ${message}`);
  }
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function shellQuote(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(stringValue)) {
    return stringValue;
  }
  return `'${stringValue.replaceAll("'", "'\"'\"'")}'`;
}

function printResult(result) {
  if (result.ok) {
    console.log(`Invoice artifact staging rehearsal ${result.mode} passed.`);
    console.log(`Profile: ${result.profileName}`);
    console.log(`Provider: ${result.provider}`);
    console.log(`Steps: ${result.steps.map((step) => `${step.name}=${step.status}`).join(', ')}`);
    if (result.mode === 'plan') {
      console.log('Live rehearsal commands:');
      for (const command of result.plan.liveCommands) {
        console.log(`- ${command}`);
      }
    }
    return;
  }

  console.error(`Invoice artifact staging rehearsal ${result.mode} failed.`);
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Invoice artifact staging rehearsal ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-artifact-staging-rehearsal.mjs [profile.json] [options]

Options:
  --profile=<file>  Production profile JSON to rehearse
  --plan            Validate profile and print live checklist without external calls (default)
  --live            Run strict provider credentials plus scanner/notary/audit webhook smokes
  --json            Emit machine-readable JSON
  --quiet           Suppress human output
  --help            Show this help
  --version         Show version

Default profile:
  ${DEFAULT_PROFILE}
`);
}
