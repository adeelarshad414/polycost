# PolyCost User Guide

This guide is the customer-facing operating path for the running PolyCost app. It is
written for stakeholder demos, evaluator pilots, and self-hosted users who want a
clear route from workload idea to defensible AWS, Azure, and GCP comparison.

## 1. Start The Demo

From a clean checkout:

```bash
npm run demo:up
```

Open the web app shown by the command output. The default local URL is
`http://localhost:3000`.

Local demo mode uses deterministic fixture-backed pricing through the same provider
interfaces used by real adapters. Keep `USE_MOCK_PROVIDERS=true` for demos that
must work without cloud credentials.

## 2. Choose An Input Mode

PolyCost accepts one workload through three entry points. All three become the same
Normalized Workload Specification before pricing.

Natural-language mode:

- Use this when the user can describe the workload but does not know exact cloud
  SKUs yet.
- Review the parsed workload before comparing. Defaults and assumptions are visible
  for correction.
- If no production LLM endpoint is configured, the local deterministic parser stays
  available for common workload descriptions.

Guided-form mode:

- Use this for solution architects and engineers who already know capacity,
  region, database, storage, traffic, resiliency, and pricing model preferences.
- Prefer this mode during pricing reviews because every cost driver is explicit.

Diagram mode:

- Mermaid: paste `.mmd` source or flowchart text.
- diagrams.net/draw.io: export `.drawio` or XML source, not a screenshot.
- Lucidchart: export CSV shape data.
- Visio: export VSDX. PolyCost performs layout-aware extraction and emits an
  approximate SVG preview for positioned shapes; it does not perform pixel-perfect
  Visio rendering.

After a diagram upload, review classified services, unresolved nodes, assumptions,
and ignored decoration before running the comparison.

## 3. Read The Comparison

The comparison always presents AWS, Azure, and GCP side by side. Provider order is
neutral and does not change based on price.

Use the executive summary first:

- lowest monthly estimate and projected annualized difference
- provider risk notes and approximation caveats
- commitment-model break-even and cash-flow signals
- budget and alert posture

Then use the engineering evidence:

- service-by-service breakdown
- region mapping and provider-equivalent services
- SKU/source endpoint/source record evidence where catalog rows are available
- derivation math, confidence, modeled-row warnings, and data-freshness notices
- FinOps recommendations and workload-fit notes

When a line item is approximate, treat it as a planning estimate and validate final
numbers with the provider calculator or procurement price book.

## 4. Refresh Pricing Evidence

Use `Refresh live` only after a comparison exists. In demo mode this refreshes from
the local catalog. In real provider mode it refreshes catalog-backed rows where the
adapter can trace the source record.

The evidence path to inspect is:

- screen total
- provider line item
- evidence expansion
- source endpoint or fixture URI
- source record ID/key
- payload hash and transform version
- derivation math

`GET /api/v1/pricing/coverage` shows which provider/category combinations are
live-catalog backed versus modeled.

## 5. Export And Share

Use the export controls after reviewing the comparison:

- PDF for executive or customer-facing summaries
- CSV for spreadsheet analysis
- Excel for finance handoff
- share link for scoped read-only review

Exports use the current comparison result; they do not silently re-run pricing.
Refresh the comparison before export when data freshness matters.

## 6. Generate Terraform Starter Bundles

After a comparison, use the Infrastructure as Code panel:

1. Select AWS, Azure, or GCP.
2. Choose runtime, topology, availability, policy-pack, and module-scaffold options.
3. Review assumptions, unsupported resources, security notes, and static checks.
4. Download the ZIP bundle and evidence JSON.
5. Run the generated `scripts/validate-bundle.mjs` outside PolyCost with Terraform
   and the target provider credentials.

PolyCost generates reviewable starter bundles. It does not run `terraform plan` or
apply infrastructure inside the app.

## 7. Workspace Features

Anonymous users can run comparisons, upload diagrams, inspect evidence, export
reports, create share links, and generate Terraform bundles.

Accounts add:

- sessions and logout/revoke-other-sessions controls
- team settings and invitation flows
- Owner/Admin/Member RBAC checks
- mock OIDC/SAML readiness and provider metadata screens
- billing export reconciliation foundations

Production email delivery, enterprise SSO handshakes, SCIM, complete account/team
administration polish, and hosted billing plans remain future phases.

## 8. Demo Talk Track

For executives:

1. Use a simple workload template or short natural-language description.
2. Run compare.
3. Show monthly and yearly deltas.
4. Open the PDF export.
5. Emphasize that PolyCost is decision-grade, self-hostable, and cloud-neutral.

For engineers:

1. Open the structured workload fields.
2. Expand service breakdown and SKU evidence.
3. Show refresh-live behavior and pricing coverage status.
4. Upload a small diagram and review unresolved nodes.
5. Generate a Terraform bundle, then inspect the manifest and validation runner.

For finance/FinOps:

1. Review commitment-model and break-even sections.
2. Export CSV/Excel.
3. Inspect budget/alert and reconciliation readiness sections.
4. Review usage-comparable variance and the invoice adjustment category summary.
5. Review commitment row count/net cost for reservations, savings plans, and
   committed-use discounts.
6. Review commitment evidence requirements for provider inventory, amortization
   periods, and allocation proof.
7. Review the invoice-grade readiness blockers and required provider artifacts.
8. Call out that invoice-grade actual spend and private discounts are future work.
