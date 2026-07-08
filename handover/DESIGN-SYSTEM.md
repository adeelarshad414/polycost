# Design System Handover

## Brand

- Product: PolyCost.
- Logo: three ascending bars plus PolyCost wordmark under `apps/web/public/brand/`.
- Accent providers: AWS orange, Azure blue, GCP green are accents only, not page-wide themes.
- Primary app accent: PolyCost brand violet with terracotta alternate accent.

## Tokens

Canonical tokens live in `apps/web/src/styles/tokens.css`.

| Axis       | Values               | Notes                                           |
| ---------- | -------------------- | ----------------------------------------------- |
| Theme      | system, light, dark  | Theme choice persists in local storage          |
| Accent     | default, terracotta  | Appearance controls expose both                 |
| Surfaces   | canvas, card, raised | Overlay/card surfaces stay neutral              |
| Status     | ok, warn, crit, info | RAG colors are status-only                      |
| Typography | display, body, mono  | Numeric/evidence surfaces use mono where useful |

## Shared UI Components

| Component                    | Usage rule                                                                  |
| ---------------------------- | --------------------------------------------------------------------------- |
| `Button`                     | One primary per surface; destructive fill only in destructive confirmations |
| `ProviderBadge`              | Labels provider context without pretending cloud logos are endorsements     |
| `TopLoadingBar`              | Page-level request navigation/progress only                                 |
| `LoadingExperience`          | Boot/session/skeleton/task queue/loading states                             |
| `OverlayPrimitives`          | Dialog, confirm, drawer, popover, toast, banner contracts                   |
| `ThemeSwitcher`              | Appearance mode/accent control                                              |
| `PersonaComparisonWorkspace` | Executive and engineering comparison analytics                              |
| `FinOpsFeatureLayer`         | Budgets, alerts, exchange, sharing, reports, pricing models                 |

## Interaction Rules

- Buttons: 40px minimum target; icon buttons require `aria-label`.
- Loading: no fake percentages; use phase labels unless exact progress exists.
- Overlays: no stacked modals; focus moves in, traps, and returns.
- Responsive: page-level horizontal overflow is a failure except intentional table regions.
- Motion: restrained 120-200ms transform/opacity; reduced-motion respected.

## Guard Commands

```bash
npm run theme:hex:check
npm run loading:check
npm run overlay:check
npm run handover:check
```
