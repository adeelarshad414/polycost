# Claude Partner Network (CPN) — Portal Design System

> **Purpose of this file:** Single source of truth for replicating this portal from scratch **or** updating/upgrading an existing frontend, using **Tailwind CSS**, while keeping the color scheme locked. Layout, components, and UX may evolve — **the palette in §2 is immutable.**
>
> **How to use as a prompt:** Paste this file into any build/refactor task with the instruction:
> *"Follow `cpn-design-system.md`. Colors in §2 are non-negotiable brand tokens. You may improve layout/UX/components, but every color must resolve to a token defined here — no new hex values."*

---

## 1. Theme Overview (what the UI "is")

- **Personality:** Warm, editorial, low-noise enterprise portal. A single terracotta brand hue does all the accent work against warm neutrals. Nothing else competes for attention.
- **Model:** Classic app shell — fixed brand-colored left sidebar (collapsible), light top bar, warm off-white canvas, white content cards.
- **Accent discipline:** Terracotta appears in exactly four roles: sidebar surface, primary buttons, text links, and attention states (banner, highlighted card). Everything else is neutral.
- **Depth strategy:** Almost flat. Hierarchy comes from surface color steps (canvas → card → card-header strip) and 1px borders, not shadows. Corners are softly rounded (8–12px), never pill-shaped except badges.
- **Density:** Generous. Large page headings, roomy card padding, wide whitespace below content blocks. This is a "few things, clearly presented" portal, not a dense dashboard.

---

## 2. Color Tokens (IMMUTABLE)

All values sampled from the reference screenshots. Every color in the app must map to one of these tokens.

### 2.1 Brand / Terracotta scale

| Token | Hex | Usage |
|---|---|---|
| `brand-600` | `#C96442` | Primary button hover, pressed states, focused link |
| `brand-500` **(PRIMARY)** | `#D97757` | Sidebar background, primary buttons, banner background, links, active icons, focus rings |
| `brand-400` | `#E08D6F` | Sidebar active-item background, hover tint on brand surfaces |
| `brand-100` | `#FBE4DB` | Selected/highlighted card header strip |
| `brand-50` | `#FDF3EE` | Highlighted card body background, subtle brand tint surfaces |

### 2.2 Warm neutrals (surfaces)

| Token | Hex | Usage |
|---|---|---|
| `surface-canvas` | `#F5F4EF` | App/page background |
| `surface-card` | `#FFFFFF` | Cards, top bar, inputs, popovers |
| `surface-muted` | `#EAE8E2` | Neutral card header strip, skeletons, disabled fills |
| `border-default` | `#E4E2DB` | Card borders, dividers, input borders |
| `border-strong` | `#D6D3CB` | Badge/pill borders, hover borders |

### 2.3 Text / ink

| Token | Hex | Usage |
|---|---|---|
| `ink-900` | `#26241F` | Page headings, card titles, brand wordmark |
| `ink-600` | `#5C5A54` | Body text, descriptions, placeholder-adjacent copy |
| `ink-400` | `#8B8880` | Placeholders, tertiary meta text, inactive icons |
| `on-brand` | `#FFFFFF` | All text/icons sitting on `brand-500`/`brand-600` surfaces |

### 2.4 Hard rules

- **No new hex values.** Any needed shade must be one of the above (opacity modifiers of these tokens are allowed, e.g. `bg-white/15` on brand surfaces).
- Terracotta is **never** used for body text or large text blocks — only interactive/attention elements.
- White text **only** on `brand-500/600`. Never place `brand-500` text on `brand-*` surfaces (contrast failure).
- No blues, greens, purples anywhere in chrome. If status semantics (success/error) are later required, they must be added as a separate, explicitly approved token group — do not improvise.

---

## 3. Typography

Geometric humanist sans throughout (reference renders match **Poppins**; **Jost** or **Inter** acceptable fallbacks — pick one and use it everywhere).

```
font-sans: "Poppins", "Inter", system-ui, sans-serif;
```

| Role | Spec | Example |
|---|---|---|
| Page title | `text-[28px] font-semibold text-ink-900 tracking-tight` | "Welcome back, TKXEL (Partner)!" |
| Page subtitle | `text-sm text-ink-600 mt-1` | "Everything you need is accessible…" |
| Section title (in-card) | `text-base font-semibold text-ink-900` | "Quick Access" |
| Section subtitle | `text-sm text-ink-600` | "Easily explore your portal features." |
| Card title | `text-sm font-semibold text-ink-900` | "New flow to complete" |
| Card body | `text-sm text-ink-600` | "Complete the flow assigned to you" |
| Nav item | `text-[15px] font-medium text-on-brand` | "Customer Stories" |
| Button label | `text-sm font-medium` | "Open flow" |
| Badge/meta | `text-sm`, key `font-normal`, value `font-semibold` | "Current Tier: **Registered**" |

No serif display faces, no all-caps labels, no letter-spaced eyebrows — headings are sentence case and quiet.

---

## 4. Tailwind Setup

### 4.1 CSS variables (theme-agnostic, brand config-driven — matches the portfolio convention)

```css
:root {
  --brand-600: #C96442;
  --brand-500: #D97757;
  --brand-400: #E08D6F;
  --brand-100: #FBE4DB;
  --brand-50:  #FDF3EE;

  --surface-canvas: #F5F4EF;
  --surface-card:   #FFFFFF;
  --surface-muted:  #EAE8E2;

  --border-default: #E4E2DB;
  --border-strong:  #D6D3CB;

  --ink-900: #26241F;
  --ink-600: #5C5A54;
  --ink-400: #8B8880;
  --on-brand: #FFFFFF;
}
```

### 4.2 `tailwind.config.js`

```js
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "var(--brand-50)",
          100: "var(--brand-100)",
          400: "var(--brand-400)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
        },
        surface: {
          canvas: "var(--surface-canvas)",
          card:   "var(--surface-card)",
          muted:  "var(--surface-muted)",
        },
        line: {
          DEFAULT: "var(--border-default)",
          strong:  "var(--border-strong)",
        },
        ink: {
          900: "var(--ink-900)",
          600: "var(--ink-600)",
          400: "var(--ink-400)",
        },
      },
      fontFamily: {
        sans: ['"Poppins"', '"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "10px",
        btn:  "8px",
      },
    },
  },
};
```

> CI guard (portfolio convention): grep for raw hex values in components — only `tokens.css` / config may contain hex. `git grep -nE '#[0-9A-Fa-f]{3,8}' src/ ':!src/styles/tokens.css'` must return empty.

---

## 5. App Shell Layout

```
┌──────┬──────────────────────────────────────────────────────────┐
│      │ TOP BAR (white, 64px, border-b)                          │
│ SIDE ├──────────────────────────────────────────────────────────┤
│ BAR  │ [ANNOUNCEMENT BANNER — brand-500, dismissible, optional] │
│brand ├──────────────────────────────────────────────────────────┤
│ 500  │ CONTENT (surface-canvas)                                 │
│      │   px-10 pt-10 · max-w none (full-bleed cards)            │
│fixed │   Page title block → 80px gap → content cards            │
└──────┴──────────────────────────────────────────────────────────┘
```

- Sidebar is **fixed full-height**; top bar and content sit to its right (`ml-[sidebar-width]`).
- Content scrolls independently; sidebar and top bar do not.
- Banner sits **below** the top bar, above content, spanning the content column only.

### 5.1 Sidebar — expanded (240px)

- `w-60 bg-brand-500 text-on-brand flex flex-col fixed inset-y-0`
- **Header (h-16):** small white "Claude Partner Network" wordmark left, collapse chevron `‹` right.
- **Nav (pt-6 px-3, gap-1):** items = icon (20px, stroke) + label.
  - Item: `flex items-center gap-3 h-11 px-3 rounded-btn text-on-brand/90`
  - Hover: `bg-white/10`
  - **Active:** `bg-brand-400 text-on-brand font-medium` (lighter tint block, full-width rounded)
- **Footer (mt-auto, p-4):** user name (2-line wrap, `text-sm font-semibold`), email truncated (`text-xs text-on-brand/80 truncate`), logout icon right-aligned.
- Nav order in reference: Home, Content, Flows, Customer Stories, Partner Academy.

### 5.2 Sidebar — collapsed (76px)

- `w-[76px]`; icons only, centered; expand chevron `›` in header; logout icon pinned bottom.
- Labels appear as tooltips on hover. State persists (localStorage or user pref).

### 5.3 Top bar (h-16)

`bg-surface-card border-b border-line flex items-center gap-4 px-6`

Left → right:
1. **Brand lockup** (Claude starburst mark + "Claude Partner Network", `text-ink-900`) — shown here even when sidebar shows its own wordmark; keep both for continuity.
2. Separator dot + **tenant name**: "TKXEL (Partner)" `text-ink-600 text-lg`.
3. `flex-1` spacer, then **search input**: `w-60 h-10 rounded-btn border border-line bg-surface-card pl-9 text-sm placeholder:text-ink-400`, magnifier icon absolute-left.
4. **PAM AI button** (AI assistant entry): `h-10 px-4 rounded-btn border border-line bg-surface-card text-brand-500 font-medium flex items-center gap-2` with sparkle icon — *outlined-white with brand text*, deliberately not a filled button.
5. **Tier badge**: `h-10 px-3 rounded-btn border border-line flex items-center gap-2 text-sm` — shield icon + "Current Tier:" (`text-ink-600`) + "Registered" (`font-semibold text-ink-900`).
6. **Bell icon** then **gear icon**: `text-ink-600`, 22px, plain (no button chrome), hover `text-ink-900`.

### 5.4 Announcement banner (dismissible)

`bg-brand-500 text-on-brand h-12 flex items-center gap-3 px-6`

- Leading: small `bg-white/20 rounded-md p-1.5` icon chip (diamond/spark glyph).
- Message: `font-semibold text-sm` — "New flow available!"
- Right: **inverted action button** `bg-white text-ink-900 h-8 px-4 rounded-btn text-sm font-medium shadow-sm` ("View Flow") + close `✕` icon button (`text-on-brand`, hover `bg-white/10 rounded`).
- When dismissed, content moves up — banner is not reserved space (see screenshots 3–4).

---

## 6. Components

### 6.1 Buttons

| Variant | Recipe | Used for |
|---|---|---|
| **Primary** | `bg-brand-500 hover:bg-brand-600 text-on-brand h-10 px-4 rounded-btn text-sm font-medium` | "Open flow" — the one main action per card/page |
| **Inverted** (on brand surfaces) | `bg-white text-ink-900 hover:bg-brand-50 h-8 px-4 rounded-btn text-sm font-medium` | Banner "View Flow" |
| **Outline / chrome** | `bg-surface-card border border-line text-brand-500 h-10 px-4 rounded-btn` | "PAM AI" |
| **Text link action** | `text-brand-500 hover:text-brand-600 text-sm font-medium` (no underline at rest) | "Open content" |
| Focus (all) | `focus-visible:ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-canvas` | — |

One primary button per card maximum. Secondary actions demote to text links.

### 6.2 Cards

**Container card (section wrapper):**
`bg-surface-card border border-line rounded-card p-6` — holds a section title + subtitle, then a grid of child cards (`grid gap-4 md:grid-cols-2 xl:grid-cols-3`, child min-width ≈ 320px).

**Feature card — neutral state** (e.g. "Content"):
- `border border-line rounded-card overflow-hidden bg-surface-card`
- **Header strip:** `h-8 bg-surface-muted` with a small 18px glyph chip bottom-left overlapping into body.
- Body `p-4 pt-3`: title, description, then action (text link) after `mt-4`.

**Feature card — highlighted/attention state** (e.g. "New flow to complete"):
- `border border-brand-500 rounded-card bg-brand-50`
- **Header strip:** `h-8 bg-brand-100`, glyph chip is a filled `bg-brand-500 text-on-brand rounded-md` square.
- Action is a **primary button**, not a link — the highlight state always pairs tinted surface + brand border + filled button. Never mix (e.g. brand border with gray strip).

### 6.3 Inputs

`h-10 rounded-btn border border-line bg-surface-card text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500` — no filled/gray input style exists in this theme.

### 6.4 Badges / pills

Chrome badges are **bordered, not filled**: `border border-line rounded-btn px-3 h-10 inline-flex items-center gap-2 text-sm bg-surface-card`. Reserve `brand-50/100` fills for content-level status chips only.

### 6.5 Icons

Single stroke-icon set app-wide (Lucide fits the reference), 20–22px, `stroke-[1.75]`. On brand surfaces: white. In chrome: `text-ink-600`. Never mix filled and outline styles in the same region.

---

## 7. States & Interaction

- **Hover:** surfaces get one-step tint (`white/10` on brand, `brand-50` on white); links/buttons darken to `brand-600`. No scale/translate effects.
- **Active nav:** `brand-400` block — the only "selected" treatment in the shell.
- **Focus:** always visible `ring-2 ring-brand-500 ring-offset-2`; never remove outlines.
- **Disabled:** `bg-surface-muted text-ink-400 border-line cursor-not-allowed`.
- **Empty states:** ink-600 sentence + one primary action; no illustrations required.
- **Motion:** `transition-colors duration-150` only; sidebar collapse `transition-[width] duration-200`; respect `prefers-reduced-motion`.

## 8. Spacing & Radius Scale

- Base unit 4px; common steps: 8 / 12 / 16 / 24 / 40.
- Page gutter: `px-10`; title block to first card: `mt-16`–`mt-20` (reference shows very generous ~80px).
- Radius: cards 10px, buttons/inputs/badges 8px, icon chips 6px. Nothing fully rounded except avatars (none in reference).
- Shadows: effectively none — only the banner's inverted button carries `shadow-sm`.

---

## 9. Rules for Updating an Existing UI (read before any refactor task)

1. **Step 0 reality-check:** inventory the existing screens; classify each element as *conforms / off-token / missing* before writing code. Never assume a component exists.
2. **Colors are frozen.** Map every existing color to the nearest §2 token; if no reasonable mapping exists, flag it in the run report — do not invent a shade.
3. **Layout is upgradeable.** You may restructure grids, add pages, improve responsive behavior, introduce new components — provided they compose from §6 primitives and §2 tokens.
4. **Accent budget:** after any change, terracotta should still only appear as: sidebar, primary buttons, links, attention/highlight states, focus rings. If a diff adds brand color anywhere else, revert it.
5. **Additive-only tokens:** new tokens (e.g. status colors, dark mode) are appended with justification, never redefinitions of existing ones.
6. **Evidence over assertion:** visual changes ship with before/after screenshots; contrast-check any new text/surface pair (all §2 ink-on-surface pairs pass WCAG AA at their specified sizes; `on-brand` on `brand-500` passes for ≥14px medium text).

---

## 10. Copy-Paste Skeleton (reference implementation)

```html
<div class="min-h-screen bg-surface-canvas font-sans">
  <!-- Sidebar -->
  <aside class="fixed inset-y-0 left-0 w-60 bg-brand-500 text-white flex flex-col">
    <div class="h-16 flex items-center justify-between px-4">
      <span class="text-xs font-semibold leading-tight">Claude<br/>Partner Network</span>
      <button class="p-1 rounded hover:bg-white/10">‹</button>
    </div>
    <nav class="px-3 pt-6 space-y-1 text-[15px]">
      <a class="flex items-center gap-3 h-11 px-3 rounded-btn bg-brand-400 font-medium">Home</a>
      <a class="flex items-center gap-3 h-11 px-3 rounded-btn text-white/90 hover:bg-white/10">Content</a>
      <a class="flex items-center gap-3 h-11 px-3 rounded-btn text-white/90 hover:bg-white/10">Flows</a>
    </nav>
    <div class="mt-auto p-4 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm font-semibold leading-tight">Muhammad Adeel Arshad</p>
        <p class="text-xs text-white/80 truncate">adeel.arshad@tkxel.c…</p>
      </div>
      <button class="p-1.5 rounded hover:bg-white/10 shrink-0">⎋</button>
    </div>
  </aside>

  <div class="ml-60">
    <!-- Top bar -->
    <header class="h-16 bg-surface-card border-b border-line flex items-center gap-4 px-6">
      <span class="font-semibold text-ink-900">✳ Claude Partner Network</span>
      <span class="text-ink-400">·</span>
      <span class="text-ink-600 text-lg">TKXEL (Partner)</span>
      <div class="flex-1"></div>
      <input class="w-60 h-10 rounded-btn border border-line pl-9 text-sm placeholder:text-ink-400" placeholder="Search"/>
      <button class="h-10 px-4 rounded-btn border border-line text-brand-500 font-medium">✦ PAM AI</button>
      <span class="h-10 px-3 rounded-btn border border-line inline-flex items-center gap-2 text-sm">
        🛡 <span class="text-ink-600">Current Tier:</span> <b class="text-ink-900">Registered</b>
      </span>
    </header>

    <!-- Banner -->
    <div class="h-12 bg-brand-500 text-white flex items-center gap-3 px-6">
      <span class="bg-white/20 rounded-md p-1.5 text-xs">◆</span>
      <span class="text-sm font-semibold">New flow available!</span>
      <div class="flex-1"></div>
      <button class="h-8 px-4 rounded-btn bg-white text-ink-900 text-sm font-medium shadow-sm">View Flow</button>
      <button class="p-1.5 rounded hover:bg-white/10">✕</button>
    </div>

    <!-- Content -->
    <main class="px-10 pt-10">
      <h1 class="text-[28px] font-semibold text-ink-900 tracking-tight">Welcome back, TKXEL (Partner)!</h1>
      <p class="text-sm text-ink-600 mt-1">Everything you need is accessible and manageable through your personal portal.</p>

      <section class="mt-20 bg-surface-card border border-line rounded-card p-6">
        <h2 class="text-base font-semibold text-ink-900">Quick Access</h2>
        <p class="text-sm text-ink-600">Easily explore your portal features.</p>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-5">
          <!-- Neutral card -->
          <div class="border border-line rounded-card overflow-hidden">
            <div class="h-8 bg-surface-muted"></div>
            <div class="p-4 pt-3">
              <h3 class="text-sm font-semibold text-ink-900">Content</h3>
              <p class="text-sm text-ink-600">Check out the content to read</p>
              <button class="mt-4 text-sm font-medium text-brand-500 hover:text-brand-600">Open content</button>
            </div>
          </div>
          <!-- Highlighted card -->
          <div class="border border-brand-500 rounded-card overflow-hidden bg-brand-50">
            <div class="h-8 bg-brand-100 relative">
              <span class="absolute left-3 -bottom-2 w-6 h-6 bg-brand-500 text-white rounded-md grid place-items-center text-xs">◆</span>
            </div>
            <div class="p-4 pt-4">
              <h3 class="text-sm font-semibold text-ink-900">New flow to complete</h3>
              <p class="text-sm text-ink-600">Complete the flow assigned to you</p>
              <button class="mt-4 h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium">Open flow</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</div>
```

---

*End of spec. Any question this file doesn't answer should be resolved in favor of: neutral surface, terracotta accent, 1px border, 8–10px radius, no shadow.*
