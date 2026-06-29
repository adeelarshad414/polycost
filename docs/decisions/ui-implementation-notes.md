# UI Implementation Notes

These notes capture concrete frontend decisions from `07-UI-UX-DESIGN-SYSTEM.md`.
Phase 9 implemented these decisions in the Vite/React web app; see
`docs/architecture/phase-9-frontend.md` for module boundaries and verification.

## Resolved design decisions

- Provider order is always AWS, Azure, GCP.
- Provider colors are PolyCost-owned AWS/Azure/GCP-inspired accents, not official
  provider brand assets or trademark claims.
- Cheapest provider is indicated with a success badge, not by reordering or
  recoloring provider columns.
- Default theme preference is `system`, with explicit Light/Dark/System control.
- Cost figures use IBM Plex Mono with tabular numerals.
- Mobile comparison uses a horizontal three-card carousel plus sticky monthly-total
  mini bar, not a vertical stack of provider tables.

## Frontend implementation requirements

- Define design tokens as CSS variables before building screen-level components:
  complete.
- Build a shared `Logo`/logomark component from the documented SVG geometry:
  complete.
- Build a reusable provider comparison panel with identical dimensions and states
  across all three providers: complete.
- Build a dynamic dashboard with summary metrics, provider spend bars, and category
  mix charts above the detailed provider panels: complete.
- Add decision-support surfaces for ranking, deltas, interval outlook, approximation
  counts, and cross-provider category comparison: complete.
- Use inline SVG provider marks in buttons/charts/cards so the comparison is
  scannable without relying only on text: complete.
- Use larger provider-card SVG logo lockups and provider-tinted card surfaces for
  AWS, Azure, and GCP while keeping the dashboard itself cloud-neutral: complete.
- Apply professional product polish across all screen surfaces, including the app
  shell, sticky header, comparison toolbar, form controls, dashboard panels, charts,
  tables, provider cards, hover/focus states, and responsive breakpoints: complete.
- Upgrade the structured Form tab from a flat input grid into a sectioned workload
  configurator with live summary chips, suffix inputs, switch-style service toggles,
  and editable storage/database detail fields: complete.
- Add a catalog-backed Cloud services section that exposes AWS/Azure/GCP equivalents
  across major service families, labels each family as Priced/Mapped/Roadmap, and
  carries selected family IDs through NWS `sourceTraceability`: complete.
- Add a print stylesheet for the on-screen comparison view in addition to generated
  PDF reports: complete.
- Add accessibility checks for visible focus, keyboard navigation, reduced motion,
  and screen-reader labels on comparison line items: complete.

## Test targets

- Light, dark, and system theme resolution before first paint: covered.
- Desktop three-column layout at `>= 1024px`: browser-smoked.
- Tablet equal-column layout from `768px` to `1023px`: covered by responsive CSS.
- Mobile carousel below `768px`: browser-smoked.
- Professional UI polish at desktop `1440x1000` and mobile `390x844`: browser-smoked
  with no page overflow, visible text overflow, unintended wide elements, or console
  errors.
- Advanced structured form at desktop `1440x1000` and mobile `390x844`:
  browser-smoked with no form overflow, no form-wide elements, successful Form-mode
  comparison, and enabled exports.
- Service catalog selector: unit-covered for UI rendering, selected family
  traceability, and NWS round-trip behavior; browser-smoked with desktop/mobile
  layout checks.
- No provider column reorders when a different provider is cheapest: covered.
- Export buttons have equal visual weight for PDF, CSV, and Excel: implemented and
  covered through app interaction tests.
