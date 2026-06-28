# PolyCost - Master Prompt

This file is the project constitution for PolyCost. It does not change between MVP
and future versions. Only scope files change.

## 1. What this project is

PolyCost is an open-source, web-based multi-cloud cost estimation and comparison
platform.

A user describes a workload in plain English, via a structured form, or in later
versions via an uploaded draw.io diagram or Terraform script. PolyCost returns:

- Equivalent service mapping on AWS, Azure, and GCP
- Full cost breakdown per cloud: daily, weekly, monthly, quarterly, yearly
- Side-by-side comparison for vendor-neutral decisions
- Exportable reports: on-screen, PDF, CSV, Excel

If the workload only makes sense on one cloud, such as a requirement that names a
cloud-specific managed service, PolyCost still produces the closest equivalent
breakdown on the other two clouds, clearly labeled as an approximation.

PolyCost is cloud-agnostic from day one. AWS, Azure, and GCP are the first three
adapters, not hardcoded assumptions. Oracle Cloud, Alibaba Cloud, on-prem/OpenStack,
and others should be addable later without touching the core engine.

## 2. Why this project exists

Cloud cost estimation today is either:

- Locked inside a single vendor calculator.
- Locked behind paid FinOps tooling that is Terraform-only or paid/closed-source.
- Manual spreadsheet work that goes stale when cloud pricing changes.

PolyCost's wedge is free, open-source, requirements-first, three-way comparison from
day one. Terraform import/export comes later as an additional input/output mode, not
the only one.

## 3. Non-negotiable engineering principles

These apply to every line of code, every pull request, and every AI-assisted session.

1. Spec-driven development: no feature gets built without a written spec first. The
   spec is reviewed and agreed before implementation starts. If a requirement is
   ambiguous, stop and ask.
2. Test-driven development: tests are written before or alongside implementation.
   Every pricing calculation, adapter, and API contract has test coverage before it is
   done.
3. Phase-gated delivery: each phase has a hard quality gate. Do not start Phase N+1
   while Phase N has open defects against its own acceptance criteria.
4. No placeholders, stubs, or hidden "TODO: implement later" in anything presented as
   done. If something is genuinely out of scope, list it as deferred in the relevant
   scope doc.
5. Production-ready by default: error handling, input validation, and logging are part
   of the first implementation.
6. Cloud-neutral core, adapter-pattern providers: pricing, comparison, and report
   generation must never import provider-specific logic directly. Provider logic lives
   behind a common `CloudProviderAdapter` interface.
7. Open-source from day one: no proprietary dependencies that prevent publishing or
   self-hosting. Prefer permissive licenses such as MIT or Apache 2.0.
8. Documentation precedes code: every module gets a short design note in `/docs`
   before implementation, even if it is five sentences.
9. No hardcoded config or secrets, ever. Every value that differs between environments
   comes from centralized config validated at boot. Every credential comes from a
   secrets manager at runtime, never from committed files, real `.env` values, or
   inline strings in code. See `09-CONFIG-AND-SECRETS.md`.
10. Security is not a phase; it is a property of every phase. OWASP-aligned practices,
    input validation, output encoding, authn/authz checks, dependency scanning, and
    least-privilege DB roles are applied as code is written. See `11-SECURITY.md`.
11. Test coverage is measured, not assumed. Unit and integration coverage thresholds
    are enforced in CI. See `10-TESTING-STRATEGY.md`.

## 4. Tech stack baseline

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | NestJS (TypeScript) | Modular DI architecture maps directly onto the cloud-adapter pattern |
| Database | PostgreSQL | Relational integrity for pricing catalog and normalized schema |
| Queue/Jobs | BullMQ + Redis | Nightly pricing ETL jobs and async report generation |
| Frontend | React + shadcn/ui + Tailwind | Consistent internal-tool patterns |
| Auth (MVP) | Optional, stateless | MVP works anonymously; accounts are a fast-follow |
| Reports | PDF via Puppeteer/PDFKit, Excel via ExcelJS, CSV native | All three export formats are MVP-required |
| Infra | Docker Compose for local/self-host; Terraform for project infra | Self-hosters need `docker-compose up` day one |
| Config | NestJS `ConfigModule` plus `joi` or `zod` validation, layered defaults to env to secrets manager | Centralized, validated at boot, fails fast on bad config |
| Secrets | HashiCorp Vault, dev-server mode locally and full Vault in production | Self-hostable, OSS-aligned, identical local-to-prod workflow |
| Testing | Jest, Playwright, Supertest | Full pyramid coverage |
| Security scanning | `npm audit`/Snyk or OSV-Scanner in CI, OWASP Dependency-Check, `helmet` middleware | Baseline automated coverage |

This stack is the default. Do not deviate without writing a short ADR explaining why
and getting it reviewed.

## 5. The core abstraction

The Normalized Workload Specification (NWS) is a structured, versioned JSON schema
that represents what the user wants independent of how they expressed it.

- Natural language input parses into NWS.
- Form input constructs NWS directly.
- V2 draw.io diagrams parse into NWS.
- V3 Terraform plans parse into NWS.

Every pricing, comparison, and report function operates only on a valid NWS. If code
is tempted to special-case the original input source downstream, stop. That logic
belongs in the input-layer parser, not the comparison engine, adapters, or reports.

## 6. Context files

| File | Purpose |
| --- | --- |
| `00-MASTER-PROMPT.md` | This file. Read first, every session. |
| `01-VISION-AND-ROADMAP.md` | Full multi-version product vision |
| `02-MVP-SCOPE.md` | V1 scope and acceptance criteria |
| `03-ARCHITECTURE.md` | System design, adapter pattern, data flow |
| `04-DATA-MODEL.md` | Postgres schema and NWS schema |
| `05-API-CONTRACTS.md` | REST endpoint contracts and response shapes |
| `06-ROADMAP-V2-V3-V4.md` | Future-version specs, not active V1 scope |
| `07-UI-UX-DESIGN-SYSTEM.md` | Design tokens, components, accessibility, responsive rules |
| `08-AGENTIC-BUILD-MASTER-PROMPT.md` | Prompt to kick off autonomous AI-agent MVP development |
| `09-CONFIG-AND-SECRETS.md` | Centralized config architecture, secrets manager setup, env handling |
| `10-TESTING-STRATEGY.md` | Unit/integration/E2E approach, coverage thresholds, CI gates |
| `11-SECURITY.md` | OWASP-aligned practices, DB hardening, dependency scanning, threat model |
| `PROGRESS.md` | Living log of what has been built by phase |
| `HOW-TO-USE.md` | End-user-facing guide for the running app |
| `DEPLOY.md` | Self-host and production deployment instructions |

When starting a new coding session, read `00-MASTER-PROMPT.md`, `02-MVP-SCOPE.md`,
and whichever of `03-ARCHITECTURE.md`, `04-DATA-MODEL.md`, `05-API-CONTRACTS.md`,
`09-CONFIG-AND-SECRETS.md`, `10-TESTING-STRATEGY.md`, and `11-SECURITY.md` is relevant
to the task. Do not read `06-ROADMAP-V2-V3-V4.md` into active context unless
specifically scoping V2+ work.

## 7. Definition of done

A feature is done only when:

- Spec was written and reviewed before code.
- Tests exist and pass, including unit and integration tests where applicable, meeting
  the coverage floor defined in `10-TESTING-STRATEGY.md`.
- No placeholder or stub code remains.
- Error handling covers invalid and missing input.
- No config value or secret is hardcoded anywhere.
- Config comes from the centralized config module and secrets come from Vault, per
  `09-CONFIG-AND-SECRETS.md`.
- Relevant security checklist items from `11-SECURITY.md` are addressed.
- It works end-to-end via `docker-compose up` for a fresh self-hoster, using
  `.env.example` plus local Vault dev-server, never real secrets in a committed file.
- Docs in `/docs` reflect what was actually built.
- `PROGRESS.md` is updated to reflect the phase or feature as complete.
