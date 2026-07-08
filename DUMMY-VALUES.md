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
- Mock SSO provider connection tests and local-only invite tokens
- Example SSO client identifiers or `CHANGE_ME_DEV_ONLY` values used only in
  development documentation
- `AUTH_SSO_STATE_SECRET=CHANGE_ME_DEV_ONLY_SSO_STATE_SECRET` for local mock OIDC
  callback signing
- `AUTH_INVITE_DELIVERY_MODE=panel` for local/demo token sharing in the workspace
  panel
- `AUTH_AUDIT_EXPORT_MODE=disabled` for local/demo audit trails that stay in the
  app database only
- `INVOICE_ARTIFACT_STORAGE_BACKEND=database-bytea` for local/demo invoice
  artifact byte storage in Postgres
- `INVOICE_ARTIFACT_MALWARE_SCANNER_MODE=eicar-signature-only` for local/demo
  scanner safety checks
- `INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE=report-only` for local/demo
  retention checks that do not delete bytes
- Local-only Docker Vault seed credentials

## Not Allowed In Staging Or Production

- `CHANGE_ME_DEV_ONLY`
- `dummy`
- `example`
- Dummy `AUTH_SSO_STATE_SECRET` values
- `AUTH_INVITE_DELIVERY_MODE=panel`
- Dummy `AUTH_INVITE_DELIVERY_WEBHOOK_SECRET` values
- `AUTH_AUDIT_EXPORT_MODE=disabled`
- Dummy `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET` values
- `INVOICE_ARTIFACT_STORAGE_BACKEND=database-bytea`
- Missing `INVOICE_ARTIFACT_OBJECT_STORE_NAME` or
  `INVOICE_ARTIFACT_OBJECT_STORE_REGION` when external artifact storage is enabled
- Missing `INVOICE_ARTIFACT_KMS_KEY_REFERENCE`
- `INVOICE_ARTIFACT_MALWARE_SCANNER_MODE=eicar-signature-only`
- Missing `INVOICE_ARTIFACT_MALWARE_SCANNER_URL` or non-dummy scanner secret when
  scanner webhook mode is enabled
- `INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE=report-only`
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
4. Set `AUTH_INVITE_DELIVERY_MODE=webhook`,
   `AUTH_INVITE_DELIVERY_WEBHOOK_URL`, and a non-dummy
   `AUTH_INVITE_DELIVERY_WEBHOOK_SECRET` before enabling staging or production
   workspace invites.
5. Set `AUTH_AUDIT_EXPORT_MODE=webhook`,
   `AUTH_AUDIT_EXPORT_WEBHOOK_URL`, and a non-dummy
   `AUTH_AUDIT_EXPORT_WEBHOOK_SECRET` before enabling staging or production
   team administration.
6. Set `INVOICE_ARTIFACT_STORAGE_BACKEND` to `aws-s3`, `azure-blob`, or
   `gcp-gcs`, configure `INVOICE_ARTIFACT_OBJECT_STORE_NAME`,
   `INVOICE_ARTIFACT_OBJECT_STORE_REGION`, and
   `INVOICE_ARTIFACT_KMS_KEY_REFERENCE`, switch
   `INVOICE_ARTIFACT_MALWARE_SCANNER_MODE=http-webhook` with a non-dummy scanner
   secret, and set `INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE=delete-expired`.
7. Run `npm run provider:credentials:check:strict`.
8. Run a comparison and confirm each catalog-backed line item has source endpoint,
   source record ID, payload hash, transform version, and fetched timestamp.

For SSO readiness, configure provider metadata through the workspace UI only after
setting `AUTH_PUBLIC_BASE_URL` to the externally reachable API origin. The development
"test connection" path validates OIDC/SAML issuer shape through the same API surface
without performing a real enterprise login handshake.

## Customer Handover Note

The handover docs intentionally keep `verified (mock)` distinct from production
credentials. A customer demo may use the local fixture-backed catalog, mock SSO, and
missing LLM/provider secrets, but production readiness requires the strict provider
credential check and replacement of every `CHANGE_ME_DEV_ONLY` value before staging
or production traffic.
