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

All emitted metrics are on `GET /metrics` in Prometheus text format.

| Signal                                        | Metric                                                                                                                              | Status |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Request rate, error rate, latency by route    | `http_requests_total`, `http_request_errors_total`, `http_request_duration_seconds`                                                 | ✅     |
| Pricing ETL rows and freshness by provider    | `pricing_etl_runs_total`, `pricing_etl_records_total`, `pricing_etl_duration_seconds`, `pricing_etl_last_success_timestamp_seconds` | ✅     |
| Report export duration and failures           | `report_exports_total`, `report_export_duration_seconds`                                                                            | ✅     |
| Auth failure and lockout rate                 | `auth_attempts_total`, `auth_lockouts_total`                                                                                        | ✅     |
| Diagram parse confidence and unresolved nodes | `diagram_parses_total`, `diagram_parse_unresolved_nodes_total`, `diagram_parse_ignored_nodes_total`                                 | ✅     |
| Vault read failures                           | `vault_reads_total`                                                                                                                 | ✅     |
| Postgres query latency and connection health  | `db_queries_total`, `db_query_duration_seconds`, `dependency_up{dependency="db"}`, `dependency_probe_duration_seconds`              | ✅     |
| Redis availability and queue backlog          | `dependency_up{dependency="cache"}`, `job_queue_depth{queue,state}`                                                                 | ✅     |

### How each is sampled

Most instruments are counters incremented at the call site. Three are not:

- **`job_queue_depth`** is read from BullMQ on every scrape. The queue is the
  source of truth; a counter would drift the moment a job is retried, stalled or
  removed by another process. Each read is bounded at **1 s** and all queues are
  read concurrently, because ioredis retries a lost connection indefinitely
  rather than failing — an unbounded read hangs the whole scrape during exactly
  the outage you need it for. If a read fails or times out the series is
  **removed** rather than left at its last value: a stale depth reads as a
  healthy queue.
- **`dependency_up`** and **`dependency_probe_duration_seconds`** are set by the
  existing `/health` TCP probe, which readiness checks already call on a
  schedule, so there is no second polling loop.
- **`db_query_duration_seconds`** comes from a Proxy around each of the four
  connection pools, including statements run on a checked-out transaction
  client. The `pool` label distinguishes them: `api`, `pricing_catalog`,
  `pricing_rates`, `diagram_import`.

> ℹ️ `failed migrations` from the original signal list is **not** covered here.
> Migrations run outside the request path, so they need a job-level signal
> rather than a metric on a live pool.

## Tracing

Distributed tracing is **off by default**. It turns on when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set; without a collector configured, an
always-on exporter would retry forever in every deployment.

```bash
docker compose --profile observability up -d otel-collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318 docker compose up -d api
```

| Variable                      | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector base URL. **Unset = tracing off.**  |
| `OTEL_SERVICE_NAME`           | Defaults to `polycost-api`.                   |
| `OTEL_TRACES_SAMPLER_ARG`     | Root sample ratio, `0`–`1`. Defaults to `1`.  |
| `OTEL_SDK_DISABLED`           | `true` forces tracing off even with endpoint. |

**What is instrumented:** incoming HTTP and Fastify routes, Postgres queries,
Redis/BullMQ, and outbound `fetch` (undici — provider pricing calls go through
it, not the `http` module, so without that instrumentation they are invisible).
Pricing refreshes add a manual `pricing_etl.refresh_provider` span carrying the
provider, status and row counts.

**`/health*` and `/metrics` are excluded.** They are polled constantly and would
bury real requests. Verified: 15 probe requests produce zero spans.

**Logs carry `traceId` and `spanId`** whenever a span is active, so a log line
links to the trace showing where the time went. The fields are omitted entirely
when tracing is off, so log shape is unchanged in those deployments.

> ⚠️ Ordering matters. Instrumentation patches `pg`, `fastify` and `ioredis` as
> they are required, so the bootstrap runs via
> `node --require ./otel-register.cjs`. Starting the API any other way silently
> produces no spans.

## Dashboards and error tracking

Both are opt-in, in the same compose profile as the collector:

```bash
docker compose --profile observability up -d prometheus grafana
```

Grafana comes up on `${GRAFANA_PORT:-3300}` with the Prometheus datasource and
the **PolyCost · Service Health** dashboard provisioned **from files**. Nothing
worth keeping lives in the container, so it can be recreated freely — but it
also means dashboard edits made in the UI are discarded. Change the JSON in
`ops/grafana/dashboards/`.

Every panel carries a description saying what a bad reading means, so the
dashboard is usable by someone who did not build it.

### Error tracking

Unhandled 500s are reported to a self-hosted GlitchTip instance when
`ERROR_TRACKING_DSN` is set. Unset disables it entirely.

Only `INTERNAL_ERROR` is reported. Mapped 4xx responses — validation failures,
404s, 401s — are the API working correctly, and reporting them would bury
genuine defects.

Each report is tagged with `request_id` and `trace_id`, so an error in GlitchTip
links back to the log lines and the trace for that exact request.

> ⚠️ This payload leaves the machine. Redaction is applied to the whole context
> tree — `authorization`, `cookie`, `password`, `token`, `secret`, `email` and
> friends at any depth — and is asserted in tests plus verified on the wire.
> If you add context to a report, check it against
> `apps/api/src/observability/error-reporter.spec.ts`.

### Keeping alerts and dashboards honest

`npm run alerts:check` fails the build when an alert or a dashboard panel
references a metric the service does not emit, when an alert has no runbook
section, or when a panel has no description. Both rot the same way — a renamed
metric leaves a rule that still parses and a panel that renders perfectly and is
simply always empty.

### Label discipline

Every domain instrument is declared in
`apps/api/src/observability/domain-metrics.service.ts`, deliberately in one
file. Labels are closed vocabularies only — provider, format, outcome,
confidence. **Never** label a metric with a workload id, tenant id, account id,
email, secret path or file name: it is unbounded cardinality, and `/metrics` is
unauthenticated, so it would also be a disclosure.

> ⚠️ `/metrics` carries no tenant data, but it does describe traffic volume,
> auth failure rates and ETL throughput. Expose it on the metrics network only.

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
7. If a separate notary platform is not available for staging, run
   `npm run invoice:evidence:notary:receiver:smoke` to prove PolyCost's reference
   receiver can verify HMAC handoffs, expose `/health/ready`, and append JSONL
   evidence. Do not claim immutable retention unless the receiver artifact
   directory is backed by WORM/object-lock storage and access logs are archived.
8. Check rate-limit and lockout settings.
9. Re-run focused auth tests:

```bash
npm run test:unit --workspace @polycost/api -- --runInBand src/api/auth-billing.spec.ts src/api/auth.controller.spec.ts src/api/invitation-delivery.service.spec.ts
```

## Incident: High API Error Rate

**Alert:** `ApiErrorRateHigh` — over 5% of requests returning 5xx for 5 minutes.

1. Check whether a dependency alert is also firing. `PostgresUnavailable` or
   `VaultReadFailures` alongside this one means the cause is downstream, and
   restarting the API will not help.
2. Find a failing trace. `http_request_errors_total` is labelled by `route`, so
   the affected endpoint is on the alert; look at that route's spans to see
   whether the time and the failure are in Postgres, a provider call, or the
   handler.
3. Check `db_queries_total{outcome="failure"}` for a database-level cause.
4. Only restart once you know what failed. A restart clears the symptom and the
   evidence together.

## Incident: API Latency Budget Breached

**Alert:** `ApiLatencyBudgetBreached` — p95 over the 800 ms Service Objective for
10 minutes.

1. Confirm which route. Break `http_request_duration_seconds` down by `route`
   rather than treating it as one number.
2. Compare against `db_query_duration_seconds`. If database latency moved at the
   same time, the API is a victim rather than the cause.
3. Check `job_queue_depth` — a large backlog means workers are competing with
   request handling for the same pool.
4. Look at a slow trace end to end. Outbound provider calls are instrumented, so
   a slow upstream shows up as its own span.

> The 800 ms threshold is the objective for the slowest journey (pricing
> matrix/breakdown). Cached comparisons target 500 ms, so a breach here means
> the slow path is slow, not that everything is.

## Incident: Job Queue Backlog

**Alerts:** `JobQueueBacklogGrowing` (waiting > 100 for 15 min),
`JobQueueFailuresAccumulating` (any failed job sitting for 30 min).

1. Is the worker running at all? A backlog with zero `active` jobs means nothing
   is draining the queue, which is a different problem from being too slow.
2. Check `RedisUnavailable`. If Redis is down, the depth reading is missing
   rather than zero — see `JobQueueDepthUnknown`.
3. For failed jobs: once retries are exhausted BullMQ leaves them in place. They
   never clear on their own, so a non-zero `failed` count is work someone has to
   look at, not a transient.
4. Inspect the failures before retrying them in bulk. A poison job re-queued at
   scale will just fail again.

## Incident: Vault Read Failures

**Alert:** `VaultReadFailures` — any sustained failure rate for 5 minutes.

1. Check Vault itself is up and unsealed. A sealed Vault answers but refuses
   reads.
2. Check the token. `VAULT_TOKEN_FILE` must exist and be readable by the `node`
   user in the container; the token is cached in-process, so a rotated token
   only surfaces on the next read after a restart.
3. Database pools take credentials from Vault at creation, so a failure here
   prevents **new** pools from opening while existing ones keep working — the
   symptom can appear long after the cause.

> `vault_reads_total` is deliberately not labelled with the secret path. The
> path would be unbounded cardinality and would publish the secret layout on an
> unauthenticated endpoint.

## Backup And Restore

### Taking a backup

```bash
npm run db:backup
```

Produces **two** files, and the second is the one people forget:

| File                  | Contains                                    |
| --------------------- | ------------------------------------------- |
| `<stamp>.dump`        | the database, custom format (`pg_dump -Fc`) |
| `<stamp>.globals.sql` | cluster roles and their passwords           |

> ⚠️ **A `pg_dump` on its own is not a restorable backup of this system.**
> Migration `002_least_privilege_roles.sql` creates `polycost_app` and
> `polycost_etl` as **cluster-level** roles, which `pg_dump` does not include.
> Restoring a database-only dump into a fresh cluster fails outright:
>
> ```
> pg_restore: error: could not execute query: ERROR:  role "polycost_app" does not exist
> Command was: GRANT USAGE ON SCHEMA public TO polycost_app;
> ```
>
> This is not hypothetical — it is the observed failure, reproduced by the drill
> below.

### Incident: Restore From Backup

1. **Stop writers first.** Scale the API to zero, or stop the worker. A restore
   racing live traffic produces a database that matches neither.
2. Restore the globals, then the database, in that order — the `GRANT`
   statements in the dump fail if the roles do not exist yet:
   ```bash
   psql -U polycost_owner -d postgres  -f <stamp>.globals.sql
   createdb -U polycost_owner polycost_dev
   pg_restore -U polycost_owner -d polycost_dev --no-owner <stamp>.dump
   ```
3. **Verify before restoring traffic**, rather than assuming:
   ```bash
   npm run db:fingerprint
   ```
   Compare against the fingerprint captured before the incident. Row counts
   alone are not enough — check the sequences too. A sequence restored behind
   its table causes primary-key collisions on the next insert, hours later,
   looking like an unrelated bug.
4. Restart the API and confirm `/health/deep` reports healthy.

### The drill

```bash
npm run db:restore-drill
```

Backs up the running database, restores it into a **brand-new empty cluster**,
and compares a fingerprint of both. The source database is only ever read.

The separate cluster is the entire point. Restoring into the existing one would
pass while proving nothing: the roles, extensions and target database are
already there, so the two most common real-world restore failures cannot occur.

What it compares, and why each one is there:

| Checked        | Why it is not enough to skip                                           |
| -------------- | ---------------------------------------------------------------------- |
| Row counts     | the obvious check, and the only one most drills do                     |
| Sequences      | restored behind the table means PK collisions later, looking unrelated |
| Constraints    | a missing FK or CHECK admits bad data from then on                     |
| Indexes        | everything works, only slowly, until something times out               |
| Roles + grants | `pg_dump` omits cluster roles entirely                                 |
| Content hashes | row counts can match while the rows are wrong                          |

Evidence lands in `docs/verification/restore-drill-report.json`.

**Last drill:** 38 tables, 20,603 rows, 118 indexes and 3 roles matched exactly.

> Run it after any schema migration that adds roles, grants or sequences, and
> before any production cutover. It takes about six seconds.

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
