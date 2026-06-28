# MVP Open Questions

These decisions must be resolved before implementation that depends on them. They are
tracked separately so V1 does not silently accumulate hidden product assumptions.

## 1. Default regions

Status: resolved by `09-CONFIG-AND-SECRETS.md`.

Question: What default region should be used when a user does not specify one?

Likely default:

- AWS: `us-east-1`
- Azure: `eastus`
- GCP: `us-central1`

Required outcome:

- Document the defaults in product copy and API contracts.
- Show the selected region in the editable NWS form.
- Make the default explicit in validation and comparison results.
- Wire defaults through centralized config keys:
  `PRICING_ETL_DEFAULT_REGION_AWS`, `PRICING_ETL_DEFAULT_REGION_AZURE`, and
  `PRICING_ETL_DEFAULT_REGION_GCP`.

## 2. Equivalent-service mapping

Status: resolved at data-model level; seed content still needs review.

Question: How should MVP maintain equivalent-service mappings across AWS, Azure, and GCP?

Likely default:

- Seed a reviewed mapping table in the database.
- Treat mapping data as product-owned reference data, not incidental code.
- Include whether a mapping is exact, approximate, or provider-specific.

Required outcome:

- Define the mapping table in `04-DATA-MODEL.md`. Done:
  `service_equivalence_map`.
- Define adapter behavior in `03-ARCHITECTURE.md`.
- Add tests proving cloud-specific requirements produce labeled approximations.

## 3. Currency

Status: resolved for V1 as USD-only.

Question: What currency behavior does MVP support?

Likely default:

- USD only for MVP pricing and exports.
- Label all figures as USD.
- Defer display-only FX conversion.

Required outcome:

- State USD-only behavior in UI and report exports.
- Include USD-specific fields in the comparison API response. Done:
  `baseMonthlyCostUsd`.
- Avoid financial-conversion logic in V1 unless explicitly re-scoped.
