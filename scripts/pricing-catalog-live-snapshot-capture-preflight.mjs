#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const PREFLIGHT_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture-preflight/v1';
const LIVE_GUARD_ENV = 'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE';
const DEFAULT_AWS_OFFER_CODE = 'AmazonS3';
const DEFAULT_AWS_REGION = 'us-east-1';
const DEFAULT_AZURE_REGION = 'eastus';
const DEFAULT_GCP_SERVICE_ID = '6F81-5844-456A';

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live capture preflight error: ${message}`);
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
  const result = await runPreflight(args);

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
          schemaVersion: PREFLIGHT_SCHEMA,
          strictLive: args.strictLive,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live capture preflight failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    strictLive: false,
    previousEvidencePath: process.env.PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE,
    operator: process.env.POLYCOST_OPERATOR,
    awsOfferCode: process.env.AWS_PRICING_OFFER_CODE || DEFAULT_AWS_OFFER_CODE,
    awsRegion: process.env.AWS_PRICING_REGION || DEFAULT_AWS_REGION,
    azureRegion: process.env.AZURE_RETAIL_PRICES_REGION || DEFAULT_AZURE_REGION,
    gcpServiceId: process.env.GCP_CLOUD_BILLING_SERVICE_ID || DEFAULT_GCP_SERVICE_ID,
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
    if (arg === '--strict-live') {
      options.strictLive = true;
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
    if (arg === '--operator') {
      options.operator = readOptionValue(argv, index, '--operator');
      index += 1;
      continue;
    }
    if (arg.startsWith('--operator=')) {
      options.operator = arg.slice('--operator='.length).trim();
      continue;
    }
    if (arg === '--aws-offer-code') {
      options.awsOfferCode = readOptionValue(argv, index, '--aws-offer-code');
      index += 1;
      continue;
    }
    if (arg.startsWith('--aws-offer-code=')) {
      options.awsOfferCode = arg.slice('--aws-offer-code='.length).trim();
      continue;
    }
    if (arg === '--aws-region') {
      options.awsRegion = readOptionValue(argv, index, '--aws-region');
      index += 1;
      continue;
    }
    if (arg.startsWith('--aws-region=')) {
      options.awsRegion = arg.slice('--aws-region='.length).trim();
      continue;
    }
    if (arg === '--azure-region') {
      options.azureRegion = readOptionValue(argv, index, '--azure-region');
      index += 1;
      continue;
    }
    if (arg.startsWith('--azure-region=')) {
      options.azureRegion = arg.slice('--azure-region='.length).trim();
      continue;
    }
    if (arg === '--gcp-service-id') {
      options.gcpServiceId = readOptionValue(argv, index, '--gcp-service-id');
      index += 1;
      continue;
    }
    if (arg.startsWith('--gcp-service-id=')) {
      options.gcpServiceId = arg.slice('--gcp-service-id='.length).trim();
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

async function runPreflight(options) {
  const root = process.cwd();
  const checks = [
    liveGuardCheck(),
    operatorCheck(options.operator),
    previousEvidenceCheck({ root, evidencePath: options.previousEvidencePath }),
    await gcpCredentialCheck(),
    awsEndpointCheck(options),
    azureEndpointCheck(options),
    gcpEndpointCheck(options),
    noRawCredentialOutputCheck(),
  ];
  const failures = checks
    .filter((check) => check.status === 'fail')
    .map((check) => `${check.id}: ${check.message}`);
  const warnings = checks
    .filter((check) => check.status === 'warn')
    .map((check) => `${check.id}: ${check.message}`);
  const readyForLiveCapture = failures.length === 0 && warnings.length === 0;
  const ok = options.strictLive ? readyForLiveCapture : failures.length === 0;

  return {
    ok,
    schemaVersion: PREFLIGHT_SCHEMA,
    strictLive: options.strictLive,
    checkedAt: new Date().toISOString(),
    readyForLiveCapture,
    checks,
    failureCount: failures.length,
    warningCount: warnings.length,
    failures,
    warnings,
    liveCaptureCommand: [
      `${LIVE_GUARD_ENV}=true`,
      'npm run pricing:catalog:snapshot:capture --',
      '--live',
      '--operator <reviewer-name>',
      '--previous-evidence <prior-live-provider-bundle.json>',
    ].join(' '),
    caveats: [
      'Default mode is advisory for local demo and CI environments; use --strict-live in a target environment before claiming live provider capture readiness.',
      'This preflight checks configuration and prior evidence posture without calling provider pricing APIs or printing credential values.',
      'Passing strict preflight is necessary but not sufficient for invoice-grade billing proof.',
    ],
  };
}

function liveGuardCheck() {
  const configured = process.env[LIVE_GUARD_ENV] === 'true';

  return {
    id: 'live_guard',
    status: configured ? 'pass' : 'warn',
    message: configured
      ? `${LIVE_GUARD_ENV}=true is set.`
      : `${LIVE_GUARD_ENV}=true is not set; live capture command will refuse to run.`,
    evidence: {
      env: LIVE_GUARD_ENV,
      requiredValue: 'true',
      configured,
    },
  };
}

function operatorCheck(operator) {
  const valid = hasRealOperator(operator);

  return {
    id: 'operator_attestation',
    status: valid ? 'pass' : 'warn',
    message: valid
      ? 'Operator attestation name is configured.'
      : '--operator or POLYCOST_OPERATOR must name the human reviewer before live capture.',
    evidence: {
      configured: valid,
      valueRedacted: Boolean(operator),
    },
  };
}

function previousEvidenceCheck({ root, evidencePath }) {
  if (!evidencePath) {
    return {
      id: 'previous_live_evidence',
      status: 'warn',
      message:
        '--previous-evidence or PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE is required for live row-change proof.',
      evidence: {
        configured: false,
      },
    };
  }

  const resolvedEvidencePath = path.resolve(root, evidencePath);
  if (!existsSync(resolvedEvidencePath)) {
    return {
      id: 'previous_live_evidence',
      status: 'fail',
      message: 'Previous live evidence file is not readable.',
      evidence: {
        configured: true,
        path: path.relative(root, resolvedEvidencePath),
        readable: false,
      },
    };
  }

  const child = spawnSync(
    process.execPath,
    [
      'scripts/pricing-catalog-snapshot-evidence-check.mjs',
      '--require-live-provider',
      resolvedEvidencePath,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  const parsed = parseJsonOutput(child.stdout);

  return {
    id: 'previous_live_evidence',
    status: child.status === 0 ? 'pass' : 'fail',
    message:
      child.status === 0
        ? 'Previous evidence passes --require-live-provider.'
        : 'Previous evidence does not pass --require-live-provider.',
    evidence: {
      configured: true,
      path: path.relative(root, resolvedEvidencePath),
      checkerExitCode: child.status,
      verifiedLiveProviderSnapshot: parsed?.verifiedLiveProviderSnapshot === true,
      providerCount: parsed?.providerCount,
    },
  };
}

async function gcpCredentialCheck() {
  if (hasUsableSecret(process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN)) {
    return {
      id: 'gcp_cloud_billing_credential',
      status: 'pass',
      message: 'GCP Cloud Billing access token is configured in environment.',
      evidence: {
        source: 'env',
        env: 'GCP_CLOUD_BILLING_ACCESS_TOKEN',
        valueRedacted: true,
      },
    };
  }

  const tokenFile = process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE;
  if (tokenFile) {
    const tokenFileReadable = existsSync(tokenFile);
    const tokenLooksUsable = tokenFileReadable
      ? hasUsableSecret((await readFile(tokenFile, 'utf8')).trim())
      : false;

    return {
      id: 'gcp_cloud_billing_credential',
      status: tokenFileReadable && tokenLooksUsable ? 'pass' : 'fail',
      message:
        tokenFileReadable && tokenLooksUsable
          ? 'GCP Cloud Billing access token file is readable and non-dummy.'
          : 'GCP Cloud Billing access token file is missing or contains a dummy value.',
      evidence: {
        source: 'token-file',
        env: 'GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE',
        pathConfigured: true,
        readable: tokenFileReadable,
        valueRedacted: true,
      },
    };
  }

  if (process.env.VAULT_ADDR && process.env.VAULT_TOKEN_FILE) {
    return {
      id: 'gcp_cloud_billing_credential',
      status: existsSync(process.env.VAULT_TOKEN_FILE) ? 'pass' : 'fail',
      message: existsSync(process.env.VAULT_TOKEN_FILE)
        ? 'Vault is configured for GCP Cloud Billing credential lookup.'
        : 'VAULT_TOKEN_FILE is configured but not readable.',
      evidence: {
        source: 'vault',
        vaultAddrConfigured: true,
        vaultTokenFileReadable: existsSync(process.env.VAULT_TOKEN_FILE),
        secretPath: 'secret/polycost/providers/gcp access_token',
        valueRedacted: true,
      },
    };
  }

  return {
    id: 'gcp_cloud_billing_credential',
    status: 'warn',
    message:
      'GCP Cloud Billing credential source is not configured; live GCP catalog capture will fail.',
    evidence: {
      configured: false,
      acceptedSources: [
        'GCP_CLOUD_BILLING_ACCESS_TOKEN',
        'GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE',
        'Vault secret/polycost/providers/gcp access_token',
      ],
    },
  };
}

function awsEndpointCheck(options) {
  return {
    id: 'aws_public_catalog_endpoint',
    status: hasValue(options.awsOfferCode) && hasValue(options.awsRegion) ? 'pass' : 'fail',
    message: 'AWS live capture uses the public AWS Price List bulk offer endpoint.',
    evidence: {
      sourceSystem: 'aws-price-list-bulk-offer',
      endpoint: awsOfferUrl(options.awsOfferCode),
      region: options.awsRegion,
      credentialRequired: false,
    },
  };
}

function azureEndpointCheck(options) {
  return {
    id: 'azure_public_catalog_endpoint',
    status: hasValue(options.azureRegion) ? 'pass' : 'fail',
    message: 'Azure live capture uses the public Azure Retail Prices endpoint.',
    evidence: {
      sourceSystem: 'azure-retail-prices-api',
      endpoint: azureRetailPricesUrl(options.azureRegion),
      region: options.azureRegion,
      credentialRequired: false,
    },
  };
}

function gcpEndpointCheck(options) {
  return {
    id: 'gcp_cloud_billing_endpoint',
    status: hasValue(options.gcpServiceId) ? 'pass' : 'fail',
    message: 'GCP live capture uses the Cloud Billing Catalog API.',
    evidence: {
      sourceSystem: 'gcp-cloud-billing-catalog-api',
      endpoint: gcpSkusUrl(options.gcpServiceId),
      credentialRequired: true,
    },
  };
}

function noRawCredentialOutputCheck() {
  return {
    id: 'no_raw_credential_output',
    status: 'pass',
    message:
      'Preflight output records credential source posture only and never prints token values.',
    evidence: {
      accessTokenRedacted: true,
      vaultTokenRedacted: true,
      signedUrlsExcluded: true,
    },
  };
}

function hasRealOperator(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    !/example|sample|demo|test|unknown/i.test(value)
  );
}

function hasUsableSecret(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/CHANGE_ME_DEV_ONLY/i.test(value);
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function awsOfferUrl(offerCode) {
  return `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${encodeURIComponent(
    offerCode || DEFAULT_AWS_OFFER_CODE,
  )}/current/index.json`;
}

function azureRetailPricesUrl(region) {
  const filter = [
    "priceType eq 'Consumption'",
    `armRegionName eq '${String(region || DEFAULT_AZURE_REGION).replace(/'/g, "''")}'`,
  ].join(' and ');

  return `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;
}

function gcpSkusUrl(serviceId) {
  return `https://cloudbilling.googleapis.com/v1/services/${encodeURIComponent(
    serviceId || DEFAULT_GCP_SERVICE_ID,
  )}/skus?pageSize=5000`;
}

function printResult(result) {
  const status = result.readyForLiveCapture ? 'ready' : 'not ready';
  console.log(`Pricing catalog live capture preflight ${status}.`);
  console.log(
    `Checks: ${result.checks.length}; warnings: ${result.warningCount}; failures: ${result.failureCount}`,
  );
  if (!result.readyForLiveCapture) {
    console.log(
      'Use --strict-live in the target environment before claiming live provider capture readiness.',
    );
  }
}

function printHelp() {
  console.log(`Pricing catalog live capture preflight ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-snapshot-capture-preflight.mjs [options]

Options:
  --strict-live                  Fail unless live capture guard, operator, GCP credential source, and previous live evidence are ready
  --previous-evidence <path>     Prior live-provider evidence bundle for exact row-change proof
  --operator <name>              Human/operator reviewer name for live evidence attestation
  --aws-offer-code <code>        AWS public offer code (default: ${DEFAULT_AWS_OFFER_CODE})
  --aws-region <region>          AWS region filter (default: ${DEFAULT_AWS_REGION})
  --azure-region <region>        Azure Retail Prices region filter (default: ${DEFAULT_AZURE_REGION})
  --gcp-service-id <id>          GCP Cloud Billing service ID (default: ${DEFAULT_GCP_SERVICE_ID})
  --json                         Print machine-readable output
  --quiet                        Suppress human-readable output
  --version                      Print version
  --help                         Show this help
`);
}
