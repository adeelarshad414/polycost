#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const EVIDENCE_SCHEMA = 'polycost-invoice-of-record-pilot-evidence/v1';
const CHECK_SCHEMA = 'polycost-invoice-of-record-pilot-evidence-check/v1';
const DEFAULT_EVIDENCE = 'docs/operations/evidence/invoice-of-record-pilot-evidence.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_LEVELS = new Set(['example-schema', 'provider-invoice-pilot']);
const SUPPORTED_PROVIDERS = new Set(['example', 'aws', 'azure', 'gcp', 'multi-cloud']);
const SUPPORTED_ENVIRONMENTS = new Set(['staging', 'production']);
const REQUIRED_RECONCILIATION_CHECKS = new Set([
  'providerInvoiceControlTotals',
  'billingExportLineage',
  'privatePricing',
  'taxTreatment',
  'creditsAndRefunds',
  'supportAndFees',
  'marketplaceCharges',
  'commitmentInventory',
  'commitmentAmortization',
  'allocationTags',
  'currencyConversion',
  'skuMapping',
]);
const REQUIRED_NON_USAGE_CATEGORIES = new Set([
  'tax',
  'credit',
  'support',
  'marketplace',
  'refund',
  'fee',
  'enterprise-adjustment',
]);
const REQUIRED_ARTIFACT_DIGESTS = [
  'providerInvoiceSha256',
  'billingExportManifestSha256',
  'normalizedActualsSha256',
  'reconciliationEvidencePacketSha256',
  'artifactGovernanceManifestSha256',
  'providerRetentionProofSha256',
  'notaryReceiptSha256',
  'auditExportSha256',
];
const REQUIRED_PRICING_CATALOG_ATTESTATIONS = [
  'exactSourceRecordMatched',
  'refreshedCatalogSnapshotArchived',
  'invoiceSkuMapReviewed',
  'rawCatalogPayloadExcluded',
];
const REQUIRED_ATTESTATIONS = [
  'providerInvoiceReviewed',
  'financeReviewerApproved',
  'securityReviewerApproved',
  'rawSecretsExcluded',
  'rawInvoiceBytesExcluded',
  'customerPiiRedacted',
  'productionClaimedByPolyCost',
];
const FORBIDDEN_RAW_KEYS = [
  /^rawInvoice$/i,
  /^rawInvoiceBytes$/i,
  /^rawBillingExport$/i,
  /^rawProviderResponse$/i,
  /^rawProviderResponses$/i,
  /^authorization$/i,
  /^authorizationHeader$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^sessionCookie$/i,
  /^password$/i,
  /^privateKey$/i,
  /^clientSecret$/i,
  /^secretAccessKey$/i,
  /^sasToken$/i,
];
const SECRET_VALUE_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /CHANGE_ME_DEV_ONLY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsig=[A-Za-z0-9%._~+/=-]{12,}/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invoice-of-record pilot evidence check error: ${message}`);
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
  const result = await checkEvidence(args);

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
          schemaVersion: CHECK_SCHEMA,
          evidencePath: args.evidencePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Invoice-of-record pilot evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    evidencePath: DEFAULT_EVIDENCE,
    requireProviderInvoice: false,
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
    if (arg === '--require-provider-invoice') {
      options.requireProviderInvoice = true;
      continue;
    }
    if (arg.startsWith('--evidence=')) {
      options.evidencePath = arg.slice('--evidence='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.evidencePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one invoice-of-record evidence bundle path.');
  }
  if (!options.evidencePath) {
    throw new Error('Evidence path cannot be empty.');
  }

  return options;
}

async function checkEvidence(options) {
  const root = process.cwd();
  const evidencePath = path.resolve(root, options.evidencePath);
  const evidence = parseJsonObject(await readFile(evidencePath, 'utf8'), options.evidencePath);
  const failures = [];
  const evidenceLevel = stringValue(evidence.evidenceLevel);
  const providerInvoice = plainObject(evidence.providerInvoice);
  const billingExport = plainObject(evidence.billingExport);
  const reconciliation = plainObject(evidence.reconciliation);
  const privatePricing = plainObject(evidence.privatePricing);
  const taxAndAdjustments = plainObject(evidence.taxAndAdjustments);
  const commitments = plainObject(evidence.commitments);
  const artifacts = plainObject(evidence.artifacts);
  const pricingCatalog = plainObject(evidence.pricingCatalog);
  const operatorAttestations = plainObject(evidence.operatorAttestations);
  const requiresProviderInvoice =
    options.requireProviderInvoice || evidenceLevel === 'provider-invoice-pilot';

  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    failures.push(`evidence.schemaVersion must be ${EVIDENCE_SCHEMA}.`);
  }
  if (!SUPPORTED_LEVELS.has(evidenceLevel)) {
    failures.push('evidence.evidenceLevel must be example-schema or provider-invoice-pilot.');
  }
  if (!SUPPORTED_PROVIDERS.has(evidence.provider)) {
    failures.push('evidence.provider must be example, aws, azure, gcp, or multi-cloud.');
  }
  if (!SUPPORTED_ENVIRONMENTS.has(evidence.environment)) {
    failures.push('evidence.environment must be staging or production.');
  }
  if (!isValidDateString(evidence.capturedAt)) {
    failures.push('evidence.capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (evidence.productionClaim === true) {
    failures.push(
      'evidence.productionClaim must remain false; this validates pilot evidence, not invoice-system certification.',
    );
  }

  failures.push(...findForbiddenRawPayloads(evidence));
  failures.push(...findSecretMaterial(evidence));
  failures.push(...validateProviderInvoice(providerInvoice));
  failures.push(...validateBillingExport(billingExport));
  failures.push(...validateReconciliation(reconciliation));
  failures.push(...validatePrivatePricing(privatePricing));
  failures.push(...validateTaxAndAdjustments(taxAndAdjustments));
  failures.push(...validateCommitments(commitments));
  failures.push(...validateArtifacts(artifacts));
  failures.push(
    ...validatePricingCatalog(pricingCatalog, {
      provider: evidence.provider,
      requireProviderInvoice: requiresProviderInvoice,
    }),
  );
  failures.push(...validateOperatorAttestations(operatorAttestations));

  if (requiresProviderInvoice) {
    failures.push(...validateProviderInvoicePilot(evidence, operatorAttestations));
  }

  const verifiedProviderInvoicePilot =
    failures.length === 0 &&
    evidenceLevel === 'provider-invoice-pilot' &&
    providerInvoice?.invoiceOfRecordArchived === true &&
    reconciliation?.readiness === 'review-ready';

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    evidencePath,
    evidenceLevel,
    provider: evidence.provider,
    environment: evidence.environment,
    productionClaim: evidence.productionClaim === true,
    reconciliationId: reconciliation?.reconciliationId,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedProviderInvoicePilot,
    providerInvoiceRequired: evidenceLevel !== 'provider-invoice-pilot',
    pricingCatalogLinked: Boolean(pricingCatalog),
    pricingCatalogSnapshotSha256: pricingCatalog?.catalogSnapshotSha256,
    pricingCatalogMatchedSkuCount: pricingCatalog?.matchedSkuCount,
    pricingCatalogSourceRecordCount: pricingCatalog?.sourceRecordCount,
    requiredControlCount: REQUIRED_RECONCILIATION_CHECKS.size,
    nonUsageCategoryCount: Array.isArray(taxAndAdjustments?.categories)
      ? taxAndAdjustments.categories.length
      : 0,
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the invoice-of-record evidence contract with sanitized sample data; it is not provider invoice proof.'
        : 'This validates archived finance-pilot evidence; provider invoice legal interpretation and system-of-record duties remain customer-owned.',
      'Raw invoices, raw billing exports, private contracts, customer PII, credentials, and authorization headers must stay out of evidence bundles.',
    ],
    failures,
  };
}

function validateProviderInvoice(providerInvoice) {
  if (!providerInvoice) {
    return ['providerInvoice must be an object.'];
  }

  const failures = [];
  for (const key of [
    'invoiceIdRef',
    'billingAccountRef',
    'invoicePeriodStart',
    'invoicePeriodEnd',
  ]) {
    if (!hasValue(providerInvoice[key])) {
      failures.push(`providerInvoice.${key} is required.`);
    }
  }
  if (!isValidDateString(providerInvoice.invoicePeriodStart)) {
    failures.push('providerInvoice.invoicePeriodStart must be a valid ISO-8601 date.');
  }
  if (!isValidDateString(providerInvoice.invoicePeriodEnd)) {
    failures.push('providerInvoice.invoicePeriodEnd must be a valid ISO-8601 date.');
  }
  if (!hasSha256(providerInvoice.invoiceDigestSha256)) {
    failures.push('providerInvoice.invoiceDigestSha256 must be a SHA-256 digest.');
  }
  if (!hasValue(providerInvoice.currency) || providerInvoice.currency.length !== 3) {
    failures.push('providerInvoice.currency must be a three-letter currency code.');
  }
  if (!isFiniteNumber(providerInvoice.controlTotal)) {
    failures.push('providerInvoice.controlTotal must be a finite number.');
  }
  for (const key of [
    'invoiceOfRecordArchived',
    'controlTotalVerified',
    'accountScopeDocumented',
    'rawInvoiceBytesExcluded',
  ]) {
    if (providerInvoice[key] !== true) {
      failures.push(`providerInvoice.${key} must be true.`);
    }
  }

  return failures;
}

function validateBillingExport(billingExport) {
  if (!billingExport) {
    return ['billingExport must be an object.'];
  }

  const failures = [];
  for (const key of ['sourceSystem', 'exportManifestSha256', 'normalizedActualsSha256']) {
    if (!hasValue(billingExport[key])) {
      failures.push(`billingExport.${key} is required.`);
    }
  }
  for (const key of ['exportManifestSha256', 'normalizedActualsSha256']) {
    if (!hasSha256(billingExport[key])) {
      failures.push(`billingExport.${key} must be a SHA-256 digest.`);
    }
  }
  if (!Number.isInteger(billingExport.rowCount) || billingExport.rowCount <= 0) {
    failures.push('billingExport.rowCount must be a positive integer.');
  }
  if (!isRatioAtLeast(billingExport.sourceFingerprintCoverage, 0.95)) {
    failures.push('billingExport.sourceFingerprintCoverage must be at least 0.95.');
  }
  if (billingExport.exportPeriodMatchesInvoice !== true) {
    failures.push('billingExport.exportPeriodMatchesInvoice must be true.');
  }
  if (billingExport.rawExportRowsExcluded !== true) {
    failures.push('billingExport.rawExportRowsExcluded must be true.');
  }

  return failures;
}

function validateReconciliation(reconciliation) {
  if (!reconciliation) {
    return ['reconciliation must be an object.'];
  }

  const failures = [];
  if (!hasValue(reconciliation.reconciliationId)) {
    failures.push('reconciliation.reconciliationId is required.');
  }
  if (!['blocked', 'review-ready'].includes(reconciliation.readiness)) {
    failures.push('reconciliation.readiness must be blocked or review-ready.');
  }
  if (!isFiniteNumber(reconciliation.usageComparableVariance)) {
    failures.push('reconciliation.usageComparableVariance must be a finite number.');
  }
  if (!isFiniteNumber(reconciliation.usageComparableVariancePercent)) {
    failures.push('reconciliation.usageComparableVariancePercent must be a finite number.');
  }
  if (Math.abs(reconciliation.usageComparableVariancePercent) > 5) {
    failures.push('reconciliation.usageComparableVariancePercent must be within +/-5%.');
  }

  const checks = plainObject(reconciliation.checks);
  if (!checks) {
    failures.push('reconciliation.checks must be an object.');
    return failures;
  }
  for (const checkName of REQUIRED_RECONCILIATION_CHECKS) {
    if (checks[checkName] !== 'verified') {
      failures.push(`reconciliation.checks.${checkName} must be verified.`);
    }
  }

  return failures;
}

function validatePrivatePricing(privatePricing) {
  if (!privatePricing) {
    return ['privatePricing must be an object.'];
  }

  const failures = validateDigestFields(privatePricing, [
    'rateCardDigestSha256',
    'contractDigestSha256',
    'discountScheduleDigestSha256',
  ]);
  for (const key of [
    'negotiatedDiscountsReviewed',
    'enterpriseAgreementReviewed',
    'privateOffersReviewed',
  ]) {
    if (privatePricing[key] !== true) {
      failures.push(`privatePricing.${key} must be true.`);
    }
  }

  return failures;
}

function validateTaxAndAdjustments(taxAndAdjustments) {
  if (!taxAndAdjustments) {
    return ['taxAndAdjustments must be an object.'];
  }

  const failures = validateDigestFields(taxAndAdjustments, ['taxTreatmentDigestSha256']);
  const categories = new Set(
    Array.isArray(taxAndAdjustments.categories) ? taxAndAdjustments.categories : [],
  );
  for (const category of REQUIRED_NON_USAGE_CATEGORIES) {
    if (!categories.has(category)) {
      failures.push(`taxAndAdjustments.categories must include ${category}.`);
    }
  }
  for (const key of [
    'taxesClassified',
    'creditsClassified',
    'supportFeesClassified',
    'marketplaceChargesClassified',
    'refundsClassified',
  ]) {
    if (taxAndAdjustments[key] !== true) {
      failures.push(`taxAndAdjustments.${key} must be true.`);
    }
  }

  return failures;
}

function validateCommitments(commitments) {
  if (!commitments) {
    return ['commitments must be an object.'];
  }

  const failures = validateDigestFields(commitments, [
    'inventoryDigestSha256',
    'amortizationDigestSha256',
    'allocationDigestSha256',
  ]);
  for (const key of [
    'reservedInstancesReviewed',
    'savingsPlansReviewed',
    'committedUseDiscountsReviewed',
    'unusedCommitmentsClassified',
  ]) {
    if (commitments[key] !== true) {
      failures.push(`commitments.${key} must be true.`);
    }
  }

  return failures;
}

function validateArtifacts(artifacts) {
  if (!artifacts) {
    return ['artifacts must be an object.'];
  }

  return validateDigestFields(artifacts, REQUIRED_ARTIFACT_DIGESTS);
}

function validatePricingCatalog(pricingCatalog, options) {
  if (!pricingCatalog) {
    return options.requireProviderInvoice
      ? ['pricingCatalog must be present for provider invoice pilot evidence.']
      : [];
  }

  const failures = [];
  if (!hasValue(pricingCatalog.provider)) {
    failures.push('pricingCatalog.provider is required.');
  } else if (
    pricingCatalog.provider !== options.provider &&
    options.provider !== 'multi-cloud' &&
    options.provider !== 'example'
  ) {
    failures.push('pricingCatalog.provider must match evidence.provider.');
  }
  if (!hasValue(pricingCatalog.sourceSystem)) {
    failures.push('pricingCatalog.sourceSystem is required.');
  }
  if (options.requireProviderInvoice && pricingCatalog.sourceSystem === 'example') {
    failures.push('pricingCatalog.sourceSystem cannot be example for provider invoice evidence.');
  }
  if (!isValidDateString(pricingCatalog.catalogGeneratedAt)) {
    failures.push('pricingCatalog.catalogGeneratedAt must be a valid ISO-8601 timestamp.');
  }
  for (const key of ['catalogSnapshotSha256', 'catalogSnapshotRowsSha256']) {
    if (!hasSha256(pricingCatalog[key])) {
      failures.push(`pricingCatalog.${key} must be a SHA-256 digest.`);
    }
  }
  for (const key of [
    'sourceEndpointCount',
    'sourceRecordCount',
    'matchedInvoiceLineCount',
    'matchedSkuCount',
    'invoiceSkuCount',
  ]) {
    if (!Number.isInteger(pricingCatalog[key]) || pricingCatalog[key] <= 0) {
      failures.push(`pricingCatalog.${key} must be a positive integer.`);
    }
  }
  for (const key of [
    'sourcePayloadHashCoverage',
    'invoiceSkuMatchCoverage',
    'pricingTraceCoverage',
  ]) {
    if (!isRatioAtLeast(pricingCatalog[key], options.requireProviderInvoice ? 1 : 0.95)) {
      failures.push(
        `pricingCatalog.${key} must be ${options.requireProviderInvoice ? '1' : 'at least 0.95'}.`,
      );
    }
  }
  if (pricingCatalog.rawCatalogRowsExcluded !== true) {
    failures.push('pricingCatalog.rawCatalogRowsExcluded must be true.');
  }

  const matchedInvoiceSkuIds = Array.isArray(pricingCatalog.matchedInvoiceSkuIds)
    ? pricingCatalog.matchedInvoiceSkuIds
    : [];
  if (matchedInvoiceSkuIds.length !== pricingCatalog.matchedSkuCount) {
    failures.push('pricingCatalog.matchedInvoiceSkuIds length must equal matchedSkuCount.');
  }
  if (pricingCatalog.matchedSkuCount !== pricingCatalog.invoiceSkuCount) {
    failures.push('pricingCatalog.matchedSkuCount must equal invoiceSkuCount.');
  }

  const rows = Array.isArray(pricingCatalog.catalogRows) ? pricingCatalog.catalogRows : [];
  if (rows.length !== pricingCatalog.sourceRecordCount) {
    failures.push('pricingCatalog.catalogRows length must equal sourceRecordCount.');
  }
  for (const [index, row] of rows.entries()) {
    failures.push(...validateCatalogRow(row, index, options.provider));
  }

  const lineageAttestations = plainObject(pricingCatalog.lineageAttestations);
  if (!lineageAttestations) {
    failures.push('pricingCatalog.lineageAttestations must be an object.');
  } else {
    for (const key of REQUIRED_PRICING_CATALOG_ATTESTATIONS) {
      if (lineageAttestations[key] !== true) {
        failures.push(`pricingCatalog.lineageAttestations.${key} must be true.`);
      }
    }
  }

  return failures;
}

function validateCatalogRow(row, index, evidenceProvider) {
  const failures = [];
  if (!plainObject(row)) {
    return [`pricingCatalog.catalogRows[${index}] must be an object.`];
  }
  for (const key of [
    'provider',
    'serviceCategory',
    'serviceName',
    'skuId',
    'region',
    'unit',
    'sourceEndpoint',
    'sourceRecordId',
    'sourceRecordKey',
    'sourcePayloadHash',
    'transformVersion',
  ]) {
    if (!hasValue(row[key])) {
      failures.push(`pricingCatalog.catalogRows[${index}].${key} is required.`);
    }
  }
  if (
    evidenceProvider !== 'multi-cloud' &&
    evidenceProvider !== 'example' &&
    row.provider !== evidenceProvider
  ) {
    failures.push(`pricingCatalog.catalogRows[${index}].provider must match evidence.provider.`);
  }
  if (!isFiniteNumber(row.unitPriceUsd) || row.unitPriceUsd < 0) {
    failures.push(
      `pricingCatalog.catalogRows[${index}].unitPriceUsd must be a non-negative number.`,
    );
  }
  if (!hasSha256(row.sourcePayloadHash)) {
    failures.push(
      `pricingCatalog.catalogRows[${index}].sourcePayloadHash must be a SHA-256 digest.`,
    );
  }
  if (!isValidDateString(row.fetchedAt)) {
    failures.push(`pricingCatalog.catalogRows[${index}].fetchedAt must be ISO-8601.`);
  }
  if (!isValidDateString(row.effectiveDate)) {
    failures.push(`pricingCatalog.catalogRows[${index}].effectiveDate must be ISO-8601.`);
  }

  return failures;
}

function validateOperatorAttestations(operatorAttestations) {
  if (!operatorAttestations) {
    return ['operatorAttestations must be an object.'];
  }

  const failures = [];
  for (const key of REQUIRED_ATTESTATIONS) {
    if (key === 'productionClaimedByPolyCost') {
      if (operatorAttestations[key] !== false) {
        failures.push('operatorAttestations.productionClaimedByPolyCost must be false.');
      }
      continue;
    }
    if (operatorAttestations[key] !== true) {
      failures.push(`operatorAttestations.${key} must be true.`);
    }
  }
  for (const key of ['operator', 'financeReviewer', 'securityReviewer']) {
    if (!hasValue(operatorAttestations[key])) {
      failures.push(`operatorAttestations.${key} is required.`);
    }
  }

  return failures;
}

function validateProviderInvoicePilot(evidence, operatorAttestations) {
  const failures = [];

  if (evidence.evidenceLevel !== 'provider-invoice-pilot') {
    failures.push(
      'evidenceLevel must be provider-invoice-pilot when --require-provider-invoice is used.',
    );
  }
  if (evidence.provider === 'example') {
    failures.push('evidence.provider cannot be example for provider invoice pilot evidence.');
  }
  if (evidence.environment !== 'production') {
    failures.push('provider invoice pilot evidence must come from production.');
  }
  for (const key of ['operator', 'financeReviewer', 'securityReviewer']) {
    if (operatorAttestations?.[key] === 'example-only') {
      failures.push(`operatorAttestations.${key} must name a real reviewer.`);
    }
  }

  return failures;
}

function validateDigestFields(object, keys) {
  const failures = [];
  for (const key of keys) {
    if (!hasSha256(object[key])) {
      failures.push(`${key} must be a SHA-256 digest.`);
    }
  }
  return failures;
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (!plainObject(parsed)) {
      throw new Error('expected a JSON object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hasValue(value) {
  return stringValue(value) !== undefined;
}

function isValidDateString(value) {
  return hasValue(value) && !Number.isNaN(Date.parse(value));
}

function hasSha256(value) {
  return hasValue(value) && SHA256_PATTERN.test(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRatioAtLeast(value, floor) {
  return typeof value === 'number' && Number.isFinite(value) && value >= floor && value <= 1;
}

function findForbiddenRawPayloads(value, pathSegments = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findForbiddenRawPayloads(item, [...pathSegments, `[${index}]`]));
    }
    return failures;
  }

  if (!plainObject(value)) {
    return failures;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...pathSegments, key];
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(`${childPath.join('.')} must not be present in sanitized evidence.`);
      continue;
    }
    failures.push(...findForbiddenRawPayloads(child, childPath));
  }

  return failures;
}

function findSecretMaterial(value, pathSegments = []) {
  const failures = [];

  if (typeof value === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        failures.push(`${pathSegments.join('.') || '<root>'} appears to contain secret material.`);
      }
    }
    return failures;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findSecretMaterial(item, [...pathSegments, `[${index}]`]));
    }
    return failures;
  }

  if (plainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      failures.push(...findSecretMaterial(child, [...pathSegments, key]));
    }
  }

  return failures;
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `Invoice-of-record pilot evidence check passed (${result.evidenceLevel}; controls ${result.requiredControlCount}).`,
    );
    if (result.verifiedExampleSchema) {
      console.log(
        'Verified sample schema only. Use --require-provider-invoice for provider invoice pilot proof.',
      );
    }
    if (result.verifiedProviderInvoicePilot) {
      console.log('Verified provider invoice pilot evidence.');
    }
    return;
  }

  console.error('Invoice-of-record pilot evidence check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Usage: npm run invoice:record:evidence:check -- [options] [bundle.json]

Validates sanitized provider invoice-of-record pilot evidence for invoice-grade readiness.

Options:
  --evidence=<path>             Evidence bundle path (default: ${DEFAULT_EVIDENCE})
  --require-provider-invoice    Require real provider-invoice pilot evidence
  --json                        Print JSON output
  --quiet                       Suppress human-readable success output
  --version                     Print version
  --help                        Show this help
`);
}
