# 🗺️ PolyCost Architecture Diagrams

> Every diagram is authored in **Mermaid**, so it renders natively on GitHub and
> stays reviewable in a pull request — no binary image files to drift out of date.

| Jump to                                   |                                     |
| ----------------------------------------- | ----------------------------------- |
| [🏛️ System design](#-system-design)       | [🧱 Tiers](#-tiers-architecture)    |
| [🚢 Deployment](#-deployment)             | [🔄 Request flows](#-request-flows) |
| [🔑 Credentials flow](#-credentials-flow) | [🏭 Pipelines](#-pipelines)         |
| [🚦 State machines](#-state-machines)     | [🗄️ Data model](#-data-model-core)  |

---

## 🏛️ System design

The whole system in one view: how a workload description becomes a priced,
auditable three-cloud comparison.

```mermaid
graph TB
    subgraph client["🌐 Client"]
        UI["React SPA<br/><i>apps/web</i>"]
    end

    subgraph api["⚙️ API — NestJS + Fastify (apps/api)"]
        CTRL["REST controllers<br/><i>/api/v1/*</i>"]
        NWS["NWS validator<br/><i>normalised workload spec</i>"]
        ENGINE["Comparison engine"]
        ADAPT["Provider adapters"]
        REPORT["Report / Terraform<br/>generators"]
        JOBS["Background jobs<br/><i>BullMQ</i>"]
    end

    subgraph data["💾 State"]
        PG[("PostgreSQL 16<br/>pricing · comparisons · audit")]
        REDIS[("Redis 7<br/>queues")]
        VAULT{{"HashiCorp Vault<br/>secrets"}}
    end

    subgraph providers["☁️ Cloud provider pricing APIs"]
        AWS["AWS<br/>Price List"]
        AZ["Azure<br/>Retail Prices"]
        GCP["GCP<br/>Cloud Billing"]
    end

    UI -->|HTTPS JSON| CTRL
    CTRL --> NWS --> ENGINE
    ENGINE --> ADAPT
    ENGINE --> PG
    CTRL --> REPORT
    JOBS --> REDIS
    JOBS --> ADAPT
    ADAPT -->|read pricing| PG
    ADAPT -.->|scheduled refresh| AWS & AZ & GCP
    ADAPT --> VAULT
    CTRL --> VAULT

    classDef c fill:#e8f0fe,stroke:#4285f4,color:#111
    classDef a fill:#fff4e5,stroke:#f59e0b,color:#111
    classDef d fill:#e6f4ea,stroke:#34a853,color:#111
    classDef p fill:#fce8e6,stroke:#ea4335,color:#111
    class UI c
    class CTRL,NWS,ENGINE,ADAPT,REPORT,JOBS a
    class PG,REDIS,VAULT d
    class AWS,AZ,GCP p
```

**The key idea:** provider APIs are _never_ called on the request path. A
scheduled ETL refreshes a local pricing catalog; comparisons read only from that
catalog. That keeps responses fast and deterministic, and means an outage at a
provider cannot take down pricing.

---

## 🧱 Tiers architecture

```mermaid
graph LR
    subgraph t1["1️⃣ Presentation"]
        A["React 19 SPA<br/>Vite 8 · lazy-loaded charts"]
    end
    subgraph t2["2️⃣ Application"]
        B["NestJS controllers<br/>guards · validation · rate limits"]
    end
    subgraph t3["3️⃣ Domain"]
        C["Comparison engine · NWS<br/>pricing models · Terraform"]
    end
    subgraph t4["4️⃣ Integration"]
        D["Provider adapters<br/>hardened HTTP client"]
    end
    subgraph t5["5️⃣ Persistence"]
        E["PostgreSQL · Redis · Vault"]
    end

    A -->|"REST /api/v1"| B --> C --> D --> E
    C --> E

    classDef tier fill:#f8fafc,stroke:#64748b,color:#111
    class A,B,C,D,E tier
```

| Tier            | Responsibility                             | Must not                        |
| --------------- | ------------------------------------------ | ------------------------------- |
| 1️⃣ Presentation | Render, capture input, format money        | Contain pricing logic           |
| 2️⃣ Application  | AuthN/Z, validation, transport             | Contain provider specifics      |
| 3️⃣ Domain       | Pricing math, comparison, normalisation    | Know about HTTP or SQL dialects |
| 4️⃣ Integration  | Talk to provider APIs, normalise responses | Persist directly                |
| 5️⃣ Persistence  | Durable state, queues, secrets             | Contain business rules          |

---

## 🚢 Deployment

```mermaid
graph TB
    subgraph host["🖥️ Docker Compose (local / single host)"]
        subgraph net["polycost network"]
            W["web<br/>:3000"]
            A["api<br/>:3001"]
            P[("postgres:16-alpine<br/>:5432")]
            R[("redis:7-alpine<br/>:6379")]
            V{{"vault:1.18<br/>:8200"}}
            VS["vault-seed<br/><i>run-once</i>"]
        end
        VOL[("volumes<br/>postgres-data · dev-secrets · vault-auth")]
    end
    DEV["👩‍💻 Developer<br/>browser"] --> W --> A
    A --> P & R & V
    VS -->|seeds secrets| V
    P -.-> VOL
    V -.-> VOL

    classDef svc fill:#e8f0fe,stroke:#4285f4,color:#111
    classDef store fill:#e6f4ea,stroke:#34a853,color:#111
    class W,A,VS svc
    class P,R,V,VOL store
```

Bring the stack up and apply migrations:

```bash
docker compose up -d
npm run db:migrate
```

> ℹ️ Ports are remappable via environment variables — see [DEPLOY.md](../DEPLOY.md).
> `vault-seed` is a run-once container that provisions local development secrets;
> it exits after seeding.

---

## 🔄 Request flows

### A. Create a comparison (the primary path)

```mermaid
sequenceDiagram
    autonumber
    participant U as 🧑 User
    participant W as 🌐 Web SPA
    participant C as ⚙️ ComparisonsController
    participant V as ✅ NWS Validator
    participant E as 🧮 Comparison Engine
    participant D as 💾 Postgres

    U->>W: Describe workload
    W->>C: POST /api/v1/comparisons
    C->>V: validate(nws)
    alt ❌ invalid
        V-->>C: NWSValidationError
        C-->>W: 400 VALIDATION_ERROR
    else ✅ valid
        V-->>C: NormalizedWorkloadSpec
        C->>E: compare(nws)
        E->>D: read pricing catalog
        D-->>E: SKU rates
        E-->>C: result + per-line-item trace
        C->>D: save comparison + audit log
        Note over C,D: single transaction (DB-3)
        C-->>W: 201 ComparisonResult
        W-->>U: Cheapest provider + breakdown
    end
```

### B. Export an evidence packet (a mutation, deliberately `POST`)

```mermaid
sequenceDiagram
    autonumber
    participant U as 🧑 Billing admin
    participant W as 🌐 Web SPA
    participant B as ⚙️ BillingController
    participant N as 📮 Notary service
    participant D as 💾 Postgres

    U->>W: Click "Download evidence packet"
    W->>B: POST /reconciliations/:id/evidence-packet/export
    B->>D: load reconciliation
    B->>N: deliverPacket(...)
    N-->>B: delivery receipt
    B->>D: write audit event
    B-->>W: packet JSON
    W-->>U: File downloaded
```

> ⚠️ This was a `GET` until it was corrected. A `GET` that notarises and writes an
> audit event fires those side effects on every prefetch, cache revalidation and
> retry. Safe methods must stay safe.

---

## 🔑 Credentials flow

No provider secret is ever stored in the database or shipped to the browser.

```mermaid
sequenceDiagram
    autonumber
    participant S as 🌱 vault-seed
    participant V as 🔐 Vault
    participant A as ⚙️ API
    participant P as ☁️ Provider API

    S->>V: seed dev secrets (run once)
    Note over A,V: on startup
    A->>V: authenticate (token file)
    V-->>A: lease
    A->>V: read polycost/db, provider creds
    V-->>A: secret values (memory only)
    Note over A: never logged, never persisted
    A->>P: signed pricing request
    P-->>A: pricing payload
```

```mermaid
flowchart LR
    ENV["⚙️ Config schema<br/><i>zod-validated env</i>"] --> APP["API process"]
    VAULT["🔐 Vault<br/><i>secret values</i>"] --> APP
    APP -->|"❌ never"| LOG["📝 Logs"]
    APP -->|"❌ never"| DB[("💾 Database")]
    APP -->|"❌ never"| BROWSER["🌐 Browser"]

    classDef no fill:#fce8e6,stroke:#ea4335,color:#111
    class LOG,DB,BROWSER no
```

**Separation of duties:** non-secret configuration comes from a zod-validated env
schema; secret _values_ come only from Vault. See
[Provider Credentials](PROVIDER-CREDENTIALS.md) and
[Config & Secrets](../09-CONFIG-AND-SECRETS.md).

---

## 🏭 Pipelines

### Pricing ETL (scheduled)

```mermaid
flowchart LR
    CRON["⏰ Cron<br/><i>PRICING_ETL_SCHEDULE_CRON</i>"] --> FETCH
    FETCH["📥 Fetch provider feed<br/><i>streamed, size + time capped</i>"] --> NORM
    NORM["🧹 Normalise to catalog rows"] --> UPSERT
    UPSERT["💾 Batched upsert<br/><i>jsonb_to_recordset</i>"] --> PRUNE
    PRUNE["🧽 Prune stale live rows"] --> HEALTH
    HEALTH["🩺 Record run + data health"]

    classDef step fill:#e8f0fe,stroke:#4285f4,color:#111
    class FETCH,NORM,UPSERT,PRUNE,HEALTH step
```

Resilience properties built into this pipeline:

- 📏 **Size cap enforced while streaming** — a chunked response with no
  `Content-Length` cannot silently buffer past the limit.
- ⏱️ **Wall-clock deadline covers the body**, not just the headers.
- 🔁 **Bounded pagination** — hard page ceilings prevent an infinite loop.
- 🛡️ **Same-origin pagination guard** — a `NextPageLink` pointing off the pinned
  host is refused (SSRF).
- 📦 **Batched upserts** with a per-row fallback, so one malformed row rejects
  only itself.

### CI pipeline

```mermaid
flowchart LR
    PR["📥 Push / PR"] --> FMT["🎨 format:check"] --> LINT["🔍 lint + typecheck"]
    LINT --> UNIT["🧪 unit tests"] --> INT["🔗 integration"] --> BUILD["📦 build"]
    BUILD --> E2E["🌐 e2e"] --> SEC["🔐 security scan"] --> OK["✅ mergeable"]

    classDef pass fill:#e6f4ea,stroke:#34a853,color:#111
    class OK pass
```

### Local git hooks

```mermaid
flowchart TB
    C["git commit"] --> PC["🪝 pre-commit<br/>format · lint · unit · qa"]
    P["git push"] --> PP["🪝 pre-push<br/>check:full"]
    PC -->|fail| BLOCK["🛑 blocked"]
    PP -->|fail| BLOCK
```

Activate with `npm run hooks:install`.

> ⚠️ `pre-push` runs the **full** verification suite (integration + e2e +
> security), which needs Docker services running. See
> [Known Issues](KNOWN-ISSUES.md) for the practical caveat.

---

## 🚦 State machines

PolyCost has **no order/checkout domain**. The equivalent lifecycle machines are
listed below — all values are taken directly from database `CHECK` constraints,
so these diagrams match what the schema actually enforces.

### 📥 Billing import run

```mermaid
stateDiagram-v2
    [*] --> processing: import started
    processing --> completed: all rows parsed
    processing --> failed: parse/validation error
    completed --> [*]
    failed --> [*]
```

### ⚖️ Invoice reconciliation outcome

```mermaid
stateDiagram-v2
    [*] --> matched: variance within tolerance
    [*] --> variance_warning: variance above warn threshold
    [*] --> variance_critical: variance above critical threshold
    [*] --> unmatched: no comparison to match
    note right of variance_critical
        Drives the invoice-grade
        evidence workflow
    end note
```

> ℹ️ Mermaid state IDs cannot contain hyphens. The stored values are
> `matched`, `variance-warning`, `variance-critical`, `unmatched`.

### 📮 Audit export outbox

```mermaid
stateDiagram-v2
    [*] --> pending: audit event recorded
    pending --> processing: claimed by worker
    processing --> delivered: webhook 2xx
    processing --> failed: delivery error
    failed --> pending: retry
    delivered --> [*]
    note right of delivered
        Only delivered rows are
        eligible for retention
        pruning (DB-2)
    end note
```

> 🔒 **Safety invariant:** `team_audit_event_exports` cascades from
> `team_audit_events`. Retention therefore refuses to prune an audit event that
> still has a `pending`/`processing`/`failed` export — otherwise deleting the
> event would silently destroy an undelivered compliance export.

### 📊 Report export job & prewarm job

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> running: worker claims
    running --> completed: artifact ready
    running --> failed: generation error
    completed --> [*]
    failed --> [*]
```

### ✉️ Team invitation

```mermaid
stateDiagram-v2
    [*] --> pending: invite sent
    pending --> accepted: recipient joins
    pending --> revoked: admin revokes
    pending --> expired: TTL elapsed
    accepted --> [*]
    revoked --> [*]
    expired --> [*]
```

### 👤 Account · 🔄 sync · 🧾 artifact

```mermaid
stateDiagram-v2
    direction LR
    state "Account" as acc {
        [*] --> invited
        invited --> active
        active --> disabled
        disabled --> active
    }
    state "Pricing sync" as sync {
        [*] --> success
        [*] --> partial
        [*] --> failed
    }
```

Invoice artifacts additionally carry `malware_scan_status`
(`passed`/`failed`) and an optional `provider_retention_proof_status`
(`declared`/`provider-verified`).

---

## 🗄️ Data model (core)

```mermaid
erDiagram
    ACCOUNTS ||--o{ TEAMS : owns
    TEAMS ||--o{ TEAM_AUDIT_EVENTS : records
    TEAM_AUDIT_EVENTS ||--o| TEAM_AUDIT_EVENT_EXPORTS : "outbox (cascade)"
    COMPARISONS ||--o{ COMPARISON_AUDIT_LOGS : "rate evidence"
    BILLING_IMPORT_RUNS ||--o{ INVOICE_LINE_ITEMS : contains
    BILLING_IMPORT_RUNS ||--o{ INVOICE_RECONCILIATION_RESULTS : produces
    INVOICE_RECONCILIATION_RESULTS ||--o{ INVOICE_ARTIFACT_BLOBS : evidences
    PRICING_CATALOG }o--|| PROVIDER_SKUS : "normalised into"
    PROVIDER_SKUS ||--o{ PRICING_RATES : "priced by"
```

Full schema: [Data Model](../04-DATA-MODEL.md).

---

<sub>🗺️ All diagrams reflect the schema and code as of the current `main`.
Status values are sourced from live database `CHECK` constraints.</sub>
