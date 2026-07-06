import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const strict = process.argv.includes('--strict');
const useMockProviders = envBoolean('USE_MOCK_PROVIDERS', true);
const vaultAddr = process.env.VAULT_ADDR;
const vaultTokenFile = process.env.VAULT_TOKEN_FILE;

const results = [];

results.push({
  provider: 'aws',
  status: 'pass',
  message:
    'Current AWS adapter uses public AWS Price List bulk offer files; no account credential is required for default ETL.',
});
results.push({
  provider: 'azure',
  status: 'pass',
  message:
    'Azure Retail Prices API is unauthenticated for the current adapter; keep outbound HTTPS enabled.',
});

if (useMockProviders) {
  results.push({
    provider: 'gcp',
    status: 'pass',
    message:
      'Mock provider mode is enabled, so GCP Cloud Billing credentials are not required for local demo boot.',
  });
} else {
  results.push(await checkGcpVaultToken());
}

for (const result of results) {
  const marker = result.status === 'pass' ? 'PASS' : result.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${marker}] ${result.provider}: ${result.message}`);
}

const failures = results.filter((result) => result.status === 'fail');
const warnings = results.filter((result) => result.status === 'warn');

if (failures.length > 0 || (strict && warnings.length > 0)) {
  process.exit(1);
}

async function checkGcpVaultToken() {
  if (!vaultAddr || !vaultTokenFile) {
    return {
      provider: 'gcp',
      status: strict ? 'fail' : 'warn',
      message:
        'USE_MOCK_PROVIDERS=false requires VAULT_ADDR and VAULT_TOKEN_FILE so PolyCost can read secret/polycost/providers/gcp access_token.',
    };
  }

  if (!existsSync(vaultTokenFile)) {
    return {
      provider: 'gcp',
      status: strict ? 'fail' : 'warn',
      message: `Vault token file is not readable at ${vaultTokenFile}.`,
    };
  }

  try {
    const token = (await readFile(vaultTokenFile, 'utf8')).trim();
    const endpoint = `${vaultAddr.replace(/\/$/, '')}/v1/secret/data/polycost/providers/gcp`;
    const response = await fetch(endpoint, {
      headers: {
        'X-Vault-Token': token,
      },
    });
    const parsed = await response.json();
    const accessToken = parsed?.data?.data?.access_token;

    if (!response.ok || typeof accessToken !== 'string' || accessToken.length === 0) {
      return {
        provider: 'gcp',
        status: strict ? 'fail' : 'warn',
        message:
          'Vault path secret/polycost/providers/gcp does not contain a non-empty access_token.',
      };
    }

    return {
      provider: 'gcp',
      status: 'pass',
      message:
        'Vault contains a GCP Cloud Billing access token at secret/polycost/providers/gcp access_token.',
    };
  } catch (error) {
    return {
      provider: 'gcp',
      status: strict ? 'fail' : 'warn',
      message: `Could not verify GCP Vault token: ${error instanceof Error ? error.message : 'unknown error'}.`,
    };
  }
}

function envBoolean(name, defaultValue) {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
}
