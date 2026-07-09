#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const BUNDLE_SCHEMA = 'polycost-invoice-artifact-rehearsal-evidence/v1';
const CHECK_SCHEMA = 'polycost-invoice-artifact-rehearsal-evidence-check/v1';
const DEFAULT_BUNDLE = 'docs/operations/evidence/invoice-artifact-rehearsal-evidence.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_ARCHIVES = ['scannerCanary', 'notaryReceiverCanary', 'auditExportCanary'];
const SUPPORTED_PROVIDERS = new Set(['aws-s3', 'azure-blob', 'gcp-gcs']);
const SENSITIVE_KEY_PATTERNS = [
  /secret_access_key/i,
  /private_key/i,
  /sas_token/i,
  /access_token/i,
  /password/i,
  /^token$/i,
  /hmac_secret/i,
  /receipt_signing_secret/i,
  /webhook_secret/i,
];
const SENSITIVE_VALUE_PATTERNS = [/BEGIN PRIVATE KEY/, /CHANGE_ME_DEV_ONLY/i, /AKIA[0-9A-Z]{16}/];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invoice artifact rehearsal evidence check error: ${message}`);
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
  const result = await checkEvidenceBundle(args);

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
          bundlePath: args.bundlePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Invoice artifact rehearsal evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    bundlePath: DEFAULT_BUNDLE,
    requireLive: false,
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
    if (arg === '--require-live') {
      options.requireLive = true;
      continue;
    }
    if (arg.startsWith('--bundle=')) {
      options.bundlePath = arg.slice('--bundle='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.bundlePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one evidence bundle path.');
  }
  if (!options.bundlePath) {
    throw new Error('Evidence bundle path cannot be empty.');
  }

  return options;
}

async function checkEvidenceBundle(options) {
  const root = process.cwd();
  const bundlePath = path.resolve(root, options.bundlePath);
  const bundle = parseJsonObject(await readFile(bundlePath, 'utf8'), options.bundlePath);
  const failures = [];

  if (bundle.schemaVersion !== BUNDLE_SCHEMA) {
    failures.push(`schemaVersion must be ${BUNDLE_SCHEMA}.`);
  }

  const evidenceLevel = stringValue(bundle.evidenceLevel);
  const provider = stringValue(bundle.provider);
  const environment = stringValue(bundle.environment);
  const profileCheck = plainObject(bundle.profileCheck);
  const providerCredentialsStrict = plainObject(bundle.providerCredentialsStrict);
  const providerRetentionProof = plainObject(bundle.providerRetentionProof);
  const scannerWebhookSmoke = plainObject(bundle.scannerWebhookSmoke);
  const notaryWebhookSmoke = plainObject(bundle.notaryWebhookSmoke);
  const auditExportSmoke = plainObject(bundle.auditExportSmoke);
  const operatorAttestations = plainObject(bundle.operatorAttestations);
  const canaryArchives = Array.isArray(bundle.canaryArchives) ? bundle.canaryArchives : [];

  if (!['example-schema', 'live-target'].includes(evidenceLevel)) {
    failures.push('evidenceLevel must be example-schema or live-target.');
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    failures.push('provider must be aws-s3, azure-blob, or gcp-gcs.');
  }
  if (!['staging', 'production'].includes(environment)) {
    failures.push('environment must be staging or production.');
  }
  if (!isValidDateString(bundle.capturedAt)) {
    failures.push('capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (bundle.productionClaim === true) {
    failures.push('productionClaim must remain false; this checker validates evidence only.');
  }

  failures.push(...findSecretMaterial(bundle));
  failures.push(...validateProfileCheck(profileCheck, provider));
  failures.push(...validateProviderCredentialCheck(providerCredentialsStrict));
  failures.push(...validateProviderRetentionProof(providerRetentionProof, provider, profileCheck));
  failures.push(...validateScannerSmoke(scannerWebhookSmoke));
  failures.push(...validateNotarySmoke(notaryWebhookSmoke));
  failures.push(...validateAuditSmoke(auditExportSmoke));
  failures.push(...validateCanaryArchives(canaryArchives, bundle, operatorAttestations));

  const profileResult = await validateProfileReferences({
    root,
    bundle,
    provider,
    providerRetentionProof,
    canaryArchives,
  });
  failures.push(...profileResult.failures);

  if (options.requireLive || evidenceLevel === 'live-target') {
    failures.push(...validateLiveAttestations(operatorAttestations));
  }

  const verifiedLiveEvidence =
    failures.length === 0 &&
    evidenceLevel === 'live-target' &&
    operatorAttestations?.liveRunExecuted === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    bundlePath,
    evidenceLevel,
    provider,
    environment,
    profileName: stringValue(bundle.profileName ?? profileCheck?.profileName),
    productionClaim: bundle.productionClaim === true,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedLiveEvidence,
    checkCount: 9 + REQUIRED_ARCHIVES.length,
    liveEvidenceRequired: evidenceLevel !== 'live-target',
    ...(profileResult.profilePath ? { profilePath: profileResult.profilePath } : {}),
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the evidence bundle contract with sanitized sample data; it is not live cloud proof.'
        : 'This validates archived operator evidence, but invoice-grade conclusions still depend on provider invoices of record and legal controls.',
      'Raw secrets must stay in Vault/runtime env and must not be copied into this evidence bundle.',
    ],
    failures,
  };
}

function validateProfileCheck(profileCheck, provider) {
  const failures = [];

  if (!profileCheck) {
    return ['profileCheck must be an object.'];
  }
  if (profileCheck.schemaVersion !== 'polycost-invoice-artifact-production-profile-check/v1') {
    failures.push('profileCheck.schemaVersion is invalid.');
  }
  if (profileCheck.ok !== true || profileCheck.verifiedConfigEvidence !== true) {
    failures.push('profileCheck must be ok and verifiedConfigEvidence=true.');
  }
  if (profileCheck.provider !== provider) {
    failures.push('profileCheck.provider must match bundle.provider.');
  }
  if (profileCheck.productionClaim === true) {
    failures.push('profileCheck.productionClaim must be false.');
  }
  if (profileCheck.liveCloudEvidenceRequired !== true) {
    failures.push('profileCheck.liveCloudEvidenceRequired must remain true.');
  }
  if (!hasSha256(profileCheck.providerRetentionProofSha256)) {
    failures.push('profileCheck.providerRetentionProofSha256 must be a SHA-256 digest.');
  }
  if (Array.isArray(profileCheck.failures) && profileCheck.failures.length > 0) {
    failures.push('profileCheck.failures must be empty.');
  }

  return failures;
}

function validateProviderCredentialCheck(check) {
  const failures = [];

  if (!check) {
    return ['providerCredentialsStrict must be an object.'];
  }
  if (check.schemaVersion !== 'polycost-provider-credential-check/v1') {
    failures.push('providerCredentialsStrict.schemaVersion is invalid.');
  }
  if (check.ok !== true || check.strict !== true) {
    failures.push('providerCredentialsStrict must be ok and strict=true.');
  }
  if (check.warnCount !== 0 || check.failCount !== 0) {
    failures.push('providerCredentialsStrict must have zero warnings and failures.');
  }
  const results = Array.isArray(check.results) ? check.results : [];
  if (results.length === 0) {
    failures.push('providerCredentialsStrict.results must not be empty.');
  }
  const badResult = results.find((result) => result?.status !== 'pass');
  if (badResult) {
    failures.push(
      `providerCredentialsStrict result ${badResult.provider ?? 'unknown'} is not pass.`,
    );
  }
  if (!results.some((result) => result?.provider === 'invoice-artifacts')) {
    failures.push('providerCredentialsStrict must include invoice-artifacts.');
  }

  return failures;
}

function validateProviderRetentionProof(proof, provider, profileCheck) {
  const failures = [];

  if (!proof) {
    return ['providerRetentionProof must be an object.'];
  }
  if (proof.schemaVersion !== 'invoice-artifact-provider-retention-proof-verification/v1') {
    failures.push('providerRetentionProof.schemaVersion is invalid.');
  }
  if (proof.ok !== true || proof.controlPlaneEvidencePresent !== true) {
    failures.push('providerRetentionProof must be ok and controlPlaneEvidencePresent=true.');
  }
  if (proof.provider !== provider) {
    failures.push('providerRetentionProof.provider must match bundle.provider.');
  }
  if (!hasSha256(proof.proofDigestSha256)) {
    failures.push('providerRetentionProof.proofDigestSha256 must be a SHA-256 digest.');
  }
  if (
    hasSha256(profileCheck?.providerRetentionProofSha256) &&
    proof.proofDigestSha256 !== profileCheck.providerRetentionProofSha256
  ) {
    failures.push('providerRetentionProof digest must match profileCheck digest.');
  }
  if (proof.immutableRetentionProvedByPolyCost !== false) {
    failures.push('providerRetentionProof.immutableRetentionProvedByPolyCost must remain false.');
  }
  if (Array.isArray(proof.failures) && proof.failures.length > 0) {
    failures.push('providerRetentionProof.failures must be empty.');
  }

  return failures;
}

function validateScannerSmoke(smoke) {
  const failures = [];

  if (!smoke) {
    return ['scannerWebhookSmoke must be an object.'];
  }
  if (smoke.status !== 'pass') {
    failures.push('scannerWebhookSmoke.status must be pass.');
  }
  if (!isHttpsUrl(smoke.receiver)) {
    failures.push('scannerWebhookSmoke.receiver must be HTTPS.');
  }
  if (!isHttpSuccess(smoke.httpStatus)) {
    failures.push('scannerWebhookSmoke.httpStatus must be 2xx.');
  }
  if (!hasValue(smoke.runId)) {
    failures.push('scannerWebhookSmoke.runId is required.');
  }
  if (!hasSha256(smoke.artifactSha256)) {
    failures.push('scannerWebhookSmoke.artifactSha256 must be a SHA-256 digest.');
  }
  if (!Number.isInteger(smoke.contentSizeBytes) || smoke.contentSizeBytes <= 0) {
    failures.push('scannerWebhookSmoke.contentSizeBytes must be positive.');
  }
  if (smoke.findingCount !== 0) {
    failures.push('scannerWebhookSmoke.findingCount must be 0.');
  }

  return failures;
}

function validateNotarySmoke(smoke) {
  const failures = [];

  if (!smoke) {
    return ['notaryWebhookSmoke must be an object.'];
  }
  if (smoke.status !== 'pass') {
    failures.push('notaryWebhookSmoke.status must be pass.');
  }
  if (!isHttpsUrl(smoke.receiver)) {
    failures.push('notaryWebhookSmoke.receiver must be HTTPS.');
  }
  if (!isHttpSuccess(smoke.httpStatus)) {
    failures.push('notaryWebhookSmoke.httpStatus must be 2xx.');
  }
  if (!hasValue(smoke.runId)) {
    failures.push('notaryWebhookSmoke.runId is required.');
  }
  if (!hasSha256(smoke.packetDigestSha256)) {
    failures.push('notaryWebhookSmoke.packetDigestSha256 must be a SHA-256 digest.');
  }
  if (!hasSha256(smoke.basePayloadDigestSha256)) {
    failures.push('notaryWebhookSmoke.basePayloadDigestSha256 must be a SHA-256 digest.');
  }
  if (!isValidDateString(smoke.exportedAt)) {
    failures.push('notaryWebhookSmoke.exportedAt must be a valid timestamp.');
  }

  return failures;
}

function validateAuditSmoke(smoke) {
  const failures = [];

  if (!smoke) {
    return ['auditExportSmoke must be an object.'];
  }
  if (smoke.status !== 'pass') {
    failures.push('auditExportSmoke.status must be pass.');
  }
  if (!isHttpsUrl(smoke.receiver)) {
    failures.push('auditExportSmoke.receiver must be HTTPS.');
  }
  if (!isHttpSuccess(smoke.httpStatus)) {
    failures.push('auditExportSmoke.httpStatus must be 2xx.');
  }
  if (!hasValue(smoke.runId) || !hasValue(smoke.exportId) || !hasValue(smoke.auditEventId)) {
    failures.push('auditExportSmoke runId, exportId, and auditEventId are required.');
  }
  if (!isValidDateString(smoke.ranAt)) {
    failures.push('auditExportSmoke.ranAt must be a valid timestamp.');
  }

  return failures;
}

function validateCanaryArchives(canaryArchives, bundle, operatorAttestations) {
  const failures = [];

  if (!Array.isArray(bundle.canaryArchives)) {
    failures.push('canaryArchives must be an array.');
  }

  for (const name of REQUIRED_ARCHIVES) {
    const archive = canaryArchives.find((entry) => entry?.name === name);
    if (!archive) {
      failures.push(`canaryArchives must include ${name}.`);
      continue;
    }
    if (!isProviderArchiveReference(archive.archiveReference)) {
      failures.push(`${name}.archiveReference must be an object-storage URI.`);
    }
    if (!hasSha256(archive.receiptSha256)) {
      failures.push(`${name}.receiptSha256 must be a SHA-256 digest.`);
    }
    if (!isProviderArchiveReference(archive.retentionEvidenceReference)) {
      failures.push(`${name}.retentionEvidenceReference must be an object-storage URI.`);
    }
    if (!hasSha256(archive.retentionEvidenceSha256)) {
      failures.push(`${name}.retentionEvidenceSha256 must be a SHA-256 digest.`);
    }
    if (!isValidDateString(archive.archivedAt)) {
      failures.push(`${name}.archivedAt must be a valid timestamp.`);
    }
  }

  if (operatorAttestations?.receiverSideRetentionEvidenceArchived !== true) {
    failures.push('operatorAttestations.receiverSideRetentionEvidenceArchived must be true.');
  }
  if (operatorAttestations?.rawSecretsExcluded !== true) {
    failures.push('operatorAttestations.rawSecretsExcluded must be true.');
  }

  return failures;
}

async function validateProfileReferences({
  root,
  bundle,
  provider,
  providerRetentionProof,
  canaryArchives,
}) {
  const failures = [];
  const profilePathValue = stringValue(bundle.profilePath);

  if (!profilePathValue) {
    return { failures: ['profilePath is required.'] };
  }
  if (path.isAbsolute(profilePathValue)) {
    return { failures: ['profilePath must be repository-relative.'] };
  }

  const absoluteProfilePath = path.resolve(root, profilePathValue);
  const relativeProfilePath = path.relative(root, absoluteProfilePath);
  if (relativeProfilePath.startsWith('..') || relativeProfilePath === '') {
    return { failures: ['profilePath must stay inside the repository.'] };
  }
  if (!existsSync(absoluteProfilePath)) {
    return { failures: [`profilePath does not exist: ${profilePathValue}.`] };
  }

  const profile = parseJsonObject(await readFile(absoluteProfilePath, 'utf8'), profilePathValue);
  const evidence = plainObject(profile.evidence) ?? {};

  if (profile.provider !== provider) {
    failures.push('profile.provider must match bundle.provider.');
  }

  const proof = plainObject(evidence.providerRetentionProof);
  if (proof) {
    if (proof.expectedSha256 !== providerRetentionProof?.proofDigestSha256) {
      failures.push('providerRetentionProof digest must match profile evidence expectedSha256.');
    }
    if (proof.reference !== providerRetentionProof?.proofReference) {
      failures.push('providerRetentionProof reference must match profile evidence reference.');
    }
  }

  for (const name of REQUIRED_ARCHIVES) {
    const expected = stringValue(plainObject(evidence[name])?.archiveReference);
    const actual = stringValue(
      canaryArchives.find((entry) => entry?.name === name)?.archiveReference,
    );
    if (expected && actual && expected !== actual) {
      failures.push(`${name}.archiveReference must match profile evidence archiveReference.`);
    }
  }

  return {
    profilePath: relativeProfilePath,
    failures,
  };
}

function validateLiveAttestations(attestations) {
  const failures = [];

  if (!attestations) {
    return ['operatorAttestations must be an object for live-target evidence.'];
  }
  if (attestations.liveRunExecuted !== true) {
    failures.push('operatorAttestations.liveRunExecuted must be true for live evidence.');
  }
  if (attestations.targetEnvironmentAccessControlled !== true) {
    failures.push(
      'operatorAttestations.targetEnvironmentAccessControlled must be true for live evidence.',
    );
  }
  if (!hasValue(attestations.operator)) {
    failures.push('operatorAttestations.operator is required for live evidence.');
  }

  return failures;
}

function findSecretMaterial(value, pathParts = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      failures.push(...findSecretMaterial(entry, [...pathParts, String(index)]));
    }
    return failures;
  }

  if (plainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        failures.push(
          `potential raw secret key is not allowed at ${[...pathParts, key].join('.')}.`,
        );
      }
      failures.push(...findSecretMaterial(entry, [...pathParts, key]));
    }
    return failures;
  }

  if (
    typeof value === 'string' &&
    SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    failures.push(`potential raw secret value is not allowed at ${pathParts.join('.')}.`);
  }

  return failures;
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

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value.trim());
}

function isHttpSuccess(value) {
  return Number.isInteger(value) && value >= 200 && value <= 299;
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isProviderArchiveReference(value) {
  return (
    typeof value === 'string' &&
    (/^s3:\/\/[^/]+\/.+/.test(value) ||
      /^gs:\/\/[^/]+\/.+/.test(value) ||
      /^az:\/\/[^/]+\/.+/.test(value))
  );
}

function isValidDateString(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const time = Date.parse(value);
  return Number.isFinite(time);
}

function printResult(result) {
  if (result.ok) {
    console.log('Invoice artifact rehearsal evidence check passed.');
    console.log(`Evidence level: ${result.evidenceLevel}`);
    console.log(`Provider: ${result.provider}`);
    console.log(`Verified live evidence: ${result.verifiedLiveEvidence ? 'yes' : 'no'}`);
    if (result.liveEvidenceRequired) {
      console.log('Live target evidence is still required before production proof.');
    }
    return;
  }

  console.error('Invoice artifact rehearsal evidence check failed.');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Invoice artifact rehearsal evidence checker ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-artifact-rehearsal-evidence-check.mjs [bundle.json] [options]

Options:
  --bundle=<file>   Evidence bundle JSON to validate
  --require-live    Require live-target attestations
  --json            Emit machine-readable JSON
  --quiet           Suppress human output
  --help            Show this help
  --version         Show version

Default bundle:
  ${DEFAULT_BUNDLE}
`);
}
