# Phase 10 Cost Intelligence Notes

This phase turns PolyCost from a simple provider-total comparison into a
self-serve cost-intelligence workflow. The core rule stays the same: every input
path must converge into the Normalized Workload Specification before pricing,
reporting, sharing, or export.

## NWS Service Requirements

`serviceRequirements` is the cloud-neutral service selection layer inside the
NWS. It records the user's selected service category, normalized service family,
region preference, availability-zone posture, quantity, instance/tier intent,
and scale parameters.

Structured form input creates this list from the guided category/service/tier/AZ
selectors plus derived compute, storage, database, CDN, and load-balancing
requirements. Natural-language parsing now produces the same shape through the
local parser and the optional LLM parser contract.

The comparison engine echoes a compact `requirements` summary on
`ComparisonResult`, so dashboards and reports can show what was priced without
requiring clients to reconstruct the original NWS.

## Cost Evidence And Exports

Report generation accepts a selected interval and pricing model. CSV, XLSX, and
PDF exports include:

- the active interval and pricing-model scenario
- provider availability and selected scenario costs
- normalized service requirements
- rate evidence for line items, including unit price, hourly/monthly math, and
  pricing-model caveats when adapters expose them

This keeps exports aligned with what the user saw on screen instead of falling
back to a generic monthly/on-demand report.

## Future Import Hooks

CSV and Excel imports should normalize rows into `serviceRequirements` first,
then call the existing NWS validator before pricing. A row mapper can translate
columns such as service category, service type, region, quantity, tier, vCPU,
memory, storage GB, database engine, and availability zones into the same NWS
fields used by the guided form.

Diagram input should parse shapes/connectors into `serviceRequirements` and the
existing compute/storage/database/network blocks. The current service family IDs
are the stable bridge between diagram labels and provider adapter mappings.

## Future Terraform Hook

Terraform generation should consume validated NWS plus `serviceRequirements`.
Provider-specific Terraform modules can use service type, region, quantity,
tier, and scale parameters as the cloud-neutral inputs before rendering AWS,
Azure, or GCP resources.

Reverse Terraform import should follow the opposite path: parse provider
resources into `serviceRequirements`, derive the canonical NWS components, then
reuse the same comparison and report pipeline.
