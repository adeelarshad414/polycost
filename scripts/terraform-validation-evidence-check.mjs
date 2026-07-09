#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const BUNDLE_SCHEMA = 'polycost-terraform-validation-evidence/v1';
const CHECK_SCHEMA = 'polycost-terraform-validation-evidence-check/v1';
const DEFAULT_BUNDLE = 'docs/operations/evidence/terraform-validation-evidence.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_CLOUDS = new Set(['aws', 'azure', 'gcp']);
const REQUIRED_VALIDATION_STEPS = [
  'manifest-integrity',
  'terraform-fmt',
  'terraform-init',
  'terraform-validate',
];
const SECRET_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /private_key/i,
  /client_secret/i,
  /access_key/i,
  /sas/i,
];
const SECRET_VALUE_PATTERNS = [/BEGIN PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /CHANGE_ME_DEV_ONLY/i];
const ALLOWED_SECRET_POSTURE_KEYS = new Set(['rawSecretsExcluded', 'sensitiveValuesRedacted']);

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Terraform validation evidence check error: ${message}`);
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
          bundlePath: args.bundlePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Terraform validation evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    bundlePath: DEFAULT_BUNDLE,
    requireDestinationPlan: false,
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
    if (arg === '--require-destination-plan') {
      options.requireDestinationPlan = true;
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
    throw new Error('Expected at most one Terraform evidence bundle path.');
  }
  if (!options.bundlePath) {
    throw new Error('Terraform evidence bundle path cannot be empty.');
  }

  return options;
}

async function checkEvidence(options) {
  const root = process.cwd();
  const bundlePath = path.resolve(root, options.bundlePath);
  const bundle = parseJsonObject(await readFile(bundlePath, 'utf8'), options.bundlePath);
  const failures = [];
  const evidenceLevel = stringValue(bundle.evidenceLevel);
  const targetCloud = stringValue(bundle.targetCloud);
  const environment = stringValue(bundle.environment);
  const bundleManifest = plainObject(bundle.bundleManifest);
  const manifestIntegrity = plainObject(bundle.manifestIntegrity);
  const validationResult = plainObject(bundle.terraformValidationResult);
  const planEvidence = plainObject(bundle.planEvidence);
  const remoteState = plainObject(bundle.remoteState);
  const tagEvidence = plainObject(bundle.tagEvidence);
  const operatorAttestations = plainObject(bundle.operatorAttestations);

  if (bundle.schemaVersion !== BUNDLE_SCHEMA) {
    failures.push(`schemaVersion must be ${BUNDLE_SCHEMA}.`);
  }
  if (!['example-schema', 'destination-plan'].includes(evidenceLevel)) {
    failures.push('evidenceLevel must be example-schema or destination-plan.');
  }
  if (!SUPPORTED_CLOUDS.has(targetCloud)) {
    failures.push('targetCloud must be aws, azure, or gcp.');
  }
  if (!['development', 'test', 'staging', 'production'].includes(environment)) {
    failures.push('environment must be development, test, staging, or production.');
  }
  if (!isValidDateString(bundle.capturedAt)) {
    failures.push('capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (bundle.productionClaim === true) {
    failures.push('productionClaim must remain false; this validates evidence, not deployment.');
  }
  if (options.requireDestinationPlan && evidenceLevel !== 'destination-plan') {
    failures.push(
      'evidenceLevel must be destination-plan when --require-destination-plan is used.',
    );
  }

  failures.push(...findSecretMaterial(bundle));
  failures.push(...validateBundleManifest(bundleManifest, targetCloud));
  failures.push(...validateManifestIntegrity(manifestIntegrity));
  failures.push(...validateTerraformValidationResult(validationResult, planEvidence));
  failures.push(...validatePlanEvidence(planEvidence, operatorAttestations));
  failures.push(...validateRemoteState(remoteState));
  failures.push(...validateTagEvidence(tagEvidence));
  failures.push(...validateOperatorAttestations(operatorAttestations, options));

  const verifiedDestinationPlan =
    failures.length === 0 &&
    evidenceLevel === 'destination-plan' &&
    operatorAttestations?.destinationPlanReviewed === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    bundlePath,
    evidenceLevel,
    targetCloud,
    environment,
    bundleName: stringValue(bundle.bundleName ?? bundleManifest?.bundleName),
    productionClaim: bundle.productionClaim === true,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedDestinationPlan,
    destinationPlanRequired: evidenceLevel !== 'destination-plan',
    checkCount: 8 + REQUIRED_VALIDATION_STEPS.length,
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the Terraform evidence contract with sanitized sample data; it is not destination-account plan proof.'
        : 'This validates archived Terraform validation evidence, not a PolyCost-run apply.',
      'Provider credentials, state, and Terraform execution remain operator-controlled outside PolyCost request handling.',
    ],
    failures,
  };
}

function validateBundleManifest(manifest, targetCloud) {
  const failures = [];

  if (!manifest) {
    return ['bundleManifest must be an object.'];
  }
  if (manifest.schemaVersion !== 'polycost.terraform.bundle.v1') {
    failures.push('bundleManifest.schemaVersion must be polycost.terraform.bundle.v1.');
  }
  if (manifest.targetCloud !== targetCloud) {
    failures.push('bundleManifest.targetCloud must match targetCloud.');
  }
  if (!hasValue(manifest.bundleName)) {
    failures.push('bundleManifest.bundleName is required.');
  }
  if (!hasValue(manifest.region)) {
    failures.push('bundleManifest.region is required.');
  }
  if (!isValidDateString(manifest.generatedAt)) {
    failures.push('bundleManifest.generatedAt must be a valid timestamp.');
  }
  if (manifest.validationRunner !== 'scripts/validate-bundle.mjs') {
    failures.push('bundleManifest.validationRunner must be scripts/validate-bundle.mjs.');
  }
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (files.length < 10) {
    failures.push('bundleManifest.files must include the generated bundle payload.');
  }
  for (const requiredPath of [
    'versions.tf',
    'providers.tf',
    'backend.tf.example',
    'scripts/validate-bundle.mjs',
    'scripts/verify-manifest.mjs',
    'policies/terraform-plan.rego',
  ]) {
    if (!files.some((file) => file?.path === requiredPath && hasSha256(file?.sha256))) {
      failures.push(`bundleManifest.files must include ${requiredPath} with a SHA-256 digest.`);
    }
  }
  if (!plainObject(manifest.generationProfile)) {
    failures.push('bundleManifest.generationProfile is required.');
  }

  return failures;
}

function validateManifestIntegrity(manifestIntegrity) {
  const failures = [];

  if (!manifestIntegrity) {
    return ['manifestIntegrity must be an object.'];
  }
  if (manifestIntegrity.status !== 'passed') {
    failures.push('manifestIntegrity.status must be passed.');
  }
  if (!Number.isInteger(manifestIntegrity.checkedFiles) || manifestIntegrity.checkedFiles < 10) {
    failures.push('manifestIntegrity.checkedFiles must be at least 10.');
  }
  if (Array.isArray(manifestIntegrity.failures) && manifestIntegrity.failures.length > 0) {
    failures.push('manifestIntegrity.failures must be empty.');
  }

  return failures;
}

function validateTerraformValidationResult(validationResult, planEvidence) {
  const failures = [];

  if (!validationResult) {
    return ['terraformValidationResult must be an object.'];
  }
  if (!['passed', 'warning'].includes(validationResult.status)) {
    failures.push('terraformValidationResult.status must be passed or warning.');
  }
  const results = Array.isArray(validationResult.results) ? validationResult.results : [];
  if (results.length === 0) {
    failures.push('terraformValidationResult.results must not be empty.');
  }

  for (const id of REQUIRED_VALIDATION_STEPS) {
    const step = results.find((entry) => entry?.id === id);
    if (!step) {
      failures.push(`terraformValidationResult.results must include ${id}.`);
    } else if (step.status !== 'passed') {
      failures.push(`${id} must pass.`);
    }
  }

  const planPresent = planEvidence?.planJsonPresent === true;
  const conftestStep = results.find((entry) => entry?.id === 'conftest-policy');
  if (planPresent && conftestStep && conftestStep.status !== 'passed') {
    failures.push('conftest-policy must pass when a plan JSON is present.');
  }
  const failedStep = results.find((entry) => entry?.status === 'failed');
  if (failedStep) {
    failures.push(`terraform validation step ${failedStep.id ?? 'unknown'} failed.`);
  }

  return failures;
}

function validatePlanEvidence(planEvidence, operatorAttestations) {
  const failures = [];

  if (!planEvidence) {
    return ['planEvidence must be an object.'];
  }
  if (planEvidence.planJsonPresent !== true) {
    failures.push('planEvidence.planJsonPresent must be true.');
  }
  if (!hasSha256(planEvidence.planJsonSha256)) {
    failures.push('planEvidence.planJsonSha256 must be a SHA-256 digest.');
  }
  if (!Number.isInteger(planEvidence.resourceChangeCount) || planEvidence.resourceChangeCount < 0) {
    failures.push('planEvidence.resourceChangeCount must be a non-negative integer.');
  }
  if (!Number.isInteger(planEvidence.destructiveChangeCount)) {
    failures.push('planEvidence.destructiveChangeCount must be an integer.');
  }
  if (!Number.isInteger(planEvidence.replacementChangeCount)) {
    failures.push('planEvidence.replacementChangeCount must be an integer.');
  }
  if (
    (planEvidence.destructiveChangeCount > 0 || planEvidence.replacementChangeCount > 0) &&
    operatorAttestations?.destructivePlanExceptionApproved !== true
  ) {
    failures.push(
      'destructive or replacement plan changes require destructivePlanExceptionApproved=true.',
    );
  }
  if (planEvidence.sensitiveValuesRedacted !== true) {
    failures.push('planEvidence.sensitiveValuesRedacted must be true.');
  }
  const policyCheck = plainObject(planEvidence.policyCheck);
  if (!policyCheck || policyCheck.status !== 'passed') {
    failures.push('planEvidence.policyCheck.status must be passed.');
  }
  const actions = plainObject(planEvidence.resourceActions) ?? {};
  for (const key of ['create', 'update', 'delete', 'replace', 'noOp']) {
    if (!Number.isInteger(actions[key]) || actions[key] < 0) {
      failures.push(`planEvidence.resourceActions.${key} must be a non-negative integer.`);
    }
  }

  return failures;
}

function validateRemoteState(remoteState) {
  const failures = [];

  if (!remoteState) {
    return ['remoteState must be an object.'];
  }
  if (remoteState.backendConfigured !== true) {
    failures.push('remoteState.backendConfigured must be true.');
  }
  if (remoteState.backendType === 'local') {
    failures.push('remoteState.backendType must not be local for destination evidence.');
  }
  if (!['s3', 'azurerm', 'gcs', 'remote', 'terraform-cloud'].includes(remoteState.backendType)) {
    failures.push('remoteState.backendType must be s3, azurerm, gcs, remote, or terraform-cloud.');
  }
  if (remoteState.lockingConfigured !== true) {
    failures.push('remoteState.lockingConfigured must be true.');
  }
  if (remoteState.encryptionConfigured !== true) {
    failures.push('remoteState.encryptionConfigured must be true.');
  }
  if (!hasValue(remoteState.stateLocationReference)) {
    failures.push('remoteState.stateLocationReference is required.');
  }

  return failures;
}

function validateTagEvidence(tagEvidence) {
  const failures = [];

  if (!tagEvidence) {
    return ['tagEvidence must be an object.'];
  }
  if (tagEvidence.costAllocationTagsPresent !== true) {
    failures.push('tagEvidence.costAllocationTagsPresent must be true.');
  }
  const requiredTags = Array.isArray(tagEvidence.requiredTags) ? tagEvidence.requiredTags : [];
  for (const tag of ['CostCenter', 'Environment', 'ManagedBy']) {
    if (!requiredTags.includes(tag)) {
      failures.push(`tagEvidence.requiredTags must include ${tag}.`);
    }
  }
  if (
    !Number.isInteger(tagEvidence.untaggedResourceCount) ||
    tagEvidence.untaggedResourceCount < 0
  ) {
    failures.push('tagEvidence.untaggedResourceCount must be a non-negative integer.');
  }
  if (tagEvidence.untaggedResourceCount > 0) {
    failures.push('tagEvidence.untaggedResourceCount must be 0 before promotion.');
  }

  return failures;
}

function validateOperatorAttestations(attestations, options) {
  const failures = [];

  if (!attestations) {
    return ['operatorAttestations must be an object.'];
  }
  if (attestations.terraformApplyRunByPolyCost !== false) {
    failures.push('operatorAttestations.terraformApplyRunByPolyCost must be false.');
  }
  if (attestations.providerCredentialsExternal !== true) {
    failures.push('operatorAttestations.providerCredentialsExternal must be true.');
  }
  if (attestations.rawSecretsExcluded !== true) {
    failures.push('operatorAttestations.rawSecretsExcluded must be true.');
  }
  if (attestations.destinationPlanReviewed !== true) {
    failures.push('operatorAttestations.destinationPlanReviewed must be true.');
  }
  if (!hasValue(attestations.operator)) {
    failures.push('operatorAttestations.operator is required.');
  }
  if (options.requireDestinationPlan && attestations.destinationPlanExecuted !== true) {
    failures.push(
      'operatorAttestations.destinationPlanExecuted must be true when --require-destination-plan is used.',
    );
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
      const pathLabel = [...pathParts, key].join('.');
      if (
        !ALLOWED_SECRET_POSTURE_KEYS.has(key) &&
        SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))
      ) {
        failures.push(`potential raw secret key is not allowed at ${pathLabel}.`);
      }
      failures.push(...findSecretMaterial(entry, [...pathParts, key]));
    }
    return failures;
  }

  if (typeof value === 'string' && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
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

function isValidDateString(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function printResult(result) {
  if (result.ok) {
    console.log('Terraform validation evidence check passed.');
    console.log(`Evidence level: ${result.evidenceLevel}`);
    console.log(`Target cloud: ${result.targetCloud}`);
    console.log(`Verified destination plan: ${result.verifiedDestinationPlan ? 'yes' : 'no'}`);
    if (result.destinationPlanRequired) {
      console.log('Destination-account Terraform plan evidence is still required.');
    }
    return;
  }

  console.error('Terraform validation evidence check failed.');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Terraform validation evidence checker ${PACKAGE_VERSION}

Usage:
  node scripts/terraform-validation-evidence-check.mjs [bundle.json] [options]

Options:
  --bundle=<file>              Evidence bundle JSON to validate
  --require-destination-plan   Require destination-plan attestations
  --json                       Emit machine-readable JSON
  --quiet                      Suppress human output
  --help                       Show this help
  --version                    Show version

Default bundle:
  ${DEFAULT_BUNDLE}
`);
}
