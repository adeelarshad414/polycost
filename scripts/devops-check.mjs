import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

for (const filePath of [
  '.github/workflows/ci.yml',
  'docker-compose.yml',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  '.env.example',
]) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing DevOps file: ${filePath}`);
  }
}

const packageJson = await readJson('package.json');
for (const scriptName of [
  'ci:lint',
  'ci:unit',
  'ci:integration',
  'ci:build',
  'ci:e2e',
  'ci:security',
  'check',
  'check:full',
]) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`Missing CI script: ${scriptName}`);
  }
}

if (existsSync(path.join(root, 'docker-compose.yml'))) {
  const compose = await readFile(path.join(root, 'docker-compose.yml'), 'utf8');
  for (const service of ['vault', 'vault-seed', 'postgres', 'redis', 'api', 'web']) {
    if (!compose.includes(`  ${service}:`)) {
      failures.push(`docker-compose.yml is missing service: ${service}`);
    }
  }

  const result = spawnSync('docker', ['compose', 'config', '--quiet'], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.error) {
    warnings.push(`Docker Compose config validation skipped: ${result.error.message}`);
  } else if (result.status !== 0) {
    failures.push(`docker compose config failed:\n${result.stderr || result.stdout}`);
  }
}

if (failures.length > 0) {
  console.error('DevOps check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}
console.log('DevOps check passed.');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}
