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
- `apps/api/src/api/auth-billing.spec.ts` proves imported actuals classify invoice
  rows as usage or non-usage adjustments, and reconciliation evidence separates
  usage-comparable variance from taxes, credits, support, marketplace/private-offer,
  and other adjustment rows.
- `apps/api/src/api/auth-billing.spec.ts` also proves provider commitment semantics
  are classified separately for covered usage, commitment discounts/negations,
  recurring or upfront commitment fees, and amortization or unused commitment rows.
- Commitment reconciliation evidence now reports which commitment rows still need
  provider inventory, amortization-period proof, and allocation evidence before
  invoice-grade use.
- Reconciliation evidence now includes an invoice-grade readiness matrix with present,
  partial, missing, and not-applicable checks, top blockers, and required provider
  artifacts.
- Reconciliation evidence now supports registering invoice-grade artifact metadata
  under `invoiceGradeArtifactRegister`, with check coverage, registered/verified
  counts, control-total deltas, and audit trail evidence. This is metadata
  registration only, not invoice verification.
- Registered artifact metadata can now be marked `verified` or `rejected` with review
  evidence, checksum/control-total mismatch rejection, verified counts, and readiness
  updates limited to covered checks.
- Registered artifact files can now be stored and downloaded through guarded billing
  routes. The app hashes raw decoded bytes, stores the blob in
  `invoice_artifact_blobs`, writes only metadata into reconciliation evidence, and
  records a transaction-coupled audit event.
- Stored artifact metadata now includes storage backend, KMS production-readiness,
  retention/legal-hold policy, and scan-hook status. The local EICAR-signature hook
  blocks known test-malware content before storage.
- Artifact storage readiness and retention enforcement now have explicit admin API
  operations, production-bound config guards, strict provider-check coverage,
  signed scanner webhook integration, and delete-expired enforcement for
  database-backed blobs that are not under legal hold.
- Provider-native invoice artifact storage now writes and reads external artifact
  bytes through AWS S3, Azure Blob Storage, and GCP Cloud Storage adapters, stores
  object pointers instead of inline bytes for external rows, and checksum-verifies
  provider reads before returning downloaded content.
- External artifact retention now deletes S3, Azure Blob, or GCP Cloud Storage objects
  before removing expired non-held database pointers, with provider `404` treated as
  idempotent success for retry safety.
- `docs/PROVIDER-CREDENTIALS.md` states the current production swap procedure and
  explicitly limits real provider mode to catalog list prices, not invoices.

Deferred:

- Full invoice-grade billing remains future work: private discounts, enterprise
  agreements, amortization semantics, actual billed usage, and provider
  invoice-of-record reconciliation are not complete. Native AWS CUR, Azure Cost
  Management CSV, and nested GCP Billing Export JSON mapper coverage now exists for
  estimate-vs-actual reconciliation evidence. Classified adjustment and commitment
  rows are separated from usage-comparable variance, but provider-account-specific
  amortization, allocation proof, private pricing, and invoice controls remain
  future work. The invoice-grade readiness matrix, artifact register, stored-blob
  metadata, governance status, object-storage pointers, and verification status
  expose those blockers; they do not remove unrelated or unverified evidence
  requirements. Current artifact storage supports database-backed local mode plus
  provider-native object writes/reads/deletes, but real AV operations, legal-hold
  enforcement, and reviewer workflow automation remain future production work.

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
  step labels, durations, reserved-pricing what-if, PDF/CSV/Excel exports,
  share-link creation, and Redis-degradation status.
- Latest isolated local run (`POLYCOST_WEB_BASE_URL=http://127.0.0.1:3200`,
  `POLYCOST_API_ORIGIN=http://127.0.0.1:3201`) passed with
  template-to-recommendation at `8547ms` / `60000ms` and diagram-to-PDF at `2924ms`
  / `180000ms`.
- Isolated local `npm run ci:e2e` also passed API E2E `16/16`, web Playwright
  `7/7`, then `live:verify` with template-to-recommendation at `5542ms` /
  `60000ms` and diagram-to-PDF at `3111ms` / `180000ms`.

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

- VSDX support now includes layout-aware extraction, evidence, and approximate SVG
  previews, but it is still not full Visio visual rendering; themes, icons, formulas,
  embedded media, and exact text wrapping remain future scope.
- Production LLM accuracy depends on the operator configuring a real endpoint/model
  and Vault API key, then evaluating the chosen model against a production corpus.

## Phase V3 - Terraform Generation

Verdict: `verified (mock)`

Evidence:

- `apps/api/src/terraform/terraform-generation.service.ts` consumes the existing
  NWS validator and generates AWS, Azure, and GCP Terraform starter bundles with
  pinned providers, backend examples, variables, main resources, outputs, tfvars
  examples, README guidance, assumptions, security notes, and SHA-256 file hashes.
- `apps/api/src/terraform/terraform-generation.service.spec.ts` verifies provider
  pinning, static safety checks, region override handling, secure defaults, service
  mappings, unsupported-resource caveats, and generated manifest-integrity
  verification across AWS, Azure, and GCP.
- `apps/api/src/api/api-contract.spec.ts` covers `POST /api/v1/terraform/generate`.
- `apps/web/src/api-client.spec.ts` verifies the frontend client request to
  `/terraform/generate`.
- `apps/web/src/App.spec.tsx` verifies the comparison workspace can generate and
  display a Terraform bundle after a completed comparison.
- `docs/architecture/phase-v3-terraform-generation.md` documents scope, provider
  baselines, validation model, and known gaps.
- Phase V3 focused checks passed: API `2` suites / `40` tests and web `2` suites /
  `84` tests.
- V3.5 Terraform bundle integrity hardening added
  `scripts/verify-manifest.mjs` to generated bundles and proved it passes on a
  materialized bundle and fails after `main.tf` tampering.
- Phase V3 full `npm run check` passed with API `51` suites / `398` tests, web
  `9` suites / `132` tests, graph validation, pricing coverage, progress
  verification, QA/security suppression, database, DevOps, cloud, release, and
  provider credential gates.
- `npm run ci:build` passed for API and web.

Deferred:

- Request-time validation is static. Real `terraform init`, `terraform validate`,
  policy checks, and `terraform plan` require saving files and authenticating to
  target cloud accounts outside PolyCost.
- Production landing-zone modules, private endpoints, WAF/CDN wiring, IAM
  least-privilege policies, Kubernetes/serverless modules, active-active DR, and
  provider-specific organization controls remain future IaC phases.

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
- `scripts/live-verification.mjs` records a `workspace-auth-rbac-sso` smoke journey
  against the running stack: owner signup, session hydration, invite preview and
  acceptance, member role change, mock OIDC start/authorize/callback, structured
  `403` for member billing import, and server-side revoke-other-sessions. Tokens,
  invite secrets, and OIDC state are intentionally excluded from the transcript.
- Latest isolated local run completed `workspace-auth-rbac-sso` in `720ms` /
  `60000ms`, including `rbacDeniedStatus: 403` and `stateVerified: true`.
- The isolated local `ci:e2e` run completed the same journey in `794ms` /
  `60000ms` after API E2E verified the signup/invite/role-change/mock-SSO/RBAC
  acceptance path `16/16`.
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
- `STATE-SYNC.md` and `THEME-INVENTORY.md` record the v2 continuation protocol,
  product detection, route/component inventory, and human decision gates.
- `apps/web/src/styles/tokens.css` now contains the v2 dual-mode token layer,
  PolyCost default accent, and terracotta accent axis; `npm run theme:hex:check`
  enforces zero raw hex outside that token file.
- `docs/theme-audit/2026-07-07/` contains dark/light default screenshots plus
  dark/light terracotta smoke screenshots with token evidence.
- Additive liveness/readiness aliases are exposed through `/health/live`,
  `/api/v1/health/live`, `/health/ready`, and `/api/v1/health/ready`.
- Phase 2.9 adds provider-export source-row fingerprints, recognized/missing column
  metadata, invoice reconciliation coverage/readiness evidence, VSDX page geometry
  and layout-extraction caveats, plus an LLM classifier readiness surface that keeps
  stub/unconfigured mode distinct from production-connected mode.
- Phase 2.10 adds focused Azure Cost Management CSV and nested GCP Billing Export JSON
  mapper proof, including fallback-cost recognition and allocation tag/label evidence.
- Phase 2.11 adds backend-backed active workspace switching with session guard,
  membership proof, typed web-client wiring, and a signed-in account-panel team
  selector.
- Phase 2.11 focused regressions passed: API `3` suites / `45` tests
  (`auth.controller`, `auth-billing`, `api-database.repository`) and web `2` suites /
  `84` tests (`App.spec.tsx`, `api-client.spec.ts`).
- Phase 2.11 full `npm run check` passed with API `51` suites / `405` tests, web
  `11` suites / `141` tests, graph validation `312` nodes / `312` edges, pricing
  coverage, progress verification, QA/security suppression, database, DevOps, cloud,
  release, handover, and provider credential gates.
- Phase 2.12 focused invitation lifecycle regressions passed: API `3` suites /
  `45` tests (`auth.controller`, `auth-billing`, `api-database.repository`) and
  web `2` suites / `84` tests (`App`, `api-client`).
- Phase 2.12 full `npm run check` passed with API `51` suites / `405` tests, web
  `11` suites / `141` tests, graph validation `312` nodes / `312` edges, pricing
  coverage, progress verification, QA/security suppression, database, DevOps, cloud,
  release, handover, and provider credential gates.
- Phase 2.12 command gates passed: lint/typecheck, production-readiness, build, and
  high-severity audit; npm still reports the known low Graphify transitive advisory
  with no available fix.
- Phase 2.13 focused invite-delivery regressions passed: API `3` suites / `37`
  tests (`invitation-delivery.service`, `config.schema`, `auth-billing`) and web
  `2` suites / `85` tests (`App`, `api-client`).
- Phase 2.13 full `npm run check` passed with API `52` suites / `411` tests, web
  `11` suites / `142` tests, graph validation `314` nodes / `314` edges, pricing
  coverage, progress verification, QA/security suppression, database, DevOps, cloud,
  release, handover, and provider credential gates.
- Phase 2.13 command gates passed: lint/typecheck, production-readiness, build, and
  high-severity audit; npm still reports the known low Graphify transitive advisory
  with no available fix.
- Phase 2.10 full `npm run check` passed with API `51` suites / `403` tests, web
  `11` suites / `141` tests, graph validation `312` nodes / `312` edges, pricing
  coverage, progress verification, QA/security suppression, database, DevOps, cloud,
  release, handover, and provider credential gates.
- Phase 2.9 focused regressions passed: API `3` suites / `52` tests
  (`auth-billing`, `diagram-parser`, `llm-classifier`) and web `1` suite / `57`
  tests (`App.spec.tsx`).
- Phase 2.9 full `npm run check` passed with API `50` suites / `392` tests, web
  `9` suites / `130` tests, graph validation, pricing coverage, progress
  verification, QA/security suppression, database, DevOps, cloud, release, and
  provider credential gates.
- The latest isolated v2 runtime stack on `WEB_PORT=3230`, `API_HOST_PORT=3231`,
  and `VAULT_HOST_PORT=8340` passed API E2E `16/16`, direct web Playwright `7/7`,
  and direct `live:verify` with template-to-recommendation `4201ms` / `60000ms`,
  diagram-to-PDF `3448ms` / `180000ms`, workspace auth/RBAC `507ms` / `60000ms`,
  and Redis degradation data-health HTTP `200`.

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
- `npm run theme:hex:check`
- `npm run live:verify` against isolated local ports (`WEB_PORT=3200`,
  `API_HOST_PORT=3201`, `VAULT_HOST_PORT=8320`)
- `npm run ci:e2e` against isolated local ports (`WEB_PORT=3210`,
  `API_HOST_PORT=3211`, `VAULT_HOST_PORT=8330`)
- API E2E directly through the isolated v2 stack: `16/16`
- Direct web Playwright against the isolated v2 stack: `7/7`
- `npm run live:verify` against the isolated v2 stack (`WEB_PORT=3230`,
  `API_HOST_PORT=3231`, `VAULT_HOST_PORT=8340`)
- `npm run progress:verify`
- `npm run test:production-readiness`
- `npm run ci:build`
- `npm run check`
- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/diagram-parser/diagram-parser.service.spec.ts src/diagram-parser/llm-classifier.client.spec.ts`
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts src/api/api-contract.spec.ts`
- `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`

`npm run live:verify` writes its latest smoke/timing transcript to
`.tmp/live-verification/latest.json` by default. Set
`POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH` to redirect the artifact in CI. The
anonymous smoke path covers compare -> reserved-pricing what-if -> PDF/CSV/Excel
exports -> share link, plus diagram upload -> review -> comparison -> PDF. The
authenticated smoke path records `workspace-auth-rbac-sso`: signup -> team/session
hydration -> invite/accept -> role change -> mock OIDC -> structured RBAC 403.
The latest local transcript was captured at
`.tmp/live-verification/latest-local-3200.json`; that artifact is intentionally
local/ignored, while the timings above are recorded here for release review. The
latest CI-orchestrated local transcript was captured at
`.tmp/live-verification/latest-ci-e2e-local.json`, also local/ignored.
The latest v2 production-readiness transcript was captured at
`.tmp/live-verification/latest-v2-prod-ready.json`, also local/ignored.

## Honest Release Verdict

PolyCost is defensible as a private, self-hosted open-source release candidate after
the human release checklist is completed and GitHub Actions runner availability is
fixed. The core app, catalog-list-price comparison engine, evidence chain,
diagram-ingestion foundations, auth/session/RBAC foundations, exports, and release
docs are heavily tested.

It is not yet a full invoice-grade billing platform, not a full Visio renderer, and
not a complete enterprise IAM/SSO product.
