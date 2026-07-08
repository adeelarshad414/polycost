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
  'docs/SECURITY-SUPPRESSIONS.md',
  'docs/verification/full-progress-ledger.md',
  'docs/HOW-TO-USE.md',
  'docs/DEPLOYMENT.md',
  'docs/RUNBOOK.md',
  'docs/COMPARISON.md',
  'docs/ARCHITECTURE.md',
  'docs/CUSTOMER-HANDOVER-LEDGER.md',
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
if (!packageJson.scripts?.['pricing:logic:coverage']) {
  failures.push('package.json is missing pricing:logic:coverage');
}
if (!packageJson.scripts?.['handover:check']) {
  failures.push('package.json is missing handover:check');
}
if (!packageJson.scripts?.['public:readiness:check']) {
  failures.push('package.json is missing public:readiness:check');
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

assertScriptIncludes('test:production-readiness', [
  'src/api/finops-proof.spec.ts',
  'src/pricing-normalization/pricing-reconciliation.spec.ts',
  'src/api/live-pricing-traceability.spec.ts',
  'src/api/auth-billing.spec.ts',
  'src/api/auth.controller.spec.ts',
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
  ['Terraform starter bundle workflow', 'Terraform Starter Bundles'],
]);

await assertFileContains('docs/DEPLOYMENT.md', [
  ['deployment health checks', '/health/ready'],
  ['real provider rehearsal', 'Real Provider Pricing Rehearsal'],
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
  ['security audit gate', 'npm run security:audit'],
  ['clean-clone demo command', 'npm run demo:up'],
  ['clean-clone timed verifier command', 'npm run demo:verify-clean'],
  ['demo artifact command', 'npm run demo:artifacts'],
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
]);

await assertFileContains('docs/development/public-demo-hardening.md', [
  ['current verdict', '## Current Verdict'],
  ['public demo modes', '## Public Demo Modes'],
  ['repository health checklist', '## Repository Health Checklist'],
  ['verification floor', '## Verification Floor'],
  ['blocked or deferred', '## Blocked Or Deferred'],
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
]);

await assertFileContains('scripts/live-verification.mjs', [
  ['live verification transcript path', 'POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH'],
  ['live verification transcript schema', "schemaVersion: '1.0'"],
  ['template transcript entry', "name: 'template-to-recommendation'"],
  ['diagram transcript entry', "name: 'diagram-to-PDF'"],
  ['workspace auth transcript entry', "name: 'workspace-auth-rbac-sso'"],
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
  ['redis transcript event', 'redis-degradation'],
  ['live verification transcript writer', 'writeTranscript'],
]);

await assertFileContains('scripts/clean-clone-demo-check.mjs', [
  ['10-minute clean-clone budget', 'POLYCOST_CLEAN_CLONE_MAX_MS'],
  ['README demo command', "['run', 'demo:up']"],
  ['isolated compose project', 'COMPOSE_PROJECT_NAME'],
  ['host API port isolation', 'API_HOST_PORT'],
  ['clean clone timing assertion', 'clean-clone-to-running'],
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
