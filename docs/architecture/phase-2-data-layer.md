# Phase 2 Data Layer

## Scope

Phase 2 adds the durable MVP data contract without starting provider adapters or
pricing logic:

- Versioned Postgres migrations for `pricing_catalog`, `service_equivalence_map`,
  `pricing_etl_runs`, and `comparisons`.
- Runtime database roles for app traffic and pricing ETL traffic.
- TypeScript NWS contract plus the single `NWSValidator` validation entry point.
- Canonical NWS fixtures for later parser, comparison, and E2E work.

## Local database bootstrap

`vault-seed` generates three local development database passwords in the Docker
volume shared only by Vault and Postgres:

- `owner_db_password` for the local bootstrap owner role.
- `app_db_password` for `polycost_app`.
- `etl_db_password` for `polycost_etl`.

The same values are seeded into Vault at `secret/polycost/db`. The repository stores
only generation and handoff logic, not literal database credentials.

Postgres starts with `polycost_owner` as the local bootstrap role, then runs
`docker/postgres/initdb.d/001-run-migrations.sh`. That runner applies the SQL files
under `database/migrations` during first database initialization.

## Least privilege

`polycost_app` is the runtime API role. It can read catalog/equivalence/ETL status
tables and insert comparison snapshots, but it cannot write pricing catalog rows.

`polycost_etl` is the future pricing refresh role. It can write pricing catalog and
ETL history rows, but it cannot write comparison snapshots.

Both runtime roles are login roles without superuser, createdb, or createrole
privileges.

## NWS validation

`apps/api/src/nws/nws.types.ts` defines the runtime schema and inferred TypeScript
types. `apps/api/src/nws/nws-validator.ts` is the only validation entry point.

The validator rejects unsupported schema versions with `NWSMigrationError`, so
future NWS changes fail explicitly instead of being silently coerced.
