# Phase 2 VSDX Visual Evidence

PolyCost can parse VSDX page geometry and emit sanitized approximate SVG previews
for positioned shapes. This phase adds a machine-readable evidence contract for
that preview path without changing the product boundary: it is still not full
Visio visual rendering.

## Evidence Contract

Run the default schema/sample check:

```bash
npm run vsdx:visual-evidence:check
```

For a real reviewed handoff, archive a sanitized bundle using
`evidenceLevel=reviewed-preview`, set `operatorAttestations.humanPreviewReviewed`
to `true`, name the reviewer, and run:

```bash
npm run vsdx:visual-evidence:check -- --require-human-review <bundle.json>
```

The checked-in example bundle uses `example-schema`. It proves the contract shape
and CI guard only; it is not human-reviewed diagram proof.

## What The Checker Requires

- VSDX source format and a valid captured timestamp.
- Parser counts for pages, nodes, edges, and visual previews.
- Approximate SVG preview evidence with `renderingMode=layout-extraction`.
- A SHA-256 digest for the generated SVG preview artifact.
- Explicit caveats that the output is not full Visio visual rendering.
- No raw VSDX, raw XML, base64 diagram payload, or secret-like material.
- Operator attestations for raw-file exclusion and unsafe XML rejection.

## Boundary

This evidence makes the current VSDX preview path auditable for demos and
customer handoff. It does not evaluate Visio themes, icon libraries, formulas,
embedded media, exact text wrapping, or pixel-level visual equivalence. Full
Visio rendering remains future scope.
