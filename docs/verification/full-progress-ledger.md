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
- `apps/api/src/api/scim-provisioning.service.spec.ts` and
  `apps/api/src/api/scim-provisioning.controller.spec.ts` prove the SCIM
  provisioning foundation: owner/admin token creation stores only hashes and
  prefixes, SCIM bearer tokens resolve by hash, `/api/v1/scim/v2/Users` emits
  standard `ListResponse`/`User` shapes, active users attach as members, and
  deactivation removes team membership with audit events. They also prove SCIM
  discovery metadata for `/Schemas` and `/ResourceTypes` remains bearer-protected
  and that representative Okta/Entra create and deactivate fixture payloads are
  accepted by the parser.
- `apps/web/src/App.spec.tsx` verifies workspace session UX, invitation state,
  member/role UI state, SSO readiness labels, SCIM admin token create/revoke
  controls, SCIM provisioned-user visibility, and RBAC visibility/disabled-control
  behavior.
- `apps/web/src/api-client.spec.ts` proves the session-bearer web client wiring
  for listing SCIM token metadata, listing SCIM provisioned users, creating
  one-time-visible SCIM tokens, and revoking SCIM tokens.
- `docs/ENTERPRISE-IDP-ONBOARDING.md` records the current operator setup path for
  Okta-style and Microsoft Entra-style SCIM clients while preserving the formal
  certification boundary.
- `scripts/live-verification.mjs` records `workspace-auth-rbac-sso` and
  `scim-provisioning-lifecycle` smoke journeys against the running stack. The auth
  journey covers owner signup, session hydration, invite preview and acceptance,
  member role change, mock OIDC start/authorize/callback, structured `403` for
  member billing import, and server-side revoke-other-sessions. The SCIM journey
  covers one-time token creation, metadata-only token listing, bearer-protected
  discovery, user create/list/admin readback/deactivate, token revocation, and
  revoked-token `401` denial. Tokens, invite secrets, and OIDC state are
  intentionally excluded from the transcript.
- Latest isolated `npm run ci:e2e` run used Compose project `polycoste2e88038`
  with web `http://localhost:58174`, API `http://localhost:3301`, and Vault host
  port `18220`. It passed API E2E `16/16`, web Playwright `7/7`, and live
  verification with template-to-recommendation `6523ms` / `60000ms`,
  diagram-to-PDF `2698ms` / `180000ms`, workspace auth/RBAC `406ms` / `60000ms`,
  SCIM provisioning `281ms` / `60000ms`, and Redis-down degradation returning
  `/health=degraded`, `/health/deep=degraded`, and data-health HTTP `200`.
- Anonymous compare remains available in `apps/web/src/App.spec.tsx` and is
  documented in `README.md`.

Deferred:

- Full enterprise account/team UX, formal SCIM certification, production email
  delivery, production OIDC/SAML provider handshakes, managed Okta/Entra pilot
  evidence, group push, IdP-driven role mapping, custom schema extensions, account
  recovery, invite/approval workflows, and complete RBAC product polish remain
  future phases.

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
- Phase 2.30 artifact legal-hold administration focused regressions passed: API `2`
  suites / `66` tests (`auth-billing`, `api-database.repository`) and web `2`
  suites / `86` tests (`App`, `api-client`). The phase adds audited Owner/Admin
  legal-hold place/release operations for stored invoice artifacts while keeping full
  legal-review workflow and provider invoice-of-record validation as future scope.
  Full local `npm run check` passed afterward with API `55` suites / `456` tests,
  web `11` suites / `143` tests, graph validation `320` nodes / `320` edges, and
  progress verification `153` anchors.
- Phase 2.31 invoice artifact review workflow focused regressions passed: API `2`
  suites / `69` tests (`auth-billing`, `api-database.repository`) and web `2`
  suites / `87` tests (`App`, `api-client`). The phase adds audited Owner/Admin
  review-state operations for stored invoice artifacts, including pending/approved/
  rejected states, evidence metadata, aggregate review counts, and workspace
  send/approve/reject controls while keeping external legal-review routing and
  provider invoice-of-record validation as future scope. `npm run ci:lint` passed
  with zero ESLint/typecheck warnings, and `npm run test:production-readiness` passed
  with API `14` suites / `192` tests plus web `2` suites / `87` tests. Full local
  `npm run check` passed afterward with API `55` suites / `459` tests, web `11`
  suites / `144` tests, graph validation `320` nodes / `320` edges, and progress
  verification `153` anchors.
- Phase 2.32 artifact policy exception lifecycle focused regressions passed: API `2`
  suites / `72` tests (`auth-billing`, `api-database.repository`) and web `2`
  suites / `88` tests (`App`, `api-client`). The phase adds audited Owner/Admin
  policy exception operations for stored invoice artifacts, including
  request/approve/reject states, required future expiry for approvals, computed
  expired status, evidence metadata, aggregate exception counts, and workspace
  exception controls while keeping external legal-review routing and provider
  invoice-of-record validation as future scope. `npm run ci:lint` passed with zero
  ESLint/typecheck warnings, and `npm run test:production-readiness` passed with API
  `14` suites / `195` tests plus web `2` suites / `88` tests. Full local
  `npm run check` passed afterward with API `55` suites / `462` tests, web `11`
  suites / `145` tests, graph validation `320` nodes / `320` edges, and progress
  verification `153` anchors.
- Phase 2.33 invoice control packet validation focused regressions passed: API `2`
  suites / `74` tests (`auth-billing`, `api-database.repository`) and web `2`
  suites / `89` tests (`App`, `api-client`). The phase adds audited Owner/Admin
  invoice-control validation for stored and verified invoice artifacts, including
  artifact control-total comparison against imported actuals and reconciliation
  totals, period match state, validation evidence metadata, aggregate matched/
  warning/mismatch counts, and workspace validation controls while keeping provider
  invoice rendering and invoice-of-record validation as future scope. The focused
  `npm run ci:lint` gate passed with zero ESLint/typecheck warnings, and
  `npm run test:production-readiness` passed with API `14` suites / `197` tests
  plus web `2` suites / `89` tests. Full local `npm run check` passed afterward
  with API `55` suites / `464` tests, web `11` suites / `146` tests, graph
  validation `320` nodes / `320` edges, and progress verification `153` anchors.
- Phase 2.34 invoice evidence packet export focused regressions passed: API `2`
  suites / `75` tests (`auth-billing`, `api-database.repository`) and web `2`
  suites / `90` tests (`App`, `api-client`). The phase adds an Owner/Admin
  metadata-only evidence-packet endpoint and workspace JSON download for
  reconciliation reviewer handoff, including reconciliation/import metadata,
  readiness, match summary, artifact register evidence, sanitized artifact metadata,
  control counts, caveats, and invoice-grade disclaimers while excluding raw artifact
  bytes. The focused `npm run ci:lint` gate passed with zero ESLint/typecheck
  warnings, and `npm run test:production-readiness` passed with API `14` suites /
  `198` tests plus web `2` suites / `90` tests. Full local `npm run check` passed
  afterward with API `55` suites / `465` tests, web `11` suites / `147` tests,
  graph validation `320` nodes / `320` edges, and progress verification `153`
  anchors.
- Phase 2.35 invoice evidence packet integrity focused regressions passed: API `2`
  suites / `75` tests (`auth-billing`, `api-database.repository`) and web `2`
  suites / `90` tests (`App`, `api-client`). The phase adds a stable-JSON SHA-256
  integrity manifest to each metadata-only invoice evidence packet, including
  payload byte length, reconciliation/import/comparison subject IDs, provider,
  artifact counts, caveat/disclaimer counts, and generated timestamp, plus
  digest-aware workspace download file names and notices. The focused
  `npm run ci:lint` gate passed with zero ESLint/typecheck warnings, and
  `npm run test:production-readiness` passed with API `14` suites / `198` tests
  plus web `2` suites / `90` tests. Full local `npm run check` passed afterward
  with API `55` suites / `465` tests, web `11` suites / `147` tests, graph
  validation `320` nodes / `320` edges, and progress verification `153` anchors.
- Phase 2.36 invoice evidence packet verifier CLI smoke passed:
  `npm run invoice:evidence:verify -- --help`, `npm run invoice:evidence:verify -- --version`,
  and `npm run invoice:evidence:verify:fixture -- --json` all passed. A tampered
  temp packet smoke changed `reconciliation.invoicedTotalUsd` and confirmed the
  verifier exits non-zero with a digest mismatch. `npm run invoice:evidence:verify:smoke`
  also passed. The committed fixture digest is
  `951039068994605be9582aaf06465cd09c92b3fa692a61d1da55e1a8cf6a845b`, and the
  smoke is wired into `npm run check`. Full local `npm run check` passed afterward
  with API `55` suites / `465` tests, web `11` suites / `147` tests, graph validation
  `320` nodes / `320` edges, and progress verification `153` anchors.
- Phase 2.37 invoice artifact governance audit manifest focused regressions passed:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed `48/48`, `npm run typecheck --workspaces --if-present` passed for API,
  web, and shared types, and
  `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed `90/90`. The phase added digest-covered packet governance metadata plus
  team audit events for packet export and artifact download. Full local
  `npm run check` passed afterward with API `55` suites / `465` tests, web `11`
  suites / `147` tests, graph validation `320` nodes / `320` edges, and progress
  verification `153` anchors.
- Phase 2.38 invoice evidence receipt and WORM posture focused regressions passed:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/config/config.schema.spec.ts`
  passed `64/64`, `npm run typecheck --workspaces --if-present` passed for API,
  web, and shared types, `npm run invoice:evidence:verify:smoke` passed with
  receipt-aware validation, and
  `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed `90/90`. `npm run provider:credentials:check` passed with the expected
  local/demo invoice-artifacts warning expanded to include metadata-only evidence
  receipts and missing WORM retention mode. Full local `npm run check` passed
  afterward with API `55` suites / `467` tests, web `11` suites / `147` tests,
  graph validation `320` nodes / `320` edges, and progress verification `153`
  anchors.
- Phase 2.39 invoice evidence notary API handoff focused regressions passed:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/invoice-evidence-notary.service.spec.ts src/api/auth-billing.spec.ts`
  passed `52/52`. The phase added signed external-webhook handoff requests during
  evidence packet export, sanitized accepted/failed receipt evidence, recomputed
  packet integrity after handoff evidence, and audit metadata for notary delivery
  status/request digest. `npm run test:production-readiness` passed with API `14`
  suites / `200` tests and web `2` suites / `90` tests. Full local
  `npm run check` passed afterward with API `56` suites / `470` tests, web `11`
  suites / `147` tests, graph validation `322` nodes / `322` edges, and progress
  verification `153` anchors.
- Phase 2.40 invoice evidence notary receiver smoke proof passed:
  `npm run invoice:evidence:notary:smoke:local` accepted one signed
  `invoice_evidence_packet.exported` canary handoff, rejected zero events, verified
  the `x-polycost-signature-sha256` HMAC receiver contract, and appended a JSONL
  artifact under `artifacts/invoice-evidence-notary-smoke/`. The staging command
  `npm run invoice:evidence:notary:smoke` is documented and release-gated for HTTPS
  receivers with non-dummy signing secrets; live staging execution remains
  operator-environment evidence. Full local `npm run check` passed afterward with
  API `56` suites / `470` tests, web `11` suites / `147` tests, graph validation
  `322` nodes / `322` edges, and progress verification `153` anchors.
- Phase 2.41 notary reference receiver staging path proof passed:
  `npm run invoice:evidence:notary:receiver:smoke` started the self-hostable
  reference receiver, verified `/health/ready`, sent the existing signed notary
  webhook smoke through the receiver, and confirmed the JSONL receipt artifact
  under `artifacts/invoice-evidence-notary-reference-receiver/`. The captured
  packet digest was
  `1bb1abec466eda604ebb949acf7e40e8b0385cdcff1445ecac2d691736550ea0`.
  `docker build -f docker/notary-receiver/Dockerfile -t
polycost/notary-reference-receiver:local .` passed. The receiver intentionally
  records `immutableRetentionProved: false`; WORM/object-lock proof remains
  operator-environment evidence. Full local `npm run check` passed afterward with
  API `56` suites / `470` tests, web `11` suites / `147` tests, graph validation
  `322` nodes / `322` edges, and progress verification `153` anchors.
- Phase 2.9 focused regressions passed: API `3` suites / `52` tests
  (`auth-billing`, `diagram-parser`, `llm-classifier`) and web `1` suite / `57`
  tests (`App.spec.tsx`).
- Phase 2.9 full `npm run check` passed with API `50` suites / `392` tests, web
  `9` suites / `130` tests, graph validation, pricing coverage, progress
  verification, QA/security suppression, database, DevOps, cloud, release, and
  provider credential gates.
- The latest isolated `npm run ci:e2e` stack on web `58174`, API host `3301`, and
  Vault host `18220` passed API E2E `16/16`, web Playwright `7/7`, and direct
  `live:verify` with template-to-recommendation `6523ms` / `60000ms`,
  diagram-to-PDF `2698ms` / `180000ms`, workspace auth/RBAC `406ms` / `60000ms`,
  SCIM provisioning `281ms` / `60000ms`, and Redis degradation data-health HTTP
  `200`.
- Latest full `npm run check` passed with API unit `59` suites / `494` tests, web
  unit `11` suites / `149` tests, graph validation `328` nodes / `328` edges,
  pricing coverage `36` frontend families, progress verification `165` anchors,
  release readiness, handover, DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof smokes.
- `docs/operations/invoice-artifact-production-profile.example.json` and
  `docs/operations/evidence/aws-s3-retention-proof.example.json` now provide a
  sanitized artifact-governance profile plus provider proof fixture. The new
  `invoice:artifact-profile:check` command validates the external object-storage,
  KMS, scanner, delete-expired retention, signed receipt, audit webhook, provider
  object-lock, secret-reference-only, digest, and offline provider proof verifier
  posture as `verified(config-evidence)` while preserving the caveat that live
  cloud/Vault proof remains target-environment evidence. The progress verifier
  passed afterward with `175` anchors.
- Full `npm run check` passed afterward with the profile gate in the aggregate
  floor: API unit `59` suites / `494` tests, web unit `11` suites / `149` tests,
  graph validation `330` nodes / `330` edges, pricing coverage `36` frontend
  families, progress verification `175` anchors, release readiness, handover,
  DevOps/cloud/provider-credential gates, and invoice evidence/retention-proof/profile
  smokes.
- Invoice artifact staging rehearsal now adds a scanner webhook HMAC canary sender,
  a local receiver smoke with strict-bind mode, and a plan/live rehearsal
  orchestrator. The local plan validates the sanitized production profile and emits
  the exact live target-environment checklist for profile, strict provider
  credential, scanner webhook, notary webhook, and audit-export checks without
  reading Vault or calling external services. The progress verifier passed afterward
  with `189` anchors.
- Full `npm run check` passed afterward with the rehearsal gates in the aggregate
  floor: API unit `59` suites / `494` tests, web unit `11` suites / `149` tests,
  graph validation `330` nodes / `330` edges, pricing coverage `36` frontend
  families, progress verification `189` anchors, release readiness, handover,
  DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof/profile/rehearsal smokes.

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
- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
- `npm run typecheck --workspaces --if-present`
- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/config/config.schema.spec.ts`
- `npm run invoice:evidence:verify:smoke`

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

## Phase 2.42 - Provider Retention Proof Manifest

Status: implemented and verified locally on 2026-07-09.

Evidence added:

- `InvoiceArtifactBlobGovernance` now includes
  `invoice-artifact-provider-retention-proof/v1` with explicit
  `not-applicable`, `missing`, `declared`, and `provider-verified` status values.
- Evidence packet governance now records provider retention proof missing,
  declared, verified, and not-applicable counts, plus the
  `providerRetentionProofReady` production gate.
- The offline invoice evidence packet verifier checks proof-count consistency and
  rejects provider-control-plane evidence claims unless provider-verified proof
  includes a durable reference and SHA-256 digest.
- `provider:credentials:check`, `.env.example`, `DUMMY-VALUES.md`, and
  `docs/PROVIDER-CREDENTIALS.md` now document strict provider proof settings and
  operator-owned AWS/Azure/GCP control-plane capture examples.
- Focused API regression passed with 3 suites / 70 tests. Full `npm run check`
  passed with API 56 suites / 471 tests, web 11 suites / 147 tests, graph
  validation 322 nodes / 322 edges, pricing coverage, progress verification 153
  anchors, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green.

Honest boundary:

- This phase proves PolyCost can carry, aggregate, and verify provider retention
  proof manifests. It does not yet perform live provider control-plane proof
  capture for every cloud automatically, and it does not convert PolyCost into an
  invoice system of record.

## Phase 2.43 - Provider Retention Proof Artifact Verifier

Status: implemented and verified locally on 2026-07-09.

Evidence added:

- `npm run invoice:retention-proof:verify` verifies captured AWS S3, Azure Blob,
  and GCP Cloud Storage retention proof JSON files, computes the SHA-256 digest,
  checks optional expected digest input, and prints recommended runtime config for
  provider-control-plane proof mode.
- `npm run invoice:retention-proof:verify:smoke` covers valid AWS/Azure/GCP
  fixture proof files, digest mismatch failure, and missing-retention failure.
- The smoke is part of `npm run check`, and release-readiness anchors now require
  the verifier, smoke harness, docs command, and provider-specific validation
  strings.
- Full `npm run check` passed with API 56 suites / 471 tests, web 11 suites /
  147 tests, graph validation 322 nodes / 322 edges, pricing coverage, progress
  verification 153 anchors, QA/security suppression hygiene, DB, DevOps, cloud,
  release, handover, and provider-credential gates green.

Honest boundary:

- The verifier validates captured evidence structure and digest only. It does not
  call cloud APIs itself, prove chain of custody, or replace legal retention
  sufficiency review.

## Phase 2.44 - Provider Retention Proof Capture Planner

Status: implemented and verified locally on 2026-07-09.

Evidence added:

- `npm run invoice:retention-proof:capture-plan` accepts AWS S3, Azure Blob, and
  GCP Cloud Storage object URIs and emits provider CLI capture commands, proof
  file path, verifier command, durable proof reference, runtime config template,
  and an operator control checklist.
- `npm run invoice:retention-proof:capture-plan:smoke` covers AWS versioned S3
  object URIs, Azure Blob object URIs, GCP GCS object URIs, provider/URI mismatch
  failures, runtime config placeholders, and explicit no-overclaim fields.
- The planner smoke is wired into `npm run check`, and release-readiness anchors
  now require the planner, smoke harness, docs command, and provider-specific CLI
  command strings.
- Verification passed with `npm run invoice:retention-proof:capture-plan:smoke`,
  `npm run format:check`, `npm run ci:lint`, `npm run release:check`,
  `npm run progress:verify`, and full `npm run check`. The full run included API
  unit tests (56 suites, 471 tests), web unit tests (11 suites, 147 tests), graph
  validation (322 nodes, 322 edges), pricing coverage, progress verification (153
  anchors), QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates. Expected caveats remained: optional
  impeccable skipped on Node 20, live Postgres `schema_migrations` inspection was
  skipped because the container was not running, and local invoice artifact
  governance remains demo/default unless production object storage controls are
  configured.

Honest boundary:

- The planner creates an auditable command plan only. PolyCost still does not run
  cloud CLIs, receive cloud credentials, prove chain of custody, or replace legal
  retention sufficiency review.

## Phase 2.45 - Provider Retention Proof API Intake

Status: implemented and verified locally on 2026-07-09.

Evidence added:

- `PATCH /api/v1/billing/reconciliations/:id/artifacts/:artifactId/blob/provider-retention-proof`
  lets billing Owners/Admins attach offline verifier output to an externally
  stored invoice artifact.
- The endpoint rejects unstored artifacts, database-backed artifacts, invalid
  SHA-256 proof digests, and proof references that include query strings or
  fragments where signed URL/SAS/token material commonly appears.
- Artifact governance evidence is updated to `provider-verified` with
  `provider-control-plane` source, `provider-object-lock` retention mode, durable
  object-store pointer, proof reference, and proof digest.
- Evidence-packet governance now lets artifact-level provider-verified proof
  satisfy the provider-retention proof gate while preserving unrelated KMS,
  scanner, retention deletion, and audit gaps.
- Focused API coverage passed for successful proof attach and signed URL rejection;
  release-readiness guards now require the route, service method, audit action,
  docs anchor, and test anchors.
- Verification passed with focused API test
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  (52 tests), `npm run format:check`, `npm run ci:lint`, `npm run release:check`,
  `npm run progress:verify`, and full `npm run check`. The full run included API
  unit tests (56 suites, 474 tests), web unit tests (11 suites, 147 tests), graph
  validation (322 nodes, 322 edges), pricing coverage, progress verification (153
  anchors), QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates. Expected caveats remained: optional
  impeccable skipped on Node 20, live Postgres `schema_migrations` inspection was
  skipped because the container was not running, and local invoice artifact
  governance remains demo/default unless production object storage controls are
  configured.

Honest boundary:

- The intake endpoint persists proof metadata only. PolyCost still does not run
  cloud provider APIs, receive provider credentials for proof capture, prove full
  chain of custody, or replace legal retention sufficiency review.

## Phase 2.46 - Provider Retention Proof Row Persistence

Status: implemented and verified locally on 2026-07-09.

Evidence added:

- Migration `039_invoice_artifact_provider_retention_proof_persistence.sql`
  adds nullable provider-retention proof columns to `invoice_artifact_blobs`,
  enforces status/source/mode/reference/digest/caveat constraints, indexes
  persisted proof status, and refreshes the team audit action allow-list for the
  current invoice artifact/evidence actions.
- Fresh Docker database initialization and `scripts/db.mjs` validation now include
  migration `039`, closing the clean-clone schema drift between local migrations
  and first-run Postgres bootstrap.
- Artifact upload and proof attach persistence now write declared or
  provider-verified proof metadata to the exact artifact blob row, and
  `getInvoiceArtifactBlob` reconstructs externally stored rows as
  `provider-verified` when proof columns are present.
- Focused API/repository regressions prove successful service wiring, signed URL
  rejection, database-backed insert defaults, proof row update SQL, audit action
  persistence, and external blob readback.
- Verification passed with `npm run format`, focused API tests
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  (2 suites / 79 tests), `npm run db:validate`, and
  `npm run release:check`. Full `npm run check` passed with API 56 suites / 474
  tests, web 11 suites / 147 tests, graph validation 322 nodes / 322 edges,
  pricing coverage, progress verification 153 anchors, QA/security suppression
  hygiene, DB, DevOps, cloud, release, handover, and provider-credential gates.
  Expected caveats remained: optional impeccable skipped on Node 20, live DB
  `schema_migrations` inspection was skipped because the local Postgres container
  was not running, and local invoice artifact governance remains demo/default
  unless production object storage controls are configured.

Honest boundary:

- This phase closes the artifact-row/read-model persistence gap for attached
  proof metadata. PolyCost still does not execute provider control-plane proof
  capture, hold provider credentials, prove chain of custody, or replace legal
  retention sufficiency review.

## Phase 2.47 - Provider Retention Proof CLI Capture

Status: implemented and verified locally on 2026-07-09.

Evidence added:

- `npm run invoice:retention-proof:capture` can execute read-only provider CLI
  capture commands for AWS S3 Object Lock, Azure Blob immutability/legal hold,
  and GCP Cloud Storage object retention from an operator-authenticated shell.
- The command writes provider-native proof JSON under workspace-local
  `artifacts/`, computes the proof digest, and runs the existing offline verifier
  unless `--skip-verify` is supplied.
- Security controls include structured argument-array execution with `shell:
false`, workspace-local output enforcement, no credential arguments, dry-run
  preflight output, signed URL/SAS-style query rejection, fragment rejection, and
  explicit `providerCredentialsStoredByPolyCost: false` evidence.
- The existing capture planner now shares the signed-query/fragment rejection so
  command plans cannot echo temporary credential-bearing object URIs.
- `npm run invoice:retention-proof:capture:smoke` is wired into `npm run check`.
  It proves AWS/Azure/GCP dry-run command arrays, no cloud CLI execution in
  dry-run mode, provider credential non-storage, signed URI rejection, and
  workspace output guards.
- Verification passed with `npm run format`,
  `npm run invoice:retention-proof:capture:smoke`,
  `npm run invoice:retention-proof:capture-plan:smoke`,
  `npm run release:check`, and `npm run ci:lint`. Full `npm run check` passed
  with API 56 suites / 474 tests, web 11 suites / 147 tests, graph validation 322
  nodes / 322 edges, pricing coverage, progress verification 153 anchors,
  QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
  provider-credential gates. Expected caveats remained: optional impeccable
  skipped on Node 20, live DB `schema_migrations` inspection was skipped because
  the local Postgres container was not running, and local invoice artifact
  governance remains demo/default unless production object storage controls are
  configured.

Honest boundary:

- This phase moves proof capture from a manual command plan to an optional local
  operator-side CLI executor. PolyCost still does not store provider credentials,
  run managed server-side proof capture, prove full chain of custody, or replace
  legal retention sufficiency review.
