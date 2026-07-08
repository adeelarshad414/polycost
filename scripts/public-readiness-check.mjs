import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
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
  'docs/development/public-demo-hardening.md',
  'docs/demo-artifacts/README.md',
  'docs/PROVIDER-CREDENTIALS.md',
  'handover/HANDOVER-README.md',
  'handover/KNOWN-LIMITS.md',
  'handover/DEMO-SCRIPT.md',
  'HANDOVER-CENSUS.md',
  'HANDOVER-EXCELLENCE-REPORT.md',
  '.github/CODEOWNERS',
  '.github/dependabot.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing public-readiness file: ${filePath}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

if (packageJson.private !== true) {
  failures.push(
    'package.json should remain private:true until an intentional publish strategy exists',
  );
}
if (packageJson.license !== 'MIT') {
  failures.push('package.json license should stay aligned with LICENSE: MIT');
}
if (!packageJson.scripts?.['public:readiness:check']) {
  failures.push('package.json is missing public:readiness:check');
}
if (!packageJson.scripts?.check?.includes('npm run public:readiness:check')) {
  failures.push('package.json check script must include npm run public:readiness:check');
}
if (!packageJson.scripts?.['release:check']) {
  failures.push('package.json is missing release:check');
}

await assertFileContains('.gitignore', [
  ['env ignore rule', '.env'],
  ['local env ignore rule', '.env.local'],
]);

await assertFileContains('README.md', [
  [
    'public launch privacy note',
    'visibility can remain private until the maintainer intentionally changes it',
  ],
  [
    'decision-grade honesty',
    'not a billing, invoicing, or live cloud-account spend management system',
  ],
  ['public hardening doc link', 'docs/development/public-demo-hardening.md'],
  ['open-source readiness doc link', 'docs/development/open-source-readiness.md'],
  ['demo artifacts command', 'npm run demo:artifacts'],
]);

await assertFileContains('docs/development/open-source-readiness.md', [
  ['private visibility gate', 'remain private until launch approval'],
  ['public readiness guard command', 'npm run public:readiness:check'],
  ['no private data committed', 'No private credentials, customer data, invoices, diagrams'],
]);

await assertFileContains('docs/development/public-demo-hardening.md', [
  ['current verdict', '## Current Verdict'],
  ['demo modes', '## Public Demo Modes'],
  ['repository health checklist', '## Repository Health Checklist'],
  ['verification floor', 'npm run public:readiness:check'],
  ['blocked section', '## Blocked Or Deferred'],
]);

await assertFileContains('RELEASE-CHECKLIST.md', [
  ['public readiness command', 'npm run public:readiness:check'],
  ['public hardening doc', 'docs/development/public-demo-hardening.md'],
  ['provider logo/trademark review', 'cloud logos are not present'],
]);

await assertFileContains('CONTRIBUTING.md', [
  ['secret handling warning', 'Do not commit secrets'],
  ['pricing honesty rule', 'PolyCost estimates; it does not promise invoice-grade'],
  ['public readiness command', 'npm run public:readiness:check'],
]);

await assertFileContains('SECURITY.md', [
  ['private vulnerability reporting', 'Please report security vulnerabilities privately'],
  ['local security checks', 'npm run security:audit'],
  ['no credentials in reports', 'Do not include secrets, provider credentials'],
]);

await assertFileContains('.github/PULL_REQUEST_TEMPLATE.md', [
  ['public readiness validation checkbox', 'npm run public:readiness:check'],
  ['security/privacy risk notes', 'Security/privacy considerations'],
]);

await assertIssueTemplate('bug_report.yml', [
  ['secret warning', 'Do not include secrets'],
  ['environment field', 'Environment'],
  ['sanitized logs field', 'Sanitized logs or screenshots'],
]);
await assertIssueTemplate('feature_request.yml', [
  ['problem field', 'Problem or opportunity'],
  ['acceptance criteria field', 'Acceptance criteria'],
]);

await assertFileContains('docs/demo-artifacts/README.md', [
  ['artifact command', 'npm run demo:artifacts'],
  ['executive screenshot', 'executive-overview-desktop.png'],
  ['engineering screenshot', 'engineering-evidence-desktop.png'],
  ['mobile screenshot', 'mobile-workflow.png'],
  ['walkthrough video', 'demo-walkthrough.webm'],
]);

await assertNoTrackedEnvFiles();
assertNoProviderLogoAssets();

if (failures.length > 0) {
  console.error('Public readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Public readiness check passed.');

async function assertIssueTemplate(fileName, expectations) {
  await assertFileContains(path.join('.github/ISSUE_TEMPLATE', fileName), expectations);
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

async function assertNoTrackedEnvFiles() {
  try {
    const { stdout } = await execFileAsync('git', [
      'ls-files',
      '.env',
      '.env.local',
      '.env.production',
      '.env.development',
    ]);
    const trackedEnvFiles = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (trackedEnvFiles.length > 0) {
      failures.push(`Environment files must not be tracked: ${trackedEnvFiles.join(', ')}`);
    }
  } catch (error) {
    failures.push(`Could not verify tracked environment files: ${error.message}`);
  }
}

function assertNoProviderLogoAssets() {
  const rootsToScan = ['apps/web/public', 'apps/web/src', 'docs'];
  const providerLogoPattern = /(aws|amazon|azure|gcp|google[-_ ]?cloud).*logo/i;
  const matches = [];

  for (const relativeRoot of rootsToScan) {
    const scanRoot = path.join(root, relativeRoot);
    if (!existsSync(scanRoot)) {
      continue;
    }
    collectProviderLogoMatches(scanRoot, matches, providerLogoPattern);
  }

  if (matches.length > 0) {
    failures.push(
      `Provider logo assets should not be committed for public readiness: ${matches.join(', ')}`,
    );
  }
}

function collectProviderLogoMatches(directory, matches, pattern) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const relativePath = path.relative(root, absolutePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      collectProviderLogoMatches(absolutePath, matches, pattern);
      continue;
    }

    if (pattern.test(relativePath)) {
      matches.push(relativePath);
    }
  }
}
