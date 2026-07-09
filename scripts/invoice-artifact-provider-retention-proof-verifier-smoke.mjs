#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const verifierPath = path.join(
  root,
  'scripts/invoice-artifact-provider-retention-proof-verifier.mjs',
);
const fixtures = [
  {
    provider: 'aws-s3',
    path: 'test/fixtures/billing/provider-retention-proof-aws.json',
    expectedEvidenceType: 'aws-s3-object-lock',
  },
  {
    provider: 'azure-blob',
    path: 'test/fixtures/billing/provider-retention-proof-azure.json',
    expectedEvidenceType: 'azure-blob-immutability',
  },
  {
    provider: 'gcp-gcs',
    path: 'test/fixtures/billing/provider-retention-proof-gcp.json',
    expectedEvidenceType: 'gcp-gcs-retention',
  },
];

for (const fixture of fixtures) {
  const absolutePath = path.join(root, fixture.path);
  const digest = sha256(readFileSync(absolutePath, 'utf8'));
  const result = spawnSync(
    process.execPath,
    [
      verifierPath,
      fixture.provider,
      absolutePath,
      `--expected-sha256=${digest}`,
      `--reference=proof://${fixture.provider}/fixture`,
      '--json',
    ],
    {
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    fail(`Expected ${fixture.provider} proof verification to pass.`, result);
  }

  const parsed = JSON.parse(result.stdout);
  if (parsed.proofDigestSha256 !== digest) {
    fail(`Expected ${fixture.provider} digest to round-trip.`, result);
  }
  if (parsed.summary?.providerEvidenceType !== fixture.expectedEvidenceType) {
    fail(
      `Expected ${fixture.provider} evidence type to be ${fixture.expectedEvidenceType}.`,
      result,
    );
  }
  if (
    parsed.recommendedRuntimeConfig?.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE !==
    'provider-control-plane'
  ) {
    fail(`Expected ${fixture.provider} proof to emit provider-control-plane config.`, result);
  }
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'polycost-provider-proof-'));

try {
  const invalidPath = path.join(tempDir, 'invalid-proof.json');
  writeFileSync(invalidPath, JSON.stringify({ Retention: { Mode: 'COMPLIANCE' } }, null, 2));

  const invalidResult = spawnSync(
    process.execPath,
    [verifierPath, 'aws-s3', invalidPath, '--json'],
    {
      encoding: 'utf8',
    },
  );

  if (invalidResult.status === 0) {
    fail('Expected AWS proof missing retention date/legal hold to fail.', invalidResult);
  }

  const invalidParsed = JSON.parse(invalidResult.stdout);
  const hasRetentionFailure = invalidParsed.failures?.some((failure) =>
    String(failure).includes('object retention or LegalHold.Status=ON'),
  );

  if (!hasRetentionFailure) {
    fail('Expected missing retention proof failure message.', invalidResult);
  }

  const digestMismatchResult = spawnSync(
    process.execPath,
    [
      verifierPath,
      'gcp-gcs',
      path.join(root, 'test/fixtures/billing/provider-retention-proof-gcp.json'),
      `--expected-sha256=${'0'.repeat(64)}`,
      '--json',
    ],
    {
      encoding: 'utf8',
    },
  );

  if (digestMismatchResult.status === 0) {
    fail('Expected digest mismatch to fail.', digestMismatchResult);
  }

  const digestMismatchParsed = JSON.parse(digestMismatchResult.stdout);
  const hasDigestFailure = digestMismatchParsed.failures?.some((failure) =>
    String(failure).includes('proof digest mismatch'),
  );

  if (!hasDigestFailure) {
    fail('Expected digest mismatch failure message.', digestMismatchResult);
  }
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}

console.log('Provider retention proof verifier smoke passed.');

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function fail(message, result) {
  console.error(message);
  if (result.stdout) {
    console.error(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exit(1);
}
