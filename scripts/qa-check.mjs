import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = await readJson('package.json');
const requiredScripts = [
  'setup',
  'dev',
  'test',
  'test:unit',
  'test:integration',
  'test:e2e',
  'lint',
  'format',
  'typecheck',
  'build',
  'db:migrate',
  'db:seed',
  'db:reset',
  'graphify',
  'pricing:coverage:check',
  'qa',
  'security:audit',
  'security:scan',
  'devops:check',
  'cloud:check',
  'release:check',
  'check',
  'check:full',
];
const requiredFiles = [
  'specs/README.md',
  'specs/TEMPLATE.md',
  'docs/development/developer-setup.md',
  'docs/development/spec-driven-development.md',
  'docs/development/skill-qa-checklist.md',
  'docs/development/devops.md',
  'docs/cloud/cloud-readiness.md',
  'DEPLOY.md',
  'SECURITY.md',
  'PROGRESS.md',
];
const requiredTemplateHeadings = [
  'Problem',
  'Acceptance Criteria',
  'API Changes',
  'Data Changes',
  'UI States',
  'Test Plan',
  'Migration Impact',
  'DevOps Impact',
  'Cloud Impact',
  'Security Impact',
  'Observability',
  'Rollout Notes',
];

const failures = [];

for (const scriptName of requiredScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`Missing package script: ${scriptName}`);
  }
}

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing required workflow file: ${filePath}`);
  }
}

if (existsSync(path.join(root, 'specs/TEMPLATE.md'))) {
  const template = await readFile(path.join(root, 'specs/TEMPLATE.md'), 'utf8');
  for (const heading of requiredTemplateHeadings) {
    if (!template.includes(heading)) {
      failures.push(`Spec template is missing heading: ${heading}`);
    }
  }
}

await assertNoDirectProcessEnv('apps/api/src');
await assertNoDirectProcessEnv('apps/web/src');

if (failures.length > 0) {
  console.error('QA check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('QA check passed.');

async function assertNoDirectProcessEnv(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return;
  }

  const files = await listFiles(absoluteDirectory);
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (content.includes('process.env')) {
      failures.push(`Direct process.env usage found in ${path.relative(root, file)}`);
    }
  }
}

async function listFiles(directory) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}
