# ADR-0002: Pricing truth — one rate source and a nightly accuracy proof

|             |                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| **Status**  | **Proposed** 2026-10-28. Decisions 1–3 are being implemented; §6 lists what needs the maintainer.               |
| **Date**    | 2026-10-28                                                                                                      |
| **Audit**   | H-10 (pricing logic duplicated and hard-coded client-side) and H-12 (pricing accuracy not continuously proven). |
| **Decides** | Where modeled rates live, what counts as a reference price, and how accuracy is proven over time.               |

## 1. Context

PolyCost's promise is that its numbers match what the providers charge. Two things
undercut that:

- **Rates live in two places, and in code.** The web app hard-codes app-platform,
  serverless, ARM and regional-variance rates (`apps/web/src/lib/app-catalogs.ts`),
  and the comparison engine hard-codes inter-region transfer and burstable-credit
  rates (`comparison-orchestrator.service.ts`). Neither has a date. A price change
  needs a code change in two apps, and nothing says when a rate was last checked.
- **Accuracy is asserted, not proven.** The golden set
  (`test/golden/pricing-accuracy-golden.json`) has 2 workloads × 3 providers. Two of
  the six cells are filled, both derived from list prices rather than read from a
  provider calculator, GCP has none, and the harness
  (`scripts/pricing-accuracy-harness.mjs`) runs only by hand.

Facts that shape the options (from `PRICING-ACCURACY-AUDIT.md`):

- AWS and Azure list prices are public and need no credentials. GCP's Cloud Billing
  Catalog needs an OAuth token, which PolyCost reads from Vault.
- The live ETL already pulls all three on a nightly schedule. A workload's own SKUs
  can also be re-priced on demand (`refresh-live`).
- Provider calculators are interactive web apps without an API. A calculator
  total can only be read by a person, or by browser automation that breaks whenever
  the calculator UI changes.

## 2. Options considered

**Rates.** (a) Keep them in code and add dates. (b) Move them all into the
`pricing_catalog` table. (c) **One server-side rate card**: a typed module in the API
that both the engine and the web app read, served over HTTP, with a source and a
review date on every entry. Option (b) is the end state for rates that have a
provider price-list source. Many of these rates are modeled (an approximation of a
pricing model, not a SKU), and forcing them into SKU rows would misrepresent them.

**Reference prices.** (a) Derive expected values from list prices in the test
itself. That only re-checks our own arithmetic against our own source. (b)
**Calculator captures with evidence**: the calculator's monthly total, the date, and
a share link or screenshot, kept in the golden file. (c) Scrape the calculators in
CI; this is fragile and against their terms of use.

**Proof cadence.** (a) Manual runs. (b) **A nightly scheduled workflow** that
brings up a live-mode stack, re-prices the golden workloads, and fails on any
tolerance breach.

## 3. Decision

1. **One rate card (H-10).** Every modeled rate moves to
   `apps/api/src/pricing-models/modeled-rate-card.ts`, including those currently in
   the web app and the orchestrator. Each entry carries `source` and
   `reviewedAt`. The engine imports it. `GET /api/v1/pricing/rate-card` serves it with
   its `pricingAsOf` (the oldest `reviewedAt`), and the web app renders modeled
   figures only from that response. If the response is unavailable, the app hides
   those figures; it never falls back to stale constants. The UI labels these figures
   **modeled** together with the date.
2. **Staleness is a CI failure.** A check fails when any rate-card entry is more
   than 180 days past its `reviewedAt`, so somebody has to re-check and re-date it.
3. **Golden references are calculator captures (H-12).** Every golden cell records
   `captureMethod` (`calculator` or `list-price`), `capturedAt` and `evidence`. The
   harness gains a `--strict` mode that fails on any missing cell, any
   `list-price` cell, or any capture older than 180 days. The golden set grows to
   cover compute, storage, database and egress on all three providers.
4. **Nightly proof.** `.github/workflows/pricing-accuracy.yml` runs nightly and on
   demand. It brings up the stack with `USE_MOCK_PROVIDERS=false`, runs the live ETL
   for the golden regions, and runs the harness. A tolerance breach fails the run.
   Without the GCP credential secret the workflow still proves AWS and Azure and
   reports GCP as not configured. It never reports GCP as passing.
5. **Tolerances.** 5% for single-SKU compute workloads, 10% for multi-service
   workloads (tiered egress and storage rounding differ between calculators). A
   breach is a bug or a stale capture until shown otherwise.

## 4. Consequences

- **Positive.** A price is changed in one place. Every modeled figure shows how old
  it is. Accuracy becomes a nightly fact rather than a claim. A provider price change
  surfaces as a failed run within a day.
- **Costs.** About four PRs. Someone must capture calculator totals by hand, at
  first and whenever a capture ages out (about 30 minutes per refresh for the full
  set). The nightly job uses about 15 CI minutes and needs a GCP credential secret.
- **Neutral.** Catalog-backed prices are unchanged: they already come from the
  providers' price lists with their own `fetchedAt`.

## 5. Implementation plan

1. **PR-A (H-10):** the rate card module and endpoint; the engine and web app read
   it; the web constants are deleted; the staleness check; "modeled" labels.
2. **PR-B (H-12):** the golden schema (`captureMethod`, `capturedAt`, `evidence`),
   the harness `--strict` mode, the expanded workload set, and the nightly workflow.
3. **PR-C:** calculator captures for every cell (§6.2), then `--strict` on nightly.

## 6. Needs the maintainer

1. **Accept this ADR**, including the tolerances in decision 5.
2. **Calculator captures.** Who reads the AWS, Azure and GCP calculator totals for
   the golden workloads: the maintainer, or Claude driving the calculators in a
   browser, with every capture's share link recorded as evidence?
3. **GCP for the nightly run.** Add a repository secret holding a read-only
   Cloud Billing Catalog credential, or accept that GCP is proven by manual runs only.

## 7. Verification

- The web bundle contains no rate constants, and a test fails if one is reintroduced
  into `app-catalogs.ts`.
- `GET /pricing/rate-card` returns every rate with `source` and `reviewedAt`, and
  the engine's results match the rates it serves.
- The staleness check fails on a back-dated entry.
- `pricing-accuracy.yml` has a green run with all golden cells in `--strict` mode,
  and a deliberately wrong golden value turns it red.
