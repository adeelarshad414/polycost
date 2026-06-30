# Phase 3 Provider Adapters

## Scope

Phase 3 defines and implements the provider adapter boundary used by the future
comparison engine and pricing ETL job.

Implemented providers:

- AWS via public Price List offer files.
- Azure via the Retail Prices API.
- GCP via the Cloud Billing Catalog services/SKUs APIs.

Each adapter supports:

- `priceWorkload()` from cached normalized catalog records.
- `refreshPricingCatalog()` from provider pricing APIs.
- `refreshLivePricing()` for service/SKU-specific live refreshes, with optional
  category and region hints supplied by saved comparison traceability.

## Adapter contract

The shared contract lives in
`apps/api/src/adapters/common/cloud-provider-adapter.ts`. The refresh methods return
normalized `PricingCatalogRecord[]` so the Phase 4 ETL job can persist them without
embedding provider-specific response handling.

`priceWorkload()` remains provider-neutral: it accepts a validated NWS and prices it
from the normalized catalog reader injected into the adapter.

## Credentials

Provider credentials flow through `SecretsReader`/`SecretsService`, not environment
variables, when a provider API requires them:

- AWS public offer-file refresh does not require credentials in the current adapter.
- GCP requires `polycost/providers/gcp` key `access_token`.
- Azure Retail Prices does not require credentials.

Local Compose writes the dev Vault token to a separate project-scoped Docker volume,
mounted read-only into the API container as `VAULT_TOKEN_FILE`. The API does not
mount the local database password volume.

## Fixtures

Recorded, sanitized API response fixtures live under `test/fixtures/pricing`. Unit
tests use those fixtures for deterministic normalization coverage instead of calling
live provider APIs in CI.
