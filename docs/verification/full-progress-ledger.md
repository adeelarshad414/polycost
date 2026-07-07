# Full Progress Verification Ledger

Reviewer date: 2026-07-07

This ledger is the PR-facing evidence map for the autonomous full-verification run.
It is intentionally separate from `PROGRESS.md`: `PROGRESS.md` is the chronological
build journal, while this file is the concise phase-by-phase verdict used for
release review.

Verdict meanings:

- `verified`: proven by current source, tests, and local commands without external
  dummy credentials.
- `verified (mock)`: proven through fixture-backed or mocked provider/LLM/SSO
  paths behind the same interfaces used by production.
- `deferred`: intentionally not complete in this release candidate and documented
  as future work.
- `blocked`: cannot be proven locally because an external service/account condition
  prevents execution.

## Phase A - Foundation And Core Pricing Engine

Verdict: `verified (mock)`

Evidence:

- `npm run progress:verify` enforces the shared
  `packages/types/monthly-hour-standard.json` source, rejects `24*30`, `365/12`,
  and unexpected bare `720` month math, and requires pricing-lineage migrations.
- `apps/api/src/api/finops-proof.spec.ts` proves the 730-hour interval math, manual
  80TB tiered-egress total of `$6553.60/mo`, reserved 1-year break-even at `4`
  months, reserved 3-year break-even at `8` months, and spot estimated/volatile
  evidence flags.
- `apps/api/src/pricing-normalization/pricing-reconciliation.spec.ts` recomputes
  fixture-backed raw catalog rows into normalized compute, storage, and egress
  rates with endpoint, record ID/key, fetch timestamp, transform version, and
  payload hash.
- `apps/api/src/api/live-pricing-traceability.spec.ts` proves refresh-live catalog
  row changes alter refreshed comparison output while retaining SKU lineage.
- `docs/PROVIDER-CREDENTIALS.md` states the current production swap procedure and
  explicitly limits real provider mode to catalog list prices, not invoices.

Deferred:

- Full invoice-grade billing remains future work: private discounts, enterprise
  agreements, credits, taxes, actual billed usage, and billing-export
  reconciliation across provider invoices are not complete.

## Phase B - Input Modes And Requirement Pipeline

Verdict: `verified (mock)`

Evidence:

- `apps/api/src/nws-parser/requirement-parser.service.ts` keeps the swappable
  `RequirementParserService` interface and the `PHASE_2_HOOK` / `PHASE_3_HOOK`
  integration points.
- `apps/web/src/App.spec.tsx` proves natural-language input parses into the editable
  confirmation form and converges with guided-form comparison execution.
- `apps/api/src/comparison/comparison-orchestrator.service.spec.ts` includes the
  `UI_PRICED_SERVICE_FAMILY_IDS` coverage workload so every frontend family labeled
  `priced` resolves through AWS, Azure, and GCP mock catalog/model coverage.
- `scripts/pricing-service-coverage-check.mjs` prevents frontend priced-service
  catalog drift from the API coverage guard.

Deferred:

- Natural-language classification quality with a real external LLM is still a
  production credential/model-evaluation concern. The current proof uses
  deterministic and mocked paths.

## Phase C - Dashboards, Personas And Analytics

Verdict: `verified`

Evidence:

- `apps/web/src/App.spec.tsx` covers executive summary data, engineering cost
  controls, break-even timeline, pricing-model what-if interactions, and visible
  pricing evidence expansion from one comparison data source.
- `apps/api/src/api/comparison-analytics.service.spec.ts` verifies analytics such
  as commitment ROI, break-even timelines, FinOps flags, and provider/service
  breakdowns.
- `apps/web/e2e/polycost-browser.e2e.ts` verifies the primary browser workflow at
  `375px`, `768px`, and `1440px` without horizontal overflow and with named
  interactive controls.
- `scripts/live-verification.mjs` records a JSON transcript for the
  template-to-recommendation and diagram-to-PDF timed journeys, including thresholds,
  step labels, durations, and Redis-degradation status.

Deferred:

- Hosted production analytics telemetry is not part of the OSS MVP; the current
  evidence is in-app comparison analytics and deterministic browser proof.

## Phase D - Exports, Reports And Sharing

Verdict: `verified (mock)`

Evidence:

- `apps/api/src/reports/report-generators.spec.ts` verifies PDF, CSV, Excel, report
  evidence, methodology, egress/networking sections, data-freshness notices, and
  interval math consistency.
- `apps/api/src/api/api-contract.spec.ts` covers compare, breakdown, report export,
  saved comparisons, share links, revocation, and evidence retrieval contracts.
- `apps/api/src/api/mvp-acceptance.e2e.spec.ts` exercises anonymous compare,
  exports, share-link read-only access, and API-level MVP acceptance paths.

Deferred:

- Visual pixel review of every generated PDF/Excel artifact in hosted CI is blocked
  until GitHub Actions can run jobs on an assigned runner.

## Phase E - Diagram Ingestion

Verdict: `verified (mock)`

Evidence:

- `apps/api/src/diagram-parser/diagram-parser.service.spec.ts` covers Mermaid,
  draw.io XML, Lucid CSV, VSDX, malicious XXE, deflate/ZIP bombs, spoofed files,
  oversized node caps, unsafe VSDX rejection, partial parse recovery, and LLM
  fallback behavior.
- `apps/api/src/diagram-parser/llm-classifier.client.spec.ts` proves structured
  Tier 3 LLM classification, retry/timeout behavior, batching, and graceful fallback
  with mocked LLM responses.
- `apps/api/src/reports/report-generators.spec.ts` proves classification evidence
  strings travel into exported report sections.
- `PROGRESS.md` records the current fixture corpus tier table, including VSDX
  coverage.

Deferred:

- VSDX support is layout-aware extraction and evidence, not full Visio visual rendering.
- Production LLM accuracy depends on the operator configuring a real endpoint/model
  and Vault API key, then evaluating the chosen model against a production corpus.

## Phase F - Auth, Teams And RBAC

Verdict: `verified (mock)`

Evidence:

- `apps/api/src/api/auth-billing.spec.ts` verifies local registration/login,
  sessions, session revocation, team creation/settings, invites, invite acceptance,
  role management, mock OIDC start/authorize/callback, billing import
  reconciliation, and Owner/Admin/Member RBAC enforcement.
- `apps/api/src/api/auth.controller.spec.ts` proves workspace account/team endpoints
  stay behind the session guard.
- `apps/web/src/App.spec.tsx` verifies workspace session UX, invitation state,
  member/role UI state, SSO readiness labels, and RBAC visibility/disabled-control
  behavior.
- Anonymous compare remains available in `apps/web/src/App.spec.tsx` and is
  documented in `README.md`.

Deferred:

- Full enterprise account/team UX, production email delivery, production OIDC/SAML
  provider handshakes, SSO administration depth, and complete RBAC product polish
  remain future phases.

## Phase G - Operations, Security And Release Readiness

Verdict: `partially verified / externally blocked`

Evidence:

- `npm run check` runs format, lint/typecheck, unit tests, graph validation, pricing
  service coverage, progress verification, QA/security suppression checks, database
  validation, DevOps/cloud/release checks, and provider credential readiness.
- `npm run release:check` requires open-source files, provider credential docs,
  release checklist items, security ledger, CI workflow gates, pricing logic
  coverage, E2E workflow anchors, and production-readiness focused regressions.
- `docs/SECURITY-SUPPRESSIONS.md` documents reviewed ESLint security suppressions,
  the remaining low transitive npm advisory, and the Node 20/Node 24 impeccable
  decision.
- `RELEASE-CHECKLIST.md` states the human actions needed before making the private
  repository public.

Blocked:

- GitHub Actions `quality` currently fails before executing repository steps:
  latest inspected jobs have `runner_id: 0`, empty runner name/group, and `steps: []`.
  This is an external account/runner/quota/billing blocker, not a failing repo
  command.

Deferred:

- `npm run impeccable` remains a Node 24 public-release follow-up while the repo
  supported runtime remains Node 20.

## Current Verification Commands

These commands have been used as evidence gates in this run:

- `npm run format:check`
- `npm run release:check`
- `npm run provider:credentials:check`
- `npm run progress:verify`
- `npm run test:production-readiness`
- `npm run check`

`npm run live:verify` writes its latest smoke/timing transcript to
`.tmp/live-verification/latest.json` by default. Set
`POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH` to redirect the artifact in CI.

## Honest Release Verdict

PolyCost is defensible as a private, self-hosted open-source release candidate after
the human release checklist is completed and GitHub Actions runner availability is
fixed. The core app, catalog-list-price comparison engine, evidence chain,
diagram-ingestion foundations, auth/session/RBAC foundations, exports, and release
docs are heavily tested.

It is not yet a full invoice-grade billing platform, not a full Visio renderer, and
not a complete enterprise IAM/SSO product.
