# PolyCost Operations Runbook

This runbook is for operators running the self-hosted stack or preparing customer
demos. It assumes Docker Compose locally and equivalent production services in a
managed environment.

## Service Objectives

| User journey                  | Target                                             |
| ----------------------------- | -------------------------------------------------- |
| API health endpoint           | available before traffic routing                   |
| Cached comparison             | p95 below 500 ms after catalog/database warm-up    |
| Pricing matrix/breakdown      | p95 below 800 ms after warm-up                     |
| Report export                 | complete within 30 seconds for MVP-sized workloads |
| Demo startup                  | under 10 minutes in clean-clone verifier           |
| Template-to-recommendation    | under 60 seconds in live verification              |
| Diagram-to-PDF                | under 180 seconds in live verification             |
| Workspace auth/RBAC/SSO smoke | under 60 seconds in live verification              |

Current evidence in `PRODUCTION-READINESS-REPORT.md` shows local live verification
well inside these journey budgets on the checked environment. Re-measure them in the
target hosting environment before production commitments.

## Golden Signals

Track:

- request rate, error rate, and latency by API route
- Postgres connection latency and failed migrations
- Redis availability and queue backlog
- pricing ETL success, partial, rejected, skipped, and failed rows by provider
- report export duration and failure count
- auth failure/lockout rate
- diagram parse rejection and partial-parse counts
- Vault read failures

## Health Endpoints

| Endpoint                   | Use                                                           |
| -------------------------- | ------------------------------------------------------------- |
| `/health/live`             | container/process liveness                                    |
| `/api/v1/health/live`      | versioned liveness alias                                      |
| `/health/ready`            | readiness before routing                                      |
| `/api/v1/health/ready`     | versioned readiness alias                                     |
| `/health`                  | app plus dependency status                                    |
| `/health/deep`             | deeper dependency and degradation probe                       |
| `/api/v1/data-health`      | pricing/cache data health used by comparison warning surfaces |
| `/api/v1/pricing/coverage` | catalog/model coverage and invoice-grade caveats              |
| `/api/v1/pricing/status`   | pricing sync status                                           |
| `/api/v1/regions`          | region catalog status and official links                      |

## Incident: App Does Not Start

Symptoms:

- web cannot load
- API health fails
- `docker compose ps` shows unhealthy services

Actions:

1. Run `docker compose ps`.
2. Inspect API logs with `docker compose logs api`.
3. Inspect Postgres, Redis, and Vault logs.
4. Confirm ports from `.env` are free.
5. Run `npm run db:validate`.
6. If the failure follows a migration, stop traffic and apply the rollback procedure
   from `docs/DEPLOYMENT.md`.

## Incident: Database Unavailable

Symptoms:

- readiness fails
- comparison creation fails
- exports or share links cannot persist

Actions:

1. Confirm Postgres network reachability from the API environment.
2. Check connection limits and storage.
3. Verify migration state.
4. Restore from backup only after preserving logs and current migration state.
5. After recovery, run `npm run db:validate` and a smoke comparison.

## Incident: Redis Unavailable

Symptoms:

- `/health` or `/health/deep` reports degraded
- queue-backed jobs lag or fail

Actions:

1. Confirm Redis reachability and memory pressure.
2. Restart Redis or fail over to the managed replica.
3. Confirm API remains usable for core comparison paths.
4. Re-run `npm run live:verify` when the stack is healthy.

Expected behavior: PolyCost should degrade clearly rather than silently hiding Redis
loss. The readiness report records Redis-degradation evidence.

## Incident: Pricing Data Is Stale Or Missing

Symptoms:

- comparison warning says pricing data health is stale/missing
- `/api/v1/pricing/coverage` shows modeled or unavailable categories
- `/api/v1/pricing/status` shows failed or partial ETL

Actions:

1. Check provider credential readiness.
2. Check Vault token availability.
3. Inspect pricing ETL logs by provider.
4. Review rejected/skipped row counts.
5. Re-run ETL in a controlled window.
6. Inspect evidence on one comparison line item before announcing recovery.

Never represent modeled or stale rows as invoice-grade data.

## Incident: Refresh Live Fails

Symptoms:

- refresh-live endpoint returns an error
- UI shows a refresh warning

Actions:

1. Confirm `FEATURE_LIVE_PRICING_REFRESH_ENABLED=true`.
2. Check rate-limit status.
3. Confirm the saved comparison has sourceRecordKey/source record evidence.
4. Confirm provider catalog rows exist for the target family/region.
5. Use `GET /api/v1/pricing/coverage` to identify modeled rows that cannot be
   provider-refreshed.

## Incident: Exports Fail

Symptoms:

- PDF/CSV/Excel buttons fail
- share link works but downloaded report is missing

Actions:

1. Reproduce against a small saved comparison.
2. Check API logs for report generator errors.
3. Confirm database can read the comparison and evidence rows.
4. Confirm available disk/memory if the deployment writes temporary artifacts.
5. Re-run focused report tests:

```bash
npm run test:unit --workspace @polycost/api -- --runInBand src/reports/report-generators.spec.ts
```

## Incident: Diagram Parsing Is Wrong

Symptoms:

- services are unresolved
- VSDX output differs from the visual diagram
- classifier confidence is low

Actions:

1. Confirm the file is editable source, not an image/PDF.
2. Check the review panel for unresolved nodes.
3. For VSDX, compare the approximate SVG preview plus page/container/bounds evidence
   against the source diagram. Treat theme/icon/text-wrap differences as expected
   unless the topology, labels, or service classification are wrong.
4. If using Tier 3 LLM classification, verify endpoint/model and Vault key.
5. Add a sanitized fixture before claiming a parser fix.

## Incident: Auth Or RBAC Fails

Symptoms:

- user cannot log in
- member sees owner/admin controls
- invitation flow fails
- mock OIDC callback fails

Actions:

1. Confirm `AUTH_PUBLIC_BASE_URL` matches the reachable API origin.
2. Confirm `AUTH_SSO_STATE_SECRET` is not a dummy value outside development.
3. For staging/production, confirm `AUTH_INVITE_DELIVERY_MODE=webhook`, the webhook
   URL uses HTTPS, and `AUTH_INVITE_DELIVERY_WEBHOOK_SECRET` is non-dummy.
4. Confirm `AUTH_AUDIT_EXPORT_MODE=webhook`, the audit export URL uses HTTPS, and
   `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET` is non-dummy so team audit events leave the
   app database for SIEM/WORM retention.
5. Run `npm run audit:export:smoke:local` for local contract proof, or
   `npm run audit:export:smoke` with staging `AUTH_AUDIT_EXPORT_WEBHOOK_URL` and
   `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET` to prove the real receiver accepts signed
   canary events.
6. Run `npm run invoice:evidence:notary:smoke:local` for local notary handoff
   contract proof, or `npm run invoice:evidence:notary:smoke` with staging
   `INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL` and
   `INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET` to prove the real WORM/notary receiver
   accepts signed evidence handoff canaries.
7. Check rate-limit and lockout settings.
8. Re-run focused auth tests:

```bash
npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/auth.controller.spec.ts src/api/invitation-delivery.service.spec.ts
```

## Incident: GitHub Actions Do Not Run

Symptoms:

- job has no runner
- `runner_id` is 0
- steps are empty

Actions:

1. Classify this as CI infrastructure/account blocking, not a passing repo check.
2. Run the regression floor locally.
3. Attach command evidence to the PR.
4. Do not claim hosted CI evidence until GitHub allocates a runner and executes
   repository steps.

## Pre-Demo Checklist

```bash
npm run handover:check
npm run release:check
npm run audit:export:smoke:local
npm run test:production-readiness
npm run ci:build
npm run demo:up
npm run demo:artifacts
```

Review `docs/demo-artifacts/README.md` and refresh screenshots/video after material
UI changes.
