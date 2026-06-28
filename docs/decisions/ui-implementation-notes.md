# UI Implementation Notes

These notes capture concrete frontend decisions from `07-UI-UX-DESIGN-SYSTEM.md` so
implementation work can turn them into tests and reusable primitives.

## Resolved design decisions

- Provider order is always AWS, Azure, GCP.
- Provider colors are PolyCost-owned neutral accents, not official provider brand
  colors.
- Cheapest provider is indicated with a success badge, not by reordering or
  recoloring provider columns.
- Default theme preference is `system`, with explicit Light/Dark/System control.
- Cost figures use IBM Plex Mono with tabular numerals.
- Mobile comparison uses a horizontal three-card carousel plus sticky monthly-total
  mini bar, not a vertical stack of provider tables.

## Frontend implementation requirements

- Define design tokens as CSS variables before building screen-level components.
- Build a shared `Logo`/logomark component from the documented SVG geometry.
- Build a reusable provider comparison panel with identical dimensions and states
  across all three providers.
- Add a print stylesheet for the on-screen comparison view in addition to generated
  PDF reports.
- Add accessibility checks for visible focus, keyboard navigation, reduced motion,
  and screen-reader labels on comparison line items.

## Test targets

- Light, dark, and system theme resolution before first paint.
- Desktop three-column layout at `>= 1024px`.
- Tablet equal-column layout from `768px` to `1023px`.
- Mobile carousel below `768px`.
- No provider column reorders when a different provider is cheapest.
- Export buttons have equal visual weight for PDF, CSV, and Excel.
