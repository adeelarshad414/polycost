# PolyCost - Vision & Roadmap

## The pitch

Describe what you want to build. See what it costs on AWS, Azure, and GCP side by
side, broken down daily to yearly, exportable as a report. Open source,
self-hostable, and no vendor lock-in in the tool that helps you avoid vendor lock-in.

## Who this is for

- Architects and consultants doing presales or proposal work
- Startups and SMEs deciding which cloud to commit to
- FinOps teams auditing whether a workload is on the cheapest viable cloud
- Engineering teams migrating and sanity-checking target-cloud costs
- Students and learners comparing cloud pricing models

## Version roadmap

### V1 - MVP: Requirements to comparison

- User provides requirements via natural language or structured form
- System maps requirements to equivalent services on AWS, Azure, and GCP
- Cost comparison shown on screen: daily, weekly, monthly, quarterly, yearly
- Export to PDF, CSV, and Excel
- Cloud-specific requirements still produce nearest-equivalent estimates on the other
  two clouds

### V2 - Diagram input

- User uploads a draw.io `.drawio` or `.xml` architecture diagram
- System parses shapes, labels, and connectors into NWS
- Produces the same three-way cost comparison and reports as V1
- Stretch: visual overlay showing estimated cost on the diagram

### V3 - Infrastructure-as-code generation

- User provides requirements and a target cloud
- System generates deployable Terraform for that cloud
- Generated Terraform follows provided module conventions or Terraform best practices
- Output is validated before delivery

### V4 - Terraform to diagram and cost

- User uploads existing Terraform
- System parses resources into NWS
- Produces architecture diagram plus standard cost comparison

### V5+ - Beyond three clouds

- Additional provider adapters
- Multi-cloud optimization recommendations
- Reserved Instance, Savings Plan, and committed-use modeling
- Team accounts, saved comparisons, history, and shared workspaces
- CLI tool for CI/CD integration
- Public API for third-party integrations

## Constant commitments

1. Cloud-neutral by design
2. Open source and self-hostable
3. Same NWS-based core engine
4. No paywalled core comparison or export functionality

## Explicit non-goals

- Not a billing or invoicing tool
- Not a Terraform management tool
- Not trying to be 100% pricing-accurate to the cent
