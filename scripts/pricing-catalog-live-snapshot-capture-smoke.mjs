#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const SMOKE_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture-smoke/v1';
const DEFAULT_OUTPUT_DIR = '.tmp/pricing-catalog-live-snapshot-capture-smoke';

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live snapshot capture smoke error: ${message}`);
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
    console.error(`Pricing catalog live snapshot capture smoke failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
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
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  if (!options.outputDir) {
    throw new Error('Output directory cannot be empty.');
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
  const fixtureDir = path.join(outputDir, 'fixtures');
  const captureOutputDir = path.join(outputDir, 'capture-output');
  const fixtures = buildFixtures();

  await mkdir(fixtureDir, { recursive: true });
  await mkdir(captureOutputDir, { recursive: true });
  await writeJson(path.join(fixtureDir, 'aws-previous.json'), fixtures.aws.previous);
  await writeJson(path.join(fixtureDir, 'aws-current.json'), fixtures.aws.current);
  await writeJson(path.join(fixtureDir, 'azure-previous.json'), fixtures.azure.previous);
  await writeJson(path.join(fixtureDir, 'azure-current.json'), fixtures.azure.current);
  await writeJson(path.join(fixtureDir, 'gcp-previous.json'), fixtures.gcp.previous);
  await writeJson(path.join(fixtureDir, 'gcp-current.json'), fixtures.gcp.current);

  const capture = runCapture({ root, fixtureDir, outputDir: captureOutputDir });
  const evidence = parseJsonObject(
    await readFile(capture.evidencePath, 'utf8'),
    capture.evidencePath,
  );
  const liveCheck = runStrictLiveCheck({ root, evidencePath: capture.evidencePath });
  const failures = validateCaptureResult({ capture, evidence, liveCheck });

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  return {
    ok: true,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    fixtureDir,
    evidencePath: capture.evidencePath,
    providerCount: capture.providerCount,
    changedRowCount: capture.changedRowCount,
    priceChangedSkuCount: capture.priceChangedSkuCount,
    verifiedProviderSnapshot: capture.verifiedProviderSnapshot,
    verifiedLiveProviderSnapshot: capture.verifiedLiveProviderSnapshot,
    strictLiveRejectedFixtureEvidence: liveCheck.status !== 0,
    caveats: [
      'This smoke replays provider-native fixtures through the live capture normalizers without network calls or cloud credentials.',
      'It intentionally proves provider-snapshot smoke evidence, not live-provider-snapshot evidence.',
    ],
  };
}

function runCapture({ root, fixtureDir, outputDir }) {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/pricing-catalog-live-snapshot-capture.mjs',
      '--fixture-smoke',
      '--fixture-dir',
      fixtureDir,
      '--output-dir',
      outputDir,
      '--sample-limit',
      '2',
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: scrubbedEnv(),
    },
  );

  if (child.status !== 0) {
    throw new Error(
      ['Fixture-backed capture failed.', child.stdout, child.stderr]
        .map((item) => item.trim())
        .filter(Boolean)
        .join('\n'),
    );
  }

  return JSON.parse(child.stdout);
}

function runStrictLiveCheck({ root, evidencePath }) {
  return spawnSync(
    process.execPath,
    [
      'scripts/pricing-catalog-snapshot-evidence-check.mjs',
      '--require-live-provider',
      evidencePath,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
}

function validateCaptureResult({ capture, evidence, liveCheck }) {
  const failures = [];

  if (capture.mode !== 'fixture-smoke') {
    failures.push('capture.mode must be fixture-smoke.');
  }
  if (capture.providerCount !== 3) {
    failures.push('capture.providerCount must be 3.');
  }
  if (capture.changedRowCount !== 3) {
    failures.push('capture.changedRowCount must be 3.');
  }
  if (capture.priceChangedSkuCount !== 3) {
    failures.push('capture.priceChangedSkuCount must be 3.');
  }
  if (capture.verifiedProviderSnapshot !== true) {
    failures.push('capture.verifiedProviderSnapshot must be true.');
  }
  if (capture.verifiedLiveProviderSnapshot !== false) {
    failures.push('capture.verifiedLiveProviderSnapshot must remain false.');
  }
  if (evidence.evidenceLevel !== 'provider-snapshot-smoke') {
    failures.push('fixture capture evidenceLevel must be provider-snapshot-smoke.');
  }
  if (
    !Array.isArray(evidence.providerSnapshots) ||
    evidence.providerSnapshots.some((snapshot) => snapshot.sourceMode !== 'fixture-replay')
  ) {
    failures.push('all fixture provider snapshots must use sourceMode=fixture-replay.');
  }
  if (liveCheck.status === 0) {
    failures.push('strict --require-live-provider must reject fixture-smoke evidence.');
  }

  return failures;
}

function scrubbedEnv() {
  const env = { ...process.env };

  delete env.POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE;
  delete env.GCP_CLOUD_BILLING_ACCESS_TOKEN;
  delete env.GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE;
  delete env.VAULT_ADDR;
  delete env.VAULT_TOKEN_FILE;

  return env;
}

function buildFixtures() {
  return {
    aws: {
      previous: awsFixture('0.0230000000'),
      current: awsFixture('0.0240000000'),
    },
    azure: {
      previous: azureFixture(0.018),
      current: azureFixture(0.019),
    },
    gcp: {
      previous: gcpFixture({ units: '0', nanos: 120000000 }),
      current: gcpFixture({ units: '0', nanos: 130000000 }),
    },
  };
}

function awsFixture(firstPriceUsd) {
  return {
    products: {
      AWS_CAPTURE_STORAGE_001: {
        sku: 'AWS_CAPTURE_STORAGE_001',
        productFamily: 'Storage',
        attributes: {
          servicecode: 'AmazonS3',
          regionCode: 'us-east-1',
          location: 'US East (N. Virginia)',
        },
      },
      AWS_CAPTURE_STORAGE_002: {
        sku: 'AWS_CAPTURE_STORAGE_002',
        productFamily: 'Storage',
        attributes: {
          servicecode: 'AmazonS3',
          regionCode: 'us-east-1',
          location: 'US East (N. Virginia)',
        },
      },
    },
    terms: {
      OnDemand: {
        AWS_CAPTURE_STORAGE_001: {
          AWS_CAPTURE_STORAGE_001_TERM: {
            effectiveDate: '2026-07-01T00:00:00Z',
            priceDimensions: {
              AWS_CAPTURE_STORAGE_001_DIM: {
                rateCode: 'AWS_CAPTURE_STORAGE_001_DIM',
                unit: 'GB-Mo',
                pricePerUnit: {
                  USD: firstPriceUsd,
                },
              },
            },
          },
        },
        AWS_CAPTURE_STORAGE_002: {
          AWS_CAPTURE_STORAGE_002_TERM: {
            effectiveDate: '2026-07-01T00:00:00Z',
            priceDimensions: {
              AWS_CAPTURE_STORAGE_002_DIM: {
                rateCode: 'AWS_CAPTURE_STORAGE_002_DIM',
                unit: 'Requests',
                pricePerUnit: {
                  USD: '0.0050000000',
                },
              },
            },
          },
        },
      },
    },
  };
}

function azureFixture(firstPriceUsd) {
  return {
    Items: [
      {
        serviceFamily: 'Storage',
        serviceName: 'Storage',
        productName: 'Hot Block Blob',
        productId: 'azure-storage-hot',
        skuName: 'LRS',
        skuId: 'azure-storage-hot-lrs',
        meterId: 'AZURE_CAPTURE_STORAGE_001',
        armRegionName: 'eastus',
        location: 'US East',
        unitOfMeasure: '1 GB/Month',
        retailPrice: firstPriceUsd,
        effectiveStartDate: '2026-07-01T00:00:00Z',
      },
      {
        serviceFamily: 'Compute',
        serviceName: 'Virtual Machines',
        productName: 'D2s v5',
        productId: 'azure-vm-d2s',
        skuName: 'D2s v5',
        skuId: 'azure-vm-d2s-v5',
        meterId: 'AZURE_CAPTURE_COMPUTE_002',
        armRegionName: 'eastus',
        location: 'US East',
        unitOfMeasure: '1 Hour',
        retailPrice: 0.096,
        effectiveStartDate: '2026-07-01T00:00:00Z',
      },
    ],
  };
}

function gcpFixture(firstUnitPrice) {
  return {
    skus: [
      {
        name: 'services/6F81-5844-456A/skus/GCP_CAPTURE_COMPUTE_001',
        skuId: 'GCP_CAPTURE_COMPUTE_001',
        description: 'N2 Instance Core running in Americas',
        category: {
          serviceDisplayName: 'Compute Engine',
          resourceFamily: 'Compute',
          resourceGroup: 'CPU',
        },
        serviceRegions: ['us-east1'],
        pricingInfo: [
          {
            effectiveTime: '2026-07-01T00:00:00Z',
            pricingExpression: {
              usageUnit: 'h',
              baseUnit: 's',
              tieredRates: [
                {
                  unitPrice: {
                    currencyCode: 'USD',
                    ...firstUnitPrice,
                  },
                },
              ],
            },
          },
        ],
      },
      {
        name: 'services/6F81-5844-456A/skus/GCP_CAPTURE_STORAGE_002',
        skuId: 'GCP_CAPTURE_STORAGE_002',
        description: 'Standard storage in Americas',
        category: {
          serviceDisplayName: 'Cloud Storage',
          resourceFamily: 'Storage',
          resourceGroup: 'Standard',
        },
        serviceRegions: ['us-east1'],
        pricingInfo: [
          {
            effectiveTime: '2026-07-01T00:00:00Z',
            pricingExpression: {
              usageUnit: 'GiBy.mo',
              baseUnit: 'By.s',
              tieredRates: [
                {
                  unitPrice: {
                    currencyCode: 'USD',
                    units: '0',
                    nanos: 20000000,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root value is not an object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function printResult(result) {
  console.log(
    `Pricing catalog live snapshot capture smoke passed (${result.providerCount} providers; ${result.changedRowCount} changed rows).`,
  );
  console.log(`Evidence bundle: ${path.relative(process.cwd(), result.evidencePath)}`);
}

function printHelp() {
  console.log(`Pricing catalog live snapshot capture smoke ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-snapshot-capture-smoke.mjs [options]

Options:
  --output-dir <path>    Directory for generated fixtures and evidence (default: ${DEFAULT_OUTPUT_DIR})
  --json                 Print machine-readable smoke output
  --quiet                Suppress human-readable success output
  --version              Print version
  --help                 Show this help
`);
}
