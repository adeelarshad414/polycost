# PolyCost AI-Native Phase 1 Architecture Notes

PolyCost's Phase 1 pipeline is intentionally cloud-neutral:

1. Input arrives from natural language, the guided form, or a plain requirements
   file loaded into the natural-language parser.
2. The input is parsed into normalized requirements and the existing Normalized
   Workload Specification.
3. Service equivalence mapping resolves AWS, Azure, and GCP counterparts with
   visible confidence and caveats.
4. Cost comparison reads cached pricing data only, then produces provider totals,
   line items, pricing-model scenarios, dashboards, reports, and shareable views.

The stable AI-native contract lives in `packages/types/src/index.ts`. It defines
`NormalizedRequirement[]`, `ProviderCostResult`, `AiCostNarrative`, and the
`RequirementParserService` interface so future input modes can plug into the same
downstream comparison pipeline without redesigning the API.

## Phase 2 Hooks

- `apps/api/src/nws-parser/requirement-parser.service.ts` contains the parser
  registry interface. CSV, Excel, and diagram parsers should implement the same
  `RequirementParserService` contract and return normalized requirements before
  converting to NWS.
- `apps/web/src/App.tsx` includes a Phase 1 requirements-file bridge for TXT,
  Markdown, JSON, and YAML files. It reads the file client-side into the existing
  natural-language parser and review/edit checkpoint. CSV, Excel, and DrawIO
  structured import remain Phase 2 parser implementations behind the same surface.

## Phase 3 Hooks

- `apps/api/src/comparison/comparison-orchestrator.service.ts` receives validated
  NWS plus normalized service requirements before provider pricing. Terraform
  generation should consume that same validated requirement model and selected
  provider mapping.
- `packages/types/src/index.ts` keeps provider cost and requirement contracts
  stable so Terraform generation can share types with the comparison/reporting
  path.

## Design Intent

- Provider pricing APIs are never called per user comparison. Scheduled ETL writes
  cached pricing data; user requests read the cache.
- Spot pricing is an estimate range only and must stay clearly labeled as
  interruptible, volatile, and not a precise committed total.
- Reports and dashboards should present the same evidence: normalized
  requirements, equivalence confidence, provider line items, selected pricing
  model, selected granularity, and caveats.
