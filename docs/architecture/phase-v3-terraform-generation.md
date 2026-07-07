# Phase V3 Terraform Generation

Phase V3 starts the roadmap path from reviewed requirements to provider-specific
Infrastructure as Code. The implementation is intentionally additive: the NWS remains
the source of truth, and the existing comparison/pricing engine is not coupled to
Terraform execution.

## Scope Implemented

- `POST /api/v1/terraform/generate`
- Supported targets: `aws`, `azure`, `gcp`
- Input: reviewed `NormalizedWorkloadSpec`, target cloud, optional workspace name,
  optional region override
- Output: a file bundle with:
  - `versions.tf` with pinned official HashiCorp provider constraints
  - `providers.tf`
  - `backend.tf.example` for encrypted remote state
  - `variables.tf` with validation and sensitive variables where needed
  - `main.tf`
  - `outputs.tf`
  - `terraform.tfvars.example`
  - `README.md`
  - SHA-256 hash per generated file
  - static validation checks, assumptions, security notes, and next steps

## Provider Baselines

AWS:

- VPC, public subnets, HTTPS security group
- EC2 application instances
- S3 object storage with public-access block, versioning, and encryption
- Optional RDS relational database with encrypted storage and sensitive password variable
- Optional ALB shell
- S3/DynamoDB remote-state example

Azure:

- Resource group, virtual network, subnet, NSG
- Linux VMs with SSH-key auth and no password authentication
- StorageV2 account with TLS 1.2, private container, and versioning
- Optional PostgreSQL Flexible Server
- Optional Load Balancer shell
- Azure Blob remote-state example

GCP:

- VPC network, subnet, HTTPS firewall
- Compute Engine instances with OS Login and Shielded VM settings
- Cloud Storage bucket with uniform bucket-level access and versioning
- Optional Cloud SQL instance/user
- Optional reserved global address for load-balancer follow-up
- GCS remote-state example

## Validation Model

PolyCost performs request-time static checks only:

- Required official provider is present and version constrained
- Remote-state example exists
- Sensitive runtime variables do not have committed defaults
- Cost-allocation tags or labels are present

PolyCost does not run `terraform init`, `terraform validate`, `terraform plan`, or
`terraform apply` during request handling. The generated README instructs operators
to run those commands after saving files and authenticating to the target account.

## Known Gaps

- Generated Terraform is a starter bundle, not a complete enterprise module library.
- VM-first compute is used for cross-cloud portability. Kubernetes, containers,
  serverless, PaaS app hosting, IAM, WAF, private endpoints, CDN distribution details,
  and active-active DR require follow-up module selection.
- Full provider credential execution and plan validation must happen outside PolyCost
  in a controlled CI/CD runner or reviewed operator workstation.
