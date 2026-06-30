# Phase 8 API Layer

Phase 8 wires the V1 REST API contracts into the Nest/Fastify runtime under
`/api/v1`. The module is intentionally thin: controllers validate request shape,
apply rate limits, call the existing parser/comparison/report services, and use a
single exception filter for the documented error envelope.

## Runtime Wiring

`ApiModule` imports the parser, comparison, provider-adapter, and report modules. It
provides:

- `WorkloadController` for `POST /workload/parse` and `POST /workload/validate`.
- `ComparisonsController` for comparison creation, lookup, export, and refresh.
- `PricingStatusController` for the admin-only pricing ETL status endpoint.
- `ApiExceptionFilter` as a global filter for V1 response envelopes.
- `ApiRateLimitService` for per-IP in-memory minute buckets.
- `ApiDatabaseRepository` for comparison snapshots and pricing status reads.
- `LivePricingRefreshService` for rate-limited SKU-scoped provider refreshes of
  existing comparison snapshots.

The API repository uses the runtime application database role from Vault
(`secret/polycost/db:username` and `secret/polycost/db:password`) and only writes
comparison snapshots. Pricing catalog writes remain owned by the ETL repository.

## Implemented Endpoints

- `POST /api/v1/workload/parse`
- `POST /api/v1/workload/validate`
- `POST /api/v1/comparisons`
- `GET /api/v1/comparisons/:id`
- `GET /api/v1/comparisons/:id/export?format=pdf|csv|xlsx`
- `POST /api/v1/comparisons/:id/refresh-live`
- `GET /api/v1/pricing/status`

Exports reuse the Phase 7 report service and return binary downloads with
`Content-Type` and `Content-Disposition` headers.

## Security And Limits

The parse and live-refresh routes use configured per-minute limits. Successful
responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset`. Exhausted buckets return the shared error envelope with HTTP
`429` and `Retry-After`.

`GET /api/v1/pricing/status` is protected by the Vault-backed
`x-admin-api-key` header. The comparison APIs use parameterized SQL and store
immutable JSON snapshots so report exports are reproducible.

## Known Runtime Behavior

Fresh local Compose stacks seed a small baseline pricing catalog through
`004_seed_local_pricing_catalog.sql` so anonymous first-run comparisons work before
provider ETL credentials are configured. Seed rows are marked with
`attributes.source = local_seed`; repository reads sort real ETL rows ahead of these
baseline rows when both exist.

Initial comparisons use the cached catalog. Requests with `useLivePricing: true`
still return `LIVE_REFRESH_UNAVAILABLE`; users must first create a cache-backed
comparison snapshot.

`POST /api/v1/comparisons/:id/refresh-live` is the explicit request-time provider
exception. It reads provider SKU traceability from the stored comparison snapshot,
groups those SKU references by provider, category, and region, refreshes those
groups through `refreshLivePricing()`, writes raw and normalized pricing rows to the
cache, and then creates a new comparison snapshot from the stored NWS. Provider live
refresh failures are returned as `live_refresh_failed` warnings while the refreshed
comparison still uses the best available cached data. Older snapshots without SKU
traceability return `LIVE_REFRESH_UNAVAILABLE` instead of broad-refreshing catalogs.
