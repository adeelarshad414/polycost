# UNIVERSAL UI THEME ORCHESTRATOR — Find → Audit → Update (Goal Run)

**Applies to:** Postura · PolyCost · Lumen · Costalyx · Vecta
**Run mode:** Fully autonomous goal run. No mid-run approval checkpoints. Single end-of-run report. Conventional commits. Push to remote on completion.
**Companion file:** `cpn-design-system.md` (structural reference — app shell, component anatomy, accent discipline). This file adds the portfolio-wide dark-first system and per-product brand packs.

---

## 0. MISSION

Bring every screen and every component of the target application into conformance with:

1. The **shared portfolio design system** (§2) — dark-first surfaces, typography, spacing, component anatomy, accent discipline (identical structure to the CPN reference).
2. The **product's own brand pack** (§3) — each tool has exactly one brand accent; all five packs share the same token *shape* so components are portable across products.

The run is a **find → audit → update** loop: discover every screen/component, audit against this spec, remediate, verify, report. The run is complete only when the Definition of Done (§9) is satisfied or every remaining item is in the Blocked section.

---

## 1. AUTONOMY CONTRACT (non-negotiable)

- **Step 0 reality-check first.** Before touching code, classify every screen/component as `implemented / not yet built / blocked`. Never assume a surface exists without verification.
- **Evidence over assertion.** Every finding carries evidence (file path + line, screenshot, or computed-style dump). No evidence → labeled `speculative`, never asserted.
- **Regression floor is sacred.** All currently-green suites (unit, API, E2E, Playwright) must remain green. Theme work is presentational; if a test breaks, the fix is in the theme change, not the test — unless the test hard-codes a color, in which case the test is updated to assert **tokens, not hex**, and this is logged.
- **Additive-only tokens.** New tokens may be appended with justification. Existing token names are never redefined or repurposed. Locked design decisions are never quietly overridden — scope tensions are resolved in this document or logged as `HUMAN_DECISION_GATE`.
- **No secrets, no placeholders asserted as real.** Anything unverifiable (brand-hue final approval, external font licenses, trademark-dependent brand assets for Vecta/Lumen) → `HUMAN_DECISION_GATE`. Dummy values → `DUMMY-VALUES.md` as `CHANGE_ME_DEV_ONLY_*`.
- **`verified (mock)` ≠ `verified`.** Visual checks done against storybook/dummy data are marked `verified (mock)`.
- **Mandatory Blocked section** in the final report, even if empty.

---

## 2. SHARED PORTFOLIO DESIGN SYSTEM (all five products)

Structure is inherited 1:1 from the CPN reference (`cpn-design-system.md` §5–§8): fixed collapsible sidebar → top bar → optional announcement banner → canvas with cards; flat depth via surface steps + 1px borders; radii 8–10px; one accent doing all the work. Only the *palette base* differs: the portfolio is **dark-first**.

### 2.1 Neutral tokens (identical across all products — IMMUTABLE)

| Token | Hex | Usage |
|---|---|---|
| `surface-canvas` | `#0B0E14` | App/page background |
| `surface-card` | `#141824` | Cards, top bar, sidebar base*, inputs, popovers |
| `surface-raised` | `#1B2130` | Card header strips, hover rows, table headers, skeletons |
| `border-default` | `#232A3B` | Card borders, dividers, input borders |
| `border-strong` | `#2F3850` | Badge borders, hover borders, focused table rows |
| `ink-900` | `#EDEFF5` | Headings, primary text |
| `ink-600` | `#9AA1B2` | Body text, descriptions |
| `ink-400` | `#646C80` | Placeholders, tertiary meta, inactive icons |
| `on-brand` | `#0B0E14` or `#FFFFFF` | Per brand pack (§3) — whichever passes AA on `brand-500` |

*Sidebar note: unlike CPN's brand-filled sidebar, the dark-first shell uses `surface-card` sidebar with a **brand-500 active-item block and a 3px brand left rail** — the brand identifies the product without flooding a huge surface. This is a locked adaptation of the CPN pattern for dark mode.

### 2.2 Typography (identical across all products)

- UI: **Inter** (`font-sans`)
- Numeric / telemetry / code / IDs / costs / metrics: **JetBrains Mono** (`font-mono`) — mandatory on every numeric surface (cost figures, latency, counts, resource IDs).
- Scale identical to CPN §3; sentence case; no all-caps eyebrows.

### 2.3 Reserved semantic colors (NEVER brand, NEVER decorative)

| Group | Tokens | Rule |
|---|---|---|
| RAG status | `status-ok #3FB68B` · `status-warn #F59E0B` · `status-crit #E5484D` | Status semantics only (health, severity, budget breach, SLO). Never used as accents, chart series defaults, or decoration. |
| Provider accents | AWS `#D85A30` · Azure `#378ADD` · GCP `#1D9E75` | Provider identification only (chips, chart series keyed to a provider, logos). Accent-only — never button fills or large backgrounds. |

**Collision guard:** no product brand hue may be visually confusable with RAG or provider tokens *in the same component class*. Brand color never conveys status; status color never decorates.

### 2.4 Token architecture (config-driven, CI-enforced)

- All colors live in `src/styles/tokens.css` (CSS variables) + `tailwind.config` references — **components contain zero raw hex**.
- CI guard (add to every repo's pipeline if absent):
  `git grep -nE '#[0-9A-Fa-f]{3,8}' -- 'src' ':!src/styles/tokens.css' ':!**/tokens*.ts'` → must return empty.
- The Tailwind config is identical across all five repos except the `--brand-*` variable values → components are copy-portable between products.

```css
/* tokens.css — same file shape in every repo; only §3 brand block differs */
:root {
  --surface-canvas:#0B0E14; --surface-card:#141824; --surface-raised:#1B2130;
  --border-default:#232A3B; --border-strong:#2F3850;
  --ink-900:#EDEFF5; --ink-600:#9AA1B2; --ink-400:#646C80;
  --status-ok:#3FB68B; --status-warn:#F59E0B; --status-crit:#E5484D;
  --aws:#D85A30; --azure:#378ADD; --gcp:#1D9E75;
  /* --brand-* injected from the product's brand pack (§3) */
}
```

```js
// tailwind.config.js — extend.colors (identical in every repo)
colors: {
  brand:{50:"var(--brand-50)",100:"var(--brand-100)",400:"var(--brand-400)",500:"var(--brand-500)",600:"var(--brand-600)"},
  surface:{canvas:"var(--surface-canvas)",card:"var(--surface-card)",raised:"var(--surface-raised)"},
  line:{DEFAULT:"var(--border-default)",strong:"var(--border-strong)"},
  ink:{900:"var(--ink-900)",600:"var(--ink-600)",400:"var(--ink-400)"},
  status:{ok:"var(--status-ok)",warn:"var(--status-warn)",crit:"var(--status-crit)"},
  provider:{aws:"var(--aws)",azure:"var(--azure)",gcp:"var(--gcp)"},
}
```

### 2.5 shadcn/ui mapping (PolyCost, Costalyx, and any shadcn-based frontend)

Map shadcn CSS variables to tokens — never let shadcn defaults leak:

```
--background → surface-canvas   --card/--popover → surface-card
--muted → surface-raised        --border/--input → border-default
--foreground → ink-900          --muted-foreground → ink-600
--primary → brand-500           --primary-foreground → on-brand
--ring → brand-500              --destructive → status-crit
--accent → surface-raised       --accent-foreground → ink-900
--radius → 0.5rem (8px; cards 10px via component class)
```

### 2.6 Accent budget (identical to CPN rule — audit-enforced)

Brand color may appear **only** as: sidebar active item + left rail, primary buttons, text links, focus rings, attention/highlight states (banner, highlighted card, "new" chips), selected states, and single-series charts where no semantic/provider mapping applies. Anywhere else = finding.

---

## 3. PER-PRODUCT BRAND PACKS

Each pack is the **same 5-step shape** as the CPN terracotta scale: `600` (hover/pressed) · `500` (primary) · `400` (active-nav tint) · `100` (highlight strip — rendered as solid on light, as `brand-500/18%` alpha on dark) · `50` (highlight wash — `brand-500/8%` alpha on dark). On dark surfaces, always prefer the alpha forms of 100/50.

Hue choices follow the CPN discipline (one warm, confident, mid-saturation accent per tool) and were selected for product semantics + mutual distinctness + non-collision with RAG/provider tokens. **Final hue sign-off = `HUMAN_DECISION_GATE` per product** (record, don't wait).

| Product | Identity rationale | `600` | `500` (primary) | `400` | `on-brand` |
|---|---|---|---|---|---|
| **Postura** (CSPM) | Trust/guardian → indigo; unmistakably "security", far from Azure blue's hue/saturation | `#5566E0` | `#6B7CF5` | `#8B99F8` | `#0B0E14` |
| **PolyCost** (AI cost intel) | AI-native → violet; reads "intelligence", distinct from Postura's indigo | `#8F5FE0` | `#A879F0` | `#BD95F4` | `#0B0E14` |
| **Lumen** (observability) | Light/spectra → luminous cyan; "signal" without touching GCP green or Azure blue | `#2BA9BA` | `#3BC4D6` | `#63D2E0` | `#0B0E14` |
| **Costalyx** (FinOps) | Currency/value → gold; deliberately darker & warmer than `status-warn` amber and never used in status position | `#C08A2E` | `#D9A63B` | `#E2B95F` | `#0B0E14` |
| **Vecta** (migration intel) 🔒 | Transit Fuchsia — journey/transit; only unused hue family in the portfolio | `#C026D3` | `#D946EF` | `#E879F9` | `#0B0E14` |

🔒 Vecta is **locked by the product owner** and carries a secondary hue: Vector Cyan `#22D0EE`, permitted only in the cyan→fuchsia source→target brand gradient and motion/transit elements — never in accent-budget positions. Full pack, gradient tokens, and naming fallback (Migrata) are defined in `master-production-readiness-orchestrator-v2.md` §3.1, which supersedes this table for Vecta.

Per-repo injection (only block that differs between repos) — additionally, every repo appends the universal **Terracotta accent theme** block (user-selectable via Settings → Appearance; see `master-production-readiness-orchestrator-v2.md` §3.3):

```css
/* POSTURA */  :root{--brand-600:#5566E0;--brand-500:#6B7CF5;--brand-400:#8B99F8;--brand-100:rgba(107,124,245,.18);--brand-50:rgba(107,124,245,.08);--on-brand:#0B0E14;}
/* POLYCOST */ :root{--brand-600:#8F5FE0;--brand-500:#A879F0;--brand-400:#BD95F4;--brand-100:rgba(168,121,240,.18);--brand-50:rgba(168,121,240,.08);--on-brand:#0B0E14;}
/* LUMEN */    :root{--brand-600:#2BA9BA;--brand-500:#3BC4D6;--brand-400:#63D2E0;--brand-100:rgba(59,196,214,.18);--brand-50:rgba(59,196,214,.08);--on-brand:#0B0E14;}
/* COSTALYX */ :root{--brand-600:#C08A2E;--brand-500:#D9A63B;--brand-400:#E2B95F;--brand-100:rgba(217,166,59,.18);--brand-50:rgba(217,166,59,.08);--on-brand:#0B0E14;}
/* VECTA */    :root{--brand-600:#C026D3;--brand-500:#D946EF;--brand-400:#E879F9;--brand-100:rgba(217,70,239,.18);--brand-50:rgba(217,70,239,.08);--on-brand:#0B0E14;--vector-cyan:#22D0EE;--brand-gradient:linear-gradient(90deg,var(--vector-cyan) 0%,var(--brand-500) 100%);}
```

### 3.1 Product-specific surface rules (append-only)

- **Postura:** finding severity uses RAG (`crit/warn` + `ink-400` for info) — **never** brand indigo. Compliance-score rings: brand for the track, RAG for the value zone.
- **PolyCost / Costalyx:** cost deltas: increase `status-crit`, decrease `status-ok`, forecast/neutral `brand-500`. Budget-breach chips are RAG only. Provider breakdown charts use provider accents; multi-series non-provider charts use brand + `ink` tints — never RAG as a series color. Costalyx gold vs `status-warn`: gold appears only in chrome/accent positions, amber only in status chips/thresholds — an amber-looking element in a button/link position or a gold element in a status-chip position is automatically a finding.
- **Lumen:** telemetry values, units, timestamps = JetBrains Mono, no exceptions. Trace/span colors may use a categorical ramp (documented in-repo, appended to tokens) but SLO/alert states are RAG only.
- **Vecta:** the cyan→fuchsia gradient (source = cyan, target = fuchsia) is the brand signature — same gradient for every migration direction, relabeled; used on brand surfaces, migration-path graph edges, wave/progress flows only, never buttons/text/status. 7Rs decision chips get a categorical ramp appended to tokens (7 stable hues, fuchsia and vector-cyan excluded); graph node colors documented in tokens file; assessment status is strictly RAG (blockers / warnings / migration-ready); WAF/CAF coverage states are RAG.

---

## 4. GOAL RUN — PHASES

### Phase 0 — DISCOVER (reality-check)
1. Enumerate every route/page (router config, file-based routes, nav definitions) and every component (`src/components`, `src/pages`, design-system folders, storybook if present).
2. Build `THEME-INVENTORY.md`: table of `route/component · status(implemented/not built/blocked) · evidence(path)`.
3. Detect stack (Tailwind version, shadcn presence, CSS modules, styled-components remnants) — remediation strategy depends on it. Non-Tailwind styling found = finding with migration note, not silent rewrite.

### Phase 1 — TOKEN AUDIT
1. Verify/create `tokens.css` + Tailwind mapping (§2.4) + shadcn mapping (§2.5) + this product's brand block (§3).
2. Run the hex-grep. Every raw hex outside tokens = finding `TKN-###` with file:line evidence.
3. Find off-system Tailwind palette usage (`bg-slate-*`, `text-blue-*`, `bg-red-500` as status, etc.) — each = finding with proposed token mapping.

### Phase 2 — SCREEN & COMPONENT AUDIT (coverage checklist — audit ALL that exist, mark absent ones `N/A (not built)`)

**Shell:** sidebar expanded/collapsed (+persisted state), active/hover nav, top bar (search, product-AI entry button if any, tier/plan badge, notifications, settings), announcement banner (present/dismissed), user footer block, logout.
**Auth:** login (Keycloak-themed if applicable), logout, session-expired, unauthorized (RBAC denial screens).
**Content primitives:** page title block, section cards, feature cards (neutral + highlighted states), stat/KPI cards (mono numerals), tables (header, zebra/hover, selected row, sort, pagination, density), forms (inputs, selects, checkboxes, radios, switches, textareas, validation states), buttons (primary/outline/ghost/link/destructive/disabled), badges & chips (chrome vs status vs provider), tabs, breadcrumbs, tooltips, modals/drawers, toasts, dropdown menus, date/range pickers, search + command palette.
**States:** loading (skeleton = `surface-raised`, no shimmer colors), empty (ink-600 sentence + one primary action), error (status-crit accents, actionable copy), success confirmations.
**Data-viz:** chart series colors per §3.1, axis/grid = `border-default`, labels = `ink-600`, tooltips = `surface-raised`.
**Product surfaces:** Postura findings/graph/compliance; PolyCost cost explorer/anomalies/forecasts; Lumen dashboards/log views/trace waterfall/flame graphs; Costalyx allocation/budgets/reports; Vecta 7Rs engine/knowledge graph/wave planner/assessment reports.
**A11y:** every text/surface pair AA-checked; visible focus rings (`ring-brand-500`); `prefers-reduced-motion` respected; no color-only status (status chips carry icon or label).

Each violation = finding: `id · screen · component · rule violated (§ref) · evidence · proposed fix · risk`.

### Phase 3 — REMEDIATE
- Fix in dependency order: tokens → shared primitives → shell → screens.
- Additive-only: introduce `*-v2` component variants only when in-place change would break the regression floor; otherwise edit in place.
- Conventional commits per logical unit: `fix(theme): map cost tables to token system [TKN-014, CMP-007]`.

### Phase 4 — VERIFY
- Full test suites (regression floor). Hex-grep CI guard green. Lint/build green.
- Screenshot every audited screen (before/after where changed) → `docs/theme-audit/<date>/`. Playwright screenshot pass where configured; otherwise storybook/manual = `verified (mock)`.
- Contrast re-check on all changed pairs.

### Phase 5 — REPORT (single end-of-run)
`THEME-AUDIT-REPORT.md`: inventory summary · findings table with disposition (`fixed / deferred / blocked`) · evidence links · screenshots index · regression-floor confirmation (suite names + counts) · **Blocked section (mandatory)** · `HUMAN_DECISION_GATE` register (at minimum: final brand-hue sign-off; any font-license question; any trademark-dependent brand asset for Vecta/Lumen) · `DUMMY-VALUES.md` delta. Update `PROGRESS.md`. Push.

---

## 5. REVIEW BOARD (validation personas — apply during Phase 2 & 4)

Audit every screen through each lens; a screen passes only when all lenses pass:
1. **Brand steward** — accent budget respected; product hue unmistakable; no cross-product hue leakage.
2. **UI engineer** — zero raw hex; tokens resolve; Tailwind classes canonical; shadcn vars mapped.
3. **UX** — hierarchy, empty/error/loading states designed, copy active-voice and consistent.
4. **Accessibility** — AA contrast, focus visibility, reduced motion, non-color status encoding.
5. **Data-viz** — semantic color rules (§3.1) honored; mono numerals.
6. **Security reviewer (Postura mindset)** — severity colors never softened/decorative; RBAC-denied states themed, not blank.
7. **Regression warden** — suites green; no test asserts raw hex post-run.

---

## 6. DEFINITION OF DONE

- [ ] `tokens.css` + Tailwind + (if applicable) shadcn mapping present and matching §2/§3 for this product
- [ ] Hex-grep guard green and wired into CI
- [ ] 100% of implemented screens/components audited; every finding `fixed`, `deferred (justified)`, or `blocked (evidenced)`
- [ ] Accent budget verified on every screen
- [ ] RAG / provider / brand collision guard verified (esp. Costalyx gold-vs-amber)
- [ ] Regression floor green; screenshots archived; report + PROGRESS.md committed and pushed
- [ ] Blocked section + HUMAN_DECISION_GATE register present

---

*Precedence: this file > repo-local styling habits. Conflicts with locked architectural decisions are surfaced in the report, never papered over. Anything this file doesn't answer resolves in favor of: dark neutral surface, single product accent, 1px border, 8–10px radius, mono numerals, no shadow.*
