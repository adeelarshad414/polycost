# PolyCost Handover README

PolyCost is an open-source, self-hostable multi-cloud cost comparison platform for AWS, Azure, and GCP planning. This handover package is for customer reviewers, engineering owners, and operators taking the repository forward.

## Run Modes

| Mode              | Command                                 | Purpose                                               |
| ----------------- | --------------------------------------- | ----------------------------------------------------- |
| Clean demo        | `npm run demo:up`                       | One-command local stack with seeded/mock pricing data |
| Local development | `npm run api:dev` and `npm run web:dev` | Workspace-local API and web dev servers               |
| Full Compose      | `npm run dev`                           | API, web, Postgres, Redis, and Vault together         |
| Verification      | `npm run check`                         | Local regression floor                                |
| Handover check    | `npm run handover:check`                | Validates customer handover docs and evidence anchors |

## Environment Matrix

| Environment            | Provider mode                            | Secrets                                           | Status                      |
| ---------------------- | ---------------------------------------- | ------------------------------------------------- | --------------------------- |
| Local demo             | `USE_MOCK_PROVIDERS=true`                | `.env` plus local Vault seed                      | Verified(mock)              |
| Staging rehearsal      | `USE_MOCK_PROVIDERS=false`               | Vault-backed provider credentials                 | Ready, credentials required |
| Production self-hosted | Real provider ETL plus customer controls | Vault, managed Postgres/Redis, TLS, backup policy | Future deployment hardening |

## Repository Map

- `apps/api`: NestJS/Fastify API, pricing, reports, auth/team, billing, Terraform.
- `apps/web`: React/Vite application, theme, loading, overlay, dashboards.
- `database/migrations`: Postgres schema and seed catalog.
- `docs`: customer-facing guides and deeper architecture/ops docs.
- `handover`: this customer handover package.
- `scripts`: release, demo, verification, security, and handover gates.

## Handover Confidence

Use `HANDOVER-EXCELLENCE-REPORT.md` and `HANDOVER-CENSUS.md` as the final cross-reference. Anything marked `verified(mock)` is real application behavior running on deterministic local/demo boundaries, not a production cloud credential proof.
