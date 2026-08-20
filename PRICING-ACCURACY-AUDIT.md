# PolyCost — Pricing Accuracy & Production-Readiness Audit

**Date:** 2026-08-21
**Auditor scope:** Cloud cost / FinOps correctness of AWS, Azure, GCP pricing; calculation engine; real-time data pipeline.
**Question asked:** *Are PolyCost's billing calculations equal to a manual calculation from AWS/Azure/GCP, using real-time latest price data — i.e. is it production-ready?*

---

## Fix log (2026-08-20 remediation) — merged to `main`

| Finding | Status | PR |
| --- | --- | --- |
| B2 freshness honesty | ✅ fixed | #115 |
| B3 Azure unit-of-measure | ✅ fixed | #115 |
| B4 GCP sustained-use discount | ✅ fixed (live: n2 → $113.30) | #115 |
| N1 AWS live OOM/hang | ✅ fixed — streaming + region-specific (live: 2.6GB spool, no OOM) | #116, #117 |
| N2 compute SKU fit | ✅ fixed | #116 |
| Azure live ETL stack overflow | ✅ fixed (live: 14k rows, 0 overflow) | #118 |
| H5 Azure Spot/DevTest leak | ✅ fixed (live: 0 spot ingested) | #119 |
| Stale-row pruning (found via H5) | ✅ fixed (live: 3336 stale spot → 0) | #120 |
| H3 GCP savings-plan (fabricated model) | ✅ fixed; rest of H3 already mitigated (reserved uses catalog, spot/savings labeled `estimated`) | #121 |
| H4 AWS EC2 SKU filtering | ✅ fixed (Linux/Shared/Used/OnDemand only) | #121 |
| **H1 managed-DB storage dropped** | ✅ **FALSE POSITIVE** — costed via migration-004 seed | — |
| H2 hourly reconciliation | ⏳ open |  |
| H6 GCP custom families / serviceId matching | ⏳ open (larger rework) |  |
| Live AWS/Azure ETL persistence | ✅ resolved by N1/overflow fixes; AWS still network-bound locally |  |
| GCP live pricing | ⛔ blocked on operator Vault token |  |

---

## Bottom line

**No — not for that bar.** As shipped, PolyCost is a **decision-grade planning estimator running on static, hand-seeded mock data**, not a live, invoice-accurate calculator.

Two independent gaps:

1. **Data is not real-time or latest (by default).** The default config (`USE_MOCK_PROVIDERS=true`) means **no provider API is ever contacted**. Every number comes from a hand-written fixture file frozen at `effectiveDate 2026-07-01`. The real AWS/Azure/GCP adapters are never even constructed.
2. **Even in live mode, the math does not equal a manual provider calculation** on any non-trivial workload, due to concrete bugs (Azure 100× unit error, GCP sustained-use discounts ignored, DB storage silently dropped, tiered pricing truncated, reserved/spot faked with flat multipliers).

The codebase is *internally honest* about this — it self-labels `estimateGrade: 'decision_grade_estimate'` and `invoiceGradeSupported: false`. The problem is only that the product/marketing claim ("real-time latest prices, equal to manual calculation") is **stronger than what the code does**.

The most dangerous single issue: **the "data freshness" indicator reports `fresh — refreshed 0h ago` while serving 100% mock data**, so the UI can advertise fresh, live prices that are entirely fabricated.

---

## How it actually works

| | Default (shipped) | Live mode (`USE_MOCK_PROVIDERS=false` + config) |
|---|---|---|
| **Data source** | In-repo fixtures (`mock-pricing-fixtures.ts`), frozen `2026-07-01` | Real public APIs: AWS bulk Price List, Azure Retail Prices, GCP Cloud Billing Catalog |
| **Network calls** | None (`fixture://...` provenance) | Yes |
| **Credentials** | None | AWS/Azure: none (public). **GCP: Vault-backed OAuth token required** |
| **Refresh** | Nightly cron writes *mock* data back | Nightly cron (02:00) pulls live list prices |
| **"Real-time"?** | No | No — **daily** at best; initial `useLivePricing:true` is hard-rejected |

The ETL pipeline itself (BullMQ nightly cron, retry/backoff, failure alerts) is **genuinely production-grade**. The adapters for AWS and Azure public APIs and the credentialed GCP client are real and correctly wired. The problem is the default wiring points them all at fake data, and the accuracy bugs below persist even when they don't.

---

## Severity-ranked findings

### 🔴 BLOCKERS (must fix before any "accurate / real-time" claim)

| # | Finding | Evidence |
|---|---|---|
| **B1** | **All prices are static mock fixtures by default.** `USE_MOCK_PROVIDERS` defaults `true`; real adapters never instantiated. Numbers are hand-typed, frozen `2026-07-01`. | `config.schema.ts:60`; `provider-adapters.module.ts:37-45`; `mock-pricing-fixtures.ts:486` |
| **B2** | **Freshness indicator lies.** `overallStatus:'fresh'` / "refreshed 0h ago" is computed from ETL *run recency*, not data *authenticity*. Mock ETL runs on boot → UI shows "fresh live prices" over fabricated data. | `api-database.repository.ts:861-961` (48h policy, line 605) |
| **B3** | **Azure live path: `unitOfMeasure` quantity never parsed.** Meters priced per "100 Hours" / "10 Hours" are treated as per-hour → **hourly rate overstated up to 100×**. | `azure-provider.adapter.ts:134-135`; `normalized-pricing-records.ts:136,454` |
| **B4** | **GCP: Sustained-Use Discounts never applied; Committed-Use Discounts are fabricated.** Steady GCP VMs over-costed ~20–30% vs a real bill. CUD/"savings plan" use flat AWS-style multipliers (GCP has no savings plans). | GCP adapter emits on-demand only `gcp-provider.adapter.ts:237`; factors `pricing-rates.repository.ts:227-236` |

### 🟠 HIGH (materially wrong numbers; break "equal to manual calculation")

| # | Finding | Evidence |
|---|---|---|
| ~~**H1**~~ | ~~Managed-DB data storage silently dropped.~~ **FALSE POSITIVE (verified 2026-08-20).** The mock fixtures lack a `usage:storage` DB row, but migration `004_seed_local_pricing_catalog.sql` seeds one per provider (`local-seed-{aws,azure,gcp}-db-storage`, $0.115/$0.115/$0.170 GB-Mo) that `selectOptionalRecord(usage==='storage')` correctly selects. Live-tested: a 500 GB Postgres bills $57.50 (AWS/Azure) / $85.00 (GCP) of storage in both mock and live mode. Residual (minor): the rate is a single generic seed value, not an engine/tier-specific live SKU. | `base-cloud-provider.adapter.ts:165-182`; `database/migrations/004…:27,42,57` |
| **H2** | **Displayed hourly rate doesn't reconcile with monthly.** Per-line double-rounding to cents: any line < ~$3.65/mo rounds hourly to $0.00–0.01, so hourly/daily totals don't tie back to monthly. | `cost-time.ts:34-36`; `base-cloud-provider.adapter.ts:476,2032` |
| **H3** | **Reserved / Spot / Savings are flat synthetic multipliers across all 3 clouds** (×0.68 / ×0.52 / ×0.72 / ×0.38), not real rate cards. | `mock-pricing-fixtures.ts:58-64` |
| **H4** | **AWS: tiered S3/egress collapsed to tier-1; no EC2 SKU filtering.** On-demand path keeps only `dimensions.slice(0,1)`; no filter on OS/tenancy/capacityStatus → "cheapest-wins" can pick a wrong/$0 SKU. NAT/ALB/DNS/CDN hard-coded; Elastic IP & free tier absent. | `aws-provider.adapter.ts:253-254`; `awsProductMatchesCategory:319-342`; `comparison-orchestrator.service.ts:4901-4961` |
| **H5** | **Azure: Spot/Low-Priority/DevTest leak into on-demand; managed disks (P/E/S) dropped; egress tiering & free tier lost** in live path. | `azure-provider.adapter.ts:44-47,225-237`; `normalized-pricing-records.ts:433-437` |
| **H6** | **GCP: on-demand only, custom/modern machine families dropped, SKU matched by displayName regex, PD SKUs dropped when tier keyword missing, per-second billing ignored.** | `gcp-provider.adapter.ts:84-89,236-249`; `normalized-pricing-records.ts:338-416` |
| **H7** | **`refresh-live` is not first-class.** Initial `createComparison({useLivePricing:true})` hard-rejected; refresh re-queries only the configured provider and skips seed/modeled rows. | `comparison-application.service.ts:96-100`; `live-pricing-refresh.service.ts:80-93` |

### 🟡 MEDIUM (directional error; reconcile before quoting)

- **M1** Overlapping HA/resilience multipliers on stateful workloads (DB HA-standby 0.55× + stateful resilience 0.08× + SQL ×2 license) — soft double-count. `comparison-orchestrator.service.ts:1148-1185,2073-2089`
- **M2** Egress free-tier allowance (~100 GB/mo AWS/GCP) never subtracted — over-estimates low-egress workloads. `egress-tier-calculator.ts`
- **M3** NoSQL (DynamoDB/Cosmos/Firestore) priced as a fixed $/hr instance (~$80/mo flat) instead of per-request; additive request modeling can double-count. `mock-pricing-fixtures.ts:174-178`
- **M4** Compounded per-line cent rounding across ~40 modeled lines — cumulative drift; no accumulate-then-round. `cost-time.ts:34-36`
- **M5** Multi-AZ compute multiplier is 1.2×, not 2× — under-costs truly redundant instances. `:4035-4048`
- **M6** Only 3 AWS regions mapped / GCP fixed 9-region table; other regions silently fall back to a default region flagged approximate. `aws-provider.adapter.ts:57-61`; `region-map.ts:3-49`
- **M7** GCP egress tier breakpoints are AWS-shaped (10/50/150 TB) not GCP-shaped (1/10 TB, per-destination). `mock-pricing-fixtures.ts:472-475`

### 🟢 LOW

- No FX/currency handling — non-USD live rows summed as USD. `base-cloud-provider.adapter.ts:573`
- GCP direct-egress planning rate ($0.12) inconsistent with catalog tier-1 ($0.085).
- Seeded spot/savings catalog rows unused (modeled factors used instead).
- `dedicated-host` vs `sole-tenant` rate branches are no-ops (identical).
- Free tier not modeled anywhere.

---

## Accuracy reality check

**The per-unit seeded rates are actually good** — compute, object/block/file storage, and managed-Postgres rates track real 2026 list prices to within a few percent:

| Dimension | AWS seed | Azure seed | GCP seed | Real 2026 list |
|---|---|---|---|---|
| GP compute /hr (2 vCPU/8 GB) | $0.096 | $0.096 | $0.097 | ~$0.096–0.101 ✓ |
| Object standard /GB-mo | $0.023 | $0.0184 | $0.02 | ✓ |
| Block GP SSD /GB-mo | $0.08 | $0.081 | $0.10 | ✓ |
| Managed Postgres /hr | $0.154 | $0.145 | $0.151 | ~$0.156 ✓ |
| Egress tier-1 /GB | $0.09 | $0.087 | $0.085 | ✓ |

**So the errors that break "equal to manual calculation" are structural, not per-unit:**
- For a **simple** compute + object/block storage + egress workload on **list prices**, PolyCost lands within a few percent of a manual calc (730-hr convention applied consistently, all intervals derive from one monthly base, tiered egress math is correct).
- For **stateful / HA / discounted** workloads it diverges: DB storage dropped (H1), GCP SUD ignored (B4, ~20–30% high), Azure unit bug (B3, up to 100× high), reserved/spot faked (H3), HA double-counting (M1).
- It is **never invoice-grade** and **never real-time** — daily cron at best, and only after live mode is configured.

---

## What "production ready" for this claim requires

**Tier 0 — stop the misleading signal (do first):**
1. Fix B2: make freshness/authenticity distinguish live-catalog rows from `local_seed`/mock rows; never show "fresh live" over mock data.
2. Flip defaults for any environment that claims real prices: `USE_MOCK_PROVIDERS=false`, provision GCP Vault credentials, verify ETL success before serving.

**Tier 1 — correctness bugs (blockers to accuracy):**
3. B3: parse Azure `unitOfMeasure` quantity (divide unitPrice by the "N Hours"/"N GB" quantity).
4. B4: apply GCP Sustained-Use Discounts; pull real CUD SKUs instead of flat multipliers.
5. H1: add managed-DB allocated-storage line on all paths.
6. H4/H5/H6: EC2 OS/tenancy/capacity SKU filtering; Azure Spot/disk/egress handling; GCP custom/modern families + PD tiers; stop `displayName`-regex service matching.
7. H3: source real reserved/spot/savings rate cards, or clearly label them "modeled ±X%".

**Tier 2 — completeness & hygiene:**
8. Tiered S3/egress ladders end-to-end (H4); free-tier allowances (M2); NoSQL per-request (M3); HA multiplier de-dup (M1); accumulate-then-round money (H2/M4); full region coverage (M6); FX handling.

**Tier 3 — validation gate:**
9. Golden-file tests that assert PolyCost's per-service output equals the AWS/Azure/GCP public Pricing Calculator for a set of reference workloads, within a stated tolerance — run in CI against live adapters. This is the missing proof that "billing calculations equal manual calculation."

---

## Verdict

- **Real-time latest prices?** ❌ No by default (static mock, frozen date); ⚠️ daily list-price refresh only after live mode is configured. Never true real-time.
- **Equal to a manual AWS/Azure/GCP calculation?** ⚠️ Approximately, for simple list-price workloads once live; ❌ No for stateful/HA/discounted workloads, and ❌ never invoice-grade.
- **Production-ready as a decision-grade planning estimator?** ✅ Largely yes — architecture, ETL, and per-unit rates are solid.
- **Production-ready as a bill-accurate, real-time calculator?** ❌ No — see Tier 0/1 above.

*Non-blocking note: local Docker runtime is flaky (Docker Desktop + Colima both installed and fighting over the default context). Pin `DOCKER_CONTEXT` to one runtime for stable local runs. This is orthogonal to the pricing findings, which are code-level.*

---

## Addendum — 2026-08-21 remediation session

### Fixes applied (branch `fix/pricing-accuracy-tier0-1`, 504 API unit tests pass)

- **B3 Azure unit-of-measure** — FIXED. `parseAzureUnitOfMeasure()` now divides `unitPrice` by the block quantity ("100 Hours" → per-hour). `apps/api/src/adapters/azure/azure-provider.adapter.ts`.
- **B4 GCP sustained-use discount** — FIXED. Applied to GCP on-demand compute only (N1 30%; N2/N2D/C2/C2D/M/A2/G2 20%; E2/T2/newer excluded), never stacking with committed/spot, surfaced in `pricingTrace.derivation`. `apps/api/src/adapters/common/base-cloud-provider.adapter.ts`.
- **B2 freshness honesty** — FIXED. `data-health` now computes `dataProvenance` + `usesNonLivePricing`, raises a warning alert for non-live data, and can no longer report `fresh` over mock/seed. `apps/api/src/api/api-database.repository.ts`.
- **Golden accuracy harness** — ADDED. `test/golden/pricing-accuracy-golden.json` + `scripts/pricing-accuracy-harness.mjs` (`npm run pricing:accuracy:golden`).

### New findings surfaced by the live test — root-caused and addressed

- **N1 (HIGH) — Live AWS/Azure ETL fails; the bulk feed is un-parseable as coded.** With `USE_MOCK_PROVIDERS=false`, the live AWS/Azure boot ETL ran for **~18 minutes each and failed** (`fetch failed`, 0 records), leaving the catalog 100% mock+seed while status read `success`/`fresh` (only the B2 fix exposes this). Root cause: the **AWS EC2 Price List region index is ~480 MB** (`Content-Length: 480074423`) and the adapter buffers the whole body and `JSON.parse`s it (`http-client.ts parseJsonResponse`), which hangs/OOMs; the HTTP client also had **no timeout**, so a stalled fetch hung for 18 min. Azure's endpoint works for scoped queries — its failure was collateral (memory/event-loop starvation + unbounded pagination).
  - **PARTIAL FIX applied:** added a fetch **timeout** (`PROVIDER_HTTP_TIMEOUT_MS`, default 60s) and a **response-size cap** (`PROVIDER_HTTP_MAX_RESPONSE_BYTES`, default 64 MB) to `http-client.ts` so the oversized AWS feed **fails fast with a clear diagnostic** instead of hanging/OOM. This makes the failure honest and quick.
  - **STILL REQUIRED for real AWS live pricing:** stream-parse the bulk feed, or migrate the AWS adapter to the filtered **Price List Query API** (SigV4-authenticated, paged, small responses). This is a larger change and remains open.
- **N2 (RESOLVED) — not a memory bug; apples-vs-oranges SKU class.** The harness flag ($60.74 vs $140.16) was correct-but-misdiagnosed: Azure's winning row was `Standard_B2ms` — a legitimate 2 vCPU/**8** GB **burstable** instance at $0.0416, genuinely cheaper than the general-purpose D2s v5. The engine correctly picked the cheapest instance meeting the spec; AWS/GCP picked non-burstable only because their cheapest 2/8 in the data was non-burstable. Two fixes applied: (a) **engine hardening** — `resourceFitRank` now ranks rows with undefined vcpu/memory as *worst* fit so genuinely under-specified rows can't out-rank specced ones; (b) **golden pins `instanceFamily: 'general-purpose'`** so the three-cloud comparison is apples-to-apples (Azure then resolves to D2s v5 = $140.16). Lesson for users: pin the instance family (or burstable-vs-not) when comparing, or the tool will legitimately pick each cloud's cheapest adequate SKU.

### GCP live — blocked on operator credential

Live GCP pricing needs a Vault-backed token at `secret/polycost/providers/gcp` (key `access_token` or `service_account_json`). To enable:
`vault kv put secret/polycost/providers/gcp access_token=<gcp-oauth-token>` (or a service-account JSON), then boot with `USE_MOCK_PROVIDERS=false`.
