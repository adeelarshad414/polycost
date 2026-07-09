#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const MAX_PROOF_BYTES = 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Provider retention proof verifier error: ${message}`);
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
  const result = await verifyProofFile(args);

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
          file: args.filePath,
          provider: args.provider,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Provider retention proof verification failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    provider: undefined,
    filePath: undefined,
    expectedSha256: undefined,
    reference: undefined,
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
    if (arg.startsWith('--provider=')) {
      options.provider = normalizeProvider(arg.slice('--provider='.length));
      continue;
    }
    if (arg.startsWith('--file=')) {
      options.filePath = arg.slice('--file='.length);
      continue;
    }
    if (arg.startsWith('--expected-sha256=')) {
      options.expectedSha256 = arg.slice('--expected-sha256='.length).trim();
      continue;
    }
    if (arg.startsWith('--reference=')) {
      options.reference = arg.slice('--reference='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (!options.provider && positionals[0]) {
    options.provider = normalizeProvider(positionals.shift());
  }
  if (!options.filePath && positionals[0]) {
    options.filePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected provider and one proof JSON file path.');
  }

  if (options.expectedSha256 && !SHA256_PATTERN.test(options.expectedSha256)) {
    throw new Error('--expected-sha256 must be a lowercase 64-character SHA-256 hex digest.');
  }

  if (!options.help && !options.version) {
    if (!options.provider) {
      throw new Error('Missing provider. Use aws-s3, azure-blob, or gcp-gcs.');
    }
    if (!options.filePath) {
      throw new Error('Missing provider proof JSON file path.');
    }
  }

  return options;
}

async function verifyProofFile(options) {
  const absolutePath = path.resolve(process.cwd(), options.filePath);
  const content = await readFile(absolutePath, 'utf8');
  const byteLength = Buffer.byteLength(content, 'utf8');

  if (byteLength > MAX_PROOF_BYTES) {
    throw new Error(`Proof file exceeds ${MAX_PROOF_BYTES} byte safety limit.`);
  }

  const digestSha256 = sha256(content);
  const failures = [];

  if (options.expectedSha256 && options.expectedSha256 !== digestSha256) {
    failures.push(
      `proof digest mismatch: expected ${options.expectedSha256}, got ${digestSha256}.`,
    );
  }

  const proof = parseJsonObject(content);
  const assessment = assessProviderProof(options.provider, proof);

  failures.push(...assessment.failures);

  const ok = failures.length === 0;

  return {
    ok,
    schemaVersion: 'invoice-artifact-provider-retention-proof-verification/v1',
    provider: options.provider,
    file: absolutePath,
    byteLength,
    proofDigestSha256: digestSha256,
    ...(options.reference ? { proofReference: options.reference } : {}),
    controlPlaneEvidencePresent: ok,
    immutableRetentionProvedByPolyCost: false,
    summary: assessment.summary,
    caveats: [
      'This verifies a captured provider proof artifact and digest; it does not call the cloud provider control plane itself.',
      'Legal immutability, retention sufficiency, and chain-of-custody remain operator-owned controls.',
    ],
    ...(ok
      ? {
          recommendedRuntimeConfig: {
            INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE: 'provider-control-plane',
            ...(options.reference
              ? { INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE: options.reference }
              : {}),
            INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256: digestSha256,
          },
        }
      : {}),
    failures,
  };
}

function assessProviderProof(provider, proof) {
  if (provider === 'aws-s3') {
    return assessAwsS3Proof(proof);
  }
  if (provider === 'azure-blob') {
    return assessAzureBlobProof(proof);
  }
  if (provider === 'gcp-gcs') {
    return assessGcpGcsProof(proof);
  }

  return {
    failures: [`Unsupported provider ${provider}.`],
    summary: {},
  };
}

function assessAwsS3Proof(proof) {
  const retention = plainObject(firstDefined([proof.Retention, proof.retention])) ?? {};
  const legalHold = plainObject(firstDefined([proof.LegalHold, proof.legalHold])) ?? {};
  const mode = firstString([retention.Mode, retention.mode]);
  const retentionUntil = firstString([
    retention.RetainUntilDate,
    retention.retainUntilDate,
    retention.retainUntil,
  ]);
  const legalHoldStatus = firstString([legalHold.Status, legalHold.status]);
  const legalHoldActive = legalHoldStatus?.toUpperCase() === 'ON';
  const failures = [];

  if (retentionUntil) {
    const parsed = parseDate(retentionUntil);
    if (!parsed.ok) {
      failures.push('AWS S3 Retention.RetainUntilDate must be a valid date.');
    } else if (parsed.date.getTime() <= Date.now() && !legalHoldActive) {
      failures.push('AWS S3 Retention.RetainUntilDate is not in the future.');
    }
  }

  if (retentionUntil && !['GOVERNANCE', 'COMPLIANCE'].includes((mode ?? '').toUpperCase())) {
    failures.push('AWS S3 Retention.Mode must be GOVERNANCE or COMPLIANCE.');
  }

  if (!retentionUntil && !legalHoldActive) {
    failures.push('AWS S3 proof must include object retention or LegalHold.Status=ON.');
  }

  return {
    failures,
    summary: {
      providerEvidenceType: 'aws-s3-object-lock',
      retentionMode: mode,
      retentionUntil,
      legalHold: legalHoldActive,
    },
  };
}

function assessAzureBlobProof(proof) {
  const properties = plainObject(proof.properties) ?? {};
  const immutabilityPolicy = plainObject(proof.immutabilityPolicy) ?? {};
  const legalHold = plainObject(proof.legalHold) ?? {};
  const retentionUntil = firstString([
    proof.immutabilityPolicyUntilDate,
    proof.immutabilityPolicyExpiresOn,
    properties.immutabilityPolicyExpiresOn,
    properties.immutabilityPolicyUntilDate,
    immutabilityPolicy.expiresOn,
    immutabilityPolicy.untilDate,
  ]);
  const policyMode = firstString([
    proof.policyMode,
    proof.immutabilityPolicyMode,
    proof.state,
    properties.immutabilityPolicyMode,
    immutabilityPolicy.policyMode,
    immutabilityPolicy.state,
  ]);
  const retentionDays = firstNumber([
    proof.immutabilityPeriodSinceCreationInDays,
    properties.immutabilityPeriodSinceCreationInDays,
    immutabilityPolicy.immutabilityPeriodSinceCreationInDays,
  ]);
  const legalHoldActive =
    proof.hasLegalHold === true ||
    legalHold.hasLegalHold === true ||
    legalHold.status === 'locked' ||
    firstString([proof.legalHoldStatus, legalHold.status])?.toLowerCase() === 'on';
  const failures = [];

  if (retentionUntil) {
    const parsed = parseDate(retentionUntil);
    if (!parsed.ok) {
      failures.push('Azure Blob immutability policy until/expires date must be valid.');
    } else if (parsed.date.getTime() <= Date.now() && !legalHoldActive) {
      failures.push('Azure Blob immutability policy date is not in the future.');
    }
  }

  if (!retentionUntil && !legalHoldActive && !(retentionDays && retentionDays > 0)) {
    failures.push(
      'Azure Blob proof must include an immutability policy date, positive immutability period, or active legal hold.',
    );
  }

  return {
    failures,
    summary: {
      providerEvidenceType: 'azure-blob-immutability',
      retentionMode: policyMode,
      retentionUntil,
      retentionDays,
      legalHold: legalHoldActive,
    },
  };
}

function assessGcpGcsProof(proof) {
  const metadata = plainObject(proof.metadata) ?? {};
  const retention = plainObject(proof.retention) ?? {};
  const retentionPolicy = plainObject(proof.retentionPolicy) ?? {};
  const retentionUntil = firstString([
    proof.retentionExpirationTime,
    proof.retentionExpireTime,
    retention.expireTime,
    retention.retainUntilTime,
    metadata.retentionExpirationTime,
  ]);
  const retentionPeriodSeconds = firstNumber([
    retentionPolicy.retentionPeriod,
    proof.retentionPeriod,
    retention.retentionPeriod,
  ]);
  const holdActive = proof.eventBasedHold === true || proof.temporaryHold === true;
  const failures = [];

  if (retentionUntil) {
    const parsed = parseDate(retentionUntil);
    if (!parsed.ok) {
      failures.push('GCP Cloud Storage retention expiration time must be a valid date.');
    } else if (parsed.date.getTime() <= Date.now() && !holdActive) {
      failures.push('GCP Cloud Storage retention expiration time is not in the future.');
    }
  }

  if (!retentionUntil && !holdActive && !(retentionPeriodSeconds && retentionPeriodSeconds > 0)) {
    failures.push(
      'GCP Cloud Storage proof must include retentionExpirationTime, a hold, or positive retentionPolicy.retentionPeriod.',
    );
  }

  return {
    failures,
    summary: {
      providerEvidenceType: 'gcp-gcs-retention',
      retentionMode: firstString([retention.mode, proof.retentionMode]),
      retentionUntil,
      retentionPeriodSeconds,
      legalHold: holdActive,
    },
  };
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

  throw new Error(`Unsupported provider ${value}. Use aws-s3, azure-blob, or gcp-gcs.`);
}

function printResult(result) {
  if (!result.ok) {
    console.error('Provider retention proof verification failed:');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    return;
  }

  console.log('Provider retention proof verification passed.');
  console.log(`Provider: ${result.provider}`);
  console.log(`Digest: ${result.proofDigestSha256}`);
  if (result.proofReference) {
    console.log(`Reference: ${result.proofReference}`);
  }
  console.log('Recommended runtime config:');
  for (const [key, value] of Object.entries(result.recommendedRuntimeConfig)) {
    console.log(`${key}=${value}`);
  }
}

function printHelp() {
  console.log(`Provider retention proof verifier ${PACKAGE_VERSION}

Usage:
  node scripts/invoice-artifact-provider-retention-proof-verifier.mjs <provider> <proof.json> [options]

Providers:
  aws-s3      AWS S3 object-lock retention or legal-hold JSON
  azure-blob  Azure Blob immutability policy or legal-hold JSON
  gcp-gcs     GCP Cloud Storage object retention or hold JSON

Options:
  --expected-sha256=<digest>  Require the proof file SHA-256 to match this digest
  --reference=<uri>           Include the durable proof reference in output
  --json                      Emit machine-readable JSON
  --quiet                     Suppress human output
  --help                      Show this help
  --version                   Show version
`);
}

function parseJsonObject(content) {
  try {
    const parsed = JSON.parse(content);
    if (!isPlainObject(parsed)) {
      throw new Error('Provider proof must be a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Provider proof file must contain valid JSON.');
    }
    throw error;
  }
}

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null);
}

function firstString(values) {
  const value = firstDefined(values);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstNumber(values) {
  const value = firstDefined(values);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function plainObject(value) {
  return isPlainObject(value) ? value : undefined;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDate(value) {
  const date = new Date(value);
  return {
    ok: Number.isFinite(date.getTime()),
    date,
  };
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}
