import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'docs/HOW-TO-USE.md',
  'docs/DEPLOYMENT.md',
  'docs/RUNBOOK.md',
  'docs/COMPARISON.md',
  'docs/ARCHITECTURE.md',
  'docs/CUSTOMER-HANDOVER-LEDGER.md',
];

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing customer handover file: ${filePath}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.scripts?.['handover:check']) {
  failures.push('package.json is missing handover:check');
}
if (!packageJson.scripts?.check?.includes('npm run handover:check')) {
  failures.push('package.json check script must include npm run handover:check');
}

await assertFileContains('docs/HOW-TO-USE.md', [
  ['one-command demo', 'npm run demo:up'],
  ['natural language mode', 'Natural-language mode'],
  ['guided form mode', 'Guided-form mode'],
  ['diagram mode', 'Diagram mode'],
  ['pricing evidence chain', 'source endpoint or fixture URI'],
  ['Terraform bundle workflow', 'Download the ZIP bundle and evidence JSON'],
  ['workspace feature boundary', 'Production email delivery'],
]);

await assertFileContains('docs/DEPLOYMENT.md', [
  ['mock provider mode', 'USE_MOCK_PROVIDERS=true'],
  ['real provider rehearsal', 'USE_MOCK_PROVIDERS=false'],
  ['Vault secret boundary', 'Store secrets in Vault'],
  ['health endpoint release step', '/health/live'],
  ['backup and restore', 'Backups And Restore'],
  ['rollback', 'Rollback'],
  ['handover command', 'npm run handover:check'],
]);

await assertFileContains('docs/RUNBOOK.md', [
  ['service objectives', 'Service Objectives'],
  ['golden signals', 'Golden Signals'],
  ['Redis incident', 'Incident: Redis Unavailable'],
  ['stale pricing incident', 'Incident: Pricing Data Is Stale Or Missing'],
  ['refresh-live incident', 'Incident: Refresh Live Fails'],
  ['diagram incident', 'Incident: Diagram Parsing Is Wrong'],
  ['GitHub Actions runner blocker', 'runner_id'],
]);

await assertFileContains('docs/COMPARISON.md', [
  ['Infracost benchmark', 'Infracost'],
  ['Vantage benchmark', 'Vantage'],
  ['CloudZero benchmark', 'CloudZero'],
  ['IBM Cloudability benchmark', 'IBM Cloudability'],
  ['native calculators benchmark', 'Native calculators'],
  ['source limitation', 'Source limitation'],
  ['honest trailing areas', 'Where PolyCost Trails Established Tools'],
]);

await assertFileContains('docs/ARCHITECTURE.md', [
  ['Mermaid architecture', 'flowchart LR'],
  ['NWS core', 'Normalized Workload Specification'],
  ['provider extension', 'Extending A Provider Adapter'],
  ['service category extension', 'Adding A Service Category'],
  ['diagram extension', 'Extending Diagram Parsing'],
  ['Terraform extension', 'Extending Terraform Generation'],
  ['architecture boundaries', 'Known Architecture Boundaries'],
]);

await assertFileContains('docs/CUSTOMER-HANDOVER-LEDGER.md', [
  ['handover verdict', 'private customer/demo handover'],
  ['phase classification', 'Phase Classification'],
  ['eleven-lens audit', 'Eleven-Lens Audit'],
  ['mock inventory', 'Mock And Dummy Inventory'],
  ['evidence map', 'Evidence Map'],
  ['blocked section', 'Blocked Or Deferred'],
  ['handover acceptance', 'Handover Acceptance'],
]);

await assertFileContains('README.md', [
  ['handover guide link', 'docs/HOW-TO-USE.md'],
  ['deployment guide link', 'docs/DEPLOYMENT.md'],
  ['runbook link', 'docs/RUNBOOK.md'],
  ['comparison guide link', 'docs/COMPARISON.md'],
  ['architecture guide link', 'docs/ARCHITECTURE.md'],
]);

if (failures.length > 0) {
  console.error('Customer handover check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Customer handover check passed. Verified ${requiredFiles.length} handover docs.`);

async function assertFileContains(filePath, checks) {
  const absolutePath = path.join(root, filePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing file for content check: ${filePath}`);
    return;
  }

  const content = await readFile(absolutePath, 'utf8');
  for (const [description, needle] of checks) {
    if (!content.includes(needle)) {
      failures.push(`${filePath} missing ${description}: ${needle}`);
    }
  }
}
