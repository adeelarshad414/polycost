# PolyCost

PolyCost is an open-source, self-hostable multi-cloud cost comparison platform. Describe a workload, or enter it through the guided form, and PolyCost maps the requirement to comparable AWS, Azure, and GCP services with side-by-side cost estimates and exportable reports.

PolyCost is built for decision-grade planning. It estimates and compares costs; it is not a billing, invoicing, or live cloud-account spend management system.

## What PolyCost Does

- Converts workload requirements into a Normalized Workload Specification (NWS).
- Compares AWS, Azure, and GCP costs across equivalent service mappings.
- Shows daily, weekly, monthly, quarterly, and yearly cost views.
- Combines executive decision summaries with engineering-level cost evidence.
- Supports pricing model analysis for on-demand and commitment-style comparisons where data is available.
- Provides region-aware pricing and official provider calculator/region links.
- Adds FinOps workflows for budgets, alerts, exchange rates, share links, and reporting.
- Exports reports as PDF, CSV, and Excel.
- Runs as a self-hostable monorepo with a web app, API, database, Redis, and Vault-backed secret flow.

## Current Scope

This repository is focused on the V1 MVP:

1. Requirements in: natural language parsing or structured workload form.
2. NWS core: one cloud-neutral workload model.
3. Comparison out: AWS, Azure, and GCP estimates with breakdowns.
4. Reports out: on-screen analytics plus PDF, CSV, and Excel export.

Future roadmap items include diagram input, Terraform generation, and reverse Terraform-to-diagram/cost workflows. Those are documented in the project specs but are not the active MVP runtime path.

## Monorepo Layout

```text
apps/
  api/                 NestJS/Fastify API, pricing adapters, reports, jobs
  web/                 React/Vite frontend dashboard
database/              Postgres migrations and seed data
docker/                Local Postgres bootstrap scripts
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

If you only want to run the workspaces directly:

```bash
npm run api:dev
npm run web:dev
```

## API Overview

The main API is versioned under `/api/v1`.

- `POST /comparisons` creates a comparison from an NWS payload.
- `GET /comparisons/:id` retrieves a saved comparison.
- `GET /comparisons/:id/export` exports comparison reports.
- `POST /comparisons/:id/refresh-live` refreshes a comparison against live pricing sources when enabled.
- `POST /workload/parse` parses natural language into workload structure.
- `POST /workload/validate` validates workload input.
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

Security and quality checks:

```bash
npm run security:audit
npm run qa
npm run check
```

## Configuration

Start from `.env.example`. Important local settings include:

- `API_PORT`
- `WEB_PORT`
- `VITE_API_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `EXCHANGE_RATE_API_URL`
- `EXCHANGE_RATE_TARGET_CURRENCIES`
- `FEATURE_LIVE_PRICING_REFRESH_ENABLED`
- `RATE_LIMIT_NL_PARSE_PER_MINUTE`
- `RATE_LIMIT_LIVE_REFRESH_PER_MINUTE`

Local Docker Compose runs Vault, Postgres, Redis, the API, and the web app. The development Vault token and seeded secrets are for local use only.

## Documentation

- `HOW-TO-USE.md` explains the product workflow.
- `DEPLOY.md` covers deployment guidance.
- `PROGRESS.md` tracks project progress.
- `specs/README.md` links the deeper product, architecture, data-model, API, security, and testing specs.

## Project Principles

- Cloud-neutral by design.
- Open-source and self-hostable.
- One NWS core for every input path.
- No vendor lock-in inside the tool that helps evaluate vendor lock-in.
- Directionally accurate, decision-grade estimates instead of invoice-level billing claims.

## License

License is not yet declared.
