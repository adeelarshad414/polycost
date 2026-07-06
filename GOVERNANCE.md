# Governance

PolyCost currently uses a maintainer-led governance model.

## Maintainer Responsibilities

Maintainers are responsible for:

- Protecting the cloud-neutral and self-hostable direction of the project.
- Reviewing and merging pull requests.
- Managing releases and roadmap priorities.
- Triage for bugs, security reports, and documentation gaps.
- Keeping pricing claims honest and auditable.

## Decision Making

Small changes can be reviewed directly in pull requests. Larger changes should start
with an issue, design note, or roadmap discussion before implementation.

Changes that require extra scrutiny include:

- Normalized Workload Specification changes.
- API contract changes.
- Database migrations.
- Pricing math or provider-adapter changes.
- Security, authentication, authorization, or secret-handling changes.
- Report formats used for external decision making.

## Project Direction

PolyCost prioritizes:

- Open-source core comparison logic.
- Cloud-neutral modeling.
- Self-hostable deployments.
- Decision-grade estimates with clear evidence and caveats.
- Transparent provider mapping and pricing traceability.

The project will not accept changes that intentionally bias results toward a
specific cloud provider or hide pricing assumptions.
