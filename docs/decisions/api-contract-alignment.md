# API Contract Alignment Notes

These are implementation notes found while reconciling the V1 API contracts with the
architecture and data model documents.

## Export endpoint method

Status: resolved in documentation.

The architecture data flow originally described exports as `POST
/api/comparisons/:id/export`. The V1 API contract defines the export endpoint as `GET
/comparisons/:id/export`.

Resolution: use `GET /api/v1/comparisons/:id/export?format=pdf|csv|xlsx`.

## Partial provider degradation

Status: needs implementation clarification before coding the controller behavior.

The API contract describes a `503` case when one cloud adapter's pricing data is
unavailable, while also requiring graceful degradation that returns the other
providers with a `warnings` field.

Before implementation, choose one precise behavior:

- Return a non-2xx response only when no provider can return pricing.
- Return `201` with `warnings` when at least one provider succeeds.
- Add `warnings?: Array<{ providerId: string; message: string }>` to
  `ComparisonResult` if partial-success responses are part of the stable API shape.
