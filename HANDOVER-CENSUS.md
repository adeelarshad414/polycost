# Handover Census

Generated: 2026-07-08

Scope: PolyCost web SPA, API-backed workflows, reports, Terraform generation, theme/loading/overlay systems, and customer handover docs.

## Route And Screen Census

| Route / entry        | Screen / state                                                         | Primary API calls                                                                                            | Disposition                               |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `/`                  | First-run compare workspace, guided-form default                       | `GET /api/v1/regions`, `GET /api/v1/pricing/data-health`                                                     | Implemented                               |
| `/`                  | Natural-language input mode                                            | `POST /api/v1/nl/parse`, `POST /api/v1/comparisons`                                                          | Implemented                               |
| `/`                  | Guided form input mode                                                 | `GET /api/v1/regions`, `POST /api/v1/comparisons`                                                            | Implemented                               |
| `/`                  | Diagram upload/review mode                                             | `POST /api/v1/diagrams/parse`, `POST /api/v1/comparisons`                                                    | Implemented                               |
| `/`                  | Compare loading / parsing loading / export loading                     | Real request lifecycle plus Appendix L components                                                            | Implemented                               |
| `/`                  | Compare success / provider summary / executive analytics               | `GET /api/v1/comparisons/:id/analytics`, `GET /api/v1/comparisons/:id/pricing-evidence`                      | Implemented                               |
| `/`                  | Engineering details / line items / evidence                            | `GET /api/v1/comparisons/:id/pricing-evidence`                                                               | Implemented                               |
| `/`                  | Refresh-live action                                                    | `POST /api/v1/comparisons/:id/refresh-live`                                                                  | Implemented                               |
| `/`                  | PDF/CSV/XLSX export                                                    | `POST /api/v1/comparisons/:id/export-jobs`, `GET /api/v1/comparisons/:id/export-jobs/:jobId`, download route | Implemented                               |
| `/`                  | Shared-report creation and analytics                                   | `POST /api/v1/share-links`, `GET /api/v1/share-links/:token/analytics`                                       | Implemented                               |
| `/`                  | Budgets, alerts, exchange rates, what-if controls                      | `/budgets`, `/alerts`, `/exchange-rates`, comparison what-if endpoints                                       | Implemented                               |
| `/`                  | Workspace auth/login/register/session/team/invite/billing/SSO controls | `/auth/*`, `/teams/*`, `/billing/imports/*`                                                                  | Implemented with known product-depth gaps |
| `/`                  | Terraform generation panel                                             | `POST /api/v1/terraform/generate`, bundle download route                                                     | Implemented as starter-bundle workflow    |
| `/`                  | Inline validation, API error, denied/RBAC states                       | Error envelope from API, local form validation                                                               | Implemented                               |
| Unknown browser path | SPA fallback                                                           | Vite/app shell fallback                                                                                      | Partial: no dedicated 404 route in SPA    |

## Shared Component Census

| Component family  | Variants / states                                                                          | Disposition                                                  |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Brand/theme shell | Light, dark, system, default accent, terracotta accent                                     | Implemented                                                  |
| Button system     | primary, secondary, ghost, destructive, destructiveQuiet, link, icon; default/compact/hero | Implemented                                                  |
| Loading system    | BootSplash, SessionLoader, skeletons, ProgressBar, TaskQueue, JobToast, LiveTail           | Implemented                                                  |
| Overlay system    | Dialog, ConfirmDialog, Drawer, Popover, ToastStack, Banner                                 | Implemented; production adoption pending for some primitives |
| Charts/analytics  | provider bars, service split, trend/period summaries, risk/scenario panels                 | Implemented                                                  |
| Tables/lists      | engineering cost rows, evidence rows, history rows, billing actuals, Terraform files       | Implemented                                                  |
| Forms             | requirements, diagram import, workspace auth/team/billing, Terraform profile               | Implemented                                                  |
| Reports/exports   | PDF, CSV, Excel, evidence JSON, Terraform ZIP                                              | Implemented                                                  |

## Responsive Census

| Breakpoint                 | Evidence                                                                               | Disposition                                    |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 360-390px mobile           | Existing Playwright mobile overflow test and `docs/demo-artifacts/mobile-workflow.png` | Implemented / verified(mock)                   |
| 768px tablet               | Existing locked-breakpoint Playwright test                                             | Implemented / verified(mock)                   |
| 1440px desktop             | Existing demo artifacts and locked-breakpoint Playwright test                          | Implemented / verified(mock)                   |
| 1920px sanity              | CSS uses constrained max widths and responsive grids                                   | Partial; needs fresh screenshot capture        |
| Dark/light/terracotta      | `docs/theme-audit/2026-07-07/` and token guards                                        | Implemented / verified(mock)                   |
| 200% zoom and 320px reflow | Not freshly executed in this run                                                       | Blocked pending manual/Playwright zoom harness |

## Wiring Census

| Surface      | UI action                                     | Backend mapping                             | Disposition                         |
| ------------ | --------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| Requirements | Parse natural language                        | `POST /api/v1/nl/parse`                     | Implemented                         |
| Requirements | Parse diagram                                 | `POST /api/v1/diagrams/parse`               | Implemented                         |
| Requirements | Compare costs                                 | `POST /api/v1/comparisons`                  | Implemented                         |
| Results      | Refresh live                                  | `POST /api/v1/comparisons/:id/refresh-live` | Implemented                         |
| Reports      | Export PDF/CSV/XLSX                           | Export-job endpoints                        | Implemented                         |
| Sharing      | Create/revoke/copy/report analytics           | `/share-links` endpoints                    | Implemented                         |
| FinOps       | Budgets/alerts/exchange rates                 | `/budgets`, `/alerts`, `/exchange-rates`    | Implemented                         |
| Auth/team    | Register/login/logout/session/team/invite/SSO | `/auth/*`, `/teams/*`                       | Implemented with product-depth gaps |
| Billing      | Import/list reconciliation actuals            | `/billing/imports/*`                        | Implemented                         |
| Terraform    | Generate/download/evidence                    | `/terraform/generate`                       | Implemented starter workflow        |

## Findings Disposition

| Class          | Count | Disposition                                                                            |
| -------------- | ----: | -------------------------------------------------------------------------------------- |
| Implemented    |    35 | Covered by code/tests/docs                                                             |
| Partial        |     3 | SPA 404, 1920 screenshot, zoom/reflow harness                                          |
| Dead UI        |     0 | No silent facade action found in current census                                        |
| Orphan backend |     0 | Backend-only advanced endpoints remain documented API surfaces                         |
| Blocked        |     4 | Real cloud credentials, full axe/Lighthouse matrix, zoom harness, full auth product UX |
