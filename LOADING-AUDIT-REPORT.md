# PolyCost Loading Audit Report

Date: 2026-07-08
Branch: `codex/loading-progress-experience`
Scope: frontend loading/progress UX for app boot, workspace auth/session, navigation,
data fetches, mutations, report jobs, shared reports, and comparison-region loading.

## Verdict

PolyCost now has a canonical loading/progress layer and the main user-visible waits
are classified in `LOADING-INVENTORY.md`. The implementation favors progressive
rendering, delayed local indicators, content-shaped skeletons, real phase labels,
token-driven styling, and explicit error/failure paths.

This pass does not add backend job streaming, websocket telemetry, or provider-side
export progress percentages. Those would require API contract additions; current UI
surfaces phase/state without inventing numbers.

## Findings And Disposition

| ID                | Class             | Finding                                                                                                             | Disposition                                                                                                                | Evidence                                                                         |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| LD-WRONG-TIER-001 | Wrong tier        | Top loading bar mounted immediately for fast waits.                                                                 | Fixed with 150 ms delay and 320 ms completion hold.                                                                        | `apps/web/src/components/TopLoadingBar.tsx`                                      |
| LD-MISSING-002    | Missing treatment | Cold app boot had no designed splash primitive.                                                                     | Added delay-mounted `BootSplash`; fast boots show nothing.                                                                 | `apps/web/src/components/LoadingExperience.tsx`, `apps/web/src/App.tsx`          |
| LD-MISSING-003    | Missing treatment | Stored workspace token verification silently rendered unauthenticated controls while the session check was pending. | Added compact real-step `SessionLoader`.                                                                                   | `apps/web/src/App.tsx`                                                           |
| LD-MISSING-004    | Missing treatment | Team members/invites/SSO sync had no explicit loading or failure state.                                             | Added personalized staged loader with error path.                                                                          | `apps/web/src/App.tsx`                                                           |
| LD-WRONG-TIER-005 | Wrong tier        | Pricing evidence and comparison regions used ad-hoc spinners.                                                       | Replaced with shared `LoadingStatus` and skeleton presets.                                                                 | `apps/web/src/App.tsx`, `apps/web/src/components/PersonaComparisonWorkspace.tsx` |
| LD-WRONG-TIER-006 | Wrong tier        | Shared report route used unlabelled pulse blocks.                                                                   | Replaced with `LoadingStatus` and `Skeleton.Grid`.                                                                         | `apps/web/src/components/FinOpsFeatureLayer.tsx`                                 |
| LD-DISHONEST-007  | Honesty           | Export/refresh long-ish operations only had button spinners, no phase visibility.                                   | Added `TaskQueue` with real job phase/state and no fake percentage.                                                        | `apps/web/src/App.tsx`                                                           |
| LD-TOKEN-008      | Token             | Loading primitives could drift into hard-coded colors if implemented ad hoc.                                        | Centralized CSS uses semantic variables only.                                                                              | `apps/web/src/styles.css`                                                        |
| LD-A11Y-009       | Accessibility     | Some loading regions lacked consistent progress semantics.                                                          | Shared progressbars use `role=progressbar`, `aria-valuenow` when determinate, `aria-busy`, and polite phase announcements. | `apps/web/src/components/LoadingExperience.tsx`                                  |

## Component Set

Implemented in `apps/web/src/components/LoadingExperience.tsx`:

- `BootSplash`
- `SessionLoader`
- `Skeleton.Text`, `Skeleton.Card`, `Skeleton.Table`, `Skeleton.Chart`, `Skeleton.Grid`
- `ProgressBar`
- `LoadingStatus`
- `TaskQueue`
- `JobToast`
- `LiveTail`

The existing shared `Button` remains the canonical inline action loader.

## Verification

Commands run in this pass:

- `npm run test:unit --workspace @polycost/web -- --runInBand src/components/LoadingExperience.spec.tsx src/components/TopLoadingBar.spec.tsx`
  - Web focused: `2` suites / `7` tests.
- `npm run test:unit --workspace @polycost/web -- --runInBand src/App.spec.tsx src/api-client.spec.ts`
  - Web focused: `2` suites / `84` tests.
- `npm run format:check` passed.
- `npm run ci:lint` passed.
- `npm run loading:check` passed.
- `npm run theme:hex:check` passed.
- `npm run test:production-readiness`
  - API focused: `10` suites / `135` tests.
  - Web focused: `2` suites / `84` tests.
- `npm run ci:build` passed with the existing Vite `%VITE_API_BASE_URL%`
  placeholder warning and chunk-size warning.
- `npm run check`
  - API unit: `51` suites / `400` tests.
  - Web unit: `10` suites / `137` tests.
  - Graph validation: `300` nodes / `300` edges.
  - Pricing coverage guard: `36` frontend priced families covered.
  - Progress verification: `153` phase evidence anchors.
  - Security suppression check: `22` reviewed suppressions.
  - Database validation, DevOps, cloud, release, loading, and provider credential
    gates passed.
  - `db:validate` skipped the live `schema_migrations` check because Postgres was
    not running.
  - `cloud:check` remains documentation/config only because deployable IaC is not
    present.
  - `impeccable` skipped by documented Node 20 vs Node 24 constraint.

## Evidence Index

- Inventory: `LOADING-INVENTORY.md`
- Component tests: `apps/web/src/components/LoadingExperience.spec.tsx`
- Top bar delay tests: `apps/web/src/components/TopLoadingBar.spec.tsx`
- Shared components: `apps/web/src/components/LoadingExperience.tsx`
- Styling: `apps/web/src/styles.css`

Screenshot evidence:

- Not captured yet in this pass. The app has local Playwright coverage for locked
  breakpoints, but a dedicated dual-mode loading-state screenshot archive still needs
  either route-level fixture hooks or a loading-state showcase page.

## HUMAN_DECISION_GATE

| Gate                                       | Default applied                                                                    | Status      |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | ----------- |
| Product-specific workspace step naming     | Used concrete PolyCost workspace language: session, team directory, SSO readiness. | Implemented |
| Trust cue wording                          | Only shown when a token and verified session object exist.                         | Implemented |
| Background job progress percentages        | Omitted unless measurable; export/refresh show phase/state only.                   | Implemented |
| Dedicated loading-state screenshot archive | Deferred until a fixture/showcase route is approved or added.                      | Open        |

## Blocked

- Exact export-job percentage is blocked by API contract: the current export client
  exposes pending/running/completed/failed but not records/pages/bytes completed.
- Real boot/auth redirect timing is not measurable in the current anonymous-first SPA
  without an auth redirect route or instrumentation hook.
- Dedicated screenshots for mid/failure loading states are not captured in this pass;
  unit tests and token checks cover the component behavior, while browser smoke tests
  cover app layout.
