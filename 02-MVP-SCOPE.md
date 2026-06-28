# PolyCost - MVP Scope (V1)

This is the contract for what "MVP done" means. Anything not listed under "In scope"
is explicitly out, even if it seems small.

## In scope for MVP

### Input

- Free-text natural language requirements input
- LLM parses natural language input into the Normalized Workload Specification (NWS)
- Parsed NWS is shown back to the user as an editable structured form before pricing
  runs
- The structured form includes workload type, compute, storage, database,
  network/bandwidth, expected traffic/users, availability requirements, and region
- User can skip natural language input and fill the structured form directly
- Missing required fields block submission with clear validation messaging

### Pricing engine

- Nightly ETL pulls and normalizes pricing from:
  - AWS Price List API
  - Azure Retail Prices API
  - GCP Cloud Billing Catalog API
- One normalized internal pricing schema populated by all three adapters
- Given a valid NWS, system computes equivalent service mapping on AWS, Azure, and GCP
- Cloud-specific requirements still produce nearest-equivalent estimates on the other
  two clouds and label those results as approximations
- Costs are computed and displayed at daily, weekly, monthly, quarterly, and yearly
  intervals
- Interval costs are derived from the same base monthly figure
- "Refresh live pricing" re-queries the relevant provider pricing APIs for only the
  services in the current comparison

### Output

- On-screen three-column comparison view: AWS, Azure, GCP
- Service-by-service breakdown and total per cloud
- PDF export of the full comparison report
- CSV export of line-item cost data
- Excel export as a real formatted `.xlsx`
- All exports use the same comparison result without regenerating the calculation

### Non-functional

- Runs fully via `docker-compose up` for self-hosters
- No cloud account required to run PolyCost itself
- Anonymous usage works in the MVP
- Basic rate limiting on the natural-language parsing endpoint
- Pricing data freshness indicator shown to the user

## Explicitly out of scope for MVP

- draw.io diagram upload or parsing
- Terraform generation
- Terraform import or reverse engineering
- User accounts, saved comparisons, and history
- Reserved Instance, Savings Plan, or committed-use discount modeling
- Live billing integration with actual cloud accounts
- More than three cloud providers
- CLI tool or CI pipeline integration
- Cost optimization recommendations
- Multi-region cost comparison in a single report

## Acceptance criteria

1. A user can type "I need a web app for 5,000 daily active users with a Postgres
   database and file storage for user uploads" and receive a three-cloud cost
   comparison in the same session.
2. The same comparison, re-run a week later after nightly ETL, reflects provider
   pricing changes without a code deploy.
3. A user can export the exact same comparison as PDF, CSV, and Excel, and all three
   show consistent numbers.
4. A requirement naming a single-cloud-specific service, such as Aurora Serverless,
   still produces a complete three-cloud comparison with non-AWS columns clearly
   marked as nearest-equivalent estimates.
5. The whole system runs from a clean checkout via `docker-compose up` with no manual
   pricing-data seeding step beyond documented first-run instructions.
6. Test coverage exists for NWS parsing, each cloud adapter's pricing lookup,
   interval-cost math, and all three export formats.

## Open questions

- Default region per cloud when the user does not specify one
- How equivalent-service mapping is curated for MVP
- Currency behavior, with USD expected as the MVP default
