# PolyCost Deployment Guide

PolyCost is designed to be self-hosted. The supported local stack is Docker Compose;
production deployments should use equivalent managed services for Postgres, Redis,
Vault, container hosting, TLS, logging, and backups.

## Deployment Modes

| Mode                   | Purpose                         | Pricing source                                   |
| ---------------------- | ------------------------------- | ------------------------------------------------ |
| Local demo             | Reliable stakeholder demo       | Fixture-backed mock catalog                      |
| Real catalog rehearsal | Validate provider adapter setup | Public AWS/Azure catalogs plus GCP Billing API   |
| Production self-host   | Team/org internal deployment    | Operator-managed catalog refresh and credentials |

PolyCost is not an invoice-grade billing platform. Real catalog mode still excludes
private discounts, taxes, credits, enterprise agreements, support contracts, and the
provider invoice of record.

## One-Command Demo

```bash
npm run demo:up
```

The command installs dependencies when needed, prepares `.env`, builds the stack,
runs migrations, seeds local demo data, and waits for health checks.

Demo mode should keep `USE_MOCK_PROVIDERS=true` and
`PRICING_ETL_RUN_ON_BOOT=true` unless you are intentionally rehearsing real provider
catalog access.

Expected local services:

- web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`
- health: `http://localhost:3001/health`
- Vault dev service: `http://localhost:8200`

For an isolated clean-clone proof:

```bash
npm run demo:verify-clean
```

## Environment Configuration

Start from `.env.example`. The most important runtime variables are:

| Area          | Variables                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| API/web ports | `API_PORT`, `API_HOST_PORT`, `WEB_PORT`, `VITE_API_BASE_URL`              |
| Database      | `DB_HOST`, `DB_PORT`, `DB_NAME`                                           |
| Redis         | `REDIS_HOST`, `REDIS_PORT`                                                |
| Vault         | `VAULT_ADDR`, `VAULT_TOKEN_FILE`, optional `VAULT_NAMESPACE`              |
| Pricing       | `USE_MOCK_PROVIDERS`, `PRICING_ETL_RUN_ON_BOOT`, provider default regions |
| Jobs          | pricing, currency, alert, and share-link cleanup cron variables           |
| Auth          | session TTL, registration, lockout, SSO, invite delivery mode/webhook     |
| Audit export  | audit export mode, SIEM/WORM webhook URL, signing secret, retry schedule  |
| Rate limits   | auth, parse, diagram, compare, export, share, live-refresh limits         |
| LLM hooks     | natural-language and diagram classifier endpoint/model variables          |

Do not put provider tokens, LLM API keys, SSO client secrets, or database
passwords in committed files. Store secrets in Vault as documented in
`docs/PROVIDER-CREDENTIALS.md` and `DUMMY-VALUES.md`.

## Audit Export Receiver Verification

Before claiming SIEM/WORM retention readiness, prove both the webhook contract and
the deployed receiver retention path.

Local contract smoke:

```bash
npm run audit:export:smoke:local
```

This starts a temporary localhost receiver, sends a signed
`team_audit_event.recorded` canary payload, verifies the HMAC signature, and appends
one JSONL evidence row under `artifacts/audit-export-smoke/`.

Staging receiver smoke:

```bash
AUTH_AUDIT_EXPORT_WEBHOOK_URL=https://siem.example.com/polycost/audit-events \
AUTH_AUDIT_EXPORT_WEBHOOK_SECRET=replace-with-staging-secret \
npm run audit:export:smoke
```

Archive the printed `exportId`, receiver HTTP status, receiver-side stored record,
retention policy, and access-control evidence. PolyCost proves signed delivery;
the SIEM/WORM platform must prove immutability and retention.

## Invoice Evidence Notary Receiver Verification

Before claiming external invoice evidence WORM handoff readiness, prove both the
notary webhook contract and the deployed receiver retention path.

Local contract smoke:

```bash
npm run invoice:evidence:notary:smoke:local
```

This starts a temporary localhost receiver, sends a signed
`invoice_evidence_packet.exported` canary payload, verifies the HMAC signature, and
appends one compact JSONL evidence row under
`artifacts/invoice-evidence-notary-smoke/`.

Staging receiver smoke:

```bash
INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL=https://worm.example.com/polycost/evidence-receipts \
INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET=replace-with-staging-secret \
npm run invoice:evidence:notary:smoke
```

Archive the printed reconciliation ID, packet digest, base payload digest, receiver
HTTP status, receiver-side stored record, retention policy, and access-control
evidence. PolyCost proves signed handoff delivery; the WORM/notary platform must
prove immutability and retention.

## Reference Invoice Evidence Notary Receiver

For staging rehearsals without a separate SIEM/WORM platform, PolyCost includes a
small reference receiver that verifies signed `invoice_evidence_packet.exported`
handoffs and writes append-only JSONL receipts.

Local development receiver:

```bash
npm run invoice:evidence:notary:receiver:dev
```

Automated receiver smoke:

```bash
npm run invoice:evidence:notary:receiver:smoke
```

Production-like receiver process:

```bash
INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET="<runtime-secret-from-secret-manager>" \
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_HOST=0.0.0.0 \
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PORT=61780 \
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_ARTIFACT_DIR=/mnt/worm/notary-receipts \
npm run invoice:evidence:notary:receiver
```

Container build:

```bash
docker build -f docker/notary-receiver/Dockerfile -t polycost/notary-reference-receiver:local .
docker run --rm -p 61780:61780 \
  -e INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET="<runtime-secret-from-secret-manager>" \
  -v /mnt/worm/notary-receipts:/data/notary-receipts \
  polycost/notary-reference-receiver:local
```

Expose the receiver only behind TLS. Verify `/health/live` and `/health/ready`,
then run `npm run invoice:evidence:notary:smoke` against the HTTPS URL. Archive
the JSONL receipt, packet digest, object-lock/retention policy, access logs, and
secret/key-reference evidence. The reference receiver proves the HMAC handoff
contract and local append-only capture; the storage layer must prove immutable
retention.

## Production Reference Architecture

Use the same app topology across AWS, Azure, or GCP:

- API container behind a TLS load balancer
- web container or static web hosting with API proxy/CORS configured
- managed Postgres with backups, encryption, and point-in-time restore
- managed Redis or Redis-compatible queue/cache service
- Vault or an equivalent secret manager with workload identity integration
- scheduled workers for pricing ETL, exchange rates, alerts, and cleanup
- scheduled audit export workers pointed at a SIEM, immutable log archive, or WORM
  retention webhook
- centralized logs, metrics, alerts, and audit retention

Cloud equivalents:

| Capability       | AWS                      | Azure                          | GCP                          |
| ---------------- | ------------------------ | ------------------------------ | ---------------------------- |
| Containers       | ECS/Fargate or EKS       | Container Apps or AKS          | Cloud Run, GKE, or GCE MIG   |
| Database         | RDS PostgreSQL           | Azure Database for PostgreSQL  | Cloud SQL for PostgreSQL     |
| Redis            | ElastiCache              | Azure Cache for Redis          | Memorystore                  |
| Secrets identity | IAM role plus Vault auth | Managed Identity plus Vault    | Workload Identity plus Vault |
| Logs/metrics     | CloudWatch               | Azure Monitor                  | Cloud Logging/Monitoring     |
| Load balancing   | ALB/NLB plus ACM         | Application Gateway/Front Door | Cloud Load Balancing         |

## Release Procedure

1. Pull the release branch.
2. Run `npm ci`.
3. Run `npm run check`.
4. Run `npm run test:production-readiness`.
5. Run `npm run ci:build`.
6. Run `npm run audit:export:smoke:local`; for staging releases, run
   `npm run audit:export:smoke` against the configured SIEM/WORM receiver.
7. Run `npm run invoice:evidence:notary:receiver:smoke`; for staging releases, run
   `npm run invoice:evidence:notary:smoke` against the configured HTTPS
   notary/WORM receiver.
8. Build API and web images from the repo Dockerfiles.
9. Run database migrations before shifting traffic.
10. Deploy with the previous release still available for rollback.
11. Verify `/health/live`, `/health/ready`, `/health`, and `/health/deep`.
12. Run a comparison, export PDF/CSV/Excel, and inspect pricing evidence.

## Real Provider Pricing Rehearsal

1. Set `USE_MOCK_PROVIDERS=false`.
2. Set `PRICING_ETL_RUN_ON_BOOT=false` unless the deployment can safely call
   provider APIs during startup.
3. Seed GCP credentials in Vault. AWS and Azure current catalog paths are public and
   unauthenticated.
4. Run:

```bash
npm run provider:credentials:check
npm run provider:credentials:check:strict
```

5. Trigger or schedule pricing ETL.
6. Review `GET /api/v1/pricing/coverage`.
7. Run a comparison and confirm source endpoint, source record ID, payload hash,
   transform version, fetched timestamp, and derivation math are present for
   catalog-backed lines.

## Backups And Restore

Minimum production backup policy:

- nightly Postgres logical backup
- point-in-time restore for the managed database
- tested restore into a non-production environment
- retained Vault recovery material according to the operator security policy
- versioned app images and migration scripts for rollback

Restore rehearsal:

```bash
docker compose exec -T postgres pg_dump -U polycost polycost_dev > polycost-backup.sql
docker compose exec -T postgres psql -U polycost polycost_dev < polycost-backup.sql
```

Adjust database names and credentials for production. Never treat a backup as valid
until a restore has been tested.

## Rollback

- Keep the previous API and web image tags available.
- Roll traffic back at the load balancer or deployment controller.
- Do not manually edit schema state. Use forward migrations or a reviewed restore.
- If a pricing ETL run imports bad rows, pause workers, preserve the failed import
  evidence, and restore catalog rows by timestamp or known-good backup.
- After rollback, verify health, comparison creation, exports, share links, and
  pricing coverage.

## Operational Readiness Gates

Run these before demos, customer handover, or production promotion:

```bash
npm run handover:check
npm run release:check
npm run provider:credentials:check
npm run security:audit
npm run check
```

For full-stack local proof:

```bash
npm run ci:e2e
npm run live:verify
```

Hosted GitHub Actions is not currently treated as release evidence until the runner
allocation blocker recorded in the readiness report is resolved.
