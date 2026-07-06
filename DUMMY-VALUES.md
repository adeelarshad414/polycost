# Dummy Values And Mock Inventory

PolyCost is safe to clone and run without cloud credentials because local demo mode uses deterministic fixtures behind the same provider interfaces:

- `USE_MOCK_PROVIDERS=true`
- `PRICING_ETL_RUN_ON_BOOT=true`
- mock AWS/Azure/GCP catalog rows from `apps/api/src/adapters/mock/mock-pricing-fixtures.ts`
- local Vault seed values for database credentials in Docker volumes

The explicit placeholder token is `CHANGE_ME_DEV_ONLY`. Production and staging config validation rejects that value, plus `dummy`, `example`, and strings containing `change_me`.

## Allowed In Development

- `USE_MOCK_PROVIDERS=true`
- Missing GCP Cloud Billing token
- Missing diagram/NL LLM API key
- Mock mailer/invite preview flows
- Local-only Docker Vault seed credentials

## Not Allowed In Staging Or Production

- `CHANGE_ME_DEV_ONLY`
- `dummy`
- `example`
- Any real provider mode without `VAULT_TOKEN_FILE`
- Any strict provider credential check where Vault returns a dummy GCP access token or dummy LLM API key

## Production Swap Procedure

1. Keep `.env` free of provider secrets.
2. Store GCP and LLM credentials in Vault:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp access_token="<oauth-access-token>"
docker compose exec vault vault kv put secret/polycost/llm api_key="<llm-api-key>"
```

3. Set `USE_MOCK_PROVIDERS=false`.
4. Run `npm run provider:credentials:check:strict`.
5. Run a comparison and confirm each catalog-backed line item has source endpoint, source record ID, payload hash, transform version, and fetched timestamp.
