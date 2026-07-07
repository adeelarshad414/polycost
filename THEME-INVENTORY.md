# PolyCost Theme Inventory

Date: 2026-07-07
Scope: v2 P0 inventory for frontend theme/conformance and production-readiness
continuation.

## Stack Detection

| Item                 | Status                                      | Evidence                                                                        |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Product              | `PolyCost`                                  | `README.md`, `package.json`, `apps/web/src/brand.ts`                            |
| Frontend framework   | React + Vite + TypeScript                   | `apps/web/src/main.tsx`, `apps/web/vite.config.ts`                              |
| Styling              | Tailwind directives plus large app CSS file | `apps/web/src/styles.css`, `apps/web/tailwind.config.ts`                        |
| Theme mode support   | Implemented, needs v2 audit                 | `apps/web/src/theme.ts`, `ThemeSwitcher.tsx`, `index.html` pre-hydration script |
| Accent axis support  | Not built                                   | No `data-accent`, accent storage key, or Accent control found                   |
| Dedicated token file | Not built                                   | Raw token hex values live in `apps/web/src/styles.css`                          |
| shadcn/ui            | Not present                                 | No shadcn config or component imports found                                     |
| Router               | Single SPA route with internal anchors      | `App.tsx`, `LandingPage.tsx`; no React Router/file router present               |

## Routes / Screens

| Route / Screen              | Status      | Evidence                                              | Notes                                                                           |
| --------------------------- | ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/` landing                 | implemented | `apps/web/src/components/LandingPage.tsx`             | Contains nav, hero, provider cards, theme switcher, sign-in, start/demo actions |
| Requirements workspace      | implemented | `apps/web/src/App.tsx` `InitialHomePage`              | Guided form, paste/parse, diagram upload, clear/compare flows                   |
| Progressive comparison page | implemented | `apps/web/src/App.tsx` `ProgressiveComparisonPage`    | Executive and engineering evidence combined in one page                         |
| Workspace control center    | implemented | `apps/web/src/App.tsx` `WorkspaceControlCenter`       | Auth/session/team/invite/SSO/billing import controls                            |
| Shared report view          | implemented | `FinOpsFeatureLayer.tsx`, `SharedReportPlaceholder`   | Read-only shared comparison/report surface                                      |
| Error boundary              | implemented | `AppErrorBoundary.tsx`                                | Top-level render failure protection                                             |
| Loading/progress states     | implemented | `TopLoadingBar.tsx`, `ScrollProgressBar` in `App.tsx` | Needs v2 token audit only                                                       |

## Component Inventory

| Component / Primitive      | Status                            | Evidence                                                 |
| -------------------------- | --------------------------------- | -------------------------------------------------------- |
| Button / ProviderBadge     | implemented                       | `apps/web/src/components/Button.tsx`                     |
| ThemeSwitcher              | implemented for mode only         | `apps/web/src/components/ThemeSwitcher.tsx`              |
| TopLoadingBar              | implemented                       | `apps/web/src/components/TopLoadingBar.tsx`              |
| LandingPage                | implemented                       | `apps/web/src/components/LandingPage.tsx`                |
| PersonaComparisonWorkspace | implemented                       | `apps/web/src/components/PersonaComparisonWorkspace.tsx` |
| FinOpsFeatureLayer         | implemented                       | `apps/web/src/components/FinOpsFeatureLayer.tsx`         |
| AppErrorBoundary           | implemented                       | `apps/web/src/components/AppErrorBoundary.tsx`           |
| Charts                     | implemented via Recharts          | `apps/web/src/App.tsx` imports `BarChart`, `PieChart`    |
| Forms/tables/badges/toasts | implemented inline in SPA CSS/App | `apps/web/src/App.tsx`, `apps/web/src/styles.css`        |

## P0 Findings

| ID         | Severity | Finding                                                                                               | Evidence                                           | Disposition                          |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| P0-FMT-001 | P0       | Local full check failed because newly added orchestrator docs were not Prettier-formatted             | `npm run check` failed at `format:check`           | Fixed in this run before continuing  |
| P0-DOC-001 | P1       | Requested v2 entrypoint path is `docs/design/*`, but docs were committed under `docs/orchestrators/*` | `find docs -maxdepth 3 -type f`                    | In progress; move to `docs/design/*` |
| TKN-001    | P1       | Token hex values are embedded in `styles.css` instead of a dedicated guarded token file               | `rg -n "#[0-9A-Fa-f]{3,8}" apps/web/src`           | In progress                          |
| TKN-002    | P1       | v2 terracotta accent axis is absent                                                                   | No `data-accent`, no accent storage key/control    | In progress                          |
| TKN-003    | P1       | CI has no raw-hex guard for frontend source                                                           | `.github/workflows/ci.yml`, `package.json` scripts | In progress                          |
| UI-001     | P2       | v2 dual-mode and terracotta screenshot archive is absent                                              | No `docs/theme-audit/<date>/` directory            | Pending P4                           |
| OPS-001    | Blocked  | Hosted GitHub Actions fails before runner allocation                                                  | Job `85608851518`, `runner_id: 0`, `steps: []`     | External CI infra blocker            |

## Initial Board Classification

| v2 Phase                             | Status                                 |
| ------------------------------------ | -------------------------------------- |
| P0 Discover + continuation sync      | in-progress                            |
| P1 Token layer + Appearance settings | in-progress                            |
| P2 Frontend conformance              | claimed-complete (unverified)          |
| P3 Backend production-readiness      | partially verified                     |
| P4 Verification archive              | not-started                            |
| P5 Git/PR lifecycle                  | blocked by hosted CI runner allocation |
| P6 Production-readiness report       | not-started                            |
