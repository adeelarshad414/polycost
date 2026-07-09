# PolyCost

PolyCost is an open-source, self-hostable multi-cloud cost comparison platform. Describe a workload, upload an architecture diagram, or enter it through the guided form, and PolyCost maps the requirement to comparable AWS, Azure, and GCP services with side-by-side cost estimates and exportable reports.

PolyCost is built for decision-grade planning. It estimates and compares costs; it is not a billing, invoicing, or live cloud-account spend management system.

## What PolyCost Does

- Converts workload requirements into a Normalized Workload Specification (NWS).
- Parses Mermaid, draw.io XML, Lucid-style CSV, and VSDX diagrams into reviewable requirements.
- Compares AWS, Azure, and GCP costs across equivalent service mappings.
- Shows daily, weekly, monthly, quarterly, and yearly cost views.
- Combines executive decision summaries with engineering-level cost evidence.
- Supports pricing model analysis for on-demand and commitment-style comparisons where data is available.
- Provides region-aware pricing and official provider calculator/region links.
- Adds FinOps workflows for budgets, alerts, exchange rates, share links, and reporting.
- Exports reports as PDF, CSV, and Excel.
- Runs as a self-hostable monorepo with a web app, API, database, Redis, and Vault-backed secret flow.

## Current Scope

This repository currently includes the V1 MVP plus the Phase 2 diagram-ingestion path:

1. Requirements in: natural language parsing, structured workload form, or diagram import.
2. NWS core: one cloud-neutral workload model.
3. Comparison out: AWS, Azure, and GCP estimates with breakdowns.
4. Reports out: on-screen analytics plus PDF, CSV, and Excel export.

Terraform generation is now available as a reviewed starter-bundle workflow for AWS, Azure, and GCP,
including ZIP export, manifest integrity verification, validation evidence, and starter module
libraries. Reverse Terraform-to-diagram/cost workflows remain future roadmap scope.

## Monorepo Layout

```text
apps/
  api/                 NestJS/Fastify API, pricing adapters, reports, jobs
  web/                 React/Vite frontend dashboard
database/              Postgres migrations and seed data
docker/                Local Postgres bootstrap scripts
fixtures/diagrams/     Diagram parser fixtures, including malicious safety cases
scripts/               Developer, QA, database, and validation scripts
specs/                 Product, API, data-model, and roadmap specifications
vault-seed/            Local development Vault seed script
docker-compose.yml     Full local stack
.env.example           Local environment template
```

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts
- Backend: Node.js, TypeScript, NestJS, Fastify
- Data and jobs: Postgres, Redis, BullMQ
- Secrets: HashiCorp Vault in local development
- Reports: PDF, CSV, Excel generators
- Tooling: Jest, ESLint, Prettier, Docker Compose

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop or another Docker Compose-compatible runtime

## Quick Start

For a clean-clone demo path that installs dependencies if needed, creates `.env`,
boots Docker Compose, applies migrations, and waits for health checks:

```bash
npm run demo:up
```

Generate reviewer screenshots and a short walkthrough video from the running demo:

```bash
npm run demo:artifacts
```

Capture browser audit screenshots, 320px reflow evidence, 200% zoom-equivalent
evidence, axe accessibility checks, and Lighthouse metrics:

```bash
npm run browser:audit
```

Verify a downloaded invoice evidence packet after export:

```bash
npm run invoice:evidence:verify -- ./polycost-invoice-evidence.json
```

Run the built-in verifier smoke, including tamper detection:

```bash
npm run invoice:evidence:verify:smoke
```

Verify the clean-clone demo path with an isolated temporary clone and a
10-minute startup budget:

```bash
npm run demo:verify-clean
```

Create a local environment file:

```bash
cp .env.example .env
```

Install dependencies:

```bash
npm ci
```

Run the full local stack:

```bash
npm run dev
```

Default local URLs:

- Web app: `http://localhost:3000`
- API base: `http://localhost:3001/api/v1`
- Health check: `http://localhost:3001/health`
- Vault dev UI/API: `http://localhost:8200`

The health check returns the API status plus downstream dependency probes for Postgres
and Redis, so a healthy response means the request path can reach the core data and
cache services.

If you only want to run the workspaces directly:

```bash
npm run api:dev
npm run web:dev
```

## API Overview

The main API is versioned under `/api/v1`.

- `POST /comparisons` creates a comparison from an NWS payload.
- `GET /comparisons/:id` retrieves a saved comparison.
- `GET /comparisons/:id/evidence` returns line-item SKU lineage, rate source,
  derivation math, and equivalence confidence for saved comparison numbers.
- `GET /comparisons/:id/export` exports comparison reports.
- `POST /comparisons/:id/refresh-live` refreshes a comparison against live pricing sources when enabled.
- `POST /workload/parse` parses natural language into workload structure.
- `POST /workload/validate` validates workload input.
- `POST /parse/diagram` parses Mermaid, draw.io XML, Lucid CSV, or VSDX into a reviewable NWS draft.
- `GET /pricing/coverage` reports live-catalog versus modeled pricing coverage without claiming invoice-grade support.
- `GET /pricing/status` returns pricing catalog status.
- `GET /pricing/compare` compares cached pricing for a workload.
- `GET /pricing/breakdown` returns detailed workload pricing breakdowns.
- `POST /workloads` persists normalized workload records.
- `POST /budgets` creates budget thresholds.
- `GET /alerts` and `PATCH /alerts/:id` support alert workflows.
- `POST /share-links` creates scoped read-only report links.
- `GET /share/:token` reads a shared report.
- `GET /exchange-rates` returns cached exchange-rate data.
- `GET /regions` returns the cloud region catalog used by the UI.
- `POST /billing/reconciliations/:id/artifacts/:artifactId/blob` stores an invoice
  artifact file for a registered reconciliation artifact.
- `GET /billing/reconciliations/:id/artifacts/:artifactId/blob` returns the stored
  artifact file as base64 for controlled download and records a team audit event
  with checksum, scanner, retention, and storage backend metadata.
- `GET /billing/reconciliations/:id/evidence-packet` returns a metadata-only
  evidence packet with a recomputable SHA-256 integrity manifest, storage/KMS/
  scanner/retention governance summary, and packet-export audit event for reviewer
  handoff.

## Anonymous And Workspace Features

PolyCost keeps the core comparison workflow frictionless. Anonymous users can still
parse requirements, upload diagrams, run comparisons, inspect pricing evidence, export
reports, and create share links.

Accounts add workspace controls on top of that core flow:

- Profile email/display-name update, password change, logout, account session list,
  and server-side "sign out other devices".
- Team creation, team settings, member list, member removal, pending invitations,
  invite-token landing preview, expired/revoked invite states, invite-token
  acceptance, invite-token resend/refresh, and invite revocation.
- Three-role RBAC: Owner, Admin, and Member. Owners manage role changes; owners and
  admins manage members, invitations, SSO provider configuration, and billing import
  workflows; members keep comparison and report access.
- OIDC/SAML configuration readiness with redirect URI display, stored provider
  metadata, mock connection testing, and a signed mock OIDC start/callback flow in
  the workspace UI for development verification.
- Invite delivery defaults to local/demo panel tokens. Staging and production require
  `AUTH_INVITE_DELIVERY_MODE=webhook`, an HTTPS delivery URL, and an HMAC signing
  secret; webhook mode sends the invite link to the delivery provider and does not
  expose the raw token back to the browser.
- Privileged workspace, invitation, SSO, billing import, and reconciliation actions
  write append-only team audit events. Staging and production require
  `AUTH_AUDIT_EXPORT_MODE=webhook`, an HTTPS SIEM/WORM receiver URL, and an HMAC
  signing secret; PolyCost stores an outbox row in the same database transaction as
  the audit event and scheduled workers retry signed delivery without blocking the
  user-facing mutation.
- Billing reconciliation evidence can register invoice artifact metadata, store the
  associated artifact file in the database, download that stored file, and mark
  artifacts verified/rejected with review references, checksum/control-total checks,
  governance metadata, and audit events. Stored artifacts include retention,
  legal-hold, KMS-readiness, and scan-hook metadata. Admin readiness and retention
  endpoints expose object-store/KMS/scanner/retention posture, and strict provider
  checks warn or fail when those controls are missing. Evidence packets can be
  downloaded with a tamper-evident manifest, a signed receipt when configured, and
  local verification through `npm run invoice:evidence:verify -- <packet.json>`.
  Staging and production must configure signed receipts plus provider object-lock
  or external WORM retention posture before claiming durable evidence handoff.
  This improves proof discipline but is not a provider invoice system of record.

The current self-hosted product does not yet include enterprise IdP login round-trips,
full email-template management, org billing plans, or a hosted account marketplace.
Those remain release-track items rather than blockers for anonymous cost comparison.

## Session And Account Security

- Session tokens are random bearer tokens; the API stores only token hashes.
- `AUTH_SESSION_TTL_HOURS` controls server-side expiry. Expired or revoked sessions
  fail with the standard unauthorized API envelope.
- The SPA stores only the bearer token and expiry timestamp locally. There is no
  silent refresh flow; expired or revoked sessions are cleared on the next workspace
  session check and the anonymous comparison flow remains usable.
- Logout revokes the current server-side session. "Sign out other devices" revokes
  other active sessions for the same account while preserving the current session.
- Concurrent sessions are allowed by default so a user can demo from more than one
  browser/device; administrators should shorten `AUTH_SESSION_TTL_HOURS` for stricter
  self-hosted deployments.
- Local password login enforces minimum length, failed-login tracking, and lockout
  via `AUTH_MAX_FAILED_LOGIN_ATTEMPTS` and `AUTH_LOCKOUT_MINUTES`.
- Anonymous compare, diagram import, reports, and share links remain available
  without accounts. Team administration, SSO provider setup, and billing-export
  reconciliation require a signed-in owner/admin workspace session.

## Diagram Imports

Supported Phase 2 inputs:

- Mermaid: paste `.mmd` or Mermaid flowchart text.
- draw.io / diagrams.net: export with `File > Save as` or `File > Export as > XML`, then upload the `.drawio` or `.xml` source file.
- Lucidchart CSV: use `File > Export > CSV of Shape Data`, then upload the CSV export.
- Lucidchart VSDX: use `File > Export > Visio (VSDX)`, then upload the `.vsdx` file.

Limits and safety behavior:

- Max decoded diagram source size is 5MB.
- Images, screenshots, and PDFs are not parsed in Phase 2; export the editable source format instead.
- XML entities/DTDs, compressed draw.io bombs, VSDX ZIP bombs, spoofed image extensions, and oversized uploads are rejected.
- Successful imports are copied to a randomized non-webroot temp path for the review step and expire after 24 hours.
- If `DIAGRAM_LLM_CLASSIFIER_ENDPOINT` and `DIAGRAM_LLM_CLASSIFIER_MODEL` are set,
  unresolved nodes can use an OpenAI-compatible JSON-schema classifier with the API key
  read from Vault at `secret/polycost/llm` key `api_key`.
- If the diagram classifier endpoint/model are unset, unresolved nodes stay in the
  review screen for manual classification. This is the default OSS path.

## Common Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Workspace-specific commands:

```bash
npm test --workspace @polycost/web
npm run build --workspace @polycost/web
npm test --workspace @polycost/api
npm run build --workspace @polycost/api
```

Database helpers:

```bash
npm run db:migrate
npm run db:seed
npm run db:reset
npm run db:validate
```

`db:migrate` starts the local Postgres service, checks the live `schema_migrations`
table, and applies any pending migration files in order. `db:validate` verifies that
all expected migration files exist and that the running database has recorded them.

Security and quality checks:

```bash
npm run loading:check
npm run handover:check
npm run public:readiness:check
npm run browser:audit
npm run security:audit
npm run provider:credentials:check
npm run audit:export:smoke:local
npm run overlay:check
npm run release:check
npm run qa
npm run check
```

## Configuration

Start from `.env.example`. Important local settings include:

- `API_PORT`
- `API_HOST_PORT`
- `WEB_PORT`
- `POLYCOST_DEMO_COMMAND_TIMEOUT_MS`
- `POLYCOST_E2E_COMMAND_TIMEOUT_MS`
- `POLYCOST_E2E_DIAGNOSTICS_TIMEOUT_MS`
- `VITE_API_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `PRICING_SYNC_ALERT_WEBHOOK_URL`
- `EXCHANGE_RATE_API_URL`
- `EXCHANGE_RATE_TARGET_CURRENCIES`
- `USE_MOCK_PROVIDERS`
- `PRICING_ETL_RUN_ON_BOOT`
- `FEATURE_LIVE_PRICING_REFRESH_ENABLED`
- `FEATURE_RESERVED_PRICING`
- `AUTH_SESSION_TTL_HOURS`
- `AUTH_LOCAL_REGISTRATION_ENABLED`
- `AUTH_PUBLIC_BASE_URL`
- `AUTH_SSO_STATE_SECRET`
- `AUTH_INVITE_DELIVERY_MODE`
- `AUTH_INVITE_DELIVERY_WEBHOOK_URL`
- `AUTH_INVITE_DELIVERY_WEBHOOK_SECRET`
- `AUTH_INVITE_EMAIL_FROM`
- `AUTH_AUDIT_EXPORT_MODE`
- `AUTH_AUDIT_EXPORT_WEBHOOK_URL`
- `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET`
- `AUTH_AUDIT_EXPORT_SCHEDULE_CRON`
- `AUTH_AUDIT_EXPORT_BATCH_SIZE`
- `AUTH_AUDIT_EXPORT_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_PER_MINUTE`
- `RATE_LIMIT_NL_PARSE_PER_MINUTE`
- `RATE_LIMIT_LIVE_REFRESH_PER_MINUTE`

Local Docker Compose runs Vault, Postgres, Redis, the API, and the web app. The development Vault token and seeded secrets are for local use only.

For self-hosted demos without cloud pricing credentials, keep `USE_MOCK_PROVIDERS=true`
and `PRICING_ETL_RUN_ON_BOOT=true`. The API will seed a deterministic AWS/Azure/GCP
pricing catalog on startup, while real provider adapters remain available when mock
providers are disabled. Use `docs/PROVIDER-CREDENTIALS.md` and `DUMMY-VALUES.md`
before switching `USE_MOCK_PROVIDERS=false`.

For audit-export receiver proof, run `npm run audit:export:smoke:local` to start a
temporary HMAC-verifying receiver and append the accepted event to
`artifacts/audit-export-smoke/`. In staging, set
`AUTH_AUDIT_EXPORT_WEBHOOK_URL` and `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET`, then run
`npm run audit:export:smoke` against the real SIEM/WORM receiver and archive the
printed canary `exportId` with the receiver-side retention evidence.

## Documentation

- `docs/HOW-TO-USE.md` explains the customer-facing product workflow and demo
  talk track.
- `docs/DEPLOYMENT.md` covers self-hosted demo and production deployment guidance.
- `docs/RUNBOOK.md` covers operating procedures, health checks, incidents, and
  pre-demo checks.
- `docs/COMPARISON.md` compares PolyCost honestly with Infracost, Vantage,
  CloudZero, IBM Cloudability, and native calculators.
- `docs/ARCHITECTURE.md` documents the current system architecture and extension
  points.
- `docs/CUSTOMER-HANDOVER-LEDGER.md` records the handover verdict, evidence map,
  phase classification, and known gaps.
- `HANDOVER-CENSUS.md` and `HANDOVER-EXCELLENCE-REPORT.md` summarize the final
  customer-handover census, findings, evidence, and blocked items.
- `handover/HANDOVER-README.md` is the final customer handover package entry point.
- `HOW-TO-USE.md` and `DEPLOY.md` are older root-level compatibility guides.
- `docs/PROVIDER-CREDENTIALS.md` covers AWS/Azure/GCP pricing-source setup and
  traceability expectations.
- `docs/development/public-demo-hardening.md` captures the public demo readiness
  floor, repository health checklist, and blocked launch evidence.
- `docs/browser-audit/README.md` indexes the latest browser audit evidence,
  including axe-core and Lighthouse results.
- `LOADING-INVENTORY.md` and `LOADING-AUDIT-REPORT.md` document the loading/progress
  UX audit and evidence.
- `DUMMY-VALUES.md` lists development-only placeholders and production guardrails.
- `PROGRESS.md` tracks project progress.
- `OVERLAY-INVENTORY.md`, `BUTTON-INVENTORY.md`, and
  `OVERLAY-AUDIT-REPORT.md` document the UI interruption and action system audit.
- `CONTRIBUTING.md` explains how to contribute safely.
- `SECURITY.md` explains private vulnerability reporting.
- `SUPPORT.md` explains community support scope.
- `GOVERNANCE.md` explains current maintainer-led project governance.
- `CHANGELOG.md` tracks notable changes.
- `docs/architecture/phase-10-cost-intelligence.md` documents the Phase 1
  cost-intelligence model and future import/Terraform hooks.
- `docs/development/open-source-readiness.md` tracks the private-to-public launch
  checklist.
- `docs/operations/live-pricing-credentials.md` documents live-pricing ETL,
  credential readiness, and current provider coverage limits.
- `specs/README.md` links the deeper product, architecture, data-model, API, security, and testing specs.

## Project Principles

- Cloud-neutral by design.
- Open-source and self-hostable.
- One NWS core for every input path.
- No vendor lock-in inside the tool that helps evaluate vendor lock-in.
- Directionally accurate, decision-grade estimates instead of invoice-level billing claims.

## License

PolyCost is licensed under the MIT License. See `LICENSE`.

The repository is prepared for an eventual public open-source launch, but GitHub
visibility can remain private until the maintainer intentionally changes it.
