# 📋 PolyCost Requirements

> Functional (**FR**) and non-functional (**NFR**) requirements, each traceable to
> where it is implemented and how it is verified.
>
> **Status key:** ✅ implemented & verified · 🟡 partial · ⬜ planned

---

## 🎯 Functional requirements

### FR-1 · Workload input

| ID     | Requirement                                                                | Status |
| ------ | -------------------------------------------------------------------------- | :----: |
| FR-1.1 | Accept a workload via **structured form**                                  |   ✅   |
| FR-1.2 | Accept a workload via **natural language**                                 |   ✅   |
| FR-1.3 | Accept a workload via **diagram import** (Draw.io, VSDX)                   |   ✅   |
| FR-1.4 | Accept a workload via **Terraform** input                                  |   ✅   |
| FR-1.5 | Normalise every input route to a single versioned **NWS**                  |   ✅   |
| FR-1.6 | Reject an unsupported NWS `schemaVersion` with a migration error           |   ✅   |
| FR-1.7 | Reject a spec with no priced resource (compute/storage/database all empty) |   ✅   |

### FR-2 · Pricing catalog

| ID     | Requirement                                                         | Status |
| ------ | ------------------------------------------------------------------- | :----: |
| FR-2.1 | Ingest AWS, Azure and GCP pricing into a local catalog              |   ✅   |
| FR-2.2 | Refresh the catalog on a schedule                                   |   ✅   |
| FR-2.3 | Normalise Azure block meters (`"N Hours"`) to per-unit rates        |   ✅   |
| FR-2.4 | Exclude spot / low-priority / DevTest meters from on-demand pricing |   ✅   |
| FR-2.5 | Apply GCP sustained-use discounts by machine family                 |   ✅   |
| FR-2.6 | Prune stale live rows after a refresh generation                    |   ✅   |
| FR-2.7 | Preserve seed and fixture rows as fallback data                     |   ✅   |

### FR-3 · Comparison

| ID     | Requirement                                                        | Status |
| ------ | ------------------------------------------------------------------ | :----: |
| FR-3.1 | Price the same workload against all three providers                |   ✅   |
| FR-3.2 | Select the cheapest SKU that still satisfies the requirement       |   ✅   |
| FR-3.3 | Report totals across daily → yearly intervals                      |   ✅   |
| FR-3.4 | Support on-demand, reserved, savings-plan and sustained-use models |   ✅   |
| FR-3.5 | Identify the cheapest provider                                     |   ✅   |
| FR-3.6 | Emit a **pricing trace** for every line item                       |   ✅   |
| FR-3.7 | Persist comparison + rate-level audit log **atomically**           |   ✅   |
| FR-3.8 | Refresh an existing comparison against current catalog data        |   ✅   |

### FR-4 · Data health & transparency

| ID     | Requirement                                                              | Status |
| ------ | ------------------------------------------------------------------------ | :----: |
| FR-4.1 | Report per-provider pricing freshness and age                            |   ✅   |
| FR-4.2 | Report **provenance** (`live` / `mock` / `seeded` / `mixed` / `unknown`) |   ✅   |
| FR-4.3 | Expose `usesNonLivePricing` so demo data can never be mistaken for real  |   ✅   |
| FR-4.4 | Raise alerts when data is stale or a provider sync failed                |   ✅   |

### FR-5 · Billing reconciliation (invoice-of-record)

| ID     | Requirement                                                            | Status |
| ------ | ---------------------------------------------------------------------- | :----: |
| FR-5.1 | Import provider billing exports (AWS CUR, Azure, GCP)                  |   ✅   |
| FR-5.2 | **Reject non-USD** exports rather than summing them as USD             |   ✅   |
| FR-5.3 | Parse money with thousands separators correctly                        |   ✅   |
| FR-5.4 | Reconcile invoiced actuals against estimates and classify variance     |   ✅   |
| FR-5.5 | Register, verify and store invoice-grade evidence artifacts            |   ✅   |
| FR-5.6 | Enforce WORM semantics — no overwrite of verified/legal-hold artifacts |   ✅   |
| FR-5.7 | Guard concurrent evidence writes with optimistic concurrency (409)     |   ✅   |
| FR-5.8 | Export an evidence packet via a **mutating POST**, never a GET         |   ✅   |

### FR-6 · Accounts, teams & access

| ID     | Requirement                                                 | Status |
| ------ | ----------------------------------------------------------- | :----: |
| FR-6.1 | Local accounts and sessions                                 |   ✅   |
| FR-6.2 | Teams with owner/admin/member roles                         |   ✅   |
| FR-6.3 | Invitations with pending/accepted/revoked/expired lifecycle |   ✅   |
| FR-6.4 | Enterprise SSO (OIDC / SAML) and SCIM provisioning          |   ✅   |
| FR-6.5 | Tenant-scoped access on team-owned resources                |   ✅   |
| FR-6.6 | Immutable team audit trail with delivery outbox             |   ✅   |

### FR-7 · Outputs

| ID     | Requirement                                                | Status |
| ------ | ---------------------------------------------------------- | :----: |
| FR-7.1 | Export reports (PDF, Excel, CSV)                           |   ✅   |
| FR-7.2 | Generate Terraform starter bundles for the chosen provider |   ✅   |
| FR-7.3 | Share a comparison via capability URL                      |   ✅   |
| FR-7.4 | Budgets, alerts and cost-management views                  |   ✅   |

---

## 🛡️ Non-functional requirements

### NFR-1 · Correctness

| ID      | Requirement                                              | How it is enforced                                    |
| ------- | -------------------------------------------------------- | ----------------------------------------------------- |
| NFR-1.1 | Pricing must equal a manual provider calculation         | Golden-file accuracy harness vs. provider calculators |
| NFR-1.2 | Money uses `NUMERIC` in the database, never float        | Schema-enforced                                       |
| NFR-1.3 | Currency is explicit; mixed-currency sums are impossible | Non-USD import rejected                               |
| NFR-1.4 | Timestamps are UTC-anchored `timestamptz`                | Migration 042                                         |

### NFR-2 · Security

| ID      | Requirement                                 | How it is enforced           |
| ------- | ------------------------------------------- | ---------------------------- |
| NFR-2.1 | No secret in the database, logs, or browser | Vault-only secret values     |
| NFR-2.2 | All tenant data is access-checked           | Guards + team scoping        |
| NFR-2.3 | Destructive operations cannot cross tenants | Team-scoped deletes          |
| NFR-2.4 | No SSRF via provider-supplied URLs          | Same-origin pagination guard |
| NFR-2.5 | Requests cannot be amplified into a DoS     | NWS array caps, rate limits  |
| NFR-2.6 | SQL is always parameterised                 | Repository layer             |
| NFR-2.7 | Mock auth routes are unusable in production | Environment gating           |

### NFR-3 · Reliability & durability

| ID      | Requirement                                           | How it is enforced                                |
| ------- | ----------------------------------------------------- | ------------------------------------------------- |
| NFR-3.1 | A logical unit of work commits atomically             | Transactions (comparison + audit; event + outbox) |
| NFR-3.2 | A compliance event is never logged-but-undeliverable  | Outbox in the same transaction                    |
| NFR-3.3 | An undelivered export is never destroyed by retention | `NOT EXISTS` guard on prune                       |
| NFR-3.4 | Migrations are atomic and re-runnable                 | `--single-transaction` + guarded DDL              |
| NFR-3.5 | Provider outages cannot break comparisons             | Catalog-backed reads, never live on request path  |
| NFR-3.6 | Irreversible deletion requires explicit opt-in        | Retention defaults to `report-only`               |

### NFR-4 · Performance

| ID      | Requirement                                  | How it is enforced                   |
| ------- | -------------------------------------------- | ------------------------------------ |
| NFR-4.1 | Bulk ingestion must not be per-row           | Batched `jsonb_to_recordset` upserts |
| NFR-4.2 | Large provider feeds must not exhaust memory | Streaming parse + enforced byte cap  |
| NFR-4.3 | Hot query paths are index-backed             | Partial/expression indexes           |
| NFR-4.4 | Long locks are avoided                       | Row-capped batch deletes             |
| NFR-4.5 | First paint is not blocked by charting code  | Lazy-loaded chart chunk              |

### NFR-5 · Resilience of outbound calls

| ID      | Requirement                             | How it is enforced                   |
| ------- | --------------------------------------- | ------------------------------------ |
| NFR-5.1 | A response body cannot buffer unbounded | Cap enforced **during** streaming    |
| NFR-5.2 | A slow body cannot hang a worker        | Wall-clock deadline across body read |
| NFR-5.3 | Pagination cannot loop forever          | Hard page ceilings                   |

### NFR-6 · Accessibility

| ID      | Requirement                              | How it is enforced                    |
| ------- | ---------------------------------------- | ------------------------------------- |
| NFR-6.1 | Body text meets WCAG AA (4.5:1)          | Token contrast unit test, both themes |
| NFR-6.2 | Scrollable tables are keyboard reachable | `tabindex=0` + labelled region        |
| NFR-6.3 | Dialog-role surfaces manage focus        | Focus-in and focus-return             |
| NFR-6.4 | Motion respects `prefers-reduced-motion` | Global reduced-motion reset           |

### NFR-7 · Maintainability

| ID      | Requirement                             | How it is enforced                           |
| ------- | --------------------------------------- | -------------------------------------------- |
| NFR-7.1 | Static gates must pass                  | typecheck, lint, format, hex guard           |
| NFR-7.2 | Tests must not be order-dependent       | Storage cleared between tests; `--randomize` |
| NFR-7.3 | Raw colours live only in the token file | Theme hex guard                              |
| NFR-7.4 | Configuration is schema-validated       | zod config schema                            |
| NFR-7.5 | Docs stay reviewable                    | Mermaid diagrams, not binary images          |

---

## 🔍 Traceability

| Area             | Spec                                                | Verification                                              |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Architecture     | [03-ARCHITECTURE.md](../03-ARCHITECTURE.md)         | [docs/ARCHITECTURE.md](ARCHITECTURE.md)                   |
| Data model       | [04-DATA-MODEL.md](../04-DATA-MODEL.md)             | `database/migrations/`                                    |
| API              | [05-API-CONTRACTS.md](../05-API-CONTRACTS.md)       | `api-contract.spec.ts`                                    |
| Security         | [11-SECURITY.md](../11-SECURITY.md)                 | [FULLSTACK-UX-AUDIT.md](../FULLSTACK-UX-AUDIT.md)         |
| Pricing accuracy | [docs/COMPARISON.md](COMPARISON.md)                 | [PRICING-ACCURACY-AUDIT.md](../PRICING-ACCURACY-AUDIT.md) |
| Testing          | [10-TESTING-STRATEGY.md](../10-TESTING-STRATEGY.md) | CI + `npm run check`                                      |
