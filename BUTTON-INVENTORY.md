# Button Inventory

Generated: 2026-07-08

Scope: `apps/web/src` React controls.

## Primary-button convention

Page and form surfaces use the primary action as the left-most or first action in the working area. Dialog footers use the primary action right-most. This is recorded as the app convention for future remediation.

## Shared component contract

| Component                         | Variants / roles                                                                   | Status      |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| `components/Button.tsx`           | `primary`, `secondary`, `ghost`, `destructive`, `destructiveQuiet`, `link`, `icon` | Implemented |
| `components/Button.tsx` sizes     | `default`, `compact`, `hero`                                                       | Implemented |
| `ButtonSystemPreview`             | Visual/test fixture for variants and provider badges                               | Updated     |
| `OverlayPrimitives.ConfirmDialog` | Only current intended consumer of filled destructive primary                       | Implemented |

## Button instance audit

| Surface                                                | Instance class                          | Correct pattern                 | Status     |
| ------------------------------------------------------ | --------------------------------------- | ------------------------------- | ---------- |
| App header / landing CTAs                              | Shared `Button` primary/secondary/icon  | Shared button                   | Remediated |
| Requirements summary / input clear                     | `Button destructiveQuiet`               | Quiet destructive trigger       | Remediated |
| Diagram review remove                                  | `Button destructiveQuiet`               | Quiet destructive trigger       | Remediated |
| Workspace remove / revoke                              | `Button destructiveQuiet` compact       | Quiet destructive trigger       | Remediated |
| FinOps share revoke                                    | `Button destructiveQuiet`               | Quiet destructive trigger       | Remediated |
| FinOps refresh views                                   | `Button link`                           | Link action                     | Remediated |
| Comparison history clear                               | `Button destructiveQuiet` compact       | Quiet destructive trigger       | Remediated |
| Bulk service add / remove                              | `Button secondary` / `destructiveQuiet` | Shared button                   | Remediated |
| Fatal recovery reload                                  | `Button secondary`                      | Shared button                   | Remediated |
| Persona engineering utility controls                   | Shared `Button`                         | Shared button                   | Remediated |
| Authentication mode toggle                             | Native tab buttons in segmented control | Segmented control, not CTA      | Accepted   |
| Requirement input tabs                                 | Native tab buttons                      | Tablist, not CTA                | Accepted   |
| Pricing-model and interval choices                     | Native pressed buttons                  | Segmented controls, not CTA     | Accepted   |
| Architecture templates / history rows / compute sizing | Native card buttons                     | Selectable cards                | Accepted   |
| Terraform target cloud cards                           | Native radio-card buttons               | Radiogroup card selector        | Accepted   |
| Hidden submit button                                   | `sr-only` form submit                   | Accessibility submit affordance | Accepted   |

## Guardrails

- `npm run overlay:check` verifies the overlay/button artifacts exist, the main check pipeline includes the guard, and no production source uses `window.confirm` or `window.alert`.
- Red filled destructive buttons are now reserved for destructive confirmation primaries through `ConfirmDialog`; ordinary clear/remove/revoke actions use `destructiveQuiet`.
