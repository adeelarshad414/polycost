# Overlay Inventory

Generated: 2026-07-08

Scope: `apps/web/src` React surfaces.

## Summary

| Component / surface                  | Trigger                     | Message class                            | Current surface                | Correct surface        | Status                          |
| ------------------------------------ | --------------------------- | ---------------------------------------- | ------------------------------ | ---------------------- | ------------------------------- |
| `OverlayPrimitives.Dialog`           | Shared UI primitive         | Required decision or focused task        | Canonical modal dialog         | Modal dialog           | Implemented                     |
| `OverlayPrimitives.ConfirmDialog`    | Shared UI primitive         | Confirm / destructive confirm            | Canonical modal preset         | Modal dialog           | Implemented                     |
| `OverlayPrimitives.Drawer`           | Shared UI primitive         | Secondary detail workflow                | Canonical side panel           | Drawer                 | Implemented                     |
| `OverlayPrimitives.Popover`          | Shared UI primitive         | Anchored contextual detail               | Canonical light-dismiss panel  | Popover                | Implemented                     |
| `OverlayPrimitives.ToastStack`       | Shared UI primitive         | Operation outcome                        | Canonical toast stack, max two | Toast                  | Implemented                     |
| `OverlayPrimitives.Banner`           | Shared UI primitive         | Persistent announcement / degraded state | Canonical banner               | Banner                 | Implemented                     |
| `AppErrorBoundary` fatal state       | React render failure        | Blocking application recovery            | Full-page alert                | Full-page takeover     | Correct; shared button now used |
| `DataHealthSummary`                  | Pricing health response     | Degraded data / freshness                | Inline banner strip            | Banner / inline status | Correct; non-blocking           |
| `FinOpsFeatureLayer` budget warnings | Budget evaluator            | Persistent budget warning                | Inline alert blocks            | Banner / inline status | Correct; non-blocking           |
| `PersonaComparisonWorkspace` errors  | Comparison API failure      | Recoverable API error                    | Inline alert                   | Inline alert           | Correct                         |
| Shared report loading/error states   | Shared-link route load      | Loading or recoverable error             | Inline status / alert          | Inline status / alert  | Correct                         |
| `ThemeSwitcher`                      | Settings appearance control | Preference selection                     | Segmented control              | Popover not required   | Correct                         |
| `window.confirm/window.alert`        | N/A                         | Legacy interruption                      | None found                     | Eliminated             | Verified                        |

## Notes

- No auto-opening modal exists in the current app, so no `OV-HIJACK` behavior was found.
- No stacked modal flow exists today; canonical primitives now make future stacking easier to detect.
- The existing app primarily uses inline alerts and persistent strips, which is appropriate for non-blocking pricing, budget, and data-health messages.
- Announcement frequency caps are implemented at the primitive/documentation level. No promotional announcement modal currently ships, so there is no runtime announcement cap to wire yet.
