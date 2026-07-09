#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const PROFILE_SCHEMA = 'polycost-invoice-artifact-production-profile/v1';
const CHECK_SCHEMA = 'polycost-invoice-artifact-production-profile-check/v1';
const DEFAULT_PROFILE = 'docs/operations/invoice-artifact-production-profile.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const canaryEvidenceNames = ['scannerCanary', 'notaryReceiverCanary', 'auditExportCanary'];

const requiredRuntimeKeys = [
  'NODE_ENV',
  'INVOICE_ARTIFACT_STORAGE_BACKEND',
  'INVOICE_ARTIFACT_OBJECT_STORE_NAME',
  'INVOICE_ARTIFACT_OBJECT_STORE_REGION',
  'INVOICE_ARTIFACT_OBJECT_STORE_PREFIX',
  'INVOICE_ARTIFACT_KMS_KEY_REFERENCE',
  'INVOICE_ARTIFACT_MALWARE_SCANNER_MODE',
  'INVOICE_ARTIFACT_MALWARE_SCANNER_URL',
  'INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE',
  'INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE',
  'INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE',
  'INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256',
  'INVOICE_EVIDENCE_RECEIPT_MODE',
  'INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE',
  'INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL',
  'INVOICE_EVIDENCE_WORM_RETENTION_MODE',
  'AUTH_AUDIT_EXPORT_MODE',
  'AUTH_AUDIT_EXPORT_WEBHOOK_URL',
  'VAULT_ADDR',
  'VAULT_TOKEN_FILE',
];

const forbiddenRuntimeSecretKeys = [
  'INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET',
  'INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET',
  'INVOICE_EVIDENCE_NOTARY_WEBHOOK_SECRET',
  'AUTH_AUDIT_EXPORT_WEBHOOK_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AZURE_STORAGE_SAS_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invoice artifact production profile check error: ${message}`);
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
  const result = await checkProfile(args);

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
          profilePath: args.profilePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Invoice artifact production profile check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    profilePath: DEFAULT_PROFILE,
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
    throw new Error('Expected at most one production profile path.');
  }
  if (!options.profilePath) {
    throw new Error('Profile path cannot be empty.');
  }

  return options;
}

async function checkProfile(options) {
  const root = process.cwd();
  const profilePath = path.resolve(root, options.profilePath);
  const profile = parseJsonObject(await readFile(profilePath, 'utf8'), options.profilePath);
  const failures = [];

  if (profile.schemaVersion !== PROFILE_SCHEMA) {
    failures.push(`profile schemaVersion must be ${PROFILE_SCHEMA}.`);
  }

  const provider = normalizeProvider(profile.provider);
  const runtimeConfig = plainObject(profile.runtimeConfig);
  const secretReferences = plainObject(profile.secretReferences);
  const evidence = plainObject(profile.evidence);

  if (!runtimeConfig) {
    failures.push('runtimeConfig must be an object.');
  }
  if (!secretReferences) {
    failures.push('secretReferences must be an object.');
  }
  if (!evidence) {
    failures.push('evidence must be an object.');
  }

  if (runtimeConfig) {
    failures.push(...validateRuntimeConfig(provider, runtimeConfig));
  }

  if (secretReferences) {
    failures.push(...validateSecretReferences(provider, secretReferences));
  }

  const proofEvidence = evidence ? plainObject(evidence.providerRetentionProof) : undefined;
  const proofResult = proofEvidence
    ? await validateProviderProof({
        provider,
        root,
        runtimeConfig,
        proofEvidence,
      })
    : {
        failures: ['evidence.providerRetentionProof must be an object.'],
      };

  failures.push(...proofResult.failures);

  if (evidence) {
    failures.push(...validateCanaryEvidence(provider, evidence));
  }

  const ok = failures.length === 0;

  return {
    ok,
    schemaVersion: CHECK_SCHEMA,
    profilePath,
    profileName: stringValue(profile.profileName),
    provider,
    verificationLevel: stringValue(profile.verificationLevel),
    productionClaim: profile.productionClaim === true,
    runtimeControlCount: runtimeConfig ? requiredRuntimeKeys.length : 0,
    secretReferenceCount: secretReferences ? Object.keys(secretReferences).length : 0,
    canaryEvidenceCount: evidence ? canaryEvidenceNames.filter((name) => evidence[name]).length : 0,
    ...(proofResult.proofDigestSha256
      ? { providerRetentionProofSha256: proofResult.proofDigestSha256 }
      : {}),
    verifiedConfigEvidence: ok,
    liveCloudEvidenceRequired: true,
    caveats: [
      'This validates a sanitized production profile and captured proof artifact; it does not read Vault or call cloud provider APIs.',
      'Run provider:credentials:check:strict in the target environment to prove live Vault/provider access.',
    ],
    failures,
  };
}

function validateRuntimeConfig(provider, runtimeConfig) {
  const failures = [];

  for (const key of requiredRuntimeKeys) {
    if (!hasValue(runtimeConfig[key])) {
      failures.push(`runtimeConfig.${key} is required.`);
    }
  }

  for (const key of forbiddenRuntimeSecretKeys) {
    if (runtimeConfig[key] !== undefined) {
      failures.push(
        `runtimeConfig.${key} must not be stored in the profile; use secretReferences.`,
      );
    }
  }

  const backend = runtimeConfig.INVOICE_ARTIFACT_STORAGE_BACKEND;
  if (backend !== provider) {
    failures.push(
      `runtimeConfig.INVOICE_ARTIFACT_STORAGE_BACKEND must match provider ${provider}.`,
    );
  }

  if (!['staging', 'production'].includes(runtimeConfig.NODE_ENV)) {
    failures.push('runtimeConfig.NODE_ENV must be staging or production.');
  }
  if (backend === 'database-bytea') {
    failures.push(
      'runtimeConfig.INVOICE_ARTIFACT_STORAGE_BACKEND must be external object storage.',
    );
  }
  if (runtimeConfig.INVOICE_ARTIFACT_MALWARE_SCANNER_MODE !== 'http-webhook') {
    failures.push('runtimeConfig.INVOICE_ARTIFACT_MALWARE_SCANNER_MODE must be http-webhook.');
  }
  if (runtimeConfig.INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE !== 'delete-expired') {
    failures.push(
      'runtimeConfig.INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE must be delete-expired.',
    );
  }
  if (runtimeConfig.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE !== 'provider-control-plane') {
    failures.push(
      'runtimeConfig.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE must be provider-control-plane.',
    );
  }
  if (runtimeConfig.INVOICE_EVIDENCE_RECEIPT_MODE === 'metadata-only') {
    failures.push('runtimeConfig.INVOICE_EVIDENCE_RECEIPT_MODE must use signed receipts.');
  }
  if (runtimeConfig.INVOICE_EVIDENCE_WORM_RETENTION_MODE !== 'provider-object-lock') {
    failures.push(
      'runtimeConfig.INVOICE_EVIDENCE_WORM_RETENTION_MODE must be provider-object-lock.',
    );
  }
  if (runtimeConfig.AUTH_AUDIT_EXPORT_MODE !== 'webhook') {
    failures.push('runtimeConfig.AUTH_AUDIT_EXPORT_MODE must be webhook.');
  }
  if (
    !SHA256_PATTERN.test(String(runtimeConfig.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256))
  ) {
    failures.push(
      'runtimeConfig.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256 must be a lowercase SHA-256 digest.',
    );
  }

  for (const key of Object.keys(runtimeConfig)) {
    const value = runtimeConfig[key];
    if (typeof value === 'string' && isDummyValue(value)) {
      failures.push(`runtimeConfig.${key} contains a dummy placeholder value.`);
    }
  }

  failures.push(
    ...validateHttpsUrl(
      runtimeConfig.INVOICE_ARTIFACT_MALWARE_SCANNER_URL,
      'runtimeConfig.INVOICE_ARTIFACT_MALWARE_SCANNER_URL',
    ),
    ...validateHttpsUrl(
      runtimeConfig.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL,
      'runtimeConfig.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL',
    ),
    ...validateHttpsUrl(
      runtimeConfig.AUTH_AUDIT_EXPORT_WEBHOOK_URL,
      'runtimeConfig.AUTH_AUDIT_EXPORT_WEBHOOK_URL',
    ),
    ...validateHttpsUrl(runtimeConfig.VAULT_ADDR, 'runtimeConfig.VAULT_ADDR'),
  );

  if (runtimeConfig.INVOICE_ARTIFACT_OBJECT_STORE_PREFIX?.startsWith('/')) {
    failures.push('runtimeConfig.INVOICE_ARTIFACT_OBJECT_STORE_PREFIX must be a relative prefix.');
  }

  const kmsFailures = validateKmsReference(
    provider,
    runtimeConfig.INVOICE_ARTIFACT_KMS_KEY_REFERENCE,
    'runtimeConfig.INVOICE_ARTIFACT_KMS_KEY_REFERENCE',
  );
  failures.push(...kmsFailures);

  return failures;
}

function validateSecretReferences(provider, secretReferences) {
  const failures = [];
  const requiredSecretRefs = [
    'artifactStorage',
    'scannerWebhook',
    'evidenceReceipt',
    'auditExport',
  ];

  for (const name of requiredSecretRefs) {
    const reference = plainObject(secretReferences[name]);
    if (!reference) {
      failures.push(`secretReferences.${name} must be configured.`);
      continue;
    }

    failures.push(...validateVaultReference(reference, `secretReferences.${name}`));
  }

  const artifactStorage = plainObject(secretReferences.artifactStorage);
  if (artifactStorage) {
    const requiredKeysByProvider = {
      'aws-s3': ['access_key_id', 'secret_access_key'],
      'azure-blob': ['account_name', 'sas_token'],
      'gcp-gcs': ['access_token'],
    };
    const requiredKeys = requiredKeysByProvider[provider] ?? [];
    const actualKeys = arrayOfStrings(artifactStorage.requiredKeys);

    for (const key of requiredKeys) {
      if (!actualKeys.includes(key)) {
        failures.push(`secretReferences.artifactStorage.requiredKeys must include ${key}.`);
      }
    }
  }

  return failures;
}

async function validateProviderProof({ provider, root, runtimeConfig, proofEvidence }) {
  const failures = [];

  if (normalizeProvider(proofEvidence.provider) !== provider) {
    failures.push('evidence.providerRetentionProof.provider must match profile provider.');
  }

  const proofFile = stringValue(proofEvidence.file);
  const reference = stringValue(proofEvidence.reference);
  const expectedSha256 = stringValue(proofEvidence.expectedSha256);
  const runtimeReference = stringValue(
    runtimeConfig?.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE,
  );
  const runtimeSha256 = stringValue(
    runtimeConfig?.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256,
  );

  if (!proofFile) {
    failures.push('evidence.providerRetentionProof.file is required.');
    return { failures };
  }
  if (path.isAbsolute(proofFile)) {
    failures.push('evidence.providerRetentionProof.file must be relative to the repository root.');
  }
  if (!reference) {
    failures.push('evidence.providerRetentionProof.reference is required.');
  }
  if (reference && reference !== runtimeReference) {
    failures.push('provider retention proof reference must match runtimeConfig.');
  }
  if (!SHA256_PATTERN.test(expectedSha256)) {
    failures.push('evidence.providerRetentionProof.expectedSha256 must be a SHA-256 digest.');
  }
  if (expectedSha256 && expectedSha256 !== runtimeSha256) {
    failures.push('provider retention proof digest must match runtimeConfig.');
  }

  const absoluteProofFile = path.resolve(root, proofFile);
  if (!absoluteProofFile.startsWith(root + path.sep)) {
    failures.push('evidence.providerRetentionProof.file must stay inside the repository.');
  }
  if (!existsSync(absoluteProofFile)) {
    failures.push(`provider retention proof file does not exist: ${proofFile}.`);
    return { failures };
  }

  const content = await readFile(absoluteProofFile, 'utf8');
  const digest = sha256(content);
  if (expectedSha256 && digest !== expectedSha256) {
    failures.push(
      `provider retention proof digest mismatch: expected ${expectedSha256}, got ${digest}.`,
    );
  }

  const verifierResult = runRetentionProofVerifier({
    provider,
    proofFile,
    expectedSha256,
    reference,
  });
  failures.push(...verifierResult.failures);

  return {
    failures,
    proofDigestSha256: digest,
  };
}

function runRetentionProofVerifier({ provider, proofFile, expectedSha256, reference }) {
  const verifierPath = path.join(
    process.cwd(),
    'scripts/invoice-artifact-provider-retention-proof-verifier.mjs',
  );
  const result = spawnSync(
    process.execPath,
    [
      verifierPath,
      provider,
      proofFile,
      `--expected-sha256=${expectedSha256}`,
      `--reference=${reference}`,
      '--json',
    ],
    {
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    return {
      failures: [`provider retention proof verifier failed: ${result.stderr || result.stdout}`],
    };
  }

  const parsed = parseJsonObject(result.stdout, 'retention proof verifier output');
  if (parsed.ok !== true || parsed.controlPlaneEvidencePresent !== true) {
    return {
      failures: ['provider retention proof verifier did not confirm control-plane evidence.'],
    };
  }

  return { failures: [] };
}

function validateCanaryEvidence(provider, evidence) {
  const failures = [];

  for (const name of canaryEvidenceNames) {
    const canary = plainObject(evidence[name]);
    if (!canary) {
      failures.push(`evidence.${name} must be configured.`);
      continue;
    }

    if (canary.required !== true) {
      failures.push(`evidence.${name}.required must be true.`);
    }

    const archiveReference = stringValue(canary.archiveReference);
    if (!archiveReference) {
      failures.push(`evidence.${name}.archiveReference is required.`);
      continue;
    }

    if (!isDurableEvidenceReference(provider, archiveReference)) {
      failures.push(`evidence.${name}.archiveReference must use the provider evidence store URI.`);
    }
  }

  return failures;
}

function validateVaultReference(reference, label) {
  const failures = [];

  if (reference.source !== 'vault') {
    failures.push(`${label}.source must be vault.`);
  }
  if (!stringValue(reference.path).startsWith('secret/polycost/')) {
    failures.push(`${label}.path must start with secret/polycost/.`);
  }
  if (arrayOfStrings(reference.requiredKeys).length === 0) {
    failures.push(`${label}.requiredKeys must name at least one Vault key.`);
  }
  if (!hasValue(reference.rotationOwner)) {
    failures.push(`${label}.rotationOwner is required.`);
  }

  return failures;
}

function validateKmsReference(provider, value, label) {
  const reference = stringValue(value);
  if (!reference) {
    return [`${label} is required.`];
  }

  if (
    provider === 'aws-s3' &&
    !/^arn:aws:kms:[a-z0-9-]+:\d{12}:(key\/[A-Za-z0-9-]+|alias\/[A-Za-z0-9/_-]+)$/.test(reference)
  ) {
    return [`${label} must be an AWS KMS key or alias ARN.`];
  }
  if (
    provider === 'azure-blob' &&
    !/^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/keys\/.+/i.test(reference)
  ) {
    return [`${label} must be an Azure Key Vault key URI.`];
  }
  if (
    provider === 'gcp-gcs' &&
    !/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(reference)
  ) {
    return [`${label} must be a GCP Cloud KMS cryptoKey resource name.`];
  }

  return [];
}

function validateHttpsUrl(value, label) {
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== 'https:') {
      return [`${label} must use HTTPS.`];
    }
    return [];
  } catch {
    return [`${label} must be a valid HTTPS URL.`];
  }
}

function isDurableEvidenceReference(provider, value) {
  if (provider === 'aws-s3') {
    return value.startsWith('s3://');
  }
  if (provider === 'azure-blob') {
    return value.startsWith('azure-blob://');
  }
  if (provider === 'gcp-gcs') {
    return value.startsWith('gs://');
  }
  return false;
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

  return normalized;
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

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && !isDummyValue(value);
}

function isDummyValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'change_me_dev_only' ||
    normalized === 'dummy' ||
    normalized === 'example' ||
    normalized.includes('change_me')
  );
}

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function printResult(result) {
  if (result.ok) {
    console.log('Invoice artifact production profile check passed.');
    console.log(`Profile: ${result.profileName}`);
    console.log(`Provider: ${result.provider}`);
    console.log(`Verification: ${result.verificationLevel}`);
    console.log(`Provider proof digest: ${result.providerRetentionProofSha256}`);
    console.log('Live cloud evidence is still required in the target environment.');
    return;
  }

  console.error('Invoice artifact production profile check failed.');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Invoice artifact production profile checker ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-artifact-production-profile-check.mjs [profile.json] [options]

Options:
  --profile=<file>  Production profile JSON to validate
  --json            Emit machine-readable JSON
  --quiet           Suppress human output
  --help            Show this help
  --version         Show version

Default profile:
  ${DEFAULT_PROFILE}
`);
}
