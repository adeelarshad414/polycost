# Phase 2.6 Production Gap Closure

This pass closes practical demo-readiness gaps without redefining PolyCost as an
invoice-grade billing product.

## Pricing Coverage Truth Surface

`GET /api/v1/pricing/coverage` returns a provider/category matrix with:

- `live_catalog` rows for catalog-backed compute, storage, database, and network
  categories.
- `modeled` rows for support, licensing, and operations dimensions.
- SKU trace level (`sku_price_row` or `modeled_assumption`).
- Explicit invoice-grade future work: billing exports, private discounts, taxes,
  credits, marketplace/private offers, and SKU-to-invoice reconciliation.

This endpoint is the reviewer-facing answer for "how live is live pricing?"

## Diagram LLM Classifier Hook

Diagram Tier 3 classification now has a production hook:

- `DIAGRAM_LLM_CLASSIFIER_ENDPOINT`
- `DIAGRAM_LLM_CLASSIFIER_MODEL`
- Vault `secret/polycost/llm` key `api_key`

The classifier accepts one unresolved node at a time, asks for strict JSON schema
output, validates the result, and constructs the internal service requirement in code.
If config is absent, deterministic stencil/alias classification remains the default.
If model output is malformed, the node remains unresolved for manual review.

## Account And Team Persistence Foundation

Migration `025_account_team_foundation.sql` adds:

- `accounts`
- `teams`
- `team_memberships`
- nullable `team_id` on `workloads`, `comparisons`, and `diagram_imports`

The schema stores identity provider and external subject hashes only. It does not add a
login endpoint, password storage, session issuance, or authorization middleware. Those
must be implemented as a dedicated auth phase with rate limits, secure sessions, and
horizontal access-control tests.

## Security Advisory State

Targeted npm overrides remove the fixable low/moderate transitive advisories from
Google/OpenTelemetry/Babel/uuid optional tooling dependencies. The remaining audit
items are low-severity Graphify/Ollama development-tooling advisories with no upstream
fix available. Runtime CI still fails on high or critical advisories via
`npm run security:audit`.
