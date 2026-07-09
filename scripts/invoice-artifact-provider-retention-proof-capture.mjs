#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const MAX_CLI_OUTPUT_BYTES = 1024 * 1024;

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Provider retention proof capture error: ${message}`);
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
  const result = await captureProviderProof(args);

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
          provider: args.provider,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Provider retention proof capture failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    provider: undefined,
    objectUri: undefined,
    outputDir: 'artifacts/provider-retention-proof',
    proofReference: undefined,
    dryRun: false,
    skipVerify: false,
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
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--skip-verify') {
      options.skipVerify = true;
      continue;
    }
    if (arg.startsWith('--provider=')) {
      options.provider = normalizeProvider(arg.slice('--provider='.length));
      continue;
    }
    if (arg.startsWith('--object-uri=')) {
      options.objectUri = arg.slice('--object-uri='.length).trim();
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length).trim();
      continue;
    }
    if (arg.startsWith('--proof-reference=')) {
      options.proofReference = arg.slice('--proof-reference='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (!options.provider && positionals[0]) {
    options.provider = normalizeProvider(positionals.shift());
  }
  if (!options.objectUri && positionals[0]) {
    options.objectUri = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected provider and one object URI.');
  }

  if (!options.help && !options.version) {
    if (!options.provider) {
      throw new Error('Missing provider. Use aws-s3, azure-blob, or gcp-gcs.');
    }
    if (!options.objectUri) {
      throw new Error('Missing object URI.');
    }
    if (!options.outputDir) {
      throw new Error('--output-dir cannot be empty.');
    }
  }

  return options;
}

async function captureProviderProof(options) {
  const object = parseObjectUri(options.provider, options.objectUri);
  const outputDir = safeOutputDir(options.outputDir);
  const safeName = objectSafeName(object.key ?? object.objectName ?? object.blobName);
  const proofFileAbsolute = path.join(
    outputDir.absolute,
    `${options.provider}-${safeName}-retention-proof.json`,
  );
  const proofFile = toPosixRelative(proofFileAbsolute);
  const proofReference =
    options.proofReference ?? durableReference(options.provider, object, proofFile);
  const commandSpecs = commandSpecsFor(options.provider, object);
  const plannedCommands = commandSpecs.map((command) => ({
    label: command.label,
    command: command.bin,
    args: command.args,
  }));

  if (options.dryRun) {
    return {
      ok: true,
      schemaVersion: 'invoice-artifact-provider-retention-proof-capture/v1',
      provider: options.provider,
      object,
      proofFile,
      proofReference,
      dryRun: true,
      cloudCliExecutionByPolyCost: false,
      providerCredentialsStoredByPolyCost: false,
      immutableRetentionProvedByPolyCost: false,
      plannedCommands,
      verifierCommand: verifierCommand(options.provider, proofFile, proofReference),
      caveats: captureCaveats(false),
    };
  }

  await mkdir(path.dirname(proofFileAbsolute), { recursive: true });

  const commandResults = commandSpecs.map(runCommandSpec);
  const successfulResults = commandResults.filter((result) => result.ok);

  if (successfulResults.length === 0) {
    throw new Error(
      `No ${options.provider} provider CLI proof command succeeded. Confirm CLI installation, account authentication, and read-only object retention permissions.`,
    );
  }

  const proof = providerProofFromResults(
    options.provider,
    object,
    successfulResults,
    commandResults,
  );
  const proofContent = `${JSON.stringify(proof, null, 2)}\n`;
  const proofDigestSha256 = sha256(proofContent);

  await writeFile(proofFileAbsolute, proofContent, { encoding: 'utf8', mode: 0o600 });

  const verification = options.skipVerify
    ? undefined
    : runVerifier(options.provider, proofFile, proofReference);
  const ok = verification ? verification.ok === true : true;

  return {
    ok,
    schemaVersion: 'invoice-artifact-provider-retention-proof-capture/v1',
    provider: options.provider,
    object,
    proofFile,
    proofReference,
    proofDigestSha256,
    dryRun: false,
    cloudCliExecutionByPolyCost: true,
    providerCredentialsStoredByPolyCost: false,
    immutableRetentionProvedByPolyCost: false,
    plannedCommands,
    captureWarnings: commandResults
      .filter((result) => !result.ok)
      .map((result) => ({
        label: result.label,
        exitStatus: result.exitStatus,
        reason: result.reason,
      })),
    ...(verification ? { verification } : {}),
    verifierCommand: verifierCommand(options.provider, proofFile, proofReference),
    caveats: captureCaveats(true),
  };
}

function commandSpecsFor(provider, object) {
  if (provider === 'aws-s3') {
    const versionArgs = object.versionId ? ['--version-id', object.versionId] : [];

    return [
      {
        label: 'aws-s3-object-retention',
        bin: 'aws',
        args: [
          's3api',
          'get-object-retention',
          '--bucket',
          object.bucket,
          '--key',
          object.key,
          ...versionArgs,
        ],
      },
      {
        label: 'aws-s3-object-legal-hold',
        bin: 'aws',
        args: [
          's3api',
          'get-object-legal-hold',
          '--bucket',
          object.bucket,
          '--key',
          object.key,
          ...versionArgs,
        ],
      },
    ];
  }

  if (provider === 'azure-blob') {
    return [
      {
        label: 'azure-blob-immutability-policy',
        bin: 'az',
        args: [
          'storage',
          'blob',
          'immutability-policy',
          'show',
          '--account-name',
          object.accountName,
          '--container-name',
          object.containerName,
          '--name',
          object.blobName,
          '--only-show-errors',
          '--auth-mode',
          'login',
        ],
      },
      {
        label: 'azure-blob-legal-hold',
        bin: 'az',
        args: [
          'storage',
          'blob',
          'legal-hold',
          'show',
          '--account-name',
          object.accountName,
          '--container-name',
          object.containerName,
          '--name',
          object.blobName,
          '--only-show-errors',
          '--auth-mode',
          'login',
        ],
      },
    ];
  }

  if (provider === 'gcp-gcs') {
    return [
      {
        label: 'gcp-gcs-object-retention',
        bin: 'gcloud',
        args: [
          'storage',
          'objects',
          'describe',
          `gs://${object.bucket}/${object.objectName}`,
          '--format=json',
        ],
      },
    ];
  }

  throw new Error(`Unsupported provider ${provider}.`);
}

function runCommandSpec(command) {
  const result = spawnSync(command.bin, command.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    maxBuffer: MAX_CLI_OUTPUT_BYTES,
  });

  if (result.error) {
    return {
      label: command.label,
      ok: false,
      exitStatus: null,
      reason:
        result.error.code === 'ENOENT'
          ? `${command.bin} was not found on PATH`
          : result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      label: command.label,
      ok: false,
      exitStatus: result.status,
      reason: `provider CLI exited with status ${result.status}`,
    };
  }

  const stdout = String(result.stdout ?? '').trim();
  if (!stdout) {
    return {
      label: command.label,
      ok: false,
      exitStatus: result.status,
      reason: 'provider CLI returned empty output',
    };
  }

  try {
    const parsed = JSON.parse(stdout);
    if (!isPlainObject(parsed)) {
      throw new Error('output was not a JSON object');
    }

    return {
      label: command.label,
      ok: true,
      exitStatus: result.status,
      parsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      label: command.label,
      ok: false,
      exitStatus: result.status,
      reason: `provider CLI output was not parseable JSON: ${message}`,
    };
  }
}

function providerProofFromResults(provider, object, successfulResults, commandResults) {
  const base = {
    schemaVersion: 'invoice-artifact-provider-retention-proof-capture/provider-native/v1',
    capturedAt: new Date().toISOString(),
    provider,
    object,
    captureTool: 'polycost-provider-retention-proof-capture',
    capturedCommandLabels: successfulResults.map((result) => result.label),
    failedCommandLabels: commandResults
      .filter((result) => !result.ok)
      .map((result) => result.label),
  };

  if (provider === 'aws-s3') {
    const retention = successfulResults.find(
      (result) => result.label === 'aws-s3-object-retention',
    );
    const legalHold = successfulResults.find(
      (result) => result.label === 'aws-s3-object-legal-hold',
    );

    return {
      ...base,
      ...(retention?.parsed?.Retention ? { Retention: retention.parsed.Retention } : {}),
      ...(legalHold?.parsed?.LegalHold ? { LegalHold: legalHold.parsed.LegalHold } : {}),
    };
  }

  if (provider === 'azure-blob') {
    const immutabilityPolicy = successfulResults.find(
      (result) => result.label === 'azure-blob-immutability-policy',
    );
    const legalHold = successfulResults.find((result) => result.label === 'azure-blob-legal-hold');

    return {
      ...base,
      ...(immutabilityPolicy?.parsed ? { immutabilityPolicy: immutabilityPolicy.parsed } : {}),
      ...(legalHold?.parsed ? { legalHold: legalHold.parsed } : {}),
    };
  }

  if (provider === 'gcp-gcs') {
    return {
      ...base,
      ...successfulResults[0].parsed,
    };
  }

  return base;
}

function runVerifier(provider, proofFile, proofReference) {
  const verifierPath = path.join(
    process.cwd(),
    'scripts/invoice-artifact-provider-retention-proof-verifier.mjs',
  );
  const result = spawnSync(
    process.execPath,
    [verifierPath, provider, proofFile, `--reference=${proofReference}`, '--json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
      maxBuffer: MAX_CLI_OUTPUT_BYTES,
    },
  );

  if (result.error) {
    return {
      ok: false,
      failures: [result.error.message],
    };
  }

  try {
    return JSON.parse(String(result.stdout ?? '{}'));
  } catch {
    return {
      ok: false,
      failures: [`verifier returned non-JSON output with status ${result.status}`],
    };
  }
}

function parseObjectUri(provider, objectUri) {
  if (provider === 'aws-s3') {
    const parsed = parseUrl(objectUri);
    if (parsed.protocol !== 's3:') {
      throw new Error('AWS S3 object URI must use s3://bucket/key.');
    }
    rejectFragment(parsed, 'AWS S3');
    rejectUnexpectedSearchParams(parsed, ['versionId'], 'AWS S3');

    const key = parsed.pathname.replace(/^\//, '');
    if (!parsed.hostname || !key) {
      throw new Error('AWS S3 object URI must include bucket and key.');
    }
    return {
      bucket: parsed.hostname,
      key,
      ...(parsed.searchParams.get('versionId')
        ? { versionId: parsed.searchParams.get('versionId') }
        : {}),
      uri: sanitizedObjectUri(parsed),
    };
  }

  if (provider === 'azure-blob') {
    const parsed = parseUrl(objectUri);
    if (parsed.protocol !== 'azure-blob:') {
      throw new Error('Azure Blob object URI must use azure-blob://account/container/blob.');
    }
    rejectFragment(parsed, 'Azure Blob');
    rejectUnexpectedSearchParams(parsed, [], 'Azure Blob');

    const [containerName, ...blobParts] = parsed.pathname.replace(/^\//, '').split('/');
    const blobName = blobParts.join('/');
    if (!parsed.hostname || !containerName || !blobName) {
      throw new Error('Azure Blob object URI must include account, container, and blob name.');
    }
    return {
      accountName: parsed.hostname,
      containerName,
      blobName,
      uri: sanitizedObjectUri(parsed),
    };
  }

  if (provider === 'gcp-gcs') {
    const parsed = parseUrl(objectUri);
    if (parsed.protocol !== 'gs:') {
      throw new Error('GCP Cloud Storage object URI must use gs://bucket/object.');
    }
    rejectFragment(parsed, 'GCP Cloud Storage');
    rejectUnexpectedSearchParams(parsed, [], 'GCP Cloud Storage');

    const objectName = parsed.pathname.replace(/^\//, '');
    if (!parsed.hostname || !objectName) {
      throw new Error('GCP Cloud Storage object URI must include bucket and object name.');
    }
    return {
      bucket: parsed.hostname,
      objectName,
      uri: sanitizedObjectUri(parsed),
    };
  }

  throw new Error(`Unsupported provider ${provider}.`);
}

function rejectFragment(parsed, label) {
  if (parsed.hash) {
    throw new Error(`${label} object URI must not include a fragment.`);
  }
}

function rejectUnexpectedSearchParams(parsed, allowedParams, label) {
  const allowed = new Set(allowedParams);
  const unexpected = [...parsed.searchParams.keys()].filter((key) => !allowed.has(key));

  if (unexpected.length > 0) {
    throw new Error(
      `${label} object URI contains unsupported query parameters; do not pass signed URLs, SAS tokens, or temporary credential material.`,
    );
  }
}

function sanitizedObjectUri(parsed) {
  return parsed.toString();
}

function durableReference(provider, object, proofFile) {
  if (provider === 'aws-s3') {
    return `s3://${object.bucket}/${proofFile}`;
  }
  if (provider === 'azure-blob') {
    return `azure-blob://${object.accountName}/${object.containerName}/${proofFile}`;
  }
  if (provider === 'gcp-gcs') {
    return `gs://${object.bucket}/${proofFile}`;
  }
  return proofFile;
}

function normalizeProvider(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (normalized === 'aws' || normalized === 's3' || normalized === 'aws-s3') {
    return 'aws-s3';
  }
  if (normalized === 'azure' || normalized === 'blob' || normalized === 'azure-blob') {
    return 'azure-blob';
  }
  if (normalized === 'gcp' || normalized === 'gcs' || normalized === 'gcp-gcs') {
    return 'gcp-gcs';
  }

  throw new Error(`Unsupported provider ${value}. Use aws-s3, azure-blob, or gcp-gcs.`);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid object URI: ${value}`);
  }
}

function safeOutputDir(value) {
  const normalizedInput = String(value).replaceAll('\\', '/').trim();
  if (!normalizedInput || /[\u0000-\u001f]/.test(normalizedInput)) {
    throw new Error('--output-dir must be a non-empty path without control characters.');
  }

  const absolute = path.resolve(process.cwd(), normalizedInput);
  const cwd = process.cwd();
  const cwdPrefix = `${cwd}${path.sep}`;

  if (absolute !== cwd && !absolute.startsWith(cwdPrefix)) {
    throw new Error('--output-dir must resolve inside the PolyCost workspace.');
  }

  return {
    absolute,
  };
}

function objectSafeName(value) {
  return (
    String(value ?? 'object')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-96) || 'object'
  );
}

function toPosixRelative(absolutePath) {
  return path.relative(process.cwd(), absolutePath).split(path.sep).join('/');
}

function verifierCommand(provider, proofFile, proofReference) {
  return [
    'npm run invoice:retention-proof:verify --',
    provider,
    shellQuote(proofFile),
    `--reference=${shellQuote(proofReference)}`,
  ].join(' ');
}

function shellQuote(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(stringValue)) {
    return stringValue;
  }
  return `'${stringValue.replaceAll("'", "'\"'\"'")}'`;
}

function captureCaveats(executed) {
  return [
    executed
      ? 'PolyCost executed local read-only provider CLI commands in the operator environment; provider credentials remain owned by the operator CLI/session and are not stored by PolyCost.'
      : 'Dry-run mode did not execute provider CLI commands or inspect provider control-plane state.',
    'The verifier validates captured proof structure and digest, not legal sufficiency or full chain of custody.',
  ];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function printResult(result) {
  if (!result.ok) {
    console.error('Provider retention proof capture failed:');
    for (const failure of result.verification?.failures ?? ['capture verification failed']) {
      console.error(`- ${failure}`);
    }
    return;
  }

  console.log(
    result.dryRun
      ? 'Provider retention proof capture dry-run created.'
      : 'Provider retention proof captured.',
  );
  console.log(`Provider: ${result.provider}`);
  console.log(`Object URI: ${result.object.uri}`);
  console.log(`Proof file: ${result.proofFile}`);
  console.log(`Proof reference: ${result.proofReference}`);
  if (result.proofDigestSha256) {
    console.log(`Digest: ${result.proofDigestSha256}`);
  }
  console.log('');
  console.log(result.dryRun ? 'Planned commands:' : 'Executed command labels:');
  for (const command of result.plannedCommands) {
    console.log(`${command.command} ${command.args.map(shellQuote).join(' ')}`);
  }
  console.log('');
  console.log('Verifier command:');
  console.log(result.verifierCommand);
}

function printHelp() {
  console.log(`Provider retention proof capture ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-artifact-provider-retention-proof-capture.mjs <provider> <object-uri> [options]

Providers and object URI examples:
  aws-s3      s3://bucket/invoice-artifacts/path.txt?versionId=v1
  azure-blob  azure-blob://account/container/invoice-artifacts/path.txt
  gcp-gcs     gs://bucket/invoice-artifacts/path.txt

Options:
  --output-dir=<dir>          Workspace-local directory for captured proof files
  --proof-reference=<uri>     Durable WORM/object-lock reference for archived proof JSON
  --dry-run                   Build command plan without executing provider CLIs
  --skip-verify               Capture proof JSON without running the verifier
  --json                      Emit machine-readable JSON
  --quiet                     Suppress human output
  --help                      Show this help
  --version                   Show version
`);
}
