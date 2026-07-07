# MASTER PRODUCTION-READINESS ORCHESTRATOR v2 — Theme (Dark+Light) · Full-Stack · Continuation-Aware · Autonomous

**Applies to:** Postura · PolyCost · Lumen · Costalyx · Vecta (auto-detect product from repo; inject matching brand pack §3)
**Supersedes:** `universal-theme-audit-orchestrator.md` (v1) — v1 remains valid; this file extends it with dual-mode theming, backend scope, continuation protocol, and git/merge policy. On conflict, **v2 wins**.
**Companions:** `cpn-design-system.md` (structural reference), product's own doc chain (00-BRANDING → …), `PROGRESS.md`, `DUMMY-VALUES.md`.

---

## 0. MISSION (single goal)

**Make this product production-ready.** That means:

1. **UI/UX:** every screen and component conforms to the shared design system in **both dark and light mode**, with the product's own brand accent (§3).
2. **Backend:** every service meets the production-readiness bar (§6) — health, config, security, observability, data safety, deploy modes.
3. **Continuation:** the run picks up exactly where the product's `PROGRESS.md`, milestones, gates, and phases left off — nothing redone, nothing skipped, nothing assumed.
4. **Delivery:** all work committed (conventional commits), pushed to remote, PRs merged per the merge policy (§8), single end-of-run report.

Run is fully autonomous. No mid-run approval checkpoints. Decisions needing human input → `HUMAN_DECISION_GATE` register (record and proceed on the documented default).

---

## 1. CONTINUATION PROTOCOL (execute FIRST, before any change)

1. **Read state:** `PROGRESS.md`, all milestone/orchestrator docs in the chain, `DUMMY-VALUES.md`, `THEME-INVENTORY.md` / `THEME-AUDIT-REPORT.md` if present, open PRs, open branches, CI status, `HUMAN_DECISION_GATE` register.
2. **Verify claimed state (trust but verify):** for every milestone marked complete, spot-check its evidence (run the referenced suite, open the referenced file). A milestone claiming complete without reproducible evidence is downgraded to `claimed-complete (unverified)` and logged — do not silently re-do or silently accept.
3. **Classify every milestone/gate/phase:** `verified complete / claimed-complete (unverified) / in progress / not started / blocked`. This is the Step 0 reality-check applied to program state.
4. **Resume order:** finish `in progress` items → verify `claimed-complete (unverified)` → execute `not started` in the product's documented milestone order → then execute the v2 phases below for anything the existing chain doesn't cover (dual-mode theme, backend readiness).
5. **Locked decisions stay locked.** Existing architectural decisions, regression floors (e.g., PolyCost's green web/API/E2E/Playwright suites), and additive-only schema rules are inherited, not renegotiated. Scope tensions → resolved in authoritative docs or logged as `HUMAN_DECISION_GATE`, never papered over.

---

## 2. DUAL-MODE TOKEN ARCHITECTURE (dark + light, one token set)

Components reference **semantic tokens only**; modes swap variable values. Zero raw hex in components (CI grep guard from v1 §2.4 stays mandatory).

### 2.1 Mode mechanics

- `<html data-theme="dark|light">` — default resolves from `prefers-color-scheme`, user choice persisted (user-preference store or localStorage), applied by an inline pre-hydration snippet (no FOUC).
- Tailwind reads variables, so **no `dark:` class forks in components** — one class list works in both modes. (`darkMode: ['selector','[data-theme="dark"]']` may exist for rare exceptions; exceptions are findings unless justified.)
- Every screenshot/verification artifact is captured **in both modes**.

### 2.2 Neutral tokens — both modes (IMMUTABLE)

| Token | Dark (default) | Light |
|---|---|---|
| `surface-canvas` | `#0B0E14` | `#F5F4EF` |
| `surface-card` | `#141824` | `#FFFFFF` |
| `surface-raised` | `#1B2130` | `#EAE8E2` |
| `border-default` | `#232A3B` | `#E4E2DB` |
| `border-strong` | `#2F3850` | `#D6D3CB` |
| `ink-900` | `#EDEFF5` | `#26241F` |
| `ink-600` | `#9AA1B2` | `#5C5A57` |
| `ink-400` | `#646C80` | `#8B8880` |

Light mode = the CPN warm-neutral palette exactly; dark mode = the portfolio dark-first surfaces. Same component anatomy in both (shell, cards, 1px borders, 8–10px radii, flat depth, Inter + JetBrains Mono for all numerics).

### 2.3 Semantic colors — both modes

RAG (`ok #3FB68B / #2E9E76`, `warn #F59E0B / #B45309`, `crit #E5484D / #C93338` — dark/light text-safe values) remain status-only. Provider accents (AWS `#D85A30`, Azure `#378ADD`, GCP `#1D9E75`) unchanged, accent-only in both modes. Brand never conveys status; status never decorates — in either mode.

### 2.4 tokens.css shape (every repo identical except brand block)

```css
:root, [data-theme="dark"] {
  --surface-canvas:#0B0E14; --surface-card:#141824; --surface-raised:#1B2130;
  --border-default:#232A3B; --border-strong:#2F3850;
  --ink-900:#EDEFF5; --ink-600:#9AA1B2; --ink-400:#646C80;
  --status-ok:#3FB68B; --status-warn:#F59E0B; --status-crit:#E5484D;
}
[data-theme="light"] {
  --surface-canvas:#F5F4EF; --surface-card:#FFFFFF; --surface-raised:#EAE8E2;
  --border-default:#E4E2DB; --border-strong:#D6D3CB;
  --ink-900:#26241F; --ink-600:#5C5A57; --ink-400:#8B8880;
  --status-ok:#2E9E76; --status-warn:#B45309; --status-crit:#C93338;
}
```

---

## 3. BRAND PACKS — DUAL MODE

Same five hues as v1; each pack now defines **mode-specific values** because a `brand-500` tuned for dark canvases can fail AA as text/fill on white. Rule: `brand-500` = fills/buttons/rails; `brand-text` = links & accent text (AA-checked per mode); `100/50` = alpha tints (work in both modes automatically).

| Product | Dark `500` | Dark `on-brand` | Light `500` | Light `text` | Light `on-brand` |
|---|---|---|---|---|---|
| **Postura** (indigo) | `#6B7CF5` | `#0B0E14` | `#4F5FD6` | `#4353C4` | `#FFFFFF` |
| **PolyCost** (violet) | `#A879F0` | `#0B0E14` | `#7C4FD0` | `#6B3FC0` | `#FFFFFF` |
| **Lumen** (cyan) | `#3BC4D6` | `#0B0E14` | `#1E93A6` | `#177A8A` | `#FFFFFF` |
| **Costalyx** (gold) | `#D9A63B` | `#0B0E14` | `#A87A1E` | `#8F6710` | `#FFFFFF` |
| **Vecta** (transit fuchsia) 🔒 | `#D946EF` | `#0B0E14` | `#C026D3` | `#A21CAF` | `#FFFFFF` |

🔒 = **locked by the product owner** (supersedes any earlier proposal in v1/v2). Vecta's earlier terracotta proposal is retired.

```css
/* Example — LUMEN; same shape for all five, swap values from table */
:root, [data-theme="dark"] {
  --brand-600:#2BA9BA; --brand-500:#3BC4D6; --brand-400:#63D2E0;
  --brand-100:rgba(59,196,214,.18); --brand-50:rgba(59,196,214,.08);
  --brand-text:#3BC4D6; --on-brand:#0B0E14;
}
[data-theme="light"] {
  --brand-600:#177A8A; --brand-500:#1E93A6; --brand-400:#4DB2C2;
  --brand-100:rgba(30,147,166,.14); --brand-50:rgba(30,147,166,.07);
  --brand-text:#177A8A; --on-brand:#FFFFFF;
}
```

### 3.1 VECTA — LOCKED BRAND PACK (dual-hue; authoritative)

**Naming:** product name is **Vecta**; **Migrata** is the pre-cleared fallback if the Vecta trademark screen fails. All UI strings, logos, and page titles must resolve from a single `PRODUCT_NAME` config constant (never hard-coded), so a clearance-driven rename is a one-line change. Trademark clearance remains a standing `HUMAN_DECISION_GATE`.

Vecta is the only product with a **two-hue system**. Roles are strict:

- **Primary — Transit Fuchsia `#D946EF`:** the brand accent. Carries the entire v1/v2 accent budget (sidebar active/rail, primary buttons, links, focus rings, selection, attention states). The only major hue family unused elsewhere in the portfolio; on dark surfaces it is never mistakable for status red.
- **Secondary — Vector Cyan `#22D0EE`:** **not** a general accent. Permitted only in (a) the source→target brand gradient and (b) motion/transit elements (animated flow paths, migration-progress indicators, direction arrows). Cyan appearing in any accent-budget position (button, link, rail, focus ring) = finding. Because cyan always appears paired with fuchsia, it is not confusable with Lumen's teal-green or Azure's mid-blue.
- **Brand signature — the cyan→fuchsia gradient:** cyan = source environment, fuchsia = target environment. Every migration direction (on-prem→cloud, cloud→on-prem, cloud→cloud) renders as the **same gradient, relabeled** — direction is conveyed by labels/arrows, never by swapping the gradient's colors. Use for: hero/branding surfaces, migration-path edges in the knowledge graph, wave-plan flow bars, progress fills. Never for: buttons, text, status.

```css
/* VECTA — locked */
:root, [data-theme="dark"] {
  --brand-600:#C026D3; --brand-500:#D946EF; --brand-400:#E879F9;
  --brand-100:rgba(217,70,239,.18); --brand-50:rgba(217,70,239,.08);
  --brand-text:#E879F9; --on-brand:#0B0E14;
  --vector-cyan:#22D0EE; --vector-cyan-dim:rgba(34,208,238,.35);
  --brand-gradient:linear-gradient(90deg,var(--vector-cyan) 0%,var(--brand-500) 100%);
}
[data-theme="light"] {
  --brand-600:#A21CAF; --brand-500:#C026D3; --brand-400:#D946EF;
  --brand-100:rgba(192,38,211,.14); --brand-50:rgba(192,38,211,.07);
  --brand-text:#A21CAF; --on-brand:#FFFFFF;
  --vector-cyan:#0E9CB8; --vector-cyan-dim:rgba(14,156,184,.30);
  --brand-gradient:linear-gradient(90deg,var(--vector-cyan) 0%,var(--brand-500) 100%);
}
```

Vecta-specific audit rules (extend v1 §3.1): 7Rs decision chips keep their documented categorical ramp (fuchsia and vector-cyan are **excluded** from the ramp to protect brand/motion roles); assessment status is strictly RAG — `status-crit` = blockers, `status-warn` = warnings, `status-ok` = migration-ready; provider badges use AWS `#D85A30` / Azure `#378ADD` / GCP `#1D9E75` accent-only; inventory and telemetry tables are JetBrains Mono; knowledge-graph nodes use the documented node ramp with gradient reserved for migration-path edges only.

### 3.2 General pack rules & portfolio hue registry

Dark `600` = hover-darken of dark `500`; light `600` = the light `text` value (hover deepens). All v1 rules stand: accent budget, collision guards (Costalyx gold vs `status-warn` in both modes — the **position rule is the enforcement**: brand gold only in chrome/accent positions, amber only in status positions), product-specific surface rules (severity, cost deltas, telemetry mono).

**Hue registry reconciliation (`HUMAN_DECISION_GATE`, run proceeds on repo evidence):** the owner's brand notes describe the portfolio as *teal/violet = Lumen, indigo = Costalyx*, which differs from this file's proposals (Lumen cyan `#3BC4D6`, Costalyx gold `#D9A63B`, Postura indigo `#6B7CF5`). Only **Vecta (§3.1) is locked**. For the other four products, resolution order during any run: (1) hues already committed in the product's own brand kit / 00-BRANDING doc win; (2) absent that, this file's proposals apply; (3) either way, record the resolved hue in the gate register and verify no two products share a hue family and none collides with RAG/provider tokens. If Lumen resolves to teal/violet and Costalyx to indigo, Postura's indigo proposal must be re-derived (registry uniqueness rule) — flag, don't improvise silently.

### 3.3 TERRACOTTA ACCENT THEME — universal user option (all five products)

Every application offers a user-selectable **Terracotta** accent (the CPN reference palette) in addition to the product's default brand accent. This is a **second, independent theming axis**:

- **Axis 1 — Mode:** `data-theme="dark|light"` (system-default, persisted) — swaps neutrals/surfaces.
- **Axis 2 — Accent:** `data-accent="default|terracotta"` on `<html>` (default = product brand, persisted alongside mode, same no-FOUC snippet) — swaps only the `--brand-*` group.

Because every component references semantic `--brand-*` tokens, the terracotta accent works on all screens of all five products with **zero component changes** — that is the acceptance test for token discipline. Any element that doesn't recolor under `data-accent="terracotta"` is, by definition, a hard-coded color and a finding.

```css
/* Terracotta accent — identical block in every repo, appended after the product pack */
[data-accent="terracotta"], [data-accent="terracotta"][data-theme="dark"] {
  --brand-600:#C96442; --brand-500:#D97757; --brand-400:#E08D6F;
  --brand-100:rgba(217,119,87,.18); --brand-50:rgba(217,119,87,.08);
  --brand-text:#E08D6F; --on-brand:#FFFFFF;
}
[data-accent="terracotta"][data-theme="light"] {
  --brand-600:#C05B3C; --brand-500:#D97757; --brand-400:#E08D6F;
  --brand-100:rgba(217,119,87,.14); --brand-50:rgba(217,119,87,.07);
  --brand-text:#C05B3C; --on-brand:#FFFFFF;
}
```

**Settings UI (uniform across all products):** Settings → **Appearance** panel with two controls — **Mode:** System / Dark / Light, and **Accent:** Product default / Terracotta (swatch previews next to each option; product-default swatch shows the product's own hue). Both persisted per user (user-preference store where a backend profile exists, localStorage fallback), applied pre-hydration. Live preview on change, no reload.

**Scope & guard rules:**
- Terracotta replaces the **accent only**. Logos, product wordmarks, provider badges, RAG status, and (Vecta) `--vector-cyan` are untouched — brand identity assets never recolor with user preference.
- **Vecta under terracotta:** `--brand-gradient` references `var(--brand-500)`, so the signature gradient automatically becomes cyan→terracotta. This is intended (source→target semantics survive; direction is still labels/arrows). Cyan's role rules are unchanged.
- **Costalyx under terracotta:** terracotta (hue ~18°) vs `status-warn` amber — same position-rule enforcement as gold; no special handling needed.
- Contrast pairs for terracotta in both modes are pre-checked above (white on `#D97757` is AA for ≥14px-medium button text per the CPN reference; links use the darker `brand-text` values). The P2 contrast audit re-verifies any *new* pair a product introduces.

**Verification burden (pragmatic):** full dual-mode screenshot matrix runs on the **default accent**. Terracotta is verified via a smoke set — shell, all §2 primitives (button/link/badge/card/highlight/focus states), and one representative screen per product area — in both modes, archived under `docs/theme-audit/<date>/{dark,light}-terracotta/`. Token discipline guarantees the rest; any smoke failure escalates to a full terracotta pass.


**Light-mode sidebar (locked adaptation):** in light mode the shell may use either (a) the CPN pattern — sidebar filled `brand-500` with `on-brand` text and `brand-400` active block, or (b) the neutral sidebar with brand rail (same as dark). Pick per product's existing shell and record the choice; (a) is the default for marketing-adjacent portals, (b) for dense data tools (Lumen, Postura). Consistency within a product across modes' *anatomy* is mandatory — only surface colors swap.

---

## 4. PHASE MAP (after Continuation Protocol §1)

| Phase | Scope | Gate to pass |
|---|---|---|
| **P0** | Discover + continuation sync (§1) — `THEME-INVENTORY.md` + `STATE-SYNC.md` (milestone classification table) | Inventory complete, all milestones classified with evidence |
| **P1** | Token layer: dual-mode `tokens.css`, Tailwind map, shadcn map, brand pack injection (Vecta additionally maps `vector: "var(--vector-cyan)"` in Tailwind colors and a `bg-brand-gradient` utility → `background-image: var(--brand-gradient)`), terracotta accent block (§3.3), Appearance settings panel — Mode (system/dark/light) + Accent (default/terracotta), both persisted, no-FOUC — CI hex-grep guard | Both modes × both accents render; guard green |
| **P2** | Frontend conformance: full v1 §4 Phase-2 coverage checklist, executed **twice (dark + light)**; fix in dependency order tokens → primitives → shell → screens | Review board (§7) passes every implemented screen in both modes |
| **P3** | Backend production readiness (§6) | §6 checklist items `pass` or `blocked (evidenced)` |
| **P4** | Verification: full regression floor, e2e, dual-mode screenshot archive `docs/theme-audit/<date>/{dark,light}/`, contrast re-checks, OpenAPI ↔ implementation sync check | All suites green locally; evidence archived |
| **P5** | Git ops: commit, push, PR lifecycle, merge per policy (§8) | Default branch contains all work; branches cleaned |
| **P6** | Report: `PRODUCTION-READINESS-REPORT.md` + `PROGRESS.md` update | Blocked section + gate register present; pushed |

Phases may interleave with the product's own remaining milestones from §1.4 — the product's documented milestone order takes precedence for sequencing; v2 phases fill the gaps.

---

## 5. UI/UX UNIVERSAL RULES (both modes — condensed; full detail in v1 + CPN reference)

- One brand accent per product; accent budget: sidebar active/rail, primary buttons, links (`brand-text`), focus rings, selection, attention states, single-series charts. Anywhere else = finding.
- Numerics (costs, latency, counts, IDs, timestamps) = JetBrains Mono, both modes.
- Full state coverage designed, not defaulted: loading skeletons (`surface-raised`), empty (one sentence + one primary action), error (actionable, `status-crit` accent), RBAC-denied (themed, never blank), success.
- A11y: AA on every pair per mode, visible focus, reduced-motion respected, status never color-only.
- Copy: active voice, sentence case, same verb through a flow (button "Publish" → toast "Published").
- Appearance controls: Settings → Appearance panel with **Mode** (System / Dark / Light) and **Accent** (Product default / Terracotta, with swatch previews) per §3.3; both persisted per user, applied pre-hydration, live preview without reload.

---

## 6. BACKEND PRODUCTION-READINESS BAR (audit + remediate; NestJS-stack defaults)

Each item = `pass / fixed / blocked (evidenced)` in the report. Additive-only schema rule and `valid_from`/`valid_to` temporal convention are inherited and inviolable.

1. **Health & lifecycle:** `/health/live` + `/health/ready` (deps: DB, Redpanda, Vault, Keycloak reachability), graceful shutdown, startup fails fast on invalid config.
2. **Config & secrets:** all config via env/Vault; **startup guard blocks any `CHANGE_ME_DEV_ONLY_*` value outside local env** (verify the guard actually executes); `DUMMY-VALUES.md` current; no secrets in code, logs, or fixtures.
3. **AuthN/Z:** Keycloak OIDC wired; RBAC enforced at guard level per the product's RBAC doc; deny-by-default; audit log on privileged mutations.
4. **API integrity:** OpenAPI spec matches implementation (generate-and-diff); versioned routes; additive-only changes; consistent error envelope; input validation (class-validator/zod) on every mutation; pagination on every list.
5. **Data safety:** migrations additive-only, reversible where possible, run-once idempotent; seed/demo data clearly flagged; `finding.evidence_id NOT NULL`-style evidence constraints intact where defined.
6. **Resilience:** timeouts + retries with backoff on all outbound calls; rate limiting on public endpoints; idempotency keys on side-effectful endpoints where applicable; circuit-breaking or queue backpressure for Redpanda consumers.
7. **Observability:** OTel traces/metrics/logs exported (LGTM+ compatible); correlation IDs end-to-end; RED metrics per endpoint; structured JSON logs, no PII/secrets.
8. **Performance floor:** N+1 checks on hot queries, indexes for known access paths (incl. Apache AGE graph queries where applicable), response-size sanity on list endpoints.
9. **Deploy modes:** all supported modes build & boot — Docker Compose, Kubernetes/Helm, systemd, Windows Service (whichever the product documents); images pinned, non-root, healthcheck'd.
10. **CI/CD:** pipeline runs lint, typecheck, tests, hex-grep guard, build; artifacts versioned; conventional-commit enforcement if configured.
11. **Docs:** README run instructions verified by actually following them; `PROGRESS.md` truthful; API docs published/generated.

Anything requiring real cloud credentials/environments = **dummy-complete**, executed against mocks, marked `verified (mock)`, listed in Blocked with exactly what credential/environment unblocks it. Dummy-complete is never reported as production-ready.

---

## 7. REVIEW BOARD (extended to 9 lenses; every screen ×2 modes, every service)

Brand steward · UI engineer · UX writer/designer · Accessibility · Data-viz · Security (severity/RBAC/secrets) · Backend/SRE (health, observability, resilience) · FinOps (cost-surface semantics; PolyCost/Costalyx) · Regression warden (floors green, tests assert tokens not hex).

---

## 8. GIT, PR & MERGE POLICY (autonomous)

1. **Branching:** work on the product's existing feature branch if one is active (e.g., Lumen `feature/lumen-phase1`); otherwise `feature/<product>-prod-ready-<date>`. Conventional commits, logical units, finding IDs in messages.
2. **Push to remote** after each phase gate and at run end.
3. **PR lifecycle:** open/refresh PRs to the default branch with a summary generated from the report. Then merge, governed by:
   - **CI green → merge.** Squash-merge unless repo convention says otherwise; delete merged branches.
   - **CI failing → classify the failure first (mandatory, evidence-logged):**
     - **(a) Infrastructure/billing failure** — GitHub Actions payment/quota/billing errors, runner unavailable, spending-limit reached, `The job was not started because…` billing messages, network/runner infra flakes. → **Bypass allowed:** run the *entire* regression floor + lint + build **locally**, attach local results (suite names + counts + exit codes) to the PR/report as evidence, annotate the merge commit/PR with `ci-bypass: billing/infra — local floor green <evidence-link>`, then **merge (admin-merge if branch protection permits; otherwise log as blocked)**. Also log a `HUMAN_DECISION_GATE`: "GitHub Actions billing needs attention."
     - **(b) Genuine code/test failure** — **never bypass.** Fix, or revert the offending commit, or leave the PR open and log Blocked. The regression floor is sacred; a billing bypass is an exception for *infrastructure*, never a loophole for red tests.
   - Merge conflicts: rebase onto default branch, re-run local floor, proceed.
4. **Multiple stale PRs found during continuation:** triage each — mergeable & floor-green (locally if CI is billing-broken) → merge; superseded → close with comment referencing the superseding work; conflicting → rebase or log Blocked.
5. Never force-push shared branches; never rewrite default-branch history; never delete unmerged work.

---

## 9. DEFINITION OF DONE

- [ ] Continuation sync complete; all pre-existing milestones/gates verified-complete, executed, or Blocked with evidence
- [ ] Dual-mode tokens live; Appearance settings (Mode + Accent) persisted and applied pre-hydration; both modes screenshot-archived for all implemented screens on default accent; terracotta smoke set (§3.3) archived in both modes and passing — any element not recoloring under `data-accent="terracotta"` treated as a hard-coded-color finding and fixed
- [ ] Frontend conformance passes 9-lens board in both modes; hex-grep guard in CI and green
- [ ] Backend §6 bar: every item pass/fixed/blocked-with-evidence; dummy-complete explicitly separated from production-ready
- [ ] Regression floor green locally; OpenAPI↔code sync verified
- [ ] All PRs merged per §8 (or logged Blocked with the exact protection rule preventing merge); pushed; branches cleaned
- [ ] `PRODUCTION-READINESS-REPORT.md` + updated `PROGRESS.md` committed: findings dispositions, evidence index, dual-mode screenshot index, Blocked section (mandatory), `HUMAN_DECISION_GATE` register (minimum entries: brand-hue sign-off per product, light-mode sidebar pattern choice, GitHub Actions billing if bypass used, any credential-gated verifications)

---

*Precedence: v2 > v1 > repo-local habits. Product's own doc chain governs milestone sequencing; this file governs quality bars and delivery. Anything unanswered resolves in favor of: semantic tokens in both modes, single product accent, additive-only changes, evidence over assertion, local floor green before any merge.*
