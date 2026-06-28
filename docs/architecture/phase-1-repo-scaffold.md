# Phase 1 Repo Scaffold Design Note

Phase 1 uses an npm-workspaces monorepo. The backend, frontend, Docker Compose
stack, and shared quality gates live in one repository so Phase 1 can verify a
single clean self-host flow with `docker-compose up` and a single CI pipeline.

## Structure

- `apps/api`: NestJS API shell with the centralized config module wired before any
  feature code.
- `apps/web`: React/Vite/Tailwind shell prepared for the PolyCost design tokens.
- `docker/postgres`: local Postgres bootstrap wrapper that reads the generated dev
  password from a Docker volume.
- `vault-seed`: local Vault dev-server seeding logic. It generates local-only
  secrets at runtime and writes them to Vault.
- `.github/workflows`: CI skeleton matching the required lint, unit, integration,
  build, E2E, and security scan order.

## Config and Secrets

Only non-sensitive config appears in `.env.example`. Secret-shaped values are not
listed there. The local Docker Compose stack starts Vault dev-server plus
`vault-seed`, which creates a random database password in a Docker volume and stores
the same value in Vault.

## Phase Boundary

This phase intentionally does not implement the data model, migrations, cloud
adapters, parser, comparison engine, reports, API contracts, or production UI. Those
belong to later phases. The scaffold provides runnable application shells and the
guardrails they will build on.
