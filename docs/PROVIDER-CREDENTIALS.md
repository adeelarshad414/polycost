# Provider Credentials And Live Pricing Setup

PolyCost can run two pricing modes:

- `USE_MOCK_PROVIDERS=true`: deterministic fixture-backed AWS, Azure, and GCP catalog rows for local demos and CI.
- `USE_MOCK_PROVIDERS=false`: provider adapters fetch public catalog list prices and persist traced catalog/cache rows.

Real provider mode is still catalog list-price mode. It is not invoice-grade billing: it does not include private discounts, enterprise agreements, credits, tax, support contracts, committed-use inventory already owned by the customer, or actual billed usage.

## Startup Guardrails

Production and staging config validation rejects `CHANGE_ME_DEV_ONLY`, `dummy`, and `example` placeholder values. Real provider mode outside development also requires `VAULT_TOKEN_FILE`, because provider/LLM secrets are read from Vault rather than `.env`.

Run these checks before a production rehearsal:

```bash
npm run provider:credentials:check
npm run provider:credentials:check:strict
npm run invoice:artifact-profile:check
```

`provider:credentials:check:strict` proves the target environment can read live
Vault/provider credentials. `invoice:artifact-profile:check` is intentionally
different: it validates a sanitized production profile and captured provider proof
artifact without reading secrets or calling cloud APIs. Treat it as
`verified(config-evidence)`, not live-cloud evidence.

## Credential Matrix

| Integration               | Required when `USE_MOCK_PROVIDERS=false` | Runtime configuration                                                                               | Secret location                 | Current production expectation                                                                       |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AWS public catalog        | No                                       | Outbound HTTPS to `pricing.us-east-1.amazonaws.com`                                                 | None read by current adapter    | Public Price List bulk files only; no AWS access keys should be stored for the current adapter.      |
| Azure public catalog      | No                                       | Outbound HTTPS to `prices.azure.com`                                                                | None read by current adapter    | Public Retail Prices API only; no Entra app registration scope or client secret is required.         |
| GCP public catalog        | Yes                                      | `VAULT_ADDR`, `VAULT_TOKEN_FILE`, optional `VAULT_NAMESPACE`                                        | `secret/polycost/providers/gcp` | Store either `access_token` or `service_account_json`; dummy values are rejected outside local mode. |
| Invoice artifact storage  | Yes, when external storage is enabled    | `INVOICE_ARTIFACT_STORAGE_BACKEND`, object store name/region/prefix, KMS, scanner, retention modes  | See artifact storage section    | Store least-privilege object-store credentials in Vault; strict checks reject missing/dummy secrets. |
| Diagram/NL LLM classifier | Only when endpoint/model are configured  | `DIAGRAM_LLM_CLASSIFIER_ENDPOINT`, `DIAGRAM_LLM_CLASSIFIER_MODEL`, `VAULT_ADDR`, `VAULT_TOKEN_FILE` | `secret/polycost/llm`           | Store `api_key`; parser falls back to deterministic classification if endpoint/model are absent.     |

The API/web `.env` surface stays intentionally small:

```bash
USE_MOCK_PROVIDERS=false
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
VAULT_ADDR=http://vault:8200
VAULT_TOKEN_FILE=/run/polycost-vault-auth/token
# VAULT_NAMESPACE=admin/polycost
```

Do not put provider access tokens, service account JSON, OIDC client secrets, or LLM
API keys directly in `.env`. Artifact object-store keys and SAS tokens also stay
out of `.env`. Put secrets in Vault and let the startup credential check prove the
runtime can read them.

## AWS Price List

Current adapter:

- Source: AWS Price List bulk offer files.
- Endpoint pattern: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<ServiceCode>/current/index.json`.
- Credentials: none required for the current public bulk-file adapter.
- Env vars read today: none.
- Vault paths read today: none.
- Exact scope today: unauthenticated public catalog read over outbound HTTPS.

If you later switch the adapter to the signed AWS Price List Query/Bulk APIs, create an IAM role with this least-privilege read policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "pricing:DescribeServices",
        "pricing:GetAttributeValues",
        "pricing:GetProducts",
        "pricing:GetPriceListFileUrl",
        "pricing:ListPriceLists"
      ],
      "Resource": "*"
    }
  ]
}
```

Reference: AWS documents these Price List actions in the "Find products and prices" billing policy example and lists Price List Query/Bulk endpoints in the AWS Price List guide.

## Azure Retail Prices

Current adapter:

- Source: Azure Retail Prices API.
- Endpoint: `https://prices.azure.com/api/retail/prices`.
- Credentials: none; Microsoft documents the API as unauthenticated for retail rates.
- Filters used by PolyCost: `serviceFamily`, `priceType`, `armRegionName`, and USD currency.
- Env vars read today: none.
- Vault paths read today: none.
- Exact app registration scope today: none. Do not create or store an Entra client
  secret for the current adapter.

Optional app registration:

1. Create an Entra ID app only if your deployment egress policy requires all outbound calls to be associated with a service principal.
2. No Azure Retail Prices API permission is needed by the current adapter.
3. Store any future client secret in Vault, not `.env`.

## GCP Cloud Billing Catalog

Current adapter:

- Source: Cloud Billing Catalog API.
- Endpoint pattern: `https://cloudbilling.googleapis.com/v1/services` and `https://cloudbilling.googleapis.com/v1/{serviceName}/skus`.
- Credentials: required when `USE_MOCK_PROVIDERS=false`.
- OAuth scope: `https://www.googleapis.com/auth/cloud-billing.readonly` is sufficient for catalog reads; `cloud-billing` or `cloud-platform` also work.
- Env vars read today: `USE_MOCK_PROVIDERS`, `VAULT_ADDR`, `VAULT_TOKEN_FILE`,
  and optional `VAULT_NAMESPACE`.
- Vault path read today: `secret/polycost/providers/gcp`.
- Accepted Vault keys:
  - `access_token`: a short-lived OAuth token generated by your approved workload identity flow.
  - `service_account_json`: a service account key JSON fallback that PolyCost exchanges for a short-lived Cloud Billing token at runtime.
  - `service_account_key_json`: legacy alias for `service_account_json`.

Recommended service account setup:

1. Enable the Cloud Billing API in the GCP project used for PolyCost operations.
2. Create a service account named `polycost-pricing-reader`.
3. Grant the minimum Cloud Billing read role available in your organization, typically `roles/billing.viewer` on the billing account or a custom role allowing catalog/list access.
4. Prefer generating a short-lived OAuth access token through your approved workload identity flow.
5. Store the token in Vault:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp access_token="<oauth-access-token>"
```

If your self-hosted deployment cannot mint access tokens externally yet, store service account JSON in Vault and let PolyCost exchange it at runtime:

```bash
docker compose exec vault vault kv put secret/polycost/providers/gcp service_account_json=@/secure/path/polycost-pricing-reader.json
```

Treat service account JSON as a sensitive fallback. Rotate it, scope it to Cloud Billing catalog reads only, and prefer workload identity or externally minted short-lived tokens for production.

Validation command after credential storage:

```bash
USE_MOCK_PROVIDERS=false npm run provider:credentials:check:strict
```

The strict check fails if Vault is missing, the token file is unreadable, the GCP
secret path is absent, or the stored token/JSON is still a dummy placeholder.

## Invoice Artifact Object Storage

Local/demo mode keeps invoice artifact bytes in Postgres with governance metadata.
Staging and production must use provider-native object storage and a customer-managed
key reference:

```bash
INVOICE_ARTIFACT_STORAGE_BACKEND=aws-s3 # or azure-blob / gcp-gcs
INVOICE_ARTIFACT_OBJECT_STORE_NAME=polycost-invoice-artifacts
INVOICE_ARTIFACT_OBJECT_STORE_REGION=us-east-1
INVOICE_ARTIFACT_OBJECT_STORE_PREFIX=invoice-artifacts
INVOICE_ARTIFACT_KMS_KEY_REFERENCE="<provider-kms-key-or-key-uri>"
INVOICE_ARTIFACT_MALWARE_SCANNER_MODE=http-webhook
INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE=delete-expired
INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE=provider-control-plane
INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE="<durable-provider-proof-uri>"
INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256="<sha256-of-provider-proof-json>"
```

PolyCost writes immutable-ish object keys under the configured prefix using the team,
reconciliation, artifact id, checksum prefix, and sanitized file name. The database
stores only the object pointer, checksum, size, KMS/readiness metadata, scan result,
retention policy, provider retention proof manifest, and audit trail. Downloads
read the object back through the matching provider adapter and re-check the stored
SHA-256 before returning bytes. Retention enforcement deletes external provider
objects first, treating provider `404` as already deleted for retry safety, and
only then removes still-expired non-held database pointer rows.

### Provider Retention Proof Manifest

Every uploaded invoice artifact now carries a typed provider retention proof
manifest in its governance block. The manifest is intentionally conservative:

- `not-applicable` means local/database storage has no provider object-lock proof.
- `missing` means external storage exists but no retention proof mode/reference was
  configured.
- `declared` means local configuration declares retention posture, but PolyCost has
  not been given captured provider control-plane evidence.
- `provider-verified` requires `INVOICE_EVIDENCE_WORM_RETENTION_MODE=provider-object-lock`,
  `INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE=provider-control-plane`, a durable
  proof reference, and a SHA-256 digest of that proof artifact.

Use the provider CLI or governance system outside PolyCost to capture the control
plane proof, store that JSON in WORM/object-lock backed evidence storage, and point
PolyCost at the reference plus digest. To generate a provider-specific capture
runbook from the stored artifact URI, use:

```bash
npm run invoice:retention-proof:capture-plan -- aws-s3 \
  's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt?versionId=v1'

npm run invoice:retention-proof:capture-plan -- azure-blob \
  'azure-blob://account/container/invoice-artifacts/team/reconciliation/artifact.txt'

npm run invoice:retention-proof:capture-plan -- gcp-gcs \
  'gs://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt'
```

The planner does not execute provider CLIs or handle credentials. It emits the
capture commands, proof file path, verifier command, and runtime config template
that operators should run/archive in their controlled shell. The lower-level
commands it emits are equivalent to:

```bash
aws s3api get-object-retention --bucket polycost-invoice-artifacts --key invoice-artifacts/... > aws-object-retention.json
aws s3api get-object-legal-hold --bucket polycost-invoice-artifacts --key invoice-artifacts/... > aws-object-legal-hold.json

az storage blob immutability-policy show --account-name "<account>" --container-name "<container>" --name "invoice-artifacts/..." > azure-immutability-policy.json
az storage blob legal-hold show --account-name "<account>" --container-name "<container>" --name "invoice-artifacts/..." > azure-legal-hold.json

gcloud storage objects describe gs://polycost-invoice-artifacts/invoice-artifacts/... --format=json > gcp-object-retention.json
```

For environments where the operator shell already has provider CLIs installed and
authenticated, PolyCost also provides a local capture command that executes
read-only provider CLI calls without storing credentials:

```bash
npm run invoice:retention-proof:capture -- aws-s3 \
  's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt?versionId=v1'

npm run invoice:retention-proof:capture -- azure-blob \
  'azure-blob://account/container/invoice-artifacts/team/reconciliation/artifact.txt'

npm run invoice:retention-proof:capture -- gcp-gcs \
  'gs://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt'
```

Use `--dry-run --json` first to inspect the structured command plan without
executing cloud CLIs. The capture command uses argument-array execution with
`shell: false`, writes the proof JSON under the workspace `artifacts/` tree,
then runs the offline verifier unless `--skip-verify` is supplied. Object URIs
reject unsupported query parameters and fragments so signed URLs, SAS tokens, and
temporary credential material are not echoed into proof plans or artifacts.

Before copying the proof digest into runtime config, verify the captured JSON with
PolyCost's offline verifier:

```bash
npm run invoice:retention-proof:verify -- aws-s3 aws-object-retention.json \
  --reference=s3://polycost-invoice-artifacts/object-lock-proof.json

npm run invoice:retention-proof:verify -- azure-blob azure-immutability-policy.json \
  --reference=azure-blob://account/container/object-lock-proof.json

npm run invoice:retention-proof:verify -- gcp-gcs gcp-object-retention.json \
  --reference=gs://polycost-invoice-artifacts/object-lock-proof.json
```

The verifier prints the computed
`INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256` and recommended
`INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE=provider-control-plane` settings.
For repeatable release evidence, rerun it with `--expected-sha256=<digest>` after
archiving the proof artifact. The command validates captured evidence structure
and digest only; it does not call the provider API or prove legal sufficiency.

### Production Profile Check

For handover rehearsals, keep a sanitized artifact-governance profile next to the
operator evidence packet. The profile must contain runtime control values, Vault
secret references, durable evidence references, and a captured provider retention
proof digest. It must not contain raw webhook secrets, cloud access keys, SAS
tokens, service account JSON, or bearer tokens.

The repository includes an AWS S3 Object Lock example profile and proof artifact:

```bash
npm run invoice:artifact-profile:check

npm run invoice:artifact-profile:check -- \
  docs/operations/invoice-artifact-production-profile.example.json
```

The check verifies:

- external object storage, KMS, webhook scanner, delete-expired retention, signed
  evidence receipts, audit webhook export, and provider object-lock posture are
  represented in the profile
- secret material is represented only as Vault paths and key names
- the captured provider proof artifact exists, its SHA-256 digest matches the
  runtime config, and the offline proof verifier accepts the provider evidence
- scanner, notary, and audit-export canary receipts are represented as durable
  provider-backed archive references

This closes a reviewer-readiness gap but still does not prove live cloud access.
After replacing the example values with target-environment references, run
`npm run provider:credentials:check:strict` and the staging scanner/notary/audit
smokes from the deployed environment.

### Staging Rehearsal Harness

Use the rehearsal harness to package those checks into one operator workflow. Plan
mode is safe for local CI and documentation reviews because it validates the
profile and prints the exact live checklist without reading Vault or calling
external endpoints:

```bash
npm run invoice:artifact-rehearsal:plan
```

Live mode is for staging or production-like environments only. It overlays the
profile runtime config onto the current shell, then runs the profile check, strict
provider credential check, scanner webhook canary, invoice evidence notary canary,
and audit-export canary:

```bash
npm run invoice:artifact-rehearsal:live
```

Archive the JSON output from live mode together with receiver-side WORM/object-lock
retention evidence for the scanner, notary, and audit-export canary references.
If your local environment permits TCP listeners, `npm run
invoice:artifact-scanner:smoke:local` also proves the scanner webhook HMAC
contract. Sandboxes that block local TCP binding report a structured skipped
status unless `POLYCOST_INVOICE_ARTIFACT_SCANNER_LOCAL_SMOKE_STRICT=1` is set.

After verification, billing Owners/Admins can attach the provider-retention proof
to the exact stored invoice artifact without giving PolyCost provider credentials:

```bash
curl -X PATCH \
  "$POLYCOST_API_BASE_URL/api/v1/billing/reconciliations/$RECONCILIATION_ID/artifacts/$ARTIFACT_ID/blob/provider-retention-proof" \
  -H "Authorization: Bearer $POLYCOST_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "proofReference": "s3://polycost-invoice-artifacts/object-lock-proof.json",
    "proofDigestSha256": "copy_the_64_character_sha256_from_the_verifier",
    "checkedAt": "2026-07-09T00:00:00.000Z",
    "notes": "Captured by release operator from provider control plane"
  }'
```

`proofReference` must be a durable reference (`s3://`, `azure-blob://`, `gs://`,
or `https://`) with no query string or fragment. Do not paste signed URLs, SAS
tokens, bearer tokens, or temporary credentials into PolyCost evidence or audit
metadata.

After a successful attach, PolyCost persists the proof status, source, checked
timestamp, retention mode, durable reference, digest, and bounded caveats on the
matching `invoice_artifact_blobs` row. Artifact blob readback reconstructs
external object-store records from those columns, so reviewer downloads and
evidence packets no longer depend only on the reconciliation evidence JSON for
provider-retention proof status.

The evidence packet aggregates these manifests as
`providerRetentionProofMissingCount`, `providerRetentionProofDeclaredCount`, and
`providerRetentionProofVerifiedCount`. The `providerRetentionProofReady` production
gate is true only when every external object-store artifact has provider-verified
proof. This is still not invoice-grade billing by itself; it proves artifact
retention posture, not provider invoice correctness, private discounts, tax review,
or legal sufficiency.

### AWS S3

Vault path: `secret/polycost/artifacts/aws`

Required keys:

- `access_key_id`
- `secret_access_key`
- optional `session_token`

Minimum permission shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::polycost-invoice-artifacts/invoice-artifacts/*"
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "<artifact-kms-key-arn>"
    }
  ]
}
```

PolyCost signs S3 REST `PUT`/`GET` requests with SigV4 and sends KMS headers when
`INVOICE_ARTIFACT_KMS_KEY_REFERENCE` is configured.

### Azure Blob Storage

Vault path: `secret/polycost/artifacts/azure`

Required keys:

- `sas_token`
- `account_name`, unless `INVOICE_ARTIFACT_OBJECT_STORE_NAME` is formatted as
  `account/container`

The SAS token should be scoped to the artifact container with create/write/read/delete
permissions and an expiry/rotation process owned by the operator. PolyCost writes
Block Blob objects through the Blob REST API, deletes expired external objects during
retention enforcement, and records the returned ETag/version when Azure returns them.

### GCP Cloud Storage

Vault path: `secret/polycost/artifacts/gcp`

Required key:

- `access_token`

If this artifact-specific path is absent, PolyCost falls back to
`secret/polycost/providers/gcp access_token`. The token needs Cloud Storage object
create/read/delete permission for the configured bucket/prefix, plus the
operator-managed KMS permission for the referenced key when CMEK is enforced by
bucket policy.

Validation command:

```bash
INVOICE_ARTIFACT_STORAGE_BACKEND=aws-s3 \
INVOICE_ARTIFACT_OBJECT_STORE_NAME=polycost-invoice-artifacts \
INVOICE_ARTIFACT_OBJECT_STORE_REGION=us-east-1 \
INVOICE_ARTIFACT_KMS_KEY_REFERENCE="<kms-key>" \
INVOICE_ARTIFACT_MALWARE_SCANNER_MODE=http-webhook \
INVOICE_ARTIFACT_MALWARE_SCANNER_URL=https://scanner.example.com/polycost/artifacts \
INVOICE_ARTIFACT_MALWARE_SCANNER_SECRET="<scanner-secret>" \
INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE=delete-expired \
INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_MODE=provider-control-plane \
INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_REFERENCE="<durable-provider-proof-uri>" \
INVOICE_ARTIFACT_PROVIDER_RETENTION_PROOF_SHA256="<provider-proof-sha256>" \
INVOICE_EVIDENCE_RECEIPT_MODE=external-webhook \
INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE="<receipt-signing-key-ref>" \
INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET="<receipt-signing-secret>" \
INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL=https://worm.example.com/polycost/evidence-receipts \
INVOICE_EVIDENCE_WORM_RETENTION_MODE=external-worm-receiver \
npm run provider:credentials:check:strict
```

## Invoice Evidence Receipts And WORM Handoff

Evidence packets always include the stable-JSON SHA-256 packet integrity block. For
staging and production, PolyCost also requires a signed receipt posture:

```bash
INVOICE_EVIDENCE_RECEIPT_MODE=local-hmac # or external-webhook
INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE="<kms-or-secret-manager-key-ref>"
INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET="<runtime-secret-from-secret-manager>"
INVOICE_EVIDENCE_WORM_RETENTION_MODE=provider-object-lock # or external-worm-receiver
```

`external-webhook` additionally requires:

```bash
INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL=https://worm.example.com/polycost/evidence-receipts
```

The exported packet includes a receipt that signs the base evidence payload digest
with HMAC-SHA256 and records the signing key reference, WORM retention mode, and
notary webhook host/hash. In `external-webhook` mode, PolyCost sends a signed
`invoice_evidence_packet.exported` handoff request during evidence packet export.
The receiver gets the metadata-only packet, packet digest, base payload digest,
receipt mode/status, and actor/team identifiers. PolyCost records only sanitized
handoff evidence in the returned receipt: accepted/failed status, request digest,
subject digest, receiver HTTP status, receiver host, and URL hash. It never emits
the signing secret or receiver response body. Receiver-side immutable retention is
still external proof owned by the operator; retain the receiver's WORM/object-lock
acceptance record with the exported packet.

Before promoting a notary/WORM receiver, run the local contract smoke:

```bash
npm run invoice:evidence:notary:smoke:local
```

It starts a temporary localhost receiver, posts a signed
`invoice_evidence_packet.exported` canary, verifies the `x-polycost-signature-sha256`
header, and appends a JSONL proof artifact under
`artifacts/invoice-evidence-notary-smoke/`. This proves the PolyCost receiver
contract only; it is not immutable retention evidence.

For staging or production-like receivers, use a real HTTPS endpoint and non-dummy
signing secret:

```bash
INVOICE_EVIDENCE_NOTARY_WEBHOOK_URL=https://worm.example.com/polycost/evidence-receipts \
INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET="<runtime-secret-from-secret-manager>" \
INVOICE_EVIDENCE_RECEIPT_SIGNING_KEY_REFERENCE="<kms-or-secret-manager-key-ref>" \
npm run invoice:evidence:notary:smoke
```

Archive the printed run ID, reconciliation ID, packet digests, receiver-side
acceptance object, retention policy, and access-control evidence with the release
or customer handover packet.

PolyCost's optional reference receiver uses the same signing secret as the notary
handoff smoke and records append-only JSONL receipts:

```bash
INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET="<runtime-secret-from-secret-manager>"
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_HOST=0.0.0.0
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PORT=61780
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PATH=/polycost/evidence-receipts
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_ARTIFACT_DIR=/mnt/worm/notary-receipts
POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_RETENTION_MODE=operator-managed-worm
```

`npm run invoice:evidence:notary:receiver` refuses missing, dummy, `change_me`, or
`dev_only` signing secrets outside `--dev`. Mount the artifact directory on
operator-owned immutable storage and archive object-lock policy plus access logs
before marking receiver-side WORM evidence complete.

## Flip From Mock To Real Mode

1. Start dependencies:

```bash
docker compose up -d postgres redis vault vault-seed
```

2. Store the required GCP token in Vault.

3. Set:

```bash
USE_MOCK_PROVIDERS=false
PRICING_ETL_RUN_ON_BOOT=false
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
VAULT_ADDR=http://vault:8200
VAULT_TOKEN_FILE=/run/polycost-vault-auth/token
```

4. Validate:

```bash
npm run provider:credentials:check:strict
npm run db:migrate
npm run api:dev
```

5. Trigger a pricing sync through the existing ETL scheduler/admin path, then verify comparison output includes `pricingTrace.sourceEndpoint`, `pricingTrace.sourceRecordId`, `pricingTrace.sourcePayloadHash`, and fetched timestamps.

## Lineage Expectations

Every catalog-backed number should expose:

- provider and category
- source endpoint or fixture URI
- raw source record ID
- deterministic source record key
- source fetched timestamp
- transform version
- payload hash
- SKU/rate used
- derivation math based on the 730-hour month standard where hourly
- equivalence confidence

If any mainstream demo line item lacks this evidence, treat it as a release blocker for the demo workload.
