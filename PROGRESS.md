# PolyCost - Build Progress

This file is a living log, not a plan. It records what has actually been built and
verified, phase by phase, as the agentic build proceeds per
`08-AGENTIC-BUILD-MASTER-PROMPT.md`.

Update this file at the end of every phase checkpoint. Never write an entry for
something before it is actually done and tested. If a phase is partially complete,
say so explicitly rather than marking it done.

## How to use this file

- One section per phase, in the order defined in
  `08-AGENTIC-BUILD-MASTER-PROMPT.md` Step 1.
- Each entry records date, what was built, test status, coverage achieved, deviations
  from spec, and open issues carried forward.
- Status values: `Not started`, `In progress`, `Complete`, or
  `Complete with known gaps (see notes)`.
- Do not delete or rewrite history. If a phase needs rework, add a new dated entry
  noting the rework.

## Phase status overview

| Phase                                                   | Status                               | Last updated |
| ------------------------------------------------------- | ------------------------------------ | ------------ |
| 0 - Build plan & approval                               | Complete                             | 2026-06-28   |
| 1 - Repo scaffold                                       | Complete                             | 2026-06-28   |
| 2 - Data layer (Postgres schema, NWS types, validator)  | Complete                             | 2026-06-28   |
| 3 - Cloud provider adapters                             | Complete                             | 2026-06-28   |
| 4 - Pricing ETL job                                     | Complete                             | 2026-06-28   |
| 5 - NWS Parser Module                                   | Complete                             | 2026-06-28   |
| 6 - Comparison Engine                                   | Complete                             | 2026-06-29   |
| 7 - Report Module                                       | Complete                             | 2026-06-29   |
| 8 - API layer                                           | Complete                             | 2026-06-29   |
| 9 - Frontend                                            | Complete                             | 2026-06-29   |
| 10 - E2E verification against MVP acceptance criteria   | Complete                             | 2026-07-01   |
| Post-Phase 10 report export evidence polish             | Complete                             | 2026-07-01   |
| Post-Phase 10 Playwright browser journey coverage       | Complete                             | 2026-07-01   |
| AI-native Phase 1 reimagining pass                      | Complete with known gaps (see notes) | 2026-07-01   |
| Phase 2 - Diagram-to-cost intelligence                  | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.7 - Invoice/auth/VSDX gap closure               | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8 - Gap-closure production readiness            | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8A - Auth product UX continuation               | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8B - Invite/SSO auth hardening                  | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8C - Diagram partial-parse hardening            | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8D - Security suppression cleanup               | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8E - UI-priced service coverage guard           | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8F - SKU evidence derivation hardening          | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8G - Catalog lineage readback hardening         | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8H - Pricing honesty UI labeling                | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8I - AWS ETL network SKU hardening              | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8J - Diagram LLM fallback diagnostics           | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8K - Auth RBAC UI enforcement polish            | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8L - Release hygiene evidence polish            | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8M - Session policy documentation               | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8N - API RBAC matrix hardening                  | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8O - Production-readiness CI gate               | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8P - Queryable comparison pricing evidence      | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8Q - Visible pricing evidence UI wiring         | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8R - Refresh-live evidence regression           | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8S - Reconciliation coverage hardening          | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8T - VSDX review evidence context               | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8U - Diagram LLM cost guard                     | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8V - Diagram LLM batch classification           | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8W - Security advisory ledger refresh           | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8X - Workspace session expiry UX                | Complete with known gaps (see notes) | 2026-07-06   |
| Phase 2.8Y - Mock OIDC workspace UX                     | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8Z - Diagram fixture corpus tier table          | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AA - UI-priced SKU evidence guard              | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AB - GCP pricing credential fallback           | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AC - VSDX page/container evidence              | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AD - Auth controller guard coverage            | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AE - Release readiness automation              | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AF - Billing reconciliation RBAC hardening     | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AG - UI priced-family coverage drift guard     | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AH - Diagram export evidence hardening         | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AI - Security suppression hygiene gate         | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AJ - Auth endpoint rate-limit hardening        | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AK - Pricing reconciliation breadth guard      | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AL - Auth team UX state hardening              | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AM - VSDX visual evidence polish               | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AN - Local credential readiness gate           | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AO - Production-readiness suite drift guard    | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AP - Security ledger coverage enforcement      | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AQ - Impeccable CI tracking guard              | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AR - End-to-end smoke proof hardening          | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AS - Full progress verification gate           | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AT - Live timed journey and Redis verification | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AU - Clean-clone demo verifier                 | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AV - Verification timeout hardening            | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AW - Pricing logic coverage gate               | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AX - Locked breakpoint UI proof                | Complete with known gaps (see notes) | 2026-07-07   |

## Phase 2.8AX - Locked breakpoint UI proof

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added a Playwright browser regression for the primary comparison workflow at the
  locked UI verification breakpoints: `375px`, `768px`, and `1440px`.
- The regression verifies the guided-form default state, comparison execution,
  executive summary visibility, quick actions visibility, page-level horizontal
  overflow, and accessible names for visible interactive controls at every
  breakpoint.
- Extended the Playwright mock helper to cover background data-health, analytics, and
  pricing-evidence calls so the breakpoint proof can run against a local Vite server
  without requiring a live API process.
- Extended progress and release-readiness gates so the locked-breakpoint proof cannot
  be silently removed.

Verification:

- `npm run lint --workspace @polycost/web` passes.
- `npm run typecheck --workspace @polycost/web` passes.
- `npm run format:check` passes.
- Focused Playwright run passes against local Vite:
  `npx playwright test --config apps/web/playwright.config.ts -g "keeps the primary comparison workflow accessible across locked breakpoints"`.

Known remaining gaps:

- This strengthens the UI/UX DoD evidence for the primary comparison workflow across
  the locked viewport widths. It is not a complete WCAG audit of every possible
  screen state; the broader browser suite and unit tests still cover theme,
  keyboard-only comparison, loading states, exports, and diagram upload.
- Hosted GitHub Actions still fails before repository steps run because no runner is
  assigned (`runner_id: 0`, empty `steps` array).

## Phase 2.8AW - Pricing logic coverage gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `npm run pricing:logic:coverage`, backed by
  `scripts/pricing-logic-coverage-check.mjs`, to compute coverage directly from
  `coverage/api/coverage-final.json` for pricing-specific files only:
  `cost-time`, provider adapters, comparison engine, pricing ETL, pricing models,
  and pricing normalization.
- Wired the pricing-logic coverage gate into `npm run ci:unit` after
  `npm run test:coverage`, so the CI unit lane proves both global coverage and the
  pricing-specific DoD.
- Extended progress and release-readiness checks so the coverage gate cannot be
  silently removed from the unit CI path.
- Updated `RELEASE-CHECKLIST.md` so human release verification runs `npm run ci:unit`
  or explicitly runs `npm run pricing:logic:coverage` after manual coverage.

Verification:

- `npm run test:coverage` passes:
  - API coverage: `49 suites / 385 tests`, global lines `87.02%`, statements
    `87.22%`, functions `92.75%`, branches `71.10%`.
  - Web coverage: `9 suites / 128 tests`, global lines `83.39%`, statements
    `83.44%`, functions `81.12%`, branches `75.42%`.
- `npm run pricing:logic:coverage` passes across `33` pricing files:
  - statements: `2358/2648` (`89.05%`).
  - functions: `551/578` (`95.33%`).
  - lines: `2293/2576` (`89.01%`).
  - branches: `2072/2691` (`77.00%`) against the explicit `75.00%` branch floor.
- `npm run progress:verify` passes: 107 phase evidence anchors verified.
- `npm run release:check` passes.

Known remaining gaps:

- The pricing-logic DoD is now executable for line/statement/function coverage above
  80%. Branch coverage is reported and gated at 75% because current pricing-model
  optional/fallback branches are below 80%; this remains honest evidence rather than
  an overstated 80% branch claim.
- Hosted GitHub Actions still fails before repository steps run because no runner is
  assigned (`runner_id: 0`, empty `steps` array).

## Phase 2.8AV - Verification timeout hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added bounded command execution to `scripts/ci-e2e.mjs` so Docker Compose build,
  migration, E2E test, and live-verification commands fail with explicit timeout
  errors instead of hanging indefinitely.
- Added shorter bounded timeouts around Compose diagnostics (`docker compose ps` and
  logs) so an unhealthy Docker daemon cannot also hang the failure-reporting path.
- Added bounded command execution to `scripts/demo-ready.mjs` and wired
  `scripts/clean-clone-demo-check.mjs` to pass the clean-clone startup budget into
  the demo bootstrap as `POLYCOST_DEMO_COMMAND_TIMEOUT_MS`.
- Documented the demo/E2E timeout knobs in the README configuration list.

Verification:

- `npm run format:check` passes.
- `npm run progress:verify` passes: 99 phase evidence anchors verified.
- `npm run release:check` passes.
- `npm run check` passes with API unit tests `49 suites / 385 tests`, web unit tests
  `9 suites / 128 tests`, graph validation, pricing coverage, progress verification,
  QA, DB validation, DevOps/cloud/release, and provider credential readiness all
  green.

Known remaining gaps:

- A follow-up full `ci:e2e` rerun was attempted after the clean-clone commit, but the
  local Docker/Colima image build stalled inside `docker compose up --build` before
  containers were created. This hardening turns that class of stall into a bounded
  failure on future runs; it is not counted as a successful E2E result.
- Hosted GitHub Actions still fails before repository steps run because no runner is
  assigned (`runner_id: 0`, empty `steps` array).

## Phase 2.8AU - Clean-clone demo verifier

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `npm run demo:verify-clean`, backed by
  `scripts/clean-clone-demo-check.mjs`, as a timed README/demo-readiness proof. The
  verifier creates a temporary clone from the current checkout, runs the demo
  bootstrap command, verifies the web app, direct API health, and web-origin API
  proxy, then tears down the isolated Docker Compose project and volumes.
- Added `API_HOST_PORT` to `.env.example`, `docker-compose.yml`, and
  `scripts/demo-ready.mjs` so a clean-clone verifier can bind the API to an
  alternate host port while leaving the container's internal API port stable.
- Defaulted clean-clone verifier workspaces to `.tmp/clean-clones` under the repo and
  ignored `.tmp/` in git. Earlier temp-clone attempts under macOS temp directories
  exposed a real Colima bind-mount issue where `vault-seed` could not see
  `/vault-seed/seed.sh`; keeping the clone under the repo path makes the proof use a
  mount location Docker can actually see.
- Extended release/progress guards and release hygiene docs so the clean-clone demo
  verifier remains part of the public-release checklist.

Verification:

- `npm run progress:verify` passes: 98 phase evidence anchors verified.
- `npm run release:check` passes.
- `docker compose config --quiet` passes.
- `env DOCKER_CONTEXT=colima npm run demo:verify-clean` passes against an isolated
  temporary clone:
  - `npm ci` completed in the clone.
  - Provider credential readiness passed in mock mode.
  - Docker Compose built/started Vault, Redis, Postgres, API, and Web.
  - `npm run db:migrate` reported no pending migrations on the fresh stack.
  - API health responded at `http://127.0.0.1:3201/health`.
  - Web responded at `http://127.0.0.1:3200/`.
  - Web-origin proxy returned JSON at `http://127.0.0.1:3200/api/v1/data-health`.
  - Clean-clone-to-running duration: `70171ms` against the `600000ms` limit.

Known remaining gaps:

- This closes the local clean-clone-to-running evidence gap for the mock/self-hosted
  demo path. It does not turn fixture-backed provider pricing into invoice-grade live
  billing coverage.
- Hosted GitHub Actions for PR #24 remains externally blocked before workflow steps
  run (`runner_id: 0` / no assigned runner in prior checks). Local release gates and
  the clean-clone verifier are green.

## Phase 2.8AT - Live timed journey and Redis verification

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `npm run live:verify`, backed by `scripts/live-verification.mjs`, as a
  Compose-aware production-readiness browser/runtime proof. The verifier opens the
  built web app through the configured host port, runs a template comparison,
  uploads the draw.io fixture, generates a real PDF download, checks page-level
  horizontal overflow, and deliberately stops/restarts Redis to validate degraded
  health behavior.
- Wired `npm run ci:e2e` to run `npm run live:verify` after the existing API E2E
  and Playwright browser suites pass, making the timed UX and runtime-degradation
  checks part of the local E2E gate.
- Extended `scripts/release-readiness-check.mjs` and
  `scripts/full-progress-verification-check.mjs` so release/progress gates fail if
  the live verifier or its CI wiring is removed.

Verification:

- `npm run progress:verify` passes: 92 phase evidence anchors verified.
- `npm run release:check` passes.
- `npm run check` passes end-to-end:
  - API unit tests: `49 suites / 385 tests`.
  - Web unit tests: `9 suites / 128 tests`.
  - Graph validation: `282 nodes / 282 edges`.
  - Pricing service coverage: `36 frontend priced families` covered by the API
    pricing guard.
  - QA, security suppressions, devops/cloud/release, and provider-credential
    readiness checks all pass; `impeccable` remains the documented Node 24-only
    skip on the Node 20 target runtime.
- `npm run security:audit` passes at the high-severity gate; npm still reports the
  documented low transitive Graphify/Ollama advisory with no available safe fix.
- `env DOCKER_CONTEXT=colima VAULT_HOST_PORT=18200 WEB_PORT=3002 npm run ci:e2e`
  passes end-to-end:
  - API E2E: `16 passed, 16 total`.
  - Web Playwright: `6 passed`.
  - Live verifier: template-to-recommendation `395ms` under the `60000ms` limit.
  - Live verifier: diagram-to-PDF `2522ms` under the `180000ms` limit.
  - Live verifier: Redis stopped and `/health=degraded`,
    `/health/deep=degraded`, `/api/v1/data-health` remained HTTP `200`, then Redis
    restarted and health returned to `ok`.

Known remaining gaps:

- This closes the previously unproved live timed-journey and Redis-degradation
  evidence gap for the local/mock Compose stack. It is still `verified (mock)` for
  pricing-provider behavior because real provider credentials are intentionally not
  required in CI.
- Hosted GitHub Actions for PR #24 remains the same external runner/account blocker
  documented in Phase 2.8AS unless the remote run is manually rerun and reaches
  actual workflow steps. Local gates remain green and now include the live verifier.

## Phase 2.8AS - Full progress verification gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `npm run progress:verify`, backed by
  `scripts/full-progress-verification-check.mjs`, as a first-class phase evidence
  gate. The check currently verifies 82 source/test/fixture/CI evidence anchors
  across Phase A-G promises instead of trusting README/PROGRESS claims.
- The verifier locks the FinOps invariants named by the full-verification goal:
  `packages/types/monthly-hour-standard.json` is the shared 730-hour source, cost
  intervals derive from `HOURS_PER_MONTH`, bare `720`/`24*30`/`365/12` month-math
  regressions fail unless they are explicitly allowlisted non-time fixture values,
  and the 80TB tiered-egress manual regression remains present.
- The verifier also checks schema and pricing-evidence anchors: hourly stored rate
  unit, `is_estimate`, `valid_from`/`valid_to`, pricing-lineage metadata, 20+ raw
  reconciliation floor, SKU evidence, refresh-live traceability, and UI-priced family
  coverage wiring.
- Added phase-pipeline anchors for the swappable requirement parser contract,
  `PHASE_2_HOOK` / `PHASE_3_HOOK`, natural-language editable confirmation, export
  formats, share revocation, diagram fixture/malicious upload coverage, auth/RBAC
  matrix coverage, data-health/rate-limit evidence, reduced-motion CSS, brand-token
  usage, CI, and release-readiness wiring.
- Wired `progress:verify` into `npm run check`, GitHub Actions, and
  `scripts/release-readiness-check.mjs` so future PRs cannot silently drop the
  full-progress evidence gate.

Verification:

- `npm run progress:verify` passes: 82 phase evidence anchors verified.
- `npm run release:check` passes and now enforces the progress-verification gate.
- `npm run qa` passes; `impeccable` remains the documented Node 24-only skip on the
  Node 20 toolchain.
- `npm run format:check` passes after formatting the new verifier.
- `npm run test:production-readiness` passes: API focused regressions
  `8 suites / 121 tests`; web focused regressions `2 suites / 82 tests`.

Known remaining gaps:

- This closes a real evidence-gap by making the phase walk partially executable and
  regression-protected, but it does not replace the full live timed UX walk required
  by the active goal. The <60s template-to-recommendation journey, <3min
  diagram-to-PDF journey, Redis-kill runtime degradation, clean-clone timing, and
  hosted CI green state still need live evidence before the full objective can be
  marked complete.
- GitHub-hosted CI for PR #24 is still externally blocked before workflow steps run
  (`runner_id: 0`, zero steps, no log). Local gates remain the authoritative code
  evidence until the account/runner condition is cleared and CI can be rerun.

## Phase 2.8AR - End-to-end smoke proof hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Extended the Compose-backed API MVP acceptance suite from 14 to 16 tests. The new
  coverage proves anonymous comparison evidence expansion, passworded public share
  report access/analytics/revocation, and the authenticated signup -> invite ->
  accept -> owner role-change -> mock OIDC team-scoped login -> member 403 billing
  denial flow.
- Added migration `029_auth_billing_runtime_privileges.sql` so the least-privilege
  runtime `polycost_app` role can use the auth, team, invite, SSO, billing import,
  and reconciliation tables created after the original privilege migration.
- Updated fresh Postgres bootstrap to run migrations 024-029 before first API use,
  closing a clean-clone/demo readiness gap for later auth and pricing-lineage tables.
- Made the Compose/E2E host ports resilient to local developer collisions:
  `VAULT_HOST_PORT` now controls the Vault host port, and `ci:e2e` propagates
  `WEB_PORT` / `POLYCOST_WEB_BASE_URL` into both API E2E and Playwright.

Verification:

- `npm run format:check` passes.
- `npm run typecheck --workspace @polycost/api` passes.
- `npm run db:validate` passes; live migration `029` was also applied during the
  Compose E2E run.
- `npm run check` passes end-to-end, including lint, typecheck, unit tests, graph
  validation, pricing coverage, QA, DB validation, DevOps/cloud/release checks, and
  provider credential readiness.
- `npm run security:audit` passes at the repo's high-severity gate; it still reports
  only the documented low Graphify/Ollama transitive advisory with no available safe
  fix.
- `VAULT_HOST_PORT=18200 WEB_PORT=3002 npm run ci:e2e` passes end-to-end:
  API E2E `16 passed, 16 total`; web Playwright `6 passed`.

Known remaining gaps:

- This proves the complete local/mock live-stack smoke path and fixes the auth-table
  runtime privilege gap, but GitHub-hosted CI for PR #24 still fails before repo code
  executes: the latest checked `quality` job completed in two seconds with zero
  steps, `runner_id: 0`, and no downloadable log. That remains an external Actions
  runner/account provisioning blocker, not a local test failure; rerun CI after the
  account/runner condition is cleared.

## Phase 2.8AQ - Impeccable CI tracking guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Updated the GitHub Actions quality workflow comment to name the exact
  `impeccable@3.1.0` Node 24 requirement while keeping Node 20 as the supported repo
  runtime.
- Pointed the CI comment at `docs/SECURITY-SUPPRESSIONS.md` and
  `RELEASE-CHECKLIST.md`, where the Node 24 public-release follow-up is tracked.
- Extended `scripts/release-readiness-check.mjs` so release readiness fails if the CI
  workflow loses the `impeccable` Node 24 skip reason or release-checklist tracking
  pointer.

Verification:

- `npm run format:check` passes.
- `npm run release:check` passes and now asserts the CI workflow keeps the
  `impeccable@3.1.0` Node 24 skip/tracking note.
- `npm run security:suppressions` passes.
- `npm run check` passes end-to-end; `impeccable` remains an intentional Node 20
  skip with public-release Node 24 follow-up documented.

Known remaining gaps:

- A real Node 24 `npm run impeccable` execution is still a human/public-release
  checklist item unless the project later raises the supported runtime or adds a
  separate Node 24 CI job.

## Phase 2.8AP - Security ledger coverage enforcement

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Strengthened `scripts/security-suppression-check.mjs` so each reviewed inline
  security-rule ESLint suppression must also appear in
  `docs/SECURITY-SUPPRESSIONS.md`.
- Added security-ledger guards for the low-threshold npm audit command, the remaining
  low Graphify/Ollama advisory ID, and the Node 24 `impeccable` tracking note.
- Re-ran `npm audit --audit-level=low`; the current result remains the documented
  low-severity `GHSA-866g-f22w-33x8` advisory through `@sentropic/graphify` with no
  fix available.
- Updated `docs/SECURITY-SUPPRESSIONS.md` with the 2026-07-07 low-audit evidence.

Verification:

- `npm audit --audit-level=low` was re-run with registry access and still exits 1 for
  the documented low `GHSA-866g-f22w-33x8` Graphify/Ollama advisory with no fix
  available.
- `npm run format:check` passes.
- `npm run security:suppressions` passes with 21 reviewed suppressions and now proves
  each suppressed file is present in `docs/SECURITY-SUPPRESSIONS.md`.
- `npm run security:audit` passes at the high/critical gate while reporting only the
  documented low advisory.
- `npm run release:check` passes.
- `npm run check` passes end-to-end.

Known remaining gaps:

- The high/critical security audit gate remains clean, but the low-severity transitive
  development-tooling advisory still depends on an upstream package fix or replacement.

## Phase 2.8AO - Production-readiness suite drift guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Extended `scripts/release-readiness-check.mjs` to assert the focused
  `test:production-readiness` command still includes pricing reconciliation,
  refresh-live traceability, auth/RBAC, diagram parser, LLM classifier, report
  evidence, web app, and API-client specs.
- Added release-readiness assertions that CI keeps both the provider credential
  readiness gate and the production-readiness focused regression gate.
- Added source-content guards proving the named suite still covers the 20-rate
  reconciliation floor, complete pricing lineage assertions, team/billing RBAC,
  malicious diagram fixtures, oversized diagram fallback, and unsafe VSDX rejection.

Verification:

- `npm run release:check` passes.
- `npm run format:check` passes.
- `npm run test:production-readiness` passes.
- `npm run check` passes end-to-end with the stricter release-readiness assertions
  and provider credential gate in the aggregate path.

Known remaining gaps:

- This prevents local/CI test-suite drift, but GitHub-hosted execution still depends
  on resolving the repository account billing/spending-limit runner blocker.

## Phase 2.8AN - Local credential readiness gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `npm run provider:credentials:check` to the aggregate `npm run check` path,
  matching the CI workflow and demo bootstrap credential/dummy-value readiness gate.
- Extended `scripts/release-readiness-check.mjs` so release readiness fails if the
  provider credential checker script is missing or removed from `npm run check`.
- This makes local release verification cover the same mock-vs-real provider swap
  guardrails that CI and `npm run demo:up` already exercise.

Verification:

- `npm run format:check` passes.
- `npm run release:check` passes and now asserts the credential readiness gate remains
  part of `npm run check`.
- `npm run provider:credentials:check` passes in mock-provider mode for AWS, Azure,
  GCP, and diagram-LLM readiness.
- `npm run check` passes end-to-end and now includes `npm run provider:credentials:check`;
  the optional impeccable check is still skipped because the repo targets Node.js 20
  and the tool requires Node.js 24.

Known remaining gaps:

- GitHub Actions still fails before job execution because of the account billing /
  spending-limit blocker; this gate improves local and future CI coverage but cannot
  resolve that external runner-account condition.

## Phase 2.8AM - VSDX visual evidence polish

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Extended diagram review evidence for VSDX nodes to include extracted Visio bounds
  and style colors when the OpenXML shape cells provide them.
- Kept the existing API shape intact: bounds and visual metadata were already exposed
  on graph nodes; this pass makes that visual extraction easier to audit in review
  cards and report evidence text.
- Added parser regression coverage proving VSDX review evidence now includes page,
  master, container, bounds, fill color, and line color context.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/diagram-parser/diagram-parser.service.spec.ts`
  passes.
- `npm run test:production-readiness` passes.
- `npm run check` passes end-to-end; the optional impeccable check is still skipped
  because the repo targets Node.js 20 and the tool requires Node.js 24.

Known remaining gaps:

- This improves layout/style traceability for VSDX extraction, but PolyCost still does
  not perform full Visio visual rendering or pixel-perfect visual comparison.

## Phase 2.8AL - Auth team UX state hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Removed broad workspace reload coupling from `workspaceBusy` state so team/admin
  panels do not refetch on every busy-state transition.
- Made account session revocation, invite creation/revocation, invite acceptance,
  role changes, member removal, and SSO provider saves update the visible workspace
  state immediately after the API action succeeds.
- Kept owner/admin RBAC affordances in the UI while ensuring self-role changes update
  the active session/team role shown on screen.
- Extended `App.spec.tsx` to prove revoked sessions disappear, new invitations are
  shown, role changes are reflected, removed members leave the list, revoked invites
  leave the pending view, and saved OIDC state changes the SSO readiness label.

Verification:

- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  passes.
- `npm run test:production-readiness` passes.
- `npm run check` passes end-to-end; the optional impeccable check is still skipped
  because the repo targets Node.js 20 and the tool requires Node.js 24.

Known remaining gaps:

- This improves the local/demo account and team product UX; production-grade SSO,
  email invite delivery, organization billing plans, and a dedicated account settings
  route remain future auth product work.

## Phase 2.8AK - Pricing reconciliation breadth guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added explicit Azure and GCP burstable/shared-core mock catalog rows so the mock ETL
  path covers all six normalized compute families for every provider.
- Updated normalized pricing so trusted adapter-provided `normalizedFamily` /
  `instanceFamily` metadata is used before SKU-prefix fallback.
- Strengthened `pricing-reconciliation.spec.ts` so each provider must reconcile at
  least 20 distinct normalized rates from raw source records, with complete source
  endpoint, source record ID/key, fetch timestamp, transform version, and payload hash.
- Added coverage assertions for compute family breadth, normalized storage tiers,
  raw storage object/block/file dimensions, raw storage access patterns, and egress
  tier starts across AWS, Azure, and GCP mock catalogs.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/pricing-normalization/pricing-reconciliation.spec.ts src/pricing-normalization/normalized-pricing-records.spec.ts src/adapters/mock/mock-provider.adapter.spec.ts`
  passes.
- `npm run pricing:coverage:check` passes.
- `npm run test:production-readiness` passes.
- `npm run check` passes end-to-end; the optional impeccable check is still skipped
  because the repo targets Node.js 20 and the tool requires Node.js 24.

Known remaining gaps:

- The breadth guard proves fixture-backed ETL and lineage depth; full invoice-grade
  live provider catalog coverage still depends on real provider credentials and wider
  production sync rehearsal.
- Database and higher-level modeled services remain covered by comparison/model
  evidence, while this normalization gate intentionally focuses on compute, storage,
  and egress rate rows.

## Phase 2.8AJ - Auth endpoint rate-limit hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `RATE_LIMIT_AUTH_PER_MINUTE` to typed API config and `.env.example`.
- Reused the shared `ApiRateLimitService` in `AuthController` so anonymous auth
  entry points emit standard rate-limit headers and return 429 when the configured
  per-minute identity bucket is exhausted.
- Covered local registration, login, invitation preview, mock OIDC start, mock OIDC
  authorize, and mock OIDC callback entry points with the auth rate limiter.
- Added controller tests proving login and mock OIDC start are rate-limited by
  request identity.
- Updated README and cloud readiness docs so self-hosted operators can tune the auth
  limiter alongside parse/refresh limits.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth.controller.spec.ts src/api/auth-billing.spec.ts src/config/config.schema.spec.ts`
  passes.
- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/api-contract.spec.ts`
  passes.
- `npm run ci:lint` passes.
- `npm run test:production-readiness` and `npm run check` pass.

Known remaining gaps:

- The auth flow now has local/session/team/invite/mock-SSO UI and API coverage, but
  production OIDC/SAML handshakes and email delivery for invites remain future
  provider-integration work.
- The in-memory limiter is appropriate for local/demo and single API instances;
  horizontally scaled production deployments should back auth throttling with Redis
  or an ingress/API-gateway limiter.

## Phase 2.8AI - Security suppression hygiene gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Removed two inline `security/detect-object-injection` suppressions from
  `apps/api/src/api/regions.service.ts` by replacing dynamic object lookups with
  typed `Map`/accessor-based reads.
- Added `npm run security:suppressions`, backed by
  `scripts/security-suppression-check.mjs`, to require every security-rule ESLint
  suppression to include a `Reviewed YYYY-MM-DD` marker and
  `docs/SECURITY-SUPPRESSIONS.md` reference.
- Wired the suppression hygiene gate into `npm run qa`, `scripts/qa-check.mjs`, and
  release-readiness documentation checks.
- Updated `SECURITY.md` and `docs/SECURITY-SUPPRESSIONS.md` so maintainers know how
  to run and interpret the new gate.

Verification:

- `npm run security:suppressions` passes with 21 reviewed suppressions.
- `npm run ci:lint` passes.
- `npm run security:audit` passes at the high/critical gate; npm still reports the
  known low-severity Graphify/Ollama development-tooling advisory with no fix
  available.
- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/regions.service.spec.ts`
  passes.
- `npm run qa`, `npm run release:check`, and `npm run check` pass.

Known remaining gaps:

- The Graphify/Ollama low-severity transitive advisory remains until upstream
  releases a safe fix or the visualization toolchain is replaced.
- Suppressed ESLint security findings remain documented and gated; converting every
  suppressible dynamic lookup to typed accessors is still an opportunistic hardening
  task as files are touched.

## Phase 2.8AH - Diagram export evidence hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Preserved NWS `sourceTraceability` in `ComparisonResult.requirements` so diagram
  node/source references survive the comparison engine boundary.
- Kept Tier 3 LLM classifier reason, confidence, classifier marker, and assumed
  default count in diagram-derived `serviceRequirement.scaleParams`.
- Expanded report source-diagram evidence rows to include per-node service category,
  service type, quantity, confidence, classifier, source reference, classifier
  evidence string, and assumed-default count.
- Wired source-diagram evidence into CSV and XLSX exports alongside the existing PDF
  source-diagram section, with a conditional `Source Diagram` XLSX evidence sheet.
- Added report-generator coverage proving stencil evidence and LLM evidence strings
  appear in CSV, PDF, and XLSX artifacts.
- Added `src/reports/report-generators.spec.ts` to `npm run test:production-readiness`
  so diagram export evidence remains part of the production-readiness gate.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/reports/report-generators.spec.ts`
  passes.
- `npm run test:unit --workspace @polycost/api -- --runInBand src/diagram-parser/llm-classifier.client.spec.ts src/diagram-parser/diagram-parser.service.spec.ts`
  passes.
- `npm run format:check`, `npm run ci:lint`, `npm run test:production-readiness`,
  and `npm run check` pass.

Known remaining gaps:

- The diagram pipeline is still extraction/classification evidence, not full Visio
  visual rendering.
- LLM classifier production behavior still depends on real endpoint/model/Vault
  configuration; deterministic local parsing remains the default fallback.

## Phase 2.8AG - UI priced-family coverage drift guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Added `scripts/pricing-service-coverage-check.mjs`, an AST-based guard that reads
  `apps/web/src/service-catalog.ts` and confirms every frontend service family marked
  `priced` is present in the API comparison-orchestrator pricing coverage workload.
- Wired `npm run pricing:coverage:check` into `package.json`, the aggregate
  `npm run check` path, `scripts/qa-check.mjs` inventory, GitHub Actions CI, and
  `docs/development/devops.md`.
- This prevents a future UI service-catalog change from silently advertising a priced
  AWS/Azure/GCP family without extending the backend coverage regression that proves
  catalog-backed or explicit modeled estimate evidence exists.
- Verification evidence in this continuation:
  - `npm run pricing:coverage:check` passed and reported 36 frontend priced families
    covered by the API pricing guard.
  - Focused comparison-orchestrator spec passed: 35 tests, including the UI-priced
    service coverage workload.
  - `npm run format:check` passed.
  - `npm run check` passed end-to-end: API unit suite 49 suites / 380 tests, web unit
    suite 9 suites / 128 tests, graph validation 282 nodes / 282 edges, pricing coverage
    drift guard, QA, DB validation, DevOps, cloud, and release readiness.
- Known gaps carried forward: this closes a pricing coverage drift risk, but it is
  still not full invoice-grade live cloud billing coverage. Private discounts, taxes,
  every provider SKU edge case, billing-account exports, and invoice reconciliation at
  provider-account depth remain future release-track work.

## Phase 2.8AF - Billing reconciliation RBAC hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Closed a concrete auth-product gap where billing import/reconciliation required a
  workspace session and team-boundary check, but not the documented Owner/Admin role.
- Added API defense in depth: `BillingService` now rejects billing imports, provider
  exports, reconciliation creation, and reconciliation reads unless the active identity
  is an Owner or Admin on a workspace team.
- Matched the frontend contract: member sessions see the actuals reconciliation panel
  disabled with an explicit "Owner or admin role required" explanation, and programmatic
  form submission still does not call the billing import API.
- Updated README auth scope wording so billing-export reconciliation is documented as
  requiring a signed-in owner/admin workspace session.
- Verification evidence in this continuation:
  - Focused API auth/billing spec passed: 18 tests.
  - Focused web App spec passed: 57 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run test:production-readiness` passed: API 7 suites / 91 tests and web 2 suites /
    82 tests.
  - `npm run security:audit` passed the high-severity gate; npm still reports the known
    low `@ai-sdk/provider-utils` advisory chain with no safe fix available.
- Known gaps carried forward: this closes the billing-import RBAC mismatch, but full
  hosted account/team UX, external IdP SSO, email delivery, SCIM, and enterprise org
  administration remain future release-track work.

## Phase 2.8AE - Release readiness automation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Added `scripts/release-readiness-check.mjs`, a machine-readable release hygiene guard
  for the required open-source/community files, README demo path, public-release
  checklist language, issue templates, PR template, and security suppression ledger.
- Wired `npm run release:check` into `package.json`, the aggregate `npm run check`
  command, `scripts/qa-check.mjs` script inventory, and GitHub Actions CI so public
  release drift is caught in the normal quality path.
- Updated `docs/development/open-source-readiness.md`, `RELEASE-CHECKLIST.md`,
  `README.md`, and `CHANGELOG.md` to document the new release guard alongside the
  existing human checklist.
- Verification evidence in this continuation:
  - `npm run release:check` passed.
  - `npm run format:check` passed.
  - `npm run qa` passed and printed the documented Node 24-only `impeccable` skip.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run devops:check` passed.
  - `npm run cloud:check` passed with the existing warning that deployable IaC is not
    present yet.
  - `npm run security:audit` passed the high-severity gate; npm still reports the known
    low `@ai-sdk/provider-utils` advisory chain with no safe fix available.
  - `npm run test:production-readiness` passed: API 7 suites / 90 tests and web 2 suites /
    82 tests.
  - `npm run check` passed end-to-end: API unit suite 49 suites / 379 tests, web unit
    suite 9 suites / 128 tests, graph validation 282 nodes / 282 edges, QA, DB
    validation, DevOps, cloud, and release readiness.
- Known gaps carried forward: GitHub-hosted CI for the PR remains externally blocked by
  the account billing/spending-limit runner issue, so local evidence is green but remote
  check-run completion still needs the maintainer to resolve billing/quota. Full
  invoice-grade billing coverage, full Visio visual rendering, and complete hosted
  auth/team/SSO product UX remain future release-track work.

## Phase 2.8AD - Auth controller guard coverage

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Added an API-layer regression in `auth.controller.spec.ts` that asserts every
  workspace account/team/session/invite/SSO administration endpoint remains protected by
  `SessionAuthGuard`.
- The same guard test asserts intentionally anonymous entry points remain open:
  register, login, invite preview, mock OIDC start/authorize, and OIDC callback. This
  protects the additive-auth contract: anonymous comparison flows stay frictionless while
  privileged workspace actions require a session.
- Extended `npm run test:production-readiness` to include the auth controller guard
  coverage alongside the existing service-level RBAC matrix and web RBAC visibility tests.
- Verification evidence in this continuation:
  - Focused auth controller spec passed: 3 tests.
  - Production-readiness gate passed: API 7 suites / 90 tests and web 2 suites / 82 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run security:audit` passed the high-severity gate; npm still reports the known low
    `@ai-sdk/provider-utils` advisory chain with no safe fix available.
  - `npm run format:check` passed.
- Known gaps carried forward: this strengthens API guard proof, but full enterprise SSO
  login with a real external IdP, email delivery, hosted org billing plans, and complete
  account/team administration product polish remain future work.

## Phase 2.8AC - VSDX page/container evidence

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Hardened VSDX extraction by reading `visio/pages/pages.xml` plus
  `visio/pages/_rels/pages.xml.rels` so review evidence can show real Visio page
  names instead of only path-derived `Page N` labels.
- Resolved same-page container labels from VSDX shapes and carried them through graph
  metadata and review evidence, e.g. `container 99 (Production VPC us-east-1)`.
- Extended diagram-derived region inference to consider node labels, Visio page names,
  container labels, and master names, so a resource inside a named regional container/page can
  set the NWS region preference without requiring the resource label itself to repeat the
  region.
- Verification evidence in this continuation:
  - Focused diagram parser spec passed: 25 tests, including the new page/container
    evidence and region-hint regression.
  - Production-readiness gate passed: API 6 suites / 87 tests and web 2 suites / 82 tests.
  - `npm run ci:lint` passed with no ESLint security warnings.
  - `npm run security:audit` passed the high-severity gate; npm still reports the known low
    `@ai-sdk/provider-utils` advisory chain with no safe fix available.
  - `npm run format:check` passed.
- Known gaps carried forward: this improves VSDX metadata extraction and review evidence, but
  PolyCost still does not render full Visio visuals; VSDX support remains structured
  extraction rather than pixel-perfect visual rendering.

## Phase 2.8AB - GCP pricing credential fallback

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Hardened real-provider GCP pricing readiness by allowing the Cloud Billing adapter to use
  either a Vault-stored `access_token` or a Vault-stored `service_account_json` /
  `service_account_key_json` fallback.
- Added runtime service-account JWT signing and OAuth token exchange against the service
  account `token_uri` or Google's default token endpoint, scoped to
  `https://www.googleapis.com/auth/cloud-billing.readonly`.
- Updated the provider credential readiness checker so strict mode accepts either a
  production-safe short-lived access token or a valid service-account JSON shape, while still
  rejecting missing, malformed, or placeholder values.
- Updated live-pricing credential docs with the new Vault keys, recommended production
  preference for workload-identity/short-lived tokens, and service-account JSON as a sensitive
  self-hosted fallback.
- Verification evidence in this continuation:
  - Focused GCP adapter spec passed: 10 tests covering token use, service-account exchange,
    catalog normalization, live SKU filtering, pagination, and credential failures.
  - `npm run provider:credentials:check` passed in local demo/mock mode.
  - `npm run provider:credentials:check:strict` passed in local demo/mock mode.
  - Production-readiness gate passed: API 6 suites / 86 tests and web 2 suites / 82 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run security:audit` passed the high-severity gate; npm still reports the known low
    `@ai-sdk/provider-utils` advisory chain with no safe fix available.
  - `npm run format:check` passed.
- Known gaps carried forward: GCP can now exchange service-account JSON, but full
  invoice-grade billing coverage, private discounts, taxes, credits, and live account usage
  reconciliation remain future work.

## Phase 2.8AA - UI-priced SKU evidence guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Strengthened the all-priced-family comparison guard so every provider result now proves
  catalog-backed line items carry explicit `pricing_catalog` evidence: source record key,
  resolved/source SKU, region, unit, unit price, effective/fetched timestamps, transform
  version, payload hash, derivation, and estimate flags.
- Added matching assertions for required modeled service-family SKUs so manual model rows
  must remain explicitly labeled as `manual_model` with resolved/source SKU evidence instead
  of silently blending into catalog-backed pricing.
- Verification evidence in this continuation:
  - Focused comparison orchestrator spec passed: 35 tests, including the hardened
    all-priced-family SKU evidence guard.
  - Production-readiness gate passed: API 6 suites / 86 tests and web 2 suites / 82 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run security:audit` passed the high-severity gate; npm still reports the known low
    `@ai-sdk/provider-utils` advisory chain with no safe fix available.
  - `npm run format:check` passed.
- Known gaps carried forward: this improves SKU-to-estimate traceability for local/mock and
  modeled comparison paths, but full invoice-grade live cloud billing coverage remains future
  work. GitHub PR `quality` remains externally blocked by account billing/spending-limit
  runner startup failure.

## Phase 2.8Z - Diagram fixture corpus tier table

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Added a fixture-corpus regression to `diagram-parser.service.spec.ts` that parses
  Mermaid, draw.io, Lucid CSV, and VSDX fixtures and locks a format-by-format Tier 1
  / Tier 2 / Tier 3 / unresolved summary table.
- Current enforced corpus table:

| Format    | Fixtures | Graph nodes | Components | Tier 1 | Tier 2 | Tier 3 | Unresolved | Ignored |
| --------- | -------- | ----------- | ---------- | ------ | ------ | ------ | ---------- | ------- |
| Mermaid   | 3        | 16          | 12         | 0      | 12     | 0      | 4          | 0       |
| draw.io   | 3        | 11          | 10         | 8      | 2      | 0      | 1          | 0       |
| Lucid CSV | 1        | 5           | 4          | 4      | 0      | 0      | 1          | 0       |
| VSDX      | 1        | 3           | 3          | 3      | 0      | 0      | 0          | 0       |

- Verification evidence in this continuation:
  - Focused diagram parser spec passed: 1 suite / 24 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 86 tests and web 2
    suites / 82 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: the table makes parser drift visible across the
  current fixture corpus, but it is still fixture accuracy evidence rather than full
  real-world diagram benchmark coverage or full Visio visual rendering.

## Phase 2.8Y - Mock OIDC workspace UX

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

- Added workspace UI controls for the existing mock OIDC start/callback API path so
  an owner/admin can generate a signed mock authorization URL, see callback/state
  evidence, and complete the callback into a normal workspace session.
- Reused the existing session storage path for callback-issued sessions so mock SSO
  tokens carry the same expiry persistence and session reload behavior as local
  login/register sessions.
- Exposed the configured OIDC callback URL inside the SSO readiness summary so
  self-hosted operators can verify redirect URI alignment from the app surface.
- Verification evidence in this continuation:
  - Focused App spec passed: 1 suite / 57 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 85 tests and web 2
    suites / 82 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed after formatting the touched web file.
- Known gaps carried forward: the SPA now verifies the mock OIDC round-trip through
  existing API contracts, but production enterprise IdP onboarding, SCIM, hosted org
  policy, and real customer IdP smoke testing remain future release-track work.

## Phase 2.8X - Workspace session expiry UX

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added browser-side session expiry persistence separate from the bearer token so
  newly issued workspace sessions can be cleared locally before privileged workspace
  calls when the stored expiry is already past.
- Added a signed-in workspace session policy/status band that shows whether the
  session is active, expiring soon, or expired, and states the honest refresh policy:
  there is no silent refresh; expired/revoked sessions are cleared on the next
  workspace session check.
- Extended the active session list to show each session's expiry timestamp, making
  "sign out other devices" easier to evaluate before revocation.
- Added regression coverage proving an expired stored workspace token is removed
  before `getCurrentSession()` is called while the anonymous comparison flow remains
  available.
- Verification evidence in this continuation:
  - Focused App spec passed: 1 suite / 56 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 85 tests and web 2
    suites / 81 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this strengthens local/session UX and anonymous-flow
  preservation, but full enterprise account/team UX such as production IdP login,
  email delivery, org plans, SCIM, and a hosted account marketplace remains future
  work.

## Phase 2.8W - Security advisory ledger refresh

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Re-ran `npm audit --audit-level=low` with registry access. It still exits 1 only
  for the already documented low-severity `@ai-sdk/provider-utils <=3.0.97`
  advisory through `ollama-ai-provider` and `@sentropic/graphify`; npm reports no
  fix available.
- Refreshed `docs/SECURITY-SUPPRESSIONS.md` so the low-audit evidence is dated and
  the new diagram LLM batch classifier path is explicitly covered as lint-clean
  rather than suppressed.
- Verification evidence in this continuation:
  - `npm audit --audit-level=low` completed with the documented low advisory and no
    safe fix available.
  - `npm run security:audit` completed with exit code 0 at the high/critical gate.
  - `npm run ci:lint` passed with no new security-plugin warnings after the batch
    classifier implementation.
- Known gaps carried forward: the low transitive Graphify/Ollama advisory remains
  upstream-dependent; high/critical runtime gating remains clean via
  `npm run security:audit`.

## Phase 2.8V - Diagram LLM batch classification

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added an optional batch method to the diagram LLM classifier interface so Tier 3
  unresolved nodes can be classified in one bounded OpenAI-compatible JSON-schema
  request instead of only node-by-node calls.
- Reworked diagram parsing into a Tier 1/2 local pass followed by a bounded Tier 3
  batch pass. Stencil and alias matches do not consume LLM budget; only unresolved
  nodes are batched, and overflow remains reviewable with the existing cost-guard
  message.
- Added batch-response validation and node-id mapping in the OpenAI-compatible
  client, while preserving the single-node `classify()` path and stub/no-key fallback
  behavior.
- Verification evidence in this continuation:
  - Focused diagram parser + LLM classifier specs passed: 2 suites / 30 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 85 tests and web 2
    suites / 80 tests.
  - `npm run ci:lint` passed with no new security-plugin warnings.
  - `npm run format:check` passed.
- Known gaps carried forward: the production LLM path is now schema-based, retried,
  timeout-protected, bounded, batched, and fallback-safe, but production prompt
  evaluation/tuning and real provider-key smoke testing remain future hardening.

## Phase 2.8U - Diagram LLM cost guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added a per-parse Tier 3 LLM classifier budget of 20 unresolved nodes so large
  ambiguous diagrams remain bounded even when the optional OpenAI-compatible
  classifier is configured.
- Kept stencil and alias classification outside the LLM budget; only nodes that
  would otherwise call the LLM consume the guard.
- Overflow nodes remain reviewable with a clear unresolved reason:
  `Tier 3 LLM classifier cost guard skipped after 20 unresolved nodes`.
- Verification evidence in this continuation:
  - Focused diagram parser spec passed: 1 suite / 22 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 82 tests and web 2
    suites / 80 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: the classifier path is bounded, schema-based, retried,
  timeout-protected, and fallback-safe, but production prompt tuning/evaluation
  corpus work remains future hardening.

## Phase 2.8T - VSDX review evidence context

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Enriched diagram review component evidence so VSDX-classified nodes preserve the
  classifier reason and append Visio page, master/stencil, and container context when
  those fields are available from extraction.
- Added full parser coverage proving a VSDX node classified from master
  `AWS19.EC2` carries `Matched stencil`, `Visio page Page 1`, `Visio master
AWS19.EC2`, and `container 99` evidence through the review-card surface.
- This makes the existing VSDX master/container/page extraction more reviewable in
  UI/PDF/API evidence without changing existing API response shapes.
- Verification evidence in this continuation:
  - Focused diagram parser spec passed: 1 suite / 21 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 81 tests and web 2
    suites / 80 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: VSDX parsing is more explainable and layout-aware, but
  it is still extraction/review metadata rather than full Visio visual rendering.

## Phase 2.8S - Reconciliation coverage hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Tightened the provider pricing reconciliation test so AWS, Azure, and GCP each
  prove compute, storage, and egress reconciliation independently instead of only
  satisfying a single aggregate assertion counter.
- Strengthened raw-record checks for storage and egress to compare full source
  lineage against `pricingLineageForCatalogRecord()`, including provider fixture
  endpoint and SHA-256 payload hash, matching the existing compute trace rigor.
- Kept the explicit `>= 20` reconciliation assertion floor per provider while making
  zero coverage in any required category fail fast.
- Verification evidence in this continuation:
  - Focused pricing reconciliation spec passed: 1 suite / 3 tests.
  - `npm run test:production-readiness` passed: API 6 suites / 80 tests and web 2
    suites / 80 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this strengthens transform-drift detection for the
  current mock/provider-normalization path, but full invoice-grade coverage of every
  provider SKU, private pricing agreement, and live account billing export remains a
  future hardening phase.

## Phase 2.8R - Refresh-live evidence regression

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Strengthened the live-pricing traceability regression so it now proves a refreshed
  provider catalog row changes the comparison total and is visible through
  `getComparisonPricingEvidence()` with the refreshed unit rate, fetched timestamp,
  source endpoint, raw source record ID, derivation math, and changed payload hash.
- Added explicit fixture source metadata (`fixture://aws/traceability/compute` and
  `aws-price-row-ec2-trace`) to the traceability row so the test verifies source-row
  identity remains stable while the payload hash changes when the refreshed catalog
  price changes.
- Added `src/api/live-pricing-traceability.spec.ts` to `npm run
test:production-readiness`, making refresh-live SKU lineage part of the named
  production hardening gate rather than an isolated focused test.
- Verification evidence in this continuation:
  - Focused live-pricing traceability spec passed: 1 suite / 1 test.
  - `npm run test:production-readiness` passed: API 6 suites / 80 tests and web 2
    suites / 80 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this proves exact refreshed catalog-row changes flow
  into saved comparison evidence for the current refresh path, but it does not turn
  PolyCost into full invoice-grade live cloud billing. Private pricing, billing
  account discounts, and provider-invoice reconciliation remain separate future
  hardening work.

## Phase 2.8Q - Visible pricing evidence UI wiring

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Wired the web app to call `getComparisonPricingEvidence()` automatically for the
  active comparison, including loading, error, and reset behavior aligned with the
  existing backend analytics fetch lifecycle.
- Added a compact `Traceable pricing evidence` panel inside the expanded Engineering
  section so reviewers can inspect visible line-item cost, matched SKU, source
  endpoint/record/hash, rate, derivation math, and confidence without cluttering the
  default executive view.
- Kept the design logo-free and provider-accent based, with responsive one/two/three
  column behavior and a professional brand-colored spinner for evidence loading.
- Verification evidence in this continuation:
  - Focused web App/API-client specs passed: 2 suites / 80 tests.
  - `npm run test:production-readiness` passed before the final formatting-only test
    wrap: API 5 suites / 79 tests and web 2 suites / 80 tests.
  - `npm run ci:lint` passed across API, web, and shared types before the final
    formatting-only test wrap.
  - `npm run format:check` passed after formatting.
- Known gaps carried forward: the UI now exposes stored comparison evidence
  end-to-end, but the data remains decision-grade catalog/list-price lineage rather
  than full invoice-grade billing, private discount, or negotiated contract pricing.

## Phase 2.8P - Queryable comparison pricing evidence

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added `GET /api/v1/comparisons/:id/evidence`, a read-only comparison evidence
  endpoint that returns each stored line item's displayed monthly/hourly amount,
  provider totals, matched SKU fields, source endpoint/record/key/hash/transform
  lineage, unit rate, derivation math, and equivalence confidence.
- Added typed web client support through `getComparisonPricingEvidence()` and shared
  frontend response types so UI/report surfaces can expand saved comparison numbers
  without inventing a second evidence contract.
- Extended the focused production-readiness gate to include the API contract and web
  API-client evidence specs, keeping SKU-to-estimate traceability in the named
  regression path.
- Verification evidence in this continuation:
  - Focused API contract spec passed: 34 tests.
  - Focused web API client spec passed: 25 tests.
  - `npm run test:production-readiness` passed: API 5 suites / 79 tests and web 2
    suites / 80 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: the endpoint proves stored catalog/list-price estimate
  lineage and derivation for saved comparisons, but full invoice-grade provider
  billing coverage, private contract pricing, and account billing reconciliation
  remain future work. GitHub-hosted CI still cannot start until the account billing
  or spending-limit issue is resolved in GitHub settings.

## Phase 2.8O - Production-readiness CI gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added `npm run test:production-readiness`, a focused regression command that
  explicitly runs pricing reconciliation evidence, auth/RBAC and billing
  reconciliation, diagram parser fallback/malicious-file/VSDX coverage, Tier 3 LLM
  classifier fallback coverage, and the web App workspace/comparison coverage.
- Added a GitHub Actions `Production-readiness focused regressions` step so these
  named hardening surfaces remain visible in CI in addition to the broad coverage
  suite.
- Verification evidence in this continuation:
  - `npm run test:production-readiness` passed: API 4 suites / 45 tests and web
    1 suite / 55 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: the CI definition is updated, but GitHub-hosted runs
  still cannot execute until the repository/account billing or spending-limit issue
  is fixed in GitHub settings.

## Phase 2.8N - API RBAC matrix hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Replaced the narrow member-only authorization check with an explicit
  Owner/Admin/Member RBAC matrix in `auth-billing.spec.ts`.
- The matrix now proves members are blocked from team-admin actions, admins can
  update settings/list members/invite/revoke invites/test SSO/remove non-owner
  members, admins cannot change roles or remove owners, and owners can perform
  owner-only role changes/removals while the final-owner guard remains covered by
  the existing dedicated test.
- Verification evidence in this continuation:
  - Focused auth/billing spec passed: 17 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this strengthens API-layer RBAC proof, but the broader
  hosted enterprise auth product surface remains future work.

## Phase 2.8M - Session policy documentation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added README documentation for workspace session behavior: token hashes,
  `AUTH_SESSION_TTL_HOURS`, expired/revoked session handling, logout semantics,
  "sign out other devices", concurrent-session policy, failed-login lockout config,
  and the anonymous-vs-account-gated feature boundary.
- Verification evidence in this continuation:
  - `npm run format:check` passed.
- Known gaps carried forward: this documents the implemented local/session auth
  policy, but production enterprise account UX, hosted team administration, full SSO
  provider lifecycle, SCIM, and email delivery remain future phases.

## Phase 2.8L - Release hygiene evidence polish

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Audited open-source/community health files and confirmed the repo includes
  `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `SUPPORT.md`, `GOVERNANCE.md`, `CHANGELOG.md`, GitHub issue templates, PR
  template, CODEOWNERS, and Dependabot configuration while the GitHub repository
  remains private.
- Updated `CHANGELOG.md` so the Unreleased section reflects the current
  production-readiness hardening work and the remaining honest future phases.
- Updated `RELEASE-CHECKLIST.md` to require proof that GitHub Actions jobs can
  actually start, explicitly calling out billing, spending-limit, and runner-quota
  blockers, and added `npm run demo:up` to the clean-clone verification list.
- Verification evidence in this continuation:
  - `npm run format:check` passed.
- Known gaps carried forward: GitHub PR `quality` remains externally blocked before
  runner startup by account billing/spending-limit settings; that is a repository
  administration task, not a code/test failure.

## Phase 2.8K - Auth RBAC UI enforcement polish

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Tightened workspace team controls so role and removal buttons reflect the same
  Owner/Admin/Member boundaries already enforced by the API.
- Added member-row role badges, accessible role-change labels, accessible
  member-specific remove buttons, and disabled-state reasons for admin-vs-owner
  limits, self-removal, final-owner protection, and in-progress actions.
- Updated the owner team-management test to act on a normal member rather than the
  only owner, and added a focused admin RBAC UI regression proving admins can remove
  members but cannot change roles or remove owners before the API would return 403.
- Verification evidence in this continuation:
  - Focused web App spec passed: 55 tests.
  - Focused auth/API specs passed: 3 suites / 38 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this improves the existing auth product UX and UI-layer
  RBAC proof, but full account/team product breadth such as SSO provider management
  beyond the mock path, invitations UX at SaaS depth, and complete enterprise RBAC
  workflows remain future phases.

## Phase 2.8J - Diagram LLM fallback diagnostics

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added optional Tier 3 LLM classifier diagnostics so unresolved review rows can
  explain whether the classifier was unconfigured, returned malformed/no content, or
  failed/timed out.
- The default stub classifier now reports `Tier 3 LLM classifier not configured`,
  preserving credential-free local behavior while making the fallback explicit.
- Added parser-level coverage proving unresolved diagram nodes carry the LLM fallback
  reason into `review.unresolvedClassifications`.
- Verification evidence in this continuation:
  - Focused diagram parser and LLM classifier specs passed: 2 suites / 25 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this hardens fallback transparency, but full visual VSDX
  rendering and a production prompt/classifier evaluation corpus remain future work.

## Phase 2.8I - AWS ETL network SKU hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Tightened AWS bulk catalog category filtering so Amazon EC2 instance products stay
  in compute refreshes while EC2 data-transfer products can be ingested as network
  catalog rows.
- Expanded AWS network refresh coverage to include EC2 data-transfer rows in addition
  to Amazon VPC rows, improving mainstream egress catalog coverage without requiring
  live credentials in tests.
- Added a mixed EC2 catalog regression test proving compute refresh excludes
  data-transfer SKUs and network refresh includes a data-transfer SKU with source
  metadata intact.
- Verification evidence in this continuation:
  - Focused AWS adapter spec passed: 8 tests.
  - Provider/comparison adapter affected specs passed: 5 suites / 68 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this materially improves AWS public catalog ETL
  coverage for egress-like rows, but complete invoice-grade live pricing across every
  provider SKU remains future work.

## Phase 2.8H - Pricing honesty UI labeling

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Tightened visible pricing copy so refresh actions are labeled `Refresh live catalog`,
  reducing the chance that reviewers infer invoice/account-billing refresh semantics.
- Updated calculation evidence copy to state that monthly totals use cached catalog
  list rates and the 730-hours/month constant, and that private discounts, credits,
  taxes, and actual billed usage are not included.
- Verification evidence in this continuation:
  - Focused web App spec passed: 54 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: full invoice-grade billing coverage still remains
  future work; this slice only hardens product wording around the current
  decision-grade catalog-list-price model.

## Phase 2.8G - Catalog lineage readback hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Strengthened the persisted catalog lineage path: `pricing_catalog` reads now
  select stored source endpoint, source record ID/key, transform version, and payload
  hash columns and expose them back on catalog records for downstream trace
  generation.
- Updated the pricing lineage helper so it preserves persisted source record keys,
  transform versions, and payload hashes when present instead of recomputing them
  after a catalog row has been read from storage.
- Added a repository regression test proving a catalog row read through
  `PostgresPricingCatalogRepository.find()` can be turned into lineage evidence with
  the persisted raw source ID/key/hash intact.
- Verification evidence in this continuation:
  - Focused repository/normalization/base-adapter specs passed: 4 suites / 32 tests.
  - `npm run ci:lint` passed with zero warnings after removing a dynamic keyed
    attribute write.
  - `npm run format:check` passed.
- Known gaps carried forward: this improves queryable lineage for cached catalog
  records, but full invoice-grade provider SKU coverage and GitHub Actions runner
  availability still remain separate work.

## Phase 2.8F - SKU evidence derivation hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Fixed catalog-backed pricing traces so derivation evidence carries the actual
  workload quantity and computed hourly/monthly cost used by the line item instead
  of always reporting quantity `1`. This improves the UI/report promise that a
  visible cost can be expanded to SKU, source row, rate, and math evidence.
- Added regression assertions for both hourly compute math and non-hourly storage
  math in the base cloud provider adapter spec.
- Verification evidence in this continuation:
  - Focused base provider adapter spec passed: 14 tests.
  - Affected pricing specs passed: 3 suites / 50 tests across base adapter, live
    pricing traceability, and comparison orchestrator coverage.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this closes a trace-math correctness gap for
  catalog-backed line items, but full invoice-grade live provider SKU coverage and
  account-level GitHub Actions runner availability remain outside this slice.

## Phase 2.8E - UI-priced service coverage guard

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Added an API comparison regression guard that snapshots the UI families currently
  labeled `priced` and compares a coverage workload through AWS, Azure, and GCP mock
  catalog adapters. The guard asserts catalog-backed compute/storage/database rows
  plus modeled service-family SKUs for operations, runtime, analytics, integration,
  networking, and security surfaces.
- Closed a real mock-catalog gap found by that guard: managed cache was labeled
  priced in the UI but mock provider database fixtures did not include Redis/cache
  rows. Added Amazon ElastiCache Redis, Azure Managed Redis, and GCP Memorystore
  rows so local/demo pricing does not fail that mainstream family.
- Verification evidence in this continuation:
  - Focused comparison orchestrator spec passed: 35 tests, including the new
    all-priced-family coverage guard.
  - Focused mock/pricing normalization specs passed: 3 suites / 9 tests.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run format:check` passed.
- Known gaps carried forward: this materially improves local/mock no-rate coverage,
  but it is still not full invoice-grade live provider SKU coverage. GitHub PR
  `quality` remains externally blocked by account billing/spending-limit runner
  startup failure.

## Phase 2.8D - Security suppression cleanup

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Closed a suppression-ledger gap for `apps/api/src/api/regions.service.ts`: both
  inline `security/detect-object-injection` suppressions now have dated comments
  pointing to `docs/SECURITY-SUPPRESSIONS.md`, and the file is listed in the ledger.
- Tightened the advisory ledger by linking the remaining low
  `@ai-sdk/provider-utils` advisory directly to
  `https://github.com/advisories/GHSA-866g-f22w-33x8`.
- Added a CI workflow comment beside the QA step documenting why `npm run qa` can
  pass on Node 20 while `scripts/impeccable-check.mjs` skips the Node 24-only
  `impeccable@3.1.0` check.
- Verification evidence in this continuation:
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run qa` passed and printed the documented Node 24-only impeccable skip.
  - `npm run security:audit` passed the high/critical gate.
  - `npm audit --audit-level=low` exits 1 only for the documented low
    Graphify/Ollama transitive advisory with no fix available.
- Known gaps carried forward: the low transitive advisory still requires an upstream
  `@sentropic/graphify` / `ollama-ai-provider` dependency fix or dependency removal
  decision before public release. GitHub PR `quality` remains externally blocked by
  account billing/spending-limit runner startup failure.

## Phase 2.8C - Diagram partial-parse hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- VSDX extraction now preserves valid pages when a later page has non-security XML
  structure corruption. The API returns a review warning with page ID, page label,
  source reference, and a `diagram.extraction.*` review field instead of silently
  dropping the failure or discarding all valid pages.
- Security boundary preserved: VSDX pages containing blocked XML entity declarations
  still fail hard with `ApiValidationError` before partial-parse recovery is allowed.
- Parser review model extended with extractor-level warnings so future diagram
  extractors can report per-page/per-node recovery evidence without changing the
  public comparison contract.
- Verification evidence in this continuation:
  - Focused API diagram parser test passed: 1 suite / 19 tests, including partial
    VSDX recovery, unsafe VSDX rejection, VSDX masters/containers/connectors,
    Tier-3 mocked LLM classification, oversized-node cap, and malicious fixture
    rejection.
  - `npm run format:check` passed.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run ci:unit` passed across API and web coverage suites.
  - `npm run ci:build` passed for API and web production builds; the existing
    `%VITE_API_BASE_URL%` build warning remains unchanged.
  - `npm run ci:integration` passed with no integration tests found in current
    workspaces.
  - `npm run db:validate` passed; live `schema_migrations` check skipped because
    Postgres was not running in that standalone command.
  - `npm run provider:credentials:check` passed in mock-provider mode.
  - `npm run security:audit` passed the high/critical gate while reporting the
    already documented low Graphify/Ollama transitive advisory.
  - `npm run graphify:validate`, `npm run qa`, `npm run devops:check`, and
    `npm run cloud:check` passed. `qa` continues to document the Node 24-only
    impeccable skip while the repo target remains Node 20.
- Known gaps carried forward: this is extraction/review hardening, not full Visio
  visual rendering. `npm run ci:e2e` was attempted with Docker access, but the local
  Docker/Colima layer stopped returning `docker compose ps`/log diagnostics after API
  startup failed; do not treat this as green evidence. PR `quality` CI failed before
  any runner steps started because GitHub reported an account billing/spending-limit
  issue; this is an external repository/account action, not a code failure.

## Phase 2.8B - Invite/SSO auth hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Invite flow hardened: invitation responses now include a local preview URL, the API
  exposes token preview status without accepting the invite, and the SPA reads
  `?invite_token=...` links to show pending/expired/revoked/accepted landing states.
- Mock SSO round-trip added: the API now supports signed mock OIDC start,
  mock-authorize handoff, and callback completion that upserts/links an external
  account, adds team membership, and issues the normal server-side account session.
- SSO state signing guard added: `AUTH_SSO_STATE_SECRET` defaults to a local
  `CHANGE_ME_DEV_ONLY` value, is documented in `.env.example`, and is rejected by
  existing staging/production dummy-value validation unless replaced.
- Verification evidence in this continuation:
  - Focused API repository/auth/config tests: 4 suites, 48 tests passed.
  - Focused web app/API-client tests: 2 suites, 78 tests passed.
  - `npm run format:check` passed.
  - `npm run ci:lint` passed across API, web, and shared types.
  - `npm run ci:unit` passed: API 49 suites / 360 tests, web 9 suites / 124 tests.
  - `npm run ci:build` passed for API and web production builds.
  - `npm run ci:integration` passed with no integration tests found in current
    workspaces.
  - `npm run db:validate` passed; live schema check skipped because Postgres was not
    running in that standalone command.
  - `npm run provider:credentials:check` passed in mock-provider mode.
  - `npm run security:audit` passed the high/critical gate; the documented low
    Graphify/Ollama transitive advisory remains.
  - `npm run ci:e2e` passed against Docker Compose: API E2E 14/14 and Playwright
    browser E2E 6/6.
- Known gaps carried forward: mock OIDC verifies the application handshake shape but
  does not replace a full enterprise IdP certification matrix, SAML login round-trip,
  SCIM, or production email delivery infrastructure.

## Phase 2.8A - Auth product UX continuation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Account product UX deepened: the protected API and workspace UI now cover profile
  email/display-name updates, password changes, server-side account disablement,
  active session listing, and "sign out other devices". Anonymous compare, diagram,
  export, and share workflows remain available without an account.
- Team product UX deepened: the protected API and workspace UI now cover team
  creation, team-name updates, member listing, member removal, pending invite
  listing, invite-token acceptance, and invite revocation.
- Three-role RBAC tightened: product-facing roles are Owner, Admin, and Member.
  Owners can change roles; owners/admins can manage members, invites, SSO setup, and
  billing-import workflows; members keep comparison/report access. Legacy stored
  `viewer` rows are normalized to Member at the repository boundary instead of
  requiring a non-additive migration.
- SSO readiness UX extended: OIDC/SAML provider metadata can be configured from the
  workspace UI, callback URLs are visible via status, and the development
  test-connection flow exercises the same API route without requiring production IdP
  secrets.
- Frontend markup hardening: the workspace session panel no longer nests forms inside
  another form; login/register is a dedicated auth form and signed-in account/team
  forms are valid sibling forms.
- Documentation updated: README now separates anonymous core features from
  account-gated workspace features, and `DUMMY-VALUES.md` documents mock SSO/invite
  readiness and the production swap caveat.
- Verification evidence in this continuation:
  - Focused API auth/database tests: 3 suites, 35 tests passed.
  - Focused web app/API-client tests: 2 suites, 77 tests passed.
  - `npm run format:check` passed.
  - `npm run ci:lint` passed with lint and typecheck across API, web, and shared
    types.
  - `npm run ci:unit` passed: API 49 suites / 357 tests, web 9 suites / 123 tests.
  - `npm run ci:integration` passed with no integration tests found in current
    workspaces.
  - `npm run ci:build` passed for API and web production builds.
  - `npm run db:validate` passed; live `schema_migrations` check skipped because
    Postgres was not running in that standalone command.
  - `npm run security:audit` passed the high/critical gate; the documented low
    Graphify/Ollama transitive advisory remains.
  - `npm run ci:e2e` passed against Docker Compose: API E2E 14/14 and Playwright
    browser E2E 6/6.
- Known gaps carried forward: this is not invoice-grade billing coverage for every
  enterprise pricing edge case; VSDX remains extraction/review oriented rather than
  pixel-perfect Visio rendering; SSO has configuration/test readiness but not a full
  enterprise IdP login round-trip, email delivery, SCIM, org billing plans, or a
  complete hosted account/team suite.

## Phase 2.8 - Gap-closure production readiness

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Pricing traceability deepened: catalog-backed comparison traces now include source
  endpoint/fixture URI, raw source record ID, transform version, source payload hash,
  derivation math, and equivalence confidence. Derived compute, storage, and egress
  cache rows persist lineage via additive migration `028_pricing_lineage_metadata.sql`.
- Provider ETL metadata improved: AWS, Azure, GCP, and mock adapters stamp source
  endpoint and raw source record IDs into normalized catalog attributes. Mock
  fixtures continue through the same adapter/normalizer path used by real providers.
- Reconciliation proof added: `pricing-reconciliation.spec.ts` recomputes at least 20
  stored-rate assertions per provider across compute/storage/egress from raw source
  records and verifies lineage hashes.
- Credential/docs hardening added: `docs/PROVIDER-CREDENTIALS.md`,
  `DUMMY-VALUES.md`, and README links document AWS/Azure/GCP setup, dummy-value
  rules, and the `USE_MOCK_PROVIDERS=false` production swap. Config validation and
  `provider-credential-check.mjs` now reject dummy secrets outside development/strict
  mode.
- Diagram pipeline hardened: parser node cap is now 200 with review warning; VSDX
  extraction resolves masters/stencils, container IDs, connector waypoint aggregation,
  and multi-page metadata; diagram review components now include classification
  evidence. LLM classifier requests are bounded, retried on transient failures,
  timeout-protected, and gracefully fall back to unresolved.
- Auth/session hardening added: account sessions can be listed and other sessions
  revoked via protected API routes and the workspace UI. Auth tests now cover
  member/viewer forbidden behavior for admin-only team actions.
- Security/release hygiene added: `docs/SECURITY-SUPPRESSIONS.md` records fixed and
  justified ESLint security findings plus low transitive npm advisory status;
  `RELEASE-CHECKLIST.md` defines the private-to-public release gate; CI now runs
  provider credential readiness and DB migration validation in addition to existing
  unit/integration/build/e2e/security gates.
- Verification evidence in this run:
  - Main commit `06a5cc9` GitHub `quality` check confirmed success before branching.
  - Pricing/config focused API tests: 6 suites, 42 tests passed.
  - Diagram focused API tests: 2 suites, 22 tests passed.
  - Auth/API database focused tests: 2 suites, 31 tests passed.
  - Web app/API-client focused tests: 2 suites, 76 tests passed.
  - `npm run ci:lint` passed with zero emitted ESLint security warnings after reviewed suppressions.
  - `npm run ci:unit` passed: API 48 suites / 353 tests, web 9 suites / 122 tests.
  - `npm run ci:build`, `npm run ci:integration`, and `npm run security:audit` passed.
  - Full `npm run ci:e2e` was attempted; Docker/Colima stalled during the web image
    build. The same live-stack E2E suites were then verified by starting Compose
    infra + the already-built API image and local Vite: API MVP E2E 14/14 passed,
    Playwright browser E2E 6/6 passed.
  - `npm run demo:artifacts` passed and refreshed `docs/demo-artifacts/` screenshots/video.
  - `npm audit --audit-level=low` was rerun with registry access; it exits 1 only
    for the documented low Graphify/Ollama transitive advisory with no fix available.
  - `npm run db:validate` passed; live schema check skipped because Postgres was not running.
  - `npm run db:migrate` applied migration 028 successfully against Compose Postgres.
  - `npm run provider:credentials:check` passed in mock-provider mode.
  - `npm run security:audit` passed high/critical gate; low Graphify/Ollama advisory remains documented.
- Known gaps carried forward: not full invoice-grade live billing/pricing coverage;
  VSDX is stronger extraction and layout awareness, not pixel-perfect Visio visual
  rendering; auth has sessions/team/invite/SSO readiness primitives and UI, but not
  full enterprise SSO login, email delivery, account deletion, org billing plans, or
  complete RBAC product experience.

## Phase 2.7 - Invoice/auth/VSDX gap closure

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Provider billing export bridge added: `POST /api/v1/billing/imports/provider-export`
  accepts bounded AWS CUR, Azure Cost Management, and GCP Billing Export CSV/JSON
  snippets, maps provider-native columns into normalized invoice line items, hashes
  the original payload, and reuses the reconciliation foundation.
- Account/team UX foundation upgraded: backend routes now cover team members, role
  changes with final-owner protection, invite creation/acceptance, and SSO readiness
  status; frontend adds a compact workspace control center wired to those routes.
- Auth config documented: public auth base URL plus OIDC/SAML readiness variables are
  now in config schema and `.env.example`; no provider secrets are hardcoded.
- VSDX support improved: Visio connector records are aggregated into direct topology
  edges when possible, and the frontend diagram preview renders layout-aware nodes
  plus SVG relationship lines using sanitized visual metadata.
- Verification passed: `npm run format:check`, `npm run ci:lint`, API/web
  typechecks, `npm run test:unit`, `npm run ci:build`, `npm run db:validate`,
  `npm run security:audit`, focused API/web tests, and a production-preview
  Playwright smoke at `http://127.0.0.1:4174/`.
- Security notes: avoidable new `billing.service.ts` object-indexing warnings were
  removed; remaining ESLint security findings are warning-only pre-existing parser,
  adapter, report, temp-file, and test patterns. `npm audit --audit-level=high`
  passes; low-severity Graphify/Ollama development-tooling advisories remain with no
  upstream fix available.
- Known gaps carried forward: this is still not full invoice-grade billing coverage
  for every provider SKU, discount, tax, credit, marketplace/private-offer, and
  enterprise agreement edge case; VSDX is a layout/topology preview rather than full
  Visio visual rendering; auth has useful team/session/admin primitives and UI, but
  full enterprise account lifecycle, SSO handshakes, invitation email delivery, and
  complete RBAC product UX remain future phases.

## Phase 2 - Diagram-to-cost intelligence

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-06

- Backend module added: `DiagramParserModule` with format detection, Mermaid,
  draw.io XML, Lucid CSV, and VSDX extractors, tiered stencil/alias classification,
  LLM-classifier interface stub, NWS draft generation, and `POST /api/v1/parse/diagram`.
- Security hardening added: 5MB upload ceiling, content sniffing, PNG spoof rejection,
  XXE/entity blocking, bounded draw.io deflate handling, bounded VSDX ZIP expansion,
  rate limiting, sanitized display labels, and no webroot temp-file writes.
- Database migration added: `022_diagram_imports.sql` records diagram import metadata,
  graph snapshots, NWS snapshots, hashes, confidence, counts, and 24h expiry timestamps.
- Fixture corpus added under `fixtures/diagrams`: 3 Mermaid, 3 draw.io, 1 Lucid CSV,
  1 VSDX, plus malicious XXE XML, deflate bomb, ZIP bomb, oversized upload, and
  PNG-renamed-as-draw.io cases.
- Frontend input mode added: "Upload diagram" tab with file upload, paste support,
  parse/review panel, confidence badges, assumed defaults, unresolved/ignored node
  summaries, and editable sizing through the existing guided workload form.
- Reports updated: PDF output now adds a conditional "Source diagram" section for
  diagram-derived comparisons.
- Verification passed: `npm run format:check`, `npm run ci:lint`,
  `npm run ci:unit`, `npm run ci:integration`, `npm run ci:build`,
  `npm run ci:e2e`, `npm run ci:security`, `npm run graphify:validate`,
  `npm run db:validate`, `npm run qa`, `npm run devops:check`, and
  `npm run cloud:check`.
- Coverage/tests: API unit coverage passed with 44 suites / 315 tests; web unit
  coverage passed with 9 suites / 111 tests; Compose-backed E2E passed with 6 API MVP
  acceptance tests and 5 Playwright browser tests.
- Security notes: production parser code avoids webroot temp-file writes, external
  entity expansion, unbounded decompression, and dynamic object materialization from
  Lucid CSV headers. `npm audit --audit-level=high` completed with no high/critical
  blockers; it reported existing low/moderate transitive advisories in Graphify and
  Google dependency paths.
- Known gaps carried forward: diagram classification is deterministic stencil/alias
  matching with an LLM-classifier interface stub; VSDX support extracts basic OpenXML
  shape/connect metadata rather than full Visio semantics; diagram import persistence
  is best-effort so parsing remains available if the database write fails.

## Phase 0 - Build plan & approval

**Status:** Complete
**Date:** 2026-06-28

- Build plan produced: Phase-gated autonomous build plan reviewed in chat, starting
  with a monorepo Phase 1 scaffold and stopping at each checkpoint.
- Ambiguities surfaced and resolved: monorepo selected; partial provider
  degradation preferred for later pricing phases; USD-only MVP; default pricing
  regions set to AWS `us-east-1`, Azure `eastus`, and GCP `us-central1`.
- Tech stack confirmed: yes, using NestJS API, React/Vite frontend, Postgres, Redis,
  Vault dev server, Docker Compose, npm workspaces, Jest, ESLint, and GitHub
  Actions.
- Approved by: user approval in chat on 2026-06-28.

## Phase 1 - Repo scaffold

**Status:** Complete
**Date:** 2026-06-28

- Repo structure: npm workspaces monorepo with `apps/api` and `apps/web`, selected
  to keep shared scripts, CI gates, Docker orchestration, and future shared NWS
  packages in one repo.
- Docker Compose services running: yes. Vault, `vault-seed`, Postgres, Redis, API,
  and web start successfully; Vault and `vault-seed` generate local development
  secrets without storing secret values in `.env.example`.
- Linting/formatting configured: ESLint flat config with TypeScript, React hooks,
  React refresh, Prettier integration, and `eslint-plugin-security`; Prettier config
  added.
- CI skeleton: GitHub Actions runs install, lint, unit coverage, integration script,
  build, E2E script, and high/critical npm audit gate.
- Verified clean-checkout `docker compose up -d --build` works: yes. API, Postgres,
  Redis, and Vault report healthy; web serves HTTP 200 on port 3000.
- Tests/checks passing: `npm run ci:lint`, `npm run ci:unit`,
  `npm run ci:integration`, `npm run ci:build`, `npm run ci:e2e`,
  `npm run ci:security`, `docker compose config`, `docker compose up -d --build`,
  `curl -fsS http://localhost:3001/health`, and
  `curl -fsSI http://localhost:3000`.
- Coverage achieved: API config and health unit tests at 100%; web has no
  logic-bearing tests yet, so Jest reports no tests for `apps/web`.

## Phase 2 - Data layer

**Status:** Complete
**Date:** 2026-06-28

- Migrations created for: yes, `pricing_catalog`, `service_equivalence_map`,
  `pricing_etl_runs`, and `comparisons`, plus `schema_migrations` tracking.
- NWS TypeScript types implemented, matching `04-DATA-MODEL.md` section 1: yes,
  in `apps/api/src/nws/nws.types.ts`.
- `NWSValidator` implemented with tests for every validation rule: yes, including
  supported schema version, migration-error path, required `workload.type`,
  non-empty priced workload requirement, valid partial workloads, strict unknown-key
  rejection, malformed root values, and autoscaling range sanity.
- Test coverage achieved: API 100% statements, branches, functions, and lines;
  `NWSValidator` and NWS schema files both report 100%.
- DB roles configured per least privilege (`11-SECURITY.md` section 3): yes.
  `polycost_app` can read catalog/equivalence/status data and insert comparison
  snapshots, but cannot write pricing catalog rows. `polycost_etl` can write pricing
  catalog and ETL history rows, but cannot write comparison snapshots. Both runtime
  roles are non-superuser login roles without createdb/createrole.
- Verified clean `docker compose up -d --build` works after recreating project
  volumes. Postgres initializes migrations and healthchecks as `polycost_app`.
- Tests/checks passing: `npm run ci:lint`, `npm run ci:unit`,
  `npm run ci:integration`, `npm run ci:build`, `npm run ci:e2e`,
  `npm run ci:security`, `docker compose config`, `docker compose up -d --build`,
  DB migration/role/privilege inspection via `psql`,
  `curl -fsS http://localhost:3001/health`, and
  `curl -fsSI http://localhost:3000`.
- Deviations from spec: local development database bootstrap uses generated password
  files in a project-scoped Docker volume so the Postgres container can initialize
  before application-side Vault retrieval exists. Values are generated at runtime,
  seeded into Vault, never committed, not placed in `.env.example`, and removed by
  `docker compose down -v`.

## Phase 3 - Cloud provider adapters

**Status:** Complete
**Date:** 2026-06-28

- Shared `CloudProviderAdapter` interface finalized: yes, in
  `apps/api/src/adapters/common/cloud-provider-adapter.ts`.
- Shared pricing support implemented: in-memory catalog reader, provider-scoped
  errors, HTTP JSON response helper, and common cached-catalog `priceWorkload()`
  behavior for compute, storage, database, database storage, and network line items.
- `SecretsService` boundary implemented: yes. Provider credentials are requested via
  `SecretsReader`; local Compose provides only a Vault token file path to the API,
  mounted from a separate read-only `polycost-vault-auth` volume.
- Recorded API response fixtures added under `test/fixtures/pricing` for deterministic
  CI coverage.

### AWS Adapter

- `CloudProviderAdapter` interface finalized: yes.
- `priceWorkload()` implemented and tested: yes, using cached normalized AWS catalog
  records.
- `refreshPricingCatalog()` implemented and tested against AWS Price List API:
  yes, via signed `GetProducts` request implementation and recorded AWS API fixtures.
- `refreshLivePricing()` implemented: yes, with SKU/service filtering and duplicate
  suppression.
- Test coverage: 100% statements, 85.71% branches, 100% functions, 100% lines
  across AWS adapter files (target: 85%).
- Secrets retrieval verified via Vault boundary, no hardcoded credentials: yes.
  Required AWS keys are `access_key_id` and `secret_access_key`; `session_token` is
  optional.

### Azure Adapter

- `CloudProviderAdapter` interface finalized: yes.
- `priceWorkload()` implemented and tested: yes, using cached normalized Azure catalog
  records.
- `refreshPricingCatalog()` implemented and tested against Azure Retail Prices API:
  yes, via Retail Prices URL/filter/pagination implementation and recorded Azure API
  fixtures.
- `refreshLivePricing()` implemented: yes, with SKU/service filtering and duplicate
  suppression.
- Test coverage: 100% statements, 92.85% branches, 100% functions, 100% lines
  (target: 85%).
- Secrets retrieval verified via Vault, no hardcoded credentials: not required for
  Azure Retail Prices; no Azure credential path is implemented.

### GCP Adapter

- `CloudProviderAdapter` interface finalized: yes.
- `priceWorkload()` implemented and tested: yes, using cached normalized GCP catalog
  records.
- `refreshPricingCatalog()` implemented and tested against GCP Billing Catalog API:
  yes, via services/SKUs implementation and recorded GCP API fixtures.
- `refreshLivePricing()` implemented: yes, with SKU/service filtering and duplicate
  suppression.
- Test coverage: 100% statements, 95.45% branches, 100% functions, 100% lines
  (target: 85%).
- Secrets retrieval verified via Vault boundary, no hardcoded credentials: yes.
  Required GCP key is `access_token`.

Phase 3 verification:

- API coverage: 97.34% statements, 87.07% branches, 96.62% functions, 97.51% lines.
- Tests/checks passing: `npm run ci:lint`, `npm run ci:unit`,
  `npm run ci:integration`, `npm run ci:build`, `npm run ci:e2e`,
  `npm run ci:security`, source scans for direct `process.env` and credential-shaped
  literals, clean `docker compose up -d --build`, API/web smoke checks, and API
  read-access check for `VAULT_TOKEN_FILE` without printing secret material.
- Deviations from spec: refresh methods return normalized `PricingCatalogRecord[]`
  instead of `void` so Phase 4 ETL can persist provider-normalized rows without
  duplicating provider API parsing.

## Phase 4 - Pricing ETL job

**Status:** Complete
**Date:** 2026-06-28

- BullMQ job scheduled per `PRICING_ETL_SCHEDULE_CRON` config: yes.
  `PricingEtlScheduler` reads the cron through `ConfigService`, registers
  `refresh-pricing-catalog`, and starts a worker for the `pricing-etl` queue.
- Adapters wired into the scheduled job: yes. `PricingEtlModule` binds AWS, Azure,
  and GCP adapters with default regions from config, Vault-backed secrets where
  required, the Postgres catalog writer, and BullMQ queue/worker instances.
- Independent per-provider execution verified: yes. `PricingEtlService` refreshes
  providers independently and summarizes mixed results as `partial` instead of
  failing the whole ETL run.
- `pricing_etl_runs` logging verified for success/partial/failed states: yes.
  Every provider result is recorded through `recordProviderRun()` even when another
  provider fails. Row-level catalog write rejects mark only that provider as
  `partial`.
- Mocked adapter-response tests added: yes, including all-success, partial provider
  failure, row-level partial rejection, all-failed, and non-`Error` rejection paths.
- Postgres repository implemented: yes. The ETL role credentials are retrieved from
  Vault via `SecretsReader`; pricing catalog reads/writes and ETL run inserts use
  parameterized SQL.
- Runtime verification: clean `docker compose down -v` followed by
  `docker compose up -d --build` succeeds. API, Postgres, Redis, and Vault are
  healthy, web serves port 3000, API health responds on `/health`, and Redis
  contains the BullMQ repeatable job with `name=refresh-pricing-catalog` and
  `pattern=0 2 * * *`.
- Test coverage: API 97.48% statements, 88.26% branches, 94.69% functions, 98.00%
  lines. `database/pricing-catalog.repository.ts` is at 95% branch coverage;
  `pricing-etl` files are at 91.66% branch coverage.
- Tests/checks passing: `npm run ci:lint`, `npm run ci:unit`,
  `npm run ci:integration`, `npm run ci:build`, `npm run ci:e2e`,
  `npm run ci:security`, `npm run security:secrets`,
  `npm run security:containers`, source scan for direct `process.env`, clean Docker
  restart, API/web smoke checks, and Redis BullMQ repeat-job inspection.
- Security status: high/critical npm audit gate passes; gitleaks found no leaks;
  Trivy filesystem scan found 0 high/critical vulnerabilities in `package-lock.json`.
  Production API image install reports 0 npm vulnerabilities.
- Deviations from spec: none introduced in Phase 4. The Phase 3 return-value
  deviation for adapter refresh methods remains in effect because the ETL service
  persists those normalized rows.
- Checkpoint: Phase 4 is complete. Stop here until Phase 5 is explicitly approved.

## Phase 5 - NWS Parser Module

**Status:** Complete
**Date:** 2026-06-28

- `FormToNWSService` implemented and tested: yes. Structured form input maps
  deterministically to `NormalizedWorkloadSpec` and delegates all validation to
  `NWSValidator`.
- `NLParserService` implemented: yes. It calls an injected structured-output LLM
  client with a strict JSON schema for the NWS parse result, then validates the draft
  NWS through `NWSValidator`.
- LLM client boundary implemented: yes. `OpenAiCompatibleNwsLlmClient` reads
  non-secret endpoint/model config through `ConfigService` and reads the LLM API key
  only through `SecretsReader` at `polycost/llm:api_key`.
- Prompt injection mitigation verified per `11-SECURITY.md` section 2.1: yes.
  Natural-language input is length-capped, checked for basic workload signal, wrapped
  in requirement delimiters, treated as untrusted requirements data, and never trusted
  for metadata. LLM metadata is overwritten server-side before validation.
- Both paths produce identical NWS shape, verified by shared fixture-style tests: yes.
- Runtime wiring: `NwsParserModule` is imported by `AppModule`. Missing LLM
  endpoint/model config does not prevent API boot; it fails clearly only when NL
  parsing is invoked without configuration.
- Test coverage: API 97.34% statements, 88.75% branches, 93.98% functions, 98.12%
  lines. `nws-parser` files are at 96.59% statements and 90.16% branches.
- Tests/checks passing: `npm run ci:lint`, `npm run ci:unit`,
  `npm run ci:integration`, `npm run ci:build`, `npm run ci:e2e`,
  `npm run ci:security`, `npm run security:scan`, `npm run check`, source scan for
  direct `process.env`, Docker Compose rebuild/start, API/web smoke checks, and API
  log check showing `NwsParserModule dependencies initialized`.
- Security status: high/critical npm audit gate passes; gitleaks found no leaks;
  Trivy filesystem scan found 0 high/critical vulnerabilities in `package-lock.json`.
- Deviations from spec: none introduced in Phase 5. Real LLM-provider calls are not
  executed in CI or local verification because provider credentials are intentionally
  Vault-only; the client boundary is unit-tested with mocked fetch/secrets.
- Checkpoint: Phase 5 is complete. Stop here until Phase 6 is explicitly approved.

## Engineering setup addendum - spec-driven development tooling

**Status:** Complete
**Date:** 2026-06-28

- Graphify: verified `@sentropic/graphify` as the package matching the requested
  Codex/codebase knowledge-graph use case, installed it as a dev dependency, added
  `graphify:tool`, and added deterministic local graph generation/validation scripts
  for CI-safe dependency/spec visualization.
- Caveman: verified the matching npm package is `@juliusbrussee/caveman-code`, a
  separate terminal coding-agent harness. It was not installed as a project
  dependency; repo-local `caveman:*` workflow scripts were added for simple,
  reproducible setup/dev/check/database routines.
- Impeccable: verified `impeccable@3.1.0` as the intended AI-generated UI
  anti-pattern detector. It requires Node.js 24+, while PolyCost currently targets
  Node.js 20, so a compatibility wrapper was added. The check skips cleanly on Node
  20 and will run after a future Node 24 toolchain upgrade.
- Skill QA Builder: no exact npm package or installed Codex skill named
  `skill-qa-builder` was found. A repo-local QA checker and checklist were added to
  validate required scripts, spec template coverage, workflow docs, and the
  no-direct-`process.env` source rule.
- Specs workflow: added `specs/README.md`, `specs/TEMPLATE.md`,
  `docs/development/spec-driven-development.md`, and
  `docs/development/skill-qa-checklist.md`.
- Developer/operations docs: added developer setup, DevOps notes, cloud readiness
  notes, and expanded security guidance.
- Hooks: added `.githooks/pre-commit`, `.githooks/pre-push`, and `hooks:install`.
  Hook installation was verified to skip cleanly in this workspace because it is not
  currently a git repository.
- Scripts added: `setup`, `dev`, `test:unit`, `test:integration`, `test:e2e`,
  `format`, `format:check`, `db:*`, `graphify:*`, `qa`, `devops:check`,
  `cloud:check`, `security:scan`, `check`, `check:full`, `caveman:*`, and
  `impeccable`.
- CI updated: format check, QA, Graphify validation, DevOps check, and cloud readiness
  check now run before test/build/security stages.
- Verification: `npm run check`, `npm run graphify`, `npm run graphify:tool`,
  `npm run hooks:install`, `npm run ci:security` with network access, and
  `npm run security:scan` pass. `npm run check:full` passed through build/e2e but
  hit sandbox-blocked registry DNS at `npm audit`; the security stage passed when
  retried with network access.

## Phase 6 - Comparison Engine

**Status:** Complete
**Date:** 2026-06-29

- `EquivalentServiceMapper` implemented, seed mapping data reviewed for accuracy:
  yes. The mapper covers V1 compute, storage, database, and network categories,
  detects cloud-native database preferences, and marks approximate tiers.
- Seed mapping data persisted: yes, via
  `database/migrations/003_seed_service_equivalence_map.sql` and deterministic
  runtime/unit seed data in `apps/api/src/comparison/service-equivalence.seed.ts`.
- `IntervalCostCalculator` implemented, 100% coverage achieved: yes, 100%
  statements, branches, functions, and lines.
- `ComparisonOrchestratorService` implemented: yes. It validates NWS input, fans out
  to all registered adapters, returns partial results with warnings when one provider
  fails, throws `ComparisonUnavailableError` when all providers fail, computes all
  interval totals, and selects `cheapestProviderId` by monthly total.
- Provider registration refactor: added `ProviderAdaptersModule` so pricing ETL and
  comparison share adapter construction while the comparison engine consumes only an
  injected `CloudProviderAdapter[]`.
- Verified no direct imports from `/adapters/aws`, `/adapters/azure`, or
  `/adapters/gcp` inside `apps/api/src/comparison`: yes, source scan returned no
  matches.
- Source scan for direct `process.env` access in app source: yes, no matches.
- Test coverage: API 97.71% statements, 90.45% branches, 95.37% functions, 98.33%
  lines. Comparison package coverage is 99.26% statements, 100% branches, 100%
  functions, and 99.21% lines.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run ci:unit`, `npm run ci:integration`, `npm run ci:build`,
  `npm run ci:e2e`, `npm run ci:security`, `npm run security:scan`,
  `npm run check`, `npm run graphify`, direct adapter-import source scan, and direct
  `process.env` source scan.
- Runtime verification: after resizing the Colima Docker disk from 20 GiB to 80 GiB,
  clean `docker compose down -v` followed by `docker compose up -d --build`
  succeeds. API, Postgres, Redis, Vault, and web are healthy; API `/health` returns
  OK; web serves HTTP 200; `schema_migrations` contains versions `001`, `002`, and
  `003`; `service_equivalence_map` contains 16 rows, 7 marked approximate.
- Security status: high/critical npm audit gate passes; npm still reports the known
  30 low/moderate development/tooling advisories. Gitleaks found no leaks; Trivy
  filesystem scan found 0 high/critical vulnerabilities in `package-lock.json`.
- Deviations from spec: none in comparison engine behavior.
- Checkpoint: Phase 6 is complete. Phase 7 approved by user request on 2026-06-29.

## Phase 7 - Report Module

**Status:** Complete
**Date:** 2026-06-29

- PDF generator implemented: yes. `PdfReportGenerator` creates deterministic binary
  PDF output from `ComparisonResult`, including metadata, provider totals, line
  items, warnings, line wrapping, and escaped PDF literal text.
- CSV generator implemented, formula-injection mitigation applied: yes.
  `CsvReportGenerator` emits comparison metadata, provider totals, line items, and
  warnings. User-influenced spreadsheet text starting with `=`, `+`, `-`, `@`, tab,
  carriage return, or newline is prefixed with a single quote.
- Excel generator implemented, formula-injection mitigation applied: yes.
  `ExcelReportGenerator` emits a real `.xlsx` OpenXML ZIP package with workbook,
  worksheet, relationships, content types, styles, and formatted column widths. It
  applies the same spreadsheet formula-injection mitigation as CSV.
- Report dispatch implemented: yes. `ReportService` returns the binary content,
  content type, and `polycost-comparison-{id}.{ext}` filename for `pdf`, `csv`, and
  `xlsx`.
- All three formats produce consistent numbers against the same `ComparisonResult`:
  yes, fixture tests assert shared totals and line-item values across PDF, CSV, and
  XLSX output.
- Runtime wiring: `ReportModule` is imported by `AppModule`. Docker Compose
  rebuild/start succeeds with the API healthy after the module import.
- Security checks: spreadsheet formula-injection mitigation and PDF escaping are
  unit-tested. Source scans found no direct `process.env`, `dangerouslySetInnerHTML`,
  `eval`, or `new Function` usage in app source.
- Test coverage: API 98.18% statements, 90.79% branches, 96.36% functions, 98.63%
  lines. Reports package coverage is 99.57% statements, 92.85% branches, 100%
  functions, and 99.54% lines. `PdfReportGenerator` is at 100% across statements,
  branches, functions, and lines.
- Tests/checks passing: `npm run test:unit --workspace @polycost/api -- --runInBand
src/reports`, `npm run ci:unit`, `npm run ci:lint`, `npm run ci:build`,
  `npm run ci:integration`, `npm run ci:e2e`, `npm run ci:security`,
  `npm run security:scan`, `npm run check`, Docker Compose rebuild/start,
  API `/health`, web HTTP smoke check, direct `process.env` source scan, and unsafe
  frontend/code-execution source scan.
- Deviations from spec: none. The report module intentionally has no API route yet;
  endpoint integration belongs to Phase 8.
- Checkpoint: Phase 7 is complete. Stop here until Phase 8 is explicitly approved.

## Phase 8 - API layer

**Status:** Complete
**Date:** 2026-06-29

- All endpoints from `05-API-CONTRACTS.md` implemented: yes. Implemented
  `/api/v1/workload/parse`, `/api/v1/workload/validate`, `/api/v1/comparisons`,
  `/api/v1/comparisons/:id`, `/api/v1/comparisons/:id/export`,
  `/api/v1/comparisons/:id/refresh-live`, and `/api/v1/pricing/status`.
- Contract tests passing against documented request/response shapes: yes. API
  controller/repository tests cover parser response shape, NWS validation,
  comparison create/get/export/refresh, admin pricing status, rate-limit behavior,
  Vault-backed admin API-key auth, and the shared error envelope.
- Partial-degradation path tested: yes. `ComparisonUnavailableError` maps to the
  documented `PRICING_UNAVAILABLE` response with per-provider details; runtime smoke
  against an empty local catalog returned the expected 503 envelope.
- Rate limiting applied per `11-SECURITY.md` section 2.5: yes. `/workload/parse` and
  `/comparisons/:id/refresh-live` enforce per-IP minute buckets from config and emit
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and
  `Retry-After` on exhaustion.
- `helmet` and CORS allowlist configured: yes. Existing Fastify helmet and
  config-driven CORS allowlist remain active in `main.ts`; Phase 8 did not weaken
  those controls.
- Persistence and export integration: yes. Comparison snapshots are inserted and
  retrieved through the application DB role from Vault, and export endpoints reuse the
  Phase 7 PDF/CSV/XLSX report service.
- Admin diagnostics: yes. `GET /api/v1/pricing/status` is protected by
  `x-admin-api-key` and reads latest provider ETL status from Postgres.
- Runtime verification: Docker Compose API rebuild/start succeeds with the API
  healthy. Smoke tests passed for `/health`, `/api/v1/workload/validate`,
  authorized and unauthorized `/api/v1/pricing/status`, invalid `/api/v1/workload/parse`,
  and `/api/v1/comparisons` empty-catalog error handling.
- Test coverage: API workspace coverage is 97.81% statements, 89.16% branches, 95.92%
  functions, and 98.29% lines. The `src/api` package coverage is 96.42% statements,
  81.69% branches, 94% functions, and 96.99% lines.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/api`,
  `npm run build`, `npm run test:integration`, `npm run test:e2e`,
  `npm audit --audit-level=high`, `npm run db:validate`,
  `npm run graphify:validate`, `npm run qa`, `npm run devops:check`,
  `npm run cloud:check`, Docker Compose rebuild/start, and runtime curl smokes.
- Deviations from spec: the `refresh-live` route creates a fresh snapshot from the
  stored NWS and current catalog data, but does not yet perform a strict
  SKU-scoped provider live re-query. Initial comparison requests with
  `useLivePricing: true` return `LIVE_REFRESH_UNAVAILABLE` rather than silently
  pretending to use live provider pricing. See the deviations log and
  `docs/architecture/phase-8-api-layer.md`.
- Checkpoint: Phase 8 is complete. Stop here until Phase 9 is explicitly approved.

## Phase 9 - Frontend

**Status:** Complete
**Date:** 2026-06-29

- Design tokens implemented as CSS variables matching
  `07-UI-UX-DESIGN-SYSTEM.md`: yes. The web app now defines PolyCost color,
  typography, spacing, radius, provider-accent, light, dark, and print tokens in
  `apps/web/src/styles.css`.
- NL input plus structured form tabs: yes. The Describe tab calls
  `/api/v1/workload/parse` and moves the parsed NWS into the same editable form used
  by the Form tab.
- Three-column comparison view and responsive mobile carousel: yes. Desktop uses
  stable AWS/Azure/GCP columns; mobile keeps a sticky totals bar and horizontal
  provider carousel.
- Light/Dark/System theme switching with no flash of wrong theme: yes. The HTML shell
  resolves the stored/system theme before React renders, and the React theme helper
  persists explicit choices.
- Export bar for PDF/CSV/Excel: yes. Export buttons call the Phase 8 report endpoint
  and save the returned Blob with a comparison-specific filename.
- Accessibility checks per `07-UI-UX-DESIGN-SYSTEM.md` section 8: yes. Native form
  controls, keyboard-friendly tabs/buttons, visible focus states, reduced-motion
  rules, semantic regions, provider line-item labels, and print styling are in place.
- Runtime verification: Docker Compose web rebuild/start succeeded. Browser smoke
  against `http://localhost:3000` passed for desktop and mobile: no console errors,
  provider order remained AWS/Azure/GCP, desktop had no page-level horizontal overflow,
  and mobile used the sticky totals bar plus horizontal carousel.
- Test coverage: web workspace coverage is 92.63% statements, 84.15% branches, 92.66%
  functions, and 92.57% lines.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, `npm run test:integration`, `npm run test:e2e`,
  `npm audit --audit-level=high`, `npm run graphify:validate`, `npm run qa`,
  `npm run db:validate`, `npm run devops:check`, `npm run cloud:check`, Docker
  Compose web rebuild/start, direct Docker Compose health check, web/API HTTP smoke
  checks, and browser responsive smoke.
- Deviations from spec: none for the anonymous frontend flow. Pricing freshness is
  shown as cached-catalog status before comparison and as the comparison snapshot
  timestamp after comparison; the admin pricing-status endpoint remains backend-only.
- Checkpoint: Phase 9 is complete. Stop here until Phase 10 is explicitly approved.

## Post-Phase 9 audit remediation - frontend/backend

**Status:** Complete
**Date:** 2026-06-29

- Findings: clean local stacks had zero `pricing_catalog` rows, so the MVP comparison
  path returned `PRICING_UNAVAILABLE`; the Describe-tab `Compare` action priced the
  default form instead of the typed natural-language text; the initial provider cards
  showed failure language before any comparison; and the anonymous frontend surfaced
  the admin-only pricing-status endpoint as "Pricing status restricted."
- Backend fixes: added `004_seed_local_pricing_catalog.sql` with 42 baseline
  AWS/Azure/GCP rows across compute, storage, database, and network categories; wired
  the migration into fresh Postgres initialization and DB validation; sorted real ETL
  rows ahead of `local_seed` rows; added provider-default region fallback with
  approximate marking; and added a conservative local natural-language parser fallback
  when no LLM endpoint/model is configured.
- Frontend fixes: the Describe-tab primary action is now `Parse & compare` and prices
  the parsed NWS; pre-comparison provider panels render as `Pending` / `Ready to
compare`; anonymous UI no longer calls the admin-only pricing-status endpoint; and
  tests cover the repaired plain-English compare flow.
- Runtime verification: applied migration `004` to the running local database,
  verified 42 seeded catalog rows, rebuilt API/web containers, confirmed Docker
  health, confirmed `/workload/parse` works without LLM config, confirmed
  `/comparisons` returns all three providers, confirmed CSV export returns real
  line-items, and browser-audited desktop/mobile UI with no console errors or text
  overflow.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, `npm run test:integration`, `npm run test:e2e`,
  `npm audit --audit-level=high`, `npm run graphify:validate`, `npm run qa`,
  `npm run db:validate`, `npm run devops:check`, `npm run cloud:check`, Docker
  Compose rebuild/start, direct Docker Compose health check, direct API/web HTTP
  smoke checks, export smoke, and browser responsive smoke.
- Checkpoint: the Phase 9 audit remediation is complete. Phase 10 can now start from
  a working end-to-end MVP workflow.

## Post-Phase 9 dashboard/theme enhancement

**Status:** Complete
**Date:** 2026-06-29

- Frontend upgrades: added a dynamic cost dashboard above the provider cards with
  lowest-cost, spread, average, and provider-coverage metrics; provider spend bars
  sorted by current interval cost; and a cheapest-provider category mix chart.
- Visual system upgrades: added inline SVG marks for AWS, Azure, and GCP-inspired
  provider identity; added SVG icons to mode/theme/sample controls; and refreshed
  light/dark tokens around AWS orange, Azure blue, and GCP green with GCP secondary
  colors for charts.
- Responsiveness: dashboard charts stack on tablet/mobile, the sticky mobile totals
  bar now includes provider marks, and provider cards retain the existing mobile
  carousel behavior.
- Runtime verification: rebuilt the Docker web image and browser-smoked
  `http://localhost:3000` at desktop `1280x720` and mobile `390x844`. The
  `Parse & compare` flow produced populated dashboard metrics, provider spend bars,
  category mix bars, enabled exports, stable AWS/Azure/GCP provider order, no page
  overflow, no visible text overflow, and no console errors.
- Test coverage: web workspace coverage is 92.88% statements, 85.36% branches,
  93.93% functions, and 92.76% lines.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, Docker Compose web rebuild/start, direct Docker Compose health
  check, web/API HTTP smoke checks, and browser responsive smoke.
- Checkpoint: dashboard/theme enhancement is complete. Continue Phase 10 acceptance
  work from the upgraded comparison UI.

## Post-Phase 9 deep comparison polish

**Status:** Complete
**Date:** 2026-06-29

- Frontend upgrades: added a decision brief, savings-vs-next and savings-vs-highest
  chips, provider ranking table with deltas and percent-over-lowest, interval outlook
  bars across daily/weekly/monthly/quarterly/yearly, and a cross-provider category
  heatmap.
- Refinements: provider line-item categories now carry category accents, estimate
  quality includes approximate-line counts, heatmap/ranking tables scroll within
  their panels on narrow screens, and all new chart surfaces share the existing
  AWS/Azure/GCP-inspired token system.
- Runtime verification: rebuilt the Docker web image and browser-smoked
  `http://localhost:3000` at desktop `1280x720` and mobile `390x844`. The
  `Parse & compare` flow produced populated decision brief, ranking, interval
  outlook, category heatmap, provider cards, and exports with stable AWS/Azure/GCP
  order, no page overflow, no visible text overflow, and no console errors.
- Test coverage: web workspace coverage is 94.7% statements, 88.5% branches, 95.15%
  functions, and 94.57% lines.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, Docker Compose web rebuild/start, direct Docker Compose health
  check, web/API HTTP smoke checks, and browser responsive smoke.
- Checkpoint: deep comparison polish is complete. Phase 10 acceptance work can now
  validate a richer decision-grade UI.

## Post-Phase 9 provider brand polish

**Status:** Complete
**Date:** 2026-06-29

- Frontend upgrades: added larger inline SVG provider-card logo lockups for AWS,
  Azure, and GCP; added provider subtitles for Amazon Web Services, Microsoft Azure,
  and Google Cloud Platform; and kept compact marks in dense charts/tables.
- Visual refinements: provider cards now use cloud-specific tinted surfaces,
  cloud-colored borders, logo frames, and adjusted header typography while preserving
  fixed AWS/Azure/GCP comparison order.
- Responsiveness: mobile provider cards stack the logo/title block and total to avoid
  crowding while keeping the horizontal provider carousel behavior.
- Runtime verification: rebuilt the Docker web image and browser-smoked
  `http://localhost:3000` at desktop `1280x720` and mobile `390x844`. The provider
  cards rendered AWS/Azure/GCP logo lockups, cloud-specific tinted card surfaces,
  subtitles, stable provider order, no page overflow, no visible element overflow,
  and no console errors.
- Test coverage: web workspace coverage is 94.83% statements, 88.68% branches,
  95.2% functions, and 94.7% lines.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, Docker Compose web rebuild/start, direct Docker Compose health
  check, web/API HTTP smoke checks, and browser responsive smoke.
- Checkpoint: provider branding polish is complete. Continue Phase 10 acceptance work
  from the branded comparison UI.

## Post-Phase 9 professional UI/UX polish

**Status:** Complete
**Date:** 2026-06-29

- Frontend upgrades: refined the app shell with a sticky translucent header, provider
  accent stripe, stronger wordmark/logomark treatment, contextual comparison toolbar,
  polished segmented controls, button states, form fields, checkboxes, and summary
  rail.
- Dashboard and comparison refinements: added consistent elevation tokens, tighter
  metric cards, clearer dashboard panels, row-backed bar charts, framed ranking and
  heatmap tables, card-style provider line items, and subtle hover/focus states.
- Responsiveness: desktop keeps the summary rail sticky while tablet/mobile return it
  to normal document flow; mobile interval controls now fit all labels; provider
  cards remain a horizontal carousel with the sticky totals bar.
- Runtime verification: rebuilt the Docker web image and browser-smoked
  `http://localhost:3000` at desktop `1440x1000` and mobile `390x844`. The
  `Parse & compare` flow produced populated dashboard metrics, provider logos,
  interval controls, exports, stable AWS/Azure/GCP order, no page overflow, no
  visible text overflow, no unintended wide elements, and no console errors.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, Docker Compose web rebuild/start, `docker compose ps`,
  `curl -fsSI http://localhost:3000`, `curl -fsS http://localhost:3001/health`,
  and browser responsive smoke. `npm run ci:lint` still reports only the existing 15
  API security warnings.
- Coverage note: web workspace coverage remains 94.83% statements, 88.68% branches,
  95.2% functions, and 94.7% lines. A full all-workspace `npm run test:coverage`
  run executes all API tests successfully but currently fails the API global branch
  threshold at 81.56% versus the configured 85% target; this is carried forward as a
  backend coverage item.
- Checkpoint: professional UI/UX polish is complete. Continue Phase 10 acceptance
  work from the polished comparison UI.

## Post-Phase 9 advanced form UX polish

**Status:** Complete
**Date:** 2026-06-29

- Frontend upgrades: replaced the flat structured form with a sectioned workload
  configurator covering Workload, Compute, Services, Data, and Network. Added live
  sizing summary chips for traffic, compute, scale, and data.
- Form controls: added input suffix affordances for cores, GB, nodes, min/max, and
  egress; upgraded service checkboxes into icon-backed switch tiles; and surfaced the
  previously hidden storage role, storage access pattern, database role, and database
  high-availability fields.
- Responsiveness: desktop keeps the richer form compact in multi-column sections;
  tablet collapses to two columns; mobile stacks summary chips, fields, and switch
  tiles without horizontal form overflow.
- Runtime verification: rebuilt the Docker web image and browser-smoked
  `http://localhost:3000` at desktop `1440x1000` and mobile `390x844`. Form mode
  rendered all five sections, live summary chips, seven switch tiles, 28 form
  controls, no form-wide elements, no page overflow, and no console errors. A mobile
  Form-mode `Compare` run completed successfully and enabled PDF/CSV/Excel exports.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, Docker Compose web rebuild/start, `docker compose ps`,
  `curl -fsSI http://localhost:3000`, `curl -fsS http://localhost:3001/health`,
  and browser responsive form smoke. `npm run ci:lint` still reports only the
  existing 15 API security warnings.
- Coverage note: web workspace coverage is 94.96% statements, 86.64% branches,
  95.53% functions, and 94.84% lines.
- Checkpoint: advanced form UX polish is complete. Continue Phase 10 acceptance work
  from the upgraded structured-form workflow.

## Post-Phase 9 multi-cloud service portfolio expansion

**Status:** Complete
**Date:** 2026-06-29

- Frontend upgrades: added a catalog-backed Cloud services section with 51
  AWS/Azure/GCP service families across compute, containers, application platforms,
  storage, databases, analytics, AI/ML, integration, networking, security,
  operations, DevOps, migration, edge/hybrid, and business services.
- Coverage model: service families are labeled as `Priced`, `Mapped`, or `Roadmap`.
  The V1 estimator remains decision-grade for currently priced families; the catalog
  now exposes broader provider portfolio coverage without claiming every cloud SKU is
  fully priced.
- NWS integration: selected service family IDs round-trip through
  `sourceTraceability` as `serviceCatalog:*` references, so future backend pricing
  work can consume the selected portfolio without changing the form contract again.
- Runtime verification: rebuilt the Docker web image and browser-smoked
  `http://localhost:3000` at desktop `1440x1000` and mobile `390x844`. Desktop
  verified 15 categories, 51 service families, 7 default selections, priced/mapped/
  roadmap badges, visible AWS/Azure/GCP service equivalents, no catalog or page
  overflow, a successful Form-mode comparison after selecting Generative AI, stable
  provider order, and enabled PDF/CSV/Excel exports. Mobile verified one-column
  catalog stats/cards, no page or catalog overflow, no internal service-list scroll,
  and no console errors.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:coverage --workspace @polycost/web`,
  `npm run build`, Docker Compose web rebuild/start, `docker compose ps`,
  `curl -fsSI http://localhost:3000`, `curl -fsS http://localhost:3001/health`,
  and browser responsive service-catalog smoke. `npm run ci:lint` still reports only
  the existing 15 API security warnings.
- Coverage note: web workspace coverage is 95.4% statements, 86.56% branches,
  96.13% functions, and 95.21% lines.
- Checkpoint: multi-cloud service portfolio expansion is complete. Continue Phase 10
  acceptance work from the broader catalog-backed structured form.

## Phase 10 - E2E verification against MVP acceptance criteria

**Status:** Complete with known gaps (see notes)
**Date:** 2026-06-29

- Automated E2E gate added:
  `apps/api/src/api/mvp-acceptance.e2e.spec.ts`.
- Root `npm run test:e2e` now executes a public-API/Compose acceptance suite against
  `http://localhost:3001` and `http://localhost:3000`.
- API `npm test` / `npm run test:unit` now explicitly exclude `*.e2e.spec.ts` and
  `*.integration.spec.ts`, so the Docker-dependent acceptance suite runs only from
  the E2E command.

| #   | Acceptance criterion                                                                 | Verified? |
| --- | ------------------------------------------------------------------------------------ | --------- |
| 1   | Zero-context user gets a 3-cloud comparison from a plain-English requirement         | [x]       |
| 2   | Re-run comparison a week later reflects pricing changes, no code deploy needed       | [x]\*     |
| 3   | Same comparison exports consistently across PDF/CSV/Excel                            | [x]       |
| 4   | Cloud-specific requirement still produces 3-cloud comparison, approximations labeled | [x]       |
| 5   | Clean checkout plus `docker-compose up` works with no manual pricing-seed step       | [x]\*\*   |
| 6   | Test coverage exists for NWS parsing, adapters, interval math, all 3 export formats  | [x]       |

\* Verified by `POST /api/v1/comparisons/:id/refresh-live` creating a fresh comparison
snapshot from the current catalog with no code deploy. Deterministic price-delta
simulation remains a hardening item because the current public API does not expose a
test-only catalog mutation path.

\*\* Verified on the current checkout with `docker compose up -d --build`, healthy API,
healthy Postgres/Redis/Vault, web HTTP 200, and no manual pricing-seed command.
Earlier Phase 1/2 checkpoints verified clean-volume startup; this checkpoint did not
destructively reset existing Docker volumes.

- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run test:e2e`, `npm run build`,
  `npm run security:audit`, `docker compose up -d --build`, `docker compose ps`,
  `curl -fsS http://localhost:3001/health`, and
  `curl -fsSI http://localhost:3000`.
- `npm run ci:lint` still reports only the existing 15 API security warnings.
- `npm run security:audit` exits clean at `--audit-level=high`; the known 30
  low/moderate development/tooling advisories remain.
- Coverage existence is backed by existing unit suites for NWS parsing, NWS
  validation, provider adapters, comparison orchestration, interval math, and all
  three report generators. Full all-workspace coverage still carries the known API
  global branch threshold gap below.

All required Playwright E2E journeys from `10-TESTING-STRATEGY.md` section 5 passing:
[x] Completed in the 2026-07-01 Post-Phase 10 Playwright browser journey coverage
checkpoint. The formal browser suite now covers theme switching/persistence,
responsive mobile comparison without page-level horizontal overflow, partial provider
warning surfacing, export requests, and keyboard-only comparison/disclosure/interval
controls.

## Post-Phase 10 FinOps dashboard and report polish

**Status:** Complete
**Date:** 2026-06-29

- Dashboard upgrades: added a FinOps Decision Signals panel with monthly run-rate,
  annual exposure, optimization spread, top cost driver, provider-fit summaries, and
  recommended next checks for architecture/procurement review.
- Provider guidance: each AWS/Azure/GCP result now receives a cost-leader, viable
  alternative, review-fit, or unavailable posture based on available pricing,
  deltas, and approximation count.
- Report upgrades: PDF, CSV, and Excel exports now include a FinOps Summary section
  with lowest monthly run-rate, annual exposure, optimization spread, dominant cost
  driver, approximate line count, and priced provider count.
- Responsiveness: the new FinOps cards and provider-fit list collapse cleanly across
  desktop, tablet, and mobile layouts without adding horizontal page overflow.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run build`, `docker compose up -d --build`,
  `curl -fsS http://localhost:3001/health`, `curl -fsSI http://localhost:3000`,
  and `npm run test:e2e` against the rebuilt stack.
- `npm run ci:lint` still reports only the existing 15 API security warnings.

## Post-Phase 10 executive decision memo polish

**Status:** Complete
**Date:** 2026-06-29

- Dashboard upgrades: added an Executive Decision Memo above the detailed cost
  analysis so CEO, CTO, FinOps, and cloud-architecture stakeholders can immediately
  see the recommended baseline, annual exposure, avoidable annual spread, and
  confidence level.
- Decision logic: the memo now grades confidence from priced-provider coverage and
  approximate mappings, then adapts the recommendation copy for complete,
  partial, high-confidence, and no-price scenarios.
- Stakeholder lenses: added concise CEO, CTO, FinOps, and cloud follow-up prompts
  that turn the comparison from a raw calculator into a review-ready decision aid.
- Report upgrades: PDF, CSV, and Excel exports now include executive
  recommendation, decision confidence, and annual avoidable spread alongside the
  existing FinOps summary metrics.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run build`, `docker compose up -d --build`,
  `curl -fsS http://localhost:3001/health`, `curl -fsSI http://localhost:3000`,
  and `npm run test:e2e` against the rebuilt stack.
- `npm run ci:lint` still reports only the existing 15 API security warnings.

## Post-Phase 10 solution architect review layer

**Status:** Complete
**Date:** 2026-06-29

- Dashboard upgrades: added a dedicated Solution Architect Architecture Fit Review
  layer that evaluates service mapping, resilience, scaling, and data/network
  readiness from the active workload assumptions and comparison result.
- Executive memo: promoted Solution Architect to a first-class stakeholder lens
  alongside CEO, CTO, FinOps, and Cloud so architecture validation is visible in the
  decision brief, not hidden in technical detail.
- Risk posture: added low/medium/high/pending architecture risk logic based on
  provider coverage, approximate mappings, availability posture, database HA, load
  path, CDN, egress, and scaling model.
- Report upgrades: PDF, CSV, and Excel exports now include Solution Architect review
  and Architecture risk rows in the FinOps Summary section.
- Tests/checks passing: `npm run format:check`, `npm run ci:lint`,
  `npm run test:unit`, `npm run build`, `docker compose up -d --build`,
  `curl -fsS http://localhost:3001/health`, `curl -fsSI http://localhost:3000`,
  and `npm run test:e2e` against the rebuilt stack.
- `npm run ci:lint` still reports only the existing 15 API security warnings.

## Post-Phase 10 report export evidence polish

**Status:** Complete
**Date:** 2026-07-01

- Report evidence model: added shared row builders for decision summary, selected
  pricing-scenario provider ranking, workload scope, pricing-model availability, and
  report assumptions.
- CSV/XLSX/PDF exports: all three formats now surface the new evidence sections,
  label the cheapest provider as the on-demand baseline, and keep selected
  commitment/spot scenarios separate from the baseline comparison.
- PDF readability: unavailable pricing models now render as document-friendly
  "not eligible" rows instead of empty currency placeholders. Long single-token
  wrapping is guarded, and the no-requirements fallback is preserved in PDF output.
- Verification: report generator unit coverage was expanded for the new sections,
  pricing-model availability, assumptions, workload scope, and missing-requirements
  PDF fallback.
- Tests/checks passing locally:
  `npm run test:unit --workspace @polycost/api -- --runTestsByPath src/reports/report-generators.spec.ts`,
  `npm run lint --workspace @polycost/api`,
  `npm run typecheck --workspace @polycost/api`,
  `npm run test:unit --workspace @polycost/api`,
  `npm run build --workspace @polycost/api`, `npm run format:check`, and
  `git diff --check`.
- PDF visual QA: generated a sample PDF, rendered it with `pdftoppm`, and inspected
  all pages for clipping, overlap, and unreadable unavailable-scenario rows. Poppler
  emitted only a local fontconfig cache warning; rendered pages were usable.
- Remote verification: PR #5 (`Enhance report export evidence`) passed the GitHub
  `quality` workflow, including format check, lint/typecheck, QA, graph validation,
  unit coverage, integration tests, build, E2E tests, and dependency security scan,
  then merged to `main`.
- `npm run lint --workspace @polycost/api` still reports only the existing 15 API
  security warnings already tracked in known issues.

## Post-Phase 10 Playwright browser journey coverage

**Status:** Complete
**Date:** 2026-07-01

- Browser test harness: added `@playwright/test` to the web workspace, introduced
  `apps/web/playwright.config.ts`, and changed `@polycost/web` `test:e2e` from the
  old Jest placeholder pattern to Playwright browser execution.
- CI hardening: the GitHub quality workflow now installs the Playwright Chrome
  channel before running the E2E step, matching the browser channel used locally.
- Formal journeys added under `apps/web/e2e`: theme switching and reload
  persistence, mobile default-workload comparison with page-level horizontal
  overflow checks, partial provider pricing-warning surfacing, PDF/CSV/XLSX export
  request context, and keyboard-only compare/disclosure/interval controls.
- Backend wiring coverage: the mobile journey runs against the real local Compose
  API/web stack; warning/export/keyboard journeys mock only the targeted network
  edges needed to deterministically exercise browser UI states.
- Root E2E gate: existing API MVP acceptance tests continue to run through Jest, and
  the web workspace now contributes the Playwright browser journeys through
  `npm run ci:e2e`.
- Tests/checks passing locally:
  `npm run format:check`,
  `npm run ci:lint`,
  `npm run test:unit`,
  `npm run build`,
  `npm run security:audit`,
  `npm run lint --workspace @polycost/web`,
  `npm run typecheck --workspace @polycost/web`,
  `npm run build --workspace @polycost/web`,
  `npm run test:e2e --workspace @polycost/web`, and
  `POLYCOST_E2E_SKIP_COMPOSE=1 npm run ci:e2e` against the already-running Compose
  stack with localhost network access.
- Notes: the current UI no longer uses the older mobile provider carousel mentioned
  in the original carried-forward item, so the responsive browser journey validates
  the current progressive-disclosure mobile layout and no-horizontal-overflow
  requirement instead.

## AI-native Phase 1 reimagining pass

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-01

- Shared AI-native contracts: added the `@polycost/types` workspace package with
  stable, versioned `NormalizedRequirement`, `ProviderCostResult`,
  `AiCostNarrative`, and `RequirementParserService` contracts.
- Phase 2/Phase 3 readiness: added `ARCHITECTURE_NOTES.md` and explicit
  `PHASE_2_HOOK` / `PHASE_3_HOOK` comments at the parser and pricing pipeline
  integration points so CSV/Excel/diagram parsing and Terraform import/generation
  can plug into the same NWS path later.
- Parser adapters: wrapped natural-language and guided-form parsing behind
  injectable NWS-backed parser adapters. Natural language continues to use the
  configured structured LLM path when available and the existing local heuristic
  parser fallback when LLM config is absent.
- Requirement trust checkpoint: natural-language input now parses into an editable
  guided-form review state before comparison. The active requirements, input mode,
  pricing scenario, and review flag persist in session storage for what-if re-runs
  without re-parsing.
- Share links: read-only share links now capture pricing model and granularity,
  support optional password protection, and can be revoked.
- What-if evidence: pricing-model deltas are visible in provider cards, and shared
  reports preserve the selected scenario context.
- Engineering dashboard: added a full service x provider x pricing-model matrix with
  sticky headers, category/provider/pricing-model filters, and sort options for
  every provider/model column. Missing service-level pricing-model data is shown as
  `N/A` instead of `$0`.
- Follow-up hardening: comparison results now preserve exact cached egress tier rows
  on network line items when provider catalog data exposes them. The engineering
  dashboard, CSV, XLSX, and PDF reports now include commitment payment/TCO evidence
  and egress tier audit sections.
- Inline scenario what-if: the engineering dashboard now has a region and scale
  what-if panel that clones the reviewed guided-form model, adjusts region and
  scale fields, calls the cached comparison endpoint directly, and displays the
  before/after monthly and annualized delta without invoking natural-language
  parsing again.
- Excel what-if workbook: XLSX exports now include a second `What If` worksheet
  with editable scale and region-multiplier assumptions, workbook-level named
  ranges, auto-recalculation metadata, and formula-driven scenario monthly/yearly
  and delta totals.
- PDF visual deck: PDF exports now append server-rendered vector chart pages for
  executive provider monthly run-rate comparison and engineering service-mix
  evidence, using the same comparison totals and line-item data as the CSV/XLSX
  exports.
- Upfront cash evidence: cached pricing records can now publish optional
  `upfrontCostUsd`; the comparison rollup preserves and sums it for provider-level
  Reserved/Savings scenarios, the engineering TCO table shows it separately from
  recurring monthly cost, and CSV/XLSX/PDF reports include it in term TCO.
- Phase 1 requirements file bridge: the Paste / parse input now accepts TXT,
  Markdown, JSON, and YAML requirement files client-side, loads the content into
  the same natural-language parser/review/edit flow, and explicitly keeps CSV,
  Excel, and DrawIO structured import behind the documented Phase 2 parser hook.
- Fresh-stack pricing-model seed hardening: Postgres bootstrap now runs migrations
  008-011, `db:validate` enforces them, and migration 011 adds local seed reserved
  1-year / 3-year compute rows for all three providers and seeded compute sizes so
  clean self-hosted demos show commitment scenario cells without live provider calls.
- Focused verification passing locally:
  `npm run typecheck --workspace @polycost/web` and
  `npm run test:unit --workspace @polycost/web -- --runTestsByPath src/App.spec.tsx`.
- Verification passing locally:
  `npm run check`, `npm run build`, `npm run test:coverage`,
  `npm run test:e2e --workspace @polycost/web`,
  `POLYCOST_E2E_SKIP_COMPOSE=1 npm run ci:e2e`, `npm run security:audit`, and
  `npm run db:validate` against the running Compose stack.
- Notes: `npm run check` still reports the existing 15 API ESLint security warnings;
  `npm run build` still warns that `%VITE_API_BASE_URL%` is not defined in
  `index.html`; `npm run security:audit -- --audit-level=high` exits successfully
  while listing low/moderate tooling advisories already tracked below.

## 2026-07-06 Production-readiness pass

- Added `USE_MOCK_PROVIDERS=true` and `PRICING_ETL_RUN_ON_BOOT=true` as local-demo
  defaults, with deterministic mock AWS/Azure/GCP provider adapters that seed broad
  compute, storage, database, and tiered network pricing on API startup.
- Fixed first-run/self-hosted backend boot gaps: API Docker runtime now includes the
  shared `@polycost/types` package, pricing ETL startup jobs use a BullMQ-safe job ID,
  `PricingModelsModule` no longer asks Nest to inject a raw function, and both
  `/health/deep` and `/api/v1/health/deep` are mapped explicitly.
- Hardened catalog persistence so normalized provider refreshes populate both
  `pricing_catalog` and current `pricing_rates`, including reserved, savings-plan,
  and spot-estimate rows with payment-option variants.
- Fixed the live `/api/v1/comparisons` 500 caused by stale local DB volumes missing
  migration `019`; applied migrations `019`-`021` to the running stack and upgraded
  `npm run db:migrate` so it now applies pending migrations to existing volumes before
  validating.
- Improved provider equivalence fallback: if a cloud-specific region has partial rows
  but no shape-compatible compute SKU, the adapter falls back to that provider's
  default region and labels the result approximate. This restored three-way AWS,
  Azure, and GCP comparison output for AWS-shaped region inputs.
- Added structured server-side logging for unexpected internal API errors without
  leaking stack traces to clients; handled validation and expected 503s remain clean
  client responses.
- Hardened cached-management endpoints with UUID validation for workload and alert
  IDs, converting invalid IDs into structured `VALIDATION_ERROR` 400 responses instead
  of Postgres 500s.
- Updated web Playwright E2E coverage to match the current theme contract: system
  preference is the default choice while the resolved theme follows OS media, and
  light/dark choices persist when selected.
- Live smoke verification on the Compose stack passed for deep health, three-provider
  comparison, comparison retrieval, analytics, PDF/CSV/XLSX exports, pricing models,
  workload breakdown, workloads, budgets, alerts, share links, shared reports, and
  exchange rates.
- Verification passing locally:
  `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run test:unit --workspace @polycost/api`, `npm run test:unit --workspace @polycost/web`,
  `npm run test:integration`, `npm run test:e2e --workspace @polycost/api`,
  `npm run test:e2e --workspace @polycost/web`, `npm run graphify:validate`,
  `npm run qa`, `npm run devops:check`, `npm run cloud:check`, `npm run db:validate`,
  `npm run security:audit`, and `npm audit --omit=dev --audit-level=moderate`.
- Notes: `npm run build` still warns that `%VITE_API_BASE_URL%` is not defined in
  `index.html`; lint passes with existing security-plugin warnings only; full audit
  high/critical gate passes while production-only audit reports 0 vulnerabilities.

## 2026-07-06 Phase 2 diagram-to-cost hardening pass

- Hardened diagram ingestion beyond the initial Phase 2 scaffold: decoded uploads keep
  the 5MB safety cap, JSON request envelopes now allow base64 VSDX payloads safely,
  binary sniffing rejects PNG/JPEG/GIF/PDF content, and inflated draw.io/VSDX content
  is bounded by size and compression-ratio guards.
- Added randomized 24-hour temp-file storage outside the webroot via
  `DIAGRAM_TEMP_DIR`, including DB metadata for `temp_file_ref` and `expires_at`.
  Only the random file reference is persisted, not a filesystem path.
- Expanded review UX so diagram components are not silently trusted: users can remove
  detected services, classify unresolved nodes, add missing services, inspect ignored
  decorative nodes, and submit the edited NWS into the normal comparison pipeline.
- Added API/browser fixture coverage for Mermaid, draw.io, Lucid CSV, and VSDX; added
  malicious fixture coverage for XXE, deflate bomb, ZIP bomb, and renamed binary
  image uploads.
- Fixed Compose migration drift for existing local volumes by running
  `npm run db:migrate` inside `npm run ci:e2e`, and updated the fresh Postgres init
  migration list through `023`.
- Added SQL Server local seed pricing rows so VSDX diagrams containing SQL Server
  databases can still produce three-cloud comparison output in clean/local stacks.
- Verification passing locally:
  `npm run format:check`, `npm run ci:lint`, `npm run ci:unit`,
  `npm run ci:integration`, `npm run ci:build`, `npm run ci:e2e`,
  `npm run ci:security`, `npm run db:validate`, `npm run graphify:validate`,
  `npm run qa`, `npm run devops:check`, and `npm run cloud:check`.
- Notes: `npm run ci:security` exits 0 at the high threshold while reporting
  low/moderate transitive advisories in tooling paths; `npm run qa` still skips the
  optional Node 24-only impeccable check because the repo targets Node 20.

## Known issues / carried-forward items

Running list. Add here whenever a phase completes with known gaps. Remove an item only
when it is actually resolved in a later phase, with a note on which phase resolved it.

- npm audit high/critical gate passes, but the development dependency tree now reports
  30 non-high advisories after adding Graphify. The remaining advisories are in
  development/tooling dependency paths, including the existing Jest/ts-jest chain and
  Graphify transitive AI/provider packages.
- Phase 3 unit coverage passes but Jest emits a worker teardown warning after the
  adapter suite. No tests fail; investigate before tightening CI runtime diagnostics.
- `eslint-plugin-security` reports warnings for controlled fixture reads,
  provider-response dictionary access, and the local Vault token-file read. These are
  non-blocking under the current lint config and were reviewed during Phase 3.
- Resolved on 2026-07-01: full all-workspace `npm run test:coverage` passes after
  the later API/web coverage additions. Keep watching branch coverage as new shared
  pricing and report paths are added.
- Phase 10 refresh-live acceptance verifies that a comparison is re-run into a fresh
  snapshot from current catalog data. Deterministic proof that a changed catalog row
  changes the refreshed result still needs either a test-only catalog fixture path or
  internal SKU traceability for safe mutation.
- The AI-native reimagining prompt's most aggressive DoD is not fully product-complete
  yet: Phase 1 plain requirements file loading is implemented, while rich CSV,
  Excel, and DrawIO structured import remains a documented Phase 2 hook. Account-level
  requirement persistence is not implemented because auth/user accounts are not part
  of this Phase 1 codebase. Session-level requirement persistence is implemented for
  what-if reruns and pricing-model switches.
- The engineering matrix now filters by category/provider/pricing model and sorts by
  every provider/model column. Fresh local seed data now includes reserved compute
  scenarios; non-compute commitment cells still render `N/A` where that pricing model
  is not applicable or not available from provider/catalog data.

## Deviations from spec log

Every implementation divergence from `00` through `11` should be logged here with
the reasoning, even if approved in a phase checkpoint.

- Phase 1 API scaffold uses NestJS with the Fastify platform and `@fastify/helmet`
  instead of the Express platform plus `helmet`. This preserves the NestJS contract
  and security headers while avoiding the high-severity `multer` audit path pulled
  in by `@nestjs/platform-express`.
- Phase 2 local development DB bootstrap writes generated database passwords to a
  project-scoped Docker volume as a handoff between Vault seed and Postgres init.
  This is limited to local Compose bootstrap; committed config still contains no
  literal database credentials or credential-bearing connection strings.
- Phase 3 `refreshPricingCatalog()` and `refreshLivePricing()` return normalized
  pricing records instead of `void`, extending the architecture sketch so the Phase 4
  ETL job can persist normalized rows cleanly.
- Phase 8 `POST /api/v1/comparisons/:id/refresh-live` re-runs the stored NWS against
  current catalog data and saves a new snapshot, but it does not yet re-query only
  the exact provider SKUs/services from the original comparison. The public
  `ComparisonResult` shape intentionally omits SKU IDs, so a later V1 hardening pass
  should add internal SKU traceability or derive a provider refresh plan from the NWS.
- Phase 8 `POST /api/v1/comparisons` rejects `useLivePricing: true` with
  `LIVE_REFRESH_UNAVAILABLE` until initial live provider refresh has an explicit
  implementation path. This avoids silently returning cached-catalog results for a
  request that asked for live pricing.
- Phase 10 initially used Jest public-API/Compose tests for MVP acceptance while the
  formal browser journey set remained carried forward. The 2026-07-01
  Post-Phase 10 Playwright browser journey coverage checkpoint resolved that gap by
  adding web Playwright coverage for theme, responsive mobile comparison, provider
  warnings, exports, and keyboard-only controls.
- Post-Phase 9 audit remediation seeds a local baseline pricing catalog so clean
  self-hosted Compose stacks can produce first-run comparisons before provider ETL
  credentials are configured. Seed rows are marked `attributes.source = local_seed`,
  and catalog reads prefer real ETL rows over local seed rows when both exist.
