# Phase 2 - Diagram-to-Cost Ingestion Verification

Last updated: 2026-07-06

## Supported Inputs

| Format                 | User path                           | Parser path         | Status                                                     |
| ---------------------- | ----------------------------------- | ------------------- | ---------------------------------------------------------- |
| Mermaid                | Paste `.mmd` text                   | `MermaidExtractor`  | Implemented                                                |
| draw.io / diagrams.net | `.drawio` or `.xml` source          | `DrawioExtractor`   | Implemented for uncompressed and compressed diagram bodies |
| Lucidchart CSV         | `File > Export > CSV of Shape Data` | `LucidCsvExtractor` | Implemented                                                |
| Lucidchart VSDX        | `File > Export > Visio (VSDX)`      | `VsdxExtractor`     | Implemented for basic OpenXML shape/connect metadata       |

Images, screenshots, and PDFs are rejected in Phase 2. The detector includes a
`PHASE_2_5_HOOK` at the image/PDF rejection branch for future vision/OCR parsing.

## Fixture Accuracy Baseline

| Fixture                                       | Format    | Expected signal                                   |
| --------------------------------------------- | --------- | ------------------------------------------------- |
| `fixtures/diagrams/mermaid/web-app.mmd`       | Mermaid   | Load balancer, compute, Postgres, object storage  |
| `fixtures/diagrams/mermaid/data-platform.mmd` | Mermaid   | Ingestion, queue, warehouse, object storage       |
| `fixtures/diagrams/mermaid/ml-platform.mmd`   | Mermaid   | AI/ML, object storage, registry-like services     |
| `fixtures/diagrams/drawio/web-app.drawio`     | draw.io   | AWS stencil/label services                        |
| `fixtures/diagrams/drawio/gcp-api.drawio`     | draw.io   | GCP API/backend services                          |
| `fixtures/diagrams/drawio/analytics.drawio`   | draw.io   | Plain labels with analytics/database/storage      |
| `fixtures/diagrams/lucid/lucid-export.csv`    | Lucid CSV | Shape-data rows and line-source/destination edges |
| `fixtures/diagrams/vsdx/simple.vsdx`          | VSDX      | Basic OpenXML shapes and connectors               |

`POST /api/v1/parse/diagram` returns:

- format-neutral `graph.nodes` and `graph.edges`
- reviewable `components`
- unresolved nodes that require manual classification
- ignored/decorative nodes that are not silently dropped
- NWS draft with `metadata.sourceType = drawio_diagram`
- `source.tempFileStored` and `source.expiresAt` metadata for the 24h temp copy

## Security Fixtures

| Fixture                                           | Expected result                       |
| ------------------------------------------------- | ------------------------------------- |
| `fixtures/diagrams/malicious/xxe.drawio`          | Rejected before XML extraction        |
| `fixtures/diagrams/malicious/deflate-bomb.drawio` | Rejected by inflated-size/ratio guard |
| `fixtures/diagrams/malicious/zip-bomb.vsdx`       | Rejected by bounded ZIP expansion     |
| `fixtures/diagrams/malicious/oversized.drawio`    | Rejected by 5MB decoded upload cap    |
| `fixtures/diagrams/malicious/png-renamed.drawio`  | Rejected by content sniffing          |

Additional binary sniffing rejects JPEG, GIF, and PDF signatures with a format-specific
message that instructs users to export editable diagram source instead.

## Live Verification Commands

Run the full stack E2E harness:

```bash
npm run ci:e2e
```

The backend E2E suite posts real fixture content to `/api/v1/parse/diagram`, validates
the parsed NWS, creates a normal comparison, and verifies malicious fixtures leave the
API healthy after rejection. The browser E2E suite uploads `drawio/web-app.drawio`
through the visible Upload diagram tab, reviews parsed services, submits a comparison,
and confirms the posted NWS uses `drawio_diagram`.

Last verified on 2026-07-06:

- API E2E: 14/14 passing, including Mermaid, draw.io, Lucid CSV, VSDX, and malicious
  fixture rejection.
- Browser E2E: 6/6 passing, including the live draw.io upload-to-comparison path.
- Unit coverage: API 318 tests passing; web 114 tests passing with global branch
  coverage above the 75% threshold.
- Security audit: `npm run ci:security` exits 0 at the high threshold; remaining
  advisories are low/moderate transitive tooling advisories.

## Known Gaps

- Tier 3 LLM classification is now optionally wired through an OpenAI-compatible
  JSON-schema classifier. Configure `DIAGRAM_LLM_CLASSIFIER_ENDPOINT`,
  `DIAGRAM_LLM_CLASSIFIER_MODEL`, and Vault `secret/polycost/llm` key `api_key` to use
  it. Deterministic stencil/alias matches run first; only unresolved nodes enter the
  bounded batch classifier, currently capped at 20 nodes per parse with manual review
  fallback for overflow, missing config, malformed output, provider errors, or
  timeouts.
- VSDX parsing reads basic OpenXML pages, shapes, and connectors. It does not attempt
  full Visio rendering semantics.
- Review controls update submitted `serviceRequirements`; deep service-specific
  sizing still uses the existing workload form.
- Server upload transport is JSON/base64 or text body from the web client, not a
  multipart endpoint. The decoded upload cap, temp-file copy, and content sniffing are
  enforced server-side.

## Rollback

Revert the Phase 2 branch commit or disable the UI tab by removing `diagram` from
`INPUT_MODE_OPTIONS`. The downstream comparison/pricing/export pipeline is unchanged;
only the additive parser module, route, migration, UI tab, fixtures, and PDF evidence
section are Phase 2-specific.
