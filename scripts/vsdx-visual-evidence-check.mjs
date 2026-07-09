#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const BUNDLE_SCHEMA = 'polycost-vsdx-visual-evidence/v1';
const CHECK_SCHEMA = 'polycost-vsdx-visual-evidence-check/v1';
const DEFAULT_BUNDLE = 'docs/operations/evidence/vsdx-visual-evidence.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_RAW_KEYS = [
  /sourceBase64/i,
  /fileBase64/i,
  /rawVsdx/i,
  /rawXml/i,
  /contentBase64/i,
  /binaryPayload/i,
];
const SECRET_KEY_PATTERNS = [/password/i, /secret/i, /token/i, /private_key/i, /client_secret/i];
const SECRET_VALUE_PATTERNS = [/BEGIN PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /CHANGE_ME_DEV_ONLY/i];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`VSDX visual evidence check error: ${message}`);
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
    console.error(`VSDX visual evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    bundlePath: DEFAULT_BUNDLE,
    requireHumanReview: false,
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
    if (arg === '--require-human-review') {
      options.requireHumanReview = true;
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
    throw new Error('Expected at most one VSDX visual evidence bundle path.');
  }
  if (!options.bundlePath) {
    throw new Error('VSDX visual evidence bundle path cannot be empty.');
  }

  return options;
}

async function checkEvidence(options) {
  const root = process.cwd();
  const bundlePath = path.resolve(root, options.bundlePath);
  const bundle = parseJsonObject(await readFile(bundlePath, 'utf8'), options.bundlePath);
  const failures = [];
  const evidenceLevel = stringValue(bundle.evidenceLevel);
  const parser = plainObject(bundle.parser);
  const preview = plainObject(bundle.preview);
  const coverage = plainObject(bundle.coverage);
  const operatorAttestations = plainObject(bundle.operatorAttestations);
  const caveats = Array.isArray(bundle.caveats) ? bundle.caveats : [];

  if (bundle.schemaVersion !== BUNDLE_SCHEMA) {
    failures.push(`schemaVersion must be ${BUNDLE_SCHEMA}.`);
  }
  if (!['example-schema', 'reviewed-preview'].includes(evidenceLevel)) {
    failures.push('evidenceLevel must be example-schema or reviewed-preview.');
  }
  if (bundle.sourceFormat !== 'vsdx') {
    failures.push('sourceFormat must be vsdx.');
  }
  if (!isValidDateString(bundle.capturedAt)) {
    failures.push('capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (bundle.productionClaim === true) {
    failures.push(
      'productionClaim must remain false; this validates visual evidence, not production rendering.',
    );
  }
  if (options.requireHumanReview && evidenceLevel !== 'reviewed-preview') {
    failures.push('evidenceLevel must be reviewed-preview when --require-human-review is used.');
  }

  failures.push(...findForbiddenRawPayloads(bundle));
  failures.push(...findSecretMaterial(bundle));
  failures.push(...validateParser(parser));
  failures.push(...validatePreview(preview));
  failures.push(...validateCoverage(coverage));
  failures.push(...validateOperatorAttestations(operatorAttestations, options));
  failures.push(...validateCaveats(caveats));

  const verifiedReviewedPreview =
    failures.length === 0 &&
    evidenceLevel === 'reviewed-preview' &&
    operatorAttestations?.humanPreviewReviewed === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    bundlePath,
    evidenceLevel,
    sourceFormat: stringValue(bundle.sourceFormat),
    productionClaim: bundle.productionClaim === true,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedReviewedPreview,
    humanReviewRequired: evidenceLevel !== 'reviewed-preview',
    previewType: stringValue(preview?.previewType),
    renderingMode: stringValue(preview?.renderingMode),
    checkCount: 8,
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the VSDX visual evidence contract with sanitized sample data; it is not human-reviewed diagram proof.'
        : 'This validates archived approximate VSDX preview evidence, not full Visio visual rendering.',
      'PolyCost currently extracts page geometry and renders approximate SVG previews; Visio themes, icons, formulas, embedded media, and exact text wrapping remain future scope.',
    ],
    failures,
  };
}

function validateParser(parser) {
  const failures = [];

  if (!parser) {
    return ['parser must be an object.'];
  }
  if (!Number.isInteger(parser.pageCount) || parser.pageCount < 1) {
    failures.push('parser.pageCount must be a positive integer.');
  }
  if (!Number.isInteger(parser.nodeCount) || parser.nodeCount < 1) {
    failures.push('parser.nodeCount must be a positive integer.');
  }
  if (!Number.isInteger(parser.edgeCount) || parser.edgeCount < 0) {
    failures.push('parser.edgeCount must be a non-negative integer.');
  }
  if (!Number.isInteger(parser.visualPreviewCount) || parser.visualPreviewCount < 1) {
    failures.push('parser.visualPreviewCount must be a positive integer.');
  }
  if (parser.partialParse !== false) {
    failures.push('parser.partialParse must be false for reviewed visual evidence.');
  }
  if (!Array.isArray(parser.securityWarnings)) {
    failures.push('parser.securityWarnings must be an array.');
  }

  return failures;
}

function validatePreview(preview) {
  const failures = [];

  if (!preview) {
    return ['preview must be an object.'];
  }
  if (preview.renderingMode !== 'layout-extraction') {
    failures.push('preview.renderingMode must be layout-extraction.');
  }
  if (preview.previewType !== 'approximate-svg') {
    failures.push('preview.previewType must be approximate-svg.');
  }
  if (!hasSha256(preview.svgSha256)) {
    failures.push('preview.svgSha256 must be a SHA-256 digest.');
  }
  if (!isNonEmptyString(preview.pageRef)) {
    failures.push('preview.pageRef must be present.');
  }
  if (!Number.isInteger(preview.positionedShapeCount) || preview.positionedShapeCount < 1) {
    failures.push('preview.positionedShapeCount must be a positive integer.');
  }
  if (!Number.isInteger(preview.connectorPathCount) || preview.connectorPathCount < 0) {
    failures.push('preview.connectorPathCount must be a non-negative integer.');
  }
  if (!Number.isInteger(preview.textLabelCount) || preview.textLabelCount < 0) {
    failures.push('preview.textLabelCount must be a non-negative integer.');
  }
  if (preview.normalizedBoundsPresent !== true) {
    failures.push('preview.normalizedBoundsPresent must be true.');
  }
  if (!Array.isArray(preview.warnings) || preview.warnings.length === 0) {
    failures.push('preview.warnings must be a non-empty array.');
  } else if (
    !preview.warnings.some(
      (warning) =>
        typeof warning === 'string' &&
        warning.toLowerCase().includes('not full visio visual rendering'),
    )
  ) {
    failures.push('preview.warnings must include the not-full-Visio-rendering caveat.');
  }

  return failures;
}

function validateCoverage(coverage) {
  const failures = [];

  if (!coverage) {
    return ['coverage must be an object.'];
  }

  for (const key of [
    'themesRendered',
    'iconsRendered',
    'formulasEvaluated',
    'embeddedMediaRendered',
    'exactTextWrapping',
    'fullVisioRenderingClaim',
  ]) {
    if (coverage[key] !== false) {
      failures.push(`coverage.${key} must be false.`);
    }
  }

  return failures;
}

function validateOperatorAttestations(attestations, options) {
  const failures = [];

  if (!attestations) {
    return ['operatorAttestations must be an object.'];
  }
  if (attestations.rawFileExcluded !== true) {
    failures.push('operatorAttestations.rawFileExcluded must be true.');
  }
  if (attestations.unsafeXmlRejected !== true) {
    failures.push('operatorAttestations.unsafeXmlRejected must be true.');
  }
  if (attestations.fullVisioRenderingClaimedByPolyCost !== false) {
    failures.push('operatorAttestations.fullVisioRenderingClaimedByPolyCost must be false.');
  }
  if (options.requireHumanReview && attestations.humanPreviewReviewed !== true) {
    failures.push('operatorAttestations.humanPreviewReviewed must be true.');
  }
  if (
    options.requireHumanReview &&
    (!isNonEmptyString(attestations.operator) || attestations.operator === 'example-only')
  ) {
    failures.push('operatorAttestations.operator must name a real reviewer.');
  }

  return failures;
}

function validateCaveats(caveats) {
  if (
    caveats.some(
      (caveat) =>
        typeof caveat === 'string' && caveat.toLowerCase().includes('full visio visual rendering'),
    )
  ) {
    return [];
  }

  return ['caveats must state that full Visio visual rendering is out of scope.'];
}

function findForbiddenRawPayloads(value, trail = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findForbiddenRawPayloads(item, [...trail, `[${index}]`]));
    }
    return failures;
  }
  if (!plainObject(value)) {
    return failures;
  }

  for (const [key, child] of Object.entries(value)) {
    const keyTrail = [...trail, key];
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(`${keyTrail.join('.')} must not be included in evidence bundles.`);
    }
    failures.push(...findForbiddenRawPayloads(child, keyTrail));
  }

  return failures;
}

function findSecretMaterial(value, trail = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findSecretMaterial(item, [...trail, `[${index}]`]));
    }
    return failures;
  }
  if (!plainObject(value)) {
    if (typeof value === 'string' && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      failures.push(`${trail.join('.') || 'bundle'} contains secret-like material.`);
    }
    return failures;
  }

  for (const [key, child] of Object.entries(value)) {
    const keyTrail = [...trail, key];
    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      failures.push(`${keyTrail.join('.')} uses a secret-like key.`);
    }
    failures.push(...findSecretMaterial(child, keyTrail));
  }

  return failures;
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);

    if (!plainObject(parsed)) {
      throw new Error('root value is not an object');
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON evidence: ${message}`);
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function isValidDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `VSDX visual evidence check passed: ${result.evidenceLevel} (${result.previewType}, ${result.renderingMode}).`,
    );
    if (result.humanReviewRequired) {
      console.log(
        'Human-reviewed preview evidence is still required before claiming reviewed visual proof.',
      );
    }
    return;
  }

  console.error('VSDX visual evidence check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`VSDX visual evidence check ${PACKAGE_VERSION}

Usage:
  node scripts/vsdx-visual-evidence-check.mjs [bundle.json] [options]

Options:
  --bundle=<path>          Evidence bundle path. Defaults to ${DEFAULT_BUNDLE}
  --require-human-review   Require reviewed-preview evidence and reviewer attestation
  --json                   Print machine-readable check output
  --quiet                  Suppress success output
  --version                Print version
  --help                   Show this help
`);
}
