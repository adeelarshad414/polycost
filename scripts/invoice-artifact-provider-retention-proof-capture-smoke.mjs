#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const capturePath = path.join(
  process.cwd(),
  'scripts/invoice-artifact-provider-retention-proof-capture.mjs',
);
const plannerPath = path.join(
  process.cwd(),
  'scripts/invoice-artifact-provider-retention-proof-capture-plan.mjs',
);

const cases = [
  {
    provider: 'aws-s3',
    uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt?versionId=v1',
    expectedCommand: 'aws',
    expectedArgs: ['s3api', 'get-object-retention', '--bucket', 'polycost-invoice-artifacts'],
  },
  {
    provider: 'azure-blob',
    uri: 'azure-blob://polycostacct/invoices/invoice-artifacts/team/reconciliation/artifact.txt',
    expectedCommand: 'az',
    expectedArgs: ['storage', 'blob', 'immutability-policy', 'show'],
  },
  {
    provider: 'gcp-gcs',
    uri: 'gs://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
    expectedCommand: 'gcloud',
    expectedArgs: ['storage', 'objects', 'describe'],
  },
];

for (const entry of cases) {
  const result = spawnSync(
    process.execPath,
    [
      capturePath,
      entry.provider,
      entry.uri,
      '--output-dir=artifacts/provider-retention-proof/smoke',
      '--dry-run',
      '--json',
    ],
    {
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    fail(`Expected ${entry.provider} capture dry-run to pass.`, result);
  }

  const parsed = JSON.parse(result.stdout);

  if (parsed.schemaVersion !== 'invoice-artifact-provider-retention-proof-capture/v1') {
    fail(`Expected ${entry.provider} capture schema version.`, result);
  }

  if (parsed.cloudCliExecutionByPolyCost !== false || parsed.dryRun !== true) {
    fail(`Expected ${entry.provider} dry-run to avoid cloud CLI execution.`, result);
  }

  const matchingCommand = parsed.plannedCommands?.find(
    (command) =>
      command.command === entry.expectedCommand &&
      entry.expectedArgs.every((expected) => command.args.includes(expected)),
  );

  if (!matchingCommand) {
    fail(`Expected ${entry.provider} structured provider command.`, result);
  }

  if (
    matchingCommand.args.join(' ').includes(';') ||
    matchingCommand.args.join(' ').includes('|')
  ) {
    fail(`Expected ${entry.provider} command args to avoid shell control characters.`, result);
  }

  if (parsed.providerCredentialsStoredByPolyCost !== false) {
    fail(`Expected ${entry.provider} to avoid storing provider credentials.`, result);
  }
}

const signedUriFailures = [
  {
    script: capturePath,
    provider: 'aws-s3',
    uri: 's3://bucket/object.txt?X-Amz-Signature=secret',
  },
  {
    script: capturePath,
    provider: 'azure-blob',
    uri: 'azure-blob://account/container/object.txt?sig=secret',
  },
  {
    script: plannerPath,
    provider: 'azure-blob',
    uri: 'azure-blob://account/container/object.txt?sig=secret',
  },
];

for (const entry of signedUriFailures) {
  const result = spawnSync(process.execPath, [entry.script, entry.provider, entry.uri, '--json'], {
    encoding: 'utf8',
  });

  if (result.status === 0) {
    fail(`Expected signed URI rejection for ${entry.provider}.`, result);
  }

  const parsed = JSON.parse(result.stdout);
  const rejected = parsed.failures?.some((failure) =>
    String(failure).includes('unsupported query parameters'),
  );

  if (!rejected) {
    fail(`Expected signed URI query rejection for ${entry.provider}.`, result);
  }
}

const outsideWorkspace = spawnSync(
  process.execPath,
  [
    capturePath,
    'gcp-gcs',
    'gs://bucket/object.txt',
    '--output-dir=/tmp/polycloud-proof',
    '--dry-run',
    '--json',
  ],
  {
    encoding: 'utf8',
  },
);

if (outsideWorkspace.status === 0) {
  fail('Expected output-dir outside workspace to be rejected.', outsideWorkspace);
}

console.log('Provider retention proof capture smoke passed.');

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
