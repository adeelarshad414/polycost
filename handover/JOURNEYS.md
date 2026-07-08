# Core Journeys And Evidence

## Journey 1: Requirements To Recommendation

1. Open `/`.
2. Use guided form or a template.
3. Run `Compare costs`.
4. Review provider summary and executive baseline.
5. Expand engineering breakdown.
6. Export PDF/CSV/XLSX.

Evidence:

- `apps/web/e2e/polycost-browser.e2e.ts`
- `scripts/live-verification.mjs`
- `docs/demo-artifacts/executive-overview-desktop.png`

Status: verified(mock) locally, production provider credentials required for full live-cloud proof.

## Journey 2: Diagram To Cost

1. Open Upload diagram.
2. Upload `fixtures/diagrams/drawio/web-app.drawio`.
3. Parse diagram.
4. Review extracted services.
5. Compare costs and export.

Evidence:

- `apps/web/e2e/polycost-browser.e2e.ts`
- `apps/api/src/diagram-parser/diagram-parser.service.spec.ts`
- `scripts/live-verification.mjs`

Status: verified(mock) for supported parsing/extraction. Full Visio visual rendering remains future scope.

## Journey 3: FinOps Sharing And Budget Context

1. Compare a workload.
2. Open detailed controls.
3. Review budget alerts and pricing model controls.
4. Create a share link.
5. Refresh share analytics.

Evidence:

- `apps/web/src/App.spec.tsx`
- `apps/web/src/components/FinOpsFeatureLayer.tsx`
- `scripts/live-verification.mjs`

Status: verified(mock) for local/demo runtime.

## Journey 4: Workspace Auth, Team, SSO, RBAC

1. Register/login from workspace controls.
2. Create/invite team members.
3. Configure mock OIDC metadata.
4. Exercise RBAC denial for member-only billing import.

Evidence:

- `apps/api/src/api/auth-billing.spec.ts`
- `apps/api/src/api/auth.controller.spec.ts`
- `scripts/live-verification.mjs`

Status: verified(mock). Production email, SSO/SAML, SCIM, and complete account-team UX remain future product phases.

## Journey 5: Terraform Starter Bundle

1. Compare workload.
2. Select AWS, Azure, or GCP target.
3. Choose runtime/network/availability profile.
4. Generate Terraform.
5. Download ZIP and evidence JSON.

Evidence:

- `apps/api/src/terraform/terraform-generation.service.spec.ts`
- `apps/web/src/App.spec.tsx`
- `docs/architecture/phase-v3-4-terraform-module-library.md`

Status: verified(static/mock). Provider-authenticated `terraform init/validate/plan` is outside the current request flow.
