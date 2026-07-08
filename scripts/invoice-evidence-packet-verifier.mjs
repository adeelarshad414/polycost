#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const MAX_PACKET_BYTES = 2 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invoice evidence packet verifier error: ${message}`);
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
  const result = await verifyPacketFile(args.filePath);

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
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Invoice evidence packet verification failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    filePath: undefined,
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
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.filePath) {
      throw new Error('Expected exactly one packet JSON file path.');
    }

    options.filePath = arg;
  }

  if (!options.help && !options.version && !options.filePath) {
    throw new Error('Missing packet JSON file path. Run with --help for usage.');
  }

  return options;
}

async function verifyPacketFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = await readFile(absolutePath, 'utf8');

  if (Buffer.byteLength(content, 'utf8') > MAX_PACKET_BYTES) {
    throw new Error(`Packet exceeds ${MAX_PACKET_BYTES} byte safety limit.`);
  }

  const packet = parseJsonObject(content);
  const integrity = parseJsonObject(packet.integrity, 'integrity');
  const payload = { ...packet };
  delete payload.integrity;

  const canonicalPayload = stableJson(payload);
  const payloadDigestSha256 = sha256(canonicalPayload);
  const payloadByteLength = Buffer.byteLength(canonicalPayload, 'utf8');
  const failures = [];

  assertEqual(failures, 'packetVersion', packet.packetVersion, 'invoice-evidence-packet/v1');
  assertEqual(
    failures,
    'integrity.schemaVersion',
    integrity.schemaVersion,
    'invoice-evidence-packet-integrity/v1',
  );
  assertEqual(failures, 'integrity.canonicalization', integrity.canonicalization, 'stable-json:v1');
  assertEqual(failures, 'integrity.digestAlgorithm', integrity.digestAlgorithm, 'sha256');

  if (typeof integrity.payloadDigestSha256 !== 'string') {
    failures.push('integrity.payloadDigestSha256 must be a string.');
  } else if (!SHA256_PATTERN.test(integrity.payloadDigestSha256)) {
    failures.push('integrity.payloadDigestSha256 must be a lowercase 64-character SHA-256 hex.');
  }

  assertEqual(
    failures,
    'integrity.payloadDigestSha256',
    integrity.payloadDigestSha256,
    payloadDigestSha256,
  );
  assertEqual(
    failures,
    'integrity.payloadByteLength',
    integrity.payloadByteLength,
    payloadByteLength,
  );
  assertEqual(failures, 'integrity.generatedAt', integrity.generatedAt, packet.generatedAt);
  assertSubject(failures, packet, integrity);
  assertCounts(failures, packet, integrity);

  return {
    ok: failures.length === 0,
    file: absolutePath,
    packetVersion: typeof packet.packetVersion === 'string' ? packet.packetVersion : undefined,
    packetStatus: typeof packet.packetStatus === 'string' ? packet.packetStatus : undefined,
    generatedAt: typeof packet.generatedAt === 'string' ? packet.generatedAt : undefined,
    digestAlgorithm: 'sha256',
    payloadDigestSha256,
    payloadByteLength,
    subject: isPlainObject(integrity.subject) ? integrity.subject : undefined,
    failures,
  };
}

function assertSubject(failures, packet, integrity) {
  const subject = isPlainObject(integrity.subject) ? integrity.subject : {};
  const reconciliation = isPlainObject(packet.reconciliation) ? packet.reconciliation : {};
  const importRun = isPlainObject(packet.importRun) ? packet.importRun : {};

  assertEqual(
    failures,
    'integrity.subject.reconciliationId',
    subject.reconciliationId,
    reconciliation.id,
  );
  assertEqual(
    failures,
    'integrity.subject.importRunId',
    subject.importRunId,
    reconciliation.importRunId,
  );
  assertEqual(
    failures,
    'integrity.subject.comparisonId',
    subject.comparisonId,
    reconciliation.comparisonId,
  );
  assertEqual(failures, 'integrity.subject.provider', subject.provider, reconciliation.provider);
  assertEqual(failures, 'importRun.id', importRun.id, reconciliation.importRunId);
  assertEqual(failures, 'importRun.provider', importRun.provider, reconciliation.provider);
}

function assertCounts(failures, packet, integrity) {
  const artifacts = Array.isArray(packet.artifacts) ? packet.artifacts : [];
  const controls = isPlainObject(packet.controls) ? packet.controls : {};
  const caveats = Array.isArray(packet.caveats) ? packet.caveats : [];
  const disclaimers = Array.isArray(packet.disclaimers) ? packet.disclaimers : [];
  const storedArtifactCount = artifacts.filter(
    (artifact) => isPlainObject(artifact) && artifact.stored === true,
  ).length;
  const verifiedArtifactCount = artifacts.filter(
    (artifact) => isPlainObject(artifact) && artifact.verificationStatus === 'verified',
  ).length;

  assertEqual(failures, 'integrity.artifactCount', integrity.artifactCount, artifacts.length);
  assertEqual(
    failures,
    'integrity.storedArtifactCount',
    integrity.storedArtifactCount,
    storedArtifactCount,
  );
  assertEqual(
    failures,
    'integrity.verifiedArtifactCount',
    integrity.verifiedArtifactCount,
    verifiedArtifactCount,
  );
  assertEqual(failures, 'controls.storedCount', controls.storedCount, storedArtifactCount);
  assertEqual(failures, 'controls.verifiedCount', controls.verifiedCount, verifiedArtifactCount);
  assertEqual(failures, 'integrity.caveatCount', integrity.caveatCount, caveats.length);
  assertEqual(failures, 'integrity.disclaimerCount', integrity.disclaimerCount, disclaimers.length);
}

function assertEqual(failures, field, actual, expected) {
  if (actual !== expected) {
    failures.push(
      `${field} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
    );
  }
}

function parseJsonObject(content, label = 'packet') {
  let parsed;

  if (typeof content === 'string') {
    parsed = JSON.parse(content);
  } else {
    parsed = content;
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function printResult(result) {
  if (result.ok) {
    console.log(`Invoice evidence packet verified: ${result.payloadDigestSha256}`);
    console.log(
      `Subject: ${result.subject?.provider ?? 'unknown'} ${result.subject?.reconciliationId ?? ''}`.trim(),
    );
    return;
  }

  console.error('Invoice evidence packet verification failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`PolyCost invoice evidence packet verifier

Usage:
  node scripts/invoice-evidence-packet-verifier.mjs <packet.json> [--json] [--quiet]
  npm run invoice:evidence:verify -- <packet.json>

Options:
  --json       Print machine-readable verification output.
  --quiet      Suppress human-readable output; exit code still reflects status.
  -h, --help   Show this help text.
  -v, --version
              Show verifier version.

The verifier recomputes the stable-json:v1 SHA-256 digest over the packet payload
excluding the integrity block, then validates subject IDs and artifact/control
counts so reviewers can detect tampering after export.`);
}
