# Cloud Readiness

PolyCost is cloud-neutral. The application estimates AWS, Azure, and GCP pricing but
does not create cloud resources during MVP operation.

## Required Runtime Configuration

Application configuration comes from environment variables validated by
`apps/api/src/config/config.schema.ts`:

- `NODE_ENV`
- `PORT`
- `LOG_LEVEL`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `REDIS_HOST`
- `REDIS_PORT`
- `VAULT_ADDR`
- `VAULT_TOKEN_FILE`
- `CORS_ALLOWED_ORIGINS`
- `PRICING_ETL_SCHEDULE_CRON`
- `CURRENCY_SYNC_SCHEDULE_CRON`
- `ALERT_EVALUATOR_SCHEDULE_CRON`
- `SHARE_LINK_CLEANUP_SCHEDULE_CRON`
- `PRICING_SYNC_ALERT_WEBHOOK_URL`
- `EXCHANGE_RATE_API_URL`
- `EXCHANGE_RATE_TARGET_CURRENCIES`
- `PRICING_ETL_DEFAULT_REGION_AWS`
- `PRICING_ETL_DEFAULT_REGION_AZURE`
- `PRICING_ETL_DEFAULT_REGION_GCP`
- `RATE_LIMIT_NL_PARSE_PER_MINUTE`
- `RATE_LIMIT_LIVE_REFRESH_PER_MINUTE`
- `NL_PARSE_MAX_INPUT_CHARS`
- `LLM_PARSE_ENDPOINT`
- `LLM_PARSE_MODEL`
- `FEATURE_LIVE_PRICING_REFRESH_ENABLED`

Secrets are read from Vault through `SecretsService`; do not place secret values in
environment variables or committed files.

## Secret Paths

Local development seeds these paths:

- `secret/polycost/db`
- `secret/polycost/llm`
- `secret/polycost/admin`

Provider adapter secret paths:

- AWS pricing credentials: `secret/polycost/providers/aws`
- GCP billing token: `secret/polycost/providers/gcp`
- Azure Retail Prices currently requires no secret

## Deployment Notes

- Build API and web images from the existing Dockerfiles.
- Run database migrations before starting API workers in non-local environments.
- Provide Postgres, Redis, and Vault equivalents with least-privilege credentials.
- Set `CORS_ALLOWED_ORIGINS` to the deployed web origin.
- Confirm `/health` passes before routing traffic.
- Do not run pricing ETL jobs with real provider credentials until secrets and rate
  limits are reviewed.
- Confirm BullMQ repeatable jobs exist for pricing ETL, currency sync, alert
  evaluation, and share-link cleanup before enabling production traffic.

## Rollback Notes

- Keep previous API/web images available for rollback.
- Roll database migrations forward with explicit migration scripts; no ad hoc schema
  edits.
- If pricing ETL introduces bad catalog rows, pause the BullMQ worker and restore from
  known-good catalog snapshots or delete rows by `fetched_at` window after review.

## Observability Needs

Before production hosting, add:

- API request logs with request IDs
- Queue job metrics and failure alerts
- Pricing ETL success/partial/failed counters per provider
- Postgres connection and query latency metrics
- Redis availability checks
- Vault read-failure alerts

## Validation

```bash
npm run cloud:check
npm run devops:check
npm run check:full
```

No Terraform, Kubernetes, Vercel, Netlify, Fly.io, Render, Railway, Supabase, or
Firebase deployment files are present yet.
