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

Postgres needs the migrations applied and the cluster-level roles from
`002_least_privilege_roles.sql`. A `pg_dump` alone is **not** a restorable
backup of this system — see the Backup And Restore section of the runbook.

## Probes

| Probe     | Path            | Why                                                                                                                                                                             |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| startup   | `/health/live`  | Boot runs migrations and a pricing refresh; measured at 40–50s. Without it, liveness kills the pod mid-boot and the deployment never converges.                                 |
| liveness  | `/health/live`  | Deliberately **not** `/health/ready`. Restarting cannot fix a database that is briefly unavailable; pointing liveness at readiness turns a dependency blip into a restart loop. |
| readiness | `/health/ready` | Returns **503** when a dependency is unreachable, so Kubernetes withholds traffic.                                                                                              |

The readiness endpoint used to answer `200` with `{"status":"degraded"}` in the
body. Kubernetes reads the status code and ignores the body, so a pod with an
unreachable database was marked Ready and served traffic. That was found by
deploying this chart and fixed alongside it.

Observed on a real cluster, with the fix in place:

| Dependencies     | `/health/live` | `/health/ready` | Pod Ready | Restarts |
| ---------------- | -------------- | --------------- | --------- | -------- |
| Redis only       | 200            | 503             | no        | 0        |
| Redis + Postgres | 200            | 200             | yes       | 0        |

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
- **NetworkPolicy on `/metrics`.** It is unauthenticated by design (scrapers
  carry no session token) and has no tenant data, but it does describe traffic
  volume, auth failure rates and ETL throughput, so it is restricted to the
  monitoring namespace.

## Tracing

The image starts with `node --require ./otel-register.cjs`, which is a no-op
unless `config.otelExporterEndpoint` is set. Ordering matters: instrumentation
patches `pg`, `fastify` and `ioredis` as they load, so it cannot be an import.
