# Phase V3.6 Terraform Validation Evidence

V3.6 closes another production-readiness gap without moving Terraform execution into
PolyCost request handling. Generated bundles still have to be saved into a
customer-controlled workstation or CI runner, initialized with real provider
credentials, and reviewed by the platform team. This phase adds a machine-readable
evidence contract for that external validation.

## Additions

- `npm run terraform:evidence:check`
- `scripts/terraform-validation-evidence-check.mjs`
- `docs/operations/evidence/terraform-validation-evidence.example.json`

The evidence checker validates:

- generated `BUNDLE-MANIFEST.json` metadata and required bundle files
- generated `terraform-manifest-integrity-result.json` status
- generated `terraform-validation-result.json` required steps:
  - `manifest-integrity`
  - `terraform-fmt`
  - `terraform-init`
  - `terraform-validate`
- optional Terraform test, TFLint, and Conftest policy evidence when present
- destination `tfplan.json` digest and plan summary
- destructive/replacement-change counts and explicit exception approval
- remote state backend, locking, and encryption posture
- cost-allocation tags
- operator attestations that PolyCost did not run `terraform apply`, raw secrets are
  excluded, and provider credentials stayed outside PolyCost

## Evidence Levels

- `example-schema`: checked-in sanitized sample evidence used by CI and release
  guards. This proves the contract shape only.
- `destination-plan`: real evidence captured after running Terraform in the target
  account, subscription, or project.

Use `--require-destination-plan` for promotion gates:

```bash
npm run terraform:evidence:check -- --require-destination-plan <bundle.json>
```

The checked-in example intentionally fails that mode so sample evidence cannot be
mistaken for destination-account proof.

## Boundary

PolyCost still does not run `terraform apply`, hold provider credentials, manage
state, or certify a landing zone. The checker verifies archived validation evidence
after an operator runs Terraform through their own cloud, state, policy, approval,
and change-management controls.
