# Overlay Audit Report

Generated: 2026-07-08

## Scope

Audited `apps/web/src` for modals, dialogs, drawers, popovers, toasts, banners, alert surfaces, `window.confirm/window.alert`, and button variants. This pass focused on production UI consistency, accessibility primitives, and token compliance.

## Findings

| ID                     | Severity | Finding                                                                                           | Disposition | Evidence                                                                                                                                                             |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OV-MISSING-001`       | Medium   | No canonical shared overlay primitives existed for future modal/drawer/popover/toast/banner work. | Fixed       | Added `apps/web/src/components/OverlayPrimitives.tsx` and tests.                                                                                                     |
| `OV-A11Y-002`          | Medium   | Future dialogs had no shared focus-trap / return-focus / inert contract.                          | Fixed       | `Dialog` and `Drawer` now use `role="dialog"`, `aria-modal`, focus trapping, scroll lock, sibling `aria-hidden` + `inert`, ESC where safe, and trigger focus return. |
| `OV-WRONG-SURFACE-003` | Low      | App had many inline alert/status blocks but no surface taxonomy recorded.                         | Documented  | `OVERLAY-INVENTORY.md` classifies current inline banners/alerts as correct non-blocking surfaces.                                                                    |
| `BT-VARIANT-004`       | Medium   | The shared button system lacked link, icon, destructive-quiet, and size variants.                 | Fixed       | `Button.tsx`, `Button.spec.tsx`, and `styles.css` now include canonical variants and sizes.                                                                          |
| `BT-VARIANT-005`       | Medium   | Clear/remove/revoke actions used filled destructive styling outside destructive confirmation.     | Fixed       | Converted row-level and clear/revoke actions to `destructiveQuiet`. Filled destructive remains for destructive confirm primary only.                                 |
| `BT-A11Y-006`          | Low      | Error-boundary reload and landing menu button bypassed shared button semantics.                   | Fixed       | `AppErrorBoundary` and `LandingPage` now use shared `Button`.                                                                                                        |
| `OV-LEGACY-007`        | Low      | Need an automated guard against reintroducing `window.confirm/window.alert`.                      | Fixed       | Added `scripts/overlay-button-check.mjs` and wired `npm run overlay:check` into `npm run check` and release readiness.                                               |

## Keyboard/focus verification

- `Dialog` open moves focus into the dialog.
- `Tab` cycles inside the dialog.
- `Escape` closes dismissible dialogs and returns focus to the trigger.
- Destructive confirmation starts focus on Cancel and requires typed confirmation when configured.
- Toast and banner dismiss buttons are keyboard reachable and named.

Automated coverage: `apps/web/src/components/OverlayPrimitives.spec.tsx`.

## Token/theme verification

- New overlay and button styles use semantic CSS variables from the existing token system.
- No new raw hex colors were added outside `apps/web/src/styles/tokens.css`.
- New overlay surfaces are neutral; brand/status color is restricted to primary actions, focus/link treatment, toast/banner accent edges, and destructive confirmation primary.

## Blocked

- No current production flow opens a modal, drawer, popover, or toast. The primitives are verified through focused component tests; full end-user screenshot evidence needs the first real product flow using each primitive or a dedicated showcase route.
- Announcement frequency persistence is not wired to a runtime announcement because the app currently has no promotional/announcement modal or toast queue feature.
- Type-to-confirm is available in `ConfirmDialog`, but existing account/team deletion flows are still inline forms; migrating those to dialogs should happen with a product-flow decision rather than silently changing account deletion UX in this pass.

## HUMAN_DECISION_GATE Register

| Gate                               | Default used                                       | Reason                                                                         |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Primary-button position convention | Page/form primary first; dialog primary right-most | Matches current app working surfaces while following dialog anatomy.           |
| Announcement modal policy          | No announcement modal                              | The least interruptive surface wins unless the user must decide immediately.   |
| Existing account deletion flow     | Keep inline typed confirmation                     | Avoids changing an auth/account safety flow without a broader account UX pass. |

## Verification commands

- `npm run overlay:check`
- `npm run test:unit --workspace @polycost/web -- --runInBand src/components/Button.spec.tsx src/components/OverlayPrimitives.spec.tsx`
- `npm run theme:hex:check`
- `npm run ci:lint`
- `npm run release:check`
