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
| 6 - Comparison Engine                                  | Complete with known gaps (see notes) | 2026-06-29   |
| 7 - Report Module                                      | Not started                          | -            |
| 8 - API layer                                          | Not started                          | -            |
| 9 - Frontend                                           | Not started                          | -            |
| 10 - E2E verification against MVP acceptance criteria  | Not started                          | -            |

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

**Status:** Complete with known gaps (see notes)
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
- Runtime verification gap: clean `docker compose up -d --build` was attempted after
  `docker compose down -v`. API/web images built, but Postgres failed during
  `initdb` before migrations ran because the Colima Docker disk was full
  (`/mnt/lima-colima` at 100%, 21 MB available). Host disk had free space. The failed
  project stack was cleaned up with `docker compose down -v`.
- Security status: high/critical npm audit gate passes; npm still reports the known
  30 low/moderate development/tooling advisories. Gitleaks found no leaks; Trivy
  filesystem scan found 0 high/critical vulnerabilities in `package-lock.json`.
- Deviations from spec: none in comparison engine behavior. Runtime database
  application of migration 003 is not live-verified yet due to the Colima capacity
  issue above.
- Checkpoint: Phase 6 is complete with the runtime verification gap noted. Stop here
  until Phase 7 is explicitly approved.

## Phase 7 - Report Module

**Status:** Not started
**Date:** -

Entry template:

- PDF generator implemented: [yes/no]
- CSV generator implemented, formula-injection mitigation applied: [yes/no]
- Excel generator implemented, formula-injection mitigation applied: [yes/no]
- All three formats produce consistent numbers against the same `ComparisonResult`:
  [yes/no]
- Test coverage: [%]

## Phase 8 - API layer

**Status:** Not started
**Date:** -

Entry template:

- All endpoints from `05-API-CONTRACTS.md` implemented: [list any gaps]
- Contract tests passing against documented request/response shapes: [yes/no]
- Partial-degradation path tested: [yes/no]
- Rate limiting applied per `11-SECURITY.md` section 2.5: [yes/no]
- `helmet` and CORS allowlist configured: [yes/no]
- Test coverage: [%] (target: 90%)

## Phase 9 - Frontend

**Status:** Not started
**Date:** -

Entry template:

- Design tokens implemented as CSS variables matching
  `07-UI-UX-DESIGN-SYSTEM.md`: [yes/no]
- NL input plus structured form tabs: [yes/no]
- Three-column comparison view and responsive mobile carousel: [yes/no]
- Light/Dark/System theme switching with no flash of wrong theme: [yes/no]
- Export bar for PDF/CSV/Excel: [yes/no]
- Accessibility checks per `07-UI-UX-DESIGN-SYSTEM.md` section 8: [yes/no]
- Test coverage: [%] (target: 80%)

## Phase 10 - E2E verification against MVP acceptance criteria

**Status:** Not started
**Date:** -

Entry template:

| #   | Acceptance criterion                                                                 | Verified? |
| --- | ------------------------------------------------------------------------------------ | --------- |
| 1   | Zero-context user gets a 3-cloud comparison from a plain-English requirement         | [ ]       |
| 2   | Re-run comparison a week later reflects pricing changes, no code deploy needed       | [ ]       |
| 3   | Same comparison exports consistently across PDF/CSV/Excel                            | [ ]       |
| 4   | Cloud-specific requirement still produces 3-cloud comparison, approximations labeled | [ ]       |
| 5   | Clean checkout plus `docker-compose up` works with no manual pricing-seed step       | [ ]       |
| 6   | Test coverage exists for NWS parsing, adapters, interval math, all 3 export formats  | [ ]       |

All required Playwright E2E journeys from `10-TESTING-STRATEGY.md` section 5 passing:
[ ]

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
- Fresh Docker runtime verification for Phase 6 is blocked until Colima's Docker disk
  has free space. Colima reported `/mnt/lima-colima` at 100% usage with 21 MB
  available; Postgres failed during `initdb` before migrations ran.

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
