# PolyCost - UI/UX Design System

Companion to `00-MASTER-PROMPT.md`. This is the visual and interaction contract for
PolyCost's frontend. Treat it like the NWS schema in `04-DATA-MODEL.md`: a foundation
other work builds on, not a draft to casually override per screen.

Read this before building any frontend component.

## 1. Design thesis

PolyCost's value proposition is fair, parallel comparison. The product is not "a
cloud calculator"; it is a referee. Every visual decision serves one idea: three
providers judged on equal footing, with cost as the central truth.

Consequences:

1. No provider may visually dominate. AWS orange, Azure blue, and GCP's multicolor
   branding are not used as product accent colors. PolyCost uses its own neutral,
   equally weighted provider palette.
2. The three-column parallel layout is the signature motif across the dashboard,
   loading states, empty states, marketing page, and comparison screen.

## 2. Brand identity and logo

### 2.1 Logo concept

Primary mark: a balanced scale/beam rendered as three vertical bars of equal height
sitting on one horizontal baseline. It should read as "three equal columns resting on
one foundation" rather than a literal courtroom scale.

Geometry:

- Canvas: `32x32` viewBox
- Three bars, each 6px wide and 20px tall
- 4px gutter between bars
- Baseline: 28px wide, 2.5px tall, positioned at `y=26`
- Corner radius on bars: 1.5px

```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="3"  y="6"  width="6" height="20" rx="1.5" fill="var(--pc-provider-aws)"/>
  <rect x="13" y="6"  width="6" height="20" rx="1.5" fill="var(--pc-provider-azure)"/>
  <rect x="23" y="6"  width="6" height="20" rx="1.5" fill="var(--pc-provider-gcp)"/>
  <rect x="2"  y="26" width="28" height="2.5" rx="1.25" fill="var(--pc-ink-900)"/>
</svg>
```

Wordmark: `PolyCost` set in the display face, weight 700. `Poly` uses
`--pc-ink-900` in light mode or `--pc-ink-50` in dark mode. `Cost` uses
`--pc-brand-accent`. This is the only place a single accent color is used for brand
emphasis.

### 2.2 Logo usage rules

- Minimum clear space around the logomark equals one bar width on all sides.
- Never recolor the three bars to anything other than the three provider accent
  colors.
- On dark backgrounds, the baseline swaps from `--pc-ink-900` to `--pc-ink-50`; the
  colored bars do not change beyond theme-token definitions.
- Favicon uses the logomark only, no wordmark.

## 3. Color system

### 3.1 Base palette

Use a cool slate scale, not warm gray or cream.

```css
:root {
  --pc-ink-50:  #F7F8FA;
  --pc-ink-100: #EEF1F5;
  --pc-ink-200: #DDE3EA;
  --pc-ink-300: #C2CAD6;
  --pc-ink-400: #97A2B5;
  --pc-ink-500: #6B7790;
  --pc-ink-600: #4D596F;
  --pc-ink-700: #353E50;
  --pc-ink-800: #212733;
  --pc-ink-900: #12151C;

  --pc-brand-accent:       #4F6BFF;
  --pc-brand-accent-hover: #3D57E8;
  --pc-brand-accent-soft:  #E8ECFF;

  --pc-success:      #1A9E6B;
  --pc-success-soft: #E3F7EE;
  --pc-warning:      #B7791F;
  --pc-warning-soft: #FBF0DD;
  --pc-error:        #D14343;
  --pc-error-soft:   #FBE9E9;
  --pc-info:         #2F7FE0;
  --pc-info-soft:    #E7F1FD;
}
```

### 3.2 Provider accent colors

Provider colors are deliberately not the official provider brand colors.

```css
:root {
  --pc-provider-aws:      #C26B2E;
  --pc-provider-azure:    #3C6E91;
  --pc-provider-gcp:      #5B8C5A;

  --pc-provider-aws-soft:   #F3E6D8;
  --pc-provider-azure-soft: #DDEAF1;
  --pc-provider-gcp-soft:   #E3EEE2;
}
```

Rules:

- Provider color assignment is alphabetical: AWS, Azure, GCP.
- Provider columns never reorder based on price.
- The cheapest signal uses a separate success badge, not provider recoloring.

### 3.3 Light mode

```css
:root[data-theme="light"] {
  --pc-bg-canvas:    var(--pc-ink-50);
  --pc-bg-surface:   #FFFFFF;
  --pc-bg-surface-2: var(--pc-ink-100);
  --pc-border:       var(--pc-ink-200);
  --pc-text-primary:   var(--pc-ink-900);
  --pc-text-secondary: var(--pc-ink-600);
  --pc-text-tertiary:  var(--pc-ink-400);
}
```

### 3.4 Dark mode

Dark mode is tuned independently, not produced by an inverted filter.

```css
:root[data-theme="dark"] {
  --pc-bg-canvas:    var(--pc-ink-900);
  --pc-bg-surface:   var(--pc-ink-800);
  --pc-bg-surface-2: var(--pc-ink-700);
  --pc-border:       var(--pc-ink-700);
  --pc-text-primary:   var(--pc-ink-50);
  --pc-text-secondary: var(--pc-ink-300);
  --pc-text-tertiary:  var(--pc-ink-500);

  --pc-provider-aws:   #D9885A;
  --pc-provider-azure: #6FA0BE;
  --pc-provider-gcp:   #7FAE7E;

  --pc-provider-aws-soft:   #2E2319;
  --pc-provider-azure-soft: #1B2A33;
  --pc-provider-gcp-soft:   #1F2B1E;

  --pc-brand-accent:       #7C92FF;
  --pc-brand-accent-hover: #95A7FF;
  --pc-brand-accent-soft:  #1E2240;
}
```

### 3.5 Theme resolution

Default theme setting is `system`, resolved via `prefers-color-scheme`, with explicit
user override stored client-side. The theme control is a three-way toggle: Light,
Dark, System.

Resolution order:

1. Explicit user choice in local storage or cookie
2. `prefers-color-scheme`
3. Light

### 3.6 Contrast requirements

- Text/background pairs meet WCAG 2.1 AA minimum.
- Provider accent text must meet AA against light and dark surfaces. If not, use the
  accent only as background, border, or chart fill, with text in `--pc-text-primary`.
- Focus indicators never rely on color alone.

## 4. Typography

### 4.1 Type families

| Role | Typeface | Reason |
| --- | --- | --- |
| Display / headings | Sora | Geometric, warm, distinct at large sizes |
| Body / UI text | Inter | Neutral and highly legible |
| Numeric / cost data | IBM Plex Mono | Tabular figures keep cost columns scannable |

All three fonts are open-source/libre-licensed.

```css
:root {
  --pc-font-display: 'Sora', system-ui, sans-serif;
  --pc-font-body: 'Inter', system-ui, sans-serif;
  --pc-font-mono: 'IBM Plex Mono', 'SF Mono', Consolas, monospace;
}
```

### 4.2 Type scale

```css
:root {
  --pc-text-xs:   0.75rem;
  --pc-text-sm:   0.875rem;
  --pc-text-base: 1rem;
  --pc-text-lg:   1.25rem;
  --pc-text-xl:   1.5625rem;
  --pc-text-2xl:  1.953rem;
  --pc-text-3xl:  2.441rem;
}
```

### 4.3 Numeric typography

- All cost figures use `--pc-font-mono` and tabular numerals.
- Currency symbols are visually de-emphasized relative to the figure.
- Negative deltas use `--pc-error`; positive savings deltas use `--pc-success`.
- Base cost figures stay `--pc-text-primary`, never colored by value.

### 4.4 Line height and measure

- Body text: line-height 1.5, max measure 72ch.
- UI labels and buttons: line-height 1.2.
- Headings: line-height 1.15.

## 5. Layout and grid

### 5.1 Base grid

Use an 8px base unit for spacing, with a 4px half-step.

```css
:root {
  --pc-space-0-5: 4px;
  --pc-space-1: 8px;
  --pc-space-2: 16px;
  --pc-space-3: 24px;
  --pc-space-4: 32px;
  --pc-space-6: 48px;
  --pc-space-8: 64px;
  --pc-space-12: 96px;
}
```

Use a 12-column responsive grid for general layout. The comparison view itself is a
fixed 3-column grid because it must always show exactly three equal providers.

### 5.2 Breakpoints

| Token | Width | Target |
| --- | --- | --- |
| `--bp-sm` | 480px | Large phones |
| `--bp-md` | 768px | Tablets |
| `--bp-lg` | 1024px | Small laptops |
| `--bp-xl` | 1280px | Desktops |
| `--bp-2xl` | 1536px | Large desktops |

### 5.3 Three-column responsive behavior

| Viewport | Layout |
| --- | --- |
| `>= --bp-lg` | Three side-by-side equal columns |
| `--bp-md` to `--bp-lg` | Three side-by-side narrower columns; truncate long line-item descriptions with tooltip-on-tap |
| `< --bp-md` | Horizontally swipeable carousel of three full-width provider cards |

On mobile, include a persistent dot/tab indicator for AWS, Azure, and GCP plus a
sticky mini-comparison bar showing the three monthly totals. Do not use a vertical
stack of three full provider tables on mobile, because it would imply ranking by
scroll position.

### 5.4 Dashboard layout

```text
Header: Logo | Nav | Theme toggle | future account area
Input zone: NL textarea OR structured form tabs
Pricing freshness strip: Pricing last updated
Three equal provider columns: AWS | Azure | GCP
Interval toggle: Daily | Weekly | Monthly | Quarterly | Yearly
Export bar: PDF | CSV | Excel | Refresh live
```

## 6. Core components

### 6.1 Buttons

| Variant | Use case | Style |
| --- | --- | --- |
| Primary | Main CTA | Solid `--pc-brand-accent`, white text, weight 600, 8px radius |
| Secondary | Supporting actions | `--pc-bg-surface`, `--pc-border`, `--pc-text-primary` |
| Tertiary / ghost | Low-emphasis actions | Transparent, text-only, `--pc-text-secondary` |
| Destructive | Delete/clear actions | `--pc-error` border and text, solid fill only on confirm |
| Export buttons | PDF/CSV/Excel | Secondary style plus format icon, equal visual weight |

Button states: default, hover, active/pressed, disabled, loading, focus.

```css
.pc-button {
  height: 44px;
  padding: 0 var(--pc-space-3);
  border-radius: 8px;
  font-family: var(--pc-font-body);
  font-weight: 600;
  font-size: var(--pc-text-sm);
  transition: background-color 120ms ease, transform 80ms ease;
}
```

### 6.2 Dropdowns and select controls

- Use custom-styled native `<select>` for simple cases such as region and export
  format.
- Use a custom combobox only for genuinely long searchable lists, built on a proven
  headless pattern.
- Dropdown panels use `--pc-bg-surface`, `--pc-border`, 4px trigger gap, max-height
  with internal scroll past 8 visible items, and a subtle shadow.

### 6.3 Radio groups and checkboxes

- Use radio buttons for mutually exclusive choices.
- Use checkboxes for independent toggles.
- Selected radio uses `--pc-brand-accent` with a 2px ring offset.
- The cheapest provider indicator is a small inline badge using
  `--pc-success-soft` and `--pc-success`, with the label "Lowest cost".

### 6.4 Form inputs

- Minimum height 44px, 12px horizontal padding, 8px radius.
- Default border: `--pc-border`.
- Focus border: `--pc-brand-accent` with subtle `--pc-brand-accent-soft` glow.
- Inline validation uses error border, icon, and message below the field.
- The natural-language textarea has min-height 120px and an example placeholder:
  "e.g. A web app for 5,000 daily users with a Postgres database and file storage for
  uploads".

### 6.5 Tables

- Numeric columns are right-aligned and use `--pc-font-mono`.
- Text columns are left-aligned and use `--pc-font-body`.
- Row hover uses `--pc-bg-surface-2`.
- Approximate line items use an approximately-equal prefix, subtle dotted underline,
  and tooltip explaining "nearest equivalent - see methodology".
- Approximate line items are not errors and should not use loud warning color.

### 6.6 Cards

- Used for provider comparison panels and dashboard summary tiles.
- 12px radius.
- 1px `--pc-border`.
- `--pc-bg-surface` fill.
- Provider cards have a 4px top border in the provider accent color, applied
  identically across all providers.

### 6.7 Charts

- Use grouped bar charts for daily, weekly, monthly, quarterly, and yearly
  comparison.
- Use three bars per interval in consistent AWS, Azure, GCP order.
- Axis labels use `--pc-text-secondary`.
- Gridlines use low-opacity `--pc-border`.
- No 3D effects or gradient fills.

## 7. Imagery and iconography

### 7.1 Icon set

- Line icons, 1.5px stroke, 24x24 base grid.
- Use filled icons only for status dots or the single cheapest success badge.
- Cloud/service icons are custom simple line icons, not provider-official icon sets.

### 7.2 Illustrations and empty states

- Empty state uses a simple line illustration of three equal bars.
- Error states use the same line-art vocabulary.
- Product UI uses SVG illustrations, single-color `--pc-text-tertiary`.
- No photography in the product UI.

### 7.3 SVG implementation

- Inline SVG, not icon fonts.
- Use `currentColor` and CSS variables for theming.
- Meaningful standalone SVGs get `role="img"` and `aria-label`.
- Decorative SVGs get `aria-hidden="true"`.

## 8. Accessibility and focus states

- Every interactive element has a visible focus indicator: 2px
  `--pc-brand-accent` outline with 2px offset.
- Do not remove outline without replacement.
- Full keyboard operability is required.
- Comparison line items must be individually screen-reader accessible with provider,
  category, description, and value in that order.
- Respect `prefers-reduced-motion`.
- Color is never the only signal.
- Aim for AAA contrast on primary cost figures.

## 9. Cross-device and cross-browser standards

### 9.1 Touch targets

Interactive elements on touch viewports need a minimum 44x44px hit area.

### 9.2 Responsive SVG

All SVGs use `viewBox` with no fixed `width` or `height` attributes in markup. Scale
via CSS.

### 9.3 Browser support

- Last two versions of Chrome, Firefox, Safari, and Edge.
- No IE11 support.
- CSS custom properties are used throughout; no fallback layer required.
- Test dark mode specifically in Safari.
- Test the mobile carousel on iOS Safari and Chrome Android.

### 9.4 Print stylesheet

The on-screen comparison view needs a dedicated print stylesheet separate from the
generated PDF report. Ctrl+P should produce a readable printout with no buttons or
nav chrome, full-width single-column provider stacking, `--pc-ink-900` text, and no
background colors/images.

### 9.5 Performance budget

- First comparison render: target under 200ms from cached-pricing API response to
  painted three-column view.
- Theme switch: instant.
- Prevent flash of wrong theme by resolving theme before first paint.

## 10. Component state checklist

Every button, input, dropdown, card, and table row must have applicable states
explicitly designed and implemented:

- Default
- Hover
- Focus
- Active/pressed
- Disabled
- Loading
- Error
- Empty

No component is done if an applicable state is skipped.
