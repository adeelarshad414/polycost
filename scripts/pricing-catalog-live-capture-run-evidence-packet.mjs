#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const PACKET_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-packet/v1';
const BUILD_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-packet-build/v1';
const CHECK_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-packet-check/v1';
const SMOKE_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-packet-smoke/v1';
const RUN_CHECK_SCHEMA = 'polycost-pricing-catalog-live-capture-run-evidence-check/v1';
const DEFAULT_RUN_SUMMARY = '.tmp/pricing-catalog-live-capture-run/run-summary.json';
const DEFAULT_OUTPUT = '.tmp/pricing-catalog-live-capture-run-evidence-packet/packet.json';
const DEFAULT_SMOKE_DIR = '.tmp/pricing-catalog-live-capture-run-evidence-packet-smoke';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_LEVELS = new Set(['artifact-wiring-packet', 'live-run-evidence-packet']);
const FORBIDDEN_RAW_KEYS = [
  /^rawCatalogPayload$/i,
  /^rawProviderResponse$/i,
  /^rawProviderResponses$/i,
  /^authorization$/i,
  /^authorizationHeader$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^apiKey$/i,
  /^password$/i,
  /^privateKey$/i,
  /^clientSecret$/i,
  /^secretAccessKey$/i,
  /^sasToken$/i,
  /^serviceAccountJson$/i,
];
const SECRET_VALUE_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /CHANGE_ME_DEV_ONLY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsig=[A-Za-z0-9%._~+/=-]{12,}/i,
  /\bX-Amz-Signature=/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pricing catalog live capture run evidence packet error: ${message}`);
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
  const result = args.smoke
    ? await runSmoke(args)
    : args.check
      ? await checkPacketFile(args)
      : await buildPacket(args);

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
          schemaVersion: args.smoke ? SMOKE_SCHEMA : args.check ? CHECK_SCHEMA : BUILD_SCHEMA,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Pricing catalog live capture run evidence packet failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    build: true,
    check: false,
    smoke: false,
    runSummaryPath: DEFAULT_RUN_SUMMARY,
    runDir: undefined,
    packetPath: undefined,
    outputPath: DEFAULT_OUTPUT,
    packetName: 'pricing-catalog-live-capture-run-evidence-packet',
    operator: process.env.POLYCOST_OPERATOR,
    operatorRole: 'release-operator',
    requireLiveRun: false,
    requireLivePacket: false,
    smokeOutputDir: DEFAULT_SMOKE_DIR,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
    if (arg === '--build') {
      options.build = true;
      options.check = false;
      options.smoke = false;
      continue;
    }
    if (arg === '--check') {
      options.build = false;
      options.check = true;
      options.smoke = false;
      continue;
    }
    if (arg === '--smoke') {
      options.build = false;
      options.check = false;
      options.smoke = true;
      continue;
    }
    if (arg === '--require-live-run') {
      options.requireLiveRun = true;
      continue;
    }
    if (arg === '--require-live-packet') {
      options.requireLivePacket = true;
      continue;
    }
    if (arg === '--run-summary') {
      options.runSummaryPath = readOptionValue(argv, index, '--run-summary');
      index += 1;
      continue;
    }
    if (arg.startsWith('--run-summary=')) {
      options.runSummaryPath = arg.slice('--run-summary='.length).trim();
      continue;
    }
    if (arg === '--run-dir') {
      options.runDir = readOptionValue(argv, index, '--run-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--run-dir=')) {
      options.runDir = arg.slice('--run-dir='.length).trim();
      continue;
    }
    if (arg === '--packet') {
      options.packetPath = readOptionValue(argv, index, '--packet');
      index += 1;
      continue;
    }
    if (arg.startsWith('--packet=')) {
      options.packetPath = arg.slice('--packet='.length).trim();
      continue;
    }
    if (arg === '--output') {
      options.outputPath = readOptionValue(argv, index, '--output');
      index += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      options.outputPath = arg.slice('--output='.length).trim();
      continue;
    }
    if (arg === '--packet-name') {
      options.packetName = readOptionValue(argv, index, '--packet-name');
      index += 1;
      continue;
    }
    if (arg.startsWith('--packet-name=')) {
      options.packetName = arg.slice('--packet-name='.length).trim();
      continue;
    }
    if (arg === '--operator') {
      options.operator = readOptionValue(argv, index, '--operator');
      index += 1;
      continue;
    }
    if (arg.startsWith('--operator=')) {
      options.operator = arg.slice('--operator='.length).trim();
      continue;
    }
    if (arg === '--operator-role') {
      options.operatorRole = readOptionValue(argv, index, '--operator-role');
      index += 1;
      continue;
    }
    if (arg.startsWith('--operator-role=')) {
      options.operatorRole = arg.slice('--operator-role='.length).trim();
      continue;
    }
    if (arg === '--smoke-output-dir') {
      options.smokeOutputDir = readOptionValue(argv, index, '--smoke-output-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--smoke-output-dir=')) {
      options.smokeOutputDir = arg.slice('--smoke-output-dir='.length).trim();
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (options.check && positionals[0]) {
    options.packetPath = positionals.shift();
  } else if (positionals[0]) {
    options.runSummaryPath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one positional path.');
  }
  if (options.runDir) {
    options.runSummaryPath = path.join(options.runDir, 'run-summary.json');
  }
  if (options.check && !options.packetPath) {
    throw new Error('--packet or a packet JSON positional path is required with --check.');
  }

  return options;
}

function readOptionValue(argv, index, flag) {
  const value = argv[index + 1]?.trim();

  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

async function runSmoke(options) {
  const root = process.cwd();
  const outputDir = path.resolve(root, options.smokeOutputDir);
  const checkerSmokeDir = path.join(outputDir, 'run-evidence-check-smoke');
  const packetPath = path.join(outputDir, 'packet.json');
  await mkdir(outputDir, { recursive: true });

  const evidenceSmoke = runJsonCommand({
    root,
    args: [
      'scripts/pricing-catalog-live-capture-run-evidence-check.mjs',
      '--smoke',
      '--smoke-output-dir',
      checkerSmokeDir,
      '--json',
    ],
    label: 'live capture run evidence smoke',
  });
  const syntheticSummaryPath = requireString(
    evidenceSmoke.syntheticSummaryPath,
    'evidence smoke syntheticSummaryPath',
  );

  const build = await buildPacket({
    ...options,
    smoke: false,
    check: false,
    runSummaryPath: syntheticSummaryPath,
    outputPath: packetPath,
    operator: 'Fixture Reviewer',
    operatorRole: 'fixture-smoke',
    requireLiveRun: false,
  });
  const baseCheck = await checkPacketFile({
    ...options,
    smoke: false,
    check: true,
    packetPath,
    requireLivePacket: false,
  });
  const strictCheck = await checkPacketFile({
    ...options,
    smoke: false,
    check: true,
    packetPath,
    requireLivePacket: true,
  });

  const ok =
    evidenceSmoke.ok === true &&
    build.ok === true &&
    baseCheck.ok === true &&
    strictCheck.ok === false;

  return {
    ok,
    schemaVersion: SMOKE_SCHEMA,
    outputDir,
    packetPath,
    evidenceSmokeSchema: evidenceSmoke.schemaVersion,
    baseFixturePacketVerified: baseCheck.ok === true,
    strictLiveRejectedFixturePacket: strictCheck.ok === false,
    build,
    baseCheck,
    strictCheck,
    caveats: [
      'Smoke mode creates a sanitized packet from fixture run evidence and verifies its integrity.',
      'Smoke mode proves fixture packets are rejected when live-run packet proof is required.',
    ],
    failures: ok
      ? []
      : ['Fixture packet build/check must pass while --require-live-packet rejects it.'],
  };
}

async function buildPacket(options) {
  const root = process.cwd();
  const outputPath = path.resolve(root, options.outputPath);
  const outputDir = path.dirname(outputPath);
  const runSummaryPath = path.resolve(root, options.runSummaryPath);
  const runCheck = runEvidenceCheck({
    root,
    runSummaryPath,
    requireLiveRun: options.requireLiveRun,
  });

  if (runCheck.status !== 0 || runCheck.result?.ok !== true) {
    throw new Error('Run evidence check must pass before building a packet.');
  }

  const packet = await buildPacketDocument({
    root,
    outputDir,
    outputPath,
    runSummaryPath,
    runCheck: runCheck.result,
    options,
  });
  await mkdir(outputDir, { recursive: true });
  await writeJson(outputPath, packet);

  const packetCheck = await checkPacketFile({
    ...options,
    check: true,
    packetPath: outputPath,
    requireLivePacket: options.requireLiveRun,
  });

  return {
    ok: packetCheck.ok === true,
    schemaVersion: BUILD_SCHEMA,
    packetPath: outputPath,
    evidenceLevel: packet.evidenceLevel,
    packetDigestSha256: packet.integrity.payloadDigestSha256,
    packetByteLength: packet.integrity.payloadByteLength,
    artifactCount: packet.artifacts.length,
    runEvidenceCheckerSchema: runCheck.result.schemaVersion,
    runEvidenceCheckerOk: runCheck.result.ok === true,
    packetVerified: packetCheck.ok === true,
    caveats: packet.caveats,
    failures: packetCheck.failures || [],
  };
}

async function buildPacketDocument({ root, outputDir, runSummaryPath, runCheck, options }) {
  const createdAt = new Date().toISOString();
  const artifacts = await buildArtifacts({
    root,
    outputDir,
    runSummaryPath,
    runCheck,
  });
  const evidenceLevel =
    runCheck.strictLiveRequired === true && runCheck.verifiedLiveCaptureArchive === true
      ? 'live-run-evidence-packet'
      : 'artifact-wiring-packet';
  const packetWithoutIntegrity = {
    schemaVersion: PACKET_SCHEMA,
    packetName: options.packetName,
    evidenceLevel,
    productionClaim: false,
    createdAt,
    operator: {
      name: requireOperator(options.operator, options.requireLiveRun),
      role: options.operatorRole,
      attestedAt: createdAt,
    },
    runSummary: {
      path: relativePath(outputDir, runSummaryPath),
      ok: runCheck.runSummaryOk === true,
      preflightReady: runCheck.preflightReady === true,
      verifiedLiveProviderSnapshot: runCheck.verifiedLiveProviderSnapshot === true,
      verifiedLiveCaptureArchive: runCheck.verifiedLiveCaptureArchive === true,
    },
    verification: {
      schemaVersion: runCheck.schemaVersion,
      strictLiveRequired: runCheck.strictLiveRequired === true,
      ok: runCheck.ok === true,
      archiveCheckerOk: runCheck.archiveCheckerOk === true,
      archiveEvidenceLevel: runCheck.archiveEvidenceLevel,
      archiveCheckerVerifiedLiveCaptureArchive:
        runCheck.archiveCheckerVerifiedLiveCaptureArchive === true,
      providerCount: runCheck.providerCount,
      fileDigests: runCheck.fileDigests,
    },
    artifacts,
    attestations: {
      rawCatalogPayloadExcluded: true,
      credentialsExcluded: true,
      signedUrlsExcluded: true,
      packetDigestVerified: true,
      runEvidenceCheckerPassed: runCheck.ok === true,
      productionClaimedByPolyCost: false,
    },
    caveats: [
      evidenceLevel === 'live-run-evidence-packet'
        ? 'This packet binds a verified live catalog capture run to immutable file digests.'
        : 'This packet validates fixture/sample artifact wiring only and must not be used as live-provider proof.',
      'Packet contents are metadata and digests only; raw provider payloads, credentials, signed URLs, and private billing artifacts must remain excluded.',
      'PolyCost catalog evidence remains list-price traceability, not invoice-grade billing or provider invoice-of-record proof.',
    ],
  };
  const canonicalPayload = stableJson(packetWithoutIntegrity);

  return {
    ...packetWithoutIntegrity,
    integrity: {
      schemaVersion: 'polycost-pricing-catalog-live-capture-run-evidence-packet-integrity/v1',
      canonicalization: 'stable-json:v1',
      digestAlgorithm: 'sha256',
      payloadDigestSha256: sha256(canonicalPayload),
      payloadByteLength: Buffer.byteLength(canonicalPayload, 'utf8'),
      generatedAt: createdAt,
      artifactCount: artifacts.length,
      evidenceLevel,
      strictLiveRequired: runCheck.strictLiveRequired === true,
    },
  };
}

async function buildArtifacts({ root, outputDir, runSummaryPath, runCheck }) {
  const artifactInputs = [
    ['run-summary', runSummaryPath],
    ['preflight', resolveRootPath(root, runCheck.paths?.preflightPath)],
    ['capture', resolveRootPath(root, runCheck.paths?.capturePath)],
    ['snapshot-evidence', resolveRootPath(root, runCheck.paths?.snapshotEvidencePath)],
    ['archive-manifest', resolveRootPath(root, runCheck.paths?.archivePath)],
  ];
  const artifacts = [];

  for (const [kind, filePath] of artifactInputs) {
    const buffer = await readFile(filePath);
    artifacts.push({
      kind,
      path: relativePath(outputDir, filePath),
      sha256: sha256(buffer),
      byteLength: buffer.byteLength,
    });
  }

  return artifacts;
}

async function checkPacketFile(options) {
  const root = process.cwd();
  const packetPath = path.resolve(root, options.packetPath);
  const packetDir = path.dirname(packetPath);
  const packet = parseJsonObject(await readFile(packetPath, 'utf8'), packetPath);
  const failures = [];

  if (packet.schemaVersion !== PACKET_SCHEMA) {
    failures.push(`packet.schemaVersion must be ${PACKET_SCHEMA}.`);
  }
  if (!SUPPORTED_LEVELS.has(packet.evidenceLevel)) {
    failures.push(
      'packet.evidenceLevel must be artifact-wiring-packet or live-run-evidence-packet.',
    );
  }
  if (packet.productionClaim === true) {
    failures.push('packet.productionClaim must remain false.');
  }
  if (!isValidDateString(packet.createdAt)) {
    failures.push('packet.createdAt must be a valid ISO-8601 timestamp.');
  }
  failures.push(...validateOperator(packet.operator));
  failures.push(...validateIntegrity(packet));
  failures.push(...(await validateArtifacts({ packetDir, packet })));
  failures.push(...validateVerification(packet, options));
  failures.push(...findForbiddenRawPayloads(packet, 'packet'));
  failures.push(...findSecretMaterial(packet, 'packet'));

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    packetPath,
    evidenceLevel: packet.evidenceLevel,
    strictLiveRequired: packet.verification?.strictLiveRequired === true,
    packetDigestSha256: packet.integrity?.payloadDigestSha256,
    artifactCount: Array.isArray(packet.artifacts) ? packet.artifacts.length : 0,
    runEvidenceCheckerOk: packet.verification?.ok === true,
    verifiedLiveCaptureArchive: packet.runSummary?.verifiedLiveCaptureArchive === true,
    caveats: [
      options.requireLivePacket
        ? 'This verifies a live-run evidence packet contract and artifact digests; invoice-grade billing still requires provider invoice controls.'
        : 'This verifies packet integrity and artifact digests; use --require-live-packet for target-environment live proof.',
    ],
    failures,
  };
}

function validateIntegrity(packet) {
  const failures = [];
  const integrity = plainObject(packet.integrity);
  if (!integrity) {
    return ['packet.integrity must be an object.'];
  }
  const payload = { ...packet };
  delete payload.integrity;
  const canonicalPayload = stableJson(payload);
  const payloadDigestSha256 = sha256(canonicalPayload);
  const payloadByteLength = Buffer.byteLength(canonicalPayload, 'utf8');

  if (
    integrity.schemaVersion !==
    'polycost-pricing-catalog-live-capture-run-evidence-packet-integrity/v1'
  ) {
    failures.push('integrity.schemaVersion is invalid.');
  }
  if (integrity.canonicalization !== 'stable-json:v1') {
    failures.push('integrity.canonicalization must be stable-json:v1.');
  }
  if (integrity.digestAlgorithm !== 'sha256') {
    failures.push('integrity.digestAlgorithm must be sha256.');
  }
  if (!SHA256_PATTERN.test(String(integrity.payloadDigestSha256 || ''))) {
    failures.push('integrity.payloadDigestSha256 must be a SHA-256 digest.');
  } else if (integrity.payloadDigestSha256 !== payloadDigestSha256) {
    failures.push('integrity.payloadDigestSha256 does not match packet payload.');
  }
  if (integrity.payloadByteLength !== payloadByteLength) {
    failures.push('integrity.payloadByteLength does not match packet payload.');
  }
  if (integrity.generatedAt !== packet.createdAt) {
    failures.push('integrity.generatedAt must match packet.createdAt.');
  }
  if (Array.isArray(packet.artifacts) && integrity.artifactCount !== packet.artifacts.length) {
    failures.push('integrity.artifactCount must match artifacts.length.');
  }
  if (integrity.evidenceLevel !== packet.evidenceLevel) {
    failures.push('integrity.evidenceLevel must match packet.evidenceLevel.');
  }
  if (integrity.strictLiveRequired !== (packet.verification?.strictLiveRequired === true)) {
    failures.push('integrity.strictLiveRequired must match verification.strictLiveRequired.');
  }

  return failures;
}

async function validateArtifacts({ packetDir, packet }) {
  const failures = [];
  const artifacts = Array.isArray(packet.artifacts) ? packet.artifacts : undefined;
  if (!artifacts) {
    return ['packet.artifacts must be an array.'];
  }
  const requiredKinds = new Set([
    'run-summary',
    'preflight',
    'capture',
    'snapshot-evidence',
    'archive-manifest',
  ]);
  const seenKinds = new Set();

  for (const artifact of artifacts) {
    if (!plainObject(artifact)) {
      failures.push('Each artifact must be an object.');
      continue;
    }
    const kind = stringValue(artifact.kind);
    if (!kind) {
      failures.push('artifact.kind is required.');
    } else {
      seenKinds.add(kind);
    }
    const artifactPath = stringValue(artifact.path);
    if (!artifactPath) {
      failures.push(`artifact ${kind || 'unknown'} path is required.`);
      continue;
    }
    const resolvedPath = path.resolve(packetDir, artifactPath);
    let buffer;
    try {
      buffer = await readFile(resolvedPath);
    } catch {
      failures.push(`artifact ${kind || artifactPath} path must be readable.`);
      continue;
    }
    if (!SHA256_PATTERN.test(String(artifact.sha256 || ''))) {
      failures.push(`artifact ${kind || artifactPath} sha256 must be a SHA-256 digest.`);
    } else if (artifact.sha256 !== sha256(buffer)) {
      failures.push(`artifact ${kind || artifactPath} sha256 does not match file contents.`);
    }
    if (artifact.byteLength !== buffer.byteLength) {
      failures.push(`artifact ${kind || artifactPath} byteLength does not match file contents.`);
    }
  }

  for (const kind of requiredKinds) {
    if (!seenKinds.has(kind)) {
      failures.push(`packet.artifacts must include ${kind}.`);
    }
  }

  return failures;
}

function validateVerification(packet, options) {
  const failures = [];
  const verification = plainObject(packet.verification);
  if (!verification) {
    return ['packet.verification must be an object.'];
  }
  if (verification.schemaVersion !== RUN_CHECK_SCHEMA) {
    failures.push(`verification.schemaVersion must be ${RUN_CHECK_SCHEMA}.`);
  }
  if (verification.ok !== true) {
    failures.push('verification.ok must be true.');
  }
  if (packet.attestations?.runEvidenceCheckerPassed !== true) {
    failures.push('attestations.runEvidenceCheckerPassed must be true.');
  }
  if (packet.attestations?.productionClaimedByPolyCost !== false) {
    failures.push('attestations.productionClaimedByPolyCost must be false.');
  }
  if (packet.attestations?.rawCatalogPayloadExcluded !== true) {
    failures.push('attestations.rawCatalogPayloadExcluded must be true.');
  }
  if (packet.attestations?.credentialsExcluded !== true) {
    failures.push('attestations.credentialsExcluded must be true.');
  }
  if (packet.attestations?.signedUrlsExcluded !== true) {
    failures.push('attestations.signedUrlsExcluded must be true.');
  }
  if (options.requireLivePacket) {
    if (packet.evidenceLevel !== 'live-run-evidence-packet') {
      failures.push('packet.evidenceLevel must be live-run-evidence-packet.');
    }
    if (verification.strictLiveRequired !== true) {
      failures.push('verification.strictLiveRequired must be true.');
    }
    if (verification.archiveCheckerVerifiedLiveCaptureArchive !== true) {
      failures.push('verification.archiveCheckerVerifiedLiveCaptureArchive must be true.');
    }
    if (packet.runSummary?.verifiedLiveCaptureArchive !== true) {
      failures.push('runSummary.verifiedLiveCaptureArchive must be true.');
    }
  }

  return failures;
}

function validateOperator(operator) {
  const failures = [];
  const value = plainObject(operator);
  if (!value) {
    return ['operator must be an object.'];
  }
  if (!hasValue(value.name)) {
    failures.push('operator.name is required.');
  }
  if (!hasValue(value.role)) {
    failures.push('operator.role is required.');
  }
  if (!isValidDateString(value.attestedAt)) {
    failures.push('operator.attestedAt must be a valid ISO-8601 timestamp.');
  }

  return failures;
}

function runEvidenceCheck({ root, runSummaryPath, requireLiveRun }) {
  const args = [
    'scripts/pricing-catalog-live-capture-run-evidence-check.mjs',
    '--run-summary',
    runSummaryPath,
    '--json',
  ];
  if (requireLiveRun) {
    args.splice(1, 0, '--require-live-run');
  }
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: scrubbedEnv(),
  });

  return {
    status: child.status,
    result: parseJsonOutput(child.stdout),
  };
}

function runJsonCommand({ root, args, label }) {
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: scrubbedEnv(),
  });
  const parsed = parseJsonOutput(child.stdout);

  if (child.status !== 0 || !parsed) {
    throw new Error(`${label} failed or did not emit JSON.`);
  }

  return parsed;
}

function requireOperator(value, strict) {
  if (strict && !hasRealOperator(value)) {
    throw new Error('--operator must name the human reviewer when --require-live-run is used.');
  }
  if (hasValue(value)) {
    return value.trim();
  }

  return 'local-fixture-reviewer';
}

function requireString(value, label) {
  if (!hasValue(value)) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonObject(value, label = 'value') {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }

  return parsed;
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

function findForbiddenRawPayloads(value, context, trail = context) {
  const failures = [];
  if (!value || typeof value !== 'object') {
    return failures;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextTrail = `${trail}.${key}`;
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(`${nextTrail} must not contain raw provider payload or credential fields.`);
    }
    failures.push(...findForbiddenRawPayloads(nested, context, nextTrail));
  }

  return failures;
}

function findSecretMaterial(value, context, trail = context) {
  const failures = [];
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      failures.push(`${trail} appears to contain secret material.`);
    }
    return failures;
  }
  if (!value || typeof value !== 'object') {
    return failures;
  }
  for (const [key, nested] of Object.entries(value)) {
    failures.push(...findSecretMaterial(nested, context, `${trail}.${key}`));
  }

  return failures;
}

function resolveRootPath(root, value) {
  const string = requireString(value, 'artifact path');
  return path.isAbsolute(string) ? string : path.resolve(root, string);
}

function relativePath(fromDir, filePath) {
  return path.relative(fromDir, filePath) || '.';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

function hasRealOperator(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    !/example|sample|demo|test|unknown/i.test(value)
  );
}

function isValidDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function scrubbedEnv() {
  const env = { ...process.env };
  for (const key of [
    'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE',
    'POLYCOST_OPERATOR',
    'PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE',
    'GCP_CLOUD_BILLING_ACCESS_TOKEN',
    'GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE',
    'VAULT_TOKEN',
    'VAULT_TOKEN_FILE',
  ]) {
    delete env[key];
  }

  return env;
}

function printResult(result) {
  if (result.schemaVersion === SMOKE_SCHEMA) {
    console.log('Pricing catalog live capture run evidence packet smoke passed.');
    console.log(`Packet: ${path.relative(process.cwd(), result.packetPath)}`);
    console.log(`Base fixture packet verified: ${result.baseFixturePacketVerified}`);
    console.log(`Strict live rejected fixture packet: ${result.strictLiveRejectedFixturePacket}`);
    return;
  }

  if (result.schemaVersion === CHECK_SCHEMA) {
    console.log(
      result.ok
        ? 'Pricing catalog live capture run evidence packet check passed.'
        : 'Pricing catalog live capture run evidence packet check failed.',
    );
    console.log(`Packet: ${path.relative(process.cwd(), result.packetPath)}`);
    console.log(`Evidence level: ${result.evidenceLevel}`);
    if (Array.isArray(result.failures) && result.failures.length > 0) {
      console.log(`Failures: ${result.failures.length}`);
    }
    return;
  }

  console.log('Pricing catalog live capture run evidence packet built.');
  console.log(`Packet: ${path.relative(process.cwd(), result.packetPath)}`);
  console.log(`Evidence level: ${result.evidenceLevel}`);
  console.log(`Packet verified: ${result.packetVerified}`);
}

function printHelp() {
  console.log(`Pricing catalog live capture run evidence packet ${PACKAGE_VERSION}

Usage:
  node scripts/pricing-catalog-live-capture-run-evidence-packet.mjs --run-dir <dir> --operator <name>
  node scripts/pricing-catalog-live-capture-run-evidence-packet.mjs --check <packet.json>
  node scripts/pricing-catalog-live-capture-run-evidence-packet.mjs --smoke

Options:
  --build                    Build a sanitized packet from a run evidence check (default)
  --check                    Verify a packet JSON file and referenced artifact digests
  --smoke                    Build/check a fixture packet and prove strict live mode rejects it
  --run-summary <path>       Run summary JSON emitted by the live capture runner
  --run-dir <path>           Directory containing run-summary.json
  --packet <path>            Packet JSON to check
  --output <path>            Packet output path (default: ${DEFAULT_OUTPUT})
  --operator <name>          Human/operator reviewer name
  --operator-role <role>     Operator role label
  --require-live-run         Require live run evidence before building the packet
  --require-live-packet      Require live packet evidence when checking
  --smoke-output-dir <path>  Output directory for generated smoke artifacts (default: ${DEFAULT_SMOKE_DIR})
  --json                     Print machine-readable output
  --quiet                    Suppress human-readable output
  --version                  Print version
  --help                     Show this help
`);
}
