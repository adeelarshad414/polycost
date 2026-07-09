#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Provider retention proof capture plan error: ${message}`);
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
  const plan = buildCapturePlan(args);

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else if (!args.quiet) {
    printPlan(plan);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Provider retention proof capture plan failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    provider: undefined,
    objectUri: undefined,
    outputDir: 'artifacts/provider-retention-proof',
    proofReference: undefined,
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

function buildCapturePlan(options) {
  const object = parseObjectUri(options.provider, options.objectUri);
  const safeName = objectSafeName(object.key ?? object.objectName ?? object.blobName);
  const outputDir = path.posix.normalize(options.outputDir.replaceAll('\\', '/'));
  const proofFile = `${outputDir}/${options.provider}-${safeName}-retention-proof.json`;
  const proofReference =
    options.proofReference ?? durableReference(options.provider, object, proofFile);
  const captureCommands = captureCommandsFor(options.provider, object, proofFile, proofReference);
  const verifyCommand = [
    'npm run invoice:retention-proof:verify --',
    options.provider,
    shellQuote(proofFile),
    `--reference=${shellQuote(proofReference)}`,
  ].join(' ');

  return {
    ok: true,
    schemaVersion: 'invoice-artifact-provider-retention-proof-capture-plan/v1',
    generatedAt: new Date().toISOString(),
    provider: options.provider,
    object,
    outputDir,
    proofFile,
    proofReference,
    cloudCliExecutionByPolyCost: false,
    immutableRetentionProvedByPolyCost: false,
    captureCommands,
    verifyCommand,
    runtimeConfigTemplate: {
      INVOICE_EVIDENCE_WORM_RETENTION_MODE: 'provider-object-lock',
      INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE: 'provider-control-plane',
      INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE: proofReference,
      INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256:
        '<copy proofDigestSha256 from verifier output>',
    },
    minimumOperatorControls: [
      'Run the capture commands with least-privilege read-only object retention/metadata permissions.',
      'Store the proof JSON in WORM/object-lock backed evidence storage before copying its digest into PolyCost config.',
      'Archive provider CLI version, actor identity, timestamp, object URI, and verifier output with the release packet.',
    ],
    caveats: [
      'This is a command plan only; PolyCost does not execute cloud provider CLI commands or receive cloud credentials.',
      'The verifier validates captured proof structure and digest, not legal sufficiency or full chain of custody.',
    ],
  };
}

function captureCommandsFor(provider, object, proofFile, proofReference) {
  if (provider === 'aws-s3') {
    return [
      `mkdir -p ${shellQuote(path.posix.dirname(proofFile))}`,
      [
        'aws s3api get-object-retention',
        `--bucket ${shellQuote(object.bucket)}`,
        `--key ${shellQuote(object.key)}`,
        object.versionId ? `--version-id ${shellQuote(object.versionId)}` : '',
        `> ${shellQuote(proofFile)}`,
      ]
        .filter(Boolean)
        .join(' '),
      [
        'aws s3api get-object-legal-hold',
        `--bucket ${shellQuote(object.bucket)}`,
        `--key ${shellQuote(object.key)}`,
        object.versionId ? `--version-id ${shellQuote(object.versionId)}` : '',
        `> ${shellQuote(proofFile.replace(/\.json$/, '-legal-hold.json'))}`,
      ]
        .filter(Boolean)
        .join(' '),
      `npm run invoice:retention-proof:verify -- aws-s3 ${shellQuote(proofFile)} --reference=${shellQuote(proofReference)}`,
    ];
  }

  if (provider === 'azure-blob') {
    return [
      `mkdir -p ${shellQuote(path.posix.dirname(proofFile))}`,
      [
        'az storage blob immutability-policy show',
        `--account-name ${shellQuote(object.accountName)}`,
        `--container-name ${shellQuote(object.containerName)}`,
        `--name ${shellQuote(object.blobName)}`,
        `> ${shellQuote(proofFile)}`,
      ].join(' '),
      [
        'az storage blob legal-hold show',
        `--account-name ${shellQuote(object.accountName)}`,
        `--container-name ${shellQuote(object.containerName)}`,
        `--name ${shellQuote(object.blobName)}`,
        `> ${shellQuote(proofFile.replace(/\.json$/, '-legal-hold.json'))}`,
      ].join(' '),
      `npm run invoice:retention-proof:verify -- azure-blob ${shellQuote(proofFile)} --reference=${shellQuote(proofReference)}`,
    ];
  }

  if (provider === 'gcp-gcs') {
    return [
      `mkdir -p ${shellQuote(path.posix.dirname(proofFile))}`,
      `gcloud storage objects describe ${shellQuote(`gs://${object.bucket}/${object.objectName}`)} --format=json > ${shellQuote(proofFile)}`,
      `npm run invoice:retention-proof:verify -- gcp-gcs ${shellQuote(proofFile)} --reference=${shellQuote(proofReference)}`,
    ];
  }

  throw new Error(`Unsupported provider ${provider}.`);
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
      uri: objectUri,
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
      uri: objectUri,
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
      uri: objectUri,
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

function objectSafeName(value) {
  return String(value ?? 'object')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-96);
}

function shellQuote(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(stringValue)) {
    return stringValue;
  }
  return `'${stringValue.replaceAll("'", "'\"'\"'")}'`;
}

function printPlan(plan) {
  console.log('Provider retention proof capture plan created.');
  console.log(`Provider: ${plan.provider}`);
  console.log(`Object URI: ${plan.object.uri}`);
  console.log(`Proof file: ${plan.proofFile}`);
  console.log(`Proof reference: ${plan.proofReference}`);
  console.log('');
  console.log('Capture commands:');
  for (const command of plan.captureCommands) {
    console.log(command);
  }
  console.log('');
  console.log('Verifier command:');
  console.log(plan.verifyCommand);
  console.log('');
  console.log('Runtime config template:');
  for (const [key, value] of Object.entries(plan.runtimeConfigTemplate)) {
    console.log(`${key}=${value}`);
  }
}

function printHelp() {
  console.log(`Provider retention proof capture planner ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-artifact-provider-retention-proof-capture-plan.mjs <provider> <object-uri> [options]

Providers and object URI examples:
  aws-s3      s3://bucket/invoice-artifacts/path.txt?versionId=v1
  azure-blob  azure-blob://account/container/invoice-artifacts/path.txt
  gcp-gcs     gs://bucket/invoice-artifacts/path.txt

Options:
  --output-dir=<dir>          Local directory for captured proof files
  --proof-reference=<uri>     Durable WORM/object-lock reference for archived proof JSON
  --json                      Emit machine-readable JSON
  --quiet                     Suppress human output
  --help                      Show this help
  --version                   Show version
`);
}
