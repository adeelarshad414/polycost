#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_VERSION = '0.1.0';
const EVIDENCE_SCHEMA = 'polycost-enterprise-idp-pilot-evidence/v1';
const CHECK_SCHEMA = 'polycost-enterprise-idp-pilot-evidence-check/v1';
const DEFAULT_EVIDENCE = 'docs/operations/evidence/enterprise-idp-pilot-evidence.example.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_LEVELS = new Set(['example-schema', 'managed-idp-pilot']);
const SUPPORTED_ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production']);
const SUPPORTED_PROVIDERS = new Set([
  'example',
  'okta',
  'microsoft-entra',
  'google-workspace',
  'auth0',
  'generic-oidc',
  'generic-saml',
]);
const SUPPORTED_PROTOCOLS = new Set(['oidc', 'saml', 'scim']);
const REQUIRED_JOURNEYS = new Set([
  'workspace-auth-rbac-sso',
  'scim-provisioning-lifecycle',
  'rbac-member-denial',
  'session-revocation',
  'audit-review',
]);
const REQUIRED_AUDIT_ACTIONS = new Set([
  'team.sso.configured',
  'team.scim.token.created',
  'team.scim.user_upserted',
  'team.scim.user_deactivated',
  'team.scim.token.revoked',
]);
const REQUIRED_SECURITY_FLAGS = [
  'rawSecretsExcluded',
  'rawBearerTokensExcluded',
  'screenshotsRedacted',
  'noBearerTokensInLogs',
  'authErrorsGeneric',
  'rateLimitsObserved',
];
const FORBIDDEN_RAW_KEYS = [
  /^rawToken$/i,
  /^rawTokens$/i,
  /^bearerToken$/i,
  /^bearerTokens$/i,
  /^authorizationHeader$/i,
  /^clientSecret$/i,
  /^clientSecrets$/i,
  /^samlPrivateKey$/i,
  /^idToken$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^sessionCookie$/i,
  /^cookie$/i,
  /^rawAssertion$/i,
  /^rawIdpResponse$/i,
  /^rawScimResponse$/i,
];
const SECRET_VALUE_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/,
  /AKIA[0-9A-Z]{16}/,
  /CHANGE_ME_DEV_ONLY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bpc_scim_[A-Za-z0-9._~+/=-]+/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Enterprise IdP pilot evidence check error: ${message}`);
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
          evidencePath: args.evidencePath,
          failures: [message],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Enterprise IdP pilot evidence check failed: ${message}`);
  }

  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    evidencePath: DEFAULT_EVIDENCE,
    requireManagedIdp: false,
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
    if (arg === '--require-managed-idp') {
      options.requireManagedIdp = true;
      continue;
    }
    if (arg.startsWith('--evidence=')) {
      options.evidencePath = arg.slice('--evidence='.length).trim();
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.evidencePath = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error('Expected at most one enterprise IdP evidence bundle path.');
  }
  if (!options.evidencePath) {
    throw new Error('Evidence path cannot be empty.');
  }

  return options;
}

async function checkEvidence(options) {
  const root = process.cwd();
  const evidencePath = path.resolve(root, options.evidencePath);
  const evidence = parseJsonObject(await readFile(evidencePath, 'utf8'), options.evidencePath);
  const failures = [];
  const evidenceLevel = stringValue(evidence.evidenceLevel);
  const idp = plainObject(evidence.idp);
  const deployment = plainObject(evidence.deployment);
  const configuration = plainObject(evidence.configuration);
  const scim = plainObject(evidence.scim);
  const rbac = plainObject(evidence.rbac);
  const audit = plainObject(evidence.audit);
  const security = plainObject(evidence.security);
  const artifacts = plainObject(evidence.artifacts);
  const operatorAttestations = plainObject(evidence.operatorAttestations);
  const journeys = Array.isArray(evidence.journeys) ? evidence.journeys : [];
  const protocols = Array.isArray(idp?.protocols) ? idp.protocols : [];

  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    failures.push(`evidence.schemaVersion must be ${EVIDENCE_SCHEMA}.`);
  }
  if (!SUPPORTED_LEVELS.has(evidenceLevel)) {
    failures.push('evidence.evidenceLevel must be example-schema or managed-idp-pilot.');
  }
  if (evidence.productionClaim === true) {
    failures.push(
      'evidence.productionClaim must remain false; this validates pilot evidence, not production IAM certification.',
    );
  }
  if (!isValidDateString(evidence.capturedAt)) {
    failures.push('evidence.capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (!SUPPORTED_ENVIRONMENTS.has(evidence.environment)) {
    failures.push('evidence.environment must be development, test, staging, or production.');
  }

  failures.push(...findForbiddenRawPayloads(evidence));
  failures.push(...findSecretMaterial(evidence));
  failures.push(...validateIdp(idp, protocols));
  failures.push(...validateDeployment(deployment));
  failures.push(...validateConfiguration(configuration, protocols));
  failures.push(...validateJourneys(journeys));
  failures.push(...validateScim(scim));
  failures.push(...validateRbac(rbac));
  failures.push(...validateAudit(audit));
  failures.push(...validateSecurity(security));
  failures.push(...validateArtifacts(artifacts));
  failures.push(...validateOperatorAttestations(operatorAttestations));

  if (options.requireManagedIdp || evidenceLevel === 'managed-idp-pilot') {
    failures.push(...validateManagedIdpPilot(evidence, idp, configuration, artifacts));
  }

  const verifiedManagedIdpPilot =
    failures.length === 0 &&
    evidenceLevel === 'managed-idp-pilot' &&
    idp?.managedTenantVerified === true &&
    configuration?.vaultSecretsVerified === true;

  return {
    ok: failures.length === 0,
    schemaVersion: CHECK_SCHEMA,
    evidencePath,
    evidenceLevel,
    productionClaim: evidence.productionClaim === true,
    environment: evidence.environment,
    idpProvider: idp?.provider,
    protocols,
    journeyCount: journeys.length,
    requiredJourneyCount: REQUIRED_JOURNEYS.size,
    requiredAuditActionCount: REQUIRED_AUDIT_ACTIONS.size,
    verifiedExampleSchema: failures.length === 0 && evidenceLevel === 'example-schema',
    verifiedManagedIdpPilot,
    managedIdpRequired: evidenceLevel !== 'managed-idp-pilot',
    caveats: [
      evidenceLevel === 'example-schema'
        ? 'This validates the enterprise IdP evidence contract with sanitized sample data; it is not managed IdP proof.'
        : 'This validates archived pilot evidence for a managed IdP tenant; formal SCIM/OIDC/SAML certification remains provider- and customer-specific.',
      'Raw SSO assertions, SCIM bearer tokens, session cookies, IdP tokens, private keys, client secrets, and authorization headers must stay out of evidence bundles.',
    ],
    failures,
  };
}

function validateIdp(idp, protocols) {
  const failures = [];

  if (!idp) {
    return ['evidence.idp must be an object.'];
  }
  if (!SUPPORTED_PROVIDERS.has(idp.provider)) {
    failures.push(
      `idp.provider must be one of: ${Array.from(SUPPORTED_PROVIDERS).sort().join(', ')}.`,
    );
  }
  if (!hasValue(idp.tenantRef)) {
    failures.push('idp.tenantRef is required and must be non-secret.');
  }
  if (protocols.length === 0) {
    failures.push('idp.protocols must include at least one protocol.');
  }
  for (const protocol of protocols) {
    if (!SUPPORTED_PROTOCOLS.has(protocol)) {
      failures.push(`Unsupported idp.protocols entry: ${protocol}.`);
    }
  }
  if (!protocols.includes('scim')) {
    failures.push('idp.protocols must include scim for enterprise provisioning evidence.');
  }
  if (!protocols.includes('oidc') && !protocols.includes('saml')) {
    failures.push('idp.protocols must include oidc or saml for SSO evidence.');
  }

  return failures;
}

function validateDeployment(deployment) {
  if (!deployment) {
    return ['evidence.deployment must be an object.'];
  }

  const failures = [];
  for (const key of ['apiBaseUrl', 'webBaseUrl', 'scimBaseUrl']) {
    if (!isHttpUrl(deployment[key])) {
      failures.push(`deployment.${key} must be an http(s) URL.`);
    }
  }
  if (!isHttpUrl(deployment.oidcCallbackUrl) && !isHttpUrl(deployment.samlAcsUrl)) {
    failures.push('deployment must include oidcCallbackUrl or samlAcsUrl as an http(s) URL.');
  }

  return failures;
}

function validateConfiguration(configuration, protocols) {
  if (!configuration) {
    return ['evidence.configuration must be an object.'];
  }

  const failures = [];
  if (protocols.includes('oidc') && configuration.oidcConfigured !== true) {
    failures.push('configuration.oidcConfigured must be true when oidc is in scope.');
  }
  if (protocols.includes('saml') && configuration.samlConfigured !== true) {
    failures.push('configuration.samlConfigured must be true when saml is in scope.');
  }
  if (protocols.includes('scim') && configuration.scimConfigured !== true) {
    failures.push('configuration.scimConfigured must be true when scim is in scope.');
  }
  const vaultSecretRefs = Array.isArray(configuration.vaultSecretRefs)
    ? configuration.vaultSecretRefs
    : [];
  if (vaultSecretRefs.length === 0) {
    failures.push('configuration.vaultSecretRefs must name non-secret Vault paths.');
  }
  for (const secretRef of vaultSecretRefs) {
    if (!hasValue(secretRef) || !String(secretRef).startsWith('secret/polycost/')) {
      failures.push('configuration.vaultSecretRefs must use secret/polycost/... path references.');
    }
  }

  return failures;
}

function validateJourneys(journeys) {
  if (!Array.isArray(journeys) || journeys.length === 0) {
    return ['evidence.journeys must be a non-empty array.'];
  }

  const failures = [];
  const byName = new Map();

  for (const [index, journey] of journeys.entries()) {
    if (!plainObject(journey)) {
      failures.push(`journeys[${index}] must be an object.`);
      continue;
    }
    if (!hasValue(journey.name)) {
      failures.push(`journeys[${index}].name is required.`);
      continue;
    }
    byName.set(journey.name, journey);
    if (journey.status !== 'passed') {
      failures.push(`journeys[${index}].status must be passed.`);
    }
    if (!Number.isInteger(journey.durationMs) || journey.durationMs < 0) {
      failures.push(`journeys[${index}].durationMs must be a non-negative integer.`);
    }
    if (!isSha256(journey.evidenceSha256)) {
      failures.push(`journeys[${index}].evidenceSha256 must be a SHA-256 digest.`);
    }
  }

  for (const journeyName of REQUIRED_JOURNEYS) {
    if (!byName.has(journeyName)) {
      failures.push(`Missing required journey evidence: ${journeyName}.`);
    }
  }

  return failures;
}

function validateScim(scim) {
  if (!scim) {
    return ['evidence.scim must be an object.'];
  }

  return requireTrueFlags(scim, [
    'serviceProviderConfigValidated',
    'schemasValidated',
    'resourceTypesValidated',
    'userCreateValidated',
    'userUpdateValidated',
    'deactivateRemovesMembership',
    'tokenMetadataOnly',
    'tokenHashOnlyStorage',
    'revokedTokenDenied',
  ]).map((failure) => `scim.${failure}`);
}

function validateRbac(rbac) {
  if (!rbac) {
    return ['evidence.rbac must be an object.'];
  }

  return requireTrueFlags(rbac, [
    'memberCannotImportBilling',
    'adminCanManageScimTokens',
    'ownerCanConfigureSso',
    'finalOwnerProtected',
    'crossTeamAccessDenied',
  ]).map((failure) => `rbac.${failure}`);
}

function validateAudit(audit) {
  if (!audit) {
    return ['evidence.audit must be an object.'];
  }

  const failures = requireTrueFlags(audit, ['teamAuditEventsReviewed']).map(
    (failure) => `audit.${failure}`,
  );
  const observedActions = new Set(
    Array.isArray(audit.observedActions) ? audit.observedActions : [],
  );

  for (const action of REQUIRED_AUDIT_ACTIONS) {
    if (!observedActions.has(action)) {
      failures.push(`audit.observedActions must include ${action}.`);
    }
  }

  return failures;
}

function validateSecurity(security) {
  if (!security) {
    return ['evidence.security must be an object.'];
  }

  return requireTrueFlags(security, REQUIRED_SECURITY_FLAGS).map(
    (failure) => `security.${failure}`,
  );
}

function validateArtifacts(artifacts) {
  if (!artifacts) {
    return ['evidence.artifacts must be an object.'];
  }

  const failures = [];
  for (const key of [
    'liveTranscriptSha256',
    'screenshotIndexSha256',
    'idpConfigurationEvidenceSha256',
  ]) {
    if (!isSha256(artifacts[key])) {
      failures.push(`artifacts.${key} must be a SHA-256 digest.`);
    }
  }

  return failures;
}

function validateOperatorAttestations(operatorAttestations) {
  if (!operatorAttestations) {
    return ['evidence.operatorAttestations must be an object.'];
  }

  const failures = requireTrueFlags(operatorAttestations, [
    'rawSecretsExcluded',
    'productionClaimedByPolyCost',
  ]).filter((failure) => failure !== 'productionClaimedByPolyCost must be true.');

  if (operatorAttestations.productionClaimedByPolyCost !== false) {
    failures.push('operatorAttestations.productionClaimedByPolyCost must be false.');
  }
  if (!hasValue(operatorAttestations.operator)) {
    failures.push('operatorAttestations.operator is required.');
  }
  if (!hasValue(operatorAttestations.reviewer)) {
    failures.push('operatorAttestations.reviewer is required.');
  }

  return failures.map((failure) => `operatorAttestations.${failure}`);
}

function validateManagedIdpPilot(evidence, idp, configuration, artifacts) {
  const failures = [];

  if (evidence.evidenceLevel !== 'managed-idp-pilot') {
    failures.push('evidenceLevel must be managed-idp-pilot when --require-managed-idp is used.');
  }
  if (!['staging', 'production'].includes(evidence.environment)) {
    failures.push('managed IdP evidence must come from staging or production.');
  }
  if (idp?.provider === 'example') {
    failures.push('idp.provider cannot be example for managed IdP evidence.');
  }
  if (idp?.managedTenantVerified !== true) {
    failures.push('idp.managedTenantVerified must be true for managed IdP evidence.');
  }
  for (const key of [
    'vaultSecretsVerified',
    'tlsVerified',
    'redirectUrisRegistered',
    'issuerAudienceValidated',
  ]) {
    if (configuration?.[key] !== true) {
      failures.push(`configuration.${key} must be true for managed IdP evidence.`);
    }
  }
  if (!isSha256(artifacts?.idpConfigurationEvidenceSha256)) {
    failures.push('artifacts.idpConfigurationEvidenceSha256 is required for managed IdP evidence.');
  }
  const operator = evidence.operatorAttestations?.operator;
  const reviewer = evidence.operatorAttestations?.reviewer;
  if (operator === 'example-only' || reviewer === 'example-only') {
    failures.push('managed IdP evidence must name real operator and reviewer identities.');
  }

  return failures;
}

function requireTrueFlags(object, keys) {
  const failures = [];

  for (const key of keys) {
    if (object[key] !== true) {
      failures.push(`${key} must be true.`);
    }
  }

  return failures;
}

function parseJsonObject(content, label) {
  try {
    const parsed = JSON.parse(content);
    if (!plainObject(parsed)) {
      throw new Error('expected a JSON object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hasValue(value) {
  return stringValue(value) !== undefined;
}

function isValidDateString(value) {
  return hasValue(value) && !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value) {
  if (!hasValue(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSha256(value) {
  return hasValue(value) && SHA256_PATTERN.test(value);
}

function findForbiddenRawPayloads(value, pathSegments = []) {
  const failures = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findForbiddenRawPayloads(item, [...pathSegments, `[${index}]`]));
    }
    return failures;
  }

  if (!plainObject(value)) {
    return failures;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...pathSegments, key];
    if (FORBIDDEN_RAW_KEYS.some((pattern) => pattern.test(key))) {
      failures.push(`${childPath.join('.')} must not be present in sanitized evidence.`);
      continue;
    }
    failures.push(...findForbiddenRawPayloads(child, childPath));
  }

  return failures;
}

function findSecretMaterial(value, pathSegments = []) {
  const failures = [];

  if (typeof value === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        failures.push(`${pathSegments.join('.') || '<root>'} appears to contain secret material.`);
      }
    }
    return failures;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      failures.push(...findSecretMaterial(item, [...pathSegments, `[${index}]`]));
    }
    return failures;
  }

  if (plainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      failures.push(...findSecretMaterial(child, [...pathSegments, key]));
    }
  }

  return failures;
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `Enterprise IdP pilot evidence check passed (${result.evidenceLevel}; journeys ${result.journeyCount}/${result.requiredJourneyCount}).`,
    );
    if (result.verifiedExampleSchema) {
      console.log(
        'Verified sample schema only. Use --require-managed-idp for real IdP pilot proof.',
      );
    }
    if (result.verifiedManagedIdpPilot) {
      console.log('Verified managed IdP pilot evidence.');
    }
    return;
  }

  console.error('Enterprise IdP pilot evidence check failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
}

function printHelp() {
  console.log(`Usage: npm run enterprise:idp:evidence:check -- [options] [bundle.json]

Validates sanitized enterprise IdP pilot evidence for OIDC/SAML + SCIM readiness.

Options:
  --evidence=<path>       Evidence bundle path (default: ${DEFAULT_EVIDENCE})
  --require-managed-idp   Require a real managed IdP pilot bundle instead of example-schema
  --json                  Print JSON output
  --quiet                 Suppress human-readable success output
  --version               Print version
  --help                  Show this help
`);
}
