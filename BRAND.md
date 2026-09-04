# PolyCost Brand Guidelines

PolyCost's brand system is intentionally cloud-neutral. AWS, Azure, and GCP colors are
provider accents, not the application's primary action palette.

## Logo

The logomark is three ascending rounded vertical bars:

- Orange bar: AWS reference
- Blue bar: Azure reference
- Green bar: GCP reference

Use the generated assets in `apps/web/public/brand/`:

- `polycost-logomark.svg` for mark-only usage
- `polycost-lockup.svg` for the primary horizontal lockup on light surfaces
- `polycost-lockup-dark.svg` for dark surfaces
- `polycost-lockup-stacked.svg` for square or stacked placements
- `polycost-lockup-monochrome.svg` for watermark, print, or single-color contexts
- `favicon-16.svg`, `favicon-32.svg`, `favicon-48.svg`, `apple-touch-icon.svg`, and
  `icon-maskable-512.svg` for icon surfaces

Do not redraw the logo, recolor the provider bars, compress the lockup horizontally, or
pair the logomark with alternate wordmark typography.

## Color Tokens

Brand provider accent tokens live in `apps/web/src/styles.css` and are exposed through
Tailwind in the `@theme` block at the top of `apps/web/src/styles.css`. (Tailwind 4 moved theme configuration out of `tailwind.config.ts` and into CSS.)

| Token                 | Value     | Use                                         |
| --------------------- | --------- | ------------------------------------------- |
| `--brand-orange`      | `#D85A30` | AWS/logo/provider accent                    |
| `--brand-blue`        | `#378ADD` | Azure/logo/provider accent                  |
| `--brand-green`       | `#1D9E75` | GCP/logo/provider accent                    |
| `--brand-orange-dark` | `#E2783F` | AWS/logo/provider accent on dark surfaces   |
| `--brand-blue-dark`   | `#5BA3E8` | Azure/logo/provider accent on dark surfaces |
| `--brand-green-dark`  | `#3FBE8E` | GCP/logo/provider accent on dark surfaces   |

Use provider colors for comparison charts, provider cards, provider marks, and small
provider-specific accents only. Primary buttons, links, active navigation, focus rings,
and generic UI states use the neutral action aliases:

- `--pc-action-primary`
- `--pc-action-primary-hover`
- `--pc-action-primary-soft`

Do not turn all CTAs orange, blue, or green.

## Typography

Keep the existing project typography:

- Display: `var(--pc-font-display)`
- Body: `var(--pc-font-body)`
- Mono/data: `var(--pc-font-mono)`

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
