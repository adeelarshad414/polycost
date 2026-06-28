import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

const envExamplePath = path.join(root, '.env.example');
const cloudReadinessPath = path.join(root, 'docs/cloud/cloud-readiness.md');
const deployPath = path.join(root, 'DEPLOY.md');

for (const filePath of [envExamplePath, cloudReadinessPath, deployPath]) {
  if (!existsSync(filePath)) {
    failures.push(`Missing cloud readiness file: ${path.relative(root, filePath)}`);
  }
}

if (existsSync(envExamplePath)) {
  const envExample = await readFile(envExamplePath, 'utf8');
  for (const key of [
    'DB_HOST',
    'DB_NAME',
    'REDIS_HOST',
    'VAULT_ADDR',
    'VAULT_TOKEN_FILE',
    'PRICING_ETL_DEFAULT_REGION_AWS',
    'PRICING_ETL_DEFAULT_REGION_AZURE',
    'PRICING_ETL_DEFAULT_REGION_GCP',
    'NL_PARSE_MAX_INPUT_CHARS',
    'CORS_ALLOWED_ORIGINS',
  ]) {
    if (!envExample.includes(`${key}=`)) {
      failures.push(`.env.example is missing ${key}`);
    }
  }
}

const cloudProviders = await detectCloudProviders();
if (cloudProviders.length === 0) {
  warnings.push('No direct deployment provider configuration detected yet.');
}

const iacFiles = await findFiles(root, /\.(tf|tfvars|ya?ml|json)$/);
const deploymentIacFiles = iacFiles.filter((file) =>
  /(^|\/)(terraform|infra|k8s|kubernetes|helm|fly\.toml|vercel\.json|netlify\.toml)/i.test(
    path.relative(root, file),
  ),
);
if (deploymentIacFiles.length === 0) {
  warnings.push('No deployable IaC files detected; cloud check is documentation/config only.');
}

if (failures.length > 0) {
  console.error('Cloud readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}
console.log(
  `Cloud readiness check passed. Provider references: ${
    cloudProviders.length > 0 ? cloudProviders.join(', ') : 'none'
  }.`,
);

async function detectCloudProviders() {
  const providerRefs = new Set();
  const files = await findFiles(root, /\.(md|ts|tsx|js|json|ya?ml|env|sql)$/);
  const patterns = [
    ['aws', /\bAWS\b|AmazonEC2|AmazonS3|access_key_id/i],
    ['azure', /\bAzure\b|eastus|Retail Prices/i],
    ['gcp', /\bGCP\b|Google Cloud|Cloud Billing|us-central1/i],
    ['vault', /\bVault\b|VAULT_ADDR/i],
    ['docker', /docker compose|Dockerfile|docker-compose/i],
  ];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const [provider, pattern] of patterns) {
      if (pattern.test(content)) {
        providerRefs.add(provider);
      }
    }
  }

  return [...providerRefs].sort();
}

async function findFiles(directory, pattern) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  const ignoredDirectories = new Set([
    '.git',
    '.graphify',
    'coverage',
    'dist',
    'node_modules',
    'reports',
    'test-results',
  ]);

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await findFiles(entryPath, pattern)));
      }
    } else if (pattern.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}
