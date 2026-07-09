# Phase V3.7 Terraform Destination Evidence Capture

V3.7 closes the handoff gap between generated Terraform bundles and the V3.6
evidence checker. PolyCost still does not run Terraform inside request handling,
hold provider credentials, manage remote state, or execute `terraform apply`.
Instead, this phase adds an operator-side capture helper that turns
destination-run artifacts into the existing Terraform validation evidence JSON.

## Additions

- `npm run terraform:evidence:capture`
- `npm run terraform:evidence:capture:smoke`
- `scripts/terraform-destination-evidence-capture.mjs`
- `docs/operations/evidence/terraform-destination-capture/`

The capture helper reads a profile plus operator-controlled artifacts:

- generated `BUNDLE-MANIFEST.json`
- generated `terraform-manifest-integrity-result.json`
- generated `terraform-validation-result.json`
- destination `tfplan.json`
- destination `.terraform.lock.hcl`
- policy result JSON, such as Conftest output
- remote-state evidence JSON

It emits a `polycost-terraform-validation-evidence/v1` bundle and, in smoke mode,
validates that output with:

```bash
npm run terraform:evidence:check -- --require-destination-plan <bundle.json>
```

## Operator Workflow

1. Generate and download a Terraform starter bundle from PolyCost.
2. Move the bundle into the target account, subscription, or project runner.
3. Run manifest verification, `terraform fmt`, `terraform init`, `terraform validate`,
   optional `terraform test`/`tflint`, destination `terraform plan`, and policy checks.
4. Save the plan JSON, provider lock file, remote-state evidence, and policy result.
5. Fill a capture profile based on
   `docs/operations/evidence/terraform-destination-capture/terraform-destination-capture.example.json`.
6. Run:

```bash
npm run terraform:evidence:capture -- --profile <profile.json> --output <bundle.json>
npm run terraform:evidence:check -- --require-destination-plan <bundle.json>
```

## Boundary

This makes destination evidence assembly repeatable. It is still not managed
Terraform execution by PolyCost, not an apply approval, and not landing-zone
certification. Provider credentials, state access, policy approvals, and change
management remain operator-controlled.
