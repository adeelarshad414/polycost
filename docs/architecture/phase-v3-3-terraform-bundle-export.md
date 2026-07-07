# Phase V3.3 Terraform Bundle Export

V3.3 turns generated Terraform from an API-only file list into a reviewer-friendly delivery
artifact. PolyCost still does not execute Terraform during request handling; it now packages the
generated files, hashes them, and includes an operator-side runner that can be executed after the
bundle is saved into a controlled workstation or CI runner.

## Additions

- `TerraformGenerationResult.archive` with:
  - ZIP filename
  - MIME type
  - base64 ZIP payload
  - archive SHA-256
  - archive size in bytes
- `BUNDLE-MANIFEST.json` generated inside every bundle.
- `scripts/validate-bundle.mjs` generated inside every bundle.
- API validation checks for:
  - `bundle-manifest-generated`
  - `validation-runner-generated`
  - `zip-archive-generated`
- Frontend download actions:
  - `Download Terraform ZIP`
  - `Download evidence JSON`

## Manifest Contents

The manifest uses `polycost.terraform.bundle.v1` and records:

- bundle name, generation timestamp, target cloud, workspace name, and region
- generation profile and resource summary
- validation runner path
- expected validation commands
- per-file SHA-256 and file sizes for all payload files before the manifest is added

The manifest intentionally excludes its own recursive hash.

## Validation Runner

The generated `scripts/validate-bundle.mjs` runs:

- `terraform fmt -check -recursive`
- `terraform init -backend=false`
- `terraform validate`
- optional `terraform test`
- optional `tflint --recursive`
- optional `conftest test tfplan.json --policy policies` when `tfplan.json` exists

It writes `terraform-validation-result.json` and exits non-zero when required Terraform checks fail.
Optional tools are reported as skipped or warning when unavailable.

## Boundaries

- PolyCost does not unzip or execute Terraform server-side.
- Provider credentials remain outside PolyCost request handling.
- `terraform plan` still belongs in the destination account, subscription, or project.
