#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

const plannerPath = path.join(
  process.cwd(),
  'scripts/invoice-artifact-provider-retention-proof-capture-plan.mjs',
);

const cases = [
  {
    provider: 'aws-s3',
    uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt?versionId=v1',
    expectedCommand: 'aws s3api get-object-retention',
    expectedVerifier: 'npm run invoice:retention-proof:verify -- aws-s3',
    expectedObjectKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
  },
  {
    provider: 'azure-blob',
    uri: 'azure-blob://polycostacct/invoices/invoice-artifacts/team/reconciliation/artifact.txt',
    expectedCommand: 'az storage blob immutability-policy show',
    expectedVerifier: 'npm run invoice:retention-proof:verify -- azure-blob',
    expectedObjectKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
  },
  {
    provider: 'gcp-gcs',
    uri: 'gs://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
    expectedCommand: 'gcloud storage objects describe',
    expectedVerifier: 'npm run invoice:retention-proof:verify -- gcp-gcs',
    expectedObjectKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
  },
];

for (const entry of cases) {
  const result = spawnSync(
    process.execPath,
    [
      plannerPath,
      entry.provider,
      entry.uri,
      '--output-dir=artifacts/provider-retention-proof/smoke',
      '--json',
    ],
    {
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    fail(`Expected ${entry.provider} capture plan to pass.`, result);
  }

  const parsed = JSON.parse(result.stdout);

  if (parsed.schemaVersion !== 'invoice-artifact-provider-retention-proof-capture-plan/v1') {
    fail(`Expected ${entry.provider} capture plan schema version.`, result);
  }

  if (!parsed.captureCommands?.some((command) => command.includes(entry.expectedCommand))) {
    fail(`Expected ${entry.provider} capture command ${entry.expectedCommand}.`, result);
  }

  if (!parsed.verifyCommand?.includes(entry.expectedVerifier)) {
    fail(`Expected ${entry.provider} verifier command ${entry.expectedVerifier}.`, result);
  }

  if (!JSON.stringify(parsed.object).includes(entry.expectedObjectKey)) {
    fail(`Expected ${entry.provider} object key to round-trip.`, result);
  }

  if (
    parsed.runtimeConfigTemplate?.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256 !==
    '<copy proofDigestSha256 from verifier output>'
  ) {
    fail(`Expected ${entry.provider} runtime config digest placeholder.`, result);
  }

  if (parsed.immutableRetentionProvedByPolyCost === true) {
    fail(`Capture plan must not claim PolyCost proves immutability for ${entry.provider}.`, result);
  }
}

const invalidResult = spawnSync(
  process.execPath,
  [plannerPath, 'aws-s3', 'gs://wrong-provider/object.json', '--json'],
  {
    encoding: 'utf8',
  },
);

if (invalidResult.status === 0) {
  fail('Expected provider/URI mismatch to fail.', invalidResult);
}

const invalidParsed = JSON.parse(invalidResult.stdout);
const hasProviderUriFailure = invalidParsed.failures?.some((failure) =>
  String(failure).includes('AWS S3 object URI must use s3://bucket/key'),
);

if (!hasProviderUriFailure) {
  fail('Expected provider/URI mismatch failure message.', invalidResult);
}

console.log('Provider retention proof capture plan smoke passed.');

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
