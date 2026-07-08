# PolyCost Production Readiness Report

Date: 2026-07-08
Branch: cumulative production-readiness branches through `codex/invoice-evidence-packet-verifier`
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

| ID             | Disposition   | Evidence                                                                                                                                                                                                                                                |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-FMT-001     | Fixed         | `npm run check` initially failed on unformatted orchestrator docs; after formatting, `npm run format:check` and `npm run check` passed                                                                                                                  |
| P0-DOC-001     | Fixed         | Orchestrator docs moved from `docs/orchestrators/*` to requested `docs/design/*`                                                                                                                                                                        |
| P0-SYNC-001    | Fixed         | `STATE-SYNC.md` created with product detection, CI state, phase classification, and gate register                                                                                                                                                       |
| P0-INV-001     | Fixed         | `THEME-INVENTORY.md` created with route/component inventory and P0 findings                                                                                                                                                                             |
| TKN-001        | Fixed         | Token hex values isolated to `apps/web/src/styles/tokens.css`; `npm run theme:hex:check` passed                                                                                                                                                         |
| TKN-002        | Fixed         | Added persisted `data-accent="default                                                                                                                                                                                                                   | terracotta"` axis, pre-hydration application, and Appearance control |
| TKN-003        | Fixed         | Added `theme:hex:check` script and CI workflow gate                                                                                                                                                                                                     |
| API-HEALTH-001 | Fixed         | Added additive `/health/live`, `/api/v1/health/live`, `/health/ready`, and `/api/v1/health/ready` endpoints                                                                                                                                             |
| UI-ARCHIVE-001 | Fixed (smoke) | `docs/theme-audit/2026-07-07/` contains dark/light default screenshots and dark/light terracotta screenshots with token evidence                                                                                                                        |
| CI-REMOTE-001  | Blocked       | GitHub Actions job `85608851518` for prior head showed `runner_id: 0`, empty runner name/group, `steps: []`; remote runner/account infra is not executing repo steps                                                                                    |
| INV-TRACE-002  | Improved      | Provider-export rows now persist `_polycost` source fingerprints/column coverage; reconciliation evidence reports coverage, match summary, readiness, and caveats                                                                                       |
| INV-TRACE-003  | Improved      | Azure Cost Management CSV and nested GCP Billing Export JSON now have focused mapper coverage, allocation tag/label recognition, and fallback-cost readiness evidence                                                                                   |
| INV-TRACE-004  | Improved      | Imported actuals now classify usage versus tax, credit, discount, support, marketplace, refund, fee, enterprise adjustment, and unknown adjustment rows; reconciliation evidence separates usage-comparable variance from non-usage invoice adjustments |
| INV-TRACE-005  | Improved      | Commitment, reservation, and savings-plan rows now classify as covered usage, commitment discounts/negations, commitment fees, or amortization/unused commitment cost, with net commitment evidence in reconciliation summaries                         |
| INV-TRACE-006  | Improved      | Commitment rows now report whether provider inventory, amortization-period proof, and allocation evidence are still required before invoice-grade interpretation                                                                                        |
| INV-TRACE-007  | Improved      | Reconciliation evidence now includes an invoice-grade readiness matrix with present, partial, missing, and not-applicable checks, blockers, and required provider artifacts                                                                             |
| INV-TRACE-008  | Improved      | Reconciliation evidence can now register invoice-grade artifact metadata, including provider invoice/control-total packets, private pricing, tax, commitment, allocation, currency, and SKU-map evidence without falsely marking it verified            |
| INV-TRACE-009  | Improved      | Registered invoice artifacts can now be marked verified/rejected with review evidence, checksum/control-total mismatch rejection, verified counts, and readiness updates limited to the covered check                                                   |
| INV-TRACE-010  | Improved      | Registered invoice artifact files can now be stored in `invoice_artifact_blobs` with raw-byte SHA-256, size/MIME/file-name validation, metadata-only reconciliation evidence, and transaction-coupled audit events                                      |
| INV-TRACE-011  | Improved      | Stored invoice artifact files now carry storage-backend, KMS-readiness, retention/legal-hold, and scan-hook governance metadata; EICAR test content is blocked before bytes are stored                                                                  |
| INV-TRACE-012  | Improved      | Artifact storage readiness now has production-bound config guards, strict credential-check coverage, signed scanner webhook integration, and retention enforcement for expired non-held database-backed blobs                                           |
| INV-TRACE-013  | Improved      | Provider-native artifact storage adapters now write/read invoice artifact bytes through AWS S3, Azure Blob Storage, and GCP Cloud Storage, persist object pointers, and checksum-verify external downloads                                              |
| INV-TRACE-014  | Improved      | External artifact retention enforcement now purges S3, Azure Blob, and GCP Cloud Storage objects before deleting still-expired, non-held database pointers, with 404 treated as idempotent success                                                      |
| INV-TRACE-015  | Improved      | Stored invoice artifacts now have an Owner/Admin legal-hold PATCH operation that updates blob rows and reconciliation evidence together, emits audit events, and exposes place/release controls in the workspace panel                                  |
| INV-TRACE-016  | Improved      | Stored invoice artifacts now have an Owner/Admin review workflow with pending/approved/rejected states, review evidence metadata, aggregate review counts, audit events, and workspace send/approve/reject controls                                     |
| INV-TRACE-017  | Improved      | Stored invoice artifacts now have an Owner/Admin policy exception lifecycle with request/approve/reject states, future-expiry enforcement, computed expired status, aggregate counts, audit events, and workspace controls                              |
| INV-TRACE-018  | Improved      | Stored and verified invoice artifacts can now run an audited control-packet validation comparing artifact control totals against both reconciliation totals and imported actuals, with matched/warning/mismatch counts                                  |
| INV-TRACE-019  | Improved      | Reconciliations can now emit metadata-only invoice evidence packets with sanitized artifact metadata, readiness, match summary, control counts, caveats, and invoice-grade disclaimers without exposing raw artifact bytes                              |
| INV-TRACE-020  | Improved      | Invoice evidence packets now carry a stable-JSON SHA-256 integrity manifest with payload byte length, subject IDs, artifact counts, caveat/disclaimer counts, and digest metadata for reviewer recomputation                                            |
| INV-TRACE-021  | Improved      | Downloaded invoice evidence packets can now be verified offline with a local CLI that recomputes the stable-JSON digest, validates subject/count metadata, and rejects tampered payloads                                                                |
| VSDX-VIS-002   | Improved      | VSDX extraction now includes page size, normalized preview bounds, geometry hints, and an explicit layout-extraction caveat                                                                                                                             |
| VSDX-VIS-003   | Improved      | VSDX parsing now emits sanitized approximate SVG visual previews from positioned page geometry, with browser display and explicit non-pixel-perfect caveats                                                                                             |
| LLM-READY-002  | Improved      | Diagram LLM client now exposes readiness without calling the provider or reading secrets, keeping stub/unconfigured mode distinct from production-connected mode                                                                                        |
| UI-AUTH-002    | Improved      | Workspace billing panel now surfaces reconciliation readiness, source-fingerprint coverage, SKU match coverage, and the invoice-of-record caveat                                                                                                        |
| UI-AUTH-006    | Improved      | Workspace billing panel now surfaces usage-comparable variance plus invoice adjustment count, subtotal, and category summary for finance review                                                                                                         |
| UI-AUTH-007    | Improved      | Workspace billing panel now surfaces commitment row count, net commitment cost, and commitment category totals separately from generic invoice adjustments                                                                                              |
| UI-AUTH-008    | Improved      | Workspace billing panel now surfaces commitment evidence requirements for provider inventory, amortization periods, and allocation proof                                                                                                                |
| UI-AUTH-009    | Improved      | Workspace billing panel now surfaces invoice-grade readiness status, missing/partial counts, and top blockers for finance review                                                                                                                        |
| UI-AUTH-010    | Improved      | Workspace billing panel now exposes an Owner/Admin artifact-registration action and shows registered/verified counts plus the "metadata registered, not verified" caveat                                                                                |
| UI-AUTH-011    | Improved      | Workspace billing panel now exposes artifact verification after registration and refreshes verified counts without removing unrelated invoice-grade blockers                                                                                            |
| UI-AUTH-012    | Improved      | Workspace billing panel now exposes store/download actions for registered invoice artifact files and verifies against the stored checksum when present                                                                                                  |
| UI-AUTH-013    | Improved      | Workspace billing panel now surfaces stored-artifact governance status: scan result, retention date, legal-hold state, and KMS production-readiness                                                                                                     |
| UI-AUTH-014    | Improved      | Workspace billing panel now surfaces artifact review status, reviewer evidence, and pending/approved/rejected review counts with guarded review actions for stored files                                                                                |
| UI-AUTH-015    | Improved      | Workspace billing panel now surfaces policy exception status, reviewer, expiry, and requested/approved/rejected/expired counts with guarded exception actions for stored files                                                                          |
| UI-AUTH-016    | Improved      | Workspace billing panel now surfaces invoice control validation status, reconciliation/import deltas, period match state, validation timestamp, and a guarded validation action for stored verified artifacts                                           |
| UI-AUTH-017    | Improved      | Workspace billing panel can now download a reviewer-ready invoice evidence JSON packet for the active reconciliation while keeping stored artifact byte downloads separate                                                                              |
| UI-AUTH-018    | Improved      | Workspace evidence-packet downloads now include the packet digest prefix in the generated file name and completion notice                                                                                                                               |
| UI-AUTH-003    | Improved      | Active workspace switching is now backend-backed, membership-checked, and exposed in the signed-in account panel                                                                                                                                        |
| UI-AUTH-004    | Improved      | Pending/expired workspace invites can now be resent through a guarded backend route that rotates the stored token hash and exposes the refreshed one-time token only in the response                                                                    |
| UI-AUTH-005    | Improved      | Invite delivery now has local panel mode plus production HTTPS webhook mode with HMAC signatures, production config guards, and browser-safe delivery receipts                                                                                          |
| AUD-EXP-001    | Improved      | Audit export now has local HMAC receiver proof and a staging canary sender for SIEM/WORM acceptance evidence                                                                                                                                            |
| TF-GEN-001     | Added         | V3 Terraform generation endpoint and UI panel now generate AWS/Azure/GCP starter bundles from NWS with provider pinning, remote-state examples, static checks, and explicit caveats                                                                     |
| TF-GEN-002     | Improved      | V3.1 hardening adds generation profiles, private database networking checks, runtime identity baselines, policy/test/Makefile artifacts, and module-boundary documentation                                                                              |
| TF-GEN-003     | Improved      | V3.2 assurance adds generated CAF/WAF/Terraform framework-alignment evidence and topology-aware public/private ingress/load-balancer controls                                                                                                           |
| TF-GEN-004     | Improved      | V3.3 adds downloadable Terraform ZIP export, bundle manifest hash evidence, generated validation runner, and frontend ZIP/evidence download actions                                                                                                     |
| TF-GEN-005     | Improved      | V3.4 replaces Terraform module placeholders with AWS/Azure/GCP network, compute, and data starter modules plus static module-library validation                                                                                                         |
| TF-GEN-006     | Improved      | V3.5 adds credential-free Terraform bundle manifest verification and tamper-detection evidence before provider-authenticated validation                                                                                                                 |
| HND-001        | Added         | Customer handover package added under `docs/`, with usage, deployment, runbook, competitive comparison, architecture, and evidence ledger                                                                                                               |
| HND-002        | Added         | `npm run handover:check` validates the handover package and runs inside the full local `npm run check` floor                                                                                                                                            |
| OSS-001        | Added         | `npm run public:readiness:check` validates public-readiness docs, community health files, demo evidence hooks, tracked env-file safety, and provider-logo safeguards                                                                                    |
| AUD-001        | Added         | `npm run browser:audit` produces browser audit artifacts for desktop, 320px reflow, and 200% zoom-equivalent scenarios                                                                                                                                  |
| AUD-002        | Fixed         | `npm run browser:audit` now runs formal `axe-core` and Node-20-compatible Lighthouse 12 checks; latest artifact passed with zero axe violations and Lighthouse scores 1.00/1.00/1.00/0.92                                                               |

## Verification

Local static/regression gates:

- `npm run format:check` passed.
- `npm run ci:lint` passed with zero ESLint warnings.
- `npm run theme:hex:check` passed.
- `npm run check` passed.
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
  packets, but these phases do not replace provider invoice rendering, private
  contract/legal validation, or provider-authenticated invoice-of-record
  reconciliation.
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
  and reconciliation totals. PolyCost still does not provide provider invoice
  rendering, private contract validation, external legal-review routing,
  contract/legal approval integration, or a full external reviewer queue.
  Full invoice-grade billing remains future scope.
  PolyCost is still not the invoice system of record.
- VSDX support now includes extraction/evidence and approximate SVG previews, not full
  Visio semantic rendering. Phase 2.9 adds page geometry, normalized preview bounds, and
  explicit layout-extraction caveats; Phase 2.18 adds sanitized SVG preview artifacts.
- Production LLM classifier quality requires a real endpoint/model, Vault secret, monitored
  corpus evaluation, and false-positive tracking. Phase 2.9 adds an explicit readiness
  surface so stub/unconfigured mode is not reported as production-connected.
- Full enterprise auth product polish remains future scope: production email, SSO/SAML,
  SCIM, account recovery, org billing UX, and broader team/account administration.
  Phase 2.11 closes active workspace switching for existing team memberships.
- Terraform generation now has a hardened root bundle, ZIP export, bundle
  manifest, credential-free manifest integrity verifier, validation runner,
  generation profile, private database networking, runtime identity baselines,
  policy/test scaffolding, and AWS/Azure/GCP starter modules for network, compute,
  and data. Full production IaC remains future scope: landing-zone integration,
  edge/observability/DR modules, container/serverless/Kubernetes module generation,
  active-active DR, destination-account policy gates, and real
  `terraform init/validate/test/plan` execution with provider credentials are not
  run by PolyCost request handling.

## Rollback

Revert the final production-readiness commit from this branch, or selectively revert:

- Frontend theme/accent files: `apps/web/src/theme.ts`,
  `apps/web/src/components/ThemeSwitcher.tsx`, `apps/web/src/styles/tokens.css`,
  `apps/web/src/styles.css`, `apps/web/src/main.tsx`, and `apps/web/index.html`.
- Backend health aliases: `apps/api/src/health/*`.
- Docs/artifacts: `STATE-SYNC.md`, `THEME-INVENTORY.md`,
  `docs/theme-audit/2026-07-07/`, and this report.
