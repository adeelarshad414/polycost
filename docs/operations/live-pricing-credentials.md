# Live Pricing ETL And Credential Readiness

Phase 2.5 hardens traceability and demo readiness. It does not claim invoice-grade
coverage for every cloud SKU. PolyCost still treats provider pricing APIs as cached
decision evidence: catalog rows are refreshed, normalized, traced into comparison line
items, and exported for reviewer verification.

For exact setup steps, IAM policy JSON, dummy-value handling, and the production swap
procedure, see [Provider Credentials](../PROVIDER-CREDENTIALS.md) and
[Dummy Values](../../DUMMY-VALUES.md).

## Current Provider Sources

| Provider | Current adapter source          | Credential requirement                   | Notes                                                                                                                                                                  |
| -------- | ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS      | AWS Price List bulk offer files | None for the default bulk-file path      | The current adapter reads public bulk JSON by service/region. Query API or account-specific discount support would require AWS credentials in a later hardening phase. |
| Azure    | Azure Retail Prices API         | None                                     | Retail prices are public and unauthenticated. PolyCost requests USD and filters by service family, region, and price type.                                             |
| GCP      | Cloud Billing Catalog API       | Required when `USE_MOCK_PROVIDERS=false` | Store an OAuth access token in Vault at `secret/polycost/providers/gcp` key `access_token`. The token needs Cloud Billing Catalog read access.                         |

Official references:

- AWS Price List: <https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html>
- Azure Retail Prices: <https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices>
- GCP Cloud Billing Catalog SKUs: <https://docs.cloud.google.com/billing/docs/reference/rest/v1/services.skus/list>

## Local Demo Mode

For stakeholder demos, keep:

```bash
USE_MOCK_PROVIDERS=true
PRICING_ETL_RUN_ON_BOOT=true
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
```

This boots deterministic AWS/Azure/GCP catalog data and allows the UI, exports,
refresh-live workflow, budgets, alerts, share links, and exchange-rate features to run
without external cloud credentials.

Run:

```bash
npm run demo:up
```

## Real Provider ETL Mode

For a production-like cache refresh:

```bash
USE_MOCK_PROVIDERS=false
PRICING_ETL_RUN_ON_BOOT=false
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
```

Then seed provider secrets in Vault. GCP is required by the current adapter:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp access_token="<oauth-access-token>"
```

Optional diagram Tier 3 classification uses the same OpenAI-compatible secret path as
natural-language parsing. Configure both endpoint variables and seed the key:

```bash
DIAGRAM_LLM_CLASSIFIER_ENDPOINT="https://llm.example.com/v1/chat/completions"
DIAGRAM_LLM_CLASSIFIER_MODEL="diagram-classifier-model"
docker compose exec vault vault kv put secret/polycost/llm api_key="<llm-api-key>"
```

Validate readiness:

```bash
npm run provider:credentials:check
npm run provider:credentials:check:strict
```

Use strict mode in CI or pre-demo production rehearsals. Non-strict mode is intended for
local demos where mock providers are intentionally enabled.

## Traceability Contract

Every catalog-backed comparison line item now includes:

- provider, service category, SKU, source SKU, region, catalog region
- unit, unit price, currency, pricing basis, term, payment option
- effective date and fetched-at timestamp
- source endpoint or fixture URI, raw source record ID, transform version, payload hash
- derivation math and equivalence confidence
- deterministic `sourceRecordKey`

`POST /api/v1/comparisons/:id/refresh-live` extracts those trace references, refreshes
only provider-catalog or pricing-rate rows, persists raw plus normalized cache rows, and
then recomputes the saved workload. Modeled rows and local seed rows are skipped with a
warning instead of being sent to provider APIs.

`GET /api/v1/pricing/coverage` returns a machine-readable coverage matrix showing
which provider/category combinations are live-catalog traceable, which are modeled,
and why invoice-grade support remains future work.

## Remaining Production Coverage Gaps

- AWS coverage is bulk-price-list based; account-specific private pricing, taxes,
  credits, and negotiated discounts are intentionally out of scope.
- Azure coverage uses retail pricing only; enterprise agreements and private offers are
  not represented.
- GCP requires an operational token refresh strategy. The current secret is an access
  token, not a full service-account credential exchange flow.
- Provider category mapping is still filtered to PolyCost-supported compute, storage,
  database, and network categories plus modeled operations/licensing/support dimensions.
- Spot/preemptible and commitment data remains provider-availability dependent and is
  explicitly labeled when modeled.
- The only remaining npm audit advisories after targeted overrides are low-severity
  optional Graphify/Ollama development-tooling advisories with no upstream fix
  available at the time of this pass. Runtime `npm run security:audit` still gates
  high/critical findings.

Do not start Terraform/V3 demo work until the chosen demo workload shows trace keys in
the API result and exported reports.
