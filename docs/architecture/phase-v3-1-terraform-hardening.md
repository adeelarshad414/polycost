# Phase V3.1 Terraform Hardening

V3.1 closes the most important V3 demo-readiness gaps without overstating scope. PolyCost still
does not run `terraform apply`, and it still does not replace a platform team's landing-zone
modules. The generator now produces a safer, reviewable bundle that architects and DevOps teams can
save, validate, plan, and promote through their own controls.

## Additions

- Request options for runtime target, network topology, availability mode, policy-pack inclusion,
  and module-scaffold inclusion.
- Response-level `generationProfile` so every bundle records the selected IaC posture.
- `Makefile` with local validation targets.
- `.tflint.hcl` for Terraform lint entry point.
- `tests/static_validation.tftest.hcl` for Terraform test entry point.
- `policies/terraform-plan.rego` for plan-time policy checks.
- `modules/` boundary documentation for network, compute, and data extraction.
- Stronger static validation checks for private database networking, runtime identity, policy
  pack presence, Terraform test harness, and module boundary docs.

## Provider Hardening

AWS:

- Private subnets generated alongside public subnets.
- RDS subnet group uses private subnets.
- RDS explicitly sets `publicly_accessible = false`.
- EC2 gets a provider-native IAM role and instance profile with no broad inline permissions.
- Compute public IP attachment is controlled by `enable_public_compute_ip`.

Azure:

- Compute public IPs are optional through `enable_public_compute_ip`.
- Linux VMs include a system-assigned managed identity.
- PostgreSQL Flexible Server uses a delegated database subnet.
- Private DNS zone and VNet link are generated for PostgreSQL private access.
- PostgreSQL public network access is disabled.

GCP:

- Compute public NAT access configs are optional through `enable_public_compute_ip`.
- VM service account is generated with logging and monitoring scopes only.
- Subnet enables Private Google Access.
- Cloud Storage enforces public access prevention.
- Cloud SQL uses private service access and public IPv4 is disabled.

## Remaining Honest Gaps

- This is not a full enterprise module library. It is a root bundle plus documented module
  boundaries for platform extraction.
- Container, serverless, and Kubernetes targets are represented as explicit manual-review module
  boundaries, not fully generated provider-native runtime stacks.
- Active-active and multi-region DR are recorded in the generation profile and assumptions, but the
  bundle remains a single-region baseline until a dedicated DR module pass.
- Terraform `init`, `validate`, `test`, `plan`, and policy checks must run outside PolyCost with
  real provider credentials and destination account controls.
