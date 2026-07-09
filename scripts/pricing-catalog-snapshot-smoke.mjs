#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const EVIDENCE_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence/v1';
const SMOKE_SCHEMA = 'polycost-pricing-catalog-snapshot-smoke/v1';
const DEFAULT_OUTPUT_DIR = '.tmp/pricing-catalog-snapshot-evidence';
const DEFAULT_CAPTURED_AT = '2026-07-09T00:00:00.000Z';
const PROVIDERS = ['aws', 'azure', 'gcp'];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog snapshot smoke error: ${message}`);
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
  const result = await runSmoke(args);

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
          schemaVersion: SMOKE_SCHEMA,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog snapshot smoke failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    capturedAt: DEFAULT_CAPTURED_AT,
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
    if (arg === '--output-dir') {
      options.outputDir = readOptionValue(argv, index, '--output-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length).trim();
      continue;
    }
    if (arg === '--captured-at') {
      options.capturedAt = readOptionValue(argv, index, '--captured-at');
      index += 1;
      continue;
    }
    if (arg.startsWith('--captured-at=')) {
      options.capturedAt = arg.slice('--captured-at='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  if (!options.outputDir) {
    throw new Error('Output directory cannot be empty.');
  }
  if (Number.isNaN(Date.parse(options.capturedAt))) {
    throw new Error('--captured-at must be a valid ISO-8601 timestamp.');
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
  const outputDir = path.resolve(root, options.outputDir);
  const capturedAt = new Date(options.capturedAt).toISOString();
  const previousGeneratedAt = '2026-07-08T12:00:00.000Z';
  const currentGeneratedAt = '2026-07-09T00:00:00.000Z';
  const providerSnapshots = PROVIDERS.map((provider) =>
    buildProviderSnapshot(provider, previousGeneratedAt, currentGeneratedAt),
  );
  const snapshotWindow = summarizeWindow(providerSnapshots);
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA,
    bundleName: 'pricing-catalog-snapshot-smoke-evidence',
    evidenceLevel: 'provider-snapshot-smoke',
    productionClaim: false,
    capturedAt,
    freshnessSlaHours: 24,
    snapshotWindow,
    providerSnapshots,
    operatorAttestations: {
      rawCatalogPayloadExcluded: true,
      credentialsExcluded: true,
      signedUrlsExcluded: true,
      liveProviderEndpointsReviewed: false,
      productionClaimedByPolyCost: false,
      operator: 'pricing-catalog-snapshot-smoke',
    },
    caveats: [
      'This is a local fixture-replay snapshot comparison smoke across AWS, Azure, and GCP.',
      'It proves snapshot hashing, exact row-change detection, and freshness validation, not live provider API execution or invoice-grade billing.',
    ],
  };
  const evidencePath = path.join(outputDir, 'pricing-catalog-snapshot-evidence.json');
  const providerSnapshotPaths = {};

  await mkdir(outputDir, { recursive: true });
  await writeJson(evidencePath, evidence);
  for (const snapshot of providerSnapshots) {
    const filePath = path.join(outputDir, `${snapshot.provider}-current-snapshot.json`);
    providerSnapshotPaths[snapshot.provider] = filePath;
    await writeJson(filePath, snapshot.rowSamples);
  }

  const check = runSnapshotEvidenceCheck({ root, evidencePath });

  return {
    ok: true,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    generatedFiles: {
      evidencePath,
      providerSnapshotPaths,
    },
    providerCount: providerSnapshots.length,
    changedRowCount: snapshotWindow.changedRowCount,
    priceChangedSkuCount: snapshotWindow.priceChangedSkuCount,
    currentSnapshotSha256: snapshotWindow.currentSnapshotSha256,
    verifiedProviderSnapshot: check.verifiedProviderSnapshot === true,
    caveats: [
      'This smoke uses deterministic fixture replay and does not call provider APIs.',
      'Production provider proof must use live-provider-snapshot evidence and --require-live-provider.',
    ],
  };
}

function buildProviderSnapshot(provider, previousGeneratedAt, currentGeneratedAt) {
  const previousRows = baseRows(provider, currentGeneratedAt);
  const currentRows = baseRows(provider, currentGeneratedAt).map((row, index) =>
    index === 0 ? { ...row, unitPriceUsd: Number((row.unitPriceUsd + 0.01).toFixed(6)) } : row,
  );
  const previousRowsWithHash = previousRows.map(withRowHashes);
  const currentRowsWithHash = currentRows.map(withRowHashes);
  const changes = compareRows(previousRowsWithHash, currentRowsWithHash);

  return {
    provider,
    sourceSystem: `${provider}-catalog-fixture-replay`,
    sourceMode: 'fixture-replay',
    catalogGeneratedAt: currentGeneratedAt,
    snapshotSha256: sha256(canonicalJson(currentRowsWithHash)),
    previousSnapshotSha256: sha256(canonicalJson(previousRowsWithHash)),
    changedRowsSha256: sha256(canonicalJson(changes.changedRows)),
    rowCount: currentRowsWithHash.length,
    previousRowCount: previousRowsWithHash.length,
    changedRowCount: changes.changedRows.length,
    unchangedRowCount: changes.unchangedRows.length,
    addedSkuCount: changes.addedRows.length,
    removedSkuCount: changes.removedRows.length,
    priceChangedSkuCount: changes.priceChangedRows.length,
    sourceEndpointCount: new Set(currentRowsWithHash.map((row) => row.sourceEndpoint)).size,
    sourceRecordCount: currentRowsWithHash.length,
    regionCount: new Set(currentRowsWithHash.map((row) => row.region)).size,
    serviceCategoryCount: new Set(currentRowsWithHash.map((row) => row.serviceCategory)).size,
    sourcePayloadHashCoverage: 1,
    sourceRecordKeyCoverage: 1,
    rowHashCoverage: 1,
    exactRowChangeVerified: true,
    rawCatalogPayloadExcluded: true,
    publicEndpoints: [...new Set(currentRowsWithHash.map((row) => row.sourceEndpoint))],
    rowSamples: currentRowsWithHash,
  };
}

function baseRows(provider, fetchedAt) {
  const endpoints = {
    aws: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json',
    azure: 'https://prices.azure.com/api/retail/prices',
    gcp: 'https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus',
  };
  const providerNames = {
    aws: ['AmazonEC2', 'AmazonS3'],
    azure: ['Virtual Machines', 'Storage'],
    gcp: ['Compute Engine', 'Cloud Storage'],
  };
  const skuPrefix = provider.toUpperCase();

  return [
    {
      provider,
      serviceCategory: 'compute',
      serviceName: providerNames[provider][0],
      skuId: `${skuPrefix}-SNAPSHOT-COMPUTE-001`,
      region: provider === 'azure' ? 'eastus' : 'us-east-1',
      unit: 'hour',
      unitPriceUsd: provider === 'aws' ? 0.11 : provider === 'azure' ? 0.12 : 0.1,
      sourceEndpoint: endpoints[provider],
      sourceRecordId: `${provider}-catalog-compute-row-001`,
      effectiveDate: '2026-07-01T00:00:00.000Z',
      fetchedAt,
      transformVersion: 'pricing-normalization-v3',
    },
    {
      provider,
      serviceCategory: 'storage',
      serviceName: providerNames[provider][1],
      skuId: `${skuPrefix}-SNAPSHOT-STORAGE-001`,
      region: provider === 'azure' ? 'eastus' : 'us-east-1',
      unit: 'GB-month',
      unitPriceUsd: provider === 'aws' ? 0.023 : provider === 'azure' ? 0.021 : 0.02,
      sourceEndpoint: endpoints[provider],
      sourceRecordId: `${provider}-catalog-storage-row-001`,
      effectiveDate: '2026-07-01T00:00:00.000Z',
      fetchedAt,
      transformVersion: 'pricing-normalization-v3',
    },
  ].map((row) => ({
    ...row,
    sourceRecordKey: [
      row.provider,
      row.serviceCategory,
      row.skuId,
      row.region,
      row.unit,
      row.effectiveDate,
    ].join('|'),
  }));
}

function withRowHashes(row) {
  const sourcePayloadHash = sha256(canonicalJson(row));
  const rowWithPayloadHash = { ...row, sourcePayloadHash };

  return {
    ...rowWithPayloadHash,
    rowSha256: sha256(canonicalJson(rowWithPayloadHash)),
  };
}

function compareRows(previousRows, currentRows) {
  const previousByKey = new Map(previousRows.map((row) => [row.sourceRecordKey, row]));
  const currentByKey = new Map(currentRows.map((row) => [row.sourceRecordKey, row]));
  const addedRows = currentRows.filter((row) => !previousByKey.has(row.sourceRecordKey));
  const removedRows = previousRows.filter((row) => !currentByKey.has(row.sourceRecordKey));
  const sharedCurrentRows = currentRows.filter((row) => previousByKey.has(row.sourceRecordKey));
  const changedRows = sharedCurrentRows.filter(
    (row) => previousByKey.get(row.sourceRecordKey)?.rowSha256 !== row.rowSha256,
  );
  const unchangedRows = sharedCurrentRows.filter(
    (row) => previousByKey.get(row.sourceRecordKey)?.rowSha256 === row.rowSha256,
  );
  const priceChangedRows = changedRows.filter(
    (row) => previousByKey.get(row.sourceRecordKey)?.unitPriceUsd !== row.unitPriceUsd,
  );

  return { addedRows, removedRows, changedRows, unchangedRows, priceChangedRows };
}

function summarizeWindow(providerSnapshots) {
  const allCurrentRows = providerSnapshots.flatMap((snapshot) => snapshot.rowSamples);
  const currentSnapshotSha256 = sha256(canonicalJson(allCurrentRows));
  const previousSnapshotSha256 = sha256(
    canonicalJson(providerSnapshots.map((snapshot) => snapshot.previousSnapshotSha256)),
  );

  return {
    currentSnapshotSha256,
    previousSnapshotSha256,
    currentRowCount: sum(providerSnapshots.map((snapshot) => snapshot.rowCount)),
    previousRowCount: sum(providerSnapshots.map((snapshot) => snapshot.previousRowCount)),
    changedRowCount: sum(providerSnapshots.map((snapshot) => snapshot.changedRowCount)),
    unchangedRowCount: sum(providerSnapshots.map((snapshot) => snapshot.unchangedRowCount)),
    addedSkuCount: sum(providerSnapshots.map((snapshot) => snapshot.addedSkuCount)),
    removedSkuCount: sum(providerSnapshots.map((snapshot) => snapshot.removedSkuCount)),
    priceChangedSkuCount: sum(providerSnapshots.map((snapshot) => snapshot.priceChangedSkuCount)),
    rowHashAlgorithm: 'sha256-stable-json',
    exactRowChangeVerified: providerSnapshots.every(
      (snapshot) => snapshot.exactRowChangeVerified === true,
    ),
  };
}

function runSnapshotEvidenceCheck({ root, evidencePath }) {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/pricing-catalog-snapshot-evidence-check.mjs',
      '--require-provider-snapshot',
      evidencePath,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  if (child.status !== 0) {
    throw new Error(
      ['Generated pricing catalog snapshot evidence failed validation.', child.stdout, child.stderr]
        .map((item) => item.trim())
        .filter(Boolean)
        .join('\n'),
    );
  }

  return JSON.parse(child.stdout);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (!plainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function printResult(result) {
  console.log(
    `Pricing catalog snapshot smoke passed (${result.providerCount} providers; ${result.changedRowCount} changed rows).`,
  );
  console.log(
    `Evidence bundle: ${path.relative(process.cwd(), result.generatedFiles.evidencePath)}`,
  );
}

function printHelp() {
  console.log(`Pricing catalog snapshot smoke ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-snapshot-smoke.mjs [options]

Options:
  --output-dir <path>    Directory for generated evidence (default: ${DEFAULT_OUTPUT_DIR})
  --captured-at <iso>    Deterministic capture timestamp override
  --json                 Print machine-readable smoke output
  --quiet                Suppress human-readable success output
  --version              Print version
  --help                 Show this help
`);
}
