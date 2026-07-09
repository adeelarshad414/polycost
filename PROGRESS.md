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
| Phase 2.8AY - FinOps manual proof gate                  | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8AZ - Provider credential matrix hardening      | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8BA - PR-facing verification ledger             | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8BB - Live verification transcript artifact     | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8BC - Anonymous full-smoke transcript           | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8BD - Workspace auth live transcript            | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.8BE - Isolated live runtime verification        | Complete with known gaps (see notes) | 2026-07-07   |
| Production readiness orchestrator v2 pass               | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.9 - Production gap closure continuation         | Complete with known gaps (see notes) | 2026-07-07   |
| Phase 2.10 - Billing export mapper hardening            | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.11 - Workspace active team switching            | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.12 - Workspace invitation resend lifecycle      | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.13 - Invite delivery webhook foundation         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.14 - Team audit trail foundation                | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.15 - Transaction-coupled audit writes           | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.16 - Team audit export outbox                   | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.17 - Audit export receiver verification         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.18 - VSDX approximate SVG previews              | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.19 - Invoice adjustment reconciliation evidence | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.20 - Commitment billing semantics evidence      | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.21 - Commitment amortization evidence needs     | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.22 - Invoice-grade readiness matrix             | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.23 - Invoice artifact registration seam         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.24 - Invoice artifact verification seam         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.25 - Invoice artifact blob storage seam         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.26 - Invoice artifact governance metadata       | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.27 - Artifact storage readiness and retention   | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.28 - Provider artifact storage adapters         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.29 - External artifact retention deletion       | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.30 - Artifact legal-hold administration         | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.31 - Invoice artifact review workflow           | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.32 - Artifact policy exception lifecycle        | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.33 - Invoice control packet validation          | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.34 - Invoice evidence packet export             | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.35 - Invoice evidence packet integrity          | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.36 - Invoice evidence packet verifier CLI       | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.37 - Invoice artifact governance audit manifest | Complete with known gaps (see notes) | 2026-07-08   |
| Phase 2.38 - Invoice evidence receipt and WORM posture  | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.39 - Invoice evidence notary API handoff        | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.40 - Invoice evidence notary receiver smoke     | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.41 - Notary reference receiver staging path     | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.42 - Provider retention proof manifest          | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.43 - Provider retention proof artifact verifier | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.44 - Provider retention proof capture planner   | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.45 - Provider retention proof API intake        | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.46 - Provider retention proof row persistence   | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.47 - Provider retention proof CLI capture       | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.48 - SCIM provisioning foundation               | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.49 - SCIM admin workspace UX                    | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.50 - SCIM discovery and IdP onboarding          | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.51 - SCIM live verification transcript          | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.52 - Isolated E2E and runtime DI hardening      | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.53 - Invoice artifact production profile check  | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.54 - Invoice artifact staging rehearsal harness | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.55 - Rehearsal evidence bundle verification     | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.56 - VSDX visual evidence verification          | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.57 - Diagram LLM corpus evidence gate           | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.58 - Enterprise IdP pilot evidence gate         | Complete with known gaps (see notes) | 2026-07-09   |
| Phase 2.59 - Invoice-of-record pilot evidence gate      | Complete with known gaps (see notes) | 2026-07-09   |
| Phase V3 - Terraform generation MVP                     | Complete with known gaps (see notes) | 2026-07-07   |
| Phase V3.1 - Terraform hardening                        | Complete with known gaps (see notes) | 2026-07-07   |
| Phase V3.2 - Terraform framework assurance              | Complete with known gaps (see notes) | 2026-07-07   |
| Phase V3.3 - Terraform bundle export                    | Complete with known gaps (see notes) | 2026-07-07   |
| Phase V3.4 - Terraform module library                   | Complete with known gaps (see notes) | 2026-07-07   |
| Customer handover and production excellence package     | Complete with known gaps (see notes) | 2026-07-07   |
| Loading and progress experience audit/build             | Complete with known gaps (see notes) | 2026-07-08   |
| UI Appendix O - Overlay/dialog/button audit             | Complete with known gaps (see notes) | 2026-07-08   |
| Customer handover excellence orchestrator               | Complete with known gaps (see notes) | 2026-07-08   |
| Public OSS readiness and demo hardening                 | Complete with known gaps (see notes) | 2026-07-08   |
| Browser audit artifact hardening                        | Complete with known gaps (see notes) | 2026-07-08   |
| Formal browser audit tooling                            | Complete with known gaps (see notes) | 2026-07-08   |
| Phase V3.5 - Terraform bundle integrity validation      | Complete with known gaps (see notes) | 2026-07-08   |
| Phase V3.6 - Terraform validation evidence              | Complete with known gaps (see notes) | 2026-07-09   |
| Phase V3.7 - Terraform destination evidence capture     | Complete with known gaps (see notes) | 2026-07-09   |

## Phase 2.56 - VSDX visual evidence verification

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `scripts/vsdx-visual-evidence-check.mjs`, a machine-readable verifier for
  archived VSDX visual preview evidence.
- Added `docs/operations/evidence/vsdx-visual-evidence.example.json`, a sanitized
  `example-schema` bundle that validates the evidence contract without claiming
  human-reviewed diagram proof.
- Added `docs/architecture/phase-2-vsdx-visual-evidence.md` to explain the
  approximate SVG preview workflow, reviewed-preview evidence level, and boundary
  that PolyCost is not performing full Visio visual rendering.
- Added `npm run vsdx:visual-evidence:check` and wired it into the aggregate
  `npm run check` floor.
- Updated README, `docs/HOW-TO-USE.md`, the public release checklist,
  release-readiness guards, and progress-verification guards so the VSDX evidence
  boundary is runnable and auditable.

Verification performed:

- `node --check scripts/vsdx-visual-evidence-check.mjs` passed.
- `npm run vsdx:visual-evidence:check -- --json` passed against the checked-in
  sample with `verifiedExampleSchema=true`, `verifiedReviewedPreview=false`, and
  `humanReviewRequired=true`.
- `npm run vsdx:visual-evidence:check -- --require-human-review --json` failed as
  intended against the checked-in sample because it is `example-schema` evidence,
  `humanPreviewReviewed=false`, and the operator is `example-only`.
- `npm run release:check` passed and `npm run progress:verify` passed with `232`
  anchors.
- Full `npm run check` passed with the VSDX visual evidence checker in the aggregate
  floor. The run included API unit `59` suites / `494` tests, web unit `11` suites /
  `149` tests, graph validation `335` nodes / `335` edges, pricing coverage `36`
  frontend families, progress verification `232` anchors, release readiness,
  handover, DevOps/cloud/provider-credential gates, and invoice/Terraform/VSDX
  evidence smokes. Expected caveats remained: `impeccable` is skipped on the
  repo's Node 20 target, live Postgres migrations were skipped because the local
  Postgres container was not running, and the default local env still warns that
  invoice-artifacts are demo/local without live object-storage/KMS/scanner/WORM
  settings.

Known gaps carried forward:

- This verifies archived evidence for PolyCost's current layout-aware extraction and
  approximate SVG preview path. It still does not evaluate Visio themes, icon
  libraries, formulas, embedded media, exact text wrapping, or pixel-level visual
  equivalence.
- Real reviewed preview proof requires an operator bundle with
  `evidenceLevel=reviewed-preview`, `humanPreviewReviewed=true`, a named reviewer,
  and `npm run vsdx:visual-evidence:check -- --require-human-review <bundle.json>`.
- Full Visio visual rendering remains future scope.

## Phase 2.57 - Diagram LLM corpus evidence gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `fixtures/diagrams/llm-corpus/diagram-llm-corpus.v1.json`, a labeled
  baseline corpus for Tier 3 diagram-classifier service category and service-type
  evaluation.
- Added `scripts/diagram-llm-corpus-check.mjs`, a machine-readable checker that
  validates the corpus, verifies sanitized prediction evidence, computes category
  and service-type accuracy, checks corpus SHA-256 linkage, and rejects raw prompts,
  raw responses, API keys, and authorization material in evidence bundles.
- Added `docs/operations/evidence/diagram-llm-corpus-evidence.example.json`, a
  sanitized `example-schema` bundle that validates the evidence contract without
  claiming production LLM proof.
- Added `docs/architecture/phase-2-diagram-llm-corpus-evidence.md` to document the
  baseline corpus, live-model evidence workflow, accuracy thresholds, and boundary
  that the checked-in sample is not production LLM proof.
- Added `npm run diagram:llm-corpus:check` and wired it into the aggregate
  `npm run check` floor.
- Updated README, `docs/HOW-TO-USE.md`, `docs/ARCHITECTURE.md`,
  `docs/PROVIDER-CREDENTIALS.md`, release checklist, release-readiness guards,
  progress-verification guards, and the full-progress ledger.

Verification performed:

- `node --check scripts/diagram-llm-corpus-check.mjs` passed.
- `npm run diagram:llm-corpus:check -- --json` passed against the checked-in
  sample with `12` cases, `12` predictions, `categoryAccuracy=1`,
  `serviceTypeAccuracy=1`, `verifiedExampleSchema=true`, and
  `verifiedLiveModel=false`.
- `npm run diagram:llm-corpus:check -- --require-live-model --json` failed as
  intended against the checked-in sample because it is `example-schema` evidence
  without a configured endpoint, verified Vault secret, live-endpoint run mode, or
  named production reviewer.
- `npm run release:check` passed and `npm run progress:verify` passed with `250`
  anchors.
- Full `npm run check` passed with the diagram LLM corpus checker in the aggregate
  floor. The run included API unit `59` suites / `494` tests, web unit `11` suites /
  `149` tests, graph validation `337` nodes / `337` edges, pricing coverage `36`
  frontend families, progress verification `250` anchors, release readiness,
  handover, DevOps/cloud/provider-credential gates, and invoice/Terraform/VSDX/LLM
  evidence smokes. Expected caveats remained: `impeccable` is skipped on the
  repo's Node 20 target, live Postgres migrations were skipped because the local
  Postgres container was not running, the diagram LLM provider check reports the
  endpoint/model are not configured in local mode, and the default local env still
  warns that invoice-artifacts are demo/local without live object-storage/KMS/
  scanner/WORM settings.

Known gaps carried forward:

- This creates a production-quality measurement path, but it does not configure or
  call a live model in the default OSS/CI path.
- Production proof still requires a configured endpoint/model, Vault-backed
  `secret/polycost/llm` `api_key`, `evidenceLevel=live-model`, strict
  `npm run diagram:llm-corpus:check -- --require-live-model <bundle.json>`, operator
  review, ongoing corpus refresh, false-positive tracking, and drift monitoring.

## Phase 2.58 - Enterprise IdP pilot evidence gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `scripts/enterprise-idp-pilot-evidence-check.mjs`, a machine-readable
  verifier for sanitized enterprise IdP pilot evidence across workspace auth/RBAC/
  SSO, SCIM lifecycle, audit review, redaction posture, and operator attestations.
- Added `docs/operations/evidence/enterprise-idp-pilot-evidence.example.json`, a
  sanitized `example-schema` bundle that validates the evidence contract without
  claiming managed IdP proof.
- Added `docs/architecture/phase-2-enterprise-idp-pilot-evidence.md` to document
  the managed-pilot workflow, strict mode, required OIDC/SAML plus SCIM proof, and
  boundary that this is not formal SCIM/OIDC/SAML certification or a complete IAM
  product.
- Added `npm run enterprise:idp:evidence:check` and wired it into the aggregate
  `npm run check` floor.
- Updated README, `docs/HOW-TO-USE.md`, `docs/PROVIDER-CREDENTIALS.md`,
  `docs/ENTERPRISE-IDP-ONBOARDING.md`, release checklist, release-readiness guards,
  progress-verification guards, and the full-progress ledger.

Verification performed:

- `node --check scripts/enterprise-idp-pilot-evidence-check.mjs` passed.
- `npm run enterprise:idp:evidence:check -- --json` passed against the checked-in
  sample with `verifiedExampleSchema=true`, `verifiedManagedIdpPilot=false`,
  `journeyCount=5`, and `requiredAuditActionCount=5`.
- `npm run enterprise:idp:evidence:check -- --require-managed-idp --json` failed
  as intended against the checked-in sample because it is `example-schema`
  evidence, uses the `example` provider, has no verified managed tenant, and does
  not attest Vault/TLS/redirect/issuer verification with real operator/reviewer
  identities.
- `npm run enterprise:idp:evidence:check -- --require-managed-idp .tmp/enterprise-idp-managed-evidence.json --json`
  passed against a generated temporary managed-pilot-shaped bundle with
  `verifiedManagedIdpPilot=true`, proving strict mode can accept real evidence once
  required IdP/operator fields are present.
- `npm run release:check` passed and `npm run progress:verify` passed with `281`
  anchors.
- Full `npm run check` passed with the enterprise IdP evidence checker in the
  aggregate floor. The run included API unit `59` suites / `494` tests, web unit
  `11` suites / `149` tests, graph validation `347` nodes / `347` edges, pricing
  coverage `36` frontend families, progress verification `281` anchors, release
  readiness, handover, DevOps/cloud/provider-credential gates, and invoice/
  Terraform/VSDX/LLM/enterprise-IdP evidence smokes. Expected caveats remained:
  `impeccable` is skipped on the repo's Node 20 target, live Postgres migrations
  were skipped because the local Postgres container was not running, the diagram
  LLM provider check reports the endpoint/model are not configured in local mode,
  and the default local env still warns that invoice-artifacts are demo/local
  without live object-storage/KMS/scanner/WORM settings.

Known gaps carried forward:

- This creates a measurable managed-IdP evidence path, but it does not execute a
  real Okta, Microsoft Entra, Auth0, Google Workspace, generic OIDC, or generic
  SAML pilot in the default OSS/CI path.
- Formal SCIM/OIDC/SAML certification, production email delivery, group push,
  IdP-driven role mapping, custom schema extensions, account recovery, invite/
  approval workflows, org billing UX, and complete enterprise account/team product
  polish remain future work.
- Real pilot proof still requires `evidenceLevel=managed-idp-pilot`, strict
  `npm run enterprise:idp:evidence:check -- --require-managed-idp <bundle.json>`,
  Vault-backed secrets, registered redirect/ACS URLs, TLS validation, redacted
  screenshot/configuration evidence, audit-review evidence, and named operator plus
  reviewer attestations.

## Phase 2.59 - Invoice-of-record pilot evidence gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `scripts/invoice-of-record-pilot-evidence-check.mjs`, a machine-readable
  verifier for sanitized provider invoice-of-record pilot evidence across provider
  invoice control totals, billing export lineage, private pricing, tax/adjustment
  classification, commitment inventory/amortization/allocation, artifact governance,
  retention/notary/audit proof, and finance/security attestations.
- Added `docs/operations/evidence/invoice-of-record-pilot-evidence.example.json`,
  a sanitized `example-schema` bundle that validates the evidence contract without
  claiming provider invoice proof.
- Added `docs/architecture/phase-2-invoice-of-record-pilot-evidence.md` to document
  the provider-invoice pilot workflow, strict mode, required finance controls, and
  boundary that PolyCost is not the provider invoice system of record.
- Added `npm run invoice:record:evidence:check` and wired it into the aggregate
  `npm run check` floor.
- Updated README, `docs/HOW-TO-USE.md`, `docs/PROVIDER-CREDENTIALS.md`,
  `docs/ARCHITECTURE.md`, release checklist, release-readiness guards,
  progress-verification guards, and the full-progress ledger.

Verification performed:

- `node --check scripts/invoice-of-record-pilot-evidence-check.mjs` passed.
- `npm run invoice:record:evidence:check -- --json` passed against the checked-in
  sample with `verifiedExampleSchema=true`, `verifiedProviderInvoicePilot=false`,
  `requiredControlCount=12`, and `nonUsageCategoryCount=7`.
- `npm run invoice:record:evidence:check -- --require-provider-invoice --json`
  failed as intended against the checked-in sample because it is `example-schema`
  evidence, uses the `example` provider, targets `staging`, and uses example-only
  operator/reviewer identities.
- `npm run invoice:record:evidence:check -- --require-provider-invoice .tmp/invoice-of-record-provider-evidence.json --json`
  passed against a generated temporary production-shaped bundle with
  `verifiedProviderInvoicePilot=true`, proving strict mode can accept real evidence
  once required provider/reviewer fields are present.
- `npm run release:check` passed and `npm run progress:verify` passed with `296`
  anchors.
- Full `npm run check` passed with the invoice-of-record evidence checker in the
  aggregate floor. The run included API unit `59` suites / `494` tests, web unit
  `11` suites / `149` tests, graph validation `349` nodes / `349` edges, pricing
  coverage `36` frontend families, progress verification `296` anchors, release
  readiness, handover, DevOps/cloud/provider-credential gates, and invoice/
  Terraform/VSDX/LLM/enterprise-IdP/provider-invoice evidence smokes. Expected
  caveats remained: `impeccable` is skipped on the repo's Node 20 target, live
  Postgres migrations were skipped because the local Postgres container was not
  running, the diagram LLM provider check reports the endpoint/model are not
  configured in local mode, and the default local env still warns that
  invoice-artifacts are demo/local without live object-storage/KMS/scanner/WORM
  settings.

Known gaps carried forward:

- This creates a measurable provider invoice-of-record pilot evidence path, but it
  does not execute a real AWS/Azure/GCP provider-invoice finance pilot in the
  default OSS/CI path.
- PolyCost still is not a provider invoice system of record, tax/legal authority,
  procurement contract system, payment processor, or billing dispute platform.
- Real pilot proof still requires `evidenceLevel=provider-invoice-pilot`, strict
  `npm run invoice:record:evidence:check -- --require-provider-invoice <bundle.json>`,
  production provider invoice/control-total artifacts, billing export lineage,
  private rate card/contract/discount evidence, tax/support/credit/marketplace/
  refund/fee classification, commitment inventory/amortization/allocation proof,
  retained evidence packets, notary/audit proof, and named finance/security
  reviewers.

## Phase V3.6 - Terraform validation evidence

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `scripts/terraform-validation-evidence-check.mjs`, a machine-readable
  verifier for destination-account Terraform validation evidence.
- Added `docs/operations/evidence/terraform-validation-evidence.example.json`, a
  sanitized `example-schema` bundle that validates the evidence contract without
  claiming destination-account proof.
- Added `docs/architecture/phase-v3-6-terraform-validation-evidence.md` to explain
  the evidence levels, operator workflow, and boundary that PolyCost still does not
  run `terraform apply` or manage state.
- Added `npm run terraform:evidence:check` and wired it into the aggregate
  `npm run check` floor.
- Updated README and `docs/HOW-TO-USE.md` so operators archive manifest integrity,
  validation runner, plan JSON, policy, remote-state, and tag evidence, then run
  `npm run terraform:evidence:check -- --require-destination-plan <bundle.json>`.
- Extended release-readiness and progress-verification guards for the new command,
  V3.6 docs, sample evidence, remote-state locking/encryption checks, tag evidence,
  raw-secret guard, and destination-plan mode.

Verification performed:

- `node --check scripts/terraform-validation-evidence-check.mjs` passed.
- `npm run terraform:evidence:check -- --json` passed against the checked-in sample
  with `verifiedExampleSchema=true`, `verifiedDestinationPlan=false`, and
  `destinationPlanRequired=true`.
- `npm run terraform:evidence:check -- --require-destination-plan --json` failed as
  intended against the checked-in sample because it is `example-schema` evidence and
  does not attest that a destination plan was executed.
- Full `npm run check` passed with the Terraform validation evidence checker in the
  aggregate floor. The run included API unit `59` suites / `494` tests, web unit
  `11` suites / `149` tests, graph validation `333` nodes / `333` edges, pricing
  coverage `36` frontend families, progress verification `218` anchors, release
  readiness, handover, DevOps/cloud/provider-credential gates, and invoice plus
  Terraform evidence smokes. Expected caveats remained: `impeccable` is skipped on
  the repo's Node 20 target, live Postgres migrations were skipped because the local
  Postgres container was not running, and the default local env still warns that
  invoice-artifacts are demo/local without live object-storage/KMS/scanner/WORM
  settings.

Known gaps carried forward:

- This verifies archived Terraform validation evidence after capture, but it still
  does not run Terraform, hold provider credentials, manage remote state, or certify a
  customer landing zone.
- Real destination proof still requires a platform-owned CI/workstation run with
  `terraform init`, `fmt`, `validate`, optional `test`/`tflint`, destination
  `terraform plan`, policy checks, remote-state locking/encryption proof, tag
  evidence, and human review.
- Full production landing-zone Terraform remains future work for private endpoints,
  WAF/CDN integration, least-privilege IAM expansion, Kubernetes/serverless modules,
  active-active DR, and organization controls.

## Phase V3.7 - Terraform destination evidence capture

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `scripts/terraform-destination-evidence-capture.mjs`, an operator-side
  capture helper that assembles V3.6 Terraform validation evidence from
  destination-run artifacts without running Terraform or storing provider
  credentials.
- Added `docs/operations/evidence/terraform-destination-capture/`, including a
  sanitized capture profile, generated bundle manifest, manifest-integrity result,
  Terraform validation result, `tfplan.json`, provider lock fixture, Conftest result,
  and remote-state evidence.
- Added `docs/architecture/phase-v3-7-terraform-destination-evidence-capture.md` to
  document the destination-run artifact workflow and the boundary that PolyCost still
  does not manage state or execute `terraform apply`.
- Added `npm run terraform:evidence:capture` and
  `npm run terraform:evidence:capture:smoke`. The smoke builds a destination-plan
  evidence bundle under `.tmp/` and validates it with
  `terraform:evidence:check -- --require-destination-plan`.
- Updated README, `docs/HOW-TO-USE.md`, release checklist, release-readiness guards,
  progress-verification guards, and the full-progress ledger.

Verification performed:

- `node --check scripts/terraform-destination-evidence-capture.mjs` passed.
- `npm run terraform:evidence:capture:smoke -- --json` passed. It generated
  `.tmp/terraform-destination-evidence-capture/terraform-validation-evidence.json`
  with `evidenceLevel=destination-plan`, `resourceChangeCount=5`,
  `destructiveChangeCount=0`, `replacementChangeCount=0`,
  `untaggedResourceCount=0`, and downstream strict validation
  `verifiedDestinationPlan=true`.
- `npm run release:check` passed and `npm run progress:verify` passed with `266`
  anchors.
- Full `npm run check` passed with the Terraform destination evidence capture smoke
  in the aggregate floor. The run included API unit `59` suites / `494` tests, web
  unit `11` suites / `149` tests, graph validation `345` nodes / `345` edges,
  pricing coverage `36` frontend families, progress verification `266` anchors,
  release readiness, handover, DevOps/cloud/provider-credential gates, and invoice/
  Terraform/VSDX/LLM evidence smokes. Expected caveats remained: `impeccable` is
  skipped on the repo's Node 20 target, live Postgres migrations were skipped
  because the local Postgres container was not running, the diagram LLM provider
  check reports the endpoint/model are not configured in local mode, and the default
  local env still warns that invoice-artifacts are demo/local without live object-
  storage/KMS/scanner/WORM settings. Jest also emitted its existing worker graceful-
  exit warning after the web suite while still exiting successfully.

Known gaps carried forward:

- This makes destination evidence assembly repeatable, but it still requires an
  operator-controlled account/subscription/project runner to execute Terraform,
  authenticate to providers, run policy checks, and review the plan.
- PolyCost still does not run `terraform apply`, hold provider credentials, manage
  remote state, or certify a customer landing zone.
- Full production landing-zone Terraform remains future work for private endpoints,
  WAF/CDN integration, least-privilege IAM expansion, Kubernetes/serverless modules,
  active-active DR, and organization controls.

## Phase 2.55 - Rehearsal evidence bundle verification

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added JSON output support to `scripts/provider-credential-check.mjs` via
  `--json`, producing `polycost-provider-credential-check/v1` results with strict
  status, pass/warn/fail counts, and sanitized provider findings.
- Updated the live staging rehearsal path so the strict provider credential step runs
  with `--json` and is parsed into the rehearsal result.
- Added `scripts/invoice-artifact-rehearsal-evidence-check.mjs`, which validates a
  `polycost-invoice-artifact-rehearsal-evidence/v1` bundle after an operator
  archives live target-environment outputs.
- Added
  `docs/operations/evidence/invoice-artifact-rehearsal-evidence.example.json`, a
  sanitized `example-schema` bundle that validates the contract without claiming
  live cloud proof.
- Added `npm run invoice:artifact-rehearsal:evidence:check` and wired it into the
  aggregate `npm run check` floor.
- Updated README, provider-credential docs, and the production profile operator
  controls so live rehearsals end by validating a bundle with
  `npm run invoice:artifact-rehearsal:evidence:check -- --require-live <bundle.json>`.
- Extended release-readiness and progress-verification guards for the provider
  credential JSON contract, evidence bundle checker, sample bundle schema, raw-secret
  guard, live-required mode, and profile archive-reference drift checks.

Verification performed:

- `node --check scripts/provider-credential-check.mjs` passed.
- `node --check scripts/invoice-artifact-rehearsal-evidence-check.mjs` passed.
- `node --check scripts/invoice-artifact-staging-rehearsal.mjs` passed.
- `npm run provider:credentials:check -- --json` passed, returning
  `polycost-provider-credential-check/v1` with the expected local/demo
  invoice-artifacts warning in non-strict mode.
- `npm run invoice:artifact-rehearsal:evidence:check -- --json` passed against the
  example bundle with `verifiedExampleSchema=true`, `verifiedLiveEvidence=false`,
  and `liveEvidenceRequired=true`.
- `npm run invoice:artifact-rehearsal:evidence:check -- --require-live --json`
  failed as intended against the example bundle because sample evidence does not set
  live-run/operator attestations.
- `npm run invoice:artifact-rehearsal:plan -- --json` passed and now lists
  `npm run provider:credentials:check:strict -- --json` in the live checklist.
- `npm run release:check` passed.
- `npm run progress:verify` passed with `203` phase evidence anchors verified.
- Full `npm run check` passed with the evidence bundle checker in the aggregate floor.
  The run included API unit `59` suites / `494` tests, web unit `11` suites / `149`
  tests, graph validation `331` nodes / `331` edges, pricing coverage `36`
  frontend families, progress verification `203` anchors, release readiness,
  handover, DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof/profile/rehearsal/evidence-bundle smokes. Expected
  caveats remained: `impeccable` is skipped on the repo's Node 20 target, live
  Postgres migrations were skipped because the local Postgres container was not
  running, the local cloud check is documentation/config only, and the default local
  env still warns that invoice-artifacts are demo/local without live
  object-storage/KMS/scanner/WORM settings.

Known gaps carried forward:

- This makes live rehearsal evidence machine-verifiable after capture, but it still
  cannot create live cloud evidence without a real target environment, Vault,
  provider object storage, scanner, notary, audit-export receiver, and operator-owned
  WORM/object-lock archives.
- The checked-in evidence bundle is intentionally `example-schema` only. It fails
  `--require-live` until replaced with real staging/prod outputs and live
  attestations.
- Full invoice-grade billing still requires provider invoices of record, private
  discount/credit/tax treatment, legal retention controls, and customer-specific
  reconciliation review.

## Phase 2.54 - Invoice artifact staging rehearsal harness

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `scripts/invoice-artifact-scanner-webhook-smoke.mjs`, a staging canary
  sender for the artifact scanner webhook contract. It sends digest-covered test
  content, signs the request with `x-polycost-artifact-signature`, requires HTTPS
  except for explicit local smoke mode, rejects dummy secrets, and requires a clean
  scanner verdict before passing.
- Added `scripts/invoice-artifact-scanner-local-smoke.mjs`, a local HMAC receiver
  smoke that verifies the scanner payload, signature, checksum, and sender response.
  Sandboxes that disallow local TCP listeners return a structured skip unless
  `POLYCOST_INVOICE_ARTIFACT_SCANNER_LOCAL_SMOKE_STRICT=1` is set.
- Added `scripts/invoice-artifact-staging-rehearsal.mjs` with `--plan` and `--live`
  modes. Plan mode validates the sanitized production profile and prints the exact
  target-environment checklist without reading Vault or calling external services;
  live mode overlays profile runtime config and runs strict provider credentials,
  scanner webhook, notary webhook, and audit-export smokes.
- Added `npm run invoice:artifact-scanner:smoke`,
  `npm run invoice:artifact-scanner:smoke:local`,
  `npm run invoice:artifact-rehearsal:plan`, and
  `npm run invoice:artifact-rehearsal:live`. The aggregate `npm run check` floor now
  includes the local scanner smoke and rehearsal plan gate.
- Updated provider-credential and README guidance so operators can distinguish local
  rehearsal planning from live target-environment proof and archive receiver-side
  WORM/object-lock evidence after live runs.
- Extended release-readiness and progress-verification guards so the scanner sender,
  local receiver smoke, staging rehearsal plan/live modes, and secret-handling
  caveats cannot silently disappear.

Verification performed:

- `node --check scripts/invoice-artifact-scanner-webhook-smoke.mjs` passed.
- `node --check scripts/invoice-artifact-scanner-local-smoke.mjs` passed.
- `node --check scripts/invoice-artifact-staging-rehearsal.mjs` passed.
- `npm run invoice:artifact-scanner:smoke:local` passed in this sandbox with a
  structured `invoice-artifact-scanner-local-smoke/v1` skip because local TCP bind is
  not permitted; strict mode makes that condition fail in runners where local
  listeners are expected.
- `npm run invoice:artifact-rehearsal:plan -- --json` passed and emitted the
  profile check result plus live commands for profile, strict provider credentials,
  scanner webhook, notary webhook, and audit-export smokes.
- `npm run release:check` passed.
- `npm run progress:verify` passed with `189` phase evidence anchors verified.
- Full `npm run check` passed with the scanner local smoke and rehearsal plan in the
  aggregate floor. The run included API unit `59` suites / `494` tests, web unit
  `11` suites / `149` tests, graph validation `330` nodes / `330` edges, pricing
  coverage `36` frontend families, progress verification `189` anchors, release
  readiness, handover, DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof/profile/rehearsal smokes. Expected caveats remained:
  `impeccable` is skipped on the repo's Node 20 target, live Postgres migrations
  were skipped because the local Postgres container was not running, the local cloud
  check is documentation/config only, and the default local env still warns that
  invoice-artifacts are demo/local without live object-storage/KMS/scanner/WORM
  settings.

Known gaps carried forward:

- This adds a repeatable staging rehearsal harness, but live mode was not run in the
  local sandbox because it requires real Vault/provider/scanner/notary/audit
  endpoints and archived target-environment evidence.
- Local scanner smoke is contract proof only when a runner permits local TCP bind; in
  restricted sandboxes it reports a structured skip unless strict mode is enabled.
- PolyCost is still not invoice-grade billing software until a customer environment
  runs the live rehearsal, writes provider object-storage evidence, captures
  receiver-side WORM retention proof, and reconciles against provider invoices of
  record.

## Phase 2.53 - Invoice artifact production profile check

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added `docs/operations/invoice-artifact-production-profile.example.json`, a
  sanitized AWS S3 Object Lock staging-rehearsal profile for invoice artifact
  governance.
- Added `docs/operations/evidence/aws-s3-retention-proof.example.json`, a
  non-secret captured provider proof fixture with future retention and legal-hold
  evidence.
- Added `scripts/invoice-artifact-production-profile-check.mjs`, which validates:
  - external object storage, KMS, webhook scanner, delete-expired retention,
    signed evidence receipts, audit webhook export, provider object-lock posture,
    and provider-control-plane retention proof mode
  - secret-reference-only profile posture, rejecting raw webhook secrets, cloud
    access keys, SAS tokens, service-account JSON paths, and bearer-token style
    runtime fields
  - proof-file existence, repository-relative path safety, SHA-256 digest match,
    runtime/evidence reference consistency, and the existing offline provider
    retention proof verifier result
  - scanner, notary receiver, and audit-export canary archive references
- Added `npm run invoice:artifact-profile:check` and wired it into the aggregate
  `npm run check` floor.
- Updated provider credentials, README, and dummy-values docs to distinguish this
  `verified(config-evidence)` profile check from live Vault/provider proof.
- Added release and progress anchors for the profile checker, example profile, and
  provider proof fixture.

Verification performed:

- `node --check scripts/invoice-artifact-production-profile-check.mjs` passed.
- `npm run invoice:artifact-profile:check` passed against the example profile,
  reporting provider `aws-s3`, verification `verified(config-evidence)`, digest
  `8b7487c43ed9df63249134345b238c0d3db7144e1029d818198ad9c6d3436b84`, and the
  explicit caveat that live cloud evidence is still required.
- `npm run release:check` passed.
- `npm run progress:verify` passed with `175` phase evidence anchors verified.
- Full `npm run check` passed with the new `invoice:artifact-profile:check` in
  the aggregate floor. The run included API unit `59` suites / `494` tests, web
  unit `11` suites / `149` tests, graph validation `330` nodes / `330` edges,
  pricing coverage `36` frontend families, progress verification `175` anchors,
  release readiness, handover, DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof/profile smokes. Expected caveats remained:
  `impeccable` is skipped on the repo's Node 20 target, live Postgres migrations
  were skipped because the local Postgres container was not running, and the
  default local env still warns that invoice-artifacts are demo/local without live
  object-storage/KMS/scanner/WORM settings.

Known gaps carried forward:

- This closes reviewer-readiness for sanitized production artifact-governance
  evidence, but it does not read Vault, write provider object storage, call cloud
  control planes, or prove customer legal immutability.
- Live invoice-grade operation still requires target-environment
  `npm run provider:credentials:check:strict`, real object-store credentials,
  scanner/notary/audit webhook canaries, provider object-lock/KMS controls, and
  archived receiver-side retention evidence.

## Phase 2.52 - Isolated E2E and runtime DI hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Hardened `scripts/ci-e2e.mjs` so Compose E2E uses an isolated project name by
  default instead of the repository directory name.
- Added automatic free host-port selection for the E2E web, API, and Vault
  bindings, with explicit overrides through `POLYCOST_E2E_WEB_PORT`,
  `POLYCOST_E2E_API_HOST_PORT`, and `POLYCOST_E2E_VAULT_HOST_PORT`.
- Changed host-port probing to bind-check `0.0.0.0`, which catches wildcard
  listeners that a localhost-only probe can miss.
- In owned-Compose mode, the runner now pins `POLYCOST_API_ORIGIN`,
  `POLYCOST_API_BASE_URL`, `POLYCOST_WEB_BASE_URL`, CORS, and container/host port
  wiring to the isolated stack it just started.
- Preserved the existing `POLYCOST_E2E_SKIP_COMPOSE` behavior for attaching to an
  already-running stack.
- Added explicit optional Nest injection tokens for function-backed runtime
  collaborators used by invitation delivery, audit export, invoice artifact
  governance, invoice evidence notary, and the optional auth invitation sender.
- Added `apps/api/src/api/runtime-di.spec.ts` and wired it into
  `test:production-readiness` so emitted constructor metadata cannot silently
  regress into production container boot failures.
- Updated README and deployment docs so reviewers know `ci:e2e` can run beside an
  existing local PolyCost or Vault process.
- Added progress and release-readiness guards for the isolated Compose project,
  dynamic port allocator, API origin wiring, Vault host-port override, and runtime
  DI regression coverage.

Verification performed:

- The first `npm run ci:e2e` attempt failed before tests because the default Vault
  host port `8200` was already held by a local `ssh` listener. This exposed the
  port-collision gap fixed in this phase.
- Follow-up attempts exposed two additional real runtime gaps: wildcard listeners
  on the web port were missed by localhost-only probing, and the API container
  failed to boot when Nest treated optional function defaults as DI dependencies.
- `node --check scripts/ci-e2e.mjs` passed.
- Focused API regression passed:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/runtime-di.spec.ts src/api/invitation-delivery.service.spec.ts src/api/team-audit-export.service.spec.ts src/api/invoice-evidence-notary.service.spec.ts src/api/invoice-artifact-governance.service.spec.ts`
  (`5` suites / `21` tests).
- Expanded API regression passed:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/runtime-di.spec.ts src/api/invitation-delivery.service.spec.ts src/api/auth-billing.spec.ts`
  (`3` suites / `62` tests).
- `npm run ci:lint` passed.
- `npm run progress:verify` passed with `165` phase evidence anchors verified.
- `npm run release:check` passed.
- Elevated local `npm run ci:e2e` passed with isolated Compose project
  `polycoste2e88038`, web `http://localhost:58174`, API
  `http://localhost:3301`, and Vault host port `18220`:
  - API E2E: `16/16` passed.
  - Web Playwright: `7/7` passed.
  - Live verification passed with template-to-recommendation `6523ms` /
    `60000ms`, diagram-to-PDF `2698ms` / `180000ms`, workspace auth/RBAC
    `406ms` / `60000ms`, SCIM provisioning `281ms` / `60000ms`, and Redis-down
    degradation returning `/health=degraded`, `/health/deep=degraded`, and
    data-health HTTP `200`.
- Full `npm run check` passed with API unit `59` suites / `494` tests, web unit
  `11` suites / `149` tests, graph validation `328` nodes / `328` edges, pricing
  coverage `36` frontend families, progress verification `165` anchors, release
  readiness, handover, DevOps/cloud/provider-credential gates, and invoice
  evidence/retention-proof smokes. Expected caveats remained: `impeccable` is
  skipped on the repo's Node 20 target, live Postgres migrations were skipped
  because the local Postgres container was not running, and invoice artifact
  governance is still demo/local rather than external object-storage/WORM/KMS
  proof.

Known gaps carried forward:

- Dynamic free-port selection greatly reduces local collision risk, but it is still
  not a replacement for a dedicated CI runner or hosted preview environment.
- Local Docker may still emit environment warnings, such as buildx availability or
  first-time image pulls, before the app-level regression floor starts.
- The existing Vite large-chunk warning remains a frontend optimization item, not a
  release blocker for this phase.

## Phase 2.51 - SCIM live verification transcript

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Extended `scripts/live-verification.mjs` with an API-only
  `scim-provisioning-lifecycle` journey against the running stack.
- The journey creates its own owner/team/session, creates a one-time SCIM token,
  proves token metadata lists never expose raw bearer tokens, verifies
  bearer-protected SCIM discovery, provisions a user, lists it through both SCIM
  and workspace-admin readback, deactivates the user, revokes the token, and
  confirms revoked bearer tokens receive structured `401` responses.
- Added the `POLYCOST_SCIM_JOURNEY_MAX_MS` live threshold and sanitized transcript
  fields that retain only token prefix/status/count evidence, never raw bearer
  tokens.
- Added progress and release-readiness guards so the SCIM live journey, denial
  checks, and metadata-only token proof cannot be removed silently.
- Updated the verification ledger and enterprise IdP onboarding guide to point to
  the live SCIM lifecycle smoke path.

Verification performed:

- `node --check scripts/live-verification.mjs` passed.
- `npm run ci:lint` passed.
- `npm run progress:verify` passed with `160` phase evidence anchors verified.
- `npm run release:check` passed.
- `npm run format:check` passed.
- `npm run check` passed. API unit suites: `58` / `487` tests. Web unit suites:
  `11` / `149` tests. Expected caveats remained: `impeccable` is skipped on the
  repo's Node 20 target, the live Postgres container was not running for
  `db:validate`, and invoice-artifact storage remains demo/local without external
  object-storage/WORM/KMS proof.

Known gaps carried forward:

- This is local/mock-stack proof, not formal Okta/Entra certification, group push,
  IdP-driven role mapping, custom schema extensions, managed IdP pilot evidence, or
  complete enterprise account administration.
- The new `scim-provisioning-lifecycle` path was statically checked and release
  guarded in this branch; executing it still requires a running local/demo stack via
  `npm run live:verify` or the Compose E2E harness.

## Phase 2.50 - SCIM discovery and IdP onboarding

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added SCIM bearer-authenticated discovery endpoints for `/api/v1/scim/v2/Schemas`,
  `/api/v1/scim/v2/Schemas/:schemaId`, `/api/v1/scim/v2/ResourceTypes`, and
  `/api/v1/scim/v2/ResourceTypes/:resourceTypeId`.
- Added typed core User schema and User resource-type responses for IdP discovery
  without exposing tenant/team data.
- Added representative Okta-style, Microsoft Entra-style, and deactivate-patch SCIM
  fixtures under `fixtures/scim/`.
- Added service tests proving discovery requires a valid SCIM bearer token and that
  the representative IdP create/deactivate fixture shapes are accepted without
  storing raw bearer tokens.
- Added `docs/ENTERPRISE-IDP-ONBOARDING.md` with setup fields, endpoint summary,
  smoke commands, token-handling checklist, and explicit non-certification boundary.
- Added README/user-guide links and release-readiness guards for discovery routes,
  fixtures, docs, and tests.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/scim-provisioning.service.spec.ts src/api/scim-provisioning.controller.spec.ts`
  passed: 2 suites / 13 tests.
- `npm run ci:lint` passed with no new warning-only security findings from the
  SCIM fixture loader.
- `npm run format:check`, `npm run progress:verify`, and `npm run release:check`
  passed after adding the SCIM discovery and IdP onboarding guards.
- Full `npm run check` passed: API unit 58 suites / 487 tests, web unit 11 suites
  / 149 tests, graph validation 327/327, pricing coverage, progress verification
  153 anchors, release/handover/provider gates green. Expected caveats remained:
  live Postgres `schema_migrations` inspection skipped because the container was
  not running, Node 20 skipped `impeccable`, and invoice-artifact governance warned
  for demo/local storage posture.

Known gaps carried forward:

- This improves IdP interoperability and operator readiness, but does not claim
  formal SCIM certification, production SSO/SAML/OIDC certification, group push,
  IdP-driven role mapping, custom schema extensions, account recovery, org billing
  UX, or a complete enterprise IAM administration product.

## Phase 2.49 - SCIM admin workspace UX

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added a session-authenticated admin read route,
  `GET /api/v1/auth/teams/:teamId/scim/users`, so team owners/admins can inspect
  provisioned SCIM users without using or exposing IdP bearer tokens in the browser.
- Wired the web API client to list SCIM token metadata, list provisioned users,
  create one-time-visible SCIM tokens, and revoke token metadata through the normal
  workspace session bearer.
- Added workspace Team access UI for SCIM provisioning posture: active token/user
  counts, compact token/user lists, one-time token reveal, revoke action, revoked
  and deactivated states, and SCIM audit-event labels.
- Kept raw SCIM bearer tokens out of persistent browser storage. The only raw token
  display is the immediate post-create response, labeled for copy-once handling.
- Added release-readiness guards so the SCIM admin UI labels and web client routes
  cannot be silently removed.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/scim-provisioning.service.spec.ts src/api/scim-provisioning.controller.spec.ts`
  passed: 2 suites / 10 tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`
  passed: 2 suites / 92 tests.
- `npm run ci:lint`, `npm run progress:verify`, `npm run release:check`, and
  `npm run format:check` passed after adding the SCIM UI/client guards.
- Full `npm run check` passed: API unit 58 suites / 484 tests, web unit 11 suites
  / 149 tests, graph validation 326/326, pricing coverage, progress verification
  153 anchors, release/handover/provider gates green. Expected caveats remained:
  live Postgres `schema_migrations` inspection skipped because the container was
  not running, Node 20 skipped `impeccable`, and invoice-artifact governance warned
  for demo/local storage posture.

Known gaps carried forward:

- This closes the visible self-hosted/demo SCIM admin loop, but not formal SCIM
  certification, production IdP onboarding guides for every vendor, production SSO
  certification, account recovery, org billing UX, or a complete enterprise IAM
  administration product.

## Phase 2.48 - SCIM provisioning foundation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-09

What changed:

- Added migration `040_team_scim_provisioning.sql` with `team_scim_tokens` and
  `team_scim_external_users` tables, token-hash checks, no plaintext token storage,
  least-privilege runtime grants, and team audit allow-list entries for SCIM token
  and user lifecycle events.
- Added owner/admin guarded SCIM token administration endpoints under
  `/api/v1/auth/teams/:teamId/scim/tokens`; token values are returned once on
  creation, while persisted rows keep only hash and display-prefix metadata.
- Added bearer-token-authenticated `/api/v1/scim/v2/Users` endpoints for listing,
  creating, replacing, active-state patching, and deactivating IdP-managed users.
- Added transactional repository support that attaches active SCIM users to the
  workspace as `member`, removes the team membership on deactivation, and records
  token/user lifecycle audit events without storing raw bearer tokens.
- Added focused SCIM service/controller tests and wired them into
  `npm run test:production-readiness` plus release-readiness checks.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/scim-provisioning.service.spec.ts src/api/scim-provisioning.controller.spec.ts`
  passed: 2 suites / 9 tests.
- `npm run typecheck --workspace @polycost/api` passed.
- `npm run db:validate` passed; live schema check was skipped because the local
  Postgres container was not running.
- `npm run test:production-readiness` passed: API 16 suites / 213 tests and web
  2 suites / 90 tests.
- `npm run check` passed: API unit 58 suites / 483 tests, web unit 11 suites / 147
  tests, graph validation 326/326, release/progress/handover/provider gates green.
  Expected local caveats remained: live Postgres migration check skipped because the
  container was not running, Node 20 skipped `impeccable`, and invoice-artifacts
  warned for demo/local storage posture.

Known gaps carried forward:

- This is a SCIM provisioning foundation for self-hosted/demo use, not formal SCIM
  certification or a complete enterprise IAM product. SSO provider certification,
  account recovery UX, invite/approval workflows, team administration depth, and
  full RBAC product UX remain future phases.

## Phase 2.13 - Invite delivery webhook foundation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added `InvitationDeliveryService` with local/demo panel mode and production
  webhook mode for team invite delivery.
- Added HMAC-SHA256 signed webhook payloads carrying the invite URL to an external
  delivery provider without logging or storing raw invite tokens.
- Added staging/production config guards requiring `AUTH_INVITE_DELIVERY_MODE=webhook`,
  an HTTPS webhook URL, and a non-dummy signing secret before workspace invites are
  production-ready.
- Updated invite create/resend responses so webhook mode reports delivery status
  while withholding raw invite tokens from the browser.
- Added workspace UI delivery-status messaging for accepted/failed delivery provider
  responses.
- Updated `.env.example`, README, deployment/runbook, architecture, and dummy-value
  docs for invite delivery operations.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/invitation-delivery.service.spec.ts src/config/config.schema.spec.ts src/api/auth-billing.spec.ts`
  passed: 3 suites / 37 tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed: 2 suites / 85 tests.
- `npm run ci:lint` passed with zero ESLint/typecheck errors.
- `npm run test:production-readiness` passed: API 12 suites / 155 tests and web
  2 suites / 85 tests.
- `npm run check` passed: API 52 suites / 411 tests, web 11 suites / 142 tests,
  graph validation 314 nodes / 314 edges, pricing coverage, progress
  verification, QA/security suppressions, database, DevOps, cloud, release,
  handover, and provider credential gates.
- `npm run ci:build` passed for API and web.
- `npm audit --audit-level=high` passed; it still reports the documented low
  transitive Graphify advisory with no available fix.

Known remaining gaps:

- PolyCost now has a production-safe invite delivery integration boundary, but not
  built-in SMTP/provider-specific email templates, bounce handling, delivery
  analytics, invite audit-log UI, SCIM provisioning, or full enterprise account
  administration.

## Phase 2.12 - Workspace invitation resend lifecycle

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added a guarded `POST /api/v1/auth/teams/:teamId/invitations/:invitationId/resend`
  endpoint that lets team owners/admins rotate a pending or expired invite token.
- Added repository-level token-hash replacement that refreshes expiry, clears
  revoked metadata, and never stores or returns the raw token outside the response.
- Added a typed web client method and workspace-panel `Resend` action that keeps
  pending/expired invitations visible, shows their status, and surfaces the refreshed
  one-time invite token/link for demos.
- Extended API/web unit coverage for controller guards, service RBAC, repository SQL,
  typed client routing, and the signed-in workspace invite flow.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth.controller.spec.ts src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed: 3 suites / 45 tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed: 2 suites / 84 tests.
- `npm run ci:lint` passed with zero ESLint/typecheck errors.
- `npm run test:production-readiness` passed: API 10 suites / 139 tests and web
  2 suites / 84 tests.
- `npm run check` passed: API 51 suites / 405 tests, web 11 suites / 141 tests,
  graph validation 312 nodes / 312 edges, pricing coverage, progress
  verification, QA/security suppressions, database, DevOps, cloud, release,
  handover, and provider credential gates.
- `npm run ci:build` passed for API and web.
- `npm audit --audit-level=high` passed; it still reports the documented low
  transitive Graphify advisory with no available fix.

Known remaining gaps:

- The resend flow still exposes the one-time token in the demo workspace panel
  because production email delivery is not yet implemented.
- Enterprise account UX remains incomplete: no invitation emails/templates, SAML/SCIM
  admin workflows, recovery flows, or full org/account administration console yet.

## Phase 2.11 - Workspace active team switching

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added a guarded `POST /api/v1/auth/sessions/team` endpoint that switches the
  current session's active team only when the account has a membership in the
  requested team.
- Added repository-level membership-proof SQL for updating `account_sessions.team_id`
  without issuing a new login token.
- Added a typed web client method and signed-in workspace selector so users can
  change active teams directly from the account panel.
- Updated team creation so a new team is immediately selected in the current session
  instead of telling users to sign in again.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth.controller.spec.ts src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed: 3 suites / 45 tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed: 2 suites / 84 tests.
- `npm run test:production-readiness` passed: API 10 suites / 139 tests and web
  2 suites / 84 tests.
- `npm run check` passed: API 51 suites / 405 tests, web 11 suites / 141 tests,
  graph validation 312 nodes / 312 edges, pricing coverage, progress
  verification, QA/security suppressions, database, DevOps, cloud, release,
  handover, and provider credential gates.
- `npm run ci:build` passed for API and web.
- `npm audit --audit-level=high` passed; it still reports the documented low
  transitive Graphify advisory with no available fix.

Known remaining gaps:

- This closes one account/team lifecycle rough edge for demos, but production email
  delivery, external SSO/SAML handshakes, SCIM, org billing plans, account recovery,
  and a complete hosted account administration UX remain future release-track work.

## Phase 2.10 - Billing export mapper hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Hardened provider billing export normalization so literal CSV headers still win,
  while JSON rows can also resolve dotted paths such as `service.description`,
  `sku.id`, `location.region`, `usage.amount`, and `project.labels`.
- Counted Azure `CostInBillingCurrency`/`PreTaxCost` fallback cost columns as valid
  cost evidence when `CostInUSD` is absent.
- Added Azure tag and GCP label columns to provider-export recognition metadata so
  `_polycost.recognizedColumns` and readiness labels reflect parsed allocation
  evidence.
- Added focused billing tests for Azure Cost Management CSV export ingestion and
  nested GCP Billing Export JSON ingestion.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed: 1 suite / 20 tests.
- `npm run test:production-readiness` passed: API 10 suites / 138 tests and web
  2 suites / 84 tests.
- `npm run check` passed: API 51 suites / 403 tests, web 11 suites / 141 tests,
  graph validation 312 nodes / 312 edges, pricing coverage, progress
  verification, QA/security suppressions, database, DevOps, cloud, release,
  handover, and provider credential gates.
- `npm run ci:build` passed for API and web.
- `npm audit --audit-level=high` passed; it still reports the documented low
  transitive Graphify advisory with no available fix.

Known remaining gaps:

- This strengthens native provider billing export ingestion for reconciliation
  evidence, but it is still not invoice-grade billing: private discounts, credits,
  taxes, enterprise agreements, marketplace/private offers, amortization semantics,
  and provider invoice-of-record reconciliation remain future release-track work.
- Real customer exports still need customer-controlled data handling, redaction, and
  account-specific validation before public production use.

## Phase V3.5 - Terraform bundle integrity validation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added `scripts/verify-manifest.mjs` to every generated Terraform bundle.
- The generated verifier reads `BUNDLE-MANIFEST.json`, verifies every listed file
  hash and size, writes `terraform-manifest-integrity-result.json`, and exits
  non-zero when the saved ZIP handoff is incomplete or tampered with.
- `scripts/validate-bundle.mjs`, `BUNDLE-MANIFEST.json`, generated README guidance,
  and API validation checks now include the manifest-integrity gate before
  Terraform/provider-authenticated validation.
- Added a materialized-bundle regression test that writes generated files to an
  isolated temp directory, proves the verifier passes, tampers with `main.tf`, and
  proves the verifier fails with a hash mismatch.
- Updated `docs/architecture/phase-v3-3-terraform-bundle-export.md` and
  `docs/verification/full-progress-ledger.md` with the new evidence.

Verification performed:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts`
  passed: 1 suite / 6 tests.
- `npm run ci:lint` passed with zero warnings after the reviewed test-only
  filesystem suppression was added to `docs/SECURITY-SUPPRESSIONS.md`.
- `npm run security:suppressions` passed: 23 reviewed suppressions.
- `npm run test:production-readiness` passed: API 10 suites / 136 tests; web 2
  suites / 84 tests.

Known remaining gaps:

- This closes the credential-free ZIP handoff integrity gap, but it is not a
  provider-authenticated `terraform init/validate/test/plan` execution in a real
  AWS account, Azure subscription, or GCP project.
- Landing-zone integration, edge/observability/DR modules, container/serverless/
  Kubernetes module generation, active-active DR, and real policy gates against
  destination-account plan JSON remain future IaC phases.

## Formal browser audit tooling

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added formal `axe-core` and Node-20-compatible Lighthouse 12 browser audit
  coverage to `npm run browser:audit`.
- Replaced the preview-server dependency with a deterministic static/API audit
  harness so Lighthouse and Playwright exercise the production web build with
  stable mocked API responses.
- Fixed audit-discovered accessibility issues across the workspace auth toggle,
  chart semantics, focusable scroll regions, provider pricing bars, calculator
  links, matrix unavailable labels, and FinOps/persona comparison contrast.
- Regenerated `docs/browser-audit/2026-07-08/` with passing machine-readable
  evidence and screenshots.

Verification performed:

- `npm run format:check` passed.
- `npm run public:readiness:check` passed.
- `npm run release:check` passed.
- `npm run ci:lint` passed.
- `npm run test:production-readiness` passed: API 10 suites / 135 tests; web 2
  suites / 84 tests.
- `npm run check` passed: API 51 suites / 400 tests; web 11 suites / 141 tests;
  graph validation 312 nodes / 312 edges; pricing coverage, progress
  verification, QA/security suppression, database, DevOps, cloud, release,
  handover, and provider credential gates passed.
- `npm run ci:build` passed.
- `npm run browser:audit` passed.
  - Scenarios: desktop executive/engineering, 320px reflow, 200% zoom-equivalent
    reflow.
  - Formal axe: zero violations across home, executive, and engineering states
    in all scenarios.
  - Lighthouse: Performance 1.00, Accessibility 1.00, Best Practices 1.00, SEO
    0.92.
  - Artifact: `docs/browser-audit/2026-07-08/browser-audit.json`.
- `npm audit --audit-level=high` passed; it still reports the known three low
  Graphify/Ollama transitive advisories with no available fix.

Known remaining gaps:

- The browser audit is local deterministic evidence, not hosted GitHub Actions
  evidence; remote CI runner allocation remains an external account/billing
  blocker.
- Real provider, production SSO, production LLM, and Terraform provider validation
  still require external credentials or a staging environment.

## Browser audit artifact hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added `npm run browser:audit`.
- Added `scripts/browser-audit.mjs`, a Playwright-native production-build audit
  runner that starts Vite preview, mocks backend endpoints, captures desktop,
  320px reflow, and 200% zoom-equivalent evidence, and writes JSON/Markdown
  artifacts.
- Added `docs/browser-audit/README.md` plus the dated
  `docs/browser-audit/2026-07-08/` artifact bundle with executive and engineering
  screenshots.
- Added a semantic result-mode `h1` for comparison pages while preserving the
  existing visual layout.
- Wired the browser audit command into README, public demo hardening docs,
  open-source readiness, release checklist, and release/public readiness guards.

Verification performed:

- `npm run browser:audit` passed.
  - Scenarios: desktop executive/engineering, 320px reflow, 200% zoom-equivalent
    reflow.
  - Checks: horizontal overflow, visible control names, image alt attributes, main
    landmark/h1, keyboard focus trace, console errors, page errors.
  - Artifact: `docs/browser-audit/2026-07-08/browser-audit.json`.

Known remaining gaps:

- Superseded by the formal browser audit tooling checkpoint on 2026-07-08: axe-core
  and Lighthouse now run inside `npm run browser:audit`.
- The 200% evidence remains a 640px CSS viewport equivalent, not Chrome's formal
  browser zoom control.

## Public OSS readiness and demo hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added `docs/development/public-demo-hardening.md` as the public demo readiness
  checklist for private-to-public launch review.
- Added `npm run public:readiness:check` to validate community files, demo evidence
  hooks, release honesty language, tracked environment-file safety, and provider-logo
  safeguards.
- Wired `public:readiness:check` into the full `npm run check` regression floor and
  into `npm run release:check` drift validation.
- Updated README, release checklist, contribution guide, PR template, and changelog
  with the new public readiness command.
- Hardened demo artifact capture to wait on visible app readiness and scroll state
  instead of fixed sleeps.

Verification planned/performed in this branch:

- `npm run public:readiness:check`
- `npm run release:check`
- `npm run handover:check`
- `npm run format:check`
- `npm run ci:lint`
- `npm run check`: API unit `51` suites / `400` tests; web unit `11` suites /
  `141` tests; graph validation `309` nodes / `309` edges; public readiness,
  release, handover, provider credential, and QA gates passed.
- `npm run ci:build`: API TypeScript build and web Vite build passed with the
  existing environment-placeholder and chunk-size warnings.

Known remaining gaps:

- Superseded by the formal browser audit tooling checkpoint on 2026-07-08: fresh
  Lighthouse, axe, 320px reflow, and 200% zoom-equivalent artifacts now exist
  under `docs/browser-audit/2026-07-08/`.
- Real provider/SSO/LLM/Terraform validation still requires external credentials
  or a staging environment.
- Hosted GitHub Actions runner availability remains an external repository/account
  prerequisite before remote CI can be treated as release evidence.

## Customer handover excellence orchestrator

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Combined the customer handover docs branch with the Appendix L loading/progress
  and Appendix O overlay/button systems on one final handover branch.
- Added `HANDOVER-CENSUS.md` and `HANDOVER-EXCELLENCE-REPORT.md`.
- Added the explicit `handover/` package: handover README, design-system handoff,
  core journeys, known limits, demo script, and screenshot gallery index.
- Added a keyboard skip link to the SPA shell and expanded web metadata for
  customer-facing previews.
- Extended `npm run handover:check` and `npm run release:check` so the final
  census/report/package cannot drift silently.

Verification planned/performed in this branch:

- `npm run handover:check` passed: 14 handover docs verified.
- `npm run loading:check`, `npm run overlay:check`, and `npm run theme:hex:check`
  passed.
- `npm run ci:lint` passed.
- Focused web component tests passed: 4 suites / 12 tests.
- `npm run test:production-readiness` passed: API 10 suites / 135 tests; web 2
  suites / 84 tests.
- `npm run check` passed: API 51 suites / 400 tests; web 11 suites / 141 tests;
  graph validation 308 nodes / 308 edges; release/handover/provider gates passed.
- `npm run ci:build` passed with the existing Vite placeholder/chunk-size warnings.

Known remaining gaps:

- Superseded by the formal browser audit tooling checkpoint on 2026-07-08:
  Lighthouse, axe, 320px reflow, and 200% zoom-equivalent artifacts now exist
  under `docs/browser-audit/2026-07-08/`.
- Real provider/SSO/LLM/Terraform proof requires external credentials and customer
  environment access.
- The SPA still has no dedicated product 404 route; Vite/app fallback handles
  unknown paths.

## Customer handover and production excellence package

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added the canonical customer handover documentation package under `docs/`:
  user guide, deployment guide, operations runbook, competitive comparison,
  architecture overview, and customer handover ledger.
- Added `npm run handover:check` to validate the handover docs and wired it into
  the full `npm run check` regression floor.
- Extended release-readiness automation so the handover package is required before
  public/open-source release review.
- Updated README, changelog, dummy-value notes, and release checklist so customer
  handover boundaries are discoverable from the repo entry points.

Verification:

- `npm run handover:check`
- `npm run release:check`
- `npm run format:check`
- `npm run ci:lint`
- `npm run test:production-readiness`
  - API focused: `10` suites / `135` tests.
  - Web focused: `2` suites / `84` tests.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.
- `npm run check`
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

Known remaining gaps:

- The handover package documents the current honest product boundary; it does not
  close future phases for invoice-grade billing, full Visio rendering, production
  LLM corpus quality, enterprise auth/team product depth, or full landing-zone
  Terraform.
- Hosted GitHub Actions runner allocation remains an external blocker until the
  repository account can allocate runners and execute workflow steps.

## Loading and progress experience audit/build

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added the canonical loading component set in
  `apps/web/src/components/LoadingExperience.tsx`: boot splash, staged session
  loader, skeleton presets, progress bar, loading status, task queue, job toast, and
  live-tail indicator.
- Updated `TopLoadingBar` to delay-mount after `150ms` and hold completion for
  `320ms`, preventing flash-of-loader behavior on instant waits.
- Wired the new components into app boot, workspace session hydration, team/SSO
  sync, pricing evidence loading, comparison workspace loading, shared report
  loading, and export/refresh activity.
- Added `LOADING-INVENTORY.md`, `LOADING-AUDIT-REPORT.md`, and
  `npm run loading:check`; wired the gate into `npm run check` and
  `npm run release:check`.

Verification:

- `npm run test:unit --workspace @polycost/web -- --runInBand src/components/LoadingExperience.spec.tsx src/components/TopLoadingBar.spec.tsx`
  - Web focused: `2` suites / `7` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  - Web focused: `2` suites / `84` tests.
- `npm run format:check`
- `npm run ci:lint`
- `npm run loading:check`
- `npm run theme:hex:check`
- `npm run test:production-readiness`
  - API focused: `10` suites / `135` tests.
  - Web focused: `2` suites / `84` tests.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.
- `npm run check`
  - API unit: `51` suites / `400` tests.
  - Web unit: `10` suites / `137` tests.
  - Graph validation: `300` nodes / `300` edges.
  - Pricing coverage guard: `36` frontend priced families covered.
  - Progress verification: `153` phase evidence anchors.
  - Security suppression check: `22` reviewed suppressions.
  - Database validation, DevOps check, cloud readiness, release readiness,
    loading, and provider credential gates passed.
  - `db:validate` skipped the live `schema_migrations` check because the Postgres
    container was not running.
  - `cloud:check` remains documentation/config only because deployable IaC is not
    present.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.

Known remaining gaps:

- Exact export-job percentages remain blocked by the current API contract; the UI
  shows report job phase/state without inventing progress.
- Dedicated dual-mode loading-state screenshots were not captured in this pass
  because mid/failure loading states need either route-level fixture hooks or a
  loading-state showcase route.
- Real auth redirect timing is not measurable in the current anonymous-first SPA
  without an auth callback route or instrumentation hook.

## UI Appendix O - Overlay/dialog/button audit

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-08

What changed:

- Added canonical shared overlay primitives for dialogs, destructive confirms,
  drawers, popovers, toast stacks, and banners.
- Expanded the shared button system with `destructiveQuiet`, `link`, `icon`, and
  size variants so filled destructive buttons stay reserved for destructive
  confirmations.
- Migrated row-level clear/remove/revoke/reload/refresh utility actions to the
  shared button contract.
- Added `OVERLAY-INVENTORY.md`, `BUTTON-INVENTORY.md`, and
  `OVERLAY-AUDIT-REPORT.md`.
- Added `npm run overlay:check` and wired it into `npm run check` and
  `npm run release:check`.

Verification:

- `npm run overlay:check`
- `npm run test:unit --workspace @polycost/web -- --runInBand src/components/Button.spec.tsx src/components/OverlayPrimitives.spec.tsx`
- `npm run theme:hex:check`
- `npm run ci:lint`
- `npm run release:check`

Known remaining gaps:

- No production flow currently opens every new overlay primitive, so full
  end-user screenshot evidence needs either a dedicated showcase route or the
  first real product flow using each primitive.
- Announcement frequency persistence is documented but not runtime-wired because
  the app has no promotional announcement overlay today.
- Existing account deletion remains an inline typed-confirmation form pending a
  broader account/team UX pass.

## Phase V3.4 - Terraform module library

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Upgraded generated `modules/` from documentation-only boundaries to real
  provider-specific starter module files.
- Added network, compute, and data module `variables.tf`, `main.tf`, and
  `outputs.tf` for AWS, Azure, and GCP bundles.
- Added the `module-library-generated` static validation check.
- Updated module documentation so reviewers understand the root bundle remains
  the immediate review baseline while modules are the platform extraction path.
- Added `docs/architecture/phase-v3-4-terraform-module-library.md`.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts src/api/api-contract.spec.ts`
  - API focused: `2` suites / `42` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`
  - Web focused: `2` suites / `84` tests.
- `npm run check`
  - API unit: `51` suites / `400` tests.
  - Web unit: `9` suites / `132` tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.

Known remaining gaps:

- Generated modules are starter modules, not a published enterprise module
  registry or landing-zone integration.
- Edge, observability, WAF/CDN, autoscaling, container/serverless/Kubernetes,
  and active-active DR modules remain future Terraform phases.
- Provider-authenticated `terraform init`, `validate`, `test`, and `plan` still
  run outside PolyCost request handling.

## Phase V3.3 - Terraform bundle export

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `archive` metadata to `TerraformGenerationResult` with ZIP filename,
  MIME type, base64 payload, archive SHA-256, and size in bytes.
- Added deterministic ZIP packaging for every generated Terraform bundle without
  adding a new runtime dependency.
- Added generated `BUNDLE-MANIFEST.json` with bundle metadata, file hashes,
  file sizes, generation profile, resource summary, and validation commands.
- Added generated `scripts/validate-bundle.mjs` that operators can run after
  saving the bundle to execute Terraform fmt/init/validate plus optional test,
  tflint, and conftest checks.
- Added `bundle-manifest-generated`, `validation-runner-generated`, and
  `zip-archive-generated` static validation checks.
- Updated the frontend Terraform panel with separate `Download Terraform ZIP`
  and `Download evidence JSON` actions.
- Added `docs/architecture/phase-v3-3-terraform-bundle-export.md`.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts src/api/api-contract.spec.ts`
  - API focused: `2` suites / `42` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`
  - Web focused: `2` suites / `84` tests.
- `npm run check`
  - API unit: `51` suites / `400` tests.
  - Web unit: `9` suites / `132` tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.

Known remaining gaps:

- PolyCost packages Terraform but does not execute it server-side.
- Provider credentials, remote-state bootstrap, plan review, and policy
  enforcement remain operator or CI responsibilities outside request handling.

## Phase V3.2 - Terraform framework assurance

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added generated `FRAMEWORK-ALIGNMENT.md` to every Terraform bundle so reviewers
  can map output to AWS/Azure/GCP architecture frameworks plus Terraform platform
  controls.
- Added `framework-alignment-pack` and `topology-aware-ingress` static validation
  checks.
- Added `enable_public_load_balancer` to AWS, Azure, and GCP generated variables
  and tfvars examples.
- Tightened generated private-topology ingress:
  - AWS HTTPS ingress uses VPC CIDR and ALB becomes internal/private-subnet based.
  - Azure NSG source becomes `VirtualNetwork` and load balancer can use an internal
    frontend.
  - GCP HTTPS firewall uses workload subnet CIDR and public global address
    reservation is disabled unless explicitly requested.

Verification:

- `npm run format:check`
  - Prettier check passed.
- `npm run ci:lint`
  - ESLint and TypeScript checks passed.
- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts src/api/api-contract.spec.ts`
  - API focused: `2` suites / `42` tests.
- `npm run test:production-readiness`
  - API focused: `10` suites / `135` tests.
  - Web focused: `2` suites / `84` tests.
- `npm run check`
  - API unit: `51` suites / `400` tests.
  - Web unit: `9` suites / `132` tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.

Known remaining gaps:

- Framework alignment is generated review evidence, not a substitute for a real
  provider Well-Architected/CAF assessment workshop.
- Provider-native WAF/CDN, autoscaling groups, organization policy assignments,
  full logging/audit modules, and active-active DR remain future Terraform module
  phases.

## Phase V3.1 - Terraform hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added Terraform generation profile options for runtime target, network topology,
  availability mode, policy-pack inclusion, and module-scaffold inclusion.
- Added response-level `generationProfile` evidence for every generated bundle.
- Added hardened bundle artifacts: `Makefile`, `.tflint.hcl`,
  `tests/static_validation.tftest.hcl`, `policies/terraform-plan.rego`, and
  `modules/` boundary documentation.
- Hardened AWS output with private subnets, private RDS subnet group, explicit
  non-public RDS exposure, and EC2 role/instance-profile baseline.
- Hardened Azure output with optional direct public IPs, VM managed identity,
  delegated PostgreSQL subnet, private DNS link, and PostgreSQL public network
  access disabled.
- Hardened GCP output with optional external access configs, VM service account,
  Private Google Access, Cloud Storage public-access prevention, and Cloud SQL
  private service access.
- Expanded static validation to check private database networking, runtime identity,
  policy artifacts, Terraform test harness, and module boundary documentation.
- Updated the frontend Terraform panel with runtime/topology/availability controls
  and profile chips.
- Added `docs/architecture/phase-v3-1-terraform-hardening.md`.

Verification:

- `npm run format:check`
  - Prettier check passed.
- `npm run ci:lint`
  - ESLint and TypeScript checks passed.
- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts src/api/api-contract.spec.ts`
  - API focused: `2` suites / `42` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`
  - Web focused: `2` suites / `84` tests.
- `npm run test:production-readiness`
  - API focused: `10` suites / `135` tests.
  - Web focused: `2` suites / `84` tests.
- `npm run check`
  - API unit: `51` suites / `400` tests.
  - Web unit: `9` suites / `132` tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.

Known remaining gaps:

- This is still not a full enterprise landing-zone module library.
- Container, serverless, and Kubernetes targets are explicit manual-review module
  boundaries until provider-native runtime modules are implemented.
- Active-active and multi-region DR remain recorded generation intent, not full
  generated multi-region topology.
- Real provider `terraform init`, `validate`, `test`, `plan`, and policy execution
  still run outside PolyCost with real credentials and destination account controls.

## Phase V3 - Terraform generation MVP

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `POST /api/v1/terraform/generate`, backed by the existing NWS validator,
  for `aws`, `azure`, and `gcp` Terraform starter bundles.
- Generated bundles include pinned official HashiCorp providers, provider-native
  auth expectations, remote-state examples, variables with validation blocks,
  cost-allocation tags/labels, baseline network/compute/object-storage/database
  resources, outputs, tfvars examples, SHA-256 file hashes, static validation
  checks, assumptions, security notes, and next steps.
- Added frontend client wiring and an Infrastructure as Code panel in the
  comparison workspace with target-cloud selection, validation chips, file
  inventory, mappings, assumptions, security notes, preview, and bundle JSON
  download.
- Added `docs/architecture/phase-v3-terraform-generation.md` and wired the
  Terraform generator spec into `npm run test:production-readiness`.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/terraform/terraform-generation.service.spec.ts src/api/api-contract.spec.ts`
  - API focused: `2` suites / `40` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`
  - Web focused: `2` suites / `84` tests.
- `npm run test:production-readiness`
  - API focused: `10` suites / `133` tests.
  - Web focused: `2` suites / `84` tests.
- `npm run check`
  - API unit: `51` suites / `398` tests.
  - Web unit: `9` suites / `132` tests.
  - Graph validation, pricing coverage, progress verification, QA/security
    suppression, database, DevOps, cloud, release, and provider credential gates
    passed.
- `npm run ci:build`
  - API TypeScript build passed.
  - Web production build passed with the existing Vite environment-placeholder and
    chunk-size warnings.

Known remaining gaps:

- Generated Terraform is a reviewed starter bundle, not a full module library or
  production landing-zone implementation.
- Request-time validation is static. Operators still need to save the generated
  files and run `terraform init`, `terraform fmt -check`, `terraform validate`,
  policy checks, and `terraform plan` with real cloud credentials.
- VM-first compute is generated for portability. Container, serverless, Kubernetes,
  advanced networking, private endpoints, CDN distributions, WAF, IAM role
  minimization, multi-account/multi-subscription/multi-project layouts, and
  active-active DR modules remain future refinement.

## Phase 2.9 - Production gap closure continuation

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added provider-export column registries for AWS CUR, Azure Cost Management, and
  GCP Billing Export so import normalization and trace evidence use the same source
  map.
- Added `_polycost` normalization audit metadata to imported provider-export line
  item `rawPayload`, including source-row fingerprint, recognized source columns,
  missing recommended fields, and a provider-export audit status.
- Expanded invoice reconciliation evidence with source-row fingerprints, coverage
  percentages, SKU/service match summaries, readiness labels, and explicit caveats
  that reconciliation is not an invoice of record.
- Surfaced reconciliation readiness, source-fingerprint coverage, SKU match coverage,
  and the primary invoice caveat in the workspace billing panel.
- Enriched VSDX extraction with page ID, page size, normalized preview bounds,
  geometry hints, layout-extraction mode, and the explicit caveat that PolyCost is
  not doing full Visio visual rendering.
- Added an LLM classifier readiness surface that distinguishes stub/unconfigured mode
  from OpenAI-compatible configured mode without reading secrets or calling the model.

Verification:

- `npm run format:check`
- `npm run ci:lint`
- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/diagram-parser/diagram-parser.service.spec.ts src/diagram-parser/llm-classifier.client.spec.ts`
  - API focused: `3` suites / `52` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  - Web focused: `1` suite / `57` tests.
- `npm run check`
  - API unit: `50` suites / `392` tests.
  - Web unit: `9` suites / `130` tests.
  - Graph validation, pricing coverage, progress verification, QA/security suppression,
    database, DevOps, cloud, release, and provider credential gates passed.

Known remaining gaps:

- Invoice reconciliation now has stronger traceability and coverage proof, but full
  invoice-grade billing remains future work because private discounts, credits,
  taxes, enterprise agreements, marketplace charges, and provider invoice-of-record
  reconciliation still require provider/account-specific controls.
- VSDX parsing now carries layout geometry and preview caveats, but it is still not a
  full Visio renderer.
- The LLM classifier now reports readiness clearly, but production quality still
  requires a real endpoint/model, Vault secret, monitored corpus evaluation, and
  false-positive tracking.
- Account/team UX is clearer around billing evidence, but production email delivery,
  SSO/SAML handshakes, org billing UX, and full account/team lifecycle polish remain
  future phases.

## Production readiness orchestrator v2 pass

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Moved the production-readiness orchestrator documents into the requested
  `docs/design/*` entrypoint path.
- Added `STATE-SYNC.md` and `THEME-INVENTORY.md` for the v2 continuation protocol.
- Split frontend tokens into `apps/web/src/styles/tokens.css`, added the PolyCost
  violet default accent, added the terracotta accent axis, and wired the existing
  Appearance control to persist both Mode and Accent before hydration.
- Added `npm run theme:hex:check` and the matching CI gate so raw hex values in
  frontend source are blocked outside the dedicated token file.
- Added additive `/health/live`, `/api/v1/health/live`, `/health/ready`, and
  `/api/v1/health/ready` endpoints while preserving existing `/health` and
  `/health/deep` behavior.
- Captured the dual-mode/default-accent and dual-mode/terracotta smoke archive in
  `docs/theme-audit/2026-07-07/`.
- Added `PRODUCTION-READINESS-REPORT.md`.

Runtime evidence:

- Theme archive token checks:
  - dark/default: `--brand-500=#a879f0`, `--surface-canvas=#0b0e14`
  - light/default: `--brand-500=#7c4fd0`, `--surface-canvas=#f5f4ef`
  - dark/terracotta: `--brand-500=#d97757`, `--surface-canvas=#0b0e14`
  - light/terracotta: `--brand-500=#d97757`, `--surface-canvas=#f5f4ef`
- Isolated full-stack retry on `WEB_PORT=3230`, `API_HOST_PORT=3231`,
  `VAULT_HOST_PORT=8340`:
  - API E2E passed `16/16`.
  - Direct web Playwright passed `7/7`.
  - Direct `live:verify` passed with template-to-recommendation `4201ms`,
    diagram-to-PDF `3448ms`, workspace auth/RBAC `507ms`, and Redis degradation
    `/health=degraded`, `/health/deep=degraded`, data-health HTTP `200`.
- Transcript `.tmp/live-verification/latest-v2-prod-ready.json` was scanned for
  secret-like fields; only benign labels and `stateVerified: true` were present.

Verification:

- `npm run format:check`
- `npm run ci:lint`
- `npm run theme:hex:check`
- `npm run check`
- `npm run test:production-readiness`
- `npm run ci:build`
- API E2E directly through the isolated `ci:e2e` retry: `16/16`
- `env POLYCOST_WEB_BASE_URL=http://127.0.0.1:3230 npm run test:e2e --workspace @polycost/web`
- `npm run live:verify` against the isolated Compose stack

Known remaining gaps:

- Hosted GitHub Actions remains externally blocked before repository steps execute
  (`runner_id: 0`, empty runner name/group, `steps: []` on the latest inspected
  jobs).
- The first isolated `ci:e2e` attempt failed before tests during Docker web image
  `npm ci` with npm `ECONNRESET`; retry progressed through stack startup. The wrapper
  later exited with SIGTERM after API E2E and partial Playwright output, so the same
  healthy stack was verified directly with Playwright `7/7` and `live:verify`.
- Full invoice-grade billing, full Visio visual rendering, production LLM corpus
  quality, production email/SSO/SAML, and complete enterprise account/team UX remain
  future phases.

## Phase 2.8BE - Isolated live runtime verification

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Ran the documented demo boot path against an isolated local Compose project
  (`COMPOSE_PROJECT_NAME=polycost_live_verify`) on non-default ports:
  `WEB_PORT=3200`, `API_HOST_PORT=3201`, and `VAULT_HOST_PORT=8320`.
- The first boot attempt found a real release-readiness hazard: host Vault port
  `8200` can already be allocated. Retrying with `VAULT_HOST_PORT=8320` proved the
  existing port-override path works; `scripts/clean-clone-demo-check.mjs` already
  defaults its clean-clone verifier to isolated Vault port `18210`.
- Fixed `scripts/live-verification.mjs` to match the actual production UI flow:
  compare from the Web App Tier template first, expand the full breakdown, then
  select `Reserved 3yr` before export/what-if/share actions.
- Hardened live verification for isolated host-port runs by accepting Nest's `201`
  responses for successful POST creates and rewriting internal `/api/v1/...` URLs
  returned by the API to the configured `POLYCOST_API_ORIGIN`. This lets mock OIDC
  start/authorize/callback work when the API container listens on `3001` internally
  but is exposed on another host port.
- Applied the same internal `/api/v1/...` URL normalization to
  `apps/api/src/api/mvp-acceptance.e2e.spec.ts` after isolated `ci:e2e` proved the
  API E2E mock OIDC round trip had the same host-port assumption.
- Captured a passing live transcript at `.tmp/live-verification/latest-local-3200.json`.

Runtime evidence:

- `npm run demo:up` on isolated ports reported the web app ready at
  `http://127.0.0.1:3200/`, API health ready at `http://127.0.0.1:3201/health`,
  and the web-origin API proxy returning JSON at
  `http://127.0.0.1:3200/api/v1/data-health`.
- `npm run live:verify` passed against that stack:
  template-to-recommendation `8547ms` / `60000ms`, diagram-to-PDF `2924ms` /
  `180000ms`, workspace-auth-rbac-sso `720ms` / `60000ms`, and Redis degradation
  `/health=degraded`, `/health/deep=degraded`, `/api/v1/data-health HTTP 200`.
- Isolated `npm run ci:e2e` also passed on `WEB_PORT=3210`, `API_HOST_PORT=3211`,
  and `VAULT_HOST_PORT=8330`: API E2E `16/16`, web Playwright `7/7`, then
  live verification template-to-recommendation `5542ms`, diagram-to-PDF `3111ms`,
  workspace-auth-rbac-sso `794ms`, and Redis degradation data-health HTTP `200`.
- Transcript redaction check found no bearer tokens, invite tokens, invite URLs,
  OIDC state, passwords, or client secrets. The only token-like field left is the
  intentionally redacted share `tokenPrefix`.

Verification:

- `node --check scripts/live-verification.mjs`
- `npm run live:verify` against the isolated Compose stack
- `npm run ci:e2e` against the isolated Compose stack

Known remaining gaps:

- Hosted GitHub Actions still cannot prove this path remotely because the `quality`
  job fails before runner assignment (`runner_id: 0`, empty runner name/group,
  `steps: []`). Local runtime evidence is now stronger, but hosted CI remains an
  external account/runner blocker.

## Phase 2.8BD - Workspace auth live transcript

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Extended `scripts/live-verification.mjs` with a running-stack authenticated smoke
  path named `workspace-auth-rbac-sso`.
- The new transcript journey covers owner signup, team/session hydration, session
  listing, invitation creation, invitation preview, invited member registration,
  invitation acceptance, owner-driven role promote/demote, mock OIDC provider
  configuration, mock OIDC start/authorize/callback, structured member RBAC `403`
  for billing import, and server-side revoke-other-sessions.
- Transcript output records only non-secret evidence such as team ID, roles, step
  timings, RBAC status/code, and SSO `stateVerified`; bearer tokens, invite tokens,
  and raw OIDC state are deliberately not written.
- Extended `npm run progress:verify` and `npm run release:check` with anchors for
  the auth live-smoke markers so this evidence cannot be silently removed.
- Updated `docs/verification/full-progress-ledger.md` so Phase F now points to both
  regression-test evidence and the authenticated live transcript.
- Stabilized the existing broad web form-edit/refresh/export unit workflow with an
  explicit 10-second timeout after full-suite execution showed it can run just over
  Jest's default 5-second budget under load; assertions and coverage are unchanged.

Verification:

- `node --check scripts/live-verification.mjs`
- `npm run progress:verify`
- `npm run release:check`
- `npm run test:unit --workspace @polycost/web -- --runInBand`
- `npm run test:production-readiness`
- `npm run check`

Known remaining gaps:

- This promotes authenticated workspace/RBAC/SSO proof into the live transcript. It
  does not turn the product into a complete enterprise IAM suite: production email,
  real OIDC/SAML handshakes, SSO administration depth, and full account/team UX
  remain future phases.

## Phase 2.8BC - Anonymous full-smoke transcript

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Extended `scripts/live-verification.mjs` so the template-to-recommendation journey
  now covers the full anonymous smoke path required by the goal: reserved-pricing
  selection, comparison, PDF/CSV/Excel exports, expanded details, cached region/scale
  what-if, share-link creation, and horizontal-overflow validation.
- The live transcript now records export filenames, the selected `reserved-3yr`
  pricing model, what-if evidence, and a redacted share-token prefix.
- Kept the separate diagram-to-PDF journey intact for diagram upload -> parse review
  -> comparison -> PDF evidence.
- Extended `npm run progress:verify` and `npm run release:check` with anchors for
  reserved-pricing selection, CSV/Excel export, what-if, and share-link smoke steps.
- Updated `docs/verification/full-progress-ledger.md` so release reviewers can see
  the anonymous smoke path coverage in the PR-facing ledger.

Verification:

- `npm run progress:verify` requires the full anonymous smoke path anchors.
- `npm run release:check` requires the full anonymous smoke path anchors.

Known remaining gaps:

- This strengthens the anonymous live-smoke transcript. Authenticated workspace flows
  remain covered by API/UI regression tests and can be promoted to live-browser smoke
  in a later slice once hosted CI runners are available.

## Phase 2.8BB - Live verification transcript artifact

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Extended `scripts/live-verification.mjs` so `npm run live:verify` writes a
  persistent JSON transcript at `.tmp/live-verification/latest.json` by default.
- Added `POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH` for CI or release reviewers to
  redirect the transcript artifact without changing code.
- The transcript records schema version, origins, thresholds, browser channel,
  template-to-recommendation steps/duration, diagram-to-PDF steps/duration/download
  filename, Redis-degradation events/status, and failure details if the run fails.
- Extended `npm run progress:verify` and `npm run release:check` so live transcript
  support cannot be silently removed.
- Updated `docs/verification/full-progress-ledger.md` to point reviewers at the
  transcript artifact path.

Verification:

- `npm run progress:verify` requires the live transcript schema/path/journey anchors.
- `npm run release:check` requires the live transcript schema/path/journey anchors.

Known remaining gaps:

- This preserves live-run evidence when the live verifier is executed. It does not
  remove the external GitHub Actions runner/account blocker currently preventing
  hosted CI from producing its own transcript artifact.

## Phase 2.8BA - PR-facing verification ledger

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `docs/verification/full-progress-ledger.md` as the concise phase-by-phase
  ledger for release/PR review, separate from this chronological build journal.
- The ledger classifies Phase A through Phase G with evidence pointers and keeps
  `verified`, `verified (mock)`, `deferred`, and `blocked` distinct.
- Captured the current honest deferred items in one place: invoice-grade billing,
  full Visio/VSDX visual rendering, production LLM corpus evaluation, enterprise
  account/team/SSO polish, and the Node 24 `impeccable` follow-up.
- Captured the external GitHub Actions blocker with the observed `runner_id: 0` /
  empty-steps signature.
- Extended `npm run progress:verify` and `npm run release:check` so this ledger and
  its Phase A-G/deferred/blocked anchors cannot be silently removed.

Verification:

- `npm run progress:verify` now requires the PR-facing ledger anchors.
- `npm run release:check` now requires the PR-facing ledger file and key release
  verdict phrases.

Known remaining gaps:

- This closes the stale-PR-body/process evidence gap by adding a current checked-in
  ledger artifact. It does not remove the external GitHub Actions runner/account
  blocker and does not convert deferred future-product scope into completed scope.

## Phase 2.8AZ - Provider credential matrix hardening

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Hardened `docs/PROVIDER-CREDENTIALS.md` with a release-grade credential matrix
  covering AWS public catalog, Azure public catalog, GCP Cloud Billing Catalog, and
  the optional diagram/NL LLM classifier.
- Made the current AWS and Azure credential scope explicit: neither adapter reads
  provider secrets today; Azure's current app registration scope is `none` because
  the Retail Prices API path is unauthenticated.
- Clarified the exact GCP Vault path (`secret/polycost/providers/gcp`), accepted
  keys (`access_token`, `service_account_json`, legacy
  `service_account_key_json`), strict validation command, and the rule that provider
  tokens/JSON, OIDC client secrets, and LLM API keys must not be stored in `.env`.
- Extended `npm run release:check` so the credential matrix, Azure no-scope
  statement, GCP Vault path, strict validation command, and diagram LLM Vault path
  remain required release evidence.

Verification:

- `npm run release:check` passes with the new provider-credential evidence anchors.

Known remaining gaps:

- This closes a documentation precision gap for production swaps from mock to real
  catalog providers. It does not add invoice-grade billing exports, private
  contract pricing, taxes, or actual billed-usage ingestion.
- Hosted GitHub Actions still fails before repository steps run because no runner is
  assigned (`runner_id: 0`, empty `steps` array).

## Phase 2.8AY - FinOps manual proof gate

**Status:** Complete with known gaps (see notes)
**Date:** 2026-07-07

What changed:

- Added `apps/api/src/api/finops-proof.spec.ts` as a focused executable proof for
  the FinOps math called out in the full-verification DoD.
- The spec verifies the shared `730` hour constant through the production interval
  helper, the independent manual 80TB egress tier total, commitment break-even math,
  distinct reserved 1-year vs 3-year recurring rates/break-even months, and spot
  estimate volatility/approximation flags.
- Wired the proof spec into `npm run test:production-readiness` and the
  progress/release readiness gates.

Verification:

- `npm run test:unit --workspace @polycost/api -- --runInBand src/api/finops-proof.spec.ts`
  passes: `1 suite / 4 tests`.
- Manual-vs-app FinOps values now proven by the focused spec:
  - 730-hour month: hourly `$2` -> monthly `$1460`, quarterly `$4380`, yearly
    `$17520`.
  - 80TB egress: `10240*0.09 + 40960*0.085 + 30720*0.07 = $6553.60/mo`, matching
    `calculateEgressCost`.
  - Reserved 1-year break-even: `ceil(600 / (1000 - 850)) = 4` months.
  - Reserved 3-year break-even: `ceil(2400 / (1000 - 700)) = 8` months.
  - Reserved 1-year and 3-year recurring rates differ; spot remains estimated and
    volatile in the comparison evidence fixture.

Known remaining gaps:

- This strengthens the FinOps math DoD with executable proof. It does not change the
  product's honest catalog-list-price scope into invoice-grade billing, private
  discounts, taxes, or actual account spend reconciliation.
- Hosted GitHub Actions still fails before repository steps run because no runner is
  assigned (`runner_id: 0`, empty `steps` array).

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

## Phase 2.14 — Team audit trail foundation

Status: implemented and verified locally on 2026-07-08.

- Added migration `030_team_audit_events.sql` with append-only team audit event storage,
  actor linkage, metadata JSON validation, indexed team/actor timelines, and least-privilege
  app-role `SELECT`/`INSERT` grants.
- Added typed repository methods to append and list bounded recent audit events, plus an
  admin-guarded `GET /api/v1/auth/teams/:teamId/audit-events` endpoint.
- Instrumented successful privileged mutations for team creation/settings, invitations,
  invitation resend/revoke/accept, member role changes/removal, SSO provider configuration,
  billing import creation, and billing reconciliation creation.
- Added workspace UI visibility for recent audit events inside the team admin panel and
  refreshed the stream after audited UI actions.
- Verification:
  `npm run format`,
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/auth.controller.spec.ts src/api/api-database.repository.spec.ts`
  passed 47/47,
  `npm run test --workspace apps/web -- api-client App` passed 142/142,
  `npm run db:validate` passed with the expected local warning that Postgres was not
  running, so live schema_migrations inspection was skipped, and full `npm run check`
  passed with 412/412 API unit tests, 142/142 web unit tests, graph/progress/public
  readiness checks, QA, release, handover, and provider-credential checks green.
- Remaining caveat: audit events are append-only and visible to team admins, but they are
  not yet exported to an external immutable retention/SIEM sink.

## Phase 2.15 — Transaction-coupled audit writes

Status: implemented locally on 2026-07-08.

- Moved privileged service paths from separate mutation-plus-audit calls to repository
  calls that carry an audit payload into the same write operation.
- Added a shared repository transaction helper that uses a checked-out `pg` client when
  available, so `BEGIN` / mutation / audit insert / `COMMIT` run on one connection.
- Transaction-coupled audit rows now cover team creation/settings, invitations,
  invitation resend/accept/revoke, member role changes/removal, SSO provider
  configuration, billing import creation, and billing reconciliation creation.
- Kept external invite delivery outside the database transaction so production webhook
  calls do not hold database locks; the mutation itself is still audit-committed before
  delivery is attempted.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 45/45, `npm run ci:lint`, `npm run test:production-readiness`, `npm run build`,
  and `npm run security:audit` passed, and full `npm run check` passed with 414/414 API
  unit tests, 142/142 web unit tests, graph/progress/public readiness, QA, release,
  handover, and provider-credential checks green.
- Remaining caveat: audit rows are stored in PolyCost's database only; external SIEM/WORM
  export remains future compliance hardening.

## Phase 2.16 — Team audit export outbox

Status: implemented locally on 2026-07-08.

- Added `031_team_audit_export_outbox.sql`, an outbox table for durable audit export
  delivery state, retry attempts, and dead-letter status.
- Added staging/production config guards requiring `AUTH_AUDIT_EXPORT_MODE=webhook`,
  an HTTPS `AUTH_AUDIT_EXPORT_WEBHOOK_URL`, and a non-dummy
  `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET`.
- When audit export is enabled, every team audit event insert also enqueues a
  same-transaction outbox row for signed webhook delivery.
- Added `TeamAuditExportService`, which claims pending outbox rows, signs payloads with
  HMAC-SHA256, posts them to the configured SIEM/WORM receiver, marks delivered rows,
  and schedules retry/dead-letter state for failures.
- Wired recurring `team-audit-export` worker scheduling through the existing job
  infrastructure using `AUTH_AUDIT_EXPORT_SCHEDULE_CRON`.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/config/config.schema.spec.ts src/api/api-database.repository.spec.ts src/api/team-audit-export.service.spec.ts src/cost-management-jobs/cost-management-jobs.scheduler.spec.ts src/cost-management-jobs/cost-management-jobs.service.spec.ts`
  passed 47/47, `npm run ci:lint`, `npm run test:production-readiness` passed with
  156/156 API tests and 85/85 web tests, `npm run build`, and `npm run security:audit`
  passed. Full `npm run check` passed with 420/420 API tests, 142/142 web tests,
  graph validation at 316 nodes/316 edges, progress verification, QA, DB validation,
  release, handover, and provider-credential checks green.
- Remaining caveat: PolyCost can now emit signed audit events to an external receiver,
  but production-grade immutability still depends on the deployed SIEM/WORM system's
  retention policy and acceptance evidence.

## Phase 2.17 — Audit export receiver verification

Status: implemented locally on 2026-07-08.

- Added `npm run audit:export:smoke`, a signed canary sender for configured
  `AUTH_AUDIT_EXPORT_WEBHOOK_URL` and `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET` values.
  It rejects dummy secrets and enforces HTTPS unless explicitly targeting localhost
  for local proof.
- Added `npm run audit:export:smoke:local`, which starts a temporary localhost
  receiver, validates the `team_audit_event.recorded` HMAC signature with
  `timingSafeEqual`, and appends exactly one JSONL evidence record to
  `artifacts/audit-export-smoke/`.
- Updated the README, deployment guide, runbook, release checklist, and release
  readiness guard so audit export proof is part of the documented release/handover
  workflow.
- Verification:
  `npm run audit:export:smoke:local` passed with one accepted event and zero
  rejected events, writing
  `artifacts/audit-export-smoke/audit-events-2026-07-08T11-46-02-352Z.jsonl`.
  `npm run format:check`, `npm run ci:lint`, focused audit-export API tests
  (47/47), `npm run release:check`, and full `npm run check` passed with 420/420
  API tests, 142/142 web tests, graph validation, pricing coverage, progress
  verification, QA/security suppression hygiene, DB validation, release,
  handover, and provider-credential checks green.
- Remaining caveat: the local smoke proves PolyCost's signed webhook contract and
  receiver verification semantics, but production-grade immutability still requires
  a real staging/production SIEM or WORM receiver to archive the canary and prove
  retention, access control, and deletion resistance.

## Phase 2.18 — VSDX approximate SVG previews

Status: implemented locally on 2026-07-08.

- Added optional `graph.visualPreviews[]` to diagram parse results. VSDX parses now
  emit bounded, sanitized SVG previews generated from page geometry, positioned
  shape bounds, safe color metadata, labels, and same-page connector edges.
- Updated the web diagram review panel to render the server SVG preview as an image
  data URL when available, with the existing client-side layout preview retained as
  a fallback.
- Updated VSDX docs/runbooks from "no visual rendering" to the more precise current
  state: approximate SVG preview is available, but full Visio semantic rendering
  remains future work.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/diagram-parser/diagram-parser.service.spec.ts`
  passed 26/26. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  passed 60/60. `npm run ci:lint` passed. `npm run test:production-readiness`
  passed with 157/157 API tests and 86/86 web tests. Full `npm run check` passed
  with 421/421 API tests, 143/143 web tests, graph validation, pricing coverage,
  progress verification, QA/security suppression hygiene, DB validation, release,
  handover, and provider-credential checks green.
- Remaining caveat: this is still not full Visio rendering. It does not evaluate
  Visio themes, icon glyph libraries, formulas, embedded media, exact text wrapping,
  or pixel-level visual equivalence.

## Phase 2.19 — Invoice adjustment reconciliation evidence

Status: implemented locally on 2026-07-08.

- Added import-time invoice adjustment classification metadata to normalized actuals
  rows. AWS CUR, Azure Cost Management, GCP Billing Export, and normalized rows now
  preserve `_polycost.invoiceAdjustmentClassification` beside source-row fingerprints
  and column coverage evidence.
- Reconciliation evidence now separates estimate-comparable usage from non-usage
  invoice adjustments such as tax, credit, discount, support, marketplace/private
  offer, refund, enterprise adjustment, and recurring fee rows.
- Added `invoiceAdjustmentSummary` to reconciliation evidence with gross invoice
  total, usage-comparable subtotal, adjustment subtotal, line-item counts, category
  totals, example services, reasons, and usage-comparable variance.
- Updated the workspace billing panel to show usage-comparable variance and
  adjustment totals/categories alongside readiness, source-fingerprint coverage,
  SKU-match coverage, and caveats.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed 23/23. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  passed 60/60. `npm run format:check` and `npm run ci:lint` passed. `npm run
test:production-readiness` passed with 158/158 API tests and 86/86 web tests.
  Full `npm run check` passed with 422/422 API tests, 143/143 web tests, graph
  validation, pricing coverage, progress verification, QA/security suppression
  hygiene, DB validation, release, handover, and provider-credential checks green.
- Remaining caveat: PolyCost now gives finance reviewers cleaner actual-vs-estimate
  evidence, but full invoice-grade billing remains future work. Provider-specific
  amortization, private agreements, tax jurisdiction treatment, prepaid commitments,
  refunds, support contracts, and invoice-of-record controls still need a dedicated
  production billing phase.

## Phase 2.20 — Commitment billing semantics evidence

Status: implemented locally on 2026-07-08.

- Added provider commitment billing categories to invoice reconciliation evidence:
  `commitment-covered-usage`, `commitment-discount`, `commitment-fee`, and
  `commitment-amortization`.
- Hardened native billing export classification for commitment signals commonly found
  in AWS Savings Plans/Reserved Instance rows, Azure reservations/savings-plan benefit
  exports, and GCP committed-use or sustained-use discount rows.
- Reconciliation evidence now reports `commitmentLineItemCount` and
  `commitmentNetCostUsd`, while keeping covered commitment usage estimate-comparable
  and separating discounts, fees, and amortization/unused commitment rows from usage
  variance.
- Updated the workspace billing panel to show commitment row count, net commitment
  cost, and commitment category totals separately from generic invoice adjustments.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed 24/24. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  passed 60/60. `npm run format:check` and `npm run ci:lint` passed. `npm run
test:production-readiness` passed with 159/159 API tests and 86/86 web tests.
  Full `npm run check` passed with 423/423 API tests, 143/143 web tests, graph
  validation, pricing coverage, progress verification, QA/security suppression
  hygiene, DB validation, release, handover, and provider-credential checks green.
- Remaining caveat: commitment rows are now visible and categorized, but full
  invoice-grade amortization still requires provider-account-specific inventory,
  benefit coverage, amortization period, unused-commitment, private pricing, and
  invoice-of-record controls.

## Phase 2.21 — Commitment amortization evidence needs

Status: implemented locally on 2026-07-08.

- Added machine-readable commitment evidence requirements to imported/reconciled
  actuals. Commitment rows now carry kind/treatment metadata and flags for provider
  inventory, amortization-period proof, and allocation evidence requirements.
- Reconciliation evidence now includes `commitmentEvidence` with status,
  rows requiring provider inventory, rows requiring amortization-period proof, rows
  requiring allocation evidence, commitment kind/treatment totals, and caveats.
- Historical rows that only have a commitment category now derive conservative
  fallback evidence from stored source signals, so old imports still surface the
  missing proof requirements.
- Updated the workspace billing panel to display commitment evidence requirements
  alongside commitment row count and net cost.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed 24/24. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  passed 60/60. `npm run format:check` and `npm run ci:lint` passed. `npm run
test:production-readiness` passed with 159/159 API tests and 86/86 web tests.
  Full `npm run check` passed with 423/423 API tests, 143/143 web tests, graph
  validation, pricing coverage, progress verification, QA/security suppression
  hygiene, DB validation, release, handover, and provider-credential checks green.
- Remaining caveat: PolyCost now exposes the exact evidence gap for commitment
  amortization, but invoice-grade treatment still requires provider-account
  commitment inventory, amortization windows, unused commitment allocation, private
  pricing agreements, and invoice-of-record controls.

## Phase 2.22 — Invoice-grade readiness matrix

Status: implemented locally on 2026-07-08.

- Added `invoiceGradeReadiness` to reconciliation evidence. The matrix records
  present, partial, missing, and not-applicable evidence checks, blockers, and
  required provider artifacts.
- The matrix covers provider invoice control totals, source-row traceability,
  SKU/service matching, allocation evidence, billing period/currency completeness,
  invoice adjustments, commitment amortization, private pricing, tax jurisdiction,
  and provider column completeness where fields are missing.
- Updated the workspace billing panel to show invoice-grade readiness status,
  missing/partial counts, and the top blockers directly beside reconciliation
  readiness.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed 24/24. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx`
  passed 60/60. `npm run format:check` and `npm run ci:lint` passed. `npm run
test:production-readiness` passed with 159/159 API tests and 86/86 web tests.
  Full `npm run check` passed with 423/423 API tests, 143/143 web tests, graph
  validation, pricing coverage, progress verification, QA/security suppression
  hygiene, DB validation, release, handover, and provider-credential checks green.
- Remaining caveat: the readiness matrix improves proof discipline, but it still
  reports PolyCost as decision-grade until provider invoice PDFs/control totals,
  tax/legal-entity evidence, private-pricing contracts, commitment inventory, and
  provider-account allocation artifacts are supplied and verified.

## Phase 2.23 — Invoice artifact registration seam

Status: implemented locally on 2026-07-08.

- Added `POST /api/v1/billing/reconciliations/:id/artifacts` for Owner/Admin users
  to attach invoice-grade artifact metadata to an existing reconciliation.
- Artifact metadata covers provider invoices, export manifests, control totals, tax
  invoices, private-pricing agreements, commitment inventory/amortization schedules,
  allocation maps, currency policy, and SKU maps.
- Reconciliation evidence now stores `invoiceGradeArtifactRegister` with registered
  artifact counts, check coverage, control-total deltas, and caveats. Existing
  `invoiceGradeReadiness` checks are annotated with registered metadata, but missing
  invoice-grade checks remain missing until a future verification worker validates
  actual files/contracts.
- Added transaction-coupled audit logging for
  `billing.reconciliation.artifact_registered`.
- Updated the workspace billing panel and API client so demos can register an
  invoice control packet from a reconciled actuals import and immediately see
  "metadata registered, not verified" status.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 49/49. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86. `npm run format:check`, `npm run ci:lint`, and
  `npm run test:production-readiness` passed with 160/160 API tests and 86/86 web
  tests. Full `npm run check` passed with 424/424 API tests, 143/143 web tests,
  graph validation, pricing coverage, progress verification, QA/security
  suppression hygiene, DB validation, release, handover, and provider-credential
  checks green.
- Remaining caveat: this is a provider-artifact registration seam, not invoice-grade
  billing verification. PolyCost still needs real artifact storage, checksum/file
  verification, private contract validation, tax/legal entity proof, commitment
  inventory reconciliation, and provider-account allocation review before claiming
  invoice-grade results.

## Phase 2.24 — Invoice artifact verification seam

Status: implemented locally on 2026-07-08.

- Added `POST /api/v1/billing/reconciliations/:id/artifacts/:artifactId/verification`
  for Owner/Admin users to mark registered artifact metadata as `verified` or
  `rejected`.
- Verification requires a review evidence reference and rejects checksum or
  control-total mismatches against the registered artifact metadata.
- Verified artifacts now update `invoiceGradeArtifactRegister` with verified counts,
  review references, checksum/control-total proof, and control-total deltas.
- `invoiceGradeReadiness` checks now move only where verified artifact types cover
  the specific check. Registered or rejected metadata does not remove blockers.
- Updated the workspace billing panel and API client so demos can register an
  artifact packet and then record verification evidence without claiming full
  invoice-of-record parity.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 51/51. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86. `npm run format:check`, `npm run ci:lint`, and
  `npm run test:production-readiness` passed with 162/162 API tests and 86/86 web
  tests. Full `npm run check` passed with 426/426 API tests, 143/143 web tests,
  graph validation, pricing coverage, progress verification, QA/security
  suppression hygiene, DB validation, release, handover, and provider-credential
  checks green.
- Remaining caveat: this is still metadata/control verification, not full artifact
  storage or provider invoice rendering. PolyCost still needs durable object storage,
  byte-level upload/download controls, reviewer workflow UI, private-pricing/tax
  contract validation, commitment inventory reconciliation, and provider-account
  allocation review before claiming invoice-grade billing.

## Phase 2.25 — Invoice artifact blob storage seam

Status: implemented locally on 2026-07-08.

- Added migration `032_invoice_artifact_blobs.sql` with team-scoped artifact blob
  persistence, SHA-256/content-size constraints, MIME allow-listing, safe file-name
  constraints, and cascade cleanup when a reconciliation is deleted.
- Added Owner/Admin API routes:
  `POST /api/v1/billing/reconciliations/:id/artifacts/:artifactId/blob` and
  `GET /api/v1/billing/reconciliations/:id/artifacts/:artifactId/blob`.
- Artifact upload now hashes raw decoded bytes, rejects caller checksum mismatches,
  rejects mismatch with registered artifact metadata, stores bytes in the database,
  and updates reconciliation evidence with metadata only. Raw bytes are not embedded
  in the normal reconciliation evidence payload.
- Blob storage, reconciliation evidence update, and audit event
  `billing.reconciliation.artifact_blob_uploaded` are written in one repository
  transaction.
- Updated the workspace billing panel so the demo path can register metadata, store a
  demo invoice artifact file, download the stored file, and verify the artifact using
  the stored checksum while preserving unrelated invoice-grade blockers.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 54/54. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86. `npm run format:check`, `npm run ci:lint`, and
  `npm run test:production-readiness` passed with 165/165 API tests and 86/86 web
  tests. Full `npm run check` passed with 429/429 API tests, 143/143 web tests,
  graph validation, pricing coverage, progress verification, QA/security
  suppression hygiene, DB validation, release, handover, and provider-credential
  checks green.
- Remaining caveat: this is durable database-backed artifact storage for the OSS demo
  and self-hosted baseline, not full provider invoice rendering or enterprise object
  storage. Production invoice-grade operation still needs object storage/KMS,
  malware scanning, retention/legal hold, reviewer workflow UI, private-pricing/tax
  contract validation, commitment inventory reconciliation, and provider-account
  allocation review.

## Phase 2.26 — Invoice artifact governance metadata

Status: implemented locally on 2026-07-08.

- Added migration `033_invoice_artifact_blob_governance.sql` with storage-backend,
  KMS-reference, retention-until, legal-hold, malware-scan status, scan engine, scan
  timestamp, and scan-finding columns for invoice artifact blobs.
- Backfilled existing artifact blobs with a 365-day retention window and scan
  timestamp before enforcing non-null governance timestamps.
- Upload now records governance metadata in the blob row and in metadata-only
  reconciliation evidence: database-backed storage profile, KMS production-readiness
  flag, retention/legal-hold policy, and malware scan status.
- Added a deterministic EICAR-signature scan hook that blocks known test-malware
  content before bytes are stored. This is a local safety hook, not a full AV engine.
- Updated the workspace billing panel to show artifact governance: scan status,
  retention date, legal-hold state, and whether KMS remains required for production.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 55/55. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86. `npm run test:production-readiness` passed with API 12 suites /
  166 tests and web 2 suites / 86 tests. Full `npm run check` passed with API 53
  suites / 431 tests, web 11 suites / 143 tests, graph validation 316 nodes / 316
  edges, pricing coverage, progress verification, QA/security suppression hygiene,
  DB, DevOps, cloud, release, handover, and provider-credential gates green.
- Remaining caveat: PolyCost now records governance metadata and blocks EICAR test
  content, but this is not a production object-storage/KMS/AV/retention platform.
  Full production invoice handling still needs external object storage, customer
  managed keys, real malware scanning, legal-hold enforcement, reviewer workflow UX,
  and provider invoice-of-record validation.

## Phase 2.27 — Artifact storage readiness and retention enforcement

Status: implemented and verified locally on 2026-07-08.

- Added config schema and `.env.example` controls for invoice artifact storage
  backend selection, object-store target, KMS key reference, scanner mode/webhook,
  and retention enforcement mode.
- Staging and production validation now rejects database-only artifact storage,
  missing object-store target, missing KMS reference, local-only scanner mode, and
  report-only retention enforcement.
- Added `InvoiceArtifactGovernanceService` to centralize storage readiness,
  signed malware-scanner webhook integration, EICAR fallback scanning, KMS metadata,
  and upload governance construction.
- Added guarded admin API operations for artifact storage readiness and retention
  enforcement. Local/demo mode reports only; configured `delete-expired` mode deletes
  expired non-legal-held database-backed artifact blobs.
- Extended the provider credential checker so strict mode fails when artifact
  governance controls are missing.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/invoice-artifact-governance.service.spec.ts src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts src/config/config.schema.spec.ts`
  passed 78/78 across 4 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/api-client.spec.ts src/App.spec.tsx`
  passed 86/86 across 2 suites. `npm run ci:lint` passed with zero warnings/errors.
  `npm run provider:credentials:check` passed with the expected local/demo
  invoice-artifacts warning, and `npm run provider:credentials:check:strict`
  passed when production artifact storage/KMS/scanner/retention env values were
  supplied. `npm run test:production-readiness` passed with API 13 suites / 175
  tests and web 2 suites / 86 tests. Full `npm run check` passed with API 54
  suites / 440 tests, web 11 suites / 143 tests, graph validation 318 nodes / 318
  edges, pricing coverage, progress verification, QA/security suppression hygiene,
  DB, DevOps, cloud, release, handover, and provider-credential gates green.
- Remaining caveat: external S3/Azure Blob/GCS byte-write adapters are still future
  work; this phase adds the production readiness contract, webhook scanner path, and
  retention enforcement foundation over the existing database-backed artifact store.

## Phase 2.28 — Provider artifact storage adapters

Status: implemented and verified locally on 2026-07-08.

- Added migration `034_invoice_artifact_external_storage.sql` so stored invoice
  artifact rows can hold either database bytes or an external object-store pointer
  with bucket/container, region, key, URI, ETag, and version metadata.
- Added `InvoiceArtifactStorageService` with provider-native write/read adapters:
  AWS S3 SigV4 REST with optional KMS headers, Azure Blob SAS-backed Block Blob
  writes, and GCP Cloud Storage JSON API uploads/downloads with Vault-backed access
  tokens.
- Upload now stores inline bytes only for `database-bytea`; external storage rows
  persist object pointers and metadata while reconciliation evidence remains
  metadata-only. Download reads external provider bytes and verifies the stored
  SHA-256 before returning content to the caller.
- Extended billing/repository/API/web types so external artifacts can be represented
  without inline `contentBase64` until the guarded download path rehydrates bytes.
- Extended strict provider credential checks and operator docs with exact artifact
  Vault paths for AWS, Azure, and GCP object-store credentials.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/invoice-artifact-storage.service.spec.ts src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts src/api/invoice-artifact-governance.service.spec.ts`
  passed 72/72 across 4 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86 across 2 suites. `npm run ci:lint` passed with zero ESLint/typecheck
  errors. `npm run provider:credentials:check` passed with the expected local/demo
  invoice-artifacts warning. `npm run test:production-readiness` passed with API 14
  suites / 182 tests and web 2 suites / 86 tests. Full `npm run check` passed with
  API 55 suites / 448 tests, web 11 suites / 143 tests, graph validation 320 nodes /
  320 edges, pricing coverage, progress verification, QA/security suppression
  hygiene, DB, DevOps, cloud, release, handover, and provider-credential gates green.
- Remaining caveat: external artifact writes/reads are now implemented, but full
  invoice-grade operation still needs provider invoice-of-record reconciliation,
  reviewer workflow automation, real malware-scanner operation, legal-hold
  administration, and external object lifecycle deletion during retention
  enforcement.

## Phase 2.29 — External artifact retention deletion

Status: implemented and verified locally on 2026-07-08.

- Added provider object deletion to `InvoiceArtifactStorageService` for AWS S3,
  Azure Blob Storage, and GCP Cloud Storage. Provider `404` responses are treated as
  idempotent success so retention retries can safely continue after a partially
  completed purge.
- Retention enforcement now lists expired, non-held artifact candidates, deletes
  external provider objects first for S3/Blob/GCS rows, and then deletes only those
  candidate database rows that are still expired and not under legal hold.
- Added repository methods to list lightweight retention deletion candidates and
  delete by explicit IDs with retention/legal-hold predicates rechecked at deletion
  time.
- Updated operator docs with delete permissions for object-store credentials and
  clarified that external provider objects are purged before database pointers.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/invoice-artifact-storage.service.spec.ts src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts src/api/invoice-artifact-governance.service.spec.ts`
  passed 78/78 across 4 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86 across 2 suites. `npm run ci:lint` passed with zero ESLint/typecheck
  errors. `npm run test:production-readiness` passed with API 14 suites / 187 tests
  and web 2 suites / 86 tests. Full `npm run check` passed with API 55 suites / 454
  tests, web 11 suites / 143 tests, graph validation 320 nodes / 320 edges, pricing
  coverage, progress verification, QA/security suppression hygiene, DB, DevOps,
  cloud, release, handover, and provider-credential gates green.
- Remaining caveat: lifecycle deletion is now wired for object storage, but full
  invoice-grade operation still needs provider invoice-of-record reconciliation,
  reviewer workflow automation, production malware-scanner operation, and richer
  legal-hold administration.

## Phase 2.30 — Artifact legal-hold administration

Status: implemented and verified locally on 2026-07-08.

- Added an Owner/Admin legal-hold operation for stored invoice artifacts:
  `PATCH /api/v1/billing/reconciliations/:id/artifacts/:artifactId/blob/legal-hold`.
- Legal-hold changes now update both `invoice_artifact_blobs.legal_hold` and the
  reconciliation evidence register in one transaction, so retention enforcement and
  workspace summaries read the same governance state.
- Added the `billing.reconciliation.artifact_legal_hold_updated` audit action and
  schema migration so hold/release actions are visible in the team audit trail.
- Added a workspace action that appears after artifact file storage and lets admins
  place or release a legal hold with an audit reason.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 66/66 across 2 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 86/86 across 2 suites.
- `npm run ci:lint` passed with zero ESLint/typecheck errors.
- `npm run test:production-readiness` passed with API 14 suites / 189 tests and web
  2 suites / 86 tests.
- Full `npm run check` passed with API 55 suites / 456 tests, web 11 suites / 143
  tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
  verification, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node 24.
- Remaining caveat: PolyCost now has the basic audited hold/release control, but not
  a full legal-review approval workflow, external reviewer queue, policy exception
  lifecycle, or provider invoice-of-record validation.

## Phase 2.31 — Invoice artifact review workflow

Status: implemented and verified locally on 2026-07-08.

- Added an Owner/Admin review queue for stored invoice artifacts:
  `GET /api/v1/billing/imports/:id/artifact-reviews`.
- Added an audited review-state operation:
  `PATCH /api/v1/billing/reconciliations/:id/artifacts/:artifactId/review`.
  Stored artifacts can now move through `pending`, `approved`, or `rejected`
  review states without changing invoice-grade verification status.
- Review metadata now stays in the reconciliation evidence register with reviewer,
  requested/reviewed timestamps, evidence reference, notes, and aggregate review
  counts. The flow rejects review changes until artifact bytes have actually been
  stored.
- Added the `billing.reconciliation.artifact_review_updated` audit action and
  schema migration so review changes are visible in the team audit trail.
- Added workspace actions to send stored artifacts to review and approve/reject
  pending reviews, with refreshed review counts and audit labels in the UI.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 69/69 across 2 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 87/87 across 2 suites.
- `npm run ci:lint` passed with zero ESLint/typecheck errors or warnings.
- `npm run test:production-readiness` passed with API 14 suites / 192 tests and web
  2 suites / 87 tests.
- Full `npm run check` passed with API 55 suites / 459 tests, web 11 suites / 144
  tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
  verification, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node 24.
- Remaining caveat: this is an internal review-status workflow over stored artifacts,
  not external legal-review routing, policy exception lifecycle automation, private
  contract validation, provider invoice rendering, or provider invoice-of-record
  reconciliation.

## Phase 2.32 — Artifact policy exception lifecycle

Status: implemented and verified locally on 2026-07-08.

- Added an Owner/Admin policy exception queue for stored invoice artifacts:
  `GET /api/v1/billing/imports/:id/artifact-policy-exceptions`.
- Added an audited policy exception state operation:
  `PATCH /api/v1/billing/reconciliations/:id/artifacts/:artifactId/policy-exception`.
  Stored artifacts can now move through `requested`, `approved`, or `rejected`
  exception states without changing invoice-grade verification status.
- Approved exceptions require a future expiry timestamp plus evidence or notes.
  Expired approved exceptions are surfaced as computed `expired` status in queue and
  workspace summaries.
- Reconciliation evidence now stores exception requester/decision metadata, reviewer,
  reason, expiry, evidence reference, notes, and aggregate requested/approved/rejected/
  expired counts.
- Added the `billing.reconciliation.artifact_exception_updated` audit action and
  schema migration so exception lifecycle changes are visible in the team audit trail.
- Added workspace actions to request, approve, and reject time-boxed policy exceptions
  beside artifact review/governance controls.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 72/72 across 2 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 88/88 across 2 suites.
- `npm run ci:lint` passed with zero ESLint/typecheck errors or warnings.
- Full `npm run check` passed with API 55 suites / 462 tests, web 11 suites / 145
  tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
  verification, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node 24.
- Remaining caveat: this is an internal policy exception lifecycle over stored
  artifacts, not external legal-review routing, contract/legal approval integration,
  full policy exception automation, private contract validation, provider invoice
  rendering, or provider invoice-of-record reconciliation.

## Phase 2.33 — Invoice control packet validation

Status: implemented and verified locally on 2026-07-08.

- Added an Owner/Admin invoice control validation operation:
  `POST /api/v1/billing/reconciliations/:id/artifacts/:artifactId/invoice-control-validation`.
- Validation requires the artifact file to be stored and the artifact metadata to be
  verified before it can run. It rejects missing control totals rather than implying
  invoice-grade evidence exists.
- Reconciliation evidence now records `matched`, `variance-warning`, `mismatch`, or
  `not-run` invoice control status, accepted variance, reconciliation-total delta,
  imported-actuals delta, billing-period match state, validation evidence reference,
  notes, validated timestamp, and aggregate control-validation counts.
- Added the `billing.reconciliation.invoice_control_validated` audit action and
  schema migration so control validations are visible in the team audit trail.
- Added workspace UI controls and readouts for invoice control status, deltas, period
  matching, and validation timestamp after a stored artifact has been verified.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 74/74 across 2 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 89/89 across 2 suites.
- `npm run ci:lint` passed with zero ESLint/typecheck errors or warnings.
- `npm run test:production-readiness` passed with API 14 suites / 197 tests and web
  2 suites / 89 tests.
- Full `npm run check` passed with API 55 suites / 464 tests, web 11 suites / 146
  tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
  verification, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node 24;
  DB validation skipped live `schema_migrations` inspection because the local
  Postgres container was not running.
- Remaining caveat: this validates stored control-packet totals against imported
  actuals and reconciliation totals. It is not provider invoice rendering, private
  contract/legal validation, provider-authenticated invoice-of-record validation, or
  full invoice-grade billing coverage.

## Phase 2.34 — Invoice evidence packet export

Status: implemented and verified locally on 2026-07-08.

- Added an Owner/Admin evidence-packet API:
  `GET /api/v1/billing/reconciliations/:id/evidence-packet`.
- The packet is metadata-only and intentionally excludes raw invoice artifact bytes.
  It includes reconciliation/import metadata, invoice-grade readiness, match summary,
  artifact register evidence, sanitized artifact metadata, aggregate control counts,
  caveats, and explicit invoice-grade disclaimers.
- Added workspace UI download support for `polycost-invoice-evidence-*.json` from
  the billing reconciliation panel without exposing stored artifact bytes.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 75/75 across 2 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 90/90 across 2 suites.
- `npm run ci:lint` passed with zero ESLint/typecheck errors or warnings.
- `npm run test:production-readiness` passed with API 14 suites / 198 tests and web
  2 suites / 90 tests.
- Full `npm run check` passed with API 55 suites / 465 tests, web 11 suites / 147
  tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
  verification, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node 24;
  DB validation skipped live `schema_migrations` inspection because the local
  Postgres container was not running.
- Remaining caveat: this is an evidence handoff/export layer, not provider invoice
  rendering, private contract/legal validation, provider-authenticated invoice-of-
  record validation, or full invoice-grade billing coverage.

## Phase 2.35 — Invoice evidence packet integrity

Status: implemented and verified locally on 2026-07-08.

- Added a tamper-evident `integrity` manifest to invoice evidence packets. The
  manifest records schema version, canonicalization method, SHA-256 digest algorithm,
  payload digest, canonical payload byte length, reconciliation/import/comparison
  subject IDs, provider, artifact counts, caveat/disclaimer counts, and generated
  timestamp.
- The payload digest is computed over the canonical stable-JSON packet body excluding
  the integrity block itself, avoiding self-reference while letting reviewers
  recompute the exact delivered packet payload hash.
- Workspace evidence-packet downloads now include the digest prefix in the JSON file
  name and success notice so reviewers can cross-check the handoff artifact quickly.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed 75/75 across 2 suites. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 90/90 across 2 suites.
- `npm run ci:lint` passed with zero ESLint/typecheck errors or warnings.
- `npm run test:production-readiness` passed with API 14 suites / 198 tests and web
  2 suites / 90 tests.
- Full `npm run check` passed with API 55 suites / 465 tests, web 11 suites / 147
  tests, graph validation 320 nodes / 320 edges, pricing coverage, progress
  verification, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node 24;
  DB validation skipped live `schema_migrations` inspection because the local
  Postgres container was not running.
- Remaining caveat: this makes the evidence packet tamper-evident after export, but
  it is not an external notarization service, provider-authenticated invoice
  rendering, private contract/legal validation, or full invoice-grade billing
  coverage.

## Phase 2.36 — Invoice evidence packet verifier CLI

Status: implemented and verified locally on 2026-07-08.

- Added `scripts/invoice-evidence-packet-verifier.mjs` and npm commands:
  `npm run invoice:evidence:verify -- <packet.json>` and
  `npm run invoice:evidence:verify:fixture`, plus
  `npm run invoice:evidence:verify:smoke`.
- The verifier recomputes the `stable-json:v1` SHA-256 digest over the packet payload
  excluding the integrity block, validates payload byte length, subject IDs,
  artifact/control counts, caveat/disclaimer counts, schema version, digest
  algorithm, and generated timestamp, and exits non-zero for tampered packets.
- Added a committed valid packet fixture plus
  `npm run invoice:evidence:verify:smoke`, which verifies the valid fixture and a
  deliberately tampered temp copy. The smoke is wired into `npm run check` so the
  handoff verifier cannot silently drift.
- Verification:
  `npm run invoice:evidence:verify -- --help`, `npm run invoice:evidence:verify -- --version`,
  and `npm run invoice:evidence:verify:fixture -- --json` passed. A tampered temp
  packet smoke test changed `reconciliation.invoicedTotalUsd` and confirmed the
  verifier rejects it with a digest mismatch. `npm run invoice:evidence:verify:smoke`
  passed.
- Full `npm run check` passed with the verifier smoke in the regression floor: API
  55 suites / 465 tests, web 11 suites / 147 tests, graph validation 320 nodes / 320
  edges, pricing coverage, progress verification, QA/security suppression hygiene,
  DB, DevOps, cloud, release, handover, and provider-credential gates green.
  `npm run impeccable` was skipped by design because the repo targets Node 20 and
  the optional tool requires Node 24; DB validation skipped live
  `schema_migrations` inspection because the local Postgres container was not
  running.
- Remaining caveat: this verifies exported packet integrity locally after download,
  but it is not external notarization, provider invoice rendering, private
  contract/legal validation, or provider-authenticated invoice-of-record validation.

## Phase 2.37 — Invoice artifact governance audit manifest

Status: implemented and verified locally on 2026-07-08.

- Added a digest-covered `artifactGovernance` section to invoice evidence packets.
  The section summarizes current storage readiness, required access controls,
  storage backends, governance-manifest coverage, database-vs-object-store counts,
  customer-managed KMS coverage, retention/legal-hold posture, malware scanner
  posture, production gates, and explicit governance gaps.
- `GET /api/v1/billing/reconciliations/:id/evidence-packet` now records a
  `billing.reconciliation.evidence_packet_exported` team audit event containing the
  packet digest, status, artifact counts, governance gap count, and storage backends.
- `GET /api/v1/billing/reconciliations/:id/artifacts/:artifactId/blob` now records a
  `billing.reconciliation.artifact_blob_downloaded` team audit event after successful
  inline or checksum-verified external object retrieval, including checksum, size,
  storage backend, scanner status, retention date, legal-hold state, and whether
  external bytes were fetched.
- Frontend/shared API types and activity-feed labels now include the two read-side
  billing audit actions.
- Verification so far:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed 48/48. `npm run typecheck --workspaces --if-present` passed for API, web,
  and shared types. `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 90/90. `npm run test:production-readiness` passed with API 14 suites / 198
  tests and web 2 suites / 90 tests. Full `npm run check` passed with API 55 suites /
  465 tests, web 11 suites / 147 tests, graph validation 320 nodes / 320 edges,
  pricing coverage, progress verification, QA/security suppression hygiene, DB,
  DevOps, cloud, release, handover, and provider-credential gates green. `npm run
impeccable` was skipped by design because the repo targets Node 20 and the optional
  tool requires Node 24; DB validation skipped live `schema_migrations` inspection
  because the local Postgres container was not running.
- Remaining caveat: this improves packet governance evidence and access auditability,
  but still does not provide provider invoice rendering, external notarization,
  private contract/legal validation, WORM storage proof, or full invoice-grade
  billing coverage.

## Phase 2.38 — Invoice evidence receipt and WORM posture

Status: implemented and verified locally on 2026-07-09.

- Added production-bound invoice evidence receipt configuration:
  `INVOICE_EVIDENCE_RECEIPT_MODE`,
  `INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE`,
  `INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET`,
  `INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL`, and
  `INVOICE_EVIDENCE_WORM_RETENTION_MODE`.
- Staging and production config now reject metadata-only evidence receipts and
  missing WORM retention posture. Signed modes require a signing key reference and
  runtime signing secret; external webhook mode additionally requires an HTTPS
  notary/WORM URL outside development.
- Invoice evidence packets now include a digest-covered `receipt` block. The receipt
  signs the base evidence payload digest with HMAC-SHA256 when configured, records
  the signing key reference, notary host/hash metadata, WORM retention mode, and
  explicit readiness gaps without exposing the signing secret.
- The offline evidence packet verifier now validates receipt binding when a receipt
  is present by recomputing the base evidence payload digest and signed-payload
  digest metadata.
- Provider credential checks now include evidence receipt signing and WORM retention
  posture; local/demo mode warns that receipts are metadata-only and WORM retention
  is not configured.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/config/config.schema.spec.ts`
  passed 64/64. `npm run typecheck --workspaces --if-present` passed for API, web,
  and shared types. `npm run invoice:evidence:verify:smoke` passed.
  `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  passed 90/90. `npm run provider:credentials:check` passed with the expected
  local/demo invoice-artifacts warning expanded to include metadata-only evidence
  receipts and missing WORM retention mode. Full `npm run check` passed with API
  55 suites / 467 tests, web 11 suites / 147 tests, graph validation 320 nodes /
  320 edges, pricing coverage, progress verification 153 anchors, QA/security
  suppression hygiene, DB, DevOps, cloud, release, handover, and provider-credential
  gates green. `npm run impeccable` was skipped by design because the repo targets
  Node 20 and the optional tool requires Node 24; DB validation skipped live
  `schema_migrations` inspection because the local Postgres container was not
  running.
- Remaining caveat: signed receipts and WORM posture make exported packet handoff
  stronger, but PolyCost still does not automatically submit packet bytes to an
  external notary during download, prove provider object-lock retention from the
  cloud control plane, render provider invoices, or become an invoice system of
  record.

## Phase 2.39 — Invoice evidence notary API handoff

Status: implemented and verified locally on 2026-07-09.

- Added `InvoiceEvidenceNotaryService`, which sends a signed
  `invoice_evidence_packet.exported` webhook request when
  `INVOICE_EVIDENCE_RECEIPT_MODE=external-webhook` is configured.
- The handoff payload includes the metadata-only evidence packet, packet digest,
  base evidence payload digest, receipt mode/status, actor, and team identifiers.
  The HMAC-SHA256 signature is sent in headers; signing secrets and receiver
  response bodies are never returned in packet JSON.
- Evidence packet receipts now update their notary block after export with
  sanitized API handoff evidence: `accepted-by-api` or `failed-api-webhook`,
  attempted timestamp, request digest, accepted subject digest, receiver HTTP
  status, and message. Packet integrity is recomputed after this evidence is added.
- Team audit metadata for evidence packet export now includes notary delivery status,
  mode, delivery evidence, request digest, and receiver HTTP status.
- The offline verifier now validates API notary delivery evidence shape and ensures
  accepted handoffs reference the receipt's base payload digest.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/invoice-evidence-notary.service.spec.ts src/api/auth-billing.spec.ts`
  passed 52/52. `npm run typecheck --workspaces --if-present` passed for API,
  web, and shared types. `npm run invoice:evidence:verify:smoke` passed.
  `npm run provider:credentials:check` passed with the expected local/demo
  invoice-artifacts warning. `npm run test:production-readiness` passed with API
  14 suites / 200 tests and web 2 suites / 90 tests. Full `npm run check` passed
  with API 56 suites / 470 tests, web 11 suites / 147 tests, graph validation
  322 nodes / 322 edges, pricing coverage, progress verification 153 anchors,
  QA/security suppression hygiene, DB, DevOps, cloud, release, handover, and
  provider-credential gates green. `npm run impeccable` was skipped by design
  because the repo targets Node 20 and the optional tool requires Node 24; DB
  validation skipped live `schema_migrations` inspection because the local Postgres
  container was not running.
- Remaining caveat: this proves PolyCost can submit a signed packet handoff request
  and record receiver acceptance, but receiver-side immutability/object-lock proof
  remains external operator evidence. Full provider invoice rendering and invoice
  system-of-record behavior remain future scope.

## Phase 2.40 — Invoice evidence notary receiver smoke

Status: implemented and verified locally on 2026-07-09.

- Added `npm run invoice:evidence:notary:smoke:local`, which starts a temporary
  localhost notary receiver, sends a signed `invoice_evidence_packet.exported`
  canary handoff, verifies the `x-polycost-signature-sha256` HMAC header with a
  constant-time comparison, and appends a JSONL proof artifact under
  `artifacts/invoice-evidence-notary-smoke/`.
- Added `npm run invoice:evidence:notary:smoke` for staging/production-like HTTPS
  receivers. It requires `INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL` plus a non-dummy
  `INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET`, rejects non-local HTTP targets unless
  explicitly allowed for localhost, and prints the run ID, reconciliation ID, and
  packet digests needed for receiver-side archive evidence.
- README, deployment, runbook, provider-credential guidance, changelog, and
  release-readiness checks now include the notary receiver smoke workflow so the
  customer handover can prove the receiver contract without claiming immutable
  retention.
- Verification:
  `npm run invoice:evidence:notary:smoke:local` passed and wrote
  `artifacts/invoice-evidence-notary-smoke/invoice-evidence-notary-2026-07-09T09-58-16-786Z.jsonl`
  with one accepted handoff and zero rejected events. `npm run release:check`,
  `npm run progress:verify`, and `npm run ci:lint` passed. Full `npm run check`
  passed with API 56 suites / 470 tests, web 11 suites / 147 tests, graph
  validation 322 nodes / 322 edges, pricing coverage, progress verification 153
  anchors, QA/security suppression hygiene, DB, DevOps, cloud, release, handover,
  and provider-credential gates green. `npm run impeccable` was skipped by design
  because the repo targets Node 20 and the optional tool requires Node 24; DB
  validation skipped live `schema_migrations` inspection because the local Postgres
  container was not running.
- Remaining caveat: this proves HMAC receiver compatibility and local artifact
  capture only. Operator-owned WORM/object-lock retention, external receiver
  access controls, provider invoice rendering, and invoice system-of-record
  behavior remain future scope.

## Phase 2.41 — Notary reference receiver staging path

Status: implemented and verified locally on 2026-07-09.

- Added `npm run invoice:evidence:notary:receiver`, a dependency-free reference
  notary receiver for staging rehearsals. It verifies signed
  `invoice_evidence_packet.exported` payloads with HMAC-SHA256, uses
  `timingSafeEqual`, enforces JSON content type, applies a per-minute rate limit,
  bounds request size, exposes `/health/live` and `/health/ready`, and appends
  compact JSONL receipt evidence under
  `POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_ARTIFACT_DIR`.
- Added `npm run invoice:evidence:notary:receiver:dev` for local-only startup and
  `npm run invoice:evidence:notary:receiver:smoke`, which starts the receiver,
  checks readiness, runs the existing signed webhook smoke against it, and verifies
  the captured JSONL receipt digest.
- Added `docker/notary-receiver/Dockerfile` for a small Node 20 container running
  as the non-root `node` user with a `/health/ready` healthcheck and
  `/data/notary-receipts` volume.
- README, deployment, runbook, provider-credential, dummy-value, release-checklist,
  changelog, and release-readiness guardrails now document the reference receiver
  and keep append-only JSONL proof distinct from operator-owned WORM/object-lock
  immutability proof.
- Verification:
  `npm run invoice:evidence:notary:receiver:smoke` passed and wrote
  `artifacts/invoice-evidence-notary-reference-receiver/smoke-2026-07-09T10-44-00-186Z/invoice-evidence-notary-receipts-2026-07-09.jsonl`
  after accepting the signed packet digest
  `1bb1abec466eda604ebb949acf7e40e8b0385cdcff1445ecac2d691736550ea0`.
  `docker build -f docker/notary-receiver/Dockerfile -t
polycost/notary-reference-receiver:local .` passed.
  `npm run release:check`, `npm run progress:verify`, and `npm run ci:lint`
  passed. Full `npm run check` passed with API 56 suites / 470 tests, web 11
  suites / 147 tests, graph validation 322 nodes / 322 edges, pricing coverage,
  progress verification 153 anchors, QA/security suppression hygiene, DB, DevOps,
  cloud, release, handover, and provider-credential gates green. `npm run
impeccable` was skipped by design because the repo targets Node 20 and the
  optional tool requires Node 24; DB validation skipped live `schema_migrations`
  inspection because the local Postgres container was not running.
- Remaining caveat: the reference receiver proves deployable HMAC verification,
  health/readiness, and append-only local receipt capture. Immutable retention,
  external access logs, TLS termination, and object-lock/WORM guarantees still
  depend on the operator's storage and deployment environment.

## Phase 2.42 — Provider retention proof manifest

Status: implemented and verified locally on 2026-07-09.

- Added a typed `invoice-artifact-provider-retention-proof/v1` manifest to stored
  invoice artifact governance. The manifest distinguishes `not-applicable`,
  `missing`, `declared`, and `provider-verified` states so packets no longer
  collapse local configuration and provider control-plane evidence into one vague
  WORM posture.
- Added configuration for
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE`,
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE`, and
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256`. Staging/production
  `provider-object-lock` mode now requires `provider-control-plane` proof with a
  durable reference and SHA-256 digest before startup validation passes.
- Evidence packet governance now aggregates provider retention proof counts and
  exposes a `providerRetentionProofReady` production gate. The gate is true only
  when every external object-store artifact has provider-verified proof; declared
  or missing proof remains a visible blocker.
- The offline evidence packet verifier checks the provider-retention proof count
  fields and prevents packets from claiming provider-control-plane evidence unless
  a provider-verified proof includes both reference and digest.
- Provider credential docs, dummy-value guard docs, `.env.example`, and release
  readiness anchors now document the operator-owned cloud proof capture path.
- Verification:
  `npm run test:unit --workspace @polycost/api -- --runInBand
src/api/invoice-artifact-governance.service.spec.ts src/api/auth-billing.spec.ts
src/config/config.schema.spec.ts` passed with 3 suites / 70 tests. `npm run
invoice:evidence:verify:smoke`, `npm run release:check`, `npm run
progress:verify`, `npm run format:check`, and `npm run ci:lint` passed. Full
  `npm run check` passed with API 56 suites / 471 tests, web 11 suites / 147 tests,
  graph validation 322 nodes / 322 edges, pricing coverage, progress verification
  153 anchors, QA/security suppression hygiene, DB, DevOps, cloud, release,
  handover, and provider-credential gates green. `npm run impeccable` was skipped
  by design because the repo targets Node 20 and the optional tool requires Node
  24; DB validation skipped live `schema_migrations` inspection because the local
  Postgres container was not running. Local provider credential posture remains a
  warning because `.env.example` defaults to demo Postgres/metadata-only invoice
  evidence settings.
- Remaining caveat: PolyCost records and verifies the retention proof manifest,
  digest, object pointer, and object version metadata after upload. It still does
  not call every cloud provider control plane itself or replace legal/invoice
  system-of-record review.

## Phase 2.43 — Provider retention proof artifact verifier

Status: implemented and verified locally on 2026-07-09.

- Added `npm run invoice:retention-proof:verify`, an offline verifier for captured
  AWS S3 object-lock, Azure Blob immutability/legal-hold, and GCP Cloud Storage
  retention/hold JSON proof artifacts. It computes the proof SHA-256, optionally
  checks an expected digest, validates provider-specific retention signals, and
  prints the recommended runtime config values for
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE`,
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE`, and
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256`.
- Added `npm run invoice:retention-proof:verify:smoke` with AWS/Azure/GCP proof
  fixtures, digest mismatch coverage, and missing-retention failure coverage. The
  smoke is now part of `npm run check`.
- Updated provider-credential documentation and release-readiness guards to make
  proof-artifact verification part of the production evidence path.
- Verification:
  `npm run invoice:retention-proof:verify:smoke`, `npm run format:check`,
  `npm run release:check`, `npm run progress:verify`, and `npm run ci:lint`
  passed. Full `npm run check` passed with API 56 suites / 471 tests, web 11
  suites / 147 tests, graph validation 322 nodes / 322 edges, pricing coverage,
  progress verification 153 anchors, QA/security suppression hygiene, DB,
  DevOps, cloud, release, handover, and provider-credential gates green.
  `npm run impeccable` was skipped by design because the repo targets Node 20 and
  the optional tool requires Node 24; DB validation skipped live
  `schema_migrations` inspection because the local Postgres container was not
  running. Local provider credential posture remains a warning because
  `.env.example` defaults to demo Postgres/metadata-only invoice evidence
  settings.
- Remaining caveat: this verifier validates captured proof files and digests; it
  does not call provider APIs itself, prove chain of custody, or replace legal
  retention review.

## Phase 2.44 — Provider retention proof capture planner

Status: implemented and verified locally on 2026-07-09.

- Added `npm run invoice:retention-proof:capture-plan`, an offline AWS/Azure/GCP
  planner that accepts a provider object URI and emits provider CLI capture
  commands, proof file path, verifier command, durable proof reference, runtime
  config template, and operator control checklist.
- Added `npm run invoice:retention-proof:capture-plan:smoke` covering AWS S3
  versioned object URIs, Azure Blob object URIs, GCP GCS object URIs, runtime
  config placeholders, provider/URI mismatch failures, and no-overclaim fields
  (`cloudCliExecutionByPolyCost: false`,
  `immutableRetentionProvedByPolyCost: false`).
- Updated provider-credential docs and release-readiness guards so operators can
  generate the capture runbook before using the proof verifier.
- Verification: `npm run invoice:retention-proof:capture-plan:smoke`,
  `npm run format:check`, `npm run ci:lint`, `npm run release:check`,
  `npm run progress:verify`, and full `npm run check` passed with the planner
  smoke in the regression floor. The full run included API unit tests (56 suites,
  471 tests), web unit tests (11 suites, 147 tests), graph validation (322 nodes,
  322 edges), pricing coverage, progress verification (153 anchors), QA/security
  suppression hygiene, DB, DevOps, cloud, release, handover, and
  provider-credential gates. Expected caveats remained: `npm run impeccable`
  skipped because the repo targets Node 20 and the optional tool requires Node
  24; DB validation skipped live `schema_migrations` inspection because local
  Postgres was not running; provider credentials warned that invoice artifact
  governance is still demo/local by default.
- Remaining caveat: the planner still does not execute cloud CLIs, handle
  credentials, prove chain of custody, or replace legal retention review. It
  creates the auditable command plan that operators run in their controlled cloud
  environment.

## Phase 2.45 — Provider retention proof API intake

Status: implemented and verified locally on 2026-07-09.

- Added an Owner/Admin-only API handoff:
  `PATCH /api/v1/billing/reconciliations/:id/artifacts/:artifactId/blob/provider-retention-proof`.
  The endpoint attaches verifier output to the exact stored invoice artifact
  without accepting provider credentials or fetching cloud provider APIs.
- Added input validation for durable proof references and SHA-256 verifier
  digests. References must use `s3://`, `azure-blob://`, `gs://`, or `https://`
  and must not contain query strings/fragments, so signed URLs, SAS tokens, and
  bearer-token material are not persisted in evidence or audit logs.
- Updated artifact governance evidence to mark externally stored artifacts as
  `provider-verified` with `provider-control-plane` evidence, `provider-object-lock`
  retention mode, object-store pointer, proof reference, proof digest, and
  bounded caveats.
- Updated evidence-packet governance so artifact-level provider-verified proof can
  satisfy the provider-retention proof gate without relying only on global runtime
  config. Other KMS, scanner, retention deletion, and audit gaps remain visible.
- Added focused API coverage for successful proof attach and signed URL rejection;
  release-readiness guards now assert the endpoint, audit action, security test,
  and docs anchors.
- Verification: focused API test
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts`
  passed with 52 tests, `npm run format:check`, `npm run ci:lint`,
  `npm run release:check`, `npm run progress:verify`, and full `npm run check`
  passed. The full run included API unit tests (56 suites, 474 tests), web unit
  tests (11 suites, 147 tests), graph validation (322 nodes, 322 edges), pricing
  coverage, progress verification (153 anchors), QA/security suppression hygiene,
  DB, DevOps, cloud, release, handover, and provider-credential gates. Expected
  caveats remained: `npm run impeccable` skipped because the repo targets Node 20
  and the optional tool requires Node 24; DB validation skipped live
  `schema_migrations` inspection because local Postgres was not running; provider
  credentials warned that invoice artifact governance is still demo/local by
  default.
- Remaining caveat: this endpoint ingests and audits captured proof metadata only.
  It still does not execute provider control-plane calls, hold cloud credentials,
  prove full chain of custody, or replace legal retention sufficiency review.

## Phase 2.46 — Provider retention proof row persistence

Status: implemented and verified locally on 2026-07-09.

- Added migration `039_invoice_artifact_provider_retention_proof_persistence.sql`
  with additive proof columns on `invoice_artifact_blobs`, status/source/mode/
  digest/reference/caveat constraints, an indexed proof status read path, and a
  refreshed `team_audit_events` action constraint that includes the current
  invoice artifact and evidence-packet actions.
- Updated fresh Docker database bootstrap and `scripts/db.mjs` migration
  validation so a clean self-hosted stack applies migrations through `039`, not
  only the older billing/auth migration range.
- Updated artifact upload and proof attach persistence so provider-retention
  proof metadata is stored with the exact artifact blob row and reconstructed by
  `getInvoiceArtifactBlob` for externally stored artifacts, instead of falling
  back to `missing` when the evidence packet already held a proof.
- Added focused regression coverage for service wiring, signed URL rejection,
  proof row update SQL, database-backed insert defaults, and external-object
  readback as `provider-verified`.
- Verification: `npm run format`, focused API test
  `npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/api-database.repository.spec.ts`
  passed with 2 suites / 79 tests, `npm run db:validate` passed with live
  `schema_migrations` inspection skipped because the local Postgres container was
  not running, and `npm run release:check` passed. Full `npm run check` also
  passed with API 56 suites / 474 tests, web 11 suites / 147 tests, graph
  validation 322 nodes / 322 edges, pricing coverage, progress verification 153
  anchors, QA/security suppression hygiene, DB, DevOps, cloud, release, handover,
  and provider-credential gates green. Expected caveats remained: optional
  `npm run impeccable` skipped because the repo targets Node 20 and the tool
  requires Node 24, DB validation skipped live `schema_migrations` inspection
  because local Postgres was not running, and provider credentials warned that
  invoice artifact governance is still demo/local by default.
- Remaining caveat: PolyCost now persists attached provider-retention proof in
  the artifact blob read model, but it still does not execute provider
  control-plane calls, hold cloud credentials, prove chain of custody, or replace
  legal retention sufficiency review.

## Phase 2.47 — Provider retention proof CLI capture

Status: implemented and verified locally on 2026-07-09.

- Added `npm run invoice:retention-proof:capture`, an optional operator-side
  capture command that executes read-only AWS S3, Azure Blob, or GCP Cloud Storage
  CLI calls from the operator-authenticated shell and writes provider-native proof
  JSON under the workspace `artifacts/` tree.
- The capture command uses structured `spawnSync(command.bin, command.args)` with
  `shell: false`, never accepts credentials as arguments, records
  `providerCredentialsStoredByPolyCost: false`, and runs the existing offline
  verifier by default after writing the proof file.
- Added `--dry-run --json` support for preflight review, workspace-local output
  path enforcement, signed URL/SAS-style query rejection, and fragment rejection.
  AWS S3 allows only `versionId` in the object URI query string.
- Hardened the existing capture planner with the same signed-query/fragment
  rejection so command plans do not echo temporary credential material.
- Added `npm run invoice:retention-proof:capture:smoke` to the full `npm run check`
  floor. The smoke proves AWS/Azure/GCP dry-run command arrays, no cloud CLI
  execution in dry-run mode, provider credential non-storage, signed URI
  rejection for capture/planner paths, and workspace output guards.
- Verification: `npm run format`, `npm run invoice:retention-proof:capture:smoke`,
  `npm run invoice:retention-proof:capture-plan:smoke`, `npm run release:check`,
  and `npm run ci:lint` passed. Full `npm run check` passed with API 56 suites /
  474 tests, web 11 suites / 147 tests, graph validation 322 nodes / 322 edges,
  pricing coverage, progress verification 153 anchors, QA/security suppression
  hygiene, DB, DevOps, cloud, release, handover, and provider-credential gates
  green. Expected caveats remained: optional `npm run impeccable` skipped because
  the repo targets Node 20 and the tool requires Node 24, DB validation skipped
  live `schema_migrations` inspection because local Postgres was not running, and
  provider credentials warned that invoice artifact governance is still demo/local
  by default.
- Remaining caveat: the capture command can execute local provider CLIs only when
  the operator environment already has the required tools, credentials, and
  read-only object retention permissions. PolyCost still does not store provider
  credentials, perform server-side managed proof capture, prove full chain of
  custody, or replace legal retention sufficiency review.

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
