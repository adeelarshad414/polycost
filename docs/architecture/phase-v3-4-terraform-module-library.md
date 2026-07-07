# Phase V3.4 Terraform Module Library

V3.4 upgrades the generated `modules/` directory from documentation-only boundaries to real
provider-specific starter modules. The generated root module remains the immediate review baseline;
the module library gives platform teams a clean extraction path for versioned internal modules.

## Generated Module Set

Every AWS, Azure, and GCP bundle now includes:

- `modules/network/variables.tf`
- `modules/network/main.tf`
- `modules/network/outputs.tf`
- `modules/compute/variables.tf`
- `modules/compute/main.tf`
- `modules/compute/outputs.tf`
- `modules/data/variables.tf`
- `modules/data/main.tf`
- `modules/data/outputs.tf`

The API static validation check `module-library-generated` verifies that the network, compute, and
data module files are present.

## Provider Coverage

AWS:

- VPC, public/private subnets, and application security group
- EC2 VM module with IMDSv2, encrypted root disk, optional public IP, and optional instance profile
- S3 object storage module with public-access blocking and server-side encryption
- Optional RDS starter module using private subnet group and non-public database exposure

Azure:

- Resource group, VNet, app subnet, delegated database subnet, and NSG
- Linux VM module with SSH-only auth, system-assigned managed identity, and private NICs
- Storage account/container module with TLS 1.2, private container access, and versioning
- Optional PostgreSQL Flexible Server starter module with delegated subnet and private DNS inputs

GCP:

- Custom VPC, subnetwork with Private Google Access, and HTTPS firewall baseline
- Compute Engine module with service account, OS Login metadata, and Shielded VM controls
- Cloud Storage bucket module with uniform bucket-level access and public access prevention
- Optional Cloud SQL starter module with private network input, backups, and deletion protection

## Promotion Model

The generated modules are starter modules, not a final enterprise platform registry. Before
production promotion, reviewers should confirm:

- provider aliases and multi-account/subscription/project strategy
- remote-state ownership and module versioning
- landing-zone naming conventions
- IAM/RBAC permissions and organization policies
- environment-specific logging, monitoring, backup, WAF/CDN, and DR requirements

## Remaining Gaps

- Container, serverless, and Kubernetes modules remain explicit manual-review targets.
- Edge, observability, WAF/CDN, autoscaling, and DR modules are future phases.
- PolyCost does not run module registry publishing or provider-authenticated `terraform plan`.
