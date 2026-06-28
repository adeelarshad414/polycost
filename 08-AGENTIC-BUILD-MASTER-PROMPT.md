# PolyCost - Master Agentic Build Prompt

This prompt kicks off MVP development from the complete PolyCost spec kit. It assumes
the agent has read/file access to `00` through `11`, plus `PROGRESS.md`,
`HOW-TO-USE.md`, and `DEPLOY.md`.

## Step 0 - Read before writing code

Read these files, in order, before taking any other action:

1. `00-MASTER-PROMPT.md`
2. `02-MVP-SCOPE.md`
3. `03-ARCHITECTURE.md`
4. `04-DATA-MODEL.md`
5. `05-API-CONTRACTS.md`
6. `07-UI-UX-DESIGN-SYSTEM.md`
7. `09-CONFIG-AND-SECRETS.md`
8. `10-TESTING-STRATEGY.md`
9. `11-SECURITY.md`

Do not read `01-VISION-AND-ROADMAP.md` or `06-ROADMAP-V2-V3-V4.md` into active
working context for the MVP build.

Also locate these files and use them at the appropriate phases:

- `PROGRESS.md`: update at every phase checkpoint.
- `HOW-TO-USE.md`: keep in sync while Phase 9 frontend work is built.
- `DEPLOY.md`: read before Phase 1 because Docker Compose must match its self-host
  instructions.

After reading, produce a short build plan covering:

- The phase sequence to follow.
- Ambiguities that need decisions before proceeding.
- Confirmation of the tech stack being initialized.

Stop after producing the build plan and wait for explicit approval before writing
implementation code.

## Step 1 - Required phase order

### 1. Repo scaffold

Create the repo structure, choosing monorepo or split repo and stating why.

Required scaffold:

- Docker Compose for Postgres, Redis, Vault dev-server, and a `vault-seed` job.
- Base NestJS app with the config module wired up first.
- Config schema validation per `09-CONFIG-AND-SECRETS.md`.
- Base React app.
- Linting/formatting config with `eslint-plugin-security`.
- CI skeleton covering all stages from `10-TESTING-STRATEGY.md`.
- `.env.example` with only non-sensitive values.

The app must fail loudly at boot on invalid config from the first implementation
phase.

### 2. Data layer

Implement the Postgres schema from `04-DATA-MODEL.md`:

- `pricing_catalog`
- `service_equivalence_map`
- `pricing_etl_runs`
- `comparisons`

Also implement:

- NWS TypeScript types/interfaces.
- `NWSValidator`.
- Validator tests before or alongside the validator.
- Least-privilege DB roles per `11-SECURITY.md`.
- DB credentials retrieved through `SecretsService` from Vault from the first DB
  connection.

`NWSValidator` must reach 100% coverage per `10-TESTING-STRATEGY.md`.

### 3. Cloud provider adapters

Implement `CloudProviderAdapter` first, then build AWS, Azure, and GCP adapters one
at a time.

Requirements:

- Real pricing API integration for `refreshPricingCatalog()`.
- Provider credentials retrieved through `SecretsService` when required.
- Recorded API response fixtures for deterministic CI.
- 85% coverage per adapter.
- Build and test one adapter fully before starting the next.

### 4. Pricing ETL job

Wire adapters into a BullMQ scheduled job.

Requirements:

- Schedule comes from `PRICING_ETL_SCHEDULE_CRON`, not a hardcoded cron string.
- Tests use mocked adapter responses.
- Test partial provider failure.
- Each provider outcome is logged independently in `pricing_etl_runs`.

### 5. NWS Parser Module

Build `FormToNWSService` first, then `NLParserService`.

Requirements:

- LLM key retrieved through `SecretsService`.
- LLM output constrained to structured NWS output.
- LLM output validated by `NWSValidator`.
- Form and NL paths produce the same NWS shape.

### 6. Comparison Engine

Implement:

- `EquivalentServiceMapper`
- `IntervalCostCalculator`
- `ComparisonOrchestratorService`

Coverage targets:

- `IntervalCostCalculator`: 100%
- Relevant `NWSValidator` paths: 100%
- `EquivalentServiceMapper`: 95%
- Orchestrator: 90%

Verify the comparison engine has zero direct imports from `/adapters/*` and depends
only on the `CloudProviderAdapter` interface.

### 7. Report Module

Implement PDF, CSV, and Excel generators from the same `ComparisonResult` shape.

Requirements:

- All three formats show consistent numbers against the same fixture.
- CSV/Excel formula-injection mitigation for user-influenced text.
- HTML escaping discipline for PDF templates.

### 8. API layer

Implement NestJS controllers per `05-API-CONTRACTS.md`.

Requirements:

- Contract tests for documented request/response shapes.
- Error-shape tests.
- Partial-degradation behavior tests.
- 90% API coverage.
- `helmet`.
- Explicit CORS allowlisting from config, never `*`.
- Rate limiting on `/workload/parse` and `/comparisons/:id/refresh-live`.
- Add `/health` for load balancer checks because `DEPLOY.md` assumes it.

If adding `/health`, report it as a spec gap filled, not silent scope creep.

### 9. Frontend

Build against `07-UI-UX-DESIGN-SYSTEM.md` token-for-token.

Required flow:

- NL input plus structured form in tabs.
- Editable structured form before pricing.
- Three-column comparison view.
- Responsive mobile carousel.
- Export bar.
- Theme behavior per design system.

Requirements:

- 80% frontend coverage, weighted toward logic-bearing components.
- Update `HOW-TO-USE.md` as frontend features land.

### 10. End-to-end verification

Verify every MVP acceptance criterion from `02-MVP-SCOPE.md` against the running
system.

Also run:

- Full Playwright E2E journey set from `10-TESTING-STRATEGY.md`.
- Full CI gate sequence: lint, unit with coverage, integration, build, E2E, security
  scan.
- Clean self-host verification via Docker Compose, including Vault dev-server and
  seed job.

## Step 2 - Operating rules

### Checkpoint after every phase

After each phase, stop and report:

- What was built.
- What tests exist and pass.
- Coverage percentage achieved against `10-TESTING-STRATEGY.md`.
- Confirmation no config value or secret was hardcoded.
- Confirmation relevant `11-SECURITY.md` checklist items were addressed.
- Any spec deviation and why.
- Confirmation `PROGRESS.md` was updated.
- Confirmation before moving to the next phase.

Do not chain multiple phases together in one unsupervised run.

### Stop on open questions

Do not guess on open questions from `02-MVP-SCOPE.md`, including:

- Default regions per cloud.
- Currency behavior.
- Equivalent-service mapping seed/curation.

Stop and ask for a decision when these block implementation.

### No placeholders or stubs

Do not write placeholder implementation, stub logic, or `TODO: implement later` in
anything presented as done.

### No hardcoded config or secrets

Every config value flows through the centralized Config Module with schema
validation. Every secret flows through `SecretsService` backed by Vault.

Before reporting a phase complete, inspect the diff for:

- Literal connection strings.
- Literal API keys, even fake placeholder-shaped values.
- `process.env.X` access outside config schema/`SecretsService`.

Fix any violation before reporting a phase done.

### Security is continuous

Apply `11-SECURITY.md` checklist items as code is written. Do not plan a separate
end-of-project hardening phase.

### Tests and coverage are mandatory

Tests must be written before or alongside implementation and meet the coverage
threshold for the relevant module.

### NWS is load-bearing

Do not quietly patch around NWS issues with provider-specific special casing. If the
schema needs to change, flag it explicitly before proceeding.

### Self-hosting must work

Before reporting Phase 1 and final completion, verify a clean self-host run via
Docker Compose, including Vault dev-server and seed job.

### Keep docs current

- `PROGRESS.md` gets a real entry at every phase checkpoint.
- `HOW-TO-USE.md` gets updated as frontend features land.
- `DEPLOY.md` must stay aligned with the Docker Compose scaffold.

## Step 3 - Whole-build definition of done

The MVP is complete only when:

- Every acceptance criterion in `02-MVP-SCOPE.md` passes against the actual running
  system.
- Every in-scope MVP checkbox is implemented with tests meeting coverage thresholds.
- No hardcoded config or secret exists anywhere.
- The security checklist has been applied throughout.
- The full CI gate sequence passes end to end.
- `PROGRESS.md` shows every phase as complete or complete with explicit known gaps.
- `HOW-TO-USE.md` accurately describes the running application.
- `DEPLOY.md` Part 1 has been verified against a clean checkout.

Begin with Step 0, then stop for approval before implementation.
