# PolyCost - Roadmap Detail: V2, V3, V4

Do not pull this file into active context during MVP build. It exists so V2+ work has
a real spec to start from later, and so MVP architecture decisions can be sanity
checked against it without prematurely building any of it now.

## V2 - draw.io Diagram Input

### Goal

User uploads a `.drawio` XML-based file representing their architecture. PolyCost
parses it into a valid NWS and runs the same comparison pipeline as V1.

### Why draw.io specifically

draw.io is free, widely used by architects, produces parseable mxGraph XML, and does
not require users to learn a new tool just to use PolyCost.

### High-level approach

1. Parse the `.drawio` XML. Extract shapes, `mxCell` labels, and connections between
   cells.
2. Classify shapes into NWS concepts. This will likely combine:
   - Convention-based matching for known AWS, Azure, and GCP stencil styles.
   - LLM-assisted fallback for generic boxes or labels that do not match known
     stencils.
3. Use topology, not just individual shapes. A database connected to an API server
   can inform network and availability sections of NWS, not just component counts.
4. Output a populated NWS with `metadata.sourceType = 'drawio_diagram'` and
   `sourceTraceability` populated with links back to diagram shape IDs.

### Reuses from V1

- Comparison Engine
- All three cloud adapters
- Report Module
- Frontend comparison view component

### New work required

- `.drawio` XML parser module
- Shape-to-NWS classifier using convention table plus LLM fallback
- Upload UI and diagram preview
- Stretch: cost-annotated diagram export overlaying cost figures on a rendered version
  of the uploaded diagram

## V3 - Terraform Generation

### Goal

Given a valid NWS from natural language, form, or diagram input and a user-selected
target cloud, generate deployable Terraform.

### Design considerations

- Generate for one selected cloud at a time, not three parallel Terraform sets.
- Generated Terraform must pass `terraform validate`, and ideally `terraform plan` in
  a sandboxed or mocked provider environment, before delivery.
- If the user provides an example of existing Terraform conventions, follow it.
- Otherwise use documented Terraform best practices:
  - Remote state backend configured, not local state.
  - No hardcoded secrets or credentials.
  - Variables and documented secrets-management approach.
  - Resources tagged for cost tracking.
- Generate idiomatic multi-file Terraform such as `main.tf`, `variables.tf`,
  `outputs.tf`, and provider-specific `versions.tf`, not a single giant file.

### Reuses from V1/V2

- NWS as the input contract.
- `service_equivalence_map` for mapping NWS workload tiers to provider-specific
  instance types, SKUs, or service choices.

### New work required

- Terraform code generation module.
- Prefer templated generation for predictable resource blocks over free-form LLM HCL.
- Sandboxed `terraform validate` and `terraform plan` execution environment.
- Versioned per-cloud best-practice template library.

## V4 - Terraform to Diagram and Cost

### Goal

User uploads existing Terraform scripts or a Terraform plan JSON export. PolyCost
parses the resources into an NWS, then:

1. Generates a visual architecture diagram as a draw.io-compatible export.
2. Runs the standard three-cloud cost comparison.

### High-level approach

1. Parse Terraform using `terraform show -json` on a plan or an HCL parser for `.tf`
   files.
2. Extract resource blocks and relationships from explicit `depends_on`, implicit
   references, and data sources.
3. Map resources back into NWS. This is the inverse of V3's NWS-to-Terraform mapping.
4. Generate draw.io XML using the same shape conventions V2 recognizes.
5. Run the standard comparison pipeline unchanged on the resulting NWS.

### Input scope

Terraform that heavily uses public registry modules or third-party modules will be
harder to classify than native provider resource blocks.

V4 should scope first to native provider resource blocks such as `aws_instance`,
`azurerm_linux_virtual_machine`, and `google_compute_instance`. Unrecognized module
calls should be clearly flagged for review instead of guessed.

### Reuses from V1/V2/V3

- NWS, Comparison Engine, cloud adapters, and Report Module
- V3 resource mapping table, used in reverse
- V2 shape conventions, used as the diagram generation target format

## Cross-cutting note

V2, V3, and V4 are additive at the edges: new input parsers and output generators.
They should not require changes to the Comparison Engine or cloud adapters.

If future work requires changing how the Comparison Engine or cloud adapters operate,
that is a signal that V1 architecture was compromised. Stop and reassess rather than
special-casing around it.
