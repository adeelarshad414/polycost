#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const EVIDENCE_SCHEMA = 'polycost-invoice-of-record-pilot-evidence/v1';
const SMOKE_SCHEMA = 'polycost-invoice-of-record-pricing-lineage-smoke/v1';
const DEFAULT_OUTPUT_DIR = '.tmp/invoice-of-record-pricing-lineage';
const DEFAULT_CAPTURED_AT = '2026-07-09T00:00:00.000Z';

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invoice-of-record pricing lineage smoke error: ${message}`);
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
    console.error(`Invoice-of-record pricing lineage smoke failed: ${message}`);
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
  const invoiceLineItems = buildInvoiceLineItems();
  const catalogRows = buildCatalogRows(capturedAt);
  const catalogSnapshot = {
    schemaVersion: 'polycost-pricing-catalog-lineage-snapshot/v1',
    provider: 'aws',
    sourceSystem: 'provider-catalog',
    generatedAt: capturedAt,
    rows: catalogRows,
  };
  const catalogSnapshotText = canonicalJson(catalogSnapshot);
  const catalogSnapshotSha256 = sha256(catalogSnapshotText);
  const normalizedActualsText = canonicalJson(invoiceLineItems);
  const normalizedActualsSha256 = sha256(normalizedActualsText);
  const billingExportManifest = {
    provider: 'aws',
    invoicePeriodStart: '2026-06-01T00:00:00.000Z',
    invoicePeriodEnd: '2026-06-30T23:59:59.000Z',
    rowCount: invoiceLineItems.length,
    normalizedActualsSha256,
    catalogSnapshotSha256,
  };
  const providerInvoiceMetadata = {
    provider: 'aws',
    invoiceIdRef: 'aws-invoice-lineage-smoke-2026-06',
    billingAccountRef: 'aws-account-ref-lineage-smoke',
    currency: 'USD',
    controlTotal: sum(invoiceLineItems.map((item) => item.costUsd)),
  };
  const invoiceSkuIds = [...new Set(invoiceLineItems.map((item) => item.skuId))].sort();
  const catalogSkuIds = [...new Set(catalogRows.map((item) => item.skuId))].sort();
  const matchedSkuIds = invoiceSkuIds.filter((skuId) => catalogSkuIds.includes(skuId));
  const pricingCatalog = {
    provider: 'aws',
    sourceSystem: 'provider-catalog',
    catalogGeneratedAt: capturedAt,
    catalogSnapshotSha256,
    catalogSnapshotRowsSha256: sha256(canonicalJson(catalogRows)),
    sourceEndpointCount: new Set(catalogRows.map((item) => item.sourceEndpoint)).size,
    sourceRecordCount: catalogRows.length,
    matchedInvoiceLineCount: invoiceLineItems.length,
    matchedSkuCount: matchedSkuIds.length,
    invoiceSkuCount: invoiceSkuIds.length,
    sourcePayloadHashCoverage: 1,
    invoiceSkuMatchCoverage: 1,
    pricingTraceCoverage: 1,
    rawCatalogRowsExcluded: true,
    matchedInvoiceSkuIds: matchedSkuIds,
    catalogRows,
    lineageAttestations: {
      exactSourceRecordMatched: true,
      refreshedCatalogSnapshotArchived: true,
      invoiceSkuMapReviewed: true,
      rawCatalogPayloadExcluded: true,
    },
  };
  const evidence = buildEvidence({
    capturedAt,
    providerInvoiceMetadata,
    billingExportManifest,
    normalizedActualsSha256,
    pricingCatalog,
    catalogSnapshotSha256,
  });
  const evidencePath = path.join(outputDir, 'invoice-of-record-pricing-lineage-evidence.json');
  const catalogSnapshotPath = path.join(outputDir, 'pricing-catalog-lineage-snapshot.json');
  const normalizedActualsPath = path.join(outputDir, 'normalized-actuals.json');

  await mkdir(outputDir, { recursive: true });
  await writeJson(catalogSnapshotPath, catalogSnapshot);
  await writeJson(normalizedActualsPath, invoiceLineItems);
  await writeJson(evidencePath, evidence);

  const check = runInvoiceEvidenceCheck({ root, evidencePath });

  return {
    ok: true,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    generatedFiles: {
      evidencePath,
      catalogSnapshotPath,
      normalizedActualsPath,
    },
    provider: 'aws',
    invoiceSkuCount: invoiceSkuIds.length,
    matchedSkuCount: matchedSkuIds.length,
    catalogSourceRecordCount: catalogRows.length,
    catalogSnapshotSha256,
    normalizedActualsSha256,
    verifiedProviderInvoicePilot: check.verifiedProviderInvoicePilot === true,
    caveats: [
      'This is a local pricing-lineage smoke for sanitized provider-invoice-pilot-shaped evidence.',
      'It proves the invoice evidence contract can bind exact SKU rows to a catalog snapshot; it is not a provider invoice renderer or legal invoice-grade certification.',
    ],
  };
}

function buildInvoiceLineItems() {
  return [
    {
      lineItemId: 'line-aws-compute-001',
      serviceName: 'AmazonEC2',
      skuId: 'SKU-AWS-EC2-M7I-LARGE-US-EAST-1',
      region: 'us-east-1',
      usageAmount: 730,
      usageUnit: 'Hrs',
      costUsd: 107,
      category: 'usage',
      sourceFingerprintSha256: sha256('line-aws-compute-001'),
    },
    {
      lineItemId: 'line-aws-storage-001',
      serviceName: 'AmazonS3',
      skuId: 'SKU-AWS-S3-STANDARD-US-EAST-1',
      region: 'us-east-1',
      usageAmount: 2048,
      usageUnit: 'GB-Mo',
      costUsd: 47.1,
      category: 'usage',
      sourceFingerprintSha256: sha256('line-aws-storage-001'),
    },
    {
      lineItemId: 'line-aws-egress-001',
      serviceName: 'AWSDataTransfer',
      skuId: 'SKU-AWS-DT-REGIONAL-EGRESS-US-EAST-1',
      region: 'us-east-1',
      usageAmount: 8192,
      usageUnit: 'GB',
      costUsd: 737.28,
      category: 'usage',
      sourceFingerprintSha256: sha256('line-aws-egress-001'),
    },
  ];
}

function buildCatalogRows(capturedAt) {
  const baseRows = [
    {
      provider: 'aws',
      serviceCategory: 'compute',
      serviceName: 'AmazonEC2',
      skuId: 'SKU-AWS-EC2-M7I-LARGE-US-EAST-1',
      skuDescription: 'm7i.large Linux shared tenancy in us-east-1',
      region: 'us-east-1',
      unit: 'Hrs',
      unitPriceUsd: 0.1465753425,
      sourceEndpoint:
        'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json',
      rawSourceRecordId: 'aws-price-list:AmazonEC2:SKU-AWS-EC2-M7I-LARGE-US-EAST-1',
      effectiveDate: '2026-06-01T00:00:00.000Z',
      fetchedAt: capturedAt,
    },
    {
      provider: 'aws',
      serviceCategory: 'storage',
      serviceName: 'AmazonS3',
      skuId: 'SKU-AWS-S3-STANDARD-US-EAST-1',
      skuDescription: 'S3 Standard storage in us-east-1',
      region: 'us-east-1',
      unit: 'GB-Mo',
      unitPriceUsd: 0.0229980469,
      sourceEndpoint:
        'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/index.json',
      rawSourceRecordId: 'aws-price-list:AmazonS3:SKU-AWS-S3-STANDARD-US-EAST-1',
      effectiveDate: '2026-06-01T00:00:00.000Z',
      fetchedAt: capturedAt,
    },
    {
      provider: 'aws',
      serviceCategory: 'network',
      serviceName: 'AWSDataTransfer',
      skuId: 'SKU-AWS-DT-REGIONAL-EGRESS-US-EAST-1',
      skuDescription: 'Regional internet egress in us-east-1',
      region: 'us-east-1',
      unit: 'GB',
      unitPriceUsd: 0.09,
      sourceEndpoint:
        'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/index.json',
      rawSourceRecordId: 'aws-price-list:AWSDataTransfer:SKU-AWS-DT-REGIONAL-EGRESS-US-EAST-1',
      effectiveDate: '2026-06-01T00:00:00.000Z',
      fetchedAt: capturedAt,
    },
  ];

  return baseRows.map((row) => ({
    ...row,
    sourceRecordKey: [
      row.provider,
      row.serviceCategory,
      row.skuId,
      row.region,
      row.unit,
      row.effectiveDate,
    ].join('|'),
    sourceRecordId: row.rawSourceRecordId,
    sourcePayloadHash: sha256(canonicalJson(row)),
    transformVersion: 'pricing-normalization-v3',
  }));
}

function buildEvidence({
  capturedAt,
  providerInvoiceMetadata,
  billingExportManifest,
  normalizedActualsSha256,
  pricingCatalog,
  catalogSnapshotSha256,
}) {
  const reconciliationEvidencePacket = {
    providerInvoiceMetadata,
    billingExportManifest,
    pricingCatalog,
  };

  return {
    schemaVersion: EVIDENCE_SCHEMA,
    bundleName: 'invoice-of-record-pricing-lineage-smoke-evidence',
    evidenceLevel: 'provider-invoice-pilot',
    productionClaim: false,
    capturedAt,
    environment: 'production',
    provider: 'aws',
    providerInvoice: {
      invoiceIdRef: providerInvoiceMetadata.invoiceIdRef,
      billingAccountRef: providerInvoiceMetadata.billingAccountRef,
      invoicePeriodStart: '2026-06-01T00:00:00.000Z',
      invoicePeriodEnd: '2026-06-30T23:59:59.000Z',
      invoiceDigestSha256: sha256(canonicalJson(providerInvoiceMetadata)),
      currency: 'USD',
      controlTotal: providerInvoiceMetadata.controlTotal,
      invoiceOfRecordArchived: true,
      controlTotalVerified: true,
      accountScopeDocumented: true,
      rawInvoiceBytesExcluded: true,
    },
    billingExport: {
      sourceSystem: 'aws-cur-sanitized-lineage-smoke',
      exportManifestSha256: sha256(canonicalJson(billingExportManifest)),
      normalizedActualsSha256,
      rowCount: billingExportManifest.rowCount,
      sourceFingerprintCoverage: 1,
      exportPeriodMatchesInvoice: true,
      rawExportRowsExcluded: true,
    },
    reconciliation: {
      reconciliationId: randomUUID(),
      readiness: 'review-ready',
      usageComparableVariance: 0,
      usageComparableVariancePercent: 0,
      checks: {
        providerInvoiceControlTotals: 'verified',
        billingExportLineage: 'verified',
        privatePricing: 'verified',
        taxTreatment: 'verified',
        creditsAndRefunds: 'verified',
        supportAndFees: 'verified',
        marketplaceCharges: 'verified',
        commitmentInventory: 'verified',
        commitmentAmortization: 'verified',
        allocationTags: 'verified',
        currencyConversion: 'verified',
        skuMapping: 'verified',
      },
    },
    pricingCatalog,
    privatePricing: {
      rateCardDigestSha256: catalogSnapshotSha256,
      contractDigestSha256: sha256('sanitized-contract-digest-lineage-smoke'),
      discountScheduleDigestSha256: sha256('sanitized-discount-schedule-lineage-smoke'),
      negotiatedDiscountsReviewed: true,
      enterpriseAgreementReviewed: true,
      privateOffersReviewed: true,
    },
    taxAndAdjustments: {
      taxTreatmentDigestSha256: sha256('sanitized-tax-treatment-lineage-smoke'),
      categories: [
        'tax',
        'credit',
        'support',
        'marketplace',
        'refund',
        'fee',
        'enterprise-adjustment',
      ],
      taxesClassified: true,
      creditsClassified: true,
      supportFeesClassified: true,
      marketplaceChargesClassified: true,
      refundsClassified: true,
    },
    commitments: {
      inventoryDigestSha256: sha256('sanitized-commitment-inventory-lineage-smoke'),
      amortizationDigestSha256: sha256('sanitized-commitment-amortization-lineage-smoke'),
      allocationDigestSha256: sha256('sanitized-commitment-allocation-lineage-smoke'),
      reservedInstancesReviewed: true,
      savingsPlansReviewed: true,
      committedUseDiscountsReviewed: true,
      unusedCommitmentsClassified: true,
    },
    artifacts: {
      providerInvoiceSha256: sha256(canonicalJson(providerInvoiceMetadata)),
      billingExportManifestSha256: sha256(canonicalJson(billingExportManifest)),
      normalizedActualsSha256,
      reconciliationEvidencePacketSha256: sha256(canonicalJson(reconciliationEvidencePacket)),
      artifactGovernanceManifestSha256: sha256('sanitized-governance-manifest-lineage-smoke'),
      providerRetentionProofSha256: sha256('sanitized-retention-proof-lineage-smoke'),
      notaryReceiptSha256: sha256('sanitized-notary-receipt-lineage-smoke'),
      auditExportSha256: sha256('sanitized-audit-export-lineage-smoke'),
    },
    operatorAttestations: {
      providerInvoiceReviewed: true,
      financeReviewerApproved: true,
      securityReviewerApproved: true,
      rawSecretsExcluded: true,
      rawInvoiceBytesExcluded: true,
      customerPiiRedacted: true,
      productionClaimedByPolyCost: false,
      operator: 'pricing-lineage-smoke',
      financeReviewer: 'finance-lineage-smoke',
      securityReviewer: 'security-lineage-smoke',
    },
    caveats: [
      'This is a local pricing-lineage smoke for sanitized provider-invoice-pilot-shaped evidence.',
      'It proves exact SKU lineage can be attached to invoice pilot evidence, not provider invoice rendering or legal invoice-grade certification.',
    ],
  };
}

function runInvoiceEvidenceCheck({ root, evidencePath }) {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/invoice-of-record-pilot-evidence-check.mjs',
      '--require-provider-invoice',
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
        'Generated invoice pricing lineage evidence failed strict validation.',
        child.stdout,
        child.stderr,
      ]
        .map((item) => item.trim())
        .filter(Boolean)
        .join('\n'),
    );
  }

  const result = JSON.parse(child.stdout);
  if (result.verifiedProviderInvoicePilot !== true) {
    throw new Error('Generated invoice evidence did not verify as provider invoice pilot proof.');
  }

  return result;
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
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

function printResult(result) {
  console.log(
    `Invoice-of-record pricing lineage smoke passed (${result.provider}; ${result.matchedSkuCount}/${result.invoiceSkuCount} SKUs).`,
  );
  console.log(
    `Evidence bundle: ${path.relative(process.cwd(), result.generatedFiles.evidencePath)}`,
  );
  console.log(
    `Catalog snapshot: ${path.relative(process.cwd(), result.generatedFiles.catalogSnapshotPath)}`,
  );
}

function printHelp() {
  console.log(`Invoice-of-record pricing lineage smoke ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-of-record-pricing-lineage-smoke.mjs [options]

Options:
  --output-dir <path>    Directory for generated evidence (default: ${DEFAULT_OUTPUT_DIR})
  --captured-at <iso>    Deterministic capture timestamp override
  --json                 Print machine-readable smoke output
  --quiet                Suppress human-readable success output
  --version              Print version
  --help                 Show this help
`);
}
