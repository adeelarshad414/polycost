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

## AWS Price List

Current adapter:

- Source: AWS Price List bulk offer files.
- Endpoint pattern: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<ServiceCode>/current/index.json`.
- Credentials: none required for the current public bulk-file adapter.

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

Recommended service account setup:

1. Enable the Cloud Billing API in the GCP project used for PolyCost operations.
2. Create a service account named `polycost-pricing-reader`.
3. Grant the minimum Cloud Billing read role available in your organization, typically `roles/billing.viewer` on the billing account or a custom role allowing catalog/list access.
4. Generate a short-lived OAuth access token through your approved workload identity flow.
5. Store the token in Vault:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp access_token="<oauth-access-token>"
```

The current adapter expects an access token. A future hardening step should exchange service account credentials or workload identity tokens automatically instead of storing a long-lived access token.

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
