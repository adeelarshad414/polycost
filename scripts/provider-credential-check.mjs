import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const strict = process.argv.includes('--strict');
const useMockProviders = envBoolean('USE_MOCK_PROVIDERS', true);
const vaultAddr = process.env.VAULT_ADDR;
const vaultTokenFile = process.env.VAULT_TOKEN_FILE;
const diagramClassifierConfigured = Boolean(
  process.env.DIAGRAM_LLM_CLASSIFIER_ENDPOINT && process.env.DIAGRAM_LLM_CLASSIFIER_MODEL,
);

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

if (diagramClassifierConfigured) {
  results.push(await checkLlmVaultApiKey());
} else {
  results.push({
    provider: 'diagram-llm',
    status: 'pass',
    message:
      'Diagram LLM classifier endpoint/model are not both configured; parser will use deterministic stencil and alias classification only.',
  });
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

    if (
      !response.ok ||
      typeof accessToken !== 'string' ||
      accessToken.length === 0 ||
      isDummyCredential(accessToken)
    ) {
      return {
        provider: 'gcp',
        status: strict ? 'fail' : 'warn',
        message:
          'Vault path secret/polycost/providers/gcp does not contain a production-safe access_token.',
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

async function checkLlmVaultApiKey() {
  if (!vaultAddr || !vaultTokenFile) {
    return {
      provider: 'diagram-llm',
      status: strict ? 'fail' : 'warn',
      message:
        'DIAGRAM_LLM_CLASSIFIER_ENDPOINT and DIAGRAM_LLM_CLASSIFIER_MODEL require VAULT_ADDR and VAULT_TOKEN_FILE so PolyCost can read secret/polycost/llm api_key.',
    };
  }

  if (!existsSync(vaultTokenFile)) {
    return {
      provider: 'diagram-llm',
      status: strict ? 'fail' : 'warn',
      message: `Vault token file is not readable at ${vaultTokenFile}.`,
    };
  }

  try {
    const token = (await readFile(vaultTokenFile, 'utf8')).trim();
    const endpoint = `${vaultAddr.replace(/\/$/, '')}/v1/secret/data/polycost/llm`;
    const response = await fetch(endpoint, {
      headers: {
        'X-Vault-Token': token,
      },
    });
    const parsed = await response.json();
    const apiKey = parsed?.data?.data?.api_key;

    if (
      !response.ok ||
      typeof apiKey !== 'string' ||
      apiKey.length === 0 ||
      isDummyCredential(apiKey)
    ) {
      return {
        provider: 'diagram-llm',
        status: strict ? 'fail' : 'warn',
        message: 'Vault path secret/polycost/llm does not contain a production-safe api_key.',
      };
    }

    return {
      provider: 'diagram-llm',
      status: 'pass',
      message: 'Vault contains a diagram/NL parser API key at secret/polycost/llm api_key.',
    };
  } catch (error) {
    return {
      provider: 'diagram-llm',
      status: strict ? 'fail' : 'warn',
      message: `Could not verify diagram LLM Vault key: ${error instanceof Error ? error.message : 'unknown error'}.`,
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

function isDummyCredential(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'change_me_dev_only' ||
    normalized === 'dummy' ||
    normalized === 'example' ||
    normalized.includes('change_me')
  );
}
