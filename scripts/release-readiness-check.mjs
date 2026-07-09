import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'LICENSE',
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'CHANGELOG.md',
  'DUMMY-VALUES.md',
  'OVERLAY-INVENTORY.md',
  'BUTTON-INVENTORY.md',
  'OVERLAY-AUDIT-REPORT.md',
  'RELEASE-CHECKLIST.md',
  'LOADING-INVENTORY.md',
  'LOADING-AUDIT-REPORT.md',
  'HANDOVER-CENSUS.md',
  'HANDOVER-EXCELLENCE-REPORT.md',
  'docs/development/open-source-readiness.md',
  'docs/development/public-demo-hardening.md',
  'docs/browser-audit/README.md',
  'docs/SECURITY-SUPPRESSIONS.md',
  'docs/verification/full-progress-ledger.md',
  'docs/HOW-TO-USE.md',
  'docs/DEPLOYMENT.md',
  'docs/RUNBOOK.md',
  'docs/COMPARISON.md',
  'docs/ARCHITECTURE.md',
  'docs/CUSTOMER-HANDOVER-LEDGER.md',
  'docs/operations/invoice-artifact-production-profile.example.json',
  'docs/operations/evidence/aws-s3-retention-proof.example.json',
  'docs/operations/evidence/invoice-artifact-rehearsal-evidence.example.json',
  'docs/operations/evidence/terraform-validation-evidence.example.json',
  'docs/operations/evidence/terraform-destination-capture/terraform-destination-capture.example.json',
  'docs/operations/evidence/terraform-destination-capture/BUNDLE-MANIFEST.json',
  'docs/operations/evidence/terraform-destination-capture/tfplan.json',
  'docs/operations/evidence/vsdx-visual-evidence.example.json',
  'docs/operations/evidence/diagram-llm-corpus-evidence.example.json',
  'docs/operations/evidence/enterprise-idp-pilot-evidence.example.json',
  'docs/architecture/phase-v3-6-terraform-validation-evidence.md',
  'docs/architecture/phase-v3-7-terraform-destination-evidence-capture.md',
  'docs/architecture/phase-2-vsdx-visual-evidence.md',
  'docs/architecture/phase-2-diagram-llm-corpus-evidence.md',
  'docs/architecture/phase-2-enterprise-idp-pilot-evidence.md',
  'fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json',
  'handover/HANDOVER-README.md',
  'handover/DESIGN-SYSTEM.md',
  'handover/JOURNEYS.md',
  'handover/KNOWN-LIMITS.md',
  'handover/DEMO-SCRIPT.md',
  'handover/screenshots/README.md',
  '.github/CODEOWNERS',
  '.github/dependabot.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing release-readiness file: ${filePath}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.scripts?.['provider:credentials:check']) {
  failures.push('package.json is missing provider:credentials:check');
}
if (!packageJson.scripts?.['progress:verify']) {
  failures.push('package.json is missing progress:verify');
}
if (!packageJson.scripts?.['loading:check']) {
  failures.push('package.json is missing loading:check');
}
if (!packageJson.scripts?.['live:verify']) {
  failures.push('package.json is missing live:verify');
}
if (!packageJson.scripts?.['demo:verify-clean']) {
  failures.push('package.json is missing demo:verify-clean');
}
if (!packageJson.scripts?.['audit:export:smoke']) {
  failures.push('package.json is missing audit:export:smoke');
}
if (!packageJson.scripts?.['audit:export:smoke:local']) {
  failures.push('package.json is missing audit:export:smoke:local');
}
if (!packageJson.scripts?.['invoice:evidence:notary:smoke']) {
  failures.push('package.json is missing invoice:evidence:notary:smoke');
}
if (!packageJson.scripts?.['invoice:evidence:notary:smoke:local']) {
  failures.push('package.json is missing invoice:evidence:notary:smoke:local');
}
if (!packageJson.scripts?.['invoice:evidence:notary:receiver']) {
  failures.push('package.json is missing invoice:evidence:notary:receiver');
}
if (!packageJson.scripts?.['invoice:evidence:notary:receiver:smoke']) {
  failures.push('package.json is missing invoice:evidence:notary:receiver:smoke');
}
if (!packageJson.scripts?.['invoice:retention-proof:verify']) {
  failures.push('package.json is missing invoice:retention-proof:verify');
}
if (!packageJson.scripts?.['invoice:retention-proof:verify:smoke']) {
  failures.push('package.json is missing invoice:retention-proof:verify:smoke');
}
if (!packageJson.scripts?.['invoice:retention-proof:capture-plan']) {
  failures.push('package.json is missing invoice:retention-proof:capture-plan');
}
if (!packageJson.scripts?.['invoice:retention-proof:capture-plan:smoke']) {
  failures.push('package.json is missing invoice:retention-proof:capture-plan:smoke');
}
if (!packageJson.scripts?.['invoice:retention-proof:capture']) {
  failures.push('package.json is missing invoice:retention-proof:capture');
}
if (!packageJson.scripts?.['invoice:retention-proof:capture:smoke']) {
  failures.push('package.json is missing invoice:retention-proof:capture:smoke');
}
if (!packageJson.scripts?.['invoice:artifact-scanner:smoke']) {
  failures.push('package.json is missing invoice:artifact-scanner:smoke');
}
if (!packageJson.scripts?.['invoice:artifact-scanner:smoke:local']) {
  failures.push('package.json is missing invoice:artifact-scanner:smoke:local');
}
if (!packageJson.scripts?.['invoice:artifact-profile:check']) {
  failures.push('package.json is missing invoice:artifact-profile:check');
}
if (!packageJson.scripts?.['invoice:artifact-rehearsal:plan']) {
  failures.push('package.json is missing invoice:artifact-rehearsal:plan');
}
if (!packageJson.scripts?.['invoice:artifact-rehearsal:live']) {
  failures.push('package.json is missing invoice:artifact-rehearsal:live');
}
if (!packageJson.scripts?.['invoice:artifact-rehearsal:evidence:check']) {
  failures.push('package.json is missing invoice:artifact-rehearsal:evidence:check');
}
if (!packageJson.scripts?.['terraform:evidence:check']) {
  failures.push('package.json is missing terraform:evidence:check');
}
if (!packageJson.scripts?.['terraform:evidence:capture']) {
  failures.push('package.json is missing terraform:evidence:capture');
}
if (!packageJson.scripts?.['terraform:evidence:capture:smoke']) {
  failures.push('package.json is missing terraform:evidence:capture:smoke');
}
if (!packageJson.scripts?.['vsdx:visual-evidence:check']) {
  failures.push('package.json is missing vsdx:visual-evidence:check');
}
if (!packageJson.scripts?.['diagram:llm-corpus:check']) {
  failures.push('package.json is missing diagram:llm-corpus:check');
}
if (!packageJson.scripts?.['enterprise:idp:evidence:check']) {
  failures.push('package.json is missing enterprise:idp:evidence:check');
}
if (!packageJson.scripts?.['pricing:logic:coverage']) {
  failures.push('package.json is missing pricing:logic:coverage');
}
if (!packageJson.scripts?.['handover:check']) {
  failures.push('package.json is missing handover:check');
}
if (!packageJson.scripts?.['public:readiness:check']) {
  failures.push('package.json is missing public:readiness:check');
}
if (!packageJson.scripts?.['browser:audit']) {
  failures.push('package.json is missing browser:audit');
}
if (!packageJson.scripts?.['theme:hex:check']) {
  failures.push('package.json is missing theme:hex:check');
}
if (!packageJson.scripts?.['overlay:check']) {
  failures.push('package.json is missing overlay:check');
}
if (!packageJson.scripts?.['ci:unit']?.includes('npm run pricing:logic:coverage')) {
  failures.push('package.json ci:unit script must include npm run pricing:logic:coverage');
}
if (!packageJson.scripts?.check?.includes('npm run theme:hex:check')) {
  failures.push('package.json check script must include npm run theme:hex:check');
}
if (!packageJson.scripts?.check?.includes('npm run overlay:check')) {
  failures.push('package.json check script must include npm run overlay:check');
}
if (!packageJson.scripts?.check?.includes('npm run provider:credentials:check')) {
  failures.push('package.json check script must include npm run provider:credentials:check');
}
if (!packageJson.scripts?.check?.includes('npm run progress:verify')) {
  failures.push('package.json check script must include npm run progress:verify');
}
if (!packageJson.scripts?.check?.includes('npm run loading:check')) {
  failures.push('package.json check script must include npm run loading:check');
}
if (!packageJson.scripts?.check?.includes('npm run handover:check')) {
  failures.push('package.json check script must include npm run handover:check');
}
if (!packageJson.scripts?.check?.includes('npm run public:readiness:check')) {
  failures.push('package.json check script must include npm run public:readiness:check');
}
if (!packageJson.scripts?.check?.includes('npm run invoice:retention-proof:verify:smoke')) {
  failures.push(
    'package.json check script must include npm run invoice:retention-proof:verify:smoke',
  );
}
if (!packageJson.scripts?.check?.includes('npm run invoice:retention-proof:capture-plan:smoke')) {
  failures.push(
    'package.json check script must include npm run invoice:retention-proof:capture-plan:smoke',
  );
}
if (!packageJson.scripts?.check?.includes('npm run invoice:retention-proof:capture:smoke')) {
  failures.push(
    'package.json check script must include npm run invoice:retention-proof:capture:smoke',
  );
}
if (!packageJson.scripts?.check?.includes('npm run invoice:artifact-scanner:smoke:local')) {
  failures.push(
    'package.json check script must include npm run invoice:artifact-scanner:smoke:local',
  );
}
if (!packageJson.scripts?.check?.includes('npm run invoice:artifact-profile:check')) {
  failures.push('package.json check script must include npm run invoice:artifact-profile:check');
}
if (!packageJson.scripts?.check?.includes('npm run invoice:artifact-rehearsal:plan')) {
  failures.push('package.json check script must include npm run invoice:artifact-rehearsal:plan');
}
if (!packageJson.scripts?.check?.includes('npm run invoice:artifact-rehearsal:evidence:check')) {
  failures.push(
    'package.json check script must include npm run invoice:artifact-rehearsal:evidence:check',
  );
}
if (!packageJson.scripts?.check?.includes('npm run terraform:evidence:check')) {
  failures.push('package.json check script must include npm run terraform:evidence:check');
}
if (!packageJson.scripts?.check?.includes('npm run terraform:evidence:capture:smoke')) {
  failures.push('package.json check script must include npm run terraform:evidence:capture:smoke');
}
if (!packageJson.scripts?.check?.includes('npm run vsdx:visual-evidence:check')) {
  failures.push('package.json check script must include npm run vsdx:visual-evidence:check');
}
if (!packageJson.scripts?.check?.includes('npm run diagram:llm-corpus:check')) {
  failures.push('package.json check script must include npm run diagram:llm-corpus:check');
}
if (!packageJson.scripts?.check?.includes('npm run enterprise:idp:evidence:check')) {
  failures.push('package.json check script must include npm run enterprise:idp:evidence:check');
}

assertScriptIncludes('test:production-readiness', [
  'src/api/finops-proof.spec.ts',
  'src/pricing-normalization/pricing-reconciliation.spec.ts',
  'src/api/live-pricing-traceability.spec.ts',
  'src/api/auth-billing.spec.ts',
  'src/api/auth.controller.spec.ts',
  'src/api/scim-provisioning.service.spec.ts',
  'src/api/scim-provisioning.controller.spec.ts',
  'src/api/runtime-di.spec.ts',
  'src/diagram-parser/diagram-parser.service.spec.ts',
  'src/diagram-parser/llm-classifier.client.spec.ts',
  'src/reports/report-generators.spec.ts',
  'src/App.spec.tsx',
  'src/api-client.spec.ts',
]);

await assertFileContains('README.md', [
  ['one-command demo startup', 'npm run demo:up'],
  ['clean-clone timed verifier', 'npm run demo:verify-clean'],
  ['demo artifact capture', 'npm run demo:artifacts'],
  ['browser audit command', 'npm run browser:audit'],
  ['audit export local smoke command', 'npm run audit:export:smoke:local'],
  ['audit export staging smoke command', 'npm run audit:export:smoke'],
  ['invoice evidence notary local smoke command', 'npm run invoice:evidence:notary:smoke:local'],
  ['invoice evidence notary staging smoke command', 'npm run invoice:evidence:notary:smoke'],
  ['invoice evidence notary receiver command', 'npm run invoice:evidence:notary:receiver'],
  [
    'invoice evidence notary receiver smoke command',
    'npm run invoice:evidence:notary:receiver:smoke',
  ],
  ['provider retention proof capture command', 'npm run invoice:retention-proof:capture'],
  [
    'invoice artifact rehearsal evidence checker command',
    'npm run invoice:artifact-rehearsal:evidence:check',
  ],
  ['terraform validation evidence checker command', 'npm run terraform:evidence:check'],
  ['terraform destination evidence capture command', 'npm run terraform:evidence:capture'],
  ['VSDX visual evidence checker command', 'npm run vsdx:visual-evidence:check'],
  ['diagram LLM corpus checker command', 'npm run diagram:llm-corpus:check'],
  ['enterprise IdP pilot evidence checker command', 'npm run enterprise:idp:evidence:check'],
  [
    'terraform validation evidence architecture link',
    'docs/architecture/phase-v3-6-terraform-validation-evidence.md',
  ],
  [
    'terraform destination evidence capture architecture link',
    'docs/architecture/phase-v3-7-terraform-destination-evidence-capture.md',
  ],
  ['VSDX visual evidence architecture link', 'docs/architecture/phase-2-vsdx-visual-evidence.md'],
  [
    'diagram LLM corpus architecture link',
    'docs/architecture/phase-2-diagram-llm-corpus-evidence.md',
  ],
  [
    'enterprise IdP pilot architecture link',
    'docs/architecture/phase-2-enterprise-idp-pilot-evidence.md',
  ],
  [
    'catalog list-price honesty',
    'not a billing, invoicing, or live cloud-account spend management system',
  ],
  ['anonymous usage remains available', 'Anonymous users can still'],
  ['provider credential documentation link', 'docs/PROVIDER-CREDENTIALS.md'],
  ['handover documentation link', 'docs/CUSTOMER-HANDOVER-LEDGER.md'],
  ['handover package link', 'handover/HANDOVER-README.md'],
  ['handover excellence report link', 'HANDOVER-EXCELLENCE-REPORT.md'],
  ['open-source launch documentation link', 'docs/development/open-source-readiness.md'],
  ['public demo hardening documentation link', 'docs/development/public-demo-hardening.md'],
  ['browser audit documentation link', 'docs/browser-audit/README.md'],
]);

await assertFileContains('HANDOVER-CENSUS.md', [
  ['route and screen census', '## Route And Screen Census'],
  ['shared component census', '## Shared Component Census'],
  ['wiring census', '## Wiring Census'],
]);

await assertFileContains('HANDOVER-EXCELLENCE-REPORT.md', [
  ['census summary', '## Census Summary'],
  ['pass findings', '## Pass Findings'],
  ['competitor teardown', '## Competitor Teardown'],
  ['blocked section', '## Blocked'],
  ['human decision gate register', '## HUMAN_DECISION_GATE Register'],
]);

await assertFileContains('handover/HANDOVER-README.md', [
  ['run modes', '## Run Modes'],
  ['environment matrix', '## Environment Matrix'],
  ['repository map', '## Repository Map'],
]);

await assertFileContains('docs/CUSTOMER-HANDOVER-LEDGER.md', [
  ['customer handover verdict', 'private customer/demo handover'],
  ['phase classification table', '## Phase Classification'],
  ['eleven-lens audit table', '## Eleven-Lens Audit'],
  ['mock and dummy inventory', '## Mock And Dummy Inventory'],
  ['blocked or deferred section', '## Blocked Or Deferred'],
]);

await assertFileContains('docs/HOW-TO-USE.md', [
  ['customer demo command', 'npm run demo:up'],
  ['diagram input paths', 'Diagram mode'],
  ['VSDX visual evidence checker', 'npm run vsdx:visual-evidence:check'],
  ['diagram LLM corpus checker', 'npm run diagram:llm-corpus:check'],
  ['enterprise IdP pilot evidence checker', 'npm run enterprise:idp:evidence:check'],
  ['Terraform evidence capture workflow', 'npm run terraform:evidence:capture'],
  ['Terraform starter bundle workflow', 'Terraform Starter Bundles'],
]);

await assertFileContains('docs/DEPLOYMENT.md', [
  ['deployment health checks', '/health/ready'],
  ['real provider rehearsal', 'Real Provider Pricing Rehearsal'],
  ['audit export receiver verification', '## Audit Export Receiver Verification'],
  ['audit export local smoke command', 'npm run audit:export:smoke:local'],
  ['audit export staging smoke command', 'npm run audit:export:smoke'],
  [
    'invoice evidence notary receiver verification',
    '## Invoice Evidence Notary Receiver Verification',
  ],
  ['invoice evidence notary local smoke command', 'npm run invoice:evidence:notary:smoke:local'],
  ['invoice evidence notary staging smoke command', 'npm run invoice:evidence:notary:smoke'],
  [
    'invoice evidence notary reference receiver command',
    'npm run invoice:evidence:notary:receiver',
  ],
  [
    'invoice evidence notary reference smoke command',
    'npm run invoice:evidence:notary:receiver:smoke',
  ],
  ['backup and restore guidance', 'Backups And Restore'],
]);

await assertFileContains('docs/RUNBOOK.md', [
  ['service objectives', '## Service Objectives'],
  ['pricing stale incident', 'Incident: Pricing Data Is Stale Or Missing'],
  ['GitHub Actions runner blocker', 'runner_id'],
]);

await assertFileContains('docs/COMPARISON.md', [
  ['Infracost comparison', 'Infracost'],
  ['Cloudability comparison', 'IBM Cloudability'],
  ['source limitation', 'Source limitation'],
]);

await assertFileContains('docs/ARCHITECTURE.md', [
  ['architecture extension points', '## Extending A Provider Adapter'],
  ['Terraform extension points', '## Extending Terraform Generation'],
  ['known boundaries', '## Known Architecture Boundaries'],
]);

await assertFileContains('docs/PROVIDER-CREDENTIALS.md', [
  ['credential matrix', '## Credential Matrix'],
  ['AWS current credential scope', 'no AWS access keys should be stored for the current adapter'],
  ['Azure no app registration scope', 'Exact app registration scope today: none'],
  ['GCP Vault path', 'secret/polycost/providers/gcp'],
  [
    'GCP strict validation command',
    'USE_MOCK_PROVIDERS=false npm run provider:credentials:check:strict',
  ],
  ['diagram LLM Vault path', 'secret/polycost/llm'],
  ['diagram LLM corpus checker', 'npm run diagram:llm-corpus:check'],
  ['enterprise IdP Vault path', 'secret/polycost/auth/oidc'],
  ['enterprise IdP pilot evidence checker', 'npm run enterprise:idp:evidence:check'],
  ['provider retention proof manifest', '## Provider Retention Proof Manifest'],
  ['provider retention proof mode', 'INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE'],
  ['provider retention proof verifier command', 'npm run invoice:retention-proof:verify'],
  [
    'provider retention proof capture planner command',
    'npm run invoice:retention-proof:capture-plan',
  ],
  ['provider retention proof attach endpoint', 'blob/provider-retention-proof'],
  ['provider retention proof signed URL warning', 'Do not paste signed URLs'],
  ['provider retention proof ready gate', 'providerRetentionProofReady'],
  [
    'no env secret storage',
    'Do not put provider access tokens, service account JSON, OIDC client secrets, or LLM',
  ],
]);

await assertFileContains('RELEASE-CHECKLIST.md', [
  [
    'private-to-public visibility gate',
    'before changing the GitHub repository visibility from private to public',
  ],
  ['secret rotation task', 'Rotate any local/demo credentials'],
  ['git-history secret scan task', 'git-history secret scan'],
  ['branch protection task', 'Enable branch protection on `main`'],
  ['CI green requirement', 'Require the CI workflow to pass before merge'],
  ['billing/quota CI blocker note', 'billing, spending-limit'],
  ['issue template review task', 'Confirm issue templates and PR template render correctly'],
  ['provider logo/trademark review', 'cloud logos are not present'],
  ['pricing honesty task', 'catalog list-price estimates, not invoices'],
  ['known future gaps task', 'full visual VSDX rendering'],
  ['VSDX visual evidence checker command', 'npm run vsdx:visual-evidence:check'],
  ['diagram LLM corpus checker command', 'npm run diagram:llm-corpus:check'],
  ['enterprise IdP pilot evidence checker command', 'npm run enterprise:idp:evidence:check'],
  ['Terraform evidence capture smoke command', 'npm run terraform:evidence:capture:smoke'],
  ['security audit gate', 'npm run security:audit'],
  ['clean-clone demo command', 'npm run demo:up'],
  ['clean-clone timed verifier command', 'npm run demo:verify-clean'],
  ['demo artifact command', 'npm run demo:artifacts'],
  ['browser audit command', 'npm run browser:audit'],
  ['audit export local smoke command', 'npm run audit:export:smoke:local'],
  ['audit export staging smoke command', 'npm run audit:export:smoke'],
  ['invoice evidence notary local smoke command', 'npm run invoice:evidence:notary:smoke:local'],
  ['invoice evidence notary staging smoke command', 'npm run invoice:evidence:notary:smoke'],
  [
    'invoice evidence notary reference smoke command',
    'npm run invoice:evidence:notary:receiver:smoke',
  ],
  ['public readiness guard command', 'npm run public:readiness:check'],
  ['public demo hardening documentation', 'docs/development/public-demo-hardening.md'],
  ['unit coverage command', 'npm run ci:unit'],
  ['pricing logic coverage command', 'npm run pricing:logic:coverage'],
  ['Node 24 impeccable decision', 'On Node 24, run `npm run impeccable`'],
  ['overlay/button guard command', 'npm run overlay:check'],
]);

await assertFileContains('OVERLAY-AUDIT-REPORT.md', [
  ['finding register', '## Findings'],
  ['blocked section', '## Blocked'],
  ['human decision gate', '## HUMAN_DECISION_GATE Register'],
  ['keyboard evidence', 'Keyboard/focus verification'],
]);

await assertFileContains('OVERLAY-INVENTORY.md', [
  ['canonical overlay primitive', 'OverlayPrimitives'],
  ['window confirm status', 'window.confirm/window.alert'],
]);

await assertFileContains('BUTTON-INVENTORY.md', [
  ['shared button component', 'Button.tsx'],
  ['primary convention', 'Primary-button convention'],
]);

await assertFileContains('docs/development/open-source-readiness.md', [
  ['private until launch approval', 'remain private until launch approval'],
  ['branch protection', 'Branch protection is enabled for `main`'],
  ['secret scanning', 'Secrets scanning and push protection'],
  ['no private data committed', 'No private credentials, customer data, invoices, diagrams'],
  ['required files list', '.github/PULL_REQUEST_TEMPLATE.md'],
  ['release-readiness command', 'npm run release:check'],
  ['public-readiness command', 'npm run public:readiness:check'],
  ['browser audit command', 'npm run browser:audit'],
]);

await assertFileContains('docs/development/public-demo-hardening.md', [
  ['current verdict', '## Current Verdict'],
  ['public demo modes', '## Public Demo Modes'],
  ['repository health checklist', '## Repository Health Checklist'],
  ['verification floor', '## Verification Floor'],
  ['browser audit command', 'npm run browser:audit'],
  ['blocked or deferred', '## Blocked Or Deferred'],
]);

await assertFileContains('docs/browser-audit/README.md', [
  ['browser audit command', 'npm run browser:audit'],
  ['latest run pointer', 'Latest run:'],
]);

await assertFileContains('docs/SECURITY-SUPPRESSIONS.md', [
  ['eslint warning ledger', 'ESLint Security Plugin Warnings'],
  ['eslint suppression hygiene gate', 'npm run security:suppressions'],
  ['npm audit advisory ledger', 'GHSA-866g-f22w-33x8'],
  ['impeccable Node 24 tracking', 'impeccable@3.1.0'],
]);

await assertFileContains('docs/verification/full-progress-ledger.md', [
  ['phase A ledger', '## Phase A - Foundation And Core Pricing Engine'],
  ['phase B ledger', '## Phase B - Input Modes And Requirement Pipeline'],
  ['phase C ledger', '## Phase C - Dashboards, Personas And Analytics'],
  ['phase D ledger', '## Phase D - Exports, Reports And Sharing'],
  ['phase E ledger', '## Phase E - Diagram Ingestion'],
  ['phase F ledger', '## Phase F - Auth, Teams And RBAC'],
  ['phase G ledger', '## Phase G - Operations, Security And Release Readiness'],
  ['mock verification distinction', 'verified (mock)'],
  ['blocked CI runner evidence', 'runner_id: 0'],
  ['honest release verdict', 'not yet a full invoice-grade billing platform'],
]);

await assertFileContains('LOADING-INVENTORY.md', [
  ['loading inventory table', 'Cold SPA boot'],
  ['loading export inventory', 'Export PDF/CSV/Excel'],
  ['loading honesty note', 'No time-based fake progress was added'],
]);

await assertFileContains('LOADING-AUDIT-REPORT.md', [
  ['loading findings table', '## Findings And Disposition'],
  ['loading blocked section', '## Blocked'],
  ['loading human gate register', '## HUMAN_DECISION_GATE'],
]);

await assertFileContains('.github/workflows/ci.yml', [
  ['theme hex guard CI gate', 'npm run theme:hex:check'],
  ['provider credential readiness CI gate', 'npm run provider:credentials:check'],
  ['full progress verification CI gate', 'npm run progress:verify'],
  ['production-readiness focused regression CI gate', 'npm run test:production-readiness'],
  ['live E2E verification CI gate', 'npm run ci:e2e'],
  ['pricing logic coverage CI path', 'npm run ci:unit'],
  ['Node 20 impeccable skip reason', 'impeccable@3.1.0'],
  ['Node 24 release tracking note', 'RELEASE-CHECKLIST.md'],
]);

await assertFileContains('scripts/pricing-logic-coverage-check.mjs', [
  ['pricing logic threshold', 'POLYCOST_PRICING_LOGIC_COVERAGE_THRESHOLD'],
  ['pricing branch threshold', 'POLYCOST_PRICING_LOGIC_BRANCH_THRESHOLD'],
  ['pricing coverage artifact', 'coverage/api/coverage-final.json'],
]);

await assertFileContains('apps/web/e2e/polycost-browser.e2e.ts', [
  ['locked breakpoint browser proof', 'accessible across locked breakpoints'],
  ['375px breakpoint proof', "label: 'mobile 375'"],
  ['768px breakpoint proof', "label: 'tablet 768'"],
  ['1440px breakpoint proof', "label: 'desktop 1440'"],
  ['interactive accessible-name audit', 'expectInteractiveControlsAreNamed'],
]);

await assertFileContains('apps/web/src/styles/tokens.css', [
  ['PolyCost default accent', '--brand-500: #7c4fd0'],
  ['terracotta accent axis', "[data-accent='terracotta']"],
  ['provider accent tokens', '--aws: #d85a30'],
  ['status semantic tokens', '--status-ok: #2e9e76'],
]);

await assertFileContains('scripts/ci-e2e.mjs', [
  ['live verification inside compose E2E', "npmCommand, ['run', 'live:verify']"],
  ['isolated E2E compose project', 'POLYCOST_E2E_COMPOSE_PROJECT_NAME'],
  ['dynamic E2E port allocation', 'findAvailablePort'],
  ['E2E Vault host port override', 'POLYCOST_E2E_VAULT_HOST_PORT'],
  ['E2E API origin wiring', 'process.env.POLYCOST_API_ORIGIN = apiOrigin'],
]);

await assertFileContains('scripts/live-verification.mjs', [
  ['live verification transcript path', 'POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH'],
  ['live verification transcript schema', "schemaVersion: '1.0'"],
  ['SCIM live threshold', 'POLYCOST_SCIM_JOURNEY_MAX_MS'],
  ['template transcript entry', "name: 'template-to-recommendation'"],
  ['diagram transcript entry', "name: 'diagram-to-PDF'"],
  ['workspace auth transcript entry', "name: 'workspace-auth-rbac-sso'"],
  ['SCIM live transcript entry', "name: 'scim-provisioning-lifecycle'"],
  ['reserved pricing live smoke', 'selected reserved 3yr pricing model'],
  ['CSV export live smoke', 'CSV report generated and downloaded.'],
  ['Excel export live smoke', 'XLSX report generated and downloaded.'],
  ['what-if live smoke', 'ran cached region and scale what-if'],
  ['share-link live smoke', 'created read-only share link'],
  ['auth registration live smoke', '/api/v1/auth/register'],
  ['auth invitation acceptance live smoke', '/api/v1/auth/invitations/accept'],
  ['auth OIDC live smoke', '/api/v1/auth/sso/oidc/start'],
  ['auth RBAC denial live smoke', 'member billing import RBAC denial'],
  ['auth RBAC transcript status', 'rbacDeniedStatus: 403'],
  ['auth SSO state verification transcript', 'stateVerified'],
  ['SCIM live discovery denial', 'SCIM unauthenticated discovery denial'],
  ['SCIM live revoked token denial', 'SCIM revoked-token denial'],
  ['SCIM live metadata-only token list', 'metadataOnlyTokenList'],
  ['redis transcript event', 'redis-degradation'],
  ['live verification transcript writer', 'writeTranscript'],
]);

await assertFileContains('README.md', [
  ['SCIM provisioning foundation', 'SCIM provisioning foundation'],
  ['SCIM token endpoint', '/api/v1/auth/teams/:teamId/scim/tokens'],
  ['SCIM user endpoint', '/api/v1/scim/v2/Users'],
  ['SCIM admin workspace posture', 'access panel shows active token/user posture'],
  ['SCIM IdP onboarding guide', 'docs/ENTERPRISE-IDP-ONBOARDING.md'],
]);

await assertFileContains('docs/ENTERPRISE-IDP-ONBOARDING.md', [
  ['SCIM onboarding base URL', '/api/v1/scim/v2'],
  ['SCIM service provider config endpoint', 'GET /ServiceProviderConfig'],
  ['SCIM schemas endpoint', 'GET /Schemas'],
  ['SCIM resource types endpoint', 'GET /ResourceTypes'],
  ['Okta setup section', 'Okta-Style Setup'],
  ['Entra setup section', 'Microsoft Entra-Style Setup'],
  ['SCIM certification boundary', 'Formal SCIM certification'],
  ['enterprise IdP pilot evidence checker', 'npm run enterprise:idp:evidence:check'],
  ['managed IdP strict mode', '--require-managed-idp'],
]);

await assertFileContains('fixtures/scim/okta-user-create.json', [
  ['Okta SCIM userName fixture', '"userName": "platform.engineer@example.com"'],
  ['Okta SCIM externalId fixture', '"externalId": "okta-00u-platform-engineer"'],
]);

await assertFileContains('fixtures/scim/entra-user-create.json', [
  ['Entra SCIM userName fixture', '"userName": "platform.owner@example.com"'],
  ['Entra SCIM externalId fixture', '"externalId": "entra-8f77-platform-owner"'],
]);

await assertFileContains('fixtures/scim/deactivate-user-patch.json', [
  ['SCIM deactivate patch path', '"path": "active"'],
  ['SCIM deactivate patch value', '"value": false'],
]);

await assertFileContains('apps/web/src/api-client.ts', [
  ['SCIM token client list', 'listTeamScimTokens'],
  ['SCIM user client list', 'listTeamScimUsers'],
  ['SCIM token client create', 'createTeamScimToken'],
  ['SCIM token client revoke', 'revokeTeamScimToken'],
]);

await assertFileContains('apps/web/src/App.tsx', [
  ['SCIM provisioning panel', 'SCIM provisioning'],
  ['SCIM token creation label', 'SCIM token name'],
  ['SCIM token one-time copy label', 'Copy now. It will not be shown again.'],
  ['SCIM provisioned users list label', 'SCIM provisioned users'],
]);

await assertFileContains('apps/api/src/api/scim-provisioning.controller.ts', [
  ['SCIM Schemas route', 'scim/v2/Schemas'],
  ['SCIM ResourceTypes route', 'scim/v2/ResourceTypes'],
]);

await assertFileContains('apps/api/src/api/scim-provisioning.service.spec.ts', [
  ['SCIM discovery test', 'exposes SCIM discovery metadata only to valid SCIM bearer tokens'],
  ['SCIM Okta fixture test', 'okta-user-create.json'],
  ['SCIM Entra fixture test', 'entra-user-create.json'],
]);

await assertFileContains('database/migrations/040_team_scim_provisioning.sql', [
  ['SCIM token table', 'team_scim_tokens'],
  ['SCIM user mapping table', 'team_scim_external_users'],
  ['no plaintext token column', 'token_hash'],
  ['SCIM audit action', 'team.scim.user_upserted'],
]);

await assertFileContains('scripts/db.mjs', [
  ['SCIM migration validation', '040_team_scim_provisioning.sql'],
]);

await assertFileContains('docker/postgres/initdb.d/001-run-migrations.sh', [
  ['SCIM migration bootstrap', '040_team_scim_provisioning.sql'],
]);

await assertFileContains('scripts/clean-clone-demo-check.mjs', [
  ['10-minute clean-clone budget', 'POLYCOST_CLEAN_CLONE_MAX_MS'],
  ['README demo command', "['run', 'demo:up']"],
  ['isolated compose project', 'COMPOSE_PROJECT_NAME'],
  ['host API port isolation', 'API_HOST_PORT'],
  ['clean clone timing assertion', 'clean-clone-to-running'],
]);

await assertFileContains('scripts/audit-export-webhook-smoke.mjs', [
  ['signed audit export event', 'team_audit_event.recorded'],
  ['HMAC signature header', 'x-polycost-signature-sha256'],
  ['HTTPS default guard', 'HTTPS unless --allow-http-local'],
]);

await assertFileContains('scripts/audit-export-local-smoke.mjs', [
  ['local JSONL artifact path', 'artifacts'],
  ['constant-time signature verification', 'timingSafeEqual'],
  ['append-only local evidence', "flag: 'a'"],
]);

await assertFileContains('scripts/invoice-evidence-notary-webhook-smoke.mjs', [
  ['signed invoice evidence event', 'invoice_evidence_packet.exported'],
  ['HMAC signature header', 'x-polycost-signature-sha256'],
  ['HTTPS default guard', 'HTTPS unless --allow-http-local'],
]);

await assertFileContains('scripts/invoice-evidence-notary-local-smoke.mjs', [
  ['local JSONL artifact path', 'artifacts'],
  ['constant-time signature verification', 'timingSafeEqual'],
  ['append-only local evidence', "flag: 'a'"],
]);

await assertFileContains('scripts/invoice-evidence-notary-reference-receiver.mjs', [
  ['reference receiver event', 'invoice_evidence_packet.exported'],
  ['reference receiver health', '/health/ready'],
  ['constant-time signature verification', 'timingSafeEqual'],
  ['receiver artifact dir env', 'POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_ARTIFACT_DIR'],
  ['append-only receiver evidence', "flag: 'a'"],
  ['no immutable overclaim', 'immutableRetentionProved: false'],
]);

await assertFileContains('scripts/invoice-evidence-notary-reference-receiver-smoke.mjs', [
  ['spawns reference receiver', 'invoice-evidence-notary-reference-receiver.mjs'],
  ['uses staging webhook smoke sender', 'invoice-evidence-notary-webhook-smoke.mjs'],
  ['local HTTP exception is explicit', '--allow-http-local'],
  ['verifies captured receiver artifact', 'Captured receipt packet digest'],
]);

await assertFileContains('scripts/invoice-evidence-packet-verifier.mjs', [
  ['provider retention proof count verification', 'providerRetentionProofVerifiedCount'],
  ['provider retention proof gate verification', 'providerRetentionProofReady'],
]);

await assertFileContains('scripts/invoice-artifact-provider-retention-proof-verifier.mjs', [
  [
    'provider retention proof verifier schema',
    'invoice-artifact-provider-retention-proof-verification/v1',
  ],
  ['AWS proof validation', 'aws-s3-object-lock'],
  ['Azure proof validation', 'azure-blob-immutability'],
  ['GCP proof validation', 'gcp-gcs-retention'],
  ['no legal overclaim', 'immutableRetentionProvedByPolyCost: false'],
]);

await assertFileContains('scripts/invoice-artifact-provider-retention-proof-verifier-smoke.mjs', [
  ['AWS proof smoke fixture', 'provider-retention-proof-aws.json'],
  ['Azure proof smoke fixture', 'provider-retention-proof-azure.json'],
  ['GCP proof smoke fixture', 'provider-retention-proof-gcp.json'],
  ['digest mismatch smoke', 'proof digest mismatch'],
]);

await assertFileContains('scripts/invoice-artifact-provider-retention-proof-capture-plan.mjs', [
  [
    'provider retention proof capture plan schema',
    'invoice-artifact-provider-retention-proof-capture-plan/v1',
  ],
  ['AWS retention capture command', 'aws s3api get-object-retention'],
  ['Azure immutability capture command', 'az storage blob immutability-policy show'],
  ['GCP retention capture command', 'gcloud storage objects describe'],
  ['no cloud CLI execution by PolyCost', 'cloudCliExecutionByPolyCost: false'],
]);

await assertFileContains(
  'scripts/invoice-artifact-provider-retention-proof-capture-plan-smoke.mjs',
  [
    ['AWS capture plan smoke', 'aws s3api get-object-retention'],
    ['Azure capture plan smoke', 'az storage blob immutability-policy show'],
    ['GCP capture plan smoke', 'gcloud storage objects describe'],
    ['provider URI mismatch smoke', 'provider/URI mismatch'],
  ],
);

await assertFileContains('scripts/invoice-artifact-production-profile-check.mjs', [
  ['production profile check schema', 'polycost-invoice-artifact-production-profile-check/v1'],
  ['profile secret exclusion', 'forbiddenRuntimeSecretKeys'],
  ['profile proof verifier reuse', 'invoice-artifact-provider-retention-proof-verifier.mjs'],
  ['live cloud caveat', 'Run provider:credentials:check:strict'],
]);

await assertFileContains('scripts/invoice-artifact-scanner-webhook-smoke.mjs', [
  ['scanner signature header', 'x-polycost-artifact-signature'],
  ['scanner HTTPS guard', 'must use HTTPS unless --allow-http-local'],
  ['scanner clean verdict', "parsedResponse.verdict === 'clean'"],
  ['scanner secret dummy guard', 'isDummyCredential'],
]);

await assertFileContains('scripts/invoice-artifact-scanner-local-smoke.mjs', [
  ['local scanner receiver schema', 'invoice-artifact-scanner-local-smoke/v1'],
  ['constant-time scanner signature check', 'timingSafeEqual'],
  ['sandbox bind skip', 'local TCP bind is not permitted in this sandbox'],
  ['strict bind env', 'POLYCOST_INVOICE_ARTIFACT_SCANNER_LOCAL_SMOKE_STRICT=1'],
]);

await assertFileContains('scripts/invoice-artifact-staging-rehearsal.mjs', [
  ['staging rehearsal schema', 'polycost-invoice-artifact-staging-rehearsal/v1'],
  ['plan-only mode caveat', 'without reading Vault or calling external endpoints'],
  ['strict credential live step', 'provider-credentials-strict'],
  ['scanner live step', 'scanner-webhook-smoke'],
  ['notary live step', 'notary-webhook-smoke'],
  ['audit live step', 'audit-export-smoke'],
  ['secret handling statement', 'raw secrets must stay in Vault/runtime env'],
]);

await assertFileContains('scripts/invoice-artifact-rehearsal-evidence-check.mjs', [
  ['rehearsal evidence bundle schema', 'polycost-invoice-artifact-rehearsal-evidence/v1'],
  ['rehearsal evidence check schema', 'polycost-invoice-artifact-rehearsal-evidence-check/v1'],
  ['live evidence required option', '--require-live'],
  ['sample evidence distinction', 'example-schema'],
  ['raw secret material guard', 'findSecretMaterial'],
  ['profile archive reference drift guard', 'archiveReference must match profile evidence'],
]);

await assertFileContains(
  'docs/operations/evidence/invoice-artifact-rehearsal-evidence.example.json',
  [
    ['rehearsal evidence example schema', 'polycost-invoice-artifact-rehearsal-evidence/v1'],
    ['sample-only evidence level', 'example-schema'],
    ['provider credential JSON schema', 'polycost-provider-credential-check/v1'],
    ['profile check embedded output', 'polycost-invoice-artifact-production-profile-check/v1'],
    [
      'provider retention proof embedded output',
      'invoice-artifact-provider-retention-proof-verification/v1',
    ],
    ['sample caveat', 'sanitized sample evidence for CI/schema validation only'],
  ],
);

await assertFileContains('scripts/terraform-validation-evidence-check.mjs', [
  ['Terraform evidence bundle schema', 'polycost-terraform-validation-evidence/v1'],
  ['Terraform evidence check schema', 'polycost-terraform-validation-evidence-check/v1'],
  ['destination plan required option', '--require-destination-plan'],
  ['remote state guard', 'remoteState.lockingConfigured must be true'],
  ['destructive plan exception guard', 'destructivePlanExceptionApproved=true'],
  ['raw secret material guard', 'findSecretMaterial'],
]);

await assertFileContains('scripts/terraform-destination-evidence-capture.mjs', [
  ['Terraform capture profile schema', 'polycost-terraform-destination-evidence-capture/v1'],
  ['Terraform validation evidence output schema', 'polycost-terraform-validation-evidence/v1'],
  ['capture smoke mode', '--smoke'],
  ['destination plan checker handoff', '--require-destination-plan'],
  ['no shell Terraform execution', 'shell: false'],
  ['raw secret material guard', 'findSecretMaterial'],
]);

await assertFileContains('scripts/vsdx-visual-evidence-check.mjs', [
  ['VSDX visual evidence bundle schema', 'polycost-vsdx-visual-evidence/v1'],
  ['VSDX visual evidence check schema', 'polycost-vsdx-visual-evidence-check/v1'],
  ['human review required option', '--require-human-review'],
  ['approximate SVG preview type', 'approximate-svg'],
  ['raw VSDX payload guard', 'findForbiddenRawPayloads'],
]);

await assertFileContains('scripts/diagram-llm-corpus-check.mjs', [
  ['diagram LLM corpus schema', 'polycost-diagram-llm-corpus/v1'],
  ['diagram LLM evidence schema', 'polycost-diagram-llm-corpus-evidence/v1'],
  ['diagram LLM check schema', 'polycost-diagram-llm-corpus-check/v1'],
  ['live model required option', '--require-live-model'],
  ['service-type accuracy threshold', 'minServiceTypeAccuracy'],
  ['raw prompt payload guard', 'findForbiddenRawPayloads'],
]);

await assertFileContains('scripts/enterprise-idp-pilot-evidence-check.mjs', [
  ['enterprise IdP evidence schema', 'polycost-enterprise-idp-pilot-evidence/v1'],
  ['enterprise IdP check schema', 'polycost-enterprise-idp-pilot-evidence-check/v1'],
  ['managed IdP required option', '--require-managed-idp'],
  ['SCIM lifecycle journey requirement', 'scim-provisioning-lifecycle'],
  ['raw SSO payload guard', 'findForbiddenRawPayloads'],
]);

await assertFileContains('docs/operations/evidence/terraform-validation-evidence.example.json', [
  ['Terraform evidence example schema', 'polycost-terraform-validation-evidence/v1'],
  ['sample-only evidence level', 'example-schema'],
  ['bundle manifest schema', 'polycost.terraform.bundle.v1'],
  ['destination-plan caveat', 'sanitized sample evidence for CI/schema validation only'],
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
    ['destination plan profile cloud', '"targetCloud": "aws"'],
    ['destination plan profile artifact path', '"planJson": "tfplan.json"'],
    ['destination plan profile operator', '"operator": "example-only"'],
  ],
);

await assertFileContains('docs/operations/evidence/terraform-destination-capture/tfplan.json', [
  ['Terraform plan format version', '"format_version": "1.2"'],
  ['Terraform plan resource changes', '"resource_changes"'],
  ['Terraform plan cost tags', '"CostCenter": "finops"'],
]);

await assertFileContains('docs/operations/evidence/vsdx-visual-evidence.example.json', [
  ['VSDX visual evidence example schema', 'polycost-vsdx-visual-evidence/v1'],
  ['sample-only evidence level', 'example-schema'],
  ['layout extraction rendering mode', '"renderingMode": "layout-extraction"'],
  ['approximate SVG caveat', 'not full Visio visual rendering'],
  ['human review not claimed', '"humanPreviewReviewed": false'],
]);

await assertFileContains('fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json', [
  ['diagram LLM corpus schema', 'polycost-diagram-llm-corpus/v1'],
  ['diagram LLM corpus baseline name', 'tier-3-diagram-classifier-baseline'],
  ['service type corpus evidence', '"serviceType": "container-registry"'],
  ['generative AI corpus evidence', '"serviceType": "generative-ai"'],
]);

await assertFileContains('docs/operations/evidence/diagram-llm-corpus-evidence.example.json', [
  ['diagram LLM evidence example schema', 'polycost-diagram-llm-corpus-evidence/v1'],
  ['sample-only evidence level', 'example-schema'],
  ['fixture evidence mode', '"mode": "fixture-evidence"'],
  ['live-model caveat', 'evidenceLevel=live-model'],
  ['raw prompt exclusion', '"rawPromptsExcluded": true'],
]);

await assertFileContains('docs/operations/evidence/enterprise-idp-pilot-evidence.example.json', [
  ['enterprise IdP evidence example schema', 'polycost-enterprise-idp-pilot-evidence/v1'],
  ['sample-only evidence level', 'example-schema'],
  ['workspace auth journey', 'workspace-auth-rbac-sso'],
  ['SCIM provisioning journey', 'scim-provisioning-lifecycle'],
  ['managed IdP caveat', 'evidenceLevel=managed-idp-pilot'],
]);

await assertFileContains('docs/architecture/phase-v3-6-terraform-validation-evidence.md', [
  ['V3.6 title', 'Phase V3.6 Terraform Validation Evidence'],
  ['destination plan command', 'npm run terraform:evidence:check'],
  ['sample evidence distinction', 'example-schema'],
  ['operator boundary', 'PolyCost still does not run `terraform apply`'],
]);

await assertFileContains('docs/architecture/phase-v3-7-terraform-destination-evidence-capture.md', [
  ['V3.7 title', 'Phase V3.7 Terraform Destination Evidence Capture'],
  ['destination capture command', 'npm run terraform:evidence:capture'],
  ['destination capture smoke command', 'npm run terraform:evidence:capture:smoke'],
  ['operator boundary', 'PolyCost still does not run Terraform inside request handling'],
]);

await assertFileContains('docs/architecture/phase-2-vsdx-visual-evidence.md', [
  ['VSDX visual evidence title', 'Phase 2 VSDX Visual Evidence'],
  ['VSDX visual evidence command', 'npm run vsdx:visual-evidence:check'],
  ['sample evidence distinction', 'example-schema'],
  ['full Visio boundary', 'not full Visio visual rendering'],
]);

await assertFileContains('docs/architecture/phase-2-diagram-llm-corpus-evidence.md', [
  ['diagram LLM corpus title', 'Phase 2 Diagram LLM Corpus Evidence'],
  ['diagram LLM corpus command', 'npm run diagram:llm-corpus:check'],
  ['live model strict mode', '--require-live-model'],
  ['sample evidence distinction', 'example-schema'],
  ['production LLM boundary', 'not production LLM proof'],
]);

await assertFileContains('docs/architecture/phase-2-enterprise-idp-pilot-evidence.md', [
  ['enterprise IdP evidence title', 'Phase 2 Enterprise IdP Pilot Evidence'],
  ['enterprise IdP evidence command', 'npm run enterprise:idp:evidence:check'],
  ['managed IdP strict mode', '--require-managed-idp'],
  ['sample evidence distinction', 'example-schema'],
  ['enterprise IAM boundary', 'complete hosted IAM product'],
]);

await assertFileContains('docs/operations/invoice-artifact-production-profile.example.json', [
  ['production profile schema', 'polycost-invoice-artifact-production-profile/v1'],
  ['verified config evidence label', 'verified(config-evidence)'],
  ['external artifact storage backend', '"INVOICE_ARTIFACT_STORAGE_BACKEND": "aws-s3"'],
  [
    'provider control-plane proof mode',
    '"INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE": "provider-control-plane"',
  ],
  [
    'provider object-lock WORM mode',
    '"INVOICE_EVIDENCE_WORM_RETENTION_MODE": "provider-object-lock"',
  ],
  ['secret-reference-only storage credential', '"path": "secret/polycost/artifacts/aws"'],
]);

await assertFileContains('docs/operations/evidence/aws-s3-retention-proof.example.json', [
  ['AWS Object Lock retention mode', '"Mode": "COMPLIANCE"'],
  ['AWS legal hold evidence', '"Status": "ON"'],
]);

await assertFileContains('apps/api/src/api/billing.controller.ts', [
  [
    'provider retention proof attach route',
    'reconciliations/:id/artifacts/:artifactId/blob/provider-retention-proof',
  ],
]);

await assertFileContains('apps/api/src/api/billing.service.ts', [
  ['provider retention proof attach method', 'attachInvoiceArtifactProviderRetentionProof'],
  [
    'provider retention proof attach audit action',
    'billing.reconciliation.artifact_provider_retention_proof_attached',
  ],
  [
    'provider retention proof signed URL guard',
    'proofReference must not include embedded credentials',
  ],
]);

await assertFileContains('apps/api/src/api/auth-billing.spec.ts', [
  [
    'provider retention proof attach positive test',
    'attaches provider retention proof to an externally stored invoice artifact',
  ],
  [
    'provider retention proof signed URL rejection test',
    'rejects provider retention proof references with embedded signed-url credentials',
  ],
  [
    'provider retention proof packet gate test',
    'lets artifact-level provider retention proof satisfy the evidence packet gate',
  ],
]);

await assertFileContains('scripts/provider-credential-check.mjs', [
  ['provider credential JSON schema', 'polycost-provider-credential-check/v1'],
  ['provider credential JSON option', '--json'],
  [
    'provider retention proof credential check',
    'provider retention proof is not captured from the provider control plane',
  ],
  ['provider retention proof digest check', 'INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256'],
]);

await assertFileContains('docker/notary-receiver/Dockerfile', [
  ['Node 20 base image', 'node:20-alpine'],
  ['non-root runtime user', 'USER node'],
  ['container healthcheck', 'HEALTHCHECK'],
  ['receiver command', 'invoice-evidence-notary-reference-receiver.mjs'],
]);

await assertFileContains('apps/api/src/pricing-normalization/pricing-reconciliation.spec.ts', [
  ['20-rate reconciliation floor', 'at least 20 distinct'],
  ['complete lineage assertion', 'expectCompleteLineage'],
  ['provider breadth coverage', 'covers mainstream %s compute families'],
]);

await assertFileContains('apps/api/src/api/finops-proof.spec.ts', [
  ['shared 730-hour proof', 'HOURS_PER_MONTH).toBe(730)'],
  ['manual egress proof', 'manualMonthlyCostUsd).toBe(6553.6)'],
  ['manual break-even proof', 'Math.ceil(600 / (1000 - 850))'],
  ['spot estimate proof', "volatility: 'volatile'"],
]);

await assertFileContains('apps/api/src/api/auth-billing.spec.ts', [
  ['team RBAC matrix', 'enforces the team RBAC matrix'],
  ['billing admin RBAC', 'requires owner or admin access for billing imports'],
]);

await assertFileContains('scripts/invoice-artifact-provider-retention-proof-capture.mjs', [
  ['provider capture schema', 'invoice-artifact-provider-retention-proof-capture/v1'],
  ['structured command execution', 'spawnSync(command.bin, command.args'],
  ['shell disabled', 'shell: false'],
  ['credential-free caveat', 'providerCredentialsStoredByPolyCost: false'],
  ['signed URI rejection', 'unsupported query parameters'],
]);

await assertFileContains('scripts/invoice-artifact-provider-retention-proof-capture-smoke.mjs', [
  ['dry-run smoke', '--dry-run'],
  ['signed URI rejection smoke', 'X-Amz-Signature=secret'],
  ['SAS rejection smoke', 'sig=secret'],
  ['workspace output guard smoke', 'output-dir outside workspace'],
]);

await assertFileContains('docs/PROVIDER-CREDENTIALS.md', [
  ['provider retention proof capture command docs', 'npm run invoice:retention-proof:capture'],
  ['provider retention proof dry-run docs', '--dry-run --json'],
  ['no-shell capture docs', 'shell: false'],
  ['signed URI rejection docs', 'signed URLs, SAS tokens'],
]);

await assertFileContains('apps/api/src/diagram-parser/diagram-parser.service.spec.ts', [
  ['malicious XXE fixture', 'malicious/xxe.drawio'],
  ['malicious zip-bomb fixture', 'malicious/zip-bomb.vsdx'],
  ['oversized diagram fallback', 'caps oversized diagrams at 200 parsed nodes'],
  ['unsafe VSDX guard', 'still rejects unsafe VSDX XML'],
]);

await assertFileContains('.github/PULL_REQUEST_TEMPLATE.md', [
  ['format validation checkbox', 'npm run format:check'],
  ['lint validation checkbox', 'npm run ci:lint'],
  ['public readiness validation checkbox', 'npm run public:readiness:check'],
  ['security validation checkbox', 'npm run security:audit'],
  ['risk notes section', 'Security/privacy considerations'],
]);

await assertIssueTemplate('bug_report.yml', [
  ['secret warning', 'Do not include secrets'],
  ['reproduction steps', 'Steps to reproduce'],
  ['environment capture', 'Environment'],
]);
await assertIssueTemplate('feature_request.yml', [
  ['problem field', 'Problem or opportunity'],
  ['proposal field', 'Proposed solution'],
  ['acceptance criteria field', 'Acceptance criteria'],
]);

await assertFileContains(
  'database/migrations/039_invoice_artifact_provider_retention_proof_persistence.sql',
  [
    ['provider retention proof status column', 'provider_retention_proof_status'],
    ['provider retention proof evidence source column', 'provider_retention_proof_evidence_source'],
    ['provider retention proof consistency check', 'provider_retention_proof_consistency_check'],
    [
      'provider proof audit action',
      'billing.reconciliation.artifact_provider_retention_proof_attached',
    ],
    ['schema migration registration', 'invoice_artifact_provider_retention_proof_persistence'],
  ],
);
await assertFileContains('scripts/db.mjs', [
  [
    'provider retention proof migration in expected list',
    '039_invoice_artifact_provider_retention_proof_persistence.sql',
  ],
]);
await assertFileContains('docker/postgres/initdb.d/001-run-migrations.sh', [
  [
    'fresh database init applies provider proof migration',
    '039_invoice_artifact_provider_retention_proof_persistence.sql',
  ],
]);
await assertFileContains('apps/api/src/api/api-database.repository.ts', [
  [
    'provider retention proof row update method',
    'updateInvoiceArtifactProviderRetentionProofAndEvidence',
  ],
  [
    'provider retention proof blob readback',
    'providerRetentionProof: toInvoiceArtifactProviderRetentionProof(row)',
  ],
  ['provider retention proof insert column', 'provider_retention_proof_status'],
]);
await assertFileContains('apps/api/src/api/auth-billing.spec.ts', [
  [
    'provider retention proof service wiring test',
    'updateInvoiceArtifactProviderRetentionProofAndEvidence',
  ],
]);

if (failures.length > 0) {
  console.error('Release readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Release readiness check passed.');

async function assertIssueTemplate(fileName, expectations) {
  await assertFileContains(path.join('.github/ISSUE_TEMPLATE', fileName), expectations);
}

function assertScriptIncludes(scriptName, snippets) {
  const script = packageJson.scripts?.[scriptName];

  if (!script) {
    failures.push(`package.json is missing ${scriptName}`);
    return;
  }

  for (const snippet of snippets) {
    if (!script.includes(snippet)) {
      failures.push(`package.json ${scriptName} script is missing ${snippet}`);
    }
  }
}

async function assertFileContains(relativePath, expectations) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    return;
  }

  const content = await readFile(absolutePath, 'utf8');
  for (const [label, snippet] of expectations) {
    if (!content.includes(snippet)) {
      failures.push(`${relativePath} is missing ${label}: ${snippet}`);
    }
  }
}
