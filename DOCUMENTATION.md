# 📚 PolyCost Documentation Index

> **Master table of contents for all 99 Markdown documents in this repository.**
> Start at [🚀 New here?](#-new-here-start-with-these-five) if this is your first visit.

PolyCost is an open-source **multi-cloud cost comparison engine**. You describe a
workload once; it prices that same workload against **AWS, Azure and GCP** using
live provider pricing, and shows you the cheapest option with an auditable trail
of exactly how every number was derived.

---

## 🚀 New here? Start with these five

| #   | Document                                  | What it gives you                          | Time        |
| --- | ----------------------------------------- | ------------------------------------------ | ----------- |
| 1   | [🧭 Learning Path](docs/LEARNING-PATH.md) | Guided route through the codebase, by role | 15 min read |
| 2   | [⚙️ How It Works](docs/HOW-IT-WORKS.md)   | End-to-end mechanics + request flows       | 20 min      |
| 3   | [🗺️ Diagrams](docs/DIAGRAMS.md)           | Every architecture / flow / state diagram  | Browse      |
| 4   | [📖 Glossary](docs/GLOSSARY.md)           | Domain vocabulary (NWS, SKU, WORM…)        | Reference   |
| 5   | [🏁 Quick Start](README.md#quick-start)   | Get it running locally                     | 10 min      |

---

## 🧭 Core documentation

| Document                                                            | Purpose                                             |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| [📘 README](README.md)                                              | Project overview, quick start, API surface          |
| [⚙️ How It Works](docs/HOW-IT-WORKS.md)                             | Pricing pipeline, request flows, credential flow    |
| [🗺️ Diagrams](docs/DIAGRAMS.md)                                     | System, tiers, deployment, sequence, state machines |
| [📋 Requirements](docs/REQUIREMENTS.md)                             | Functional + non-functional requirements            |
| [📖 Glossary](docs/GLOSSARY.md)                                     | Terms and acronyms                                  |
| [🧭 Learning Path](docs/LEARNING-PATH.md)                           | How to learn the repo, use it, and extend it        |
| [🐞 Known Issues & Defects](docs/KNOWN-ISSUES.md)                   | Real defect register — no deliberate defects        |
| [📓 How To Use](HOW-TO-USE.md) · [docs version](docs/HOW-TO-USE.md) | Using the running application                       |

## 🏗️ Architecture & design

| Document                                                | Purpose                              |
| ------------------------------------------------------- | ------------------------------------ |
| [🏛️ Architecture (spec)](03-ARCHITECTURE.md)            | Canonical architecture specification |
| [🏛️ Architecture (docs)](docs/ARCHITECTURE.md)          | Implementation-level architecture    |
| [📝 Architecture Notes](ARCHITECTURE_NOTES.md)          | Decisions and rationale              |
| [🗄️ Data Model](04-DATA-MODEL.md)                       | Tables, relationships, constraints   |
| [🔌 API Contracts](05-API-CONTRACTS.md)                 | Endpoint contracts                   |
| [🧩 Backend Spec](docs/BACKEND_SPEC.md)                 | Backend module responsibilities      |
| [🖥️ Frontend Integration](docs/FRONTEND_INTEGRATION.md) | Web ↔ API integration                |
| [⚖️ Comparison Engine](docs/COMPARISON.md)              | How providers are compared           |

## 🎯 Product & scope

| Document                                                             | Purpose                     |
| -------------------------------------------------------------------- | --------------------------- |
| [🌟 Vision & Roadmap](01-VISION-AND-ROADMAP.md)                      | Long-term direction         |
| [🎯 MVP Scope](02-MVP-SCOPE.md)                                      | What the MVP includes       |
| [🛣️ Roadmap v2–v4](06-ROADMAP-V2-V3-V4.md)                           | Future phases               |
| [📊 Progress Ledger](PROGRESS.md)                                    | Phase-by-phase build record |
| [✅ Full Progress Ledger](docs/verification/full-progress-ledger.md) | Verification ledger         |
| [📜 Changelog](CHANGELOG.md)                                         | Release history             |

## 🎨 Design system & UI

| Document                                                                        | Purpose                    |
| ------------------------------------------------------------------------------- | -------------------------- |
| [🎨 UI/UX Design System](07-UI-UX-DESIGN-SYSTEM.md)                             | Design system spec         |
| [🖌️ CPN Design System](docs/design/cpn-design-system.md)                        | Component/pattern library  |
| [🏷️ Brand](BRAND.md)                                                            | Brand guidelines           |
| [🎚️ Theme Inventory](THEME-INVENTORY.md)                                        | Theme tokens               |
| [🔘 Button Inventory](BUTTON-INVENTORY.md)                                      | Button variants            |
| [⏳ Loading Inventory](LOADING-INVENTORY.md) · [Audit](LOADING-AUDIT-REPORT.md) | Loading states             |
| [🪟 Overlay Inventory](OVERLAY-INVENTORY.md) · [Audit](OVERLAY-AUDIT-REPORT.md) | Dialogs, drawers, popovers |

## 🚢 Deploy & operate

| Document                                                                   | Purpose                           |
| -------------------------------------------------------------------------- | --------------------------------- |
| [🚀 Deploy](DEPLOY.md) · [docs version](docs/DEPLOYMENT.md)                | Deployment procedures             |
| [📕 Runbook](docs/RUNBOOK.md)                                              | Operational runbook               |
| [☁️ Cloud Readiness](docs/cloud/cloud-readiness.md)                        | Cloud posture                     |
| [🔑 Provider Credentials](docs/PROVIDER-CREDENTIALS.md)                    | Provider API credentials          |
| [💳 Live Pricing Credentials](docs/operations/live-pricing-credentials.md) | Enabling live pricing             |
| [🔐 Config & Secrets](09-CONFIG-AND-SECRETS.md)                            | Configuration and secret handling |
| [✅ Release Checklist](RELEASE-CHECKLIST.md)                               | Pre-release gate                  |
| [🏭 Production Readiness](PRODUCTION-READINESS-REPORT.md)                  | Readiness assessment              |

## 🔒 Security & governance

| Document                                                          | Purpose                     |
| ----------------------------------------------------------------- | --------------------------- |
| [🛡️ Security (spec)](11-SECURITY.md) · [Policy](SECURITY.md)      | Security model & disclosure |
| [🤫 Security Suppressions](docs/SECURITY-SUPPRESSIONS.md)         | Reviewed lint suppressions  |
| [🏛️ Governance](GOVERNANCE.md)                                    | Project governance          |
| [🤝 Code of Conduct](CODE_OF_CONDUCT.md)                          | Community standards         |
| [🏢 Enterprise IdP Onboarding](docs/ENTERPRISE-IDP-ONBOARDING.md) | SSO/SCIM onboarding         |

## 🧪 Quality & audits

| Document                                                | Purpose                        |
| ------------------------------------------------------- | ------------------------------ |
| [🧪 Testing Strategy](10-TESTING-STRATEGY.md)           | Test layers and gates          |
| [💰 Pricing Accuracy Audit](PRICING-ACCURACY-AUDIT.md)  | Provider-math accuracy audit   |
| [🔍 Full-stack & UX Audit](FULLSTACK-UX-AUDIT.md)       | Backend/DB/frontend/a11y audit |
| [🖱️ Browser Audit](docs/browser-audit/README.md)        | Automated browser audit        |
| [🎨 Theme Audit](docs/theme-audit/2026-07-07/README.md) | Theme compliance audit         |

## 👩‍💻 Contributing & development

| Document                                                                  | Purpose                       |
| ------------------------------------------------------------------------- | ----------------------------- |
| [🤝 Contributing](CONTRIBUTING.md)                                        | How to contribute             |
| [🛠️ Developer Setup](docs/development/developer-setup.md)                 | Local environment + git hooks |
| [⚙️ DevOps](docs/development/devops.md)                                   | CI/CD                         |
| [📐 Spec-Driven Development](docs/development/spec-driven-development.md) | Spec-first workflow           |
| [🌍 Open-Source Readiness](docs/development/open-source-readiness.md)     | OSS checklist                 |
| [🧯 Public Demo Hardening](docs/development/public-demo-hardening.md)     | Demo-safety measures          |
| [🆘 Support](SUPPORT.md)                                                  | Getting help                  |

## 🧾 Handover & records

| Document                                                                                      | Purpose                     |
| --------------------------------------------------------------------------------------------- | --------------------------- |
| [📋 Handover Census](HANDOVER-CENSUS.md) · [Excellence Report](HANDOVER-EXCELLENCE-REPORT.md) | Handover records            |
| [📒 Customer Handover Ledger](docs/CUSTOMER-HANDOVER-LEDGER.md)                               | Customer-facing ledger      |
| [🔄 State Sync](STATE-SYNC.md)                                                                | State synchronisation notes |
| [🎭 Dummy Values](DUMMY-VALUES.md)                                                            | Placeholder data inventory  |

## 🗂️ Decision records

[API contract alignment](docs/decisions/api-contract-alignment.md) ·
[Deploy notes](docs/decisions/deploy-implementation-notes.md) ·
[How-to-use notes](docs/decisions/how-to-use-implementation-notes.md) ·
[MVP open questions](docs/decisions/mvp-open-questions.md) ·
[Security notes](docs/decisions/security-implementation-notes.md) ·
[Spec intake gaps](docs/decisions/spec-intake-gaps.md) ·
[Testing notes](docs/decisions/testing-implementation-notes.md) ·
[UI notes](docs/decisions/ui-implementation-notes.md)

## 📐 Phase architecture records (26 documents)

Historical build records, one per phase. Useful for understanding _why_ a
subsystem looks the way it does.

<details>
<summary>Expand all 26 phase records</summary>

**Foundation** — [Phase 1 Repo Scaffold](docs/architecture/phase-1-repo-scaffold.md) ·
[Phase 2 Data Layer](docs/architecture/phase-2-data-layer.md) ·
[Phase 2.6 Production Gap Closure](docs/architecture/phase-2-6-production-gap-closure.md)

**Ingestion** — [Diagram Ingestion](docs/architecture/phase-2-diagram-ingestion.md) ·
[LLM Corpus Drift Monitoring](docs/architecture/phase-2-diagram-llm-corpus-drift-monitoring.md) ·
[LLM Corpus Evidence Capture](docs/architecture/phase-2-diagram-llm-corpus-evidence-capture.md) ·
[LLM Corpus Evidence](docs/architecture/phase-2-diagram-llm-corpus-evidence.md) ·
[LLM Drift Alert Evidence](docs/architecture/phase-2-diagram-llm-drift-alert-evidence.md) ·
[VSDX Visual Evidence](docs/architecture/phase-2-vsdx-visual-evidence.md)

**Enterprise & evidence** — [Enterprise IdP Pilot](docs/architecture/phase-2-enterprise-idp-pilot-evidence.md) ·
[Invoice-of-Record Pilot](docs/architecture/phase-2-invoice-of-record-pilot-evidence.md) ·
[Pricing Catalog Snapshot](docs/architecture/phase-2-pricing-catalog-snapshot-evidence.md)

**Core engine** — [Phase 3 Provider Adapters](docs/architecture/phase-3-provider-adapters.md) ·
[Phase 4 Pricing ETL](docs/architecture/phase-4-pricing-etl.md) ·
[Phase 5 NWS Parser](docs/architecture/phase-5-nws-parser.md) ·
[Phase 6 Comparison Engine](docs/architecture/phase-6-comparison-engine.md) ·
[Phase 7 Report Module](docs/architecture/phase-7-report-module.md) ·
[Phase 8 API Layer](docs/architecture/phase-8-api-layer.md) ·
[Phase 9 Frontend](docs/architecture/phase-9-frontend.md) ·
[Phase 10 Cost Intelligence](docs/architecture/phase-10-cost-intelligence.md)

**Terraform (v3)** — [Generation](docs/architecture/phase-v3-terraform-generation.md) ·
[Hardening](docs/architecture/phase-v3-1-terraform-hardening.md) ·
[Bundle Export](docs/architecture/phase-v3-3-terraform-bundle-export.md) ·
[Module Library](docs/architecture/phase-v3-4-terraform-module-library.md) ·
[Validation Evidence](docs/architecture/phase-v3-6-terraform-validation-evidence.md) ·
[Destination Evidence Capture](docs/architecture/phase-v3-7-terraform-destination-evidence-capture.md)

</details>

## 🤖 Agent / prompt specifications

[Master Prompt](00-MASTER-PROMPT.md) ·
[Agentic Build Prompt](08-AGENTIC-BUILD-MASTER-PROMPT.md) ·
[Production Readiness Orchestrator](docs/design/master-production-readiness-orchestrator-v2.md) ·
[Universal Theme Audit Orchestrator](docs/design/universal-theme-audit-orchestrator.md) ·
[Skill QA Checklist](docs/development/skill-qa-checklist.md) ·
[Demo Artifacts](docs/demo-artifacts/README.md)

---

<sub>📅 Index generated from a full sweep of the repository. 99 Markdown documents catalogued.</sub>
