# Browser Audit - 2026-07-08

Status: passed

## Scope

This artifact captures fresh Playwright browser evidence for the production web build:
desktop executive/engineering views, 320px reflow, and 200% zoom-equivalent reflow.

## Tool Coverage

- Lighthouse: dependency-unavailable
  - The lighthouse package is not installed; Playwright-native navigation and resource metrics were captured instead.
- axe: dependency-unavailable
  - The axe-core package is not installed; Playwright-native accessibility heuristics were captured instead.

## Scenarios

- Desktop executive and engineering flow: passed
  - Viewport: 1440x1000
  - Zoom equivalent: native
  - Screenshots: `desktop-executive.png`, `desktop-engineering.png`
- WCAG 320px reflow: passed
  - Viewport: 320x720
  - Zoom equivalent: native
  - Screenshots: `reflow-320-executive.png`, `reflow-320-engineering.png`
- 200% zoom equivalent reflow: passed
  - Viewport: 640x900
  - Zoom equivalent: 200
  - Screenshots: `zoom-200-executive.png`, `zoom-200-engineering.png`

## Checks

- Horizontal overflow must stay at or below 1px.
- Visible interactive controls must have accessible names.
- Visible images must include an `alt` attribute.
- A visible main landmark and h1 must exist.
- Keyboard tab traversal must avoid dead ends and visible focus loss.
- Browser console and page errors must remain clean.

## Failures

- None

## Machine Evidence

See `browser-audit.json`.
