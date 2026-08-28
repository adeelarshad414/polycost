# 🧭 Learning Path — How to Use This Repo & Application

> A guided route through PolyCost. Pick the track that matches why you're here.
> Every step names the files to open, so you're never guessing where to look.

| Track                                                  | For                | Time     |
| ------------------------------------------------------ | ------------------ | -------- |
| [🏁 Track 0](#-track-0--get-it-running-30-min)         | Everyone           | 30 min   |
| [🧑‍💻 Track 1](#-track-1--use-the-application-1-hour)    | Users / evaluators | 1 hr     |
| [🗺️ Track 2](#️-track-2--understand-the-system-halfday) | New contributors   | ½ day    |
| [⚙️ Track 3](#️-track-3--backend-deep-dive-12-days)     | Backend devs       | 1–2 days |
| [🎨 Track 4](#-track-4--frontend-deep-dive-1-day)      | Frontend devs      | 1 day    |
| [🚢 Track 5](#-track-5--operate-it-halfday)            | SRE / ops          | ½ day    |
| [🤝 Track 6](#-track-6--make-your-first-change)        | First PR           | —        |

---

## 🏁 Track 0 · Get it running (30 min)

**Prerequisites:** Node ≥ 20, npm ≥ 10, Docker.

```bash
git clone https://github.com/adeelarshad414/polycost.git
cd polycost
npm install
docker compose up -d      # postgres, redis, vault, api, web
npm run db:migrate        # atomic, re-runnable
npm run hooks:install     # activate git hooks
```

Open **http://localhost:3000** · API on **:3001**.

✅ **Checkpoint** — you should be able to run a comparison and see three
providers priced. It works with **no cloud account**: the stack ships with
seed/mock pricing, and the UI clearly labels non-live data.

<details><summary>🛟 Troubleshooting</summary>

| Symptom              | Fix                                                         |
| -------------------- | ----------------------------------------------------------- |
| Port already in use  | Remap ports — see [DEPLOY.md](../DEPLOY.md)                 |
| Postgres won't start | `chmod +x docker/postgres/**/*.sh` (exec bit lost on clone) |
| Migrations pending   | `npm run db:migrate` then `npm run db:validate`             |
| Wrong Docker context | Pin it, e.g. `export DOCKER_CONTEXT=colima`                 |

</details>

---

## 🧑‍💻 Track 1 · Use the application (1 hour)

1. **Describe a workload** — the form is the fastest start. Try 4 vCPU / 16 GB +
   500 GB object storage + a managed Postgres.
2. **Compare** — read the per-provider breakdown, then switch the interval
   (daily → yearly) and the pricing model (on-demand → reserved).
3. **Interrogate a number.** Open the full breakdown and find a line item's
   **pricing trace** — source, SKU, unit price, and the derivation expression.
   _This is the feature that makes PolyCost defensible in a FinOps review._
4. **Check data health** — confirm whether you're seeing `live`, `seeded` or
   `mock` pricing. Never present demo numbers as real.
5. **Export** — a PDF/Excel/CSV report, or a **Terraform starter bundle**.
6. **Try the other input routes** — natural language, a Draw.io/VSDX diagram, or
   Terraform.

📄 Deeper walkthrough: [HOW-TO-USE.md](HOW-TO-USE.md)

---

## 🗺️ Track 2 · Understand the system (½ day)

Read in this order:

| #   | Document                           | Why                                      |
| --- | ---------------------------------- | ---------------------------------------- |
| 1   | [⚙️ How It Works](HOW-IT-WORKS.md) | The five-stage pipeline end to end       |
| 2   | [🗺️ Diagrams](DIAGRAMS.md)         | System, tiers, deployment, request flows |
| 3   | [📖 Glossary](GLOSSARY.md)         | NWS, SKU, SUD, WORM, outbox…             |
| 4   | [📋 Requirements](REQUIREMENTS.md) | What it must do, and how that's enforced |
| 5   | [🏛️ Architecture](ARCHITECTURE.md) | Implementation-level structure           |

### 🧠 The three ideas that explain most design decisions

1. **Provider APIs are never on the request path.** A scheduled ETL fills a local
   pricing catalog; comparisons read only from it. Fast, deterministic, and
   immune to provider outages.
2. **Every number carries its provenance.** A price without a trace is not
   trustworthy, so the trace is a first-class output.
3. **Irreversible actions are opt-in.** Retention and artifact deletion default
   to `report-only`; you must deliberately enable destruction.

---

## 🗂️ Directory structure

```text
polycost/
├── 📱 apps/
│   ├── api/                        # NestJS + Fastify backend
│   │   └── src/
│   │       ├── adapters/           # ☁️ AWS / Azure / GCP + shared http-client
│   │       ├── api/                # 🔌 controllers, repository, billing, auth
│   │       ├── comparison/         # ⚖️ comparison orchestration
│   │       ├── nws/                # 📄 Normalized Workload Spec + validator
│   │       ├── nws-parser/         # 🗣️ natural-language → NWS
│   │       ├── diagram-parser/     # 📐 Draw.io / VSDX → NWS
│   │       ├── pricing-etl/        # 🏭 scheduled catalog refresh
│   │       ├── pricing-models/     # 💲 on-demand, reserved, savings, SUD
│   │       ├── pricing-normalization/
│   │       ├── cost-management-jobs/ # ⏰ BullMQ jobs (alerts, retention…)
│   │       ├── reports/            # 📊 PDF / Excel / CSV
│   │       ├── terraform/          # 🏗️ Terraform bundle generation
│   │       ├── database/           # 💾 pricing catalog repository
│   │       ├── secrets/            # 🔐 Vault access
│   │       └── config/             # ⚙️ zod-validated env schema
│   └── web/                        # React 19 + Vite 8 SPA
│       └── src/
│           ├── App.tsx             # 🏠 app shell
│           ├── components/         # 🧩 UI incl. lazy-loaded Charts
│           ├── lib/                # 🧮 extracted pure modules ↓
│           │   ├── comparison-models.ts     # model builders
│           │   ├── optimization-signals.ts  # advisory signals
│           │   ├── workload-analysis.ts     # pure helpers
│           │   ├── app-catalogs.ts          # static lookup tables
│           │   ├── app-view-types.ts        # shared view types
│           │   └── format.ts                # money/percent formatting
│           └── styles/tokens.css   # 🎨 the ONLY place raw hex may live
├── 🗄️ database/migrations/          # numbered, idempotent SQL
├── 🐳 docker/                       # container assets
├── 📚 docs/                         # this documentation set
├── 📦 packages/                     # shared workspace packages
├── 🔧 scripts/                      # db.mjs, qa-check, guards, harnesses
├── 🧪 test/                         # golden files & fixtures
├── 🪝 .githooks/                    # pre-commit / pre-push
└── 📋 specs/                        # specification inputs
```

---

## ⚙️ Track 3 · Backend deep dive (1–2 days)

**Follow one request all the way down** — `POST /api/v1/comparisons`:

```text
comparisons.controller.ts
  └─ comparison-application.service.ts   # orchestration + persistence
       ├─ nws/nws-validator.ts           # validate & version-check
       ├─ comparison/…orchestrator       # per-provider pricing
       │    └─ adapters/{aws,azure,gcp}  # SKU resolution
       │         └─ database/pricing-catalog.repository.ts
       └─ api/api-database.repository.ts # saveComparisonWithAuditLog (atomic)
```

Then study these, in order — each encodes a lesson worth internalising:

| Area               | File                                             | The lesson                                                                  |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------- |
| 🌐 HTTP hardening  | `adapters/common/http-client.ts`                 | Enforce size caps **while streaming**; a header check misses chunked bodies |
| ☁️ Provider quirks | `adapters/azure/azure-provider.adapter.ts`       | Block meters (`"10 Hours"`) must be divided to per-unit                     |
| 🟢 Discounts       | `adapters/common/base-cloud-provider.adapter.ts` | GCP SUD applies whether or not you buy it                                   |
| 💾 Durability      | `api/api-database.repository.ts`                 | Event + outbox commit atomically, or compliance breaks                      |
| 🧾 Concurrency     | evidence write methods                           | Read-modify-write needs an optimistic guard (→ 409)                         |
| ⏰ Jobs            | `cost-management-jobs/`                          | Destructive jobs default to `report-only`                                   |

**Run the gates:**

```bash
npm run ci:lint        # lint + typecheck
npm run test:unit      # 541 API tests
npm run db:validate
```

---

## 🎨 Track 4 · Frontend deep dive (1 day)

Start in `apps/web/src/`:

1. `api-client.ts` — every endpoint; note the guarded JSON parse (a malformed
   `200` must not crash the app).
2. `App.tsx` — the shell. Large, but shrinking: **21,227 → 14,540 lines**.
3. `lib/*` — the extracted pure modules. **Start here** if you want to understand
   the domain logic without loading the whole shell; each is unit-tested
   directly.
4. `components/Charts.tsx` — lazy-loaded so recharts stays off the first-paint
   path (~105 kB gzip saved).
5. `styles/tokens.css` — the **only** file allowed raw hex; contrast is
   AA-guarded by a unit test.

```bash
cd apps/web
npx jest --config jest.config.cjs --randomize   # order-independence matters
npx vite build                                   # check bundle split
```

---

## 🚢 Track 5 · Operate it (½ day)

| Topic           | Document                                                              |
| --------------- | --------------------------------------------------------------------- |
| 🚀 Deployment   | [DEPLOY.md](../DEPLOY.md) · [DEPLOYMENT.md](DEPLOYMENT.md)            |
| 📕 Runbook      | [RUNBOOK.md](RUNBOOK.md)                                              |
| 🔑 Credentials  | [PROVIDER-CREDENTIALS.md](PROVIDER-CREDENTIALS.md)                    |
| 💳 Live pricing | [live-pricing-credentials.md](operations/live-pricing-credentials.md) |
| 🔐 Secrets      | [09-CONFIG-AND-SECRETS.md](../09-CONFIG-AND-SECRETS.md)               |
| ✅ Release gate | [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md)                       |

⚠️ **Two flags that delete data.** Both default to safe and require deliberate
opt-in — read [Known Issues](KNOWN-ISSUES.md) before enabling:
`DATA_RETENTION_ENFORCEMENT_MODE` · `INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE`

---

## 🤝 Track 6 · Make your first change

```bash
git checkout -b your-change
# …edit…
npm run ci:lint && npm run test:unit && npm run format:check
git commit -m "..."     # pre-commit runs format, lint, unit, qa
```

> 🐞 **Heads-up:** `pre-commit` currently **fails** on a pre-existing `qa`
> violation ([K-1](KNOWN-ISSUES.md)), and `pre-push` runs the full suite which
> needs Docker ([K-3](KNOWN-ISSUES.md)). Fixing K-1 is a well-scoped first
> contribution.

**House rules**

| Rule                                     | Why                                          |
| ---------------------------------------- | -------------------------------------------- |
| 🎨 Raw hex only in `tokens.css`          | Enforced by `theme:hex:check`                |
| ⚙️ No direct `process.env` in app source | Enforced by `qa` — use the config schema     |
| 🧪 Tests must be order-independent       | Verify with `--randomize`                    |
| 📊 Diagrams in Mermaid, not images       | Reviewable in a PR; can't drift silently     |
| 🔍 Run static gates, not just tests      | Lint/format/hex caught real bugs jest missed |

### 🌱 Good first issues

1. **Fix K-1** — move `PROVIDER_HTTP_*` into the config schema (unblocks `pre-commit`).
2. **Slim `pre-push`** (K-3) to fast static gates.
3. **H-F1 slice 4** — continue extracting pure functions from `App.tsx`.
4. **Refresh stale docs** — e.g. PROGRESS.md's npm-audit claim (K-2).

---

## 🎓 Concepts worth stealing

Patterns here that generalise beyond this codebase:

- **Cache the upstream, don't call it live.** Deterministic, fast, outage-proof.
- **Ship provenance with every derived number.** "Trust me" doesn't survive audit.
- **Make destruction opt-in.** Default to `report-only` and report what _would_
  happen.
- **Guard read-modify-write.** Optimistic hashing turns silent data loss into a
  409 the caller can retry.
- **Transactional outbox.** The only way an event and its delivery intent stay
  consistent.
- **Use an AST, not a regex, to move code.** Regex refactors mis-parse
  multi-line signatures and split overloads.

---

📚 Back to the [Documentation Index](../DOCUMENTATION.md)
