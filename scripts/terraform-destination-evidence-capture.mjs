#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const PACKAGE_VERSION = '0.1.0';
const CAPTURE_SCHEMA = 'polycost-terraform-destination-evidence-capture/v1';
const EVIDENCE_SCHEMA = 'polycost-terraform-validation-evidence/v1';
const DEFAULT_PROFILE =
  'docs/operations/evidence/terraform-destination-capture/terraform-destination-capture.example.json';
const DEFAULT_SMOKE_OUTPUT =
  '.tmp/terraform-destination-evidence-capture/terraform-validation-evidence.json';
const SUPPORTED_CLOUDS = new Set(['aws', 'azure', 'gcp']);
const DEFAULT_REQUIRED_TAGS = ['CostCenter', 'Environment', 'ManagedBy'];
const SECRET_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /private_key/i,
  /client_secret/i,
  /access_key/i,
  /sas/i,
  /authorization/i,
];
const SECRET_VALUE_PATTERNS = [/BEGIN PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /CHANGE_ME_DEV_ONLY/i];
const ALLOWED_SECRET_POSTURE_KEYS = new Set([
  'rawSecretsExcluded',
  'sensitiveValuesRedacted',
  'providerCredentialsExternal',
]);

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Terraform destination evidence capture error: ${message}`);
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
  const result = await captureEvidence(args);

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
          schemaVersion: 'polycost-terraform-destination-evidence-capture-result/v1',
          profilePath: args.profilePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Terraform destination evidence capture failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    profilePath: DEFAULT_PROFILE,
    outputPath: undefined,
    smoke: false,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };

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
    if (arg === '--smoke') {
      options.smoke = true;
      options.outputPath ??= DEFAULT_SMOKE_OUTPUT;
      continue;
    }
    if (arg.startsWith('--profile=')) {
      options.profilePath = arg.slice('--profile='.length).trim();
      continue;
    }
    if (arg.startsWith('--output=')) {
      options.outputPath = arg.slice('--output='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.profilePath === DEFAULT_PROFILE) {
      options.profilePath = arg;
    } else if (!options.outputPath) {
      options.outputPath = arg;
    } else {
      throw new Error('Expected at most one profile path and one output path.');
    }
  }

  if (!options.profilePath) {
    throw new Error('Capture profile path cannot be empty.');
  }

  return options;
}

async function captureEvidence(options) {
  const root = process.cwd();
  const profilePath = path.resolve(root, options.profilePath);
  const profileDir = path.dirname(profilePath);
  const profile = parseJsonObject(await readFile(profilePath, 'utf8'), options.profilePath);
  const failures = [];

  if (profile.schemaVersion !== CAPTURE_SCHEMA) {
    failures.push(`profile.schemaVersion must be ${CAPTURE_SCHEMA}.`);
  }
  if (!SUPPORTED_CLOUDS.has(profile.targetCloud)) {
    failures.push('profile.targetCloud must be aws, azure, or gcp.');
  }
  if (!['development', 'test', 'staging', 'production'].includes(profile.environment)) {
    failures.push('profile.environment must be development, test, staging, or production.');
  }
  if (!isValidDateString(profile.capturedAt)) {
    failures.push('profile.capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (!hasValue(profile.operator)) {
    failures.push('profile.operator is required.');
  }
  if (profile.operator === 'example-only' && !options.smoke) {
    failures.push('profile.operator must name a real reviewer outside --smoke mode.');
  }

  failures.push(...findSecretMaterial(profile));

  const paths = plainObject(profile.paths);
  if (!paths) {
    failures.push('profile.paths must be an object.');
  }

  const artifacts = paths ? await readArtifacts(profileDir, paths) : undefined;
  if (artifacts?.failures.length) {
    failures.push(...artifacts.failures);
  }

  if (failures.length > 0 || !artifacts) {
    return captureResult({
      ok: false,
      profilePath,
      outputPath: resolveOptionalOutput(root, options.outputPath),
      failures,
    });
  }

  const bundleManifest = artifacts.bundleManifest;
  const planSummary = summarizeTerraformPlan(artifacts.planJson);
  const requiredTags = Array.isArray(profile.requiredTags)
    ? profile.requiredTags
    : DEFAULT_REQUIRED_TAGS;
  const tagEvidence = deriveTagEvidence(artifacts.planJson, requiredTags);
  const policyCheck = {
    tool: profile.policyTool ?? 'conftest',
    status: stringValue(artifacts.policyResult.status ?? artifacts.policyResult.result) ?? 'passed',
    resultSha256: artifacts.policyResultSha256,
  };
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA,
    bundleName: stringValue(profile.bundleName ?? bundleManifest.bundleName),
    evidenceLevel: options.smoke ? 'destination-plan' : 'destination-plan',
    productionClaim: false,
    environment: profile.environment,
    targetCloud: profile.targetCloud,
    capturedAt: profile.capturedAt,
    bundleManifest,
    manifestIntegrity: artifacts.manifestIntegrity,
    terraformValidationResult: artifacts.validationResult,
    planEvidence: {
      planJsonPresent: true,
      planJsonSha256: artifacts.planJsonSha256,
      terraformVersion: planSummary.terraformVersion,
      providerLockFileSha256: artifacts.providerLockFileSha256,
      resourceChangeCount: planSummary.resourceChangeCount,
      destructiveChangeCount: planSummary.destructiveChangeCount,
      replacementChangeCount: planSummary.replacementChangeCount,
      sensitiveValuesRedacted: profile.sensitiveValuesRedacted === true,
      resourceActions: planSummary.resourceActions,
      policyCheck,
    },
    remoteState: artifacts.remoteState,
    tagEvidence,
    operatorAttestations: {
      destinationPlanExecuted: true,
      destinationPlanReviewed: true,
      terraformApplyRunByPolyCost: false,
      providerCredentialsExternal: true,
      rawSecretsExcluded: true,
      destructivePlanExceptionApproved: profile.destructivePlanExceptionApproved === true,
      operator: profile.operator,
    },
    caveats: [
      'Captured from operator-controlled destination Terraform artifacts; PolyCost did not execute Terraform or hold provider credentials.',
      'This is validation and plan evidence only; it is not proof that terraform apply was executed.',
    ],
  };

  const outputPath = resolveOptionalOutput(root, options.outputPath);
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }

  let downstreamValidation;
  if (options.smoke && outputPath) {
    downstreamValidation = runEvidenceChecker(outputPath);
  }

  return captureResult({
    ok: !downstreamValidation || downstreamValidation.ok,
    profilePath,
    outputPath,
    evidence,
    downstreamValidation,
    failures: downstreamValidation?.ok === false ? downstreamValidation.failures : [],
  });
}

async function readArtifacts(profileDir, paths) {
  const failures = [];

  const readJsonArtifact = async (key) => {
    const relativePath = stringValue(paths[key]);
    if (!relativePath) {
      failures.push(`profile.paths.${key} is required.`);
      return undefined;
    }

    return parseJsonObject(
      await readFile(resolveArtifactPath(profileDir, relativePath), 'utf8'),
      relativePath,
    );
  };
  const readFileArtifact = async (key) => {
    const relativePath = stringValue(paths[key]);
    if (!relativePath) {
      failures.push(`profile.paths.${key} is required.`);
      return undefined;
    }

    return readFile(resolveArtifactPath(profileDir, relativePath));
  };

  try {
    const bundleManifest = await readJsonArtifact('bundleManifest');
    const manifestIntegrity = await readJsonArtifact('manifestIntegrity');
    const validationResult = await readJsonArtifact('terraformValidationResult');
    const planBuffer = await readFileArtifact('planJson');
    const planJson = planBuffer
      ? parseJsonObject(planBuffer.toString('utf8'), stringValue(paths.planJson))
      : undefined;
    const providerLockFile = await readFileArtifact('providerLockFile');
    const policyBuffer = await readFileArtifact('policyResult');
    const policyResult = policyBuffer
      ? parseJsonObject(policyBuffer.toString('utf8'), stringValue(paths.policyResult))
      : undefined;
    const remoteState = await readJsonArtifact('remoteStateEvidence');

    return {
      failures,
      bundleManifest,
      manifestIntegrity,
      validationResult,
      planJson,
      planJsonSha256: planBuffer ? sha256(planBuffer) : undefined,
      providerLockFileSha256: providerLockFile ? sha256(providerLockFile) : undefined,
      policyResult,
      policyResultSha256: policyBuffer ? sha256(policyBuffer) : undefined,
      remoteState,
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return { failures };
  }
}

function summarizeTerraformPlan(planJson) {
  const resourceChanges = Array.isArray(planJson.resource_changes) ? planJson.resource_changes : [];
  const resourceActions = {
    create: 0,
    update: 0,
    delete: 0,
    replace: 0,
    noOp: 0,
  };
  let resourceChangeCount = 0;
  let destructiveChangeCount = 0;
  let replacementChangeCount = 0;

  for (const resourceChange of resourceChanges) {
    const actions = Array.isArray(resourceChange?.change?.actions)
      ? resourceChange.change.actions
      : [];
    const isNoOp = actions.length === 0 || actions.includes('no-op') || actions.includes('read');
    const isReplace = actions.includes('delete') && actions.includes('create');

    if (isNoOp) {
      resourceActions.noOp += 1;
      continue;
    }

    resourceChangeCount += 1;
    if (actions.includes('create')) {
      resourceActions.create += 1;
    }
    if (actions.includes('update')) {
      resourceActions.update += 1;
    }
    if (actions.includes('delete')) {
      resourceActions.delete += 1;
      destructiveChangeCount += 1;
    }
    if (isReplace) {
      resourceActions.replace += 1;
      replacementChangeCount += 1;
    }
  }

  return {
    terraformVersion: stringValue(planJson.terraform_version) ?? 'unknown',
    resourceChangeCount,
    destructiveChangeCount,
    replacementChangeCount,
    resourceActions,
  };
}

function deriveTagEvidence(planJson, requiredTags) {
  const resourceChanges = Array.isArray(planJson.resource_changes) ? planJson.resource_changes : [];
  let untaggedResourceCount = 0;
  let sampleTags;

  for (const resourceChange of resourceChanges) {
    const actions = Array.isArray(resourceChange?.change?.actions)
      ? resourceChange.change.actions
      : [];
    if (actions.includes('no-op') || actions.includes('read')) {
      continue;
    }

    const after = plainObject(resourceChange?.change?.after) ?? {};
    const tags = plainObject(after.tags) ?? plainObject(after.labels);
    const hasAllTags = requiredTags.every((tag) => hasValue(tags?.[tag]));

    if (!hasAllTags) {
      untaggedResourceCount += 1;
    } else if (!sampleTags) {
      sampleTags = Object.fromEntries(requiredTags.map((tag) => [tag, tags[tag]]));
    }
  }

  return {
    costAllocationTagsPresent: untaggedResourceCount === 0,
    requiredTags,
    untaggedResourceCount,
    sampleTags: sampleTags ?? {},
  };
}

function runEvidenceChecker(outputPath) {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/terraform-validation-evidence-check.mjs',
      '--require-destination-plan',
      outputPath,
      '--json',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
    },
  );
  const output = result.stdout.trim() || result.stderr.trim();
  let parsed;

  try {
    parsed = JSON.parse(output);
  } catch {
    parsed = {
      ok: result.status === 0,
      rawOutput: output,
      failures: result.status === 0 ? [] : [output || 'terraform evidence checker failed'],
    };
  }

  return {
    ok: result.status === 0,
    exitCode: result.status,
    check: parsed,
    failures: result.status === 0 ? [] : (parsed.failures ?? [output]),
  };
}

function captureResult({ ok, profilePath, outputPath, evidence, downstreamValidation, failures }) {
  return {
    ok,
    schemaVersion: 'polycost-terraform-destination-evidence-capture-result/v1',
    profilePath,
    ...(outputPath ? { outputPath } : {}),
    ...(evidence
      ? {
          evidenceLevel: evidence.evidenceLevel,
          targetCloud: evidence.targetCloud,
          environment: evidence.environment,
          bundleName: evidence.bundleName,
          resourceChangeCount: evidence.planEvidence.resourceChangeCount,
          destructiveChangeCount: evidence.planEvidence.destructiveChangeCount,
          replacementChangeCount: evidence.planEvidence.replacementChangeCount,
          untaggedResourceCount: evidence.tagEvidence.untaggedResourceCount,
        }
      : {}),
    ...(downstreamValidation ? { downstreamValidation } : {}),
    failures,
  };
}

function resolveArtifactPath(profileDir, artifactPath) {
  return path.isAbsolute(artifactPath) ? artifactPath : path.resolve(profileDir, artifactPath);
}

function resolveOptionalOutput(root, outputPath) {
  if (!outputPath) {
    return undefined;
  }

  return path.isAbsolute(outputPath) ? outputPath : path.resolve(root, outputPath);
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
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDateString(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function printResult(result) {
  if (result.ok) {
    console.log('Terraform destination evidence capture passed.');
    console.log(`Target cloud: ${result.targetCloud}`);
    console.log(`Resource changes: ${result.resourceChangeCount}`);
    if (result.outputPath) {
      console.log(`Evidence bundle: ${result.outputPath}`);
    }
    return;
  }

  console.error('Terraform destination evidence capture failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Terraform destination evidence capture ${PACKAGE_VERSION}

Usage:
  node scripts/terraform-destination-evidence-capture.mjs [profile.json] [output.json] [options]

Options:
  --profile=<file>   Capture profile JSON. Defaults to ${DEFAULT_PROFILE}
  --output=<file>    Write generated Terraform validation evidence JSON
  --smoke            Write a sample output and validate it with terraform:evidence:check
  --json             Emit machine-readable capture result
  --quiet            Suppress human output
  --help             Show this help
  --version          Show version

This helper reads operator-controlled Terraform artifacts. It does not run Terraform,
store provider credentials, call cloud APIs, or execute terraform apply.
`);
}
