# PolyCost Brand Guidelines

PolyCost's brand system is intentionally cloud-neutral. AWS, Azure, and GCP colors are
provider accents, not the application's primary action palette.

## Color Tokens: PolyCost Aurora

All colour, type, radius, elevation, gradient and motion tokens live in
`apps/web/src/styles/tokens.css`, which is the only file allowed to contain raw
colour values (`npm run theme:hex:check` enforces this, including `rgb()`/`hsl()`).
Components read semantic names only. `stylelint` (part of `npm run lint`) rejects
literal colours, font sizes, font weights and radii elsewhere.

Themes: **Light**, **Dark** and **System** (the default, which follows the OS setting).
Dark values are declared under both `@media (prefers-color-scheme: dark)` and
`:root[data-theme='dark']`, so the page is correct before scripts run and the
toggle always wins. There is one brand accent; the terracotta alternate was removed.

### Brand and gradients

| Token                                   | Light           | Dark          | Use                                 |
| --------------------------------------- | --------------- | ------------- | ----------------------------------- |
| `--brand-primary`                       | `#4F46E5`       | `#818CF8`     | Primary buttons, links, focus       |
| `--brand-violet`                        | `#7C3AED`       | `#A78BFA`     | Gradient midpoint                   |
| `--brand-magenta`                       | `#DB2777`       | `#F472B6`     | Gradient end (decorative only)      |
| `--brand-cyan`                          | `#0891B2`       | `#22D3EE`     | Highlight spark (decorative only)   |
| `--grad-cta`                            | indigo → violet | same, lighter | The only gradient that carries text |
| `--grad-brand-line`, `--grad-hero-mesh` | multi-stop      | multi-stop    | Hairlines and hero backgrounds      |

### Provider identity

Use provider colours only to identify a provider: chart series, provider cards,
provider marks. Never use them for categories, gradients, rails or decoration.
The vendors' published fills (`#FF9900 / #027DFF / #34A853`) fail colour-blind
separation (orange and green collapse under protanopia), so the tokens are
re-stepped values that pass a CVD validator in both themes.

| Token              | Light fill | Dark fill | Text-safe ink (light / dark) |
| ------------------ | ---------- | --------- | ---------------------------- |
| `--provider-aws`   | `#E98A15`  | `#D07A1A` | `#9A4F00` / `#F5A54A`        |
| `--provider-azure` | `#3B6FE8`  | `#5B86F0` | `#1D4ED8` / `#8AB0FF`        |
| `--provider-gcp`   | `#0F7A43`  | `#0F8F6E` | `#0B6B3A` / `#4FD1A1`        |

Text that names a provider uses the `-ink` token; the fills are for bars, chips and tints.

### Status

`--success`, `--warning`, `--danger`, `--info` and `--estimate` are text-safe
(4.5:1 or better on every surface, asserted in `tokens-contrast.spec.ts`), and
each has a `-soft` background. Always pair a status colour with an icon or a label.

## Logo

The logomark is three ascending rounded vertical bars in the provider fills
(AWS, Azure, GCP). The SVGs in `apps/web/public/brand/` use the Aurora values above.

## Typography

Fonts are self-hosted through `@fontsource` packages imported in `apps/web/src/main.tsx`:

- Display: Sora Variable (`var(--font-display)`), weights 600/700
- Body/UI: Inter Variable (`var(--font-body)`), weights 400/500/600
- Mono: JetBrains Mono 500 (`var(--font-mono)`), for code and IDs

Sizes come from `--fs-12 … --fs-56` and weights from `--fw-regular|medium|semibold|bold`.
Do not introduce a new font family unless the design system is explicitly revised.

## Final Copy

Use these strings exactly:

- Product name: `PolyCost`
- Primary tagline: `Multi-cloud cost clarity, in one place.`
- Hero subhead: `Compare AWS, Azure, and GCP costs — instantly.`

In the React app, import copy constants from `apps/web/src/brand.ts` instead of repeating
these strings in components.

## Metadata

The web document title and social metadata live in `apps/web/index.html`.

Current title:

`PolyCost — Multi-cloud cost clarity, in one place.`

Current description:

`Multi-cloud cost clarity, in one place. Compare AWS, Azure, and GCP costs — instantly.`
