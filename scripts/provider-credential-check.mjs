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
  results.push(await checkGcpVaultCredential());
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

results.push(await checkInvoiceArtifactControls());

for (const result of results) {
  const marker = result.status === 'pass' ? 'PASS' : result.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${marker}] ${result.provider}: ${result.message}`);
}

const failures = results.filter((result) => result.status === 'fail');
const warnings = results.filter((result) => result.status === 'warn');

if (failures.length > 0 || (strict && warnings.length > 0)) {
  process.exit(1);
}

async function checkGcpVaultCredential() {
  if (!vaultAddr || !vaultTokenFile) {
    return {
      provider: 'gcp',
      status: strict ? 'fail' : 'warn',
      message:
        'USE_MOCK_PROVIDERS=false requires VAULT_ADDR and VAULT_TOKEN_FILE so PolyCost can read secret/polycost/providers/gcp access_token or service_account_json.',
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
    const secretData = parsed?.data?.data;
    const accessToken = secretData?.access_token;
    const serviceAccountJson =
      secretData?.service_account_json ?? secretData?.service_account_key_json;

    if (!response.ok) {
      return {
        provider: 'gcp',
        status: strict ? 'fail' : 'warn',
        message:
          'Vault path secret/polycost/providers/gcp is not readable for GCP pricing credentials.',
      };
    }

    if (
      typeof accessToken === 'string' &&
      accessToken.length > 0 &&
      !isDummyCredential(accessToken)
    ) {
      return {
        provider: 'gcp',
        status: 'pass',
        message:
          'Vault contains a GCP Cloud Billing access token at secret/polycost/providers/gcp access_token.',
      };
    }

    const serviceAccountCheck = validateGcpServiceAccountJson(serviceAccountJson);
    if (serviceAccountCheck.ok) {
      return {
        provider: 'gcp',
        status: 'pass',
        message:
          'Vault contains a GCP service account JSON credential at secret/polycost/providers/gcp; the adapter can exchange it for Cloud Billing read tokens.',
      };
    }

    return {
      provider: 'gcp',
      status: strict ? 'fail' : 'warn',
      message: `Vault path secret/polycost/providers/gcp must contain a production-safe access_token or service_account_json. ${serviceAccountCheck.reason}`,
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

async function checkInvoiceArtifactControls() {
  const backend = process.env.INVOICE_ARTIFACT_STORAGE_BACKEND ?? 'database-bytea';
  const scannerMode = process.env.INVOICE_ARTIFACT_MALWARE_SCANNER_MODE ?? 'eicar-signature-only';
  const retentionMode = process.env.INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE ?? 'report-only';
  const receiptMode = process.env.INVOICE_EVIDENCE_RECEIPT_MODE ?? 'metadata-only';
  const wormRetentionMode = process.env.INVOICE_EVIDENCE_WORM_RETENTION_MODE ?? 'not-configured';
  const providerRetentionProofMode =
    process.env.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE ?? 'not-configured';
  const objectStoreName = process.env.INVOICE_ARTIFACT_OBJECT_STORE_NAME;
  const gaps = [];

  if (backend === 'database-bytea') {
    gaps.push('artifact bytes are stored in Postgres instead of object storage');
  } else {
    if (!hasValue(objectStoreName)) {
      gaps.push('object store bucket/container is missing');
    }
    if (!hasValue(process.env.INVOICE_ARTIFACT_OBJECT_STORE_REGION)) {
      gaps.push('object store region is missing');
    }
    if (hasValue(objectStoreName)) {
      const storageCredentialCheck = await checkArtifactStorageVaultCredential(
        backend,
        objectStoreName,
      );

      if (storageCredentialCheck.status !== 'pass') {
        gaps.push(storageCredentialCheck.message);
      }
    }
  }

  if (!hasValue(process.env.INVOICE_ARTIFACT_KMS_KEY_REFERENCE)) {
    gaps.push('customer-managed KMS reference is missing');
  }

  if (scannerMode !== 'http-webhook') {
    gaps.push('scanner mode is not http-webhook');
  } else {
    if (!hasValue(process.env.INVOICE_ARTIFACT_MALWARE_SCANNER_URL)) {
      gaps.push('scanner webhook URL is missing');
    }
    if (!hasValue(process.env.INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET)) {
      gaps.push('scanner webhook secret is missing');
    }
  }

  if (retentionMode !== 'delete-expired') {
    gaps.push('retention mode is not delete-expired');
  }

  if (receiptMode === 'metadata-only') {
    gaps.push('evidence receipt mode is metadata-only');
  } else {
    if (!hasValue(process.env.INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE)) {
      gaps.push('evidence receipt signing key reference is missing');
    }
    if (!hasValue(process.env.INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET)) {
      gaps.push('evidence receipt signing secret is missing');
    }
  }

  if (
    receiptMode === 'external-webhook' &&
    !hasValue(process.env.INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL)
  ) {
    gaps.push('evidence notary webhook URL is missing');
  }

  if (wormRetentionMode === 'not-configured') {
    gaps.push('WORM retention mode is not configured');
  }

  if (backend !== 'database-bytea') {
    if (providerRetentionProofMode !== 'provider-control-plane') {
      gaps.push('provider retention proof is not captured from the provider control plane');
    } else {
      if (!hasValue(process.env.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE)) {
        gaps.push('provider retention proof reference is missing');
      }
      if (!hasSha256(process.env.INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256)) {
        gaps.push('provider retention proof SHA-256 digest is missing or invalid');
      }
    }
  }

  if (
    wormRetentionMode === 'external-worm-receiver' &&
    (process.env.AUTH_AUDIT_EXPORT_MODE ?? 'disabled') !== 'webhook'
  ) {
    gaps.push('external WORM receiver mode requires AUTH_AUDIT_EXPORT_MODE=webhook');
  }

  if (gaps.length === 0) {
    return {
      provider: 'invoice-artifacts',
      status: 'pass',
      message:
        'External object storage, Vault credentials, KMS reference, webhook scanner, retention enforcement, signed receipts, provider retention proof, and WORM posture are configured.',
    };
  }

  return {
    provider: 'invoice-artifacts',
    status: strict ? 'fail' : 'warn',
    message: `Artifact governance is demo/local only: ${gaps.join('; ')}.`,
  };
}

async function checkArtifactStorageVaultCredential(backend, objectStoreName) {
  if (!vaultAddr || !vaultTokenFile) {
    return {
      status: strict ? 'fail' : 'warn',
      message:
        'external artifact storage requires VAULT_ADDR and VAULT_TOKEN_FILE for provider object-store credentials',
    };
  }

  if (!existsSync(vaultTokenFile)) {
    return {
      status: strict ? 'fail' : 'warn',
      message: `artifact storage Vault token file is not readable at ${vaultTokenFile}`,
    };
  }

  try {
    if (backend === 'aws-s3') {
      const secretData = await readVaultKv('polycost/artifacts/aws');
      const accessKeyId = secretData?.access_key_id;
      const secretAccessKey = secretData?.secret_access_key;

      if (hasValue(accessKeyId) && hasValue(secretAccessKey)) {
        return {
          status: 'pass',
          message: 'Vault contains AWS S3 artifact credentials at secret/polycost/artifacts/aws.',
        };
      }

      return {
        status: strict ? 'fail' : 'warn',
        message:
          'Vault path secret/polycost/artifacts/aws must contain production-safe access_key_id and secret_access_key',
      };
    }

    if (backend === 'azure-blob') {
      const secretData = await readVaultKv('polycost/artifacts/azure');
      const accountName = secretData?.account_name;
      const sasToken = secretData?.sas_token;
      const configIncludesAccount = objectStoreName.includes('/');

      if ((configIncludesAccount || hasValue(accountName)) && hasValue(sasToken)) {
        return {
          status: 'pass',
          message:
            'Vault contains Azure Blob artifact credentials at secret/polycost/artifacts/azure.',
        };
      }

      return {
        status: strict ? 'fail' : 'warn',
        message:
          'Vault path secret/polycost/artifacts/azure must contain a production-safe sas_token and account_name unless INVOICE_ARTIFACT_OBJECT_STORE_NAME uses account/container',
      };
    }

    if (backend === 'gcp-gcs') {
      const artifactSecret = await readOptionalVaultKv('polycost/artifacts/gcp');
      const providerSecret = await readOptionalVaultKv('polycost/providers/gcp');
      const accessToken = artifactSecret?.access_token ?? providerSecret?.access_token;

      if (hasValue(accessToken)) {
        return {
          status: 'pass',
          message:
            'Vault contains a GCP GCS artifact access token at secret/polycost/artifacts/gcp or secret/polycost/providers/gcp.',
        };
      }

      return {
        status: strict ? 'fail' : 'warn',
        message:
          'Vault path secret/polycost/artifacts/gcp or secret/polycost/providers/gcp must contain a production-safe access_token for GCS artifact storage',
      };
    }

    return {
      status: strict ? 'fail' : 'warn',
      message: `unsupported artifact storage backend ${backend}`,
    };
  } catch (error) {
    return {
      status: strict ? 'fail' : 'warn',
      message: `Could not verify artifact storage Vault credentials: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

async function readOptionalVaultKv(path) {
  try {
    return await readVaultKv(path);
  } catch {
    return undefined;
  }
}

async function readVaultKv(path) {
  const token = (await readFile(vaultTokenFile, 'utf8')).trim();
  const endpoint = `${vaultAddr.replace(/\/$/, '')}/v1/secret/data/${path}`;
  const response = await fetch(endpoint, {
    headers: {
      'X-Vault-Token': token,
    },
  });
  const parsed = await response.json();

  if (!response.ok) {
    throw new Error(`Vault path secret/${path} is not readable`);
  }

  return parsed?.data?.data;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && !isDummyCredential(value);
}

function hasSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value.trim());
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

function validateGcpServiceAccountJson(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || isDummyCredential(value)) {
    return {
      ok: false,
      reason: 'No non-placeholder service_account_json was found.',
    };
  }

  try {
    const parsed = JSON.parse(value);

    if (typeof parsed.client_email !== 'string' || !parsed.client_email.includes('@')) {
      return {
        ok: false,
        reason: 'service_account_json is missing a client_email.',
      };
    }

    if (
      typeof parsed.private_key !== 'string' ||
      !parsed.private_key.includes('BEGIN PRIVATE KEY')
    ) {
      return {
        ok: false,
        reason: 'service_account_json is missing a private_key.',
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: 'service_account_json is not valid JSON.',
    };
  }
}
