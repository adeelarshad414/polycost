import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
let evidenceAnchors = 0;

await assertMonthlyHourStandard();
await assertForbiddenTimeFormulaAudit();
await assertPhaseEvidenceAnchors();

if (failures.length > 0) {
  console.error('Full progress verification check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Full progress verification check passed: ${evidenceAnchors} phase evidence anchors verified.`,
);

async function assertMonthlyHourStandard() {
  const standard = JSON.parse(
    await readFile(path.join(root, 'packages/types/monthly-hour-standard.json'), 'utf8'),
  );

  assertEqual('monthly-hour standard hoursPerMonth', standard.hoursPerMonth, 730);
  assertEqual('monthly-hour standard hoursPerDay', standard.hoursPerDay, 24);
  assertEqual('monthly-hour standard daysPerWeek', standard.daysPerWeek, 7);
  assertEqual('monthly-hour standard monthsPerQuarter', standard.monthsPerQuarter, 3);

  await assertFileContains('apps/api/src/cost-time.ts', [
    ['shared monthly-hour import', "from '@polycost/types/monthly-hour-standard.json'"],
    [
      'monthly interval derived from shared constant',
      'monthly: roundCurrency(hourlyCostUsd * HOURS_PER_MONTH)',
    ],
    [
      'quarterly interval derived from shared constant',
      'quarterly: roundCurrency(hourlyCostUsd * HOURS_PER_MONTH * MONTHS_PER_QUARTER)',
    ],
    [
      'yearly interval derived from shared constant',
      'yearly: roundCurrency(hourlyCostUsd * HOURS_PER_YEAR)',
    ],
  ]);

  await assertFileContains('apps/api/src/cost-time.spec.ts', [
    ['730-hour month regression', 'expect(HOURS_PER_MONTH).toBe(730)'],
    ['all reporting intervals regression', 'derives every reporting interval'],
  ]);
}

async function assertForbiddenTimeFormulaAudit() {
  const files = await listFiles(['apps', 'packages', 'database', 'scripts']);
  const allowListed720 = new Map([
    ['apps/api/src/reports/report-generators.spec.ts', ['quarterly: 720']],
    ['apps/api/src/pricing-normalization/egress-tier-calculator.spec.ts', ['billableGb: 30_720']],
  ]);

  for (const file of files) {
    if (path.relative(root, file) === 'scripts/full-progress-verification-check.mjs') {
      continue;
    }

    const relativePath = path.relative(root, file);
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (/24\s*\*\s*30/.test(line)) {
        failures.push(
          `${relativePath}:${index + 1} uses 24*30 month math instead of HOURS_PER_MONTH`,
        );
      }

      if (/365\s*\/\s*12/.test(line)) {
        failures.push(
          `${relativePath}:${index + 1} uses 365/12 month math instead of HOURS_PER_MONTH`,
        );
      }

      if (/\b720\b/.test(line) && !isAllowed720(relativePath, line, allowListed720)) {
        failures.push(
          `${relativePath}:${index + 1} contains bare 720; use the 730-hour standard or document an explicit non-time value`,
        );
      }
    }
  }

  evidenceAnchors += 1;
}

async function assertPhaseEvidenceAnchors() {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assertScriptIncludes(packageJson, 'check', [
    'npm run progress:verify',
    'npm run pricing:coverage:check',
    'npm run provider:credentials:check',
    'npm run invoice:artifact-profile:check',
    'npm run invoice:artifact-scanner:smoke:local',
    'npm run invoice:artifact-rehearsal:plan',
    'npm run invoice:artifact-rehearsal:evidence:check',
    'npm run invoice:record:evidence:check',
    'npm run invoice:record:pricing-lineage:smoke',
    'npm run pricing:catalog:snapshot:check',
    'npm run pricing:catalog:snapshot:smoke',
    'npm run pricing:catalog:snapshot:capture:plan',
    'npm run terraform:evidence:check',
    'npm run terraform:evidence:capture:smoke',
    'npm run vsdx:visual-evidence:check',
    'npm run diagram:llm-corpus:check',
    'npm run diagram:llm-corpus:capture:smoke',
    'npm run diagram:llm-corpus:drift:check',
    'npm run diagram:llm-corpus:drift:alert:check',
    'npm run diagram:llm-corpus:drift:alert:smoke',
    'npm run enterprise:idp:evidence:check',
  ]);
  assertScriptIncludes(packageJson, 'ci:unit', [
    'npm run test:coverage',
    'npm run pricing:logic:coverage',
  ]);
  assertScriptIncludes(packageJson, 'ci:e2e', ['node scripts/ci-e2e.mjs']);
  assertScriptIncludes(packageJson, 'live:verify', ['node scripts/live-verification.mjs']);
  assertScriptIncludes(packageJson, 'demo:verify-clean', [
    'node scripts/clean-clone-demo-check.mjs',
  ]);
  assertScriptIncludes(packageJson, 'test:production-readiness', [
    'src/api/finops-proof.spec.ts',
    'src/pricing-normalization/pricing-reconciliation.spec.ts',
    'src/api/live-pricing-traceability.spec.ts',
    'src/api/auth-billing.spec.ts',
    'src/api/runtime-di.spec.ts',
    'src/diagram-parser/diagram-parser.service.spec.ts',
    'src/reports/report-generators.spec.ts',
    'src/App.spec.tsx',
  ]);

  await assertFileContains('database/migrations/009_pricing_rates_matrix.sql', [
    ['hourly stored unit', 'hourly_rate_usd'],
    ['estimate flag', 'is_estimate'],
    ['append-only valid-from', 'valid_from'],
    ['append-only valid-to', 'valid_to'],
  ]);

  await assertFileContains('database/migrations/028_pricing_lineage_metadata.sql', [
    ['pricing source endpoint lineage', 'source_endpoint'],
    ['pricing source record lineage', 'source_record_id'],
    ['pricing transform version lineage', 'transform_version'],
    ['pricing payload hash lineage', 'source_payload_hash'],
  ]);

  await assertFileContains('apps/api/src/pricing-normalization/egress-tier-calculator.spec.ts', [
    ['80TB manual egress regression', 'matches the manual AWS-style tier calculation for 80TB'],
    ['manual 80TB total', '6553.6'],
  ]);

  await assertFileContains('apps/api/src/api/finops-proof.spec.ts', [
    ['shared 730-hour proof', 'HOURS_PER_MONTH).toBe(730)'],
    ['manual 80TB egress proof', 'manualMonthlyCostUsd).toBe(6553.6)'],
    ['manual commitment break-even proof', 'Math.ceil(600 / (1000 - 850))'],
    ['reserved terms are distinct', 'not.toBe(reserved3yr?.committedMonthlyUsd)'],
    ['spot estimate proof', "volatility: 'volatile'"],
  ]);

  await assertFileContains('apps/api/src/pricing-normalization/pricing-reconciliation.spec.ts', [
    ['20-rate reconciliation floor', 'at least 20 distinct'],
    ['raw lineage recomputation', 'expectCompleteLineage'],
    ['provider breadth coverage', 'covers mainstream %s compute families'],
  ]);

  await assertFileContains('apps/api/src/comparison/comparison-orchestrator.service.ts', [
    ['phase 3 integration hook', 'PHASE_3_HOOK'],
    ['break-even engine', 'break-even'],
  ]);

  await assertFileContains('apps/api/src/nws-parser/requirement-parser.service.ts', [
    ['requirement parser interface adapter', 'NwsBackedRequirementParser'],
    ['phase 2 integration hook', 'PHASE_2_HOOK'],
    ['phase 3 parser hook', 'PHASE_3_HOOK'],
  ]);

  await assertFileContains('apps/web/src/App.spec.tsx', [
    ['executive view evidence', 'Executive monthly baseline'],
    ['engineering view evidence', 'Engineering cost controls'],
    ['break-even UI evidence', 'Break-even timeline'],
    [
      'natural-language editable form evidence',
      'parses natural-language input into the editable form',
    ],
    ['pricing model what-if evidence', '3yr reserved'],
  ]);

  await assertFileContains('apps/web/e2e/polycost-browser.e2e.ts', [
    ['locked breakpoint UI proof', 'accessible across locked breakpoints'],
    ['mobile 375 viewport', "label: 'mobile 375'"],
    ['tablet 768 viewport', "label: 'tablet 768'"],
    ['desktop 1440 viewport', "label: 'desktop 1440'"],
    ['interactive accessible-name audit', 'expectInteractiveControlsAreNamed'],
    ['horizontal overflow audit', 'expectNoHorizontalOverflow(page)'],
  ]);

  await assertFileContains('apps/api/src/api/mvp-acceptance.e2e.spec.ts', [
    ['natural language E2E source', "sourceType).toBe('natural_language')"],
    ['PDF export E2E', 'export?format=pdf'],
    ['CSV export E2E', 'export?format=csv'],
    ['Excel export E2E', 'export?format=xlsx'],
    ['share revoke E2E', '/revoke'],
    ['SKU evidence E2E', 'expands SKU evidence'],
    ['auth RBAC E2E', 'member RBAC denial'],
    ['Mermaid diagram E2E', "'Mermaid'"],
    ['draw.io diagram E2E', "'draw.io'"],
    ['Lucid diagram E2E', "'Lucid CSV'"],
    ['VSDX diagram E2E', "'VSDX'"],
    ['malicious XXE E2E', 'malicious/xxe.drawio'],
    ['malicious ZIP E2E', 'malicious/zip-bomb.vsdx'],
  ]);

  for (const fixture of [
    'fixtures/diagrams/mermaid/web-app.mmd',
    'fixtures/diagrams/drawio/web-app.drawio',
    'fixtures/diagrams/lucid/lucid-export.csv',
    'fixtures/diagrams/vsdx/simple.vsdx',
    'fixtures/diagrams/malicious/xxe.drawio',
    'fixtures/diagrams/malicious/deflate-bomb.drawio',
    'fixtures/diagrams/malicious/oversized.drawio',
    'fixtures/diagrams/malicious/png-renamed.drawio',
    'fixtures/diagrams/malicious/zip-bomb.vsdx',
  ]) {
    assertExists(fixture);
  }

  await assertFileContains('apps/api/src/api/auth-billing.spec.ts', [
    ['team RBAC matrix', 'enforces the team RBAC matrix'],
    ['billing admin RBAC', 'requires owner or admin access for billing imports'],
    ['mock OIDC round trip', 'mock OIDC start, authorize, and callback'],
  ]);

  await assertFileContains('apps/api/src/health/health.controller.spec.ts', [
    ['deep health with pricing freshness', 'returns deep health with pricing data freshness'],
    ['degraded Redis evidence', "host === 'redis' ? 'degraded'"],
  ]);

  await assertFileContains('apps/api/src/api/api-contract.spec.ts', [
    ['public rate limiting', 'rate limits parse requests by identity'],
    ['data-health warnings', 'adds pricing data-health warnings'],
    ['public data health endpoint', 'GET /data-health returns public pricing freshness'],
  ]);

  await assertFileContains('apps/web/src/styles.css', [
    ['reduced motion rule', 'prefers-reduced-motion'],
    ['brand orange token usage', '--brand-orange'],
    ['brand blue token usage', '--brand-blue'],
    ['brand green token usage', '--brand-green'],
  ]);

  await assertFileContains('.github/workflows/ci.yml', [
    ['progress verification CI gate', 'npm run progress:verify'],
    ['production-readiness CI gate', 'npm run test:production-readiness'],
    ['E2E CI gate', 'npm run ci:e2e'],
    ['security audit CI gate', 'npm run security:audit'],
  ]);

  await assertFileContains('scripts/ci-e2e.mjs', [
    ['E2E command timeout knob', 'POLYCOST_E2E_COMMAND_TIMEOUT_MS'],
    ['isolated E2E Compose project', 'POLYCOST_E2E_COMPOSE_PROJECT_NAME'],
    ['dynamic E2E port allocator', 'findAvailablePort'],
    ['E2E Vault host port override', 'POLYCOST_E2E_VAULT_HOST_PORT'],
    ['E2E API origin wiring', 'process.env.POLYCOST_API_ORIGIN = apiOrigin'],
    [
      'live verification runs inside Compose E2E',
      "run(npmCommand, ['run', 'live:verify'], { timeoutMs: commandTimeoutMs })",
    ],
  ]);

  await assertFileContains('scripts/live-verification.mjs', [
    ['template timing threshold', 'POLYCOST_TEMPLATE_JOURNEY_MAX_MS'],
    ['diagram timing threshold', 'POLYCOST_DIAGRAM_JOURNEY_MAX_MS'],
    ['workspace auth timing threshold', 'POLYCOST_AUTH_JOURNEY_MAX_MS'],
    ['SCIM live timing threshold', 'POLYCOST_SCIM_JOURNEY_MAX_MS'],
    ['live transcript env path', 'POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH'],
    ['live transcript schema', "schemaVersion: '1.0'"],
    ['live transcript default path', '.tmp/live-verification/latest.json'],
    ['template-to-recommendation assertion', 'template-to-recommendation journey'],
    ['diagram-to-PDF assertion', 'diagram-to-PDF journey'],
    ['workspace auth assertion', 'workspace auth/RBAC journey'],
    ['SCIM provisioning assertion', 'SCIM provisioning journey'],
    ['template journey transcript name', "name: 'template-to-recommendation'"],
    ['diagram journey transcript name', "name: 'diagram-to-PDF'"],
    ['workspace auth transcript name', "name: 'workspace-auth-rbac-sso'"],
    ['SCIM transcript name', "name: 'scim-provisioning-lifecycle'"],
    ['reserved pricing live smoke', 'selected reserved 3yr pricing model'],
    ['PDF live export smoke', 'PDF report generated and downloaded.'],
    ['CSV live export smoke', 'CSV report generated and downloaded.'],
    ['Excel live export smoke', 'XLSX report generated and downloaded.'],
    ['what-if live smoke', 'ran cached region and scale what-if'],
    ['share-link live smoke', 'created read-only share link'],
    ['auth registration live smoke', '/api/v1/auth/register'],
    ['auth invitation acceptance live smoke', '/api/v1/auth/invitations/accept'],
    ['auth OIDC live smoke', '/api/v1/auth/sso/oidc/start'],
    ['auth RBAC denial live smoke', 'member billing import RBAC denial'],
    ['auth RBAC transcript status', 'rbacDeniedStatus: 403'],
    ['auth SSO state verification transcript', 'stateVerified'],
    ['SCIM discovery denial live smoke', 'SCIM unauthenticated discovery denial'],
    ['SCIM revoked token live smoke', 'SCIM revoked-token denial'],
    ['SCIM metadata-only token transcript', 'metadataOnlyTokenList'],
    ['SCIM revoked token transcript status', 'revokedTokenDeniedStatus: 401'],
    ['Redis stop verification', "['compose', 'stop', 'redis']"],
    ['degraded health assertion', 'degraded health'],
    ['PDF download assertion', 'Expected a PDF download'],
    ['transcript writer', 'writeTranscript'],
  ]);

  await assertFileContains('scripts/clean-clone-demo-check.mjs', [
    ['clean-clone startup threshold', 'POLYCOST_CLEAN_CLONE_MAX_MS'],
    ['README quick-start command', "['run', 'demo:up']"],
    ['isolated Compose project', 'COMPOSE_PROJECT_NAME'],
    ['API host port wiring', 'API_HOST_PORT'],
    ['clean-clone timing label', 'clean-clone-to-running'],
  ]);

  await assertFileContains('scripts/pricing-logic-coverage-check.mjs', [
    ['pricing coverage threshold', 'POLYCOST_PRICING_LOGIC_COVERAGE_THRESHOLD'],
    ['pricing branch threshold', 'POLYCOST_PRICING_LOGIC_BRANCH_THRESHOLD'],
    ['pricing coverage source', 'coverage/api/coverage-final.json'],
    ['pricing engine coverage fragment', 'apps/api/src/comparison/'],
    ['pricing model coverage fragment', 'apps/api/src/pricing-models/'],
    ['pricing normalization coverage fragment', 'apps/api/src/pricing-normalization/'],
  ]);

  await assertFileContains('scripts/invoice-artifact-production-profile-check.mjs', [
    ['production profile check schema', 'polycost-invoice-artifact-production-profile-check/v1'],
    ['secret-free runtime profile guard', 'forbiddenRuntimeSecretKeys'],
    ['provider proof verifier reuse', 'invoice-artifact-provider-retention-proof-verifier.mjs'],
    ['target environment caveat', 'Run provider:credentials:check:strict'],
  ]);

  await assertFileContains('scripts/invoice-artifact-scanner-webhook-smoke.mjs', [
    ['scanner signature header', 'x-polycost-artifact-signature'],
    ['scanner clean verdict', "parsedResponse.verdict === 'clean'"],
    ['scanner dummy secret guard', 'isDummyCredential'],
  ]);

  await assertFileContains('scripts/invoice-artifact-scanner-local-smoke.mjs', [
    ['local scanner receiver schema', 'invoice-artifact-scanner-local-smoke/v1'],
    ['constant-time scanner signature check', 'timingSafeEqual'],
    ['strict bind env', 'POLYCOST_INVOICE_ARTIFACT_SCANNER_LOCAL_SMOKE_STRICT=1'],
  ]);

  await assertFileContains('scripts/invoice-artifact-staging-rehearsal.mjs', [
    ['staging rehearsal schema', 'polycost-invoice-artifact-staging-rehearsal/v1'],
    ['strict credential live step', 'provider-credentials-strict'],
    ['scanner live step', 'scanner-webhook-smoke'],
    ['notary live step', 'notary-webhook-smoke'],
    ['audit live step', 'audit-export-smoke'],
    ['secret handling statement', 'raw secrets must stay in Vault/runtime env'],
  ]);

  await assertFileContains('scripts/invoice-artifact-rehearsal-evidence-check.mjs', [
    ['rehearsal evidence bundle schema', 'polycost-invoice-artifact-rehearsal-evidence/v1'],
    ['rehearsal evidence check schema', 'polycost-invoice-artifact-rehearsal-evidence-check/v1'],
    ['require live mode', '--require-live'],
    ['raw secret material guard', 'findSecretMaterial'],
    ['provider credential JSON contract', 'polycost-provider-credential-check/v1'],
    ['profile archive drift guard', 'archiveReference must match profile evidence'],
  ]);

  await assertFileContains('scripts/invoice-of-record-pilot-evidence-check.mjs', [
    ['invoice-of-record evidence schema', 'polycost-invoice-of-record-pilot-evidence/v1'],
    ['invoice-of-record check schema', 'polycost-invoice-of-record-pilot-evidence-check/v1'],
    ['require provider invoice mode', '--require-provider-invoice'],
    ['provider invoice control total requirement', 'providerInvoiceControlTotals'],
    ['pricing catalog section', 'pricingCatalog'],
    ['pricing catalog snapshot digest', 'catalogSnapshotSha256'],
    ['pricing catalog validator', 'validatePricingCatalog'],
    ['raw invoice payload guard', 'findForbiddenRawPayloads'],
  ]);

  await assertFileContains('scripts/invoice-of-record-pricing-lineage-smoke.mjs', [
    ['invoice pricing lineage smoke schema', 'polycost-invoice-of-record-pricing-lineage-smoke/v1'],
    ['pricing catalog lineage snapshot schema', 'polycost-pricing-catalog-lineage-snapshot/v1'],
    ['strict invoice checker handoff', 'invoice-of-record-pilot-evidence-check.mjs'],
    ['catalog snapshot digest', 'catalogSnapshotSha256'],
    ['matched SKU coverage', 'invoiceSkuMatchCoverage'],
  ]);

  await assertFileContains('scripts/pricing-catalog-snapshot-evidence-check.mjs', [
    ['pricing catalog snapshot evidence schema', 'polycost-pricing-catalog-snapshot-evidence/v1'],
    [
      'pricing catalog snapshot check schema',
      'polycost-pricing-catalog-snapshot-evidence-check/v1',
    ],
    ['require provider snapshot mode', '--require-provider-snapshot'],
    ['require live provider mode', '--require-live-provider'],
    ['exact row-change proof', 'exactRowChangeVerified'],
    ['source payload hash coverage', 'sourcePayloadHashCoverage'],
  ]);

  await assertFileContains('scripts/pricing-catalog-snapshot-smoke.mjs', [
    ['pricing catalog snapshot smoke schema', 'polycost-pricing-catalog-snapshot-smoke/v1'],
    ['pricing catalog evidence schema', 'polycost-pricing-catalog-snapshot-evidence/v1'],
    ['strict snapshot checker handoff', 'pricing-catalog-snapshot-evidence-check.mjs'],
    ['changed row proof', 'priceChangedSkuCount'],
  ]);

  await assertFileContains('scripts/pricing-catalog-live-snapshot-capture.mjs', [
    ['pricing catalog live capture schema', 'polycost-pricing-catalog-live-snapshot-capture/v1'],
    ['live snapshot evidence schema', 'polycost-pricing-catalog-snapshot-evidence/v1'],
    ['live guard env', 'POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE'],
    ['previous evidence requirement', '--previous-evidence'],
    ['strict live checker handoff', '--require-live-provider'],
  ]);

  await assertFileContains(
    'docs/operations/evidence/pricing-catalog-snapshot/pricing-catalog-snapshot.example.json',
    [
      ['pricing catalog snapshot evidence schema', 'polycost-pricing-catalog-snapshot-evidence/v1'],
      ['sample-only evidence level', 'example-schema'],
      ['source payload hash coverage', '"sourcePayloadHashCoverage": 1'],
      ['live provider caveat', 'evidenceLevel=live-provider-snapshot'],
    ],
  );

  await assertFileContains('scripts/provider-credential-check.mjs', [
    ['provider credential JSON schema', 'polycost-provider-credential-check/v1'],
    ['provider credential JSON option', '--json'],
  ]);

  await assertFileContains(
    'docs/operations/evidence/invoice-artifact-rehearsal-evidence.example.json',
    [
      ['rehearsal evidence example schema', 'polycost-invoice-artifact-rehearsal-evidence/v1'],
      ['sample-only evidence level', 'example-schema'],
      ['provider credential JSON schema', 'polycost-provider-credential-check/v1'],
      [
        'provider retention proof embedded output',
        'invoice-artifact-provider-retention-proof-verification/v1',
      ],
      ['sample caveat', 'sanitized sample evidence for CI/schema validation only'],
    ],
  );

  await assertFileContains(
    'docs/operations/evidence/invoice-of-record-pilot-evidence.example.json',
    [
      ['invoice-of-record evidence schema', 'polycost-invoice-of-record-pilot-evidence/v1'],
      ['sample-only evidence level', 'example-schema'],
      ['provider invoice pilot caveat', 'evidenceLevel=provider-invoice-pilot'],
      ['provider invoice control total check', 'providerInvoiceControlTotals'],
    ],
  );

  await assertFileContains('scripts/terraform-validation-evidence-check.mjs', [
    ['Terraform evidence bundle schema', 'polycost-terraform-validation-evidence/v1'],
    ['Terraform evidence check schema', 'polycost-terraform-validation-evidence-check/v1'],
    ['require destination-plan mode', '--require-destination-plan'],
    ['remote state locking guard', 'remoteState.lockingConfigured must be true'],
    ['raw secret material guard', 'findSecretMaterial'],
  ]);

  await assertFileContains('scripts/terraform-destination-evidence-capture.mjs', [
    ['Terraform capture profile schema', 'polycost-terraform-destination-evidence-capture/v1'],
    ['Terraform output evidence schema', 'polycost-terraform-validation-evidence/v1'],
    ['capture smoke mode', '--smoke'],
    ['destination evidence checker handoff', '--require-destination-plan'],
    ['raw secret material guard', 'findSecretMaterial'],
  ]);

  await assertFileContains('scripts/vsdx-visual-evidence-check.mjs', [
    ['VSDX visual evidence bundle schema', 'polycost-vsdx-visual-evidence/v1'],
    ['VSDX visual evidence check schema', 'polycost-vsdx-visual-evidence-check/v1'],
    ['require human review mode', '--require-human-review'],
    ['raw visual payload guard', 'findForbiddenRawPayloads'],
  ]);

  await assertFileContains('scripts/diagram-llm-corpus-check.mjs', [
    ['diagram LLM corpus schema', 'polycost-diagram-llm-corpus/v1'],
    ['diagram LLM evidence schema', 'polycost-diagram-llm-corpus-evidence/v1'],
    ['diagram LLM check schema', 'polycost-diagram-llm-corpus-check/v1'],
    ['require live model mode', '--require-live-model'],
    ['service-type accuracy metric', 'serviceTypeAccuracy'],
  ]);

  await assertFileContains('scripts/diagram-llm-corpus-evidence-capture.mjs', [
    ['diagram LLM capture schema', 'polycost-diagram-llm-corpus-evidence-capture/v1'],
    ['diagram LLM evidence schema', 'polycost-diagram-llm-corpus-evidence/v1'],
    ['require live model mode', '--require-live-model'],
    ['downstream checker handoff', 'diagram-llm-corpus-check.mjs'],
    ['raw prompt payload guard', 'findForbiddenRawPayloads'],
  ]);

  await assertFileContains('scripts/diagram-llm-corpus-drift-check.mjs', [
    ['diagram LLM drift profile schema', 'polycost-diagram-llm-corpus-drift/v1'],
    ['diagram LLM drift check schema', 'polycost-diagram-llm-corpus-drift-check/v1'],
    ['require live model mode', '--require-live-model'],
    ['false-positive review guard', 'falsePositiveRegister'],
    ['unreviewed mismatch threshold', 'maxUnreviewedMismatches'],
  ]);

  await assertFileContains('scripts/diagram-llm-drift-alert-evidence-check.mjs', [
    ['diagram LLM drift alert evidence schema', 'polycost-diagram-llm-drift-alert-evidence/v1'],
    ['diagram LLM drift alert check schema', 'polycost-diagram-llm-drift-alert-evidence-check/v1'],
    ['staging alert strict option', '--require-staging-alert'],
    ['receiver acceptance guard', 'receiverAccepted'],
    ['signature digest guard', 'signatureSha256'],
    ['receiver receipt digest guard', 'receiverReceiptSha256'],
    ['raw prompt payload guard', 'findForbiddenRawPayloads'],
  ]);

  await assertFileContains('scripts/diagram-llm-drift-alert-reference-receiver-smoke.mjs', [
    [
      'diagram LLM drift alert reference receiver schema',
      'polycost-diagram-llm-drift-alert-reference-receiver/v1',
    ],
    [
      'diagram LLM drift alert smoke schema',
      'polycost-diagram-llm-drift-alert-reference-receiver-smoke/v1',
    ],
    ['live drift checker handoff', 'diagram-llm-corpus-drift-check.mjs'],
    ['strict alert checker handoff', 'diagram-llm-drift-alert-evidence-check.mjs'],
    ['HMAC signature evidence', 'hmacSha256'],
    ['receiver receipt evidence', 'receiverReceiptSha256'],
  ]);

  await assertFileContains('scripts/enterprise-idp-pilot-evidence-check.mjs', [
    ['enterprise IdP evidence schema', 'polycost-enterprise-idp-pilot-evidence/v1'],
    ['enterprise IdP check schema', 'polycost-enterprise-idp-pilot-evidence-check/v1'],
    ['require managed IdP mode', '--require-managed-idp'],
    ['workspace auth journey requirement', 'workspace-auth-rbac-sso'],
    ['SCIM lifecycle journey requirement', 'scim-provisioning-lifecycle'],
  ]);

  await assertFileContains('docs/operations/evidence/terraform-validation-evidence.example.json', [
    ['Terraform evidence example schema', 'polycost-terraform-validation-evidence/v1'],
    ['sample-only evidence level', 'example-schema'],
    ['bundle manifest schema', 'polycost.terraform.bundle.v1'],
    ['remote state evidence', '"lockingConfigured": true'],
    ['tag evidence', '"CostCenter"'],
  ]);

  await assertFileContains(
    'docs/operations/evidence/terraform-destination-capture/terraform-destination-capture.example.json',
    [
      [
        'Terraform destination capture profile schema',
        'polycost-terraform-destination-evidence-capture/v1',
      ],
      ['capture profile plan path', '"planJson": "tfplan.json"'],
      ['capture profile operator', '"operator": "example-only"'],
    ],
  );

  await assertFileContains('docs/operations/evidence/terraform-destination-capture/tfplan.json', [
    ['Terraform destination plan fixture', '"resource_changes"'],
    ['Terraform destination cost tags', '"ManagedBy": "terraform"'],
  ]);

  await assertFileContains('docs/operations/evidence/vsdx-visual-evidence.example.json', [
    ['VSDX visual evidence example schema', 'polycost-vsdx-visual-evidence/v1'],
    ['sample-only evidence level', 'example-schema'],
    ['approximate SVG evidence type', '"previewType": "approximate-svg"'],
    ['full Visio caveat', 'not full Visio visual rendering'],
  ]);

  await assertFileContains('fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json', [
    ['diagram LLM corpus schema', 'polycost-diagram-llm-corpus/v1'],
    ['diagram LLM corpus baseline', 'tier-3-diagram-classifier-baseline'],
    ['service-type classification corpus', '"serviceType": "container-registry"'],
  ]);

  await assertFileContains('docs/operations/evidence/diagram-llm-corpus-evidence.example.json', [
    ['diagram LLM evidence schema', 'polycost-diagram-llm-corpus-evidence/v1'],
    ['sample-only evidence level', 'example-schema'],
    ['fixture evidence mode', '"mode": "fixture-evidence"'],
    ['live model caveat', 'evidenceLevel=live-model'],
  ]);

  await assertFileContains(
    'docs/operations/evidence/diagram-llm-corpus-capture/diagram-llm-corpus-capture.example.json',
    [
      ['diagram LLM capture profile schema', 'polycost-diagram-llm-corpus-evidence-capture/v1'],
      ['sample-only evidence level', 'example-schema'],
      ['prediction artifact path', 'predictions.example.json'],
      ['raw prompt exclusion', '"rawPromptsExcluded": true'],
    ],
  );

  await assertFileContains(
    'docs/operations/evidence/diagram-llm-corpus-capture/predictions.example.json',
    [
      ['diagram LLM capture prediction case', '"id": "compute-web-tier"'],
      ['service-type prediction evidence', '"serviceType": "container-registry"'],
      ['high confidence prediction evidence', '"confidence": "high"'],
    ],
  );

  await assertFileContains(
    'docs/operations/evidence/diagram-llm-corpus-drift/diagram-llm-corpus-drift.example.json',
    [
      ['diagram LLM drift profile schema', 'polycost-diagram-llm-corpus-drift/v1'],
      ['sample-only monitoring level', 'example-schema'],
      ['baseline service-type accuracy', '"serviceTypeAccuracy": 1'],
      ['false positive register', '"falsePositiveRegister": []'],
      ['unreviewed mismatch threshold', '"maxUnreviewedMismatches": 0'],
    ],
  );

  await assertFileContains(
    'docs/operations/evidence/diagram-llm-drift-alert/diagram-llm-drift-alert.example.json',
    [
      ['diagram LLM alert evidence schema', 'polycost-diagram-llm-drift-alert-evidence/v1'],
      ['sample-only evidence level', 'example-schema'],
      ['sample routing mode', '"mode": "sample"'],
      ['destination hash evidence', '"destinationReferenceSha256"'],
      ['raw prompt exclusion', '"rawPromptsExcluded": true'],
    ],
  );

  await assertFileContains('docs/operations/evidence/enterprise-idp-pilot-evidence.example.json', [
    ['enterprise IdP evidence schema', 'polycost-enterprise-idp-pilot-evidence/v1'],
    ['sample-only evidence level', 'example-schema'],
    ['managed IdP caveat', 'evidenceLevel=managed-idp-pilot'],
    ['SCIM provisioning journey', 'scim-provisioning-lifecycle'],
  ]);

  await assertFileContains('docs/architecture/phase-v3-6-terraform-validation-evidence.md', [
    ['V3.6 title', 'Phase V3.6 Terraform Validation Evidence'],
    ['destination plan command', 'npm run terraform:evidence:check'],
    ['sample evidence distinction', 'example-schema'],
    ['operator boundary', 'PolyCost still does not run `terraform apply`'],
  ]);

  await assertFileContains(
    'docs/architecture/phase-v3-7-terraform-destination-evidence-capture.md',
    [
      [
        'Terraform destination capture architecture note',
        'Phase V3.7 Terraform Destination Evidence Capture',
      ],
      ['Terraform destination capture command', 'npm run terraform:evidence:capture'],
      ['Terraform destination capture smoke command', 'npm run terraform:evidence:capture:smoke'],
      ['operator boundary', 'PolyCost still does not run Terraform inside request handling'],
    ],
  );

  await assertFileContains('docs/architecture/phase-2-vsdx-visual-evidence.md', [
    ['VSDX visual evidence architecture note', 'Phase 2 VSDX Visual Evidence'],
    ['VSDX visual evidence command', 'npm run vsdx:visual-evidence:check'],
    ['reviewed preview strict mode', '--require-human-review'],
    ['full Visio deferred boundary', 'not full Visio visual rendering'],
  ]);

  await assertFileContains('docs/architecture/phase-2-diagram-llm-corpus-evidence.md', [
    ['diagram LLM corpus architecture note', 'Phase 2 Diagram LLM Corpus Evidence'],
    ['diagram LLM corpus command', 'npm run diagram:llm-corpus:check'],
    ['live model strict mode', '--require-live-model'],
    ['sample evidence distinction', 'example-schema'],
  ]);

  await assertFileContains('docs/architecture/phase-2-diagram-llm-corpus-evidence-capture.md', [
    ['diagram LLM capture architecture note', 'Phase 2 Diagram LLM Corpus Evidence Capture'],
    ['diagram LLM capture smoke command', 'npm run diagram:llm-corpus:capture:smoke'],
    ['diagram LLM capture command', 'npm run diagram:llm-corpus:capture'],
    ['live model strict mode', '--require-live-model'],
    ['no endpoint call boundary', 'does not call the model endpoint'],
  ]);

  await assertFileContains('docs/architecture/phase-2-diagram-llm-corpus-drift-monitoring.md', [
    ['diagram LLM drift architecture note', 'Phase 2 Diagram LLM Corpus Drift Monitoring'],
    ['diagram LLM drift command', 'npm run diagram:llm-corpus:drift:check'],
    ['live model strict mode', '--require-live-model'],
    ['false-positive review boundary', 'false-positive/mismatch review record'],
  ]);

  await assertFileContains('docs/architecture/phase-2-diagram-llm-drift-alert-evidence.md', [
    ['diagram LLM drift alert architecture note', 'Phase 2 Diagram LLM Drift Alert Evidence'],
    ['diagram LLM drift alert command', 'npm run diagram:llm-corpus:drift:alert:check'],
    ['diagram LLM drift alert smoke command', 'npm run diagram:llm-corpus:drift:alert:smoke'],
    ['staging alert strict mode', '--require-staging-alert'],
    ['reference receiver smoke boundary', 'local reference receiver smoke'],
    ['receiver retention boundary', 'receiver-side retention proof'],
  ]);

  await assertFileContains('docs/architecture/phase-2-enterprise-idp-pilot-evidence.md', [
    ['enterprise IdP pilot architecture note', 'Phase 2 Enterprise IdP Pilot Evidence'],
    ['enterprise IdP evidence command', 'npm run enterprise:idp:evidence:check'],
    ['managed IdP strict mode', '--require-managed-idp'],
    ['enterprise IAM boundary', 'complete hosted IAM product'],
  ]);

  await assertFileContains('docs/architecture/phase-2-invoice-of-record-pilot-evidence.md', [
    ['invoice-of-record architecture note', 'Phase 2 Invoice-Of-Record Pilot Evidence'],
    ['invoice-of-record evidence command', 'npm run invoice:record:evidence:check'],
    ['invoice pricing lineage smoke command', 'npm run invoice:record:pricing-lineage:smoke'],
    ['provider invoice strict mode', '--require-provider-invoice'],
    ['pricing lineage boundary', 'pricing catalog lineage smoke'],
    ['invoice system boundary', 'provider invoice system of record'],
  ]);

  await assertFileContains('docs/architecture/phase-2-pricing-catalog-snapshot-evidence.md', [
    ['pricing catalog snapshot architecture note', 'Phase 2 Pricing Catalog Snapshot Evidence'],
    ['pricing catalog snapshot check command', 'npm run pricing:catalog:snapshot:check'],
    ['pricing catalog snapshot smoke command', 'npm run pricing:catalog:snapshot:smoke'],
    ['live provider strict mode', '--require-live-provider'],
    ['catalog-list-price boundary', 'catalog-list-price evidence'],
  ]);

  await assertFileContains('docs/operations/invoice-artifact-production-profile.example.json', [
    ['production profile schema', 'polycost-invoice-artifact-production-profile/v1'],
    ['config-evidence verification level', 'verified(config-evidence)'],
    [
      'provider control-plane proof mode',
      '"INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE": "provider-control-plane"',
    ],
    [
      'provider object-lock WORM mode',
      '"INVOICE_EVIDENCE_WORM_RETENTION_MODE": "provider-object-lock"',
    ],
    ['Vault storage credential reference', '"path": "secret/polycost/artifacts/aws"'],
  ]);

  await assertFileContains('docs/verification/full-progress-ledger.md', [
    ['phase A ledger verdict', '## Phase A - Foundation And Core Pricing Engine'],
    ['phase B ledger verdict', '## Phase B - Input Modes And Requirement Pipeline'],
    ['phase C ledger verdict', '## Phase C - Dashboards, Personas And Analytics'],
    ['phase D ledger verdict', '## Phase D - Exports, Reports And Sharing'],
    ['phase E ledger verdict', '## Phase E - Diagram Ingestion'],
    ['phase F ledger verdict', '## Phase F - Auth, Teams And RBAC'],
    ['phase G ledger verdict', '## Phase G - Operations, Security And Release Readiness'],
    ['verified mock distinction', 'verified (mock)'],
    ['invoice-grade deferred ledger', 'Full invoice-grade billing remains future work'],
    ['VSDX visual rendering deferred ledger', 'not full Visio visual rendering'],
    ['VSDX visual evidence checker ledger', 'npm run vsdx:visual-evidence:check'],
    ['diagram LLM corpus checker ledger', 'npm run diagram:llm-corpus:check'],
    ['diagram LLM capture smoke ledger', 'npm run diagram:llm-corpus:capture:smoke'],
    ['diagram LLM drift checker ledger', 'npm run diagram:llm-corpus:drift:check'],
    ['diagram LLM drift alert checker ledger', 'npm run diagram:llm-corpus:drift:alert:check'],
    ['diagram LLM drift alert smoke ledger', 'npm run diagram:llm-corpus:drift:alert:smoke'],
    ['enterprise IdP pilot checker ledger', 'npm run enterprise:idp:evidence:check'],
    ['invoice-of-record pilot checker ledger', 'npm run invoice:record:evidence:check'],
    [
      'invoice-of-record pricing lineage smoke ledger',
      'npm run invoice:record:pricing-lineage:smoke',
    ],
    ['pricing catalog snapshot checker ledger', 'npm run pricing:catalog:snapshot:check'],
    ['pricing catalog snapshot smoke ledger', 'npm run pricing:catalog:snapshot:smoke'],
    ['Terraform destination capture checker ledger', 'npm run terraform:evidence:capture:smoke'],
    ['auth enterprise deferred ledger', 'Full enterprise account/team UX'],
    ['auth live transcript ledger', 'workspace-auth-rbac-sso'],
    ['external CI blocker ledger', 'runner_id: 0'],
  ]);

  evidenceAnchors += 1;
}

function assertScriptIncludes(packageJson, scriptName, snippets) {
  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    failures.push(`package.json is missing script: ${scriptName}`);
    return;
  }

  for (const snippet of snippets) {
    if (!script.includes(snippet)) {
      failures.push(`package.json script ${scriptName} is missing: ${snippet}`);
    }
  }

  evidenceAnchors += snippets.length;
}

async function assertFileContains(relativePath, expectations) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing evidence file: ${relativePath}`);
    return;
  }

  const content = await readFile(absolutePath, 'utf8');
  for (const [label, snippet] of expectations) {
    if (!content.includes(snippet)) {
      failures.push(`${relativePath} is missing ${label}: ${snippet}`);
    } else {
      evidenceAnchors += 1;
    }
  }
}

function assertExists(relativePath) {
  if (!existsSync(path.join(root, relativePath))) {
    failures.push(`Missing fixture or release artifact: ${relativePath}`);
  } else {
    evidenceAnchors += 1;
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} expected ${expected}, got ${actual}`);
  } else {
    evidenceAnchors += 1;
  }
}

function isAllowed720(relativePath, line, allowListed720) {
  const snippets = allowListed720.get(relativePath);
  return snippets?.some((snippet) => line.includes(snippet)) ?? false;
}

async function listFiles(relativeDirectories) {
  const files = [];

  for (const relativeDirectory of relativeDirectories) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    if (existsSync(absoluteDirectory)) {
      files.push(...(await listFilesRecursive(absoluteDirectory)));
    }
  }

  return files;
}

async function listFilesRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(entryPath)));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|sql|json)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}
