# PolyCost Production Readiness Report

Date: 2026-07-07
Branch: `codex/reconciliation-coverage-hardening`
PR: #24, `Production readiness verification hardening`
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

## Findings And Disposition

| ID             | Disposition   | Evidence                                                                                                                                                                            |
| -------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-FMT-001     | Fixed         | `npm run check` initially failed on unformatted orchestrator docs; after formatting, `npm run format:check` and `npm run check` passed                                              |
| P0-DOC-001     | Fixed         | Orchestrator docs moved from `docs/orchestrators/*` to requested `docs/design/*`                                                                                                    |
| P0-SYNC-001    | Fixed         | `STATE-SYNC.md` created with product detection, CI state, phase classification, and gate register                                                                                   |
| P0-INV-001     | Fixed         | `THEME-INVENTORY.md` created with route/component inventory and P0 findings                                                                                                         |
| TKN-001        | Fixed         | Token hex values isolated to `apps/web/src/styles/tokens.css`; `npm run theme:hex:check` passed                                                                                     |
| TKN-002        | Fixed         | Added persisted `data-accent="default                                                                                                                                               | terracotta"` axis, pre-hydration application, and Appearance control |
| TKN-003        | Fixed         | Added `theme:hex:check` script and CI workflow gate                                                                                                                                 |
| API-HEALTH-001 | Fixed         | Added additive `/health/live`, `/api/v1/health/live`, `/health/ready`, and `/api/v1/health/ready` endpoints                                                                         |
| UI-ARCHIVE-001 | Fixed (smoke) | `docs/theme-audit/2026-07-07/` contains dark/light default screenshots and dark/light terracotta screenshots with token evidence                                                    |
| CI-REMOTE-001  | Blocked       | GitHub Actions job `85608851518` for prior head showed `runner_id: 0`, empty runner name/group, `steps: []`; remote runner/account infra is not executing repo steps                |
| INV-TRACE-002  | Improved      | Provider-export rows now persist `_polycost` source fingerprints/column coverage; reconciliation evidence reports coverage, match summary, readiness, and caveats                   |
| VSDX-VIS-002   | Improved      | VSDX extraction now includes page size, normalized preview bounds, geometry hints, and an explicit layout-extraction caveat                                                         |
| LLM-READY-002  | Improved      | Diagram LLM client now exposes readiness without calling the provider or reading secrets, keeping stub/unconfigured mode distinct from production-connected mode                    |
| UI-AUTH-002    | Improved      | Workspace billing panel now surfaces reconciliation readiness, source-fingerprint coverage, SKU match coverage, and the invoice-of-record caveat                                    |
| TF-GEN-001     | Added         | V3 Terraform generation endpoint and UI panel now generate AWS/Azure/GCP starter bundles from NWS with provider pinning, remote-state examples, static checks, and explicit caveats |
| TF-GEN-002     | Improved      | V3.1 hardening adds generation profiles, private database networking checks, runtime identity baselines, policy/test/Makefile artifacts, and module-boundary documentation          |
| TF-GEN-003     | Improved      | V3.2 assurance adds generated CAF/WAF/Terraform framework-alignment evidence and topology-aware public/private ingress/load-balancer controls                                       |
| TF-GEN-004     | Improved      | V3.3 adds downloadable Terraform ZIP export, bundle manifest hash evidence, generated validation runner, and frontend ZIP/evidence download actions                                 |
| TF-GEN-005     | Improved      | V3.4 replaces Terraform module placeholders with AWS/Azure/GCP network, compute, and data starter modules plus static module-library validation                                     |
| HND-001        | Added         | Customer handover package added under `docs/`, with usage, deployment, runbook, competitive comparison, architecture, and evidence ledger                                           |
| HND-002        | Added         | `npm run handover:check` validates the handover package and runs inside the full local `npm run check` floor                                                                        |

## Verification

Local static/regression gates:

- `npm run format:check` passed.
- `npm run ci:lint` passed with zero ESLint warnings.
- `npm run theme:hex:check` passed.
- `npm run check` passed.
  - API unit: 50 suites / 390 tests.
  - Web unit: 9 suites / 130 tests.
  - Graph validation: 290 nodes / 290 edges.
  - Pricing coverage guard: 36 frontend priced families covered.
  - Progress verification: 153 phase evidence anchors.
  - Security suppression check: 21 reviewed suppressions.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.
- `npm run test:production-readiness` passed.
  - API focused: 10 suites / 133 tests.
  - Web focused: 2 suites / 84 tests.
- `npm run ci:build` passed for API and web.
- Phase 2.9 focused continuation passed:
  - API focused: `src/api/auth-billing.spec.ts`,
    `src/diagram-parser/diagram-parser.service.spec.ts`, and
    `src/diagram-parser/llm-classifier.client.spec.ts`: 3 suites / 52 tests.
  - Web focused: `src/App.spec.tsx`: 1 suite / 57 tests.
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
- Full invoice-grade pricing remains future scope: negotiated discounts, credits,
  taxes, enterprise agreements, marketplace charges, and actual provider invoice-of-record
  reconciliation are not complete. Phase 2.9 improves source-row traceability and
  estimate-vs-actual reconciliation evidence.
- VSDX support remains extraction/evidence oriented, not full Visio visual rendering.
  Phase 2.9 adds page geometry, normalized preview bounds, and explicit layout-extraction
  caveats.
- Production LLM classifier quality requires a real endpoint/model, Vault secret, monitored
  corpus evaluation, and false-positive tracking. Phase 2.9 adds an explicit readiness
  surface so stub/unconfigured mode is not reported as production-connected.
- Full enterprise auth product polish remains future scope: production email, SSO/SAML,
  org billing UX, and complete team/account lifecycle polish.
- Terraform generation now has a hardened root bundle, ZIP export, bundle
  manifest, validation runner, generation profile, private database networking,
  runtime identity baselines, policy/test scaffolding, and AWS/Azure/GCP starter
  modules for network, compute, and data. Full production IaC remains future
  scope: landing-zone integration, edge/observability/DR modules,
  container/serverless/Kubernetes module generation, active-active DR, and real
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
