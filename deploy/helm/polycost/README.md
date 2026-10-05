# PolyCost Helm chart

Deploys the PolyCost API. Postgres, Redis and Vault are **not** bundled — they
are stateful, and this chart should not own your data.

```bash
helm install polycost deploy/helm/polycost \
  --set config.dbHost=postgres.example \
  --set config.redisHost=redis.example \
  --set config.vaultAddr=https://vault.example
```

## Requirements for the backing services

> ⚠️ **Redis must have persistence enabled.** BullMQ keeps all job state in
> Redis — waiting, delayed, active and failed alike. With saving disabled, every
> restart silently discards scheduled work: the daily pricing refresh, budget
> alerts, share-link cleanup and retention enforcement. This project shipped
> that configuration and lost jobs to it; see K-13 in `docs/KNOWN-ISSUES.md`.
> Use AOF (`appendonly yes`, `appendfsync everysec`) and a durable volume.

> ⚠️ **The API will not start without Redis.** Queue construction happens during
> module initialisation, so an absent Redis means the process never binds its
> port — it is not a degraded start. Verified on a cluster: the pod restarts
> until Redis is reachable. Plan rollouts accordingly.

Postgres migrations are applied by the chart's **pre-install / pre-upgrade Job**
(`templates/migrations-job.yaml`, image from `database/Dockerfile`). It needs:

- `migrations.ownerSecret`: the database owner's username and password; schema
  changes need more than the app role.
- `migrations.rolePasswordsSecret`: only on a cluster where `polycost_app` and
  `polycost_etl` do not exist yet. They must match Vault's `polycost/db` secret.

The Job holds a Postgres advisory lock, checksums every applied file, and fails the
release, leaving the running pods untouched, if a migration fails or an applied
file was edited. Disable it with `migrations.enabled: false` only if migrations are
run another way. See [database/README.md](../../../database/README.md). A `pg_dump` alone is **not** a restorable
backup of this system — see the Backup And Restore section of the runbook.

## Backups

`backup.enabled: true` adds a nightly CronJob that runs `polycost-backup` from the
database tools image. It takes the roles plus `pg_dump -Fc`, writes a sha256
manifest, encrypts each file with age to `backup.ageRecipient` (a public key), and
uploads through rclone to `backup.destination`. Retention is `backup.retentionDays`.
It is the second line behind managed point-in-time recovery; see
[BACKUP-AND-DR.md](../../../docs/BACKUP-AND-DR.md). The nightly CI restore drill
restores exactly this format.

## Images and releases

Tagged releases publish this chart to `oci://ghcr.io/adeelarshad414/charts/polycost`
with `image.digest` and `migrations.image.digest` already pinned to the signed
images (see RELEASE-CHECKLIST.md):

```bash
helm install polycost oci://ghcr.io/adeelarshad414/charts/polycost --version X.Y.Z -f my-values.yaml
```

From a checkout, an empty `tag` means the chart's `appVersion`, and a `digest` wins
over a tag. `latest` is never used. Verify an image before deploying it
(DEPLOY.md, step 3).

## Probes

| Probe     | Path            | Why                                                                                                                                                                             |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| startup   | `/health/live`  | Boot runs a startup pricing refresh (migrations already ran in the Job); measured at 40–50s. Without it, liveness kills the pod mid-boot and the deployment never converges.    |
| liveness  | `/health/live`  | Deliberately **not** `/health/ready`. Restarting cannot fix a database that is briefly unavailable; pointing liveness at readiness turns a dependency blip into a restart loop. |
| readiness | `/health/ready` | Returns **503** when the database does not answer `SELECT 1` within 1s (probe timeout 2s), so Kubernetes withholds traffic. Redis down keeps the pod Ready but `degraded`.      |

The readiness endpoint used to answer `200` with `{"status":"degraded"}` in the
body. Kubernetes reads the status code and ignores the body, so a pod with an
unreachable database was marked Ready and served traffic. That was found by
deploying this chart and fixed alongside it.

Readiness follows the database only (audit M-09). Without Redis the API still
serves: rate limits fall back to in-process counters and queued jobs wait. Failing
readiness on a Redis blip removed **every** replica from the Service at once. The
database probe is a real `SELECT 1` with the app credentials through the app
pool, so wrong credentials or an exhausted pool fail it; the old TCP connect
passed both.

| Dependencies     | `/health/live` | `/health/ready`  | Pod Ready | Restarts |
| ---------------- | -------------- | ---------------- | --------- | -------- |
| Postgres down    | 200            | 503              | no        | 0        |
| Redis down       | 200            | 200 (`degraded`) | yes       | 0        |
| Redis + Postgres | 200            | 200              | yes       | 0        |

## Database, Redis and workers

- **Pools:** every pod opens four Postgres pools (`api`, `pricing_catalog`,
  `pricing_rates`, `diagram_import`), each capped at `config.db.poolMax`
  (default 5). Size the database for `4 × poolMax × replicas` connections.
  Every statement is bounded server-side by `config.db.statementTimeoutMs`
  (30s; the ETL pool gets `etlStatementTimeoutMs`, 300s), and each pool sets
  `application_name=polycost-<pool>` so `pg_stat_activity` names it.
- **TLS:** set `config.db.sslMode: verify-full` for managed Postgres, with
  `config.db.sslCaSecret` when the CA is not in the system store.
  `config.redis.tls` and `config.redis.passwordSecret` do the same for Redis;
  the password is read from a Secret, never the ConfigMap.
- **Workers:** BullMQ workers run in every API pod by default. Jobs retry with
  exponential backoff (ETL 2 attempts, cost-management 3) and failures are kept
  for the `JobQueueFailuresAccumulating` alert. Set `config.jobWorkersEnabled:
false` when a separate worker deployment processes the jobs.

## Deliberate settings

- **`terminationGracePeriodSeconds: 45`** — shutdown closes the HTTP server,
  drains BullMQ workers and flushes batched OpenTelemetry spans. Too short a
  grace period truncates all three, and the traces lost are the ones for
  requests in flight during a bad rollout.
- **No CPU limit.** CPU throttling surfaces as latency and would breach the p95
  objectives the load test enforces. Memory _is_ limited, so a leak kills the
  pod rather than the node.
- **`readOnlyRootFilesystem: true`** with a `/tmp` mount, because the AWS bulk
  price feed spools to a temp file instead of buffering ~480 MB in memory.
- **`maxUnavailable: 0`** — capacity is never reduced during a rollout.
- **NetworkPolicy.** `/metrics` is unauthenticated by design (scrapers carry no
  session token) and has no tenant data, but it does describe traffic volume, auth
  failure rates and ETL throughput. It shares the `http` port with the API, and a
  NetworkPolicy cannot filter by path, so the pod only accepts traffic from the
  ingress controller (`networkPolicy.ingressNamespaceSelector`), the monitoring
  namespace and `networkPolicy.extraIngressFrom`. **The ingress must deny
  `/metrics`**, or it is public through the load balancer. With ingress-nginx:

  ```yaml
  metadata:
    annotations:
      nginx.ingress.kubernetes.io/server-snippet: |
        location = /metrics { return 404; }
  ```

  (or route only `/api` and `/health` paths to the Service).

## Tracing

The image starts with `node --require ./otel-register.cjs`, which is a no-op
unless `config.otelExporterEndpoint` is set. Ordering matters: instrumentation
patches `pg`, `fastify` and `ioredis` as they load, so it cannot be an import.
