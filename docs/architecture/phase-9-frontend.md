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
draft NWS is copied into the structured form for review and edits. The primary
summary action says `Parse & compare` while Describe is active and prices the parsed
NWS, not the stale/default form state. The Form tab can be used directly when the
user already knows the inputs.

Comparison always validates the generated NWS through `/workload/validate` before
calling `/comparisons` with `useLivePricing: false`. This keeps the frontend aligned
with the Phase 8 decision that initial live pricing requests should fail explicitly
until strict live-refresh behavior exists.

Export buttons are disabled until a comparison exists. PDF, CSV, and Excel exports
all call `/comparisons/:id/export` and download the returned Blob locally.

## Layout and accessibility

Provider order is fixed as AWS, Azure, GCP in every state. Desktop renders a dynamic
cost dashboard followed by the three provider panels as equal columns. The dashboard
summarizes lowest cost, spread, average cost, provider coverage, provider spend bars,
the cheapest provider's category mix, a decision brief, provider ranking table,
interval outlook, and cross-provider category heatmap. Mobile keeps the same provider
order, shows a sticky totals bar, stacks dashboard charts, and makes provider cards
horizontally scrollable.

The app uses native form controls, semantic regions, labelled comparison sections,
visible focus states, and reduced-motion CSS. Provider line items include aria labels
with provider, category, description, and monthly price so screen readers get the
same cost context as visual users.

Provider marks and larger provider-card logo lockups are inline SVGs for AWS, Azure,
and GCP-inspired identities. Provider cards use cloud-specific tinted surfaces and
subtitles while retaining the neutral comparison order. The palette uses
provider-inspired accents: AWS orange, Azure blue, and GCP green plus the GCP
blue/red/yellow secondary colors for chart details. These are PolyCost-owned UI
marks and color treatments, not official vendor trademarks.

## Runtime behavior

The local Docker web image serves the built app on port `3000`; the HTML shell points
the browser client at `http://localhost:3001/api/v1`. The theme is resolved before
React renders to avoid an initial flash of the wrong theme.

The anonymous frontend does not call the admin-only `/pricing/status` endpoint. Before
a comparison exists, it shows `Using cached pricing catalog`; after comparison it
shows the snapshot `pricingAsOf` timestamp returned by the API.

Before the first comparison, provider panels render as `Pending` / `Ready to compare`.
Provider cards show `Pricing unavailable` only after a comparison exists and a
specific provider failed to produce pricing.

## Verification

Phase 9 frontend tests cover the API client, NWS form mapping, theme helpers, the
structured-form comparison flow, natural-language parse flow, error rendering,
provider ordering, provider logo lockups, unavailable-provider states, dashboard
metrics, dynamic provider chart sizing, decision brief, provider ranking, interval
outlook, category heatmap, interval switching, refresh, and exports.

Browser smoke against the Docker-served app passed on desktop and mobile. Desktop
verified the initial pending state, the plain-English `Parse & compare` journey,
stable three-column provider order, enabled export controls after comparison, and no
page-level horizontal overflow. Mobile verified the sticky totals bar, collapsed
navigation, horizontal provider carousel, and no text overflow in visible controls.
