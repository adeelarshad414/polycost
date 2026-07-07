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
  'RELEASE-CHECKLIST.md',
  'docs/development/open-source-readiness.md',
  'docs/SECURITY-SUPPRESSIONS.md',
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
if (!packageJson.scripts?.['live:verify']) {
  failures.push('package.json is missing live:verify');
}
if (!packageJson.scripts?.['demo:verify-clean']) {
  failures.push('package.json is missing demo:verify-clean');
}
if (!packageJson.scripts?.['pricing:logic:coverage']) {
  failures.push('package.json is missing pricing:logic:coverage');
}
if (!packageJson.scripts?.['ci:unit']?.includes('npm run pricing:logic:coverage')) {
  failures.push('package.json ci:unit script must include npm run pricing:logic:coverage');
}
if (!packageJson.scripts?.check?.includes('npm run provider:credentials:check')) {
  failures.push('package.json check script must include npm run provider:credentials:check');
}
if (!packageJson.scripts?.check?.includes('npm run progress:verify')) {
  failures.push('package.json check script must include npm run progress:verify');
}

assertScriptIncludes('test:production-readiness', [
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
  ['open-source launch documentation link', 'docs/development/open-source-readiness.md'],
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
  ['unit coverage command', 'npm run ci:unit'],
  ['pricing logic coverage command', 'npm run pricing:logic:coverage'],
  ['Node 24 impeccable decision', 'On Node 24, run `npm run impeccable`'],
]);

await assertFileContains('docs/development/open-source-readiness.md', [
  ['private until launch approval', 'remain private until launch approval'],
  ['branch protection', 'Branch protection is enabled for `main`'],
  ['secret scanning', 'Secrets scanning and push protection'],
  ['no private data committed', 'No private credentials, customer data, invoices, diagrams'],
  ['required files list', '.github/PULL_REQUEST_TEMPLATE.md'],
  ['release-readiness command', 'npm run release:check'],
]);

await assertFileContains('docs/SECURITY-SUPPRESSIONS.md', [
  ['eslint warning ledger', 'ESLint Security Plugin Warnings'],
  ['eslint suppression hygiene gate', 'npm run security:suppressions'],
  ['npm audit advisory ledger', 'GHSA-866g-f22w-33x8'],
  ['impeccable Node 24 tracking', 'impeccable@3.1.0'],
]);

await assertFileContains('.github/workflows/ci.yml', [
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

await assertFileContains('scripts/ci-e2e.mjs', [
  ['live verification inside compose E2E', "npmCommand, ['run', 'live:verify']"],
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
