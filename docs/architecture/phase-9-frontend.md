# Phase 9 Frontend

Phase 9 turns the V1 contracts into a usable browser workflow. The web app is still a
single Vite/React surface, but it now owns the end-user loop: describe or enter a
workload, validate and compare it through `/api/v1`, inspect AWS/Azure/GCP costs, and
export the finished comparison.

## Module boundaries

- `apps/web/src/App.tsx` owns screen composition, transient UI state, API action
  orchestration, provider cards, interval controls, exports, and status messages.
- `apps/web/src/api-client.ts` is the browser-side API boundary. It normalizes the
  configured API base URL, sends the Phase 8 request shapes, and maps API error
  envelopes into `PolyCostApiError`.
- `apps/web/src/workload.ts` maps the editable structured form to and from the
  Normalized Workload Specification. Parsed natural-language drafts are converted
  into the same form state before comparison.
- `apps/web/src/theme.ts` resolves and persists Light/Dark/System choices.
- `apps/web/src/types.ts` keeps the frontend copies of the V1 API and NWS response
  shapes used by the UI.
- `apps/web/src/styles.css` contains the Phase 9 design tokens, layout rules,
  responsive behavior, focus states, reduced-motion rules, and print stylesheet.

## User flow

The Describe tab posts natural-language input to `/workload/parse`. On success, the
draft NWS is copied into the structured form for review and edits. The Form tab can
be used directly when the parser is not configured or the user already knows the
inputs.

Comparison always validates the generated NWS through `/workload/validate` before
calling `/comparisons` with `useLivePricing: false`. This keeps the frontend aligned
with the Phase 8 decision that initial live pricing requests should fail explicitly
until strict live-refresh behavior exists.

Export buttons are disabled until a comparison exists. PDF, CSV, and Excel exports
all call `/comparisons/:id/export` and download the returned Blob locally.

## Layout and accessibility

Provider order is fixed as AWS, Azure, GCP in every state. Desktop renders the three
provider panels as equal columns. Mobile keeps the same provider order, shows a
sticky totals bar, and makes provider cards horizontally scrollable.

The app uses native form controls, semantic regions, labelled comparison sections,
visible focus states, and reduced-motion CSS. Provider line items include aria labels
with provider, category, description, and monthly price so screen readers get the
same cost context as visual users.

## Runtime behavior

The local Docker web image serves the built app on port `3000`; the HTML shell points
the browser client at `http://localhost:3001/api/v1`. The theme is resolved before
React renders to avoid an initial flash of the wrong theme.

`GET /pricing/status` is optional from the UI's perspective. The Phase 8 endpoint is
admin-protected, so ordinary browser sessions show `Pricing status restricted` until
a frontend-safe status contract or token strategy is added.

Fresh local stacks can still have an empty pricing catalog. In that state the UI
renders the backend `PRICING_UNAVAILABLE` message and keeps all three provider panels
visible as unavailable.

## Verification

Phase 9 frontend tests cover the API client, NWS form mapping, theme helpers, the
structured-form comparison flow, natural-language parse flow, error rendering,
provider ordering, unavailable-provider states, interval switching, refresh, and
exports.

Browser smoke against the Docker-served app passed on desktop and mobile. Desktop
verified stable three-column provider order and no page-level horizontal overflow.
Mobile verified the sticky totals bar, collapsed navigation, horizontal provider
carousel, and no text overflow in visible controls.
