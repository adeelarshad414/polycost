#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const fixturePath = path.join(
  process.cwd(),
  'test/fixtures/billing/invoice-evidence-packet.valid.json',
);
const verifierPath = path.join(process.cwd(), 'scripts/invoice-evidence-packet-verifier.mjs');

const validResult = spawnSync(process.execPath, [verifierPath, fixturePath, '--quiet'], {
  encoding: 'utf8',
});

if (validResult.status !== 0) {
  fail('Expected valid fixture verification to pass.', validResult);
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'polycost-evidence-packet-'));

try {
  const tamperedPath = path.join(tempDir, 'tampered-packet.json');
  const packet = JSON.parse(readFileSync(fixturePath, 'utf8'));

  packet.reconciliation.invoicedTotalUsd = 108;
  writeFileSync(tamperedPath, JSON.stringify(packet, null, 2));

  const tamperedResult = spawnSync(process.execPath, [verifierPath, tamperedPath, '--json'], {
    encoding: 'utf8',
  });

  if (tamperedResult.status === 0) {
    fail('Expected tampered packet verification to fail.', tamperedResult);
  }

  const parsed = JSON.parse(tamperedResult.stdout);
  const hasDigestMismatch = parsed.failures?.some((failure) =>
    String(failure).includes('payloadDigestSha256 mismatch'),
  );

  if (!hasDigestMismatch) {
    fail('Expected tampered packet verification to report a digest mismatch.', tamperedResult);
  }
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}

console.log('Invoice evidence packet verifier smoke passed.');

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
