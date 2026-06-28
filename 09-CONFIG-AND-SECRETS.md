# PolyCost - Configuration & Secrets Management

Companion to `00-MASTER-PROMPT.md` section 3.9. This is the binding architecture for
every config value and every secret in the system. Hardcoded credentials or
environment-specific values are never acceptable, even temporarily.

## 1. Config vs. secrets

Config and secrets are architecturally different and never share a delivery
mechanism.

| | Config | Secrets |
| --- | --- | --- |
| Examples | API base URLs, log level, rate-limit thresholds, feature flags, pricing ETL schedule, default region | DB password, Vault token, LLM API key, JWT signing key, cloud provider credentials |
| Sensitivity | Not sensitive; safe to log and safe to commit as defaults | Sensitive; never logged, committed, or visible in process listings |
| Source | Centralized config module, layered defaults to env vars | Secrets manager only, fetched at runtime |
| Can it live in `.env`? | Yes, for local dev convenience | No, never |

If a value would matter if it leaked in a public screenshot or issue, it is a secret.

## 2. Centralized config architecture

### 2.1 Single source of truth

All config is read through one NestJS Config Module using `@nestjs/config` plus a
`zod` or `joi` validation schema. Direct `process.env.X` access is not allowed outside
the config schema and secrets infrastructure.

```typescript
import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),

  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string(),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number().default(6379),

  PRICING_ETL_SCHEDULE_CRON: z.string().default('0 2 * * *'),
  PRICING_ETL_DEFAULT_REGION_AWS: z.string().default('us-east-1'),
  PRICING_ETL_DEFAULT_REGION_AZURE: z.string().default('eastus'),
  PRICING_ETL_DEFAULT_REGION_GCP: z.string().default('us-central1'),

  RATE_LIMIT_NL_PARSE_PER_MINUTE: z.coerce.number().default(10),
  RATE_LIMIT_LIVE_REFRESH_PER_MINUTE: z.coerce.number().default(5),

  VAULT_ADDR: z.string().url(),
  VAULT_NAMESPACE: z.string().optional(),

  FEATURE_LIVE_PRICING_REFRESH_ENABLED: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof configSchema>;
```

Validation failure must crash the app at boot. A service that starts with broken
config and fails later is worse than one that refuses to start.

### 2.2 Layering order

1. Schema defaults in `config.schema.ts`, for safe non-sensitive fallbacks only.
2. Environment variables injected by Docker Compose, CI, or the deployment platform.
3. No third config layer. Secrets are fetched separately through the Secrets Module
   and never merged into the config object.

### 2.3 Config source by environment

| Environment | Config source |
| --- | --- |
| Local dev | `docker-compose.yml` `environment:` block, referencing `.env` for non-sensitive values only |
| CI | CI platform env vars at workflow/job level |
| Staging/Production | Platform-native env injection such as ECS task env, Azure App Service config, GCP Cloud Run env vars, or Kubernetes ConfigMap |

### 2.4 `.env.example`

`.env.example` is the only `.env`-related file committed to the repo. It contains
only non-sensitive config with safe defaults or obvious placeholder values.

```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

DB_HOST=localhost
DB_PORT=5432
DB_NAME=polycost_dev

REDIS_HOST=localhost
REDIS_PORT=6379

VAULT_ADDR=http://localhost:8200

PRICING_ETL_SCHEDULE_CRON="0 2 * * *"
FEATURE_LIVE_PRICING_REFRESH_ENABLED=true
```

Secrets are not listed in `.env.example`. `.gitignore` must include `.env`,
`.env.local`, and `.env.*.local`, but the real protection is architectural: secrets do
not have an env-var code path.

## 3. Secrets architecture: HashiCorp Vault

### 3.1 Why Vault

Vault is the documented default because it is open-source, self-hostable, works in a
single Docker container for local development, and supports identity-based auth for
AWS, Azure, and GCP production deployments.

Vault dev-server mode gives local development the same retrieval workflow as
production without committing secrets to files.

### 3.2 Local development setup

Docker Compose includes:

- `vault`: `hashicorp/vault:latest` running dev-server mode.
- `vault-seed`: `hashicorp/vault:latest` job that seeds local-only dev secrets into
  Vault's KV store on container start.

Example Compose shape:

```yaml
services:
  vault:
    image: hashicorp/vault:latest
    cap_add:
      - IPC_LOCK
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: "dev-only-root-token"
      VAULT_DEV_LISTEN_ADDRESS: "0.0.0.0:8200"
    ports:
      - "8200:8200"

  vault-seed:
    image: hashicorp/vault:latest
    depends_on:
      - vault
    entrypoint: ["/bin/sh", "/vault-seed/seed.sh"]
    volumes:
      - ./vault-seed:/vault-seed
```

The committed `vault-seed/seed.sh` contains seeding logic only, not real secrets. It
may generate local dev secrets such as a random database password and can seed
replace-me local placeholders where the developer must enter their own key directly
into Vault after first boot.

The one manual local contributor step is to put their LLM key directly into the
running Vault dev-server:

```bash
vault kv put secret/polycost/llm api_key="<their own key>"
```

This is documented as an interactive step, not a file edit.

### 3.3 Application-side retrieval

`SecretsService` is completely separate from `ConfigModule`.

Rules:

- `SecretsService` is the only code path permitted to call Vault.
- It never logs a retrieved secret value.
- Secret cache values have a short TTL, such as five minutes.
- Cached secrets stay in memory only.
- Secrets are never written to disk, Redis, logs, or persistence.
- Services that need secrets inject `SecretsService` and call
  `getSecret(path, key)`.
- Services never read secret-shaped values from `process.env`.

Example API:

```typescript
async getSecret(path: string, key: string): Promise<string>
```

Typical calls:

- `getSecret('polycost/db', 'password')`
- `getSecret('polycost/llm', 'api_key')`

### 3.4 Auth method by environment

| Environment | Vault auth method |
| --- | --- |
| Local dev | Root token, dev-server mode only |
| CI | Vault AppRole with test-fixture read-only policy |
| Staging/Production on AWS | Vault AWS IAM auth backend |
| Staging/Production on Azure | Vault Azure auth backend |
| Staging/Production on GCP | Vault GCP auth backend |

No environment uses a long-lived static production Vault token. Production
authentication is identity-based, short-lived, and automatically rotated by the cloud
platform.

### 3.5 Secret rotation

- Database credentials: future-compatible with Vault's database secrets engine for
  short-lived PostgreSQL credentials.
- Third-party API keys: stored in Vault KV for MVP and rotated manually on provider
  schedules, with operational runbooks in `DEPLOY.md`.

## 4. Code review rejection rules

A PR is rejected if it contains:

- A literal connection string with embedded credentials.
- A literal API key, even if it looks fake or is described as a placeholder.
- `process.env.SOMETHING` access outside the Config Module schema and Secrets Service.
- A secret-shaped value in `.env.example`.

All other code receives config and secrets through dependency injection.

## 5. Testing implications

- Unit tests mock `ConfigService` and `SecretsService`.
- Unit tests never touch a real Vault instance.
- Integration tests run against the CI environment's Vault using AppRole auth and
  test-only secrets.
- Integration tests never use staging or production Vault.
- See `10-TESTING-STRATEGY.md` for test harness wiring.
