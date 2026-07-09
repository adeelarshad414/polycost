# PolyCost Production Readiness Report

Date: 2026-07-09
Branch: cumulative production-readiness branches through `codex/pricing-live-evidence-archive`
PR: local phase gate, PR created after verification
Run spec: `docs/design/master-production-readiness-orchestrator-v2.md`

## Verdict

PolyCost is stronger and locally release-checkable after this run, but not fully
production-ready in the strict v2 sense until the blocked items below are cleared.
The core OSS demo path remains `verified (mock)` where it depends on fixture-backed
cloud, LLM, SSO, or billing inputs.

## Customer Handover Addendum

The customer handover and production excellence pass added the canonical handover
package:

- `docs/HOW-TO-USE.md`
- `docs/DEPLOYMENT.md`
- `docs/RUNBOOK.md`
- `docs/COMPARISON.md`
- `docs/ARCHITECTURE.md`
- `docs/CUSTOMER-HANDOVER-LEDGER.md`

`npm run handover:check` now validates this package and is wired into `npm run
check`. The handover verdict is private-demo ready with explicit caveats for
invoice-grade billing, full Visio rendering, production LLM quality, enterprise
auth/team product depth, and full production landing-zone Terraform.

## Public OSS Readiness Addendum

The public OSS readiness and demo hardening pass added
`docs/development/public-demo-hardening.md` and the `npm run public:readiness:check`
gate. The gate verifies community files, public-launch honesty language, demo evidence
hooks, tracked environment-file safety, and provider-logo safeguards. It is wired into
the local `npm run check` floor and release-readiness validation.

The browser audit artifact pass added `npm run browser:audit` and
`docs/browser-audit/2026-07-08/`. The audit captures desktop, 320px reflow, and 200%
zoom-equivalent screenshots for executive and engineering states, plus machine-readable
checks for overflow, visible control names, image alt attributes, landmarks/headings,
keyboard focus, console errors, page errors, axe accessibility, and Lighthouse
performance/accessibility/best-practices/SEO metrics.

## Findings And Disposition

| ID             | Disposition   | Evidence                                                                                                                                                                                                                                                         |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-FMT-001     | Fixed         | `npm run check` initially failed on unformatted orchestrator docs; after formatting, `npm run format:check` and `npm run check` passed                                                                                                                           |
| P0-DOC-001     | Fixed         | Orchestrator docs moved from `docs/orchestrators/*` to requested `docs/design/*`                                                                                                                                                                                 |
| P0-SYNC-001    | Fixed         | `STATE-SYNC.md` created with product detection, CI state, phase classification, and gate register                                                                                                                                                                |
| P0-INV-001     | Fixed         | `THEME-INVENTORY.md` created with route/component inventory and P0 findings                                                                                                                                                                                      |
| TKN-001        | Fixed         | Token hex values isolated to `apps/web/src/styles/tokens.css`; `npm run theme:hex:check` passed                                                                                                                                                                  |
| TKN-002        | Fixed         | Added persisted `data-accent="default                                                                                                                                                                                                                            | terracotta"` axis, pre-hydration application, and Appearance control |
| TKN-003        | Fixed         | Added `theme:hex:check` script and CI workflow gate                                                                                                                                                                                                              |
| API-HEALTH-001 | Fixed         | Added additive `/health/live`, `/api/v1/health/live`, `/health/ready`, and `/api/v1/health/ready` endpoints                                                                                                                                                      |
| UI-ARCHIVE-001 | Fixed (smoke) | `docs/theme-audit/2026-07-07/` contains dark/light default screenshots and dark/light terracotta screenshots with token evidence                                                                                                                                 |
| CI-REMOTE-001  | Blocked       | GitHub Actions job `85608851518` for prior head showed `runner_id: 0`, empty runner name/group, `steps: []`; remote runner/account infra is not executing repo steps                                                                                             |
| INV-TRACE-002  | Improved      | Provider-export rows now persist `_polycost` source fingerprints/column coverage; reconciliation evidence reports coverage, match summary, readiness, and caveats                                                                                                |
| INV-TRACE-003  | Improved      | Azure Cost Management CSV and nested GCP Billing Export JSON now have focused mapper coverage, allocation tag/label recognition, and fallback-cost readiness evidence                                                                                            |
| INV-TRACE-004  | Improved      | Imported actuals now classify usage versus tax, credit, discount, support, marketplace, refund, fee, enterprise adjustment, and unknown adjustment rows; reconciliation evidence separates usage-comparable variance from non-usage invoice adjustments          |
| INV-TRACE-005  | Improved      | Commitment, reservation, and savings-plan rows now classify as covered usage, commitment discounts/negations, commitment fees, or amortization/unused commitment cost, with net commitment evidence in reconciliation summaries                                  |
| INV-TRACE-006  | Improved      | Commitment rows now report whether provider inventory, amortization-period proof, and allocation evidence are still required before invoice-grade interpretation                                                                                                 |
| INV-TRACE-007  | Improved      | Reconciliation evidence now includes an invoice-grade readiness matrix with present, partial, missing, and not-applicable checks, blockers, and required provider artifacts                                                                                      |
| INV-TRACE-008  | Improved      | Reconciliation evidence can now register invoice-grade artifact metadata, including provider invoice/control-total packets, private pricing, tax, commitment, allocation, currency, and SKU-map evidence without falsely marking it verified                     |
| INV-TRACE-009  | Improved      | Registered invoice artifacts can now be marked verified/rejected with review evidence, checksum/control-total mismatch rejection, verified counts, and readiness updates limited to the covered check                                                            |
| INV-TRACE-010  | Improved      | Registered invoice artifact files can now be stored in `invoice_artifact_blobs` with raw-byte SHA-256, size/MIME/file-name validation, metadata-only reconciliation evidence, and transaction-coupled audit events                                               |
| INV-TRACE-011  | Improved      | Stored invoice artifact files now carry storage-backend, KMS-readiness, retention/legal-hold, and scan-hook governance metadata; EICAR test content is blocked before bytes are stored                                                                           |
| INV-TRACE-012  | Improved      | Artifact storage readiness now has production-bound config guards, strict credential-check coverage, signed scanner webhook integration, and retention enforcement for expired non-held database-backed blobs                                                    |
| INV-TRACE-013  | Improved      | Provider-native artifact storage adapters now write/read invoice artifact bytes through AWS S3, Azure Blob Storage, and GCP Cloud Storage, persist object pointers, and checksum-verify external downloads                                                       |
| INV-TRACE-014  | Improved      | External artifact retention enforcement now purges S3, Azure Blob, and GCP Cloud Storage objects before deleting still-expired, non-held database pointers, with 404 treated as idempotent success                                                               |
| INV-TRACE-015  | Improved      | Stored invoice artifacts now have an Owner/Admin legal-hold PATCH operation that updates blob rows and reconciliation evidence together, emits audit events, and exposes place/release controls in the workspace panel                                           |
| INV-TRACE-016  | Improved      | Stored invoice artifacts now have an Owner/Admin review workflow with pending/approved/rejected states, review evidence metadata, aggregate review counts, audit events, and workspace send/approve/reject controls                                              |
| INV-TRACE-017  | Improved      | Stored invoice artifacts now have an Owner/Admin policy exception lifecycle with request/approve/reject states, future-expiry enforcement, computed expired status, aggregate counts, audit events, and workspace controls                                       |
| INV-TRACE-018  | Improved      | Stored and verified invoice artifacts can now run an audited control-packet validation comparing artifact control totals against both reconciliation totals and imported actuals, with matched/warning/mismatch counts                                           |
| INV-TRACE-019  | Improved      | Reconciliations can now emit metadata-only invoice evidence packets with sanitized artifact metadata, readiness, match summary, control counts, caveats, and invoice-grade disclaimers without exposing raw artifact bytes                                       |
| INV-TRACE-020  | Improved      | Invoice evidence packets now carry a stable-JSON SHA-256 integrity manifest with payload byte length, subject IDs, artifact counts, caveat/disclaimer counts, and digest metadata for reviewer recomputation                                                     |
| INV-TRACE-021  | Improved      | Downloaded invoice evidence packets can now be verified offline with a local CLI that recomputes the stable-JSON digest, validates subject/count metadata, and rejects tampered payloads                                                                         |
| INV-TRACE-022  | Improved      | Invoice evidence packets now include a digest-covered artifact governance manifest, and packet export plus artifact file download are recorded as team audit events with checksum, scanner, storage, retention, and governance-gap metadata                      |
| INV-TRACE-023  | Improved      | Invoice evidence packets now include receipt/notary metadata with optional HMAC-SHA256 signing, WORM posture checks, strict production config guards, provider-credential guard coverage, and receipt-aware offline verification                                 |
| INV-TRACE-024  | Improved      | External-webhook invoice evidence export now sends a signed notary/WORM handoff request, records sanitized accepted/failed delivery evidence in the receipt, recomputes packet integrity, and audits handoff status                                              |
| INV-TRACE-025  | Improved      | Invoice evidence notary receiver smoke commands now prove the HMAC receiver contract locally and against HTTPS staging receivers, with JSONL artifact capture and release-readiness documentation gates                                                          |
| INV-TRACE-026  | Improved      | A self-hostable notary reference receiver now verifies signed evidence handoffs, exposes health/readiness, writes append-only JSONL receipts, ships with Docker packaging, and has an end-to-end smoke harness                                                   |
| INV-TRACE-027  | Improved      | Provider retention proof verifier output can now be attached to exact externally stored invoice artifacts through an Owner/Admin API handoff with SHA-256 validation, signed URL rejection, evidence-packet gate updates, and audit logging                      |
| INV-TRACE-028  | Improved      | Attached provider retention proof metadata now persists on the exact `invoice_artifact_blobs` row, refreshes the artifact read model, extends clean Docker migrations through `039`, and release-gates the schema/audit action constraints                       |
| INV-TRACE-029  | Improved      | Provider retention proof capture can now run optional read-only AWS/Azure/GCP CLI commands from an operator-authenticated shell with dry-run, no-shell argument arrays, signed URI rejection, verifier handoff, and release-gated smoke coverage                 |
| INV-TRACE-030  | Improved      | Invoice artifact production-profile checks now validate sanitized external object-storage/KMS/scanner/WORM/receipt/audit evidence bundles, proof digest consistency, secret-reference-only posture, and offline provider proof verification                      |
| INV-TRACE-031  | Improved      | Invoice artifact staging rehearsal now packages profile, strict provider credential, scanner webhook, notary webhook, and audit-export checks into plan/live modes, with scanner HMAC canary proof and local strict-bind smoke evidence                          |
| INV-TRACE-032  | Improved      | Live rehearsal outputs now have a machine-verifiable evidence bundle contract, provider credential JSON output, sample-only schema proof, raw-secret guards, and a `--require-live` gate for target-environment attestation                                      |
| INV-TRACE-033  | Improved      | Phase 2.59 adds `npm run invoice:record:evidence:check`, a strict provider invoice-of-record pilot evidence contract for invoice control totals, billing export lineage, private pricing, adjustments, commitments, retention, notary, audit, and reviewer proof |
| INV-TRACE-034  | Improved      | Phase 2.64 adds `npm run invoice:record:pricing-lineage:smoke`, proving provider-invoice pilot evidence can bind invoice SKUs to pricing catalog snapshot digests, source record IDs, source payload hashes, and exact SKU match coverage                        |
| INV-TRACE-035  | Improved      | Phase 2.65 adds `npm run pricing:catalog:snapshot:check` and `npm run pricing:catalog:snapshot:smoke`, proving AWS/Azure/GCP catalog snapshot freshness, source payload hash coverage, and exact row-change comparison evidence                                  |
| INV-TRACE-036  | Improved      | Phase 2.66 adds `npm run pricing:catalog:snapshot:capture:plan` and guarded `npm run pricing:catalog:snapshot:capture -- --live`, giving operators a read-only AWS/Azure/GCP live catalog capture path with GCP credential checks and sanitized evidence output  |
| INV-TRACE-037  | Improved      | Phase 2.67 adds `npm run pricing:catalog:snapshot:capture:smoke`, replaying provider-native AWS/Azure/GCP fixtures through live capture normalizers without credentials while proving strict live-provider rejection for fixture evidence                        |
| INV-TRACE-038  | Improved      | Phase 2.68 adds `npm run pricing:catalog:snapshot:capture:preflight` and strict target-environment mode, checking live guard, reviewer, prior live evidence, GCP credential source, endpoints, and no-secret output posture before live capture                  |
| INV-TRACE-039  | Improved      | Phase 2.69 adds `npm run pricing:catalog:snapshot:capture:archive:check` and strict archive mode, binding live capture manifests to exact evidence file digests, preflight posture, capture metadata, provider coverage, and strict snapshot checker output      |
| VSDX-VIS-002   | Improved      | VSDX extraction now includes page size, normalized preview bounds, geometry hints, and an explicit layout-extraction caveat                                                                                                                                      |
| VSDX-VIS-003   | Improved      | VSDX parsing now emits sanitized approximate SVG visual previews from positioned page geometry, with browser display and explicit non-pixel-perfect caveats                                                                                                      |
| LLM-READY-002  | Improved      | Diagram LLM client now exposes readiness without calling the provider or reading secrets, keeping stub/unconfigured mode distinct from production-connected mode                                                                                                 |
| LLM-READY-003  | Improved      | Phase 2.57 adds a labeled Tier 3 diagram-classifier corpus, sanitized prediction evidence bundle, accuracy metrics, raw prompt/response exclusion checks, and a strict `--require-live-model` production evidence gate                                           |
| LLM-READY-004  | Improved      | Phase 2.60 adds `npm run diagram:llm-corpus:capture`, an operator-side sanitized evidence capture helper with sample smoke coverage, strict live-model mode, downstream checker handoff, and raw prompt/response/secret guards                                   |
| LLM-READY-005  | Improved      | Phase 2.61 adds `npm run diagram:llm-corpus:drift:check`, a monitored-baseline drift gate with accuracy-drop thresholds, high-confidence coverage checks, unreviewed mismatch failure, and sanitized false-positive register handling                            |
| LLM-READY-006  | Improved      | Phase 2.62 adds `npm run diagram:llm-corpus:drift:alert:check`, a sanitized drift alert evidence gate for signed/TLS receiver acceptance, owner/SLO policy, reviewer handoff metadata, and raw receiver URL/secret rejection                                     |
| LLM-READY-007  | Improved      | Phase 2.63 adds `npm run diagram:llm-corpus:drift:alert:smoke`, a local reference sender/receiver proof that generates live-model drift evidence, signs an alert envelope, archives a receiver receipt, and validates generated `staging-alert` evidence         |
| UI-AUTH-002    | Improved      | Workspace billing panel now surfaces reconciliation readiness, source-fingerprint coverage, SKU match coverage, and the invoice-of-record caveat                                                                                                                 |
| UI-AUTH-006    | Improved      | Workspace billing panel now surfaces usage-comparable variance plus invoice adjustment count, subtotal, and category summary for finance review                                                                                                                  |
| UI-AUTH-007    | Improved      | Workspace billing panel now surfaces commitment row count, net commitment cost, and commitment category totals separately from generic invoice adjustments                                                                                                       |
| UI-AUTH-008    | Improved      | Workspace billing panel now surfaces commitment evidence requirements for provider inventory, amortization periods, and allocation proof                                                                                                                         |
| UI-AUTH-009    | Improved      | Workspace billing panel now surfaces invoice-grade readiness status, missing/partial counts, and top blockers for finance review                                                                                                                                 |
| UI-AUTH-010    | Improved      | Workspace billing panel now exposes an Owner/Admin artifact-registration action and shows registered/verified counts plus the "metadata registered, not verified" caveat                                                                                         |
| UI-AUTH-011    | Improved      | Workspace billing panel now exposes artifact verification after registration and refreshes verified counts without removing unrelated invoice-grade blockers                                                                                                     |
| UI-AUTH-012    | Improved      | Workspace billing panel now exposes store/download actions for registered invoice artifact files and verifies against the stored checksum when present                                                                                                           |
| UI-AUTH-013    | Improved      | Workspace billing panel now surfaces stored-artifact governance status: scan result, retention date, legal-hold state, and KMS production-readiness                                                                                                              |
| UI-AUTH-014    | Improved      | Workspace billing panel now surfaces artifact review status, reviewer evidence, and pending/approved/rejected review counts with guarded review actions for stored files                                                                                         |
| UI-AUTH-015    | Improved      | Workspace billing panel now surfaces policy exception status, reviewer, expiry, and requested/approved/rejected/expired counts with guarded exception actions for stored files                                                                                   |
| UI-AUTH-016    | Improved      | Workspace billing panel now surfaces invoice control validation status, reconciliation/import deltas, period match state, validation timestamp, and a guarded validation action for stored verified artifacts                                                    |
| UI-AUTH-017    | Improved      | Workspace billing panel can now download a reviewer-ready invoice evidence JSON packet for the active reconciliation while keeping stored artifact byte downloads separate                                                                                       |
| UI-AUTH-018    | Improved      | Workspace evidence-packet downloads now include the packet digest prefix in the generated file name and completion notice                                                                                                                                        |
| UI-AUTH-019    | Improved      | Workspace Team access now exposes SCIM provisioning posture, one-time token creation, token revocation, token metadata, and provisioned-user visibility through session-authenticated admin APIs                                                                 |
| IAM-SCIM-001   | Improved      | SCIM now exposes bearer-protected `/Schemas` and `/ResourceTypes` discovery endpoints, representative Okta/Entra fixtures, and an operator onboarding guide while preserving the non-certification boundary                                                      |
| IAM-SCIM-002   | Improved      | Live verification now records a sanitized `scim-provisioning-lifecycle` journey for token creation, metadata-only token listing, bearer-protected discovery, user create/list/admin readback/deactivate, token revocation, and revoked-token denial              |
| IAM-IDP-001    | Improved      | Phase 2.58 adds `npm run enterprise:idp:evidence:check`, a machine-verifiable enterprise IdP pilot evidence contract with strict `--require-managed-idp` mode while preserving the formal SCIM/OIDC/SAML certification boundary                                  |
| OPS-E2E-002    | Improved      | Compose E2E now runs with isolated project names, dynamic host-port allocation, wildcard bind probing, owned-stack API/web origin wiring, and latest local proof across API E2E, web Playwright, live verification, SCIM, and Redis degradation                  |
| API-DI-001     | Improved      | Function-backed optional runtime collaborators now use explicit optional injection tokens, with a production-readiness metadata guard preventing Nest container boot regressions                                                                                 |
| UI-AUTH-003    | Improved      | Active workspace switching is now backend-backed, membership-checked, and exposed in the signed-in account panel                                                                                                                                                 |
| UI-AUTH-004    | Improved      | Pending/expired workspace invites can now be resent through a guarded backend route that rotates the stored token hash and exposes the refreshed one-time token only in the response                                                                             |
| UI-AUTH-005    | Improved      | Invite delivery now has local panel mode plus production HTTPS webhook mode with HMAC signatures, production config guards, and browser-safe delivery receipts                                                                                                   |
| AUD-EXP-001    | Improved      | Audit export now has local HMAC receiver proof and a staging canary sender for SIEM/WORM acceptance evidence                                                                                                                                                     |
| TF-GEN-001     | Added         | V3 Terraform generation endpoint and UI panel now generate AWS/Azure/GCP starter bundles from NWS with provider pinning, remote-state examples, static checks, and explicit caveats                                                                              |
| TF-GEN-002     | Improved      | V3.1 hardening adds generation profiles, private database networking checks, runtime identity baselines, policy/test/Makefile artifacts, and module-boundary documentation                                                                                       |
| TF-GEN-003     | Improved      | V3.2 assurance adds generated CAF/WAF/Terraform framework-alignment evidence and topology-aware public/private ingress/load-balancer controls                                                                                                                    |
| TF-GEN-004     | Improved      | V3.3 adds downloadable Terraform ZIP export, bundle manifest hash evidence, generated validation runner, and frontend ZIP/evidence download actions                                                                                                              |
| TF-GEN-005     | Improved      | V3.4 replaces Terraform module placeholders with AWS/Azure/GCP network, compute, and data starter modules plus static module-library validation                                                                                                                  |
| TF-GEN-006     | Improved      | V3.5 adds credential-free Terraform bundle manifest verification and tamper-detection evidence before provider-authenticated validation                                                                                                                          |
| TF-GEN-007     | Improved      | V3.6 adds a machine-verifiable Terraform destination-plan evidence contract for manifest integrity, validation output, plan summary, policy, remote-state posture, tag evidence, and operator attestations                                                       |
| TF-GEN-008     | Improved      | V3.7 adds an operator-side Terraform destination evidence capture helper that assembles V3.6 evidence from manifest, validation, plan, policy, lockfile, remote-state, and tag artifacts, then verifies strict destination-plan evidence in smoke mode           |
| VSDX-VIS-004   | Improved      | Phase 2.56 adds `npm run vsdx:visual-evidence:check`, a machine-verifiable VSDX preview evidence contract that proves approximate SVG/layout-extraction evidence while preserving the no-full-Visio-rendering boundary                                           |
| HND-001        | Added         | Customer handover package added under `docs/`, with usage, deployment, runbook, competitive comparison, architecture, and evidence ledger                                                                                                                        |
| HND-002        | Added         | `npm run handover:check` validates the handover package and runs inside the full local `npm run check` floor                                                                                                                                                     |
| OSS-001        | Added         | `npm run public:readiness:check` validates public-readiness docs, community health files, demo evidence hooks, tracked env-file safety, and provider-logo safeguards                                                                                             |
| AUD-001        | Added         | `npm run browser:audit` produces browser audit artifacts for desktop, 320px reflow, and 200% zoom-equivalent scenarios                                                                                                                                           |
| AUD-002        | Fixed         | `npm run browser:audit` now runs formal `axe-core` and Node-20-compatible Lighthouse 12 checks; latest artifact passed with zero axe violations and Lighthouse scores 1.00/1.00/1.00/0.92                                                                        |

## Verification

Local static/regression gates:

- `npm run format:check` passed.
- `npm run ci:lint` passed with zero ESLint warnings.
- `npm run theme:hex:check` passed.
- `npm run check` passed.
- Phase 2.54 invoice artifact staging rehearsal gates passed:
  - `node --check` passed for the scanner webhook smoke, scanner local smoke, and
    staging rehearsal scripts.
  - `npm run invoice:artifact-scanner:smoke:local` passed with a structured
    `invoice-artifact-scanner-local-smoke/v1` skip in this sandbox because local TCP
    bind is blocked; strict mode turns that into a failure where local listeners are
    expected.
  - `npm run invoice:artifact-rehearsal:plan -- --json` passed and emitted the live
    target-environment checklist for profile, strict provider credentials, scanner
    webhook, notary webhook, and audit-export smokes.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11` suites
    / `149` tests, graph validation `330` nodes / `330` edges, pricing coverage
    `36` frontend families, progress verification `189` anchors, and the new
    invoice artifact rehearsal gates in the aggregate floor.
- Phase 2.55 rehearsal evidence bundle verification gates passed:
  - `node --check` passed for the provider credential checker, evidence bundle
    checker, and staging rehearsal script.
  - `npm run provider:credentials:check -- --json` passed with the new
    `polycost-provider-credential-check/v1` output and the expected non-strict
    local/demo invoice-artifacts warning.
  - `npm run invoice:artifact-rehearsal:evidence:check -- --json` passed against
    the sanitized `example-schema` bundle with live evidence still required.
  - `npm run invoice:artifact-rehearsal:evidence:check -- --require-live --json`
    failed as intended for the sample bundle because it is not live target evidence.
  - `npm run release:check` passed and `npm run progress:verify` passed with `203`
    anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11` suites
    / `149` tests, graph validation `331` nodes / `331` edges, pricing coverage
    `36` frontend families, progress verification `203` anchors, and the new
    evidence bundle gate in the aggregate floor.
- Phase 2.56 VSDX visual evidence verification gates passed:
  - `node --check scripts/vsdx-visual-evidence-check.mjs` passed.
  - `npm run vsdx:visual-evidence:check -- --json` passed against the sanitized
    `example-schema` bundle with `verifiedExampleSchema=true`.
  - `npm run vsdx:visual-evidence:check -- --require-human-review --json` failed as
    intended for the sample bundle because it is not human-reviewed preview
    evidence.
  - `npm run release:check` passed and `npm run progress:verify` passed with `232`
    anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `335` nodes / `335` edges, pricing
    coverage `36` frontend families, progress verification `232` anchors, and the
    new VSDX evidence gate in the aggregate floor.
- Phase 2.57 diagram LLM corpus evidence gates passed:
  - `node --check scripts/diagram-llm-corpus-check.mjs` passed.
  - `npm run diagram:llm-corpus:check -- --json` passed against the sanitized
    `example-schema` bundle with `12` cases, `categoryAccuracy=1`,
    `serviceTypeAccuracy=1`, and `verifiedExampleSchema=true`.
  - `npm run diagram:llm-corpus:check -- --require-live-model --json` failed as
    intended for the sample bundle because it is not production endpoint/model
    evidence.
  - `npm run release:check` passed and `npm run progress:verify` passed with `250`
    anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `337` nodes / `337` edges, pricing
    coverage `36` frontend families, progress verification `250` anchors, and the
    new diagram LLM corpus gate in the aggregate floor.
- Phase 2.60 diagram LLM evidence capture gates passed:
  - `node --check scripts/diagram-llm-corpus-evidence-capture.mjs` passed.
  - `npm run diagram:llm-corpus:capture:smoke -- --json` passed against the
    sanitized `example-schema` capture profile with `12` predictions,
    `categoryAccuracy=1`, `serviceTypeAccuracy=1`, `verifiedExampleCapture=true`,
    and `verifiedLiveCapture=false`.
  - `npm run diagram:llm-corpus:capture -- --require-live-model --json` failed as
    intended for the sample capture profile because it is not production
    endpoint/model/Vault/operator evidence.
  - `npm run diagram:llm-corpus:capture -- --require-live-model --profile .tmp/diagram-llm-live-capture-profile.json --output .tmp/diagram-llm-live-evidence.json --json`
    passed against a generated temporary live-model-shaped bundle with
    `verifiedLiveCapture=true`.
  - `npm run format:check`, `npm run release:check`, and `npm run progress:verify`
    passed; progress verification reports `315` anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `352` nodes / `352` edges, pricing
    coverage `36` frontend families, progress verification `315` anchors, and the
    new diagram LLM capture smoke in the aggregate floor.
- Phase 2.61 diagram LLM drift monitoring gates passed:
  - `node --check scripts/diagram-llm-corpus-drift-check.mjs` passed.
  - `npm run diagram:llm-corpus:drift:check -- --json` passed against the
    sanitized `example-schema` drift profile with `mismatchCount=0`,
    `unreviewedMismatchCount=0`, and `verifiedExampleDriftCheck=true`.
  - `npm run diagram:llm-corpus:drift:check -- --require-live-model --json`
    failed as intended for the sample profile because it is not production
    endpoint/model/Vault/drift-review evidence.
  - `npm run diagram:llm-corpus:drift:check -- --require-live-model --profile .tmp/diagram-llm-live-drift-profile.json --json`
    passed against a generated temporary live-model-shaped bundle with
    `verifiedLiveModelDrift=true`.
  - `npm run diagram:llm-corpus:drift:check -- --evidence .tmp/diagram-llm-drift-mismatch-evidence.json --json`
    failed as intended with one unreviewed mismatch.
  - `npm run diagram:llm-corpus:drift:check -- --profile .tmp/diagram-llm-drift-reviewed-profile.json --json`
    passed once that mismatch was tracked in the sanitized false-positive register.
  - `npm run format:check`, `npm run release:check`, and `npm run progress:verify`
    passed; progress verification reports `331` anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `354` nodes / `354` edges, pricing
    coverage `36` frontend families, progress verification `331` anchors, and the
    new diagram LLM drift monitor in the aggregate floor.
- Phase 2.62 diagram LLM drift alert evidence gates passed:
  - `node --check scripts/diagram-llm-drift-alert-evidence-check.mjs` passed.
  - `npm run diagram:llm-corpus:drift:alert:check -- --json` passed against the
    sanitized `example-schema` alert bundle with `verifiedExampleSchema=true`.
  - `npm run diagram:llm-corpus:drift:alert:check -- --require-staging-alert --json`
    failed as intended for the sample bundle because it is not signed/TLS
    receiver acceptance evidence.
  - `npm run diagram:llm-corpus:drift:alert:check -- --require-staging-alert .tmp/diagram-llm-drift-alert-staging-evidence.json --json`
    passed against a generated temporary staging-shaped bundle with
    `verifiedStagingAlert=true`.
  - `npm run diagram:llm-corpus:drift:alert:check -- .tmp/diagram-llm-drift-alert-raw-url-evidence.json --json`
    failed as intended when raw receiver URL material was injected.
  - `npm run format:check`, `npm run release:check`, and `npm run progress:verify`
    passed; progress verification reports `347` anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `356` nodes / `356` edges, pricing
    coverage `36` frontend families, progress verification `347` anchors, and the
    new diagram LLM drift alert gate in the aggregate floor.
- Phase 2.63 diagram LLM drift alert sender/receiver smoke gates passed:
  - `node --check scripts/diagram-llm-drift-alert-reference-receiver-smoke.mjs`
    passed.
  - `npm run diagram:llm-corpus:drift:alert:smoke -- --captured-at 2026-07-09T00:00:00.000Z --json`
    passed, generating sanitized live-model drift evidence, a signed alert
    envelope, a local reference receiver receipt, and strict `staging-alert`
    evidence with `verifiedStagingAlert=true`.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `356` nodes / `356` edges, pricing
    coverage `36` frontend families, progress verification `359` anchors, and the
    new diagram LLM drift alert sender/receiver smoke in the aggregate floor.
- Phase 2.58 enterprise IdP pilot evidence gates passed:
  - `node --check scripts/enterprise-idp-pilot-evidence-check.mjs` passed.
  - `npm run enterprise:idp:evidence:check -- --json` passed against the sanitized
    `example-schema` bundle with `verifiedExampleSchema=true`,
    `verifiedManagedIdpPilot=false`, `journeyCount=5`, and
    `requiredAuditActionCount=5`.
  - `npm run enterprise:idp:evidence:check -- --require-managed-idp --json`
    failed as intended for the sample bundle because it is not real managed IdP
    evidence.
  - `npm run enterprise:idp:evidence:check -- --require-managed-idp .tmp/enterprise-idp-managed-evidence.json --json`
    passed against a generated temporary managed-pilot-shaped bundle with
    `verifiedManagedIdpPilot=true`.
  - `npm run release:check` passed and `npm run progress:verify` passed with `281`
    anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `347` nodes / `347` edges, pricing
    coverage `36` frontend families, progress verification `281` anchors, and the
    new enterprise IdP evidence gate in the aggregate floor.
- Phase 2.59 invoice-of-record pilot evidence gates passed:
  - `node --check scripts/invoice-of-record-pilot-evidence-check.mjs` passed.
  - `npm run invoice:record:evidence:check -- --json` passed against the sanitized
    `example-schema` bundle with `verifiedExampleSchema=true`,
    `verifiedProviderInvoicePilot=false`, `requiredControlCount=12`, and
    `nonUsageCategoryCount=7`.
  - `npm run invoice:record:evidence:check -- --require-provider-invoice --json`
    failed as intended for the sample bundle because it is not provider invoice
    proof.
  - `npm run invoice:record:evidence:check -- --require-provider-invoice .tmp/invoice-of-record-provider-evidence.json --json`
    passed against a generated temporary production-shaped bundle with
    `verifiedProviderInvoicePilot=true`.
  - `npm run release:check` passed and `npm run progress:verify` passed with `296`
    anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `349` nodes / `349` edges, pricing
    coverage `36` frontend families, progress verification `296` anchors, and the
    new invoice-of-record evidence gate in the aggregate floor.
- Phase 2.64 invoice pricing lineage evidence smoke gates passed:
  - `node --check scripts/invoice-of-record-pricing-lineage-smoke.mjs` passed.
  - `node --check scripts/invoice-of-record-pilot-evidence-check.mjs` passed.
  - `node scripts/invoice-of-record-pricing-lineage-smoke.mjs --json` passed with
    `invoiceSkuCount=3`, `matchedSkuCount=3`, `catalogSourceRecordCount=3`, and
    `verifiedProviderInvoicePilot=true`.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `356` nodes / `356` edges, pricing
    coverage `36` frontend families, progress verification `371` anchors, and the
    new invoice pricing-lineage smoke in the aggregate floor.
- Phase 2.65 pricing catalog snapshot evidence gates passed:
  - `node --check scripts/pricing-catalog-snapshot-evidence-check.mjs` passed.
  - `node --check scripts/pricing-catalog-snapshot-smoke.mjs` passed.
  - `node scripts/pricing-catalog-snapshot-evidence-check.mjs --json` passed
    against the sanitized `example-schema` sample.
  - `node scripts/pricing-catalog-snapshot-smoke.mjs --json` passed with
    `providerCount=3`, `changedRowCount=3`, `priceChangedSkuCount=3`, and
    `verifiedProviderSnapshot=true`.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `358` nodes / `358` edges, pricing
    coverage `36` frontend families, progress verification `394` anchors, and the
    new pricing catalog snapshot checks in the aggregate floor.
- Phase 2.66 live catalog snapshot capture guard gates passed:
  - `node --check scripts/pricing-catalog-live-snapshot-capture.mjs` passed.
  - `npm run pricing:catalog:snapshot:capture:plan -- --json` passed with
    read-only AWS Price List, Azure Retail Prices, and GCP Cloud Billing capture
    plans plus `POLYCOST_LIVE_PRICING_SNAPSHOT_CAPTURE=true` guard evidence.
  - `npm run pricing:catalog:snapshot:check -- --require-live-provider docs/operations/evidence/pricing-catalog-snapshot/pricing-catalog-snapshot.example.json --json`
    failed as intended because the checked-in sample is not live-provider
    evidence.
  - `npm run release:check` and `npm run progress:verify` passed with the live
    capture plan anchored in the aggregate floor.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `358` nodes / `358` edges, pricing
    coverage `36` frontend families, progress verification `400` anchors, and
    the live catalog snapshot capture plan in the aggregate floor.
- Phase 2.67 live catalog capture fixture smoke gates passed:
  - `node --check scripts/pricing-catalog-live-snapshot-capture.mjs` passed.
  - `node --check scripts/pricing-catalog-live-snapshot-capture-smoke.mjs`
    passed.
  - `node scripts/pricing-catalog-live-snapshot-capture-smoke.mjs --json`
    passed with `providerCount=3`, `changedRowCount=3`,
    `priceChangedSkuCount=3`, `verifiedProviderSnapshot=true`,
    `verifiedLiveProviderSnapshot=false`, and
    `strictLiveRejectedFixtureEvidence=true`.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `358` nodes / `358` edges, pricing
    coverage `36` frontend families, progress verification `406` anchors, and
    the live capture fixture smoke in the aggregate floor.
- Phase 2.68 live catalog capture readiness preflight gates passed:
  - `node --check scripts/pricing-catalog-live-snapshot-capture-preflight.mjs`
    passed.
  - `node scripts/pricing-catalog-live-snapshot-capture-preflight.mjs --json`
    passed in local advisory mode with `readyForLiveCapture=false`,
    `warningCount=4`, and no failures.
  - `node scripts/pricing-catalog-live-snapshot-capture-preflight.mjs --strict-live --json`
    failed as intended in local mode because live guard, operator, prior live
    evidence, and GCP credential source are not configured.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `358` nodes / `358` edges, pricing
    coverage `36` frontend families, progress verification `413` anchors, and
    the advisory preflight in the aggregate floor. Expected caveats remained:
    local invoice artifact scanner smoke skipped because TCP bind is blocked in
    this sandbox, `impeccable` is skipped on the repo's Node 20 target, live
    Postgres migrations were skipped because the local Postgres container was
    not running, and provider credential checks still warn that invoice-artifact
    governance is demo/local without live object-storage/KMS/scanner/WORM
    settings.
- Phase 2.69 live catalog capture archive proof gates passed:
  - `node --check scripts/pricing-catalog-live-capture-archive-check.mjs`
    passed.
  - `node scripts/pricing-catalog-live-capture-archive-check.mjs --json`
    passed against the checked-in sample with `verifiedExampleArchive=true`,
    `verifiedLiveCaptureArchive=false`, and digest
    `86aec3dd0cfa0a5f2358b4f98459ef8cf37eeb4c1df37b50d725defcaece668c`.
  - `node scripts/pricing-catalog-live-capture-archive-check.mjs --require-live-archive --json`
    failed as intended because the sample archive is not live-provider capture
    proof and the referenced sample snapshot evidence does not pass
    `--require-live-provider`.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `359` nodes / `359` edges, pricing
    coverage `36` frontend families, progress verification `423` anchors, and
    the archive checker in the aggregate floor. Expected caveats remained:
    local invoice artifact scanner smoke skipped because TCP bind is blocked in
    this sandbox, `impeccable` is skipped on the repo's Node 20 target, live
    Postgres migrations were skipped because the local Postgres container was
    not running, and provider credential checks still warn that invoice-artifact
    governance is demo/local without live object-storage/KMS/scanner/WORM
    settings.
- Phase 2.19 invoice adjustment evidence focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts`: 1 suite / 23 tests.
  - Web focused: `src/App.spec.tsx`: 1 suite / 60 tests.
- Phase 2.20 commitment billing semantics focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts`: 1 suite / 24 tests.
  - Web focused: `src/App.spec.tsx`: 1 suite / 60 tests.
- Phase 2.21 commitment amortization evidence focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts`: 1 suite / 24 tests.
  - Web focused: `src/App.spec.tsx`: 1 suite / 60 tests.
- Phase 2.22 invoice-grade readiness matrix focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts`: 1 suite / 24 tests.
  - Web focused: `src/App.spec.tsx`: 1 suite / 60 tests.
- Phase 2.23 invoice artifact registration focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 49 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
- Phase 2.24 invoice artifact verification focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 51 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
- Phase 2.25 invoice artifact blob storage focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 54 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
  - `npm run format:check`: passed.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors.
- Phase 2.26 invoice artifact governance metadata focused gates passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 55 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
- Phase 2.26 final local floor passed:
  - `npm run test:production-readiness`: API 12 suites / 166 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 431 tests; web 11 suites / 143 tests; graph
    validation 316 nodes / 316 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.27 artifact storage readiness and retention gates passed:
  - API focused: `src/api/invoice-artifact-governance.service.spec.ts`,
    `src/api/auth-billing.spec.ts`, `src/api/api-database.repository.spec.ts`, and
    `src/config/config.schema.spec.ts`: 4 suites / 78 tests.
  - Web focused: `src/api-client.spec.ts` and `src/App.spec.tsx`: 2 suites /
    86 tests.
  - `npm run ci:lint`: passed with zero warnings/errors.
  - `npm run provider:credentials:check`: passed with the expected local/demo
    invoice-artifacts warning.
  - `npm run provider:credentials:check:strict`: passed when production
    artifact storage/KMS/scanner/retention env values were supplied.
  - `npm run test:production-readiness`: API 13 suites / 175 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 54 suites / 440 tests; web 11 suites / 143 tests; graph
    validation 318 nodes / 318 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.28 provider artifact storage adapter gates passed:
  - API focused: `src/api/invoice-artifact-storage.service.spec.ts`,
    `src/api/auth-billing.spec.ts`, `src/api/api-database.repository.spec.ts`, and
    `src/api/invoice-artifact-governance.service.spec.ts`: 4 suites / 72 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors.
  - `npm run provider:credentials:check`: passed with the expected local/demo
    invoice-artifacts warning.
  - `npm run test:production-readiness`: API 14 suites / 182 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 55 suites / 448 tests; web 11 suites / 143 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.29 external artifact retention deletion focused gate passed:
  - API focused: `src/api/invoice-artifact-storage.service.spec.ts`,
    `src/api/auth-billing.spec.ts`, `src/api/api-database.repository.spec.ts`, and
    `src/api/invoice-artifact-governance.service.spec.ts`: 4 suites / 78 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors.
  - `npm run test:production-readiness`: API 14 suites / 187 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 55 suites / 454 tests; web 11 suites / 143 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.30 artifact legal-hold administration focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 66 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    86 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors.
  - `npm run test:production-readiness`: API 14 suites / 189 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 55 suites / 456 tests; web 11 suites / 143 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target.
- Phase 2.31 invoice artifact review workflow focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 69 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    87 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors or warnings.
  - `npm run test:production-readiness`: API 14 suites / 192 tests; web 2 suites /
    87 tests.
  - `npm run check`: API 55 suites / 459 tests; web 11 suites / 144 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target.
- Phase 2.32 artifact policy exception lifecycle focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 72 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    88 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors or warnings.
  - `npm run test:production-readiness`: API 14 suites / 195 tests; web 2 suites /
    88 tests.
  - `npm run check`: API 55 suites / 462 tests; web 11 suites / 145 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target.
- Phase 2.33 invoice control packet validation focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 74 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    89 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors or warnings.
  - `npm run test:production-readiness`: API 14 suites / 197 tests; web 2 suites /
    89 tests.
  - `npm run check`: API 55 suites / 464 tests; web 11 suites / 146 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target; DB validation skipped live
    `schema_migrations` inspection because the local Postgres container was not
    running.
- Phase 2.34 invoice evidence packet export focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 75 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    90 tests.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors or warnings.
  - `npm run test:production-readiness`: API 14 suites / 198 tests; web 2 suites /
    90 tests.
  - `npm run check`: API 55 suites / 465 tests; web 11 suites / 147 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target; DB validation skipped live
    `schema_migrations` inspection because the local Postgres container was not
    running.
- Phase 2.35 invoice evidence packet integrity focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/api/api-database.repository.spec.ts`: 2 suites / 75 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    90 tests.
  - `npm run format:check`: passed.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors or warnings.
  - `npm run test:production-readiness`: API 14 suites / 198 tests; web 2 suites /
    90 tests.
  - `npm run check`: API 55 suites / 465 tests; web 11 suites / 147 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target; DB validation skipped live
    `schema_migrations` inspection because the local Postgres container was not
    running.
- Phase 2.36 invoice evidence packet verifier CLI smoke passed:
  - `npm run invoice:evidence:verify -- --help`: passed.
  - `npm run invoice:evidence:verify -- --version`: passed.
  - `npm run invoice:evidence:verify:fixture -- --json`: passed with digest
    `951039068994605be9582aaf06465cd09c92b3fa692a61d1da55e1a8cf6a845b`.
  - Tampered temp packet smoke changed `reconciliation.invoicedTotalUsd` and the
    verifier rejected it with a digest mismatch.
  - `npm run invoice:evidence:verify:smoke`: passed.
  - `npm run check`: API 55 suites / 465 tests; web 11 suites / 147 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed with the verifier smoke included in the
    regression floor.
- Phase 2.37 invoice artifact governance audit manifest focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts`: 1 suite / 48 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    90 tests.
  - `npm run typecheck --workspaces --if-present`: passed.
  - `npm run test:production-readiness`: API 14 suites / 198 tests; web 2 suites /
    90 tests.
  - `npm run check`: API 55 suites / 465 tests; web 11 suites / 147 tests; graph
    validation 320 nodes / 320 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed. `npm run impeccable` remained the expected
    Node 24 skip under the repo's Node 20 target; DB validation skipped live
    `schema_migrations` inspection because the local Postgres container was not
    running.
- Phase 2.38 invoice evidence receipt and WORM posture focused gate passed:
  - API focused: `src/api/auth-billing.spec.ts` and
    `src/config/config.schema.spec.ts`: 2 suites / 64 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites /
    90 tests.
  - `npm run typecheck --workspaces --if-present`: passed.
  - `npm run invoice:evidence:verify:smoke`: passed with receipt-aware verifier.
  - `npm run provider:credentials:check`: passed with the expected local/demo
    invoice-artifacts warning expanded to include metadata-only evidence receipts
    and missing WORM retention mode.
  - Full `npm run check`: passed with API 55 suites / 467 tests, web 11 suites /
    147 tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
    verification 153 anchors, QA/security suppression hygiene, DB, DevOps, cloud,
    release, handover, and provider-credential gates. `npm run impeccable` remained
    the expected Node 24 skip under the repo's Node 20 target; DB validation skipped
    live `schema_migrations` inspection because the local Postgres container was
    not running.
- Phase 2.39 invoice evidence notary API handoff focused gate passed:
  - API focused: `src/api/invoice-evidence-notary.service.spec.ts` and
    `src/api/auth-billing.spec.ts`: 2 suites / 52 tests.
  - `npm run typecheck --workspaces --if-present`: passed.
  - `npm run invoice:evidence:verify:smoke`: passed with API handoff-aware verifier.
  - `npm run provider:credentials:check`: passed with the expected local/demo
    invoice-artifacts warning.
  - `npm run test:production-readiness`: API 14 suites / 200 tests; web 2 suites /
    90 tests.
  - Full `npm run check`: passed with API 56 suites / 470 tests, web 11 suites /
    147 tests, graph validation 322 nodes / 322 edges, pricing coverage, progress
    verification 153 anchors, QA/security suppression hygiene, DB, DevOps, cloud,
    release, handover, and provider-credential gates. `npm run impeccable` remained
    the expected Node 24 skip under the repo's Node 20 target; DB validation skipped
    live `schema_migrations` inspection because the local Postgres container was
    not running.
- Phase 2.40 invoice evidence notary receiver smoke focused gate passed:
  - `npm run invoice:evidence:notary:smoke:local`: passed with one accepted
    signed handoff, zero rejected events, and local JSONL artifact capture under
    `artifacts/invoice-evidence-notary-smoke/`.
  - The staging command `npm run invoice:evidence:notary:smoke` is release-gated
    and documented for HTTPS receivers with non-dummy signing secrets; live
    staging execution remains operator-environment evidence.
  - Full `npm run check`: passed with API 56 suites / 470 tests, web 11 suites /
    147 tests, graph validation 322 nodes / 322 edges, pricing coverage, progress
    verification 153 anchors, QA/security suppression hygiene, DB, DevOps, cloud,
    release, handover, and provider-credential gates. `npm run impeccable` remained
    the expected Node 24 skip under the repo's Node 20 target; DB validation skipped
    live `schema_migrations` inspection because the local Postgres container was
    not running.
- Phase 2.41 notary reference receiver staging path focused gate passed:
  - `npm run invoice:evidence:notary:receiver:smoke`: passed. The harness started
    the self-hostable reference receiver, verified `/health/ready`, sent the
    existing signed webhook canary through it, and confirmed a JSONL receipt was
    appended under `artifacts/invoice-evidence-notary-reference-receiver/`.
  - Captured packet digest:
    `1bb1abec466eda604ebb949acf7e40e8b0385cdcff1445ecac2d691736550ea0`.
  - `docker build -f docker/notary-receiver/Dockerfile -t
polycost/notary-reference-receiver:local .`: passed.
  - The reference receiver deliberately reports `immutableRetentionProved: false`;
    real WORM/object-lock proof remains operator-environment evidence.
  - Full `npm run check`: passed with API 56 suites / 470 tests, web 11 suites /
    147 tests, graph validation 322 nodes / 322 edges, pricing coverage, progress
    verification 153 anchors, QA/security suppression hygiene, DB, DevOps, cloud,
    release, handover, and provider-credential gates. `npm run impeccable` remained
    the expected Node 24 skip under the repo's Node 20 target; DB validation skipped
    live `schema_migrations` inspection because the local Postgres container was
    not running.
- Phase 2.25 final local floor passed:
  - `npm run test:production-readiness`: API 12 suites / 165 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 429 tests; web 11 suites / 143 tests; graph
    validation 316 nodes / 316 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.24 final local floor passed:
  - `npm run format:check`: passed.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors.
  - `npm run test:production-readiness`: API 12 suites / 162 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 426 tests; web 11 suites / 143 tests; graph
    validation 316 nodes / 316 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.23 final local floor passed:
  - `npm run format:check`: passed.
  - `npm run ci:lint`: passed with zero ESLint/typecheck errors.
  - `npm run test:production-readiness`: API 12 suites / 160 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 424 tests; web 11 suites / 143 tests; graph
    validation 316 nodes / 316 edges; pricing coverage, progress verification,
    QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
    provider-credential gates passed.
- Phase 2.22 final local floor passed:
  - `npm run test:production-readiness`: API 12 suites / 159 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 423 tests; web 11 suites / 143 tests; graph,
    pricing coverage, progress verification, QA/security suppression hygiene, DB,
    DevOps, cloud, release, handover, and provider-credential gates passed.
- Phase 2.21 final local floor passed:
  - `npm run test:production-readiness`: API 12 suites / 159 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 423 tests; web 11 suites / 143 tests; graph,
    pricing coverage, progress verification, QA/security suppression hygiene, DB,
    DevOps, cloud, release, handover, and provider-credential gates passed.
- Phase 2.20 final local floor passed:
  - `npm run test:production-readiness`: API 12 suites / 159 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 423 tests; web 11 suites / 143 tests; graph,
    pricing coverage, progress verification, QA/security suppression hygiene, DB,
    DevOps, cloud, release, handover, and provider-credential gates passed.
- Phase 2.19 final local floor passed:
  - `npm run test:production-readiness`: API 12 suites / 158 tests; web 2 suites /
    86 tests.
  - `npm run check`: API 53 suites / 422 tests; web 11 suites / 143 tests; graph,
    pricing coverage, progress verification, QA/security suppression hygiene, DB,
    DevOps, cloud, release, handover, and provider-credential gates passed.
  - API unit: 50 suites / 390 tests.
  - Web unit: 9 suites / 130 tests.
  - Graph validation: 290 nodes / 290 edges.
  - Pricing coverage guard: 36 frontend priced families covered.
  - Progress verification: 153 phase evidence anchors.
  - Security suppression check: 21 reviewed suppressions.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run test:production-readiness` passed.
  - API focused: 10 suites / 139 tests.
  - Web focused: 2 suites / 84 tests.
- `npm run ci:build` passed for API and web.
- Phase 2.9 focused continuation passed:
  - API focused: `src/api/auth-billing.spec.ts`,
    `src/diagram-parser/diagram-parser.service.spec.ts`, and
    `src/diagram-parser/llm-classifier.client.spec.ts`: 3 suites / 52 tests.
  - Web focused: `src/App.spec.tsx`: 1 suite / 57 tests.
- Phase 2.10 billing export mapper hardening passed:
  - API focused: `src/api/auth-billing.spec.ts`: 1 suite / 20 tests.
  - The focused tests cover AWS CUR, Azure Cost Management CSV with
    `CostInBillingCurrency` fallback, and nested GCP Billing Export JSON with
    labels under `project.labels`.
- Phase 2.11 workspace active team switching focused checks passed:
  - API focused: `src/api/auth.controller.spec.ts`, `src/api/auth-billing.spec.ts`,
    and `src/api/api-database.repository.spec.ts`: 3 suites / 45 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites / 84
    tests.
- Phase 2.11 full regression floor passed with `npm run check`:
  - API unit: 51 suites / 405 tests.
  - Web unit: 11 suites / 141 tests.
  - Graph validation: 312 nodes / 312 edges.
  - Pricing coverage, progress verification, QA/security suppressions,
    database, DevOps, cloud, release, handover, and provider credential gates
    passed; security suppression ledger remains at 23 reviewed suppressions.
- Phase 2.12 workspace invitation resend lifecycle passed:
  - API focused: `src/api/auth.controller.spec.ts`, `src/api/auth-billing.spec.ts`,
    and `src/api/api-database.repository.spec.ts`: 3 suites / 45 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites / 84
    tests.
  - `npm run ci:lint` passed with zero warnings/typecheck errors.
  - `npm run test:production-readiness` passed: API 10 suites / 139 tests; web
    2 suites / 84 tests.
  - `npm run check` passed: API 51 suites / 405 tests; web 11 suites / 141 tests;
    graph validation 312 nodes / 312 edges; pricing coverage, progress
    verification, QA/security suppression, database, DevOps, cloud, release,
    handover, and provider credential gates passed.
  - `npm run ci:build` passed; `npm audit --audit-level=high` passed with the
    known low Graphify transitive advisory still present.
- Phase 2.13 invite delivery webhook foundation passed:
  - API focused: `src/api/invitation-delivery.service.spec.ts`,
    `src/config/config.schema.spec.ts`, and `src/api/auth-billing.spec.ts`: 3
    suites / 37 tests.
  - Web focused: `src/App.spec.tsx` and `src/api-client.spec.ts`: 2 suites / 85
    tests.
  - `npm run ci:lint` passed with zero warnings/typecheck errors.
  - `npm run test:production-readiness` passed: API 12 suites / 155 tests; web
    2 suites / 85 tests.
  - `npm run check` passed: API 52 suites / 411 tests; web 11 suites / 142 tests;
    graph validation 314 nodes / 314 edges; pricing coverage, progress
    verification, QA/security suppression, database, DevOps, cloud, release,
    handover, and provider credential gates passed.
  - `npm run ci:build` passed; `npm audit --audit-level=high` passed with the
    known low Graphify transitive advisory still present.
- Phase 2.10 full regression floor passed with `npm run check`:
  - API unit: 51 suites / 403 tests.
  - Web unit: 11 suites / 141 tests.
  - Graph validation: 312 nodes / 312 edges.
  - Pricing coverage, progress verification, QA/security suppressions,
    database, DevOps, cloud, release, handover, and provider credential gates
    passed; security suppression ledger now covers 23 reviewed suppressions.
- Phase 2.9 full regression floor passed with `npm run check`:
  - API unit: 50 suites / 392 tests.
  - Web unit: 9 suites / 130 tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
- Phase V3 Terraform generation focused checks passed:
  - API focused: `src/terraform/terraform-generation.service.spec.ts` and
    `src/api/api-contract.spec.ts`: 2 suites / 40 tests.
  - Web focused: `src/api-client.spec.ts` and `src/App.spec.tsx`: 2 suites /
    84 tests.
- Phase V3.1 Terraform hardening focused checks passed:
  - API focused: `src/terraform/terraform-generation.service.spec.ts` and
    `src/api/api-contract.spec.ts`: 2 suites / 42 tests.
  - Web focused: `src/api-client.spec.ts` and `src/App.spec.tsx`: 2 suites /
    84 tests.
- Phase V3.2 Terraform framework assurance focused checks passed:
  - API focused: `src/terraform/terraform-generation.service.spec.ts` and
    `src/api/api-contract.spec.ts`: 2 suites / 42 tests.
- Phase V3.3/V3.4 Terraform delivery focused checks passed:
  - API focused: `src/terraform/terraform-generation.service.spec.ts` and
    `src/api/api-contract.spec.ts`: 2 suites / 42 tests.
  - Web focused: `src/api-client.spec.ts` and `src/App.spec.tsx`: 2 suites /
    84 tests.
- Phase V3.5 Terraform bundle integrity checks passed:
  - API focused: `src/terraform/terraform-generation.service.spec.ts`: 1 suite /
    6 tests.
  - The focused test materializes a generated bundle, runs
    `node scripts/verify-manifest.mjs`, then tampers with `main.tf` and proves the
    verifier fails with a manifest hash mismatch.
  - `npm run ci:lint` passed with zero warnings.
  - `npm run security:suppressions` passed: 23 reviewed suppressions.
  - `npm run test:production-readiness` passed: API 10 suites / 136 tests; web
    2 suites / 84 tests.
- Phase V3.6 Terraform validation evidence gates passed:
  - `node --check scripts/terraform-validation-evidence-check.mjs` passed.
  - `npm run terraform:evidence:check -- --json` passed against the sanitized
    `example-schema` bundle with destination-account proof still required.
  - `npm run terraform:evidence:check -- --require-destination-plan --json` failed
    as intended for the sample bundle because it is not destination-plan evidence.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11` suites
    / `149` tests, graph validation `333` nodes / `333` edges, pricing coverage
    `36` frontend families, progress verification `218` anchors, and the Terraform
    validation evidence gate in the aggregate floor.
- Phase V3.7 Terraform destination evidence capture gates passed:
  - `node --check scripts/terraform-destination-evidence-capture.mjs` passed.
  - `npm run terraform:evidence:capture:smoke -- --json` generated a
    destination-plan evidence bundle under `.tmp/`, then validated it with
    `terraform:evidence:check -- --require-destination-plan` and
    `verifiedDestinationPlan=true`.
  - `npm run release:check` passed and `npm run progress:verify` passed with `266`
    anchors.
  - Full `npm run check` passed with API `59` suites / `494` tests, web `11`
    suites / `149` tests, graph validation `345` nodes / `345` edges, pricing
    coverage `36` frontend families, progress verification `266` anchors, and the
    new Terraform destination evidence capture smoke in the aggregate floor.
- Phase V3.3/V3.4 full local regression floor passed with `npm run check`:
  - API unit: 51 suites / 400 tests.
  - Web unit: 9 suites / 132 tests.
  - Graph validation: 298 nodes / 298 edges.
  - Pricing coverage guard: 36 frontend priced families covered.
  - Progress verification: 153 phase evidence anchors.
  - Security suppression check: 22 reviewed suppressions.
  - Database, DevOps, cloud, release, and provider credential gates passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- Phase V3.3/V3.4 build gate passed with `npm run ci:build`:
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder
    and chunk-size warnings.
- Customer handover package gate passed with `npm run handover:check`.
- Public OSS readiness gate passed with `npm run public:readiness:check`.
- Browser audit artifact gate passed with `npm run browser:audit`: desktop,
  320px reflow, and 200% zoom-equivalent scenarios passed. Formal axe-core
  scans found zero violations across home, executive, and engineering states;
  Lighthouse scores were Performance 1.00, Accessibility 1.00, Best Practices
  1.00, and SEO 0.92.
- Formal browser audit tooling regression passed on 2026-07-08:
  - `npm run format:check`, `npm run public:readiness:check`,
    `npm run release:check`, and `npm run ci:lint` passed.
  - `npm run test:production-readiness` passed: API 10 suites / 135 tests; web
    2 suites / 84 tests.
  - `npm run check` passed: API 51 suites / 400 tests; web 11 suites / 141
    tests; graph validation 312 nodes / 312 edges; pricing coverage, progress
    verification, QA/security suppression, database, DevOps, cloud, release,
    handover, and provider credential gates passed.
  - `npm run ci:build` passed with the existing Vite environment-placeholder
    and chunk-size warnings.
  - `npm audit --audit-level=high` passed; the known Graphify/Ollama transitive
    npm advisories remain low severity with no available fix.
- Customer handover full local regression floor passed with `npm run check`:
  - API unit: `51` suites / `400` tests.
  - Web unit: `9` suites / `132` tests.
  - Graph validation: `304` nodes / `304` edges.
  - Pricing coverage guard: `36` frontend priced families covered.
  - Progress verification: `153` phase evidence anchors.
  - Security suppression check: `22` reviewed suppressions.
  - Database validation, DevOps check, cloud readiness, release readiness,
    handover, and provider credential gates passed.
  - `db:validate` skipped the live `schema_migrations` check because the Postgres
    container was not running.
  - `cloud:check` remains documentation/config only because deployable IaC is not
    present.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- Phase V3 full regression floor passed with `npm run check`:
  - API unit: 51 suites / 398 tests.
  - Web unit: 9 suites / 132 tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
- Phase V3.1 full regression floor passed with `npm run check`:
  - API unit: 51 suites / 400 tests.
  - Web unit: 9 suites / 132 tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- Phase V3.2 full regression floor passed with `npm run check`:
  - API unit: 51 suites / 400 tests.
  - Web unit: 9 suites / 132 tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run ci:build` passed for API and web; Vite reported the existing
  `%VITE_API_BASE_URL%` placeholder and large-chunk warnings.

Full-stack evidence:

- First isolated `npm run ci:e2e` attempt failed before tests during Docker web
  image `npm ci` with npm `ECONNRESET`.
- Retry built images and reached runtime verification:
  - API E2E: 16/16 passed.
  - The wrapper process later exited with SIGTERM after six of seven Playwright
    tests printed; the stack remained healthy.
  - Direct Playwright against the same stack passed 7/7.
  - Direct `npm run live:verify` against the same stack passed:
    - template-to-recommendation: `4201ms` / `60000ms`
    - diagram-to-PDF: `3448ms` / `180000ms`
    - workspace-auth/RBAC: `507ms` / `60000ms`
    - Redis degradation: `/health=degraded`, `/health/deep=degraded`,
      `/api/v1/data-health HTTP 200`
- Transcript path: `.tmp/live-verification/latest-v2-prod-ready.json`.
- Transcript secret scan found only benign labels and `stateVerified: true`.
- Isolated Compose stack was cleaned with `docker compose down --remove-orphans --volumes`.
- Latest hardening rerun of `npm run ci:e2e` passed on isolated Compose project
  `polycoste2e88038` with web `http://localhost:58174`, API
  `http://localhost:3301`, and Vault host port `18220`:
  - API E2E: 16/16 passed.
  - Web Playwright: 7/7 passed.
  - Live verification passed with template-to-recommendation `6523ms` /
    `60000ms`, diagram-to-PDF `2698ms` / `180000ms`, workspace auth/RBAC
    `406ms` / `60000ms`, SCIM provisioning `281ms` / `60000ms`, and Redis
    degradation returning `/health=degraded`, `/health/deep=degraded`, and
    `/api/v1/data-health HTTP 200`.
- Runtime DI guard coverage now sits in `test:production-readiness` through
  `apps/api/src/api/runtime-di.spec.ts`.
- Latest full `npm run check` passed with API unit 59 suites / 494 tests, web unit
  11 suites / 149 tests, graph validation 328 nodes / 328 edges, pricing coverage
  36 frontend families, progress verification 165 anchors, release readiness,
  handover, DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof smokes.
- Invoice artifact production profile evidence now includes:
  - `docs/operations/invoice-artifact-production-profile.example.json`
  - `docs/operations/evidence/aws-s3-retention-proof.example.json`
  - `npm run invoice:artifact-profile:check`, which passed as
    `verified(config-evidence)` with provider `aws-s3`, digest
    `8b7487c43ed9df63249134345b238c0d3db7144e1029d818198ad9c6d3436b84`, and
    the explicit caveat that live cloud/Vault evidence remains target-environment
    proof.
- Latest full `npm run check` with the profile gate passed with API unit 59 suites
  / 494 tests, web unit 11 suites / 149 tests, graph validation 330 nodes / 330
  edges, pricing coverage 36 frontend families, progress verification 175
  anchors, release readiness, handover, DevOps/cloud/provider-credential gates,
  and invoice evidence/retention-proof/profile smokes.

## Screenshot Index

See `docs/theme-audit/2026-07-07/README.md`.

Captured screenshots:

- `docs/theme-audit/2026-07-07/dark/home.png`
- `docs/theme-audit/2026-07-07/light/home.png`
- `docs/theme-audit/2026-07-07/dark-terracotta/home.png`
- `docs/theme-audit/2026-07-07/light-terracotta/home.png`

Machine-readable token evidence:

- `docs/theme-audit/2026-07-07/evidence.json`

## HUMAN_DECISION_GATE Register

| Gate                           | Default Applied                                                 | Status                                                     |
| ------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| PolyCost brand hue             | Use v2 PolyCost violet as default accent                        | Needs owner sign-off before portfolio-wide standardization |
| Terracotta axis                | Enabled as user-selectable accent                               | Implemented                                                |
| Light sidebar pattern          | Neutral/dense data-tool pattern, not filled CPN sidebar         | Implemented by preserving existing shell anatomy           |
| GitHub Actions runner/account  | Treat no-runner jobs as infra/billing blocker, not code failure | Blocked externally                                         |
| Real cloud/LLM/SSO credentials | Keep fixture-backed paths marked `verified (mock)`              | Still applies                                              |

## Blocked / Deferred

- Hosted GitHub Actions still cannot prove branch CI while jobs fail before runner
  allocation. A maintainer must fix Actions runner/account/billing/quota state or
  rerun once the account can allocate runners.
- Phase 2.14 adds an append-only team audit trail for privileged team, invite, SSO,
  billing import, and reconciliation actions, with admin-only API/UI visibility. Phase 2.15
  transaction-couples privileged mutation writes with their audit rows. Phase 2.16 adds a
  same-transaction audit export outbox plus signed SIEM/WORM webhook delivery workers, and
  Phase 2.17 adds local/staging audit receiver smoke proof. Full immutability still depends
  on the deployed external receiver's retention policy and acceptance evidence.
- Full invoice-grade pricing remains future scope: negotiated discounts, jurisdictional
  tax treatment, enterprise agreements, marketplace private offers, amortization
  semantics, refunds, support contracts, and actual provider invoice-of-record
  reconciliation are not complete. Phase 2.9 and Phase 2.10 improve source-row
  traceability, native AWS/Azure/GCP export mapping, allocation evidence, and
  estimate-vs-actual reconciliation evidence. Phase 2.19 separates classified
  non-usage invoice adjustments from usage-comparable variance, and Phase 2.20
  separates provider commitment semantics from generic adjustments. Phase 2.21
  exposes provider-inventory, amortization-period, and allocation proof requirements,
  and Phase 2.22 lists invoice-grade blockers and required provider artifacts, but
  Phase 2.23 registers artifact metadata and check coverage. Phase 2.24 adds
  checksum/control-total verification status for registered artifact metadata.
  Phase 2.34 adds a metadata-only invoice evidence packet export for reviewer
  handoff, and Phase 2.35 makes that packet tamper-evident with a stable-JSON
  SHA-256 integrity manifest. Phase 2.36 adds an offline verifier CLI for exported
  packets. Phase 2.64 adds invoice-to-pricing-catalog lineage evidence for exact
  SKU rows and catalog snapshot digests. Phase 2.65 adds provider catalog snapshot
  freshness and exact row-change evidence for AWS/Azure/GCP fixture replay, with a
  stricter `--require-live-provider` path for archived live provider API evidence.
  Phase 2.66 adds a guarded operator-side live catalog capture path with read-only
  AWS/Azure endpoints, GCP credential checks, previous-live-evidence comparison,
  and sanitized evidence output. A real `verifiedLiveProviderSnapshot=true` bundle
  still requires operator network access, GCP Cloud Billing read credentials, and
  archived output from that command.
  Phase 2.67 adds provider-native fixture replay through the same capture
  normalizers, proving row-change math and strict live-provider rejection without
  cloud credentials.
  Phase 2.68 adds advisory and strict live-capture preflight so operators can
  prove live guard, reviewer, prior evidence, credential-source, endpoint, and
  no-secret-output posture before executing capture.
  Phase 2.69 adds archive-manifest verification so sanitized capture bundles can
  be bound to exact evidence file digests, strict preflight posture, capture
  metadata, provider coverage, and strict snapshot checker output before anyone
  claims archived live-provider proof.
  These phases do not replace provider invoice rendering, private contract/legal
  validation, or provider-authenticated invoice-of-record reconciliation.
  Phase 2.25 adds durable database-backed artifact file upload/download with
  metadata-only reconciliation evidence and audit events. Phase 2.26 adds storage,
  KMS-readiness, retention/legal-hold, and EICAR scan-hook governance metadata.
  Phase 2.27 adds object-store/KMS/scanner/retention config guards, signed scanner
  webhook integration, strict credential-check visibility, and delete-expired
  enforcement for non-held database-backed blobs. Phase 2.28 adds provider-native
  S3/Azure Blob/GCS byte-write/read adapters with object-pointer persistence and
  checksum-verified downloads. Phase 2.29 adds provider object deletion before
  deleting expired non-held database pointers. Phase 2.30 adds audited Owner/Admin
  legal-hold place/release operations for stored artifacts. Phase 2.31 adds an
  audited internal review-status workflow for stored artifacts. Phase 2.32 adds an
  audited internal policy exception lifecycle with future-expiry enforcement. Phase
  2.33 adds audited stored-artifact control-total validation against imported actuals
  and reconciliation totals. Phase 2.37 adds a digest-covered packet governance
  manifest plus audit events for evidence-packet exports and artifact downloads.
  Phase 2.38 adds signed evidence receipt configuration, receipt-aware offline
  verification, and declared WORM posture checks. Phase 2.39 adds signed
  external-webhook notary/WORM handoff during evidence packet export with
  sanitized accepted/failed delivery evidence in the receipt. Phase 2.40 adds
  local and staging notary receiver smoke commands so operators can prove the HMAC
  receiver contract and archive receiver-side evidence separately from PolyCost's
  packet export. Phase 2.41 adds a self-hostable notary reference receiver with
  health/readiness checks, append-only JSONL receipt capture, Docker packaging, and
  a smoke harness, while still requiring operator-owned WORM/object-lock storage
  evidence before claiming immutability. Phase 2.42 adds a typed provider
  retention proof manifest, packet-level proof counters, offline verifier checks,
  and a `providerRetentionProofReady` gate that turns green only when every
  external artifact has provider-control-plane proof reference and SHA-256 digest.
  Phase 2.43 adds an offline AWS/Azure/GCP provider retention proof artifact
  verifier and smoke harness so operators can validate the captured proof JSON and
  digest before copying it into runtime configuration. Phase 2.44 adds an offline
  AWS/Azure/GCP capture-plan helper that turns a stored object URI into provider
  CLI capture commands, verifier command, durable reference, and runtime config
  handoff template without executing cloud CLIs or handling cloud credentials.
  Phase 2.45 adds an Owner/Admin API handoff that attaches offline verifier output
  to the exact externally stored invoice artifact, rejects signed URL/SAS-style
  proof references, audits the attach action, and lets artifact-level verified
  proof satisfy the packet provider-retention proof gate. Phase 2.46 persists
  attached proof metadata onto the exact `invoice_artifact_blobs` row, reconstructs
  externally stored artifact read models from those proof columns, and extends
  clean Docker/database migration gates through `039`. Phase 2.47 adds an optional
  local CLI capture command that executes read-only AWS/Azure/GCP proof capture in
  an operator-authenticated shell with no credential storage, no-shell command
  execution, signed URI rejection, and verifier handoff. Phase 2.59 adds a strict
  provider invoice-of-record pilot evidence contract for provider invoice control
  totals, billing export lineage, private pricing, tax/adjustments, commitments,
  retention/notary/audit proof, and finance/security reviewer attestations.
  PolyCost still does not provide provider invoice rendering, private contract
  validation, managed server-side cloud-control-plane WORM object-store proof
  capture, receiver-side immutability proof, external legal-review routing,
  contract/legal approval integration, or a full external reviewer queue.
  Full invoice-grade billing remains future scope.
  PolyCost is still not the invoice system of record.
- VSDX support now includes extraction/evidence and approximate SVG previews, not full
  Visio semantic rendering. Phase 2.9 adds page geometry, normalized preview bounds, and
  explicit layout-extraction caveats; Phase 2.18 adds sanitized SVG preview artifacts.
  Phase 2.56 adds a machine-verifiable reviewed-preview evidence contract and sample
  CI schema bundle, but full Visio rendering is still future scope.
- Production LLM classifier quality requires a real endpoint/model, Vault secret, monitored
  corpus evaluation, and false-positive tracking. Phase 2.9 adds an explicit readiness
  surface so stub/unconfigured mode is not reported as production-connected. Phase 2.57
  adds the baseline labeled corpus, sanitized evidence bundle, metric gate, and
  `--require-live-model` strict mode. Phase 2.60 adds a repeatable sanitized
  capture helper and smoke gate. Phase 2.61 adds monitored drift thresholds and a
  false-positive register contract. Phase 2.62 adds alert handoff evidence, and
  Phase 2.63 adds a local signed sender/receiver smoke; the checked-in sample
  remains `example-schema` evidence, and the local smoke is still not a deployed
  production receiver or external incident-system proof.
- Full enterprise auth product polish remains future scope: production email,
  production SSO/SAML certification, formal SCIM certification, account recovery,
  org billing UX, and broader team/account administration. Phase 2.11 closes active
  workspace switching for existing team memberships, Phase 2.48 adds the SCIM
  provisioning foundation with hashed tokens, bearer-token user provisioning, team
  membership deactivation, and audit events, and Phase 2.49 exposes the SCIM
  token/user posture plus create/revoke controls in the workspace admin UI. Phase
  2.50 adds SCIM discovery endpoints, representative IdP fixtures, and operator
  onboarding docs. Phase 2.51 adds a sanitized live SCIM lifecycle transcript for
  token creation, metadata-only token listing, discovery, provision/deactivate,
  token revocation, and revoked-token denial. Phase 2.58 adds a strict managed-IdP
  pilot evidence contract for OIDC/SAML plus SCIM bundles, but executed customer
  pilots, group push, IdP-driven role mapping, custom schema extensions, and formal
  certification remain future scope.
- Terraform generation now has a hardened root bundle, ZIP export, bundle
  manifest, credential-free manifest integrity verifier, validation runner,
  generation profile, private database networking, runtime identity baselines,
  policy/test scaffolding, AWS/Azure/GCP starter modules for network, compute, and
  data, destination-plan evidence validation, and operator-side evidence capture
  from Terraform runner artifacts. Full production IaC remains future scope:
  landing-zone integration, edge/observability/DR modules, container/serverless/
  Kubernetes module generation, active-active DR, destination-account policy gates,
  and real `terraform init/validate/test/plan` execution with provider credentials
  are not run by PolyCost request handling.

## Rollback

Revert the final production-readiness commit from this branch, or selectively revert:

- Frontend theme/accent files: `apps/web/src/theme.ts`,
  `apps/web/src/components/ThemeSwitcher.tsx`, `apps/web/src/styles/tokens.css`,
  `apps/web/src/styles.css`, `apps/web/src/main.tsx`, and `apps/web/index.html`.
- Backend health aliases: `apps/api/src/health/*`.
- Docs/artifacts: `STATE-SYNC.md`, `THEME-INVENTORY.md`,
  `docs/theme-audit/2026-07-07/`, and this report.
