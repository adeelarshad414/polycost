# Phase 4 - Pricing ETL Job

Phase 4 wires the provider adapters from Phase 3 into a scheduled BullMQ refresh job.
The job refreshes provider pricing records for AWS, Azure, and GCP, persists the raw
catalog cache, derives PolyCost's normalized pricing cache, and records an independent
ETL outcome for each provider.

## Runtime Wiring

- `PricingEtlModule` is imported by `AppModule`.
- `PricingEtlScheduler` registers the repeatable BullMQ job named
  `refresh-pricing-catalog` on the `pricing-etl` queue.
- The repeat schedule is read from `PRICING_ETL_SCHEDULE_CRON` through
  `ConfigService`.
- BullMQ Redis connection settings come from `REDIS_HOST` and `REDIS_PORT`.
- The worker invokes `PricingEtlService.refreshAllProviders()`.

## Provider Flow

1. Each cloud adapter returns provider `PricingCatalogRecord[]`.
2. `PricingEtlService` persists the provider's records through
   `PricingCatalogWriter.upsertPricingRecords()`.
3. The same service derives comparable compute, storage, and egress cache rows through
   `NormalizedPricingWriter.upsertNormalizedPricingRecords()`.
4. The same service records each provider's outcome through
   `PricingEtlRunRepository.recordProviderRun()`.
5. Provider failures are isolated. One failed provider produces an overall `partial`
   summary if at least one other provider succeeds or partially succeeds.

## Persistence

`PostgresPricingCatalogRepository` implements catalog persistence, normalized cache
persistence, and ETL run logging:

- `find()` reads cached pricing rows with parameterized filters for provider,
  category, region, and service/SKU identifiers.
- `upsertPricingRecords()` writes provider catalog rows with row-level
  rejection accounting.
- `upsertNormalizedPricingRecords()` writes normalized rows into `provider_skus`,
  `pricing_snapshots`, `storage_pricing`, and `egress_tier_rates`. Unsupported records
  are reported as skipped instead of being treated as failed writes.
- `recordProviderRun()` inserts success, partial, or failed provider outcomes into
  `pricing_etl_runs`.

The repository obtains ETL database credentials from Vault through `SecretsReader` at
secret path `polycost/db` using keys `etl_username` and `etl_password`. No direct
`process.env` access is used in application source.

## Verification Notes

- Unit tests cover all-success, normalized writer rollup, partial provider failure,
  all-failed, row-level partial rejection, non-`Error` rejection, scheduler
  configuration, and repository SQL parameter binding.
- Normalization tests cover direct AWS/Azure compute rows, GCP component SKU synthesis,
  storage tier rows, egress tier rows, and local seed cache rows.
- Clean Docker startup verifies Nest module initialization against Vault, Postgres,
  Redis, and BullMQ.
- Redis inspection verifies the repeatable BullMQ job is registered with the configured
  cron pattern.
