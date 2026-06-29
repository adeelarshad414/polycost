# PolyCost Backend Architecture Spec

**Scope:** Pricing data layer, workload cost modeling, currency conversion, budget alerts, shareable reports

**Status:** Implementation source of truth for the V1 backend/data layer

**Excludes:** Frontend/UI. Presentation-layer work belongs in a separate frontend pass.

## 1. Why This Exists

Every frontend feature in PolyCost depends on a trustworthy backend cache:

1. SKU normalization: AWS, Azure, and GCP expose pricing catalogs with different service and SKU shapes.
2. Cache versus live separation: large provider catalogs and currency rates are synchronized on schedules, while user workloads are request-time data.
3. Scheduled jobs, not request-time provider calls: API routes read from PostgreSQL and never call cloud pricing or exchange-rate APIs directly.

## 2. System Overview

```text
scheduled jobs
  pricing-sync daily
  currency-sync hourly
  alert-evaluator every 15 minutes
  share-link-cleanup daily
        |
        v
database cache
  provider_skus
  pricing_snapshots
  storage_pricing
  egress_tier_rates
  exchange_rates
  workloads
  budgets
  alerts
  share_links
        |
        v
request-time API
  GET  /api/v1/pricing/compare
  GET  /api/v1/pricing/breakdown
  POST /api/v1/workloads
  POST /api/v1/budgets
  GET  /api/v1/alerts
  PATCH /api/v1/alerts/:id
  POST /api/v1/share-links
  GET  /api/v1/share/:token
  GET  /api/v1/exchange-rates
```

Rule of thumb: if it touches a provider pricing API, an exchange-rate API, or alert evaluation, it runs in a scheduled job and writes to the database. Request-time routes read from the database only.

## 3. Normalized Internal Schema

The V1 normalized pricing cache is:

- `provider_skus`: one row per comparable compute SKU with provider, raw SKU id, normalized family, vCPU, memory, provider region, OS, raw payload, and sync timestamp.
- `pricing_snapshots`: on-demand and commitment-term hourly prices for normalized SKUs.
- `storage_pricing`: flat per-GB-month storage prices by provider, region, and normalized tier.
- `egress_tier_rates`: tiered public-internet egress rates by provider, region, and effective date.
- `exchange_rates`: cached exchange rates by base/quote currency and fetch timestamp.
- `workloads`: persisted normalized workload inputs for comparison, sharing, and alerting.
- `budgets`: one budget threshold per workload.
- `alerts`: generated budget threshold and modeled-cost anomaly alerts.
- `share_links`: public token-scoped read-only report links with expiry and revocation.
- `workload_cost_observations`: modeled monthly-cost history used for week-over-week anomaly evaluation.

## 4. Region And Family Normalization

Region equivalence is maintained in `apps/api/src/pricing-normalization/region_map.json`. It starts with the canonical regions needed for V1 and maps each to provider-native regions, for example `us-east` to AWS `us-east-1`, Azure `eastus`, and GCP `us-east1`.

Instance-family equivalence is maintained in `apps/api/src/pricing-normalization/instance_family_map.json`. It maps provider-native instance families to:

- `general-purpose`
- `compute-optimized`
- `memory-optimized`
- `storage-optimized`
- `accelerated-computing`

Unmapped regions or families must fail clearly or be marked unsupported. Do not guess equivalence.

## 5. Scheduled Jobs

| Job                       | Frequency        | Responsibility                                                                |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `refresh-pricing-catalog` | Daily            | Pull provider pricing data through adapters and write cached catalog data.    |
| `currency-sync`           | Hourly           | Pull exchange rates using USD as the default base and write `exchange_rates`. |
| `alert-evaluator`         | Every 15 minutes | Evaluate modeled workload cost against `budgets` and write `alerts`.          |
| `share-link-cleanup`      | Daily            | Revoke expired share links by setting `revoked_at`.                           |

Use the scheduler already present in the backend. The current implementation uses BullMQ backed by Redis.

All jobs must be idempotent enough to rerun safely. Provider and currency sync failures must surface through logs and failed BullMQ jobs; they must not be hidden by fake fallback data.

## 6. Public Provider API Boundaries

AWS and Azure pricing syncs should use public pricing APIs:

- AWS Bulk Price List API / Price List data
- Azure Retail Prices API

The current GCP Cloud Billing Catalog adapter uses a Vault-provided access token because Google Cloud Billing Catalog access can require authenticated API access. This is a documented deviation from the earlier draft statement that all provider catalog calls are unauthenticated. The implementation must not call GCP at request time.

## 7. Request-Time API Scope

Request-time endpoints read from PostgreSQL only:

- `GET /api/v1/pricing/compare`: reads `provider_skus` and `pricing_snapshots`.
- `GET /api/v1/pricing/breakdown`: reads workload, compute, storage, and egress cache tables.
- `POST /api/v1/workloads`: persists user-modeled workload inputs.
- `POST /api/v1/budgets`: persists modeled-budget thresholds.
- `GET /api/v1/alerts`: reads generated alerts.
- `PATCH /api/v1/alerts/:id`: toggles dismissal.
- `POST /api/v1/share-links`: creates token-scoped read-only links.
- `GET /api/v1/share/:token`: returns only the shared workload and its comparison breakdown.
- `GET /api/v1/exchange-rates`: reads latest cached exchange rates.

## 8. Egress Calculation

Egress pricing is tiered, not flat. Calculation must walk ordered tier bands:

```text
remaining = gbPerMonth
total = 0
for tier in tiers sorted by tier_from_gb:
  tierCapacity = (tier_to_gb or infinity) - tier_from_gb
  amountInTier = min(remaining, tierCapacity)
  total += amountInTier * price_per_gb
  remaining -= amountInTier
  if remaining <= 0: break
```

The implementation lives in `apps/api/src/pricing-normalization/egress-tier-calculator.ts` and is covered by unit tests.

## 9. Budget Alert Semantics

PolyCost is an estimator, not a live billing integration. Alerts are therefore based on modeled workload cost from cached pricing data, not actual spend from AWS Cost Explorer, Azure Cost Management, or GCP Billing exports.

For V1, budget evaluation uses the lowest non-zero provider total from `GET /api/v1/pricing/breakdown` for the workload and `on_demand` term. If no provider has non-zero cached pricing, the evaluator skips that budget rather than emitting a false under-budget result.

Week-over-week anomaly alerts compare the current modeled monthly estimate to the latest stored modeled-cost observation at least seven days earlier.

## 10. Share-Link Security

Share links are public, token-based, unauthenticated, and scoped to a single workload report. They must:

- Use high-entropy random tokens.
- Enforce expiry.
- Respect revocation.
- Return no internal account, credential, or admin data.

## 11. Explicit V1 Exclusions

- AWS Spot pricing.
- Inter-region, cross-AZ, or cross-service transfer modeling.
- Storage retrieval/access fees such as Glacier retrieval.
- RI payment-option granularity.
- Live billing ingestion from cloud accounts.
- Terraform management or apply/destroy execution.

## 12. Resolved Open Decisions

- Scheduler: BullMQ with Redis, matching the existing pricing ETL scheduler.
- Workloads: `workloads` is a persisted normalized table introduced in the backend architecture migration.
- Exchange rates: Frankfurter public exchange-rate API is the default source, configurable via `EXCHANGE_RATE_API_URL`.
- Share links: public token-based read-only access as specified, not login-gated for V1.
