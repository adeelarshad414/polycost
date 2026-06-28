# Phase 6 - Comparison Engine

## Summary

Phase 6 adds the cloud-neutral comparison engine described in
`03-ARCHITECTURE.md`. The engine accepts a valid Normalized Workload Specification
(NWS), calls every registered `CloudProviderAdapter`, computes interval totals, and
returns the V1 `ComparisonResult` shape used by the future API and report modules.

## Components

- `ComparisonOrchestratorService` validates NWS input, fans out provider pricing
  calls, tolerates partial provider failures, and computes the cheapest provider by
  monthly total.
- `IntervalCostCalculator` is the only interval-math implementation. It derives
  daily, weekly, monthly, quarterly, and yearly values from the same monthly base
  cost and rounds to cents.
- `EquivalentServiceMapper` maps NWS workload tiers to reviewed provider SKU
  patterns and annotates approximate services.
- `ProviderAdaptersModule` centralizes construction of AWS, Azure, and GCP adapters
  so the comparison engine consumes only an injected `CloudProviderAdapter[]`.

## Equivalence Data

The reviewed V1 seed data exists in two places:

- Runtime/unit path: `apps/api/src/comparison/service-equivalence.seed.ts`
- Database path: `database/migrations/003_seed_service_equivalence_map.sql`

The seed covers V1 compute, storage, database, and network categories. Tiers with
material provider differences, such as archive object storage, shared file storage,
MongoDB-compatible services, generic NoSQL, CDN, and load balancing, are marked as
approximate.

## Degradation Behavior

Provider calls are independent. If one provider fails, comparison results still
return successful providers plus warnings. If every provider fails, the orchestrator
throws `ComparisonUnavailableError`.

## Boundary Rules

The comparison package does not import concrete provider adapters from
`/adapters/aws`, `/adapters/azure`, or `/adapters/gcp`. Concrete provider
construction stays in `ProviderAdaptersModule`, outside the comparison engine.

## Verification

- `npm run ci:lint`
- `npm run ci:unit`
- `npm run ci:build`
- `npm run ci:integration`
- `npm run ci:e2e`
- `npm run ci:security`
- `npm run security:scan`
- `npm run check`
- Source scan for direct concrete-adapter imports in `apps/api/src/comparison`
- Source scan for direct `process.env` usage in app source

Coverage after Phase 6:

- API overall: 97.71% statements, 90.45% branches, 95.37% functions, 98.33% lines.
- Comparison package: 99.26% statements, 100% branches, 100% functions, 99.21% lines.
- `IntervalCostCalculator`: 100% statements, branches, functions, and lines.

## Runtime Note

Fresh `docker compose up -d --build` was attempted after `docker compose down -v`.
The build completed, but Postgres failed during `initdb` with `No space left on
device` before migrations ran. Host disk had free space; Colima's Docker disk was
full at `/mnt/lima-colima` (100%, 21 MB available). The failed project stack was
cleaned up with `docker compose down -v`.
