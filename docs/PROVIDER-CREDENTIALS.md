# Provider Credentials And Live Pricing Setup

PolyCost can run two pricing modes:

- `USE_MOCK_PROVIDERS=true`: deterministic fixture-backed AWS, Azure, and GCP catalog rows for local demos and CI.
- `USE_MOCK_PROVIDERS=false`: provider adapters fetch public catalog list prices and persist traced catalog/cache rows.

Real provider mode is still catalog list-price mode. It is not invoice-grade billing: it does not include private discounts, enterprise agreements, credits, tax, support contracts, committed-use inventory already owned by the customer, or actual billed usage.

## Startup Guardrails

Production and staging config validation rejects `CHANGE_ME_DEV_ONLY`, `dummy`, and `example` placeholder values. Real provider mode outside development also requires `VAULT_TOKEN_FILE`, because provider/LLM secrets are read from Vault rather than `.env`.

Run these checks before a production rehearsal:

```bash
npm run provider:credentials:check
npm run provider:credentials:check:strict
```

## Credential Matrix

| Integration               | Required when `USE_MOCK_PROVIDERS=false` | Runtime configuration                                                                               | Secret location                 | Current production expectation                                                                       |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AWS public catalog        | No                                       | Outbound HTTPS to `pricing.us-east-1.amazonaws.com`                                                 | None read by current adapter    | Public Price List bulk files only; no AWS access keys should be stored for the current adapter.      |
| Azure public catalog      | No                                       | Outbound HTTPS to `prices.azure.com`                                                                | None read by current adapter    | Public Retail Prices API only; no Entra app registration scope or client secret is required.         |
| GCP public catalog        | Yes                                      | `VAULT_ADDR`, `VAULT_TOKEN_FILE`, optional `VAULT_NAMESPACE`                                        | `secret/polycost/providers/gcp` | Store either `access_token` or `service_account_json`; dummy values are rejected outside local mode. |
| Diagram/NL LLM classifier | Only when endpoint/model are configured  | `DIAGRAM_LLM_CLASSIFIER_ENDPOINT`, `DIAGRAM_LLM_CLASSIFIER_MODEL`, `VAULT_ADDR`, `VAULT_TOKEN_FILE` | `secret/polycost/llm`           | Store `api_key`; parser falls back to deterministic classification if endpoint/model are absent.     |

The API/web `.env` surface stays intentionally small:

```bash
USE_MOCK_PROVIDERS=false
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
VAULT_ADDR=http://vault:8200
VAULT_TOKEN_FILE=/run/polycost-vault-auth/token
# VAULT_NAMESPACE=admin/polycost
```

Do not put provider access tokens, service account JSON, OIDC client secrets, or LLM
API keys directly in `.env`. Put them in Vault and let the startup credential check
prove the runtime can read them.

## AWS Price List

Current adapter:

- Source: AWS Price List bulk offer files.
- Endpoint pattern: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<ServiceCode>/current/index.json`.
- Credentials: none required for the current public bulk-file adapter.
- Env vars read today: none.
- Vault paths read today: none.
- Exact scope today: unauthenticated public catalog read over outbound HTTPS.

If you later switch the adapter to the signed AWS Price List Query/Bulk APIs, create an IAM role with this least-privilege read policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "pricing:DescribeServices",
        "pricing:GetAttributeValues",
        "pricing:GetProducts",
        "pricing:GetPriceListFileUrl",
        "pricing:ListPriceLists"
      ],
      "Resource": "*"
    }
  ]
}
```

Reference: AWS documents these Price List actions in the "Find products and prices" billing policy example and lists Price List Query/Bulk endpoints in the AWS Price List guide.

## Azure Retail Prices

Current adapter:

- Source: Azure Retail Prices API.
- Endpoint: `https://prices.azure.com/api/retail/prices`.
- Credentials: none; Microsoft documents the API as unauthenticated for retail rates.
- Filters used by PolyCost: `serviceFamily`, `priceType`, `armRegionName`, and USD currency.
- Env vars read today: none.
- Vault paths read today: none.
- Exact app registration scope today: none. Do not create or store an Entra client
  secret for the current adapter.

Optional app registration:

1. Create an Entra ID app only if your deployment egress policy requires all outbound calls to be associated with a service principal.
2. No Azure Retail Prices API permission is needed by the current adapter.
3. Store any future client secret in Vault, not `.env`.

## GCP Cloud Billing Catalog

Current adapter:

- Source: Cloud Billing Catalog API.
- Endpoint pattern: `https://cloudbilling.googleapis.com/v1/services` and `https://cloudbilling.googleapis.com/v1/{serviceName}/skus`.
- Credentials: required when `USE_MOCK_PROVIDERS=false`.
- OAuth scope: `https://www.googleapis.com/auth/cloud-billing.readonly` is sufficient for catalog reads; `cloud-billing` or `cloud-platform` also work.
- Env vars read today: `USE_MOCK_PROVIDERS`, `VAULT_ADDR`, `VAULT_TOKEN_FILE`,
  and optional `VAULT_NAMESPACE`.
- Vault path read today: `secret/polycost/providers/gcp`.
- Accepted Vault keys:
  - `access_token`: a short-lived OAuth token generated by your approved workload identity flow.
  - `service_account_json`: a service account key JSON fallback that PolyCost exchanges for a short-lived Cloud Billing token at runtime.
  - `service_account_key_json`: legacy alias for `service_account_json`.

Recommended service account setup:

1. Enable the Cloud Billing API in the GCP project used for PolyCost operations.
2. Create a service account named `polycost-pricing-reader`.
3. Grant the minimum Cloud Billing read role available in your organization, typically `roles/billing.viewer` on the billing account or a custom role allowing catalog/list access.
4. Prefer generating a short-lived OAuth access token through your approved workload identity flow.
5. Store the token in Vault:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp access_token="<oauth-access-token>"
```

If your self-hosted deployment cannot mint access tokens externally yet, store service account JSON in Vault and let PolyCost exchange it at runtime:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp service_account_json=@/secure/path/polycost-pricing-reader.json
```

Treat service account JSON as a sensitive fallback. Rotate it, scope it to Cloud Billing catalog reads only, and prefer workload identity or externally minted short-lived tokens for production.

Validation command after credential storage:

```bash
USE_MOCK_PROVIDERS=false npm run provider:credentials:check:strict
```

The strict check fails if Vault is missing, the token file is unreadable, the GCP
secret path is absent, or the stored token/JSON is still a dummy placeholder.

## Flip From Mock To Real Mode

1. Start dependencies:

```bash
docker compose up -d postgres redis vault vault-seed
```

2. Store the required GCP token in Vault.

3. Set:

```bash
USE_MOCK_PROVIDERS=false
PRICING_ETL_RUN_ON_BOOT=false
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
VAULT_ADDR=http://vault:8200
VAULT_TOKEN_FILE=/run/polycost-vault-auth/token
```

4. Validate:

```bash
npm run provider:credentials:check:strict
npm run db:migrate
npm run api:dev
```

5. Trigger a pricing sync through the existing ETL scheduler/admin path, then verify comparison output includes `pricingTrace.sourceEndpoint`, `pricingTrace.sourceRecordId`, `pricingTrace.sourcePayloadHash`, and fetched timestamps.

## Lineage Expectations

Every catalog-backed number should expose:

- provider and category
- source endpoint or fixture URI
- raw source record ID
- deterministic source record key
- source fetched timestamp
- transform version
- payload hash
- SKU/rate used
- derivation math based on the 730-hour month standard where hourly
- equivalence confidence

If any mainstream demo line item lacks this evidence, treat it as a release blocker for the demo workload.
