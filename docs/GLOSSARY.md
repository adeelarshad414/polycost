# 📖 PolyCost Glossary

> Domain vocabulary. If a term in a PR or doc is unfamiliar, it should be here.

## 🧭 Core domain

| Term                                        | Meaning                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NWS** — Normalized Workload Specification | The provider-neutral, versioned, zod-validated document every input route converges on. The single source of truth for what is being priced.                                           |
| **Comparison**                              | One priced evaluation of an NWS across AWS, Azure and GCP, persisted with its rate-level audit trail.                                                                                  |
| **Line item**                               | A single priced element of a comparison (e.g. one compute component on one provider).                                                                                                  |
| **Pricing trace**                           | Provenance attached to a line item: source endpoint, record ID, SKU, unit, unit price, effective date, fetch time, payload hash, and derivation expression. Makes a number defensible. |
| **Pricing catalog**                         | The local table of provider SKU rates. Comparisons read only from here — never from a live provider call on the request path.                                                          |
| **SKU** — Stock Keeping Unit                | A provider's identifier for a billable item (AWS SKU, Azure meter, GCP SKU).                                                                                                           |
| **Interval**                                | Reporting period for a total: daily, weekly, monthly, quarterly, yearly.                                                                                                               |
| **Provenance**                              | Whether served pricing is `live`, `mock`, `seeded`, `mixed`, or `unknown`.                                                                                                             |
| **Freshness**                               | How old cached pricing is versus the freshness policy: `fresh`, `stale`, `missing`, `failed`.                                                                                          |

## ☁️ Provider concepts

| Term                                | Meaning                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **On-demand**                       | Pay-as-you-go with no commitment. The baseline for comparison.                                                                           |
| **Reserved instance / Reservation** | Discounted rate in exchange for a 1- or 3-year commitment.                                                                               |
| **Savings Plan**                    | AWS commitment to a spend level rather than a specific instance.                                                                         |
| **Sustained-use discount (SUD)**    | 🟢 GCP-only. Applied **automatically** as monthly usage rises — no purchase required, so it must be modelled or GCP looks too expensive. |
| **Spot / Low-Priority / DevTest**   | Interruptible or restricted capacity. Deliberately **excluded** — they are `Consumption`-type meters but not standard on-demand rates.   |
| **Block meter**                     | 🇪🇺 An Azure meter priced per _N_ units (e.g. `"10 Hours"`). Must be divided to a true per-unit rate.                                     |
| **CUR** — Cost and Usage Report     | AWS's detailed billing export format.                                                                                                    |
| **Egress**                          | Data leaving a provider's network — often a dominant hidden cost.                                                                        |

## 🧾 Billing & compliance

| Term                             | Meaning                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invoice of record**            | The provider's authoritative invoice, as opposed to PolyCost's estimate.                                                                          |
| **Reconciliation**               | Comparing invoiced actuals against estimates; classified `matched`, `variance-warning`, `variance-critical`, or `unmatched`.                      |
| **Evidence packet**              | Exportable bundle proving how a reconciliation was reached. Exporting is a **mutation** (notarises + audits), hence `POST`.                       |
| **Invoice-grade artifact**       | Supporting document (invoice PDF, CUR manifest…) registered and optionally verified against a control total.                                      |
| **WORM** — Write Once, Read Many | Immutability guarantee: a verified artifact cannot be overwritten, its legal hold cannot be silently cleared, and retention cannot be shortened.  |
| **Legal hold**                   | A flag preventing deletion regardless of retention window.                                                                                        |
| **Retention window**             | How long a row is kept before becoming eligible for pruning.                                                                                      |
| **Outbox**                       | The `team_audit_event_exports` table. An audit event and its outbox row commit **atomically**, so an event can never be logged-but-undeliverable. |
| **Optimistic concurrency**       | Guarding a read-modify-write with a hash of the value read; a mismatch means someone else wrote first → **409 Conflict**.                         |

## 🏗️ Architecture & engineering

| Term               | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Adapter**        | Per-provider module translating NWS components into that provider's SKUs and rates.              |
| **ETL**            | The scheduled Extract–Transform–Load pipeline that refreshes the pricing catalog.                |
| **Capability URL** | An unguessable URL that grants access by possession. Used for anonymous comparison sharing.      |
| **Data health**    | Aggregate view of catalog freshness, provenance, and sync status.                                |
| **Golden file**    | A committed expected-output fixture; the accuracy harness compares against provider calculators. |
| **Prewarm**        | Background job that pre-computes a comparison so a later request is fast.                        |
| **Migration**      | A numbered, idempotent SQL file applied atomically (`--single-transaction`).                     |

## 🧪 Quality gates

| Gate                   | What it checks                                                    |
| ---------------------- | ----------------------------------------------------------------- |
| `typecheck`            | TypeScript across all workspaces                                  |
| `lint`                 | ESLint incl. `no-unused-vars` and security rules                  |
| `format:check`         | Prettier compliance                                               |
| `theme:hex:check`      | 🎨 No raw hex colours outside `tokens.css`                        |
| `qa`                   | Repo conventions — e.g. **no direct `process.env`** in app source |
| `db:validate`          | Migration list matches applied schema                             |
| `test:unit`            | Jest unit suites (API + web)                                      |
| `check` / `check:full` | The aggregate gates (58 / +integration, e2e, security)            |

## 🔤 Abbreviations

|              |                                              |
| ------------ | -------------------------------------------- |
| **AA**       | WCAG Level AA (4.5:1 contrast for body text) |
| **FR / NFR** | Functional / Non-Functional Requirement      |
| **IdP**      | Identity Provider (OIDC, SAML)               |
| **SCIM**     | System for Cross-domain Identity Management  |
| **SSRF**     | Server-Side Request Forgery                  |
| **SUD**      | Sustained-Use Discount                       |
| **TCO**      | Total Cost of Ownership                      |
| **WORM**     | Write Once, Read Many                        |

---

See also: [⚙️ How It Works](HOW-IT-WORKS.md) · [🗺️ Diagrams](DIAGRAMS.md) · [📋 Requirements](REQUIREMENTS.md)
