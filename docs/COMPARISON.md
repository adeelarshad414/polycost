# PolyCost Competitive Comparison

This document positions PolyCost honestly against common cloud-cost tools. It is not
sales copy; it is a reviewer aid for deciding where PolyCost is already strong and
where established products still lead.

External source review date: 2026-07-07. Official pages checked:

- Infracost: <https://www.infracost.io/docs/>
- Vantage: <https://www.vantage.sh/>
- CloudZero: <https://www.cloudzero.com/>
- IBM Cloudability: <https://www.ibm.com/products/cloudability>
- AWS Pricing Calculator: <https://calculator.aws/>
- Azure Pricing Calculator: <https://azure.microsoft.com/pricing/calculator/>
- Google Cloud Pricing Calculator: <https://cloud.google.com/products/calculator>

Source limitation: the local environment previously timed out when fetching some
vendor pages directly. The final comparison should be revalidated before public
marketing claims. Product conclusions below are intentionally conservative and
focus on broad category fit rather than exact SKU-by-SKU feature parity.

## Summary

PolyCost is strongest when the buyer wants an open-source, self-hostable,
cloud-neutral planning tool that converts requirements or diagrams into a
side-by-side AWS/Azure/GCP estimate with visible evidence and exportable reports.

PolyCost is not yet a replacement for invoice-grade FinOps platforms that ingest
actual billing data, amortize commitments, allocate spend across complex orgs, and
operate as hosted enterprise systems.

## Comparison Matrix

| Capability                          | PolyCost today                      | Infracost                       | Vantage                         | CloudZero                         | IBM Cloudability                  | Native calculators               |
| ----------------------------------- | ----------------------------------- | ------------------------------- | ------------------------------- | --------------------------------- | --------------------------------- | -------------------------------- |
| Open-source/self-hostable core      | Strong                              | Strong CLI plus hosted platform | Hosted SaaS                     | Hosted SaaS                       | Hosted enterprise SaaS            | Provider-hosted only             |
| AWS/Azure/GCP side-by-side planning | Core workflow                       | IaC-centered cost visibility    | Multi-cloud cost management     | Multi-cloud cost intelligence     | Enterprise cloud financial mgmt   | One provider at a time           |
| Natural-language requirements       | Built in                            | Not primary workflow            | Not primary workflow            | Not primary workflow              | Not primary workflow              | Not primary workflow             |
| Diagram-to-cost                     | Mermaid/draw.io/CSV/VSDX extraction | Not primary workflow            | Not primary workflow            | Not primary workflow              | Not primary workflow              | Manual entry                     |
| Terraform output                    | Starter bundle generation           | Mature IaC cost scanning/diff   | Terraform provider for platform | Not PolyCost-style IaC generation | Not PolyCost-style IaC generation | Not applicable                   |
| Pull-request cost diffs             | Future                              | Strong                          | Indirect/platform workflows     | Indirect/platform workflows       | Indirect/platform workflows       | Not applicable                   |
| Actual billing ingestion            | Foundation only                     | Not the core invoice platform   | Strong                          | Strong                            | Strong                            | Provider account specific        |
| Unit economics/business allocation  | Basic export/reporting              | Policy/tagging centered         | Strong                          | Strong                            | Strong enterprise allocation      | Limited/manual                   |
| Commitment optimization             | Modeled/recommendation path         | Policies/guardrails             | Strong                          | Strong                            | Strong                            | Provider-specific calculators    |
| Evidence from estimate to SKU       | Strong for catalog-backed rows      | Strong for IaC resources        | SaaS data model                 | SaaS data model                   | SaaS data model                   | Provider-specific but fragmented |
| Customer handover/demo              | One-command OSS demo                | CLI/platform setup              | Hosted onboarding               | Hosted onboarding                 | Enterprise implementation         | Manual calculator sessions       |

## Where PolyCost Wins

- Open-source and self-hostable from the first demo.
- Neutral AWS/Azure/GCP comparison from one workload model.
- Requirements-first workflow for pre-build architecture decisions.
- Diagram ingestion that feeds the same cost engine.
- Exportable PDF/CSV/Excel reports without a hosted SaaS dependency.
- Transparent evidence path for catalog-backed estimates.
- Terraform starter bundles connected to the comparison output.

## Where PolyCost Matches Enough For MVP

- Decision-grade estimates, warnings, and exportable reports.
- Budget/alert and share-link workflows.
- Region-aware provider mapping.
- Live catalog traceability where adapters support source rows.
- Workspace/session/RBAC foundations for self-hosted pilots.

## Where PolyCost Trails Established Tools

- Full invoice-grade billing and actual spend ingestion.
- Private pricing, enterprise agreements, marketplace charges, credits, taxes,
  support contracts, and amortized commitment inventory.
- Deep Kubernetes allocation and continuous production cost optimization.
- Mature pull-request cost diff workflows.
- Enterprise SSO/SCIM, org hierarchy, chargeback/showback, and hosted onboarding.
- Native calculator depth for edge-case services inside a single provider.

## Recommended Positioning

Use PolyCost as:

- a presales and architecture planning accelerator
- a self-hosted OSS comparison engine
- a neutral estimate/report generator for AWS/Azure/GCP decisions
- a bridge from requirements/diagrams to reviewable Terraform starter bundles

Do not position PolyCost today as:

- a Cloudability/Vantage/CloudZero replacement for actual-spend operations
- an invoice reconciliation system of record
- a full Terraform landing-zone generator
- a provider calculator that covers every SKU nuance to the cent

## Next Competitive Priorities

1. Provider-authenticated catalog breadth and deeper SKU traceability.
2. IaC diff and pull-request comment workflow.
3. Actual billing ingestion with allocation, amortization, and reconciliation
   controls.
4. Enterprise auth/team UX with production SSO and SCIM.
5. Kubernetes and commitment optimization depth.
