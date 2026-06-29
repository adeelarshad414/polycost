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

| Phase                                                  | Status                               | Last updated |
| ------------------------------------------------------ | ------------------------------------ | ------------ |
| 0 - Build plan & approval                              | Complete                             | 2026-06-28   |
| 1 - Repo scaffold                                      | Complete                             | 2026-06-28   |
| 2 - Data layer (Postgres schema, NWS types, validator) | Complete                             | 2026-06-28   |
| 3 - Cloud provider adapters                            | Complete                             | 2026-06-28   |
| 4 - Pricing ETL job                                    | Complete                             | 2026-06-28   |
| 5 - NWS Parser Module                                  | Complete                             | 2026-06-28   |
| 6 - Comparison Engine                                  | Complete                             | 2026-06-29   |
| 7 - Report Module                                      | Complete                             | 2026-06-29   |
| 8 - API layer                                          | Complete                             | 2026-06-29   |
| 9 - Frontend                                           | Complete                             | 2026-06-29   |
| 10 - E2E verification against MVP acceptance criteria  | Complete with known gaps (see notes) | 2026-06-29   |

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
[ ] Not yet. This checkpoint adds a Jest public-API/Compose acceptance suite for the
core MVP criteria. Browser-driven Playwright journeys for theme switching, responsive
carousel behavior, partial provider failure warning, and keyboard-only navigation
remain carried-forward UI automation work.

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
- Full all-workspace `npm run test:coverage` currently fails the API global branch
  threshold: all API tests pass, but aggregate API branch coverage reports 81.56%
  against the configured 85% target. The focused web coverage gate for the frontend
  polish passes.
- Phase 10's automated acceptance gate is a Jest public-API/Compose suite rather than
  the full Playwright journey set requested by `10-TESTING-STRATEGY.md`. Prior browser
  smokes covered responsive UI behavior, but formal Playwright tests for theme,
  mobile carousel, provider failure warning, and keyboard-only flows remain open.
- Phase 10 refresh-live acceptance verifies that a comparison is re-run into a fresh
  snapshot from current catalog data. Deterministic proof that a changed catalog row
  changes the refreshed result still needs either a test-only catalog fixture path or
  internal SKU traceability for safe mutation.

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
- Phase 10 automated E2E uses Jest public-API/Compose tests instead of Playwright.
  This keeps the checkpoint inside the current dependency set while verifying the
  core MVP acceptance criteria against the running stack. The formal Playwright
  journey set remains carried forward.
- Post-Phase 9 audit remediation seeds a local baseline pricing catalog so clean
  self-hosted Compose stacks can produce first-run comparisons before provider ETL
  credentials are configured. Seed rows are marked `attributes.source = local_seed`,
  and catalog reads prefer real ETL rows over local seed rows when both exist.
