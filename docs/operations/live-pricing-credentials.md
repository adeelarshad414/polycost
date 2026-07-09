# Live Pricing ETL And Credential Readiness

Phase 2.5 hardens traceability and demo readiness. It does not claim invoice-grade
coverage for every cloud SKU. PolyCost still treats provider pricing APIs as cached
decision evidence: catalog rows are refreshed, normalized, traced into comparison line
items, and exported for reviewer verification.

For exact setup steps, IAM policy JSON, dummy-value handling, and the production swap
procedure, see [Provider Credentials](../PROVIDER-CREDENTIALS.md) and
[Dummy Values](../../DUMMY-VALUES.md).

## Current Provider Sources

| Provider | Current adapter source          | Credential requirement                   | Notes                                                                                                                                                                                    |
| -------- | ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS      | AWS Price List bulk offer files | None for the default bulk-file path      | The current adapter reads public bulk JSON by service/region. Query API or account-specific discount support would require AWS credentials in a later hardening phase.                   |
| Azure    | Azure Retail Prices API         | None                                     | Retail prices are public and unauthenticated. PolyCost requests USD and filters by service family, region, and price type.                                                               |
| GCP      | Cloud Billing Catalog API       | Required when `USE_MOCK_PROVIDERS=false` | Store a short-lived OAuth token at `access_token`, or service account JSON at `service_account_json` for runtime token exchange. The credential needs Cloud Billing Catalog read access. |

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

If your deployment cannot mint a token before startup, use the service-account fallback:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp service_account_json=@/secure/path/polycost-pricing-reader.json
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

## Catalog Snapshot Evidence

Run the checked-in schema sample:

```bash
npm run pricing:catalog:snapshot:check
```

Run the local AWS/Azure/GCP snapshot comparison smoke:

```bash
npm run pricing:catalog:snapshot:smoke
```

Review the live capture plan without provider network calls:

```bash
npm run pricing:catalog:snapshot:capture:plan
```

Review live-capture readiness without provider network calls:

```bash
npm run pricing:catalog:snapshot:capture:preflight
```

Replay provider-native AWS/Azure/GCP fixture payloads through the same capture
normalizers without cloud credentials:

```bash
npm run pricing:catalog:snapshot:capture:smoke
```

For live provider proof, use the guarded capture command from an
operator-authenticated environment. AWS Price List and Azure Retail Prices use
public read-only catalog endpoints. GCP requires one of:
`GCP_CLOUD_BILLING_ACCESS_TOKEN`, `GCP_CLOUD_BILLING_ACCESS_TOKEN_FILE`, or Vault
`secret/polycost/providers/gcp access_token`.

Before claiming the target environment is ready for live provider capture, run:

```bash
POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true \
  POLYCOST_OPERATOR="<reviewer-name>" \
  PRICING_CATALOG_PREVIOUS_LIVE_EVIDENCE=<prior-live-provider-bundle.json> \
  npm run pricing:catalog:snapshot:capture:preflight:strict
```

```bash
POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true \
  npm run pricing:catalog:snapshot:capture -- \
  --live \
  --operator "<reviewer-name>" \
  --previous-evidence <prior-live-provider-bundle.json>
```

The command writes sanitized evidence only: row hashes, source record keys,
source payload hashes, public endpoint references, and representative row
samples. It does not write raw provider payloads, bearer tokens, signed URLs, or
credentials. After archiving the generated bundle, run:

```bash
npm run pricing:catalog:snapshot:check -- --require-live-provider <bundle.json>
```

Then record the bundle in a digest-bound archive manifest and validate the
archive:

```bash
npm run pricing:catalog:snapshot:capture:archive:check -- <archive.json>
```

Before claiming archived live-provider capture proof in a target environment, the
archive must pass strict mode:

```bash
npm run pricing:catalog:snapshot:capture:archive:strict -- <archive.json>
```

To generate the archive manifest from the captured artifacts instead of editing
JSON by hand, write the preflight and capture command outputs with `--json`, then
run:

```bash
npm run pricing:catalog:snapshot:capture:archive:build -- \
  --preflight <preflight.json> \
  --capture <capture.json> \
  --snapshot-evidence <bundle.json> \
  --operator "<reviewer-name>" \
  --output <archive.json> \
  --require-live-archive
```

For local credential-free verification of the builder handoff, run:

```bash
npm run pricing:catalog:snapshot:capture:archive:build:smoke
```

The archive verifier checks the manifest schema, operator attestation, strict
preflight posture, capture metadata, AWS/Azure/GCP provider coverage, referenced
evidence file SHA-256 digest, and the underlying
`--require-live-provider` snapshot evidence result. The checked-in archive sample
is `example-schema`; strict mode rejects it by design.

The local smoke proves freshness math, snapshot digests, exact row-change detection,
and source payload hash coverage. It does not call provider APIs and does not turn
catalog list prices into invoice-grade billing.

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
- GCP supports either a short-lived access token or a Vault-stored service account JSON
  fallback. Workload identity and externally minted short-lived tokens are still the
  preferred production pattern.
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
