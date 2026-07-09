#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const CAPTURE_SCHEMA = 'polycost-pricing-catalog-live-snapshot-capture/v1';
const EVIDENCE_SCHEMA = 'polycost-pricing-catalog-snapshot-evidence/v1';
const DEFAULT_OUTPUT_DIR = '.tmp/pricing-catalog-live-snapshot-evidence';
const DEFAULT_AWS_OFFER_CODE = 'AmazonS3';
const DEFAULT_AWS_REGION = 'us-east-1';
const DEFAULT_AZURE_REGION = 'eastus';
const DEFAULT_GCP_SERVICE_ID = '6F81-5844-456A';
const DEFAULT_SAMPLE_LIMIT = 25;
const PROVIDERS = ['aws', 'azure', 'gcp'];
const LIVE_GUARD_ENV = 'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE';
const FIXTURE_FILENAMES = {
  aws: {
    previous: 'aws-previous.json',
    current: 'aws-current.json',
  },
  azure: {
    previous: 'azure-previous.json',
    current: 'azure-current.json',
  },
  gcp: {
    previous: 'gcp-previous.json',
    current: 'gcp-current.json',
  },
};

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live snapshot capture error: ${message}`);
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
  const result = args.fixtureSmoke
    ? await runFixtureSmokeCapture(args)
    : args.live
      ? await runLiveCapture(args)
      : await runPlan(args);

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
          schemaVersion: CAPTURE_SCHEMA,
          mode: args.fixtureSmoke ? 'fixture-smoke' : args.live ? 'live' : 'plan',
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live snapshot capture failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    live: false,
    plan: false,
    fixtureSmoke: false,
    fixtureDir: undefined,
    outputDir: DEFAULT_OUTPUT_DIR,
    previousEvidencePath: undefined,
    operator: process.env.POLYCOST_OPERATOR,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    awsOfferCode: process.env.AWS_PRICING_OFFER_CODE || DEFAULT_AWS_OFFER_CODE,
    awsRegion: process.env.AWS_PRICING_REGION || DEFAULT_AWS_REGION,
    azureRegion: process.env.AZURE_RETAIL_PRICES_REGION || DEFAULT_AZURE_REGION,
    gcpServiceId: process.env.GCP_CLOUD_BILLING_SERVICE_ID || DEFAULT_GCP_SERVICE_ID,
    freshnessSlaHours: numberFromEnv('PRICING_CATALOG_SNAPSHOT_FRESHNESS_HOURS', 24),
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
      continue;
    }
    if (arg === '--live') {
      options.live = true;
      continue;
    }
    if (arg === '--fixture-smoke') {
      options.fixtureSmoke = true;
      continue;
    }
    if (arg === '--fixture-dir') {
      options.fixtureDir = readOptionValue(argv, index, '--fixture-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--fixture-dir=')) {
      options.fixtureDir = arg.slice('--fixture-dir='.length).trim();
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
    if (arg === '--sample-limit') {
      options.sampleLimit = readPositiveInteger(readOptionValue(argv, index, '--sample-limit'));
      index += 1;
      continue;
    }
    if (arg.startsWith('--sample-limit=')) {
      options.sampleLimit = readPositiveInteger(arg.slice('--sample-limit='.length).trim());
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

  if (!options.outputDir) {
    throw new Error('Output directory cannot be empty.');
  }
  if (!Number.isInteger(options.sampleLimit) || options.sampleLimit <= 0) {
    throw new Error('--sample-limit must be a positive integer.');
  }
  if (!Number.isInteger(options.freshnessSlaHours) || options.freshnessSlaHours <= 0) {
    throw new Error('PRICING_CATALOG_SNAPSHOT_FRESHNESS_HOURS must be a positive integer.');
  }
  const selectedModes = [options.live, options.plan, options.fixtureSmoke].filter(Boolean).length;
  if (selectedModes > 1) {
    throw new Error('Use only one of --live, --plan, or --fixture-smoke.');
  }
  if (options.fixtureSmoke && !options.fixtureDir) {
    throw new Error('--fixture-dir is required with --fixture-smoke.');
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

function readPositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}.`);
  }

  return parsed;
}

function numberFromEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  return readPositiveInteger(value.trim());
}

async function runPlan(options) {
  const providerPlans = [
    {
      provider: 'aws',
      sourceSystem: 'aws-price-list-bulk-offer',
      endpoint: awsOfferUrl(options.awsOfferCode),
      credentialMode: 'none-required-public-catalog',
      readOnly: true,
    },
    {
      provider: 'azure',
      sourceSystem: 'azure-retail-prices-api',
      endpoint: azureRetailPricesUrl(options.azureRegion),
      credentialMode: 'none-required-public-catalog',
      readOnly: true,
    },
    {
      provider: 'gcp',
      sourceSystem: 'gcp-cloud-billing-catalog-api',
      endpoint: gcpSkusUrl(options.gcpServiceId),
      credentialMode:
        'GCP_CLOUD_BILLING_ACCESS_TOKEN, GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE, or Vault secret/polycost/providers/gcp access_token',
      credentialConfigured: await hasGcpCredentialConfigured(),
      readOnly: true,
    },
  ];

  return {
    ok: true,
    schemaVersion: CAPTURE_SCHEMA,
    mode: 'plan',
    liveGuardEnv: LIVE_GUARD_ENV,
    liveGuardRequiredValue: 'true',
    previousEvidenceRequired: true,
    outputDir: path.resolve(process.cwd(), options.outputDir),
    sampleLimit: options.sampleLimit,
    providerPlans,
    caveats: [
      'Plan mode performs no provider network calls and writes no evidence bundle.',
      'Live mode requires POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true, --operator, and --previous-evidence from a prior live-provider snapshot.',
      'Generated evidence is catalog-list-price traceability, not invoice-grade billing proof.',
    ],
  };
}

async function runLiveCapture(options) {
  assertLiveGuard(options);

  const root = process.cwd();
  const outputDir = path.resolve(root, options.outputDir);
  const capturedAt = new Date().toISOString();
  const previousEvidencePath = path.resolve(root, options.previousEvidencePath);
  const previousEvidence = await readPreviousEvidence(root, previousEvidencePath);
  const previousSnapshotsByProvider = new Map(
    previousEvidence.providerSnapshots.map((snapshot) => [snapshot.provider, snapshot]),
  );
  const providerRows = await Promise.all([
    fetchAwsRows(options, capturedAt),
    fetchAzureRows(options, capturedAt),
    fetchGcpRows(options, capturedAt),
  ]);
  const providerSnapshots = providerRows.map((currentRows) => {
    const provider = currentRows[0]?.provider;
    const previousSnapshot = previousSnapshotsByProvider.get(provider);
    if (!previousSnapshot) {
      throw new Error(`Previous evidence is missing ${provider} row samples.`);
    }

    const previousRows = previousSnapshot.rowSamples;
    return buildProviderSnapshot({
      provider,
      sourceSystem: sourceSystemForProvider(provider),
      publicEndpoints: [...new Set(currentRows.map((row) => row.sourceEndpoint))],
      previousRows,
      currentRows,
      capturedAt,
    });
  });
  const snapshotWindow = summarizeWindow(providerSnapshots);
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA,
    bundleName: 'pricing-catalog-live-provider-snapshot-evidence',
    evidenceLevel: 'live-provider-snapshot',
    productionClaim: false,
    capturedAt,
    freshnessSlaHours: options.freshnessSlaHours,
    snapshotWindow,
    providerSnapshots,
    operatorAttestations: {
      rawCatalogPayloadExcluded: true,
      credentialsExcluded: true,
      signedUrlsExcluded: true,
      liveProviderEndpointsReviewed: true,
      productionClaimedByPolyCost: false,
      operator: options.operator,
    },
    caveats: [
      'This bundle is generated from read-only provider catalog APIs and sanitized before archival.',
      'It validates live catalog snapshot traceability and exact row comparison against the supplied previous evidence bundle.',
      'It is not invoice-grade billing, private-pricing, tax, credit, support, marketplace, or legal invoice-of-record proof.',
    ],
  };
  const evidencePath = path.join(outputDir, 'pricing-catalog-live-snapshot-evidence.json');
  const providerSnapshotPaths = {};

  await mkdir(outputDir, { recursive: true });
  await writeJson(evidencePath, evidence);
  for (const snapshot of providerSnapshots) {
    const filePath = path.join(outputDir, `${snapshot.provider}-current-row-samples.json`);
    providerSnapshotPaths[snapshot.provider] = filePath;
    await writeJson(filePath, snapshot.rowSamples);
  }

  const check = runSnapshotEvidenceCheck({ root, evidencePath });

  return {
    ok: true,
    schemaVersion: CAPTURE_SCHEMA,
    mode: 'live',
    outputDir,
    evidencePath,
    providerSnapshotPaths,
    providerCount: providerSnapshots.length,
    changedRowCount: snapshotWindow.changedRowCount,
    priceChangedSkuCount: snapshotWindow.priceChangedSkuCount,
    verifiedLiveProviderSnapshot: check.verifiedLiveProviderSnapshot === true,
    caveats: evidence.caveats,
  };
}

async function runFixtureSmokeCapture(options) {
  const root = process.cwd();
  const outputDir = path.resolve(root, options.outputDir);
  const fixtureDir = path.resolve(root, options.fixtureDir);
  const capturedAt = new Date().toISOString();
  const previousCapturedAt = new Date(Date.parse(capturedAt) - 60 * 60 * 1000).toISOString();
  const previousRowsByProvider = new Map();
  const currentRowsByProvider = new Map();

  previousRowsByProvider.set(
    'aws',
    normalizeAwsRows({
      payload: await readFixturePayload(fixtureDir, 'aws', 'previous'),
      options,
      endpoint: awsOfferUrl(options.awsOfferCode),
      fetchedAt: previousCapturedAt,
    }),
  );
  currentRowsByProvider.set(
    'aws',
    normalizeAwsRows({
      payload: await readFixturePayload(fixtureDir, 'aws', 'current'),
      options,
      endpoint: awsOfferUrl(options.awsOfferCode),
      fetchedAt: capturedAt,
    }),
  );
  previousRowsByProvider.set(
    'azure',
    normalizeAzureRows({
      payload: await readFixturePayload(fixtureDir, 'azure', 'previous'),
      options,
      endpoint: azureRetailPricesUrl(options.azureRegion),
      fetchedAt: previousCapturedAt,
    }),
  );
  currentRowsByProvider.set(
    'azure',
    normalizeAzureRows({
      payload: await readFixturePayload(fixtureDir, 'azure', 'current'),
      options,
      endpoint: azureRetailPricesUrl(options.azureRegion),
      fetchedAt: capturedAt,
    }),
  );
  previousRowsByProvider.set(
    'gcp',
    normalizeGcpRows({
      payload: await readFixturePayload(fixtureDir, 'gcp', 'previous'),
      options,
      endpoint: gcpSkusUrl(options.gcpServiceId),
      fetchedAt: previousCapturedAt,
    }),
  );
  currentRowsByProvider.set(
    'gcp',
    normalizeGcpRows({
      payload: await readFixturePayload(fixtureDir, 'gcp', 'current'),
      options,
      endpoint: gcpSkusUrl(options.gcpServiceId),
      fetchedAt: capturedAt,
    }),
  );

  const providerSnapshots = PROVIDERS.map((provider) => {
    const currentRows = currentRowsByProvider.get(provider);
    const previousRows = previousRowsByProvider.get(provider);

    return buildProviderSnapshot({
      provider,
      sourceSystem: `${sourceSystemForProvider(provider)}-fixture-replay`,
      sourceMode: 'fixture-replay',
      publicEndpoints: [...new Set(currentRows.map((row) => row.sourceEndpoint))],
      previousRows,
      currentRows,
    });
  });
  const snapshotWindow = summarizeWindow(providerSnapshots);
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA,
    bundleName: 'pricing-catalog-live-capture-fixture-smoke-evidence',
    evidenceLevel: 'provider-snapshot-smoke',
    productionClaim: false,
    capturedAt,
    freshnessSlaHours: options.freshnessSlaHours,
    snapshotWindow,
    providerSnapshots,
    operatorAttestations: {
      rawCatalogPayloadExcluded: true,
      credentialsExcluded: true,
      signedUrlsExcluded: true,
      liveProviderEndpointsReviewed: false,
      productionClaimedByPolyCost: false,
      operator: 'pricing-catalog-live-snapshot-capture-smoke',
    },
    caveats: [
      'This fixture smoke replays provider-native AWS/Azure/GCP catalog payloads through the live capture normalizers without provider network calls.',
      'It proves parser/normalizer coverage, hash coverage, and exact row-change math; it is not live provider API proof.',
      'Use --live with POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true and --require-live-provider evidence before claiming live provider snapshot proof.',
    ],
  };
  const evidencePath = path.join(outputDir, 'pricing-catalog-live-capture-fixture-evidence.json');
  const providerSnapshotPaths = {};

  await mkdir(outputDir, { recursive: true });
  await writeJson(evidencePath, evidence);
  for (const snapshot of providerSnapshots) {
    const filePath = path.join(outputDir, `${snapshot.provider}-fixture-row-samples.json`);
    providerSnapshotPaths[snapshot.provider] = filePath;
    await writeJson(filePath, snapshot.rowSamples);
  }

  const check = runSnapshotEvidenceCheck({
    root,
    evidencePath,
    requireLiveProvider: false,
  });

  return {
    ok: true,
    schemaVersion: CAPTURE_SCHEMA,
    mode: 'fixture-smoke',
    fixtureDir,
    outputDir,
    evidencePath,
    providerSnapshotPaths,
    providerCount: providerSnapshots.length,
    changedRowCount: snapshotWindow.changedRowCount,
    priceChangedSkuCount: snapshotWindow.priceChangedSkuCount,
    verifiedProviderSnapshot: check.verifiedProviderSnapshot === true,
    verifiedLiveProviderSnapshot: false,
    caveats: evidence.caveats,
  };
}

function assertLiveGuard(options) {
  if (process.env[LIVE_GUARD_ENV] !== 'true') {
    throw new Error(`${LIVE_GUARD_ENV}=true is required before live provider capture.`);
  }
  if (!options.previousEvidencePath) {
    throw new Error('--previous-evidence is required for live row-change proof.');
  }
  if (!hasRealOperator(options.operator)) {
    throw new Error('--operator or POLYCOST_OPERATOR must name the human/operator reviewer.');
  }
}

function hasRealOperator(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    !/example|sample|demo|test|unknown/i.test(value)
  );
}

async function readPreviousEvidence(root, evidencePath) {
  const child = spawnSync(
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

  if (child.status !== 0) {
    throw new Error(
      [
        'Previous pricing catalog evidence must pass --require-live-provider before it can seed a live comparison.',
        child.stdout,
        child.stderr,
      ]
        .map((item) => item.trim())
        .filter(Boolean)
        .join('\n'),
    );
  }

  const parsed = parseJsonObject(await readFile(evidencePath, 'utf8'), evidencePath);
  if (!Array.isArray(parsed.providerSnapshots)) {
    throw new Error('Previous evidence must include providerSnapshots.');
  }

  return parsed;
}

async function fetchAwsRows(options, fetchedAt) {
  const endpoint = awsOfferUrl(options.awsOfferCode);
  const payload = await fetchJson(endpoint, {});

  return normalizeAwsRows({ payload, options, endpoint, fetchedAt });
}

function normalizeAwsRows({ payload, options, endpoint, fetchedAt }) {
  const products = plainObject(payload.products) ? Object.values(payload.products) : [];
  const onDemandTerms = plainObject(payload.terms?.OnDemand) ? payload.terms.OnDemand : {};
  const rows = [];

  for (const product of products) {
    if (rows.length >= options.sampleLimit) {
      break;
    }

    const productObject = plainObject(product);
    const sku = stringValue(productObject?.sku);
    if (!sku || !matchesAwsRegion(productObject, options.awsRegion)) {
      continue;
    }

    const skuTerms = plainObject(onDemandTerms[sku]) ? Object.values(onDemandTerms[sku]) : [];
    for (const term of skuTerms) {
      const termObject = plainObject(term);
      const dimensions = plainObject(termObject?.priceDimensions)
        ? Object.values(termObject.priceDimensions)
        : [];

      for (const dimension of dimensions) {
        if (rows.length >= options.sampleLimit) {
          break;
        }

        const dimensionObject = plainObject(dimension);
        const unitPriceUsd = Number(dimensionObject?.pricePerUnit?.USD);
        if (!Number.isFinite(unitPriceUsd)) {
          continue;
        }

        rows.push(
          sanitizeRow({
            provider: 'aws',
            serviceCategory: classifyServiceCategory(
              productObject?.productFamily,
              productObject?.attributes?.servicecode,
            ),
            serviceName:
              stringValue(productObject?.attributes?.servicecode) ||
              stringValue(productObject?.productFamily) ||
              options.awsOfferCode,
            skuId: sku,
            region:
              stringValue(productObject?.attributes?.regionCode) ||
              stringValue(productObject?.attributes?.location) ||
              options.awsRegion,
            unit: stringValue(dimensionObject?.unit) || 'unit',
            unitPriceUsd,
            sourceEndpoint: endpoint,
            sourceRecordId: [sku, dimensionObject?.rateCode].filter(Boolean).join(':'),
            effectiveDate: toIsoDate(termObject?.effectiveDate, fetchedAt),
            fetchedAt,
            transformVersion: 'pricing-live-snapshot-capture-v1',
            sourcePayloadHash: sha256(canonicalJson({ product: productObject, term: termObject })),
          }),
        );
      }
    }
  }

  return requireRows('aws', rows);
}

async function fetchAzureRows(options, fetchedAt) {
  const endpoint = azureRetailPricesUrl(options.azureRegion);
  const payload = await fetchJson(endpoint, {});

  return normalizeAzureRows({ payload, options, endpoint, fetchedAt });
}

function normalizeAzureRows({ payload, options, endpoint, fetchedAt }) {
  const items = Array.isArray(payload.Items) ? payload.Items : [];
  const rows = [];

  for (const item of items) {
    if (rows.length >= options.sampleLimit) {
      break;
    }

    const itemObject = plainObject(item);
    const unitPriceUsd = Number(itemObject?.retailPrice ?? itemObject?.unitPrice);
    if (!itemObject || !Number.isFinite(unitPriceUsd)) {
      continue;
    }

    rows.push(
      sanitizeRow({
        provider: 'azure',
        serviceCategory: classifyServiceCategory(
          itemObject.serviceFamily,
          itemObject.serviceName,
          itemObject.productName,
        ),
        serviceName: stringValue(itemObject.serviceName) || 'Azure Retail Prices',
        skuId:
          stringValue(itemObject.meterId) ||
          [itemObject.productId, itemObject.skuName].filter(Boolean).join(':'),
        region:
          stringValue(itemObject.armRegionName) || stringValue(itemObject.location) || 'global',
        unit: stringValue(itemObject.unitOfMeasure) || 'unit',
        unitPriceUsd,
        sourceEndpoint: endpoint,
        sourceRecordId:
          stringValue(itemObject.meterId) ||
          [itemObject.productId, itemObject.skuId].filter(Boolean).join(':'),
        effectiveDate: toIsoDate(itemObject.effectiveStartDate, fetchedAt),
        fetchedAt,
        transformVersion: 'pricing-live-snapshot-capture-v1',
        sourcePayloadHash: sha256(canonicalJson(itemObject)),
      }),
    );
  }

  return requireRows('azure', rows);
}

async function fetchGcpRows(options, fetchedAt) {
  const token = await readGcpAccessToken();
  const endpoint = gcpSkusUrl(options.gcpServiceId);
  const payload = await fetchJson(endpoint, {
    Authorization: `Bearer ${token}`,
  });

  return normalizeGcpRows({ payload, options, endpoint, fetchedAt });
}

function normalizeGcpRows({ payload, options, endpoint, fetchedAt }) {
  const skus = Array.isArray(payload.skus) ? payload.skus : [];
  const rows = [];

  for (const sku of skus) {
    if (rows.length >= options.sampleLimit) {
      break;
    }

    const skuObject = plainObject(sku);
    const pricingInfo = Array.isArray(skuObject?.pricingInfo) ? skuObject.pricingInfo : [];
    const firstPricing = plainObject(pricingInfo[0]);
    const expression = plainObject(firstPricing?.pricingExpression);
    const tieredRates = Array.isArray(expression?.tieredRates) ? expression.tieredRates : [];
    const firstRate = plainObject(tieredRates[0]);
    const unitPriceUsd = moneyToNumber(firstRate?.unitPrice);

    if (!skuObject || !Number.isFinite(unitPriceUsd)) {
      continue;
    }

    rows.push(
      sanitizeRow({
        provider: 'gcp',
        serviceCategory: classifyServiceCategory(
          skuObject.category?.resourceFamily,
          skuObject.category?.resourceGroup,
          skuObject.description,
        ),
        serviceName: stringValue(skuObject.category?.serviceDisplayName) || 'GCP Cloud Billing',
        skuId: stringValue(skuObject.skuId) || stringValue(skuObject.name),
        region: Array.isArray(skuObject.serviceRegions)
          ? stringValue(skuObject.serviceRegions[0]) || 'global'
          : 'global',
        unit: stringValue(expression?.usageUnit) || stringValue(expression?.baseUnit) || 'unit',
        unitPriceUsd,
        sourceEndpoint: endpoint,
        sourceRecordId: stringValue(skuObject.name) || stringValue(skuObject.skuId),
        effectiveDate: toIsoDate(firstPricing?.effectiveTime, fetchedAt),
        fetchedAt,
        transformVersion: 'pricing-live-snapshot-capture-v1',
        sourcePayloadHash: sha256(canonicalJson(skuObject)),
      }),
    );
  }

  return requireRows('gcp', rows);
}

async function readFixturePayload(fixtureDir, provider, phase) {
  const fileName = FIXTURE_FILENAMES[provider]?.[phase];
  if (!fileName) {
    throw new Error(`Unsupported fixture payload ${provider}/${phase}.`);
  }

  const fixturePath = path.join(fixtureDir, fileName);
  return parseJsonObject(await readFile(fixturePath, 'utf8'), fixturePath);
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Provider catalog request failed (${response.status}) for ${redactUrl(url)}.`);
  }

  return response.json();
}

async function readGcpAccessToken() {
  if (hasUsableSecret(process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN)) {
    return process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN.trim();
  }

  const tokenFile = process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE;
  if (tokenFile) {
    const token = (await readFile(tokenFile, 'utf8')).trim();
    if (hasUsableSecret(token)) {
      return token;
    }
  }

  const vaultToken = await readVaultGcpAccessToken();
  if (hasUsableSecret(vaultToken)) {
    return vaultToken;
  }

  throw new Error(
    'GCP live snapshot capture requires GCP_CLOUD_BILLING_ACCESS_TOKEN, GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE, or Vault secret/polycost/providers/gcp access_token.',
  );
}

async function readVaultGcpAccessToken() {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultTokenFile = process.env.VAULT_TOKEN_FILE;

  if (!vaultAddr || !vaultTokenFile) {
    return undefined;
  }

  const vaultToken = (await readFile(vaultTokenFile, 'utf8')).trim();
  const endpoint = `${vaultAddr.replace(/\/$/, '')}/v1/secret/data/polycost/providers/gcp`;
  const response = await fetch(endpoint, {
    headers: {
      'X-Vault-Token': vaultToken,
    },
  });

  if (!response.ok) {
    throw new Error('Vault path secret/polycost/providers/gcp is not readable.');
  }

  const parsed = await response.json();
  return parsed?.data?.data?.access_token;
}

async function hasGcpCredentialConfigured() {
  if (hasUsableSecret(process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN)) {
    return true;
  }
  if (process.env.GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE) {
    return true;
  }
  return Boolean(process.env.VAULT_ADDR && process.env.VAULT_TOKEN_FILE);
}

function hasUsableSecret(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/CHANGE_ME_DEV_ONLY/i.test(value);
}

function sanitizeRow(row) {
  const normalized = {
    provider: row.provider,
    serviceCategory: row.serviceCategory,
    serviceName: row.serviceName,
    skuId: row.skuId,
    region: row.region,
    unit: row.unit,
    unitPriceUsd: Number(row.unitPriceUsd.toFixed(9)),
    sourceEndpoint: redactUrl(row.sourceEndpoint),
    sourceRecordId: row.sourceRecordId,
    effectiveDate: row.effectiveDate,
    fetchedAt: row.fetchedAt,
    transformVersion: row.transformVersion,
    sourcePayloadHash: row.sourcePayloadHash,
  };
  const sourceRecordKey = [
    normalized.provider,
    normalized.serviceCategory,
    normalized.skuId,
    normalized.region,
    normalized.unit,
    normalized.effectiveDate,
  ].join('|');
  const rowWithKey = { ...normalized, sourceRecordKey };

  return {
    ...rowWithKey,
    rowSha256: sha256(canonicalJson(rowChangeFingerprint(rowWithKey))),
  };
}

function rowChangeFingerprint(row) {
  return {
    provider: row.provider,
    serviceCategory: row.serviceCategory,
    serviceName: row.serviceName,
    skuId: row.skuId,
    region: row.region,
    unit: row.unit,
    unitPriceUsd: row.unitPriceUsd,
    sourceEndpoint: row.sourceEndpoint,
    sourceRecordId: row.sourceRecordId,
    sourceRecordKey: row.sourceRecordKey,
    effectiveDate: row.effectiveDate,
    transformVersion: row.transformVersion,
  };
}

function requireRows(provider, rows) {
  if (rows.length === 0) {
    throw new Error(`${provider} provider API returned no normalizable pricing rows.`);
  }

  return rows;
}

function buildProviderSnapshot({
  provider,
  sourceSystem,
  sourceMode = 'provider-api',
  publicEndpoints,
  previousRows,
  currentRows,
}) {
  const changes = compareRows(previousRows, currentRows);

  return {
    provider,
    sourceSystem,
    sourceMode,
    catalogGeneratedAt: maxIso(currentRows.map((row) => row.fetchedAt)),
    snapshotSha256: sha256(canonicalJson(currentRows)),
    previousSnapshotSha256: sha256(canonicalJson(previousRows)),
    changedRowsSha256: sha256(canonicalJson(changes.changedRows)),
    rowCount: currentRows.length,
    previousRowCount: previousRows.length,
    changedRowCount:
      changes.changedRows.length + changes.addedRows.length + changes.removedRows.length,
    unchangedRowCount: changes.unchangedRows.length,
    addedSkuCount: changes.addedRows.length,
    removedSkuCount: changes.removedRows.length,
    priceChangedSkuCount: changes.priceChangedRows.length,
    sourceEndpointCount: new Set(currentRows.map((row) => row.sourceEndpoint)).size,
    sourceRecordCount: currentRows.length,
    regionCount: new Set(currentRows.map((row) => row.region)).size,
    serviceCategoryCount: new Set(currentRows.map((row) => row.serviceCategory)).size,
    sourcePayloadHashCoverage: ratioWithDigest(currentRows, 'sourcePayloadHash'),
    sourceRecordKeyCoverage: ratioWithText(currentRows, 'sourceRecordKey'),
    rowHashCoverage: ratioWithDigest(currentRows, 'rowSha256'),
    exactRowChangeVerified: true,
    rawCatalogPayloadExcluded: true,
    publicEndpoints,
    rowSamples: currentRows,
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

function runSnapshotEvidenceCheck({ root, evidencePath, requireLiveProvider = true }) {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/pricing-catalog-snapshot-evidence-check.mjs',
      requireLiveProvider ? '--require-live-provider' : '--require-provider-snapshot',
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
      ['Generated live pricing catalog evidence failed validation.', child.stdout, child.stderr]
        .map((item) => item.trim())
        .filter(Boolean)
        .join('\n'),
    );
  }

  return JSON.parse(child.stdout);
}

function awsOfferUrl(offerCode) {
  return `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${encodeURIComponent(
    offerCode,
  )}/current/index.json`;
}

function azureRetailPricesUrl(region) {
  const filter = [
    "priceType eq 'Consumption'",
    `armRegionName eq '${region.replace(/'/g, "''")}'`,
  ].join(' and ');

  return `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;
}

function gcpSkusUrl(serviceId) {
  return `https://cloudbilling.googleapis.com/v1/services/${encodeURIComponent(
    serviceId,
  )}/skus?pageSize=5000`;
}

function matchesAwsRegion(product, region) {
  const attributes = product?.attributes;
  const regionCode = stringValue(attributes?.regionCode);
  const location = stringValue(attributes?.location);

  return !regionCode || regionCode === region || location === region;
}

function sourceSystemForProvider(provider) {
  if (provider === 'aws') {
    return 'aws-price-list-bulk-offer';
  }
  if (provider === 'azure') {
    return 'azure-retail-prices-api';
  }
  if (provider === 'gcp') {
    return 'gcp-cloud-billing-catalog-api';
  }
  throw new Error(`Unsupported provider ${provider}.`);
}

function classifyServiceCategory(...values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();

  if (/compute|virtual machine|instance|ec2|vm\b/.test(text)) {
    return 'compute';
  }
  if (/storage|s3|disk|blob|snapshot|archive/.test(text)) {
    return 'storage';
  }
  if (/database|sql|rds|spanner|bigquery|cosmos/.test(text)) {
    return 'database';
  }
  if (/network|load balancer|cdn|nat|bandwidth|data transfer/.test(text)) {
    return 'network';
  }

  return 'general';
}

function moneyToNumber(value) {
  if (!plainObject(value)) {
    return Number.NaN;
  }

  const units = Number(value.units ?? 0);
  const nanos = Number(value.nanos ?? 0);

  return units + nanos / 1_000_000_000;
}

function redactUrl(value) {
  const parsed = new URL(value);
  for (const key of [...parsed.searchParams.keys()]) {
    if (/sig|signature|token|key|secret|sas/i.test(key)) {
      parsed.searchParams.set(key, 'REDACTED');
    }
  }

  return parsed.toString();
}

function toIsoDate(value, fallback) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return fallback;
}

function maxIso(values) {
  return new Date(Math.max(...values.map((value) => Date.parse(value)))).toISOString();
}

function ratioWithDigest(rows, key) {
  return rows.filter((row) => /^[a-f0-9]{64}$/.test(row[key])).length / rows.length;
}

function ratioWithText(rows, key) {
  return (
    rows.filter((row) => typeof row[key] === 'string' && row[key].length > 0).length / rows.length
  );
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (!plainObject(parsed)) {
      throw new Error('root value is not an object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
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

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function printResult(result) {
  if (result.mode === 'plan') {
    console.log('Pricing catalog live snapshot capture plan is ready.');
    console.log(`Live guard: ${result.liveGuardEnv}=${result.liveGuardRequiredValue}`);
    console.log(`Output directory: ${path.relative(process.cwd(), result.outputDir)}`);
    return;
  }
  if (result.mode === 'fixture-smoke') {
    console.log(
      `Pricing catalog live capture fixture smoke passed (${result.providerCount} providers; ${result.changedRowCount} changed rows).`,
    );
    console.log(`Evidence bundle: ${path.relative(process.cwd(), result.evidencePath)}`);
    return;
  }

  console.log(
    `Pricing catalog live snapshot capture passed (${result.providerCount} providers; ${result.changedRowCount} changed rows).`,
  );
  console.log(`Evidence bundle: ${path.relative(process.cwd(), result.evidencePath)}`);
}

function printHelp() {
  console.log(`Pricing catalog live snapshot capture ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-snapshot-capture.mjs [--plan]
  node scripts/pricing-catalog-live-snapshot-capture.mjs --fixture-smoke --fixture-dir <dir>
  ${LIVE_GUARD_ENV}=true node scripts/pricing-catalog-live-snapshot-capture.mjs --live --operator <name> --previous-evidence <bundle.json>

Options:
  --plan                         Print the live capture plan without network calls (default)
  --fixture-smoke                Replay provider-native fixture payloads through capture normalizers
  --fixture-dir <path>           Directory containing aws/azure/gcp previous/current fixture JSON
  --live                         Capture sanitized evidence from provider catalog APIs
  --previous-evidence <path>     Prior live-provider evidence bundle for exact row-change proof
  --operator <name>              Human/operator reviewer name for live evidence attestation
  --output-dir <path>            Directory for generated live evidence (default: ${DEFAULT_OUTPUT_DIR})
  --sample-limit <count>         Maximum normalized rows per provider (default: ${DEFAULT_SAMPLE_LIMIT})
  --aws-offer-code <code>        AWS public offer code (default: ${DEFAULT_AWS_OFFER_CODE})
  --aws-region <region>          AWS region filter (default: ${DEFAULT_AWS_REGION})
  --azure-region <region>        Azure Retail Prices region filter (default: ${DEFAULT_AZURE_REGION})
  --gcp-service-id <id>          GCP Cloud Billing service ID (default: ${DEFAULT_GCP_SERVICE_ID})
  --json                         Print machine-readable output
  --quiet                        Suppress human-readable success output
  --version                      Print version
  --help                         Show this help
`);
}
