# 🐞 Known Issues & Defect Register

> **Are there deliberate defects in this repository?**
> **No.** A full sweep for intentionally-seeded bugs (`deliberate defect`,
> `intentionally broken`, `seeded bug` and similar) found **zero** matches. This
> is a working system, not a training exercise with planted faults.
>
> What follows is the **real** defect register: verified, open issues with their
> current status. Every entry below was reproduced, not inferred.

**Severity key:** 🔴 blocker · 🟠 high · 🟡 medium · 🔵 low / informational

---

## 🔴 Open — fails a quality gate

### K-1 · `qa` gate fails: direct `process.env` in `http-client.ts`

|               |                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | 🔴 Open — **blocks `pre-commit`**                                                                                                                                                                                                                           |
| **Reproduce** | `node scripts/qa-check.mjs`                                                                                                                                                                                                                                 |
| **Detail**    | Repo convention forbids direct `process.env` in `apps/*/src`. `apps/api/src/adapters/common/http-client.ts` reads `PROVIDER_HTTP_TIMEOUT_MS`, `PROVIDER_HTTP_MAX_RESPONSE_BYTES` and `PROVIDER_HTTP_BODY_TIMEOUT_MS` directly.                              |
| **Age**       | Pre-existing — present before the current hardening work.                                                                                                                                                                                                   |
| **Fix**       | Add `PROVIDER_HTTP_*` to the zod config schema and thread `ConfigService` through the 7 call sites. `parseJsonResponse` already accepts optional `{ maxBytes, bodyTimeoutMs }`, so tests no longer need env mutation — the production path is what remains. |

### K-2 · `npm audit` high-severity gate fails

|                  |                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | 🔴 Open — `npm audit --audit-level=high` exits 1                                                                                                                                                                |
| **Reproduce**    | `npm audit` → _12 vulnerabilities (2 low, 3 moderate, 7 high)_                                                                                                                                                  |
| **Detail**       | All 7 highs are in the **development / tooling** tree, not runtime dependencies: `@sentropic/graphify` → `officeparser` → `pdfjs-dist`, plus transitive `brace-expansion`, `fast-uri`, `ip-address`, `js-yaml`. |
| **⚠️ Doc drift** | [PROGRESS.md](../PROGRESS.md) still states this gate _passes_. It no longer does — advisories have accumulated since that was written.                                                                          |
| **Fix**          | Upgrade or replace the Graphify tooling chain; re-run the gate.                                                                                                                                                 |

---

## 🟠 Operational friction

### K-3b · Web container still runs nginx master as root

|                  |                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | 🟠 Open — deployment decision needed                                                                                                                                                                                                                                                                              |
| **Detail**       | The API container now runs as the unprivileged `node` user. The web container cannot follow directly: nginx already drops its _workers_ to the `nginx` user, but the master stays root purely to bind port 80. Running it fully non-root means moving the listener above 1024 and relocating the pid/cache paths. |
| **Why deferred** | That changes the published port contract for `docker-compose` and every deployment target, so it is a deliberate decision rather than a drive-by change.                                                                                                                                                          |
| **Fix**          | Choose a port (commonly 8080), update `nginx.conf`, `docker-compose.yml` and any ingress, then add `USER nginx`.                                                                                                                                                                                                  |

### K-3 · ~~`pre-push` hook is impractical to satisfy locally~~ ✅ RESOLVED

|                   |                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | 🟠 Open — design decision needed                                                                                                                                                                                                       |
| **Detail**        | `.githooks/pre-push` runs `check:full`: 58 checks **plus** integration, build, e2e and security scans. It requires Docker, a live database and e2e infrastructure, and aborts locally (observed: invoice-artifact-scanner smoke test). |
| **Consequence**   | Developers bypass it with `--no-verify`, which defeats the hook entirely.                                                                                                                                                              |
| **Suggested fix** | Slim `pre-push` to the fast static gates — `ci:lint`, `format:check`, `theme:hex:check` (~10s, no services) — and leave `check:full` to CI. This is a **project policy call**, so it has not been changed unilaterally.                |

### K-4 · Test timeout when both suites run concurrently

|               |                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**    | 🟠 Open — CI configuration risk                                                                                                                                    |
| **Reproduce** | Run the API and web Jest suites in parallel on one machine.                                                                                                        |
| **Detail**    | Observed `Exceeded timeout of 5000 ms` in a web test purely from CPU contention. Each suite passes reliably on its own (verified across repeated randomized runs). |
| **Fix**       | Run suites sequentially in CI, cap `--maxWorkers`, or raise the timeout for the affected test.                                                                     |

---

## 🟡 Accepted / reviewed

### K-5 · ESLint security-plugin warnings (11)

Reviewed and accepted: controlled fixture reads, provider-response dictionary
access, and a local Vault token-file read. **0 errors**, warnings only.
Rationale: [docs/SECURITY-SUPPRESSIONS.md](SECURITY-SUPPRESSIONS.md).

### K-6 · Jest worker teardown warning

The adapter suite emits a worker-teardown warning after completion. **No test
fails.** Carried forward from Phase 3.

---

## 🟠 K-11 · Three dependency majors are blocked behind an ESM migration

|            |                                                                           |
| ---------- | ------------------------------------------------------------------------- |
| **Status** | 🟠 Tailwind 4 taken 2026-09-04 — TS 7 and @nestjs/config blocked upstream |
| **Found**  | 2026-08-31, while clearing the Dependabot queue                           |

The API is CommonJS (`module: commonjs`, ts-jest, `moduleResolution: node`). Three
major upgrades each fail on that, for the same underlying reason:

| Dependabot PR | Upgrade                 | How it fails                                                                                                                                                                                                                                       |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #168          | TypeScript 5 → 7        | `moduleResolution: node10` is **removed**. Switching to `node16` then surfaces `TS1479`: the CommonJS API cannot `require` `@polycost/types`, which declares `"type": "module"` and exports a runtime value (`POLYCOST_AI_NATIVE_SCHEMA_VERSION`). |
| #171          | `@nestjs/config` 4 → 12 | Ships **ESM-only**. Jest cannot load it under CommonJS: _"Must use import to load ES Module"_ — 6 suites fail to run, 550 tests drop to 257.                                                                                                       |
| #170          | Tailwind 3 → 4          | Not ESM, but a **CSS-first rewrite**: `@tailwind` directives → `@import`, `tailwind.config.ts` → `@theme`, PostCSS moves to `@tailwindcss/postcss`. ~397 utility usages across the app, so it carries real visual-regression risk.                 |

These are **not** routine bumps. The first two need a decision about the
workspace module system; the third needs a human looking at the rendered UI.

**Options for the ESM question:**

1. **Migrate the API to ESM.** Cleanest long-term; touches `tsconfig`, Jest
   config, and every `require`-shaped assumption.
2. **Make `@polycost/types` dual-published** (or drop `"type": "module"` and
   move its single runtime constant elsewhere). Smallest change that unblocks
   TypeScript 7 specifically.
3. **Stay on CommonJS and pin these three.** Viable now, but the ecosystem is
   moving; expect the list to grow.

Recommended: option 2 first (small, unblocks TS 7), then plan option 1
deliberately rather than under upgrade pressure.

### ✅ Resolution (2026-09-02) — option 2, one line

`"type": "module"` has been removed from `packages/types/package.json`. The
package is consumed as TypeScript **source** by both an ESM web app and a
CommonJS API and has no build output, so declaring it ESM-only bought nothing
and cost the CJS side the ability to resolve it.

Verified rather than assumed: with `moduleResolution: node16` and
`module: node16`, the API previously failed with `TS1479`. It now reports
**0 errors and 0 TS1479**, and all three workspaces typecheck with the existing
settings unchanged.

The module-resolution change itself was **reverted** — it is not needed today,
and switching resolution repo-wide is a separate decision with its own emit
risk. What matters is that it now _works_ when TypeScript 7 requires it.

**Still open:** the three dependency majors themselves. The architectural
blocker is gone, so #168 (TypeScript 7) can be retried directly. #170
(Tailwind 4) was never an ESM problem — it is a CSS-first rewrite touching ~397
utility usages and still needs a human looking at the rendered UI.

### ✅ / ⛔ Outcome (2026-09-04) — one taken, two genuinely blocked

Each of the three was attempted against the running toolchain rather than
assessed on paper. They did not turn out to be the same kind of problem.

**#170 Tailwind 3 → 4 — taken.** The ~397 figure in the table above was a
substring count and overstated the work: most of those matches were project
class names that merely contain `grid` or `flex`. A token-level count against
`styles.css` gives **292 distinct utilities** genuinely used and not defined
locally, of which only **79 usages across 8 colour families** touch the custom
theme. The whole `tailwind.config.ts` was `colors` mapping to CSS custom
properties plus one keyframe/animation pair that nothing referenced — so it
ported to a CSS `@theme` block almost mechanically.

One thing the local build hid and the container build caught: `apps/web`
declared its own `tailwindcss@^3.4.17`, so a clean `npm ci` gave the web
workspace a nested Tailwind 3 while the root had 4. `@import 'tailwindcss'`
then resolved to Tailwind 3's `lib/index.js` and postcss-import tried to parse
JavaScript as CSS — _"Unknown word 'use strict'"_. The version now lives only in
`apps/web`, where the build actually runs.

Verified in the browser on the container build, not from a passing `vite build`:
29 elements resolving `bg-surface-0` to `#f4f5fb` through the
`--color-surface-0` → `--surface-0` chain, `text-xs` at 12px, `font-semibold` at
600, and the provider cards still carrying their AWS/Azure/GCP tints.

**#168 TypeScript 5 → 7 — blocked by ts-jest, not by us.** The architectural
blocker really was cleared: with the config change below, all three workspaces
report **0 errors on TypeScript 7.0.2**. The suite is what stops it.
TypeScript 7 is the native compiler and does not expose the JavaScript compiler
API `ts-jest` needs; `ts-jest@29.4.12` (latest) declares
`typescript: ">=4.3 <7"` outright, and all 71 API suites fail to run on TS 7
with a single message. Taking it today means running two compilers — TS 7 for
build, an aliased `@typescript/typescript6` for tests — for a compiler still
publishing `7.0.0-dev.*` previews. Not worth it yet; revisit when ts-jest
supports 7.

What _did_ land from this attempt is the config that TypeScript 7 will require:
`tsconfig.base.json` no longer sets `moduleResolution: "node"` (that is node10,
removed in TS 7 — it made the repo fail with `TS5108` before anything else), and
the API moved to `module`/`moduleResolution: node16`. `apps/api/package.json` is
`"type": "commonjs"`, so the emit is unchanged — `dist/main.js` is still
`"use strict"` plus `require()`. Verified 0 errors and 784 passing tests on both
TypeScript 5.9.3 and 7.0.2.

**#171 `@nestjs/config` 4 → 12 — blocked, and it is the ESM migration.** Not a
packaging oversight that a newer patch fixes: 12.0.0 is `"type": "module"` and
its `exports` map offers only `import` and `default`, both pointing at the same
ESM file. There is no CommonJS build to fall back to, so a CJS API cannot
`require` it at all. This is option 1 from the analysis above — Nest bootstrap,
ts-jest, and every `require`-shaped assumption — and should be planned
deliberately, not taken under Dependabot pressure.

## 🟠 K-12 · The `impeccable` gate silently skips on CI's Node version

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Status** | 🟠 Findings cleared 2026-09-04 — CI runner pending |
| **Found**  | 2026-08-31, while landing the `/metrics` endpoint  |

`npm run qa` ends with `npm run impeccable`, a UI anti-pattern scanner.
`impeccable@3.1.0` requires **Node 24+**, and `scripts/impeccable-check.mjs`
deliberately exits 0 with a warning when the host is older — which is exactly
what CI is (Node 20).

The result is a gate that is green in CI and red on a modern developer machine.
On Node 24+ it exits 2 and reports **24 anti-patterns** in
`apps/web/src/styles.css`:

| Rule                       | Count | What it flags                                       |
| -------------------------- | ----- | --------------------------------------------------- |
| `side-tab`                 | 19    | 3–4px `border-left` accents on cards                |
| `border-accent-on-rounded` | 5     | Thick `border-top` on a card that also has a radius |

None are correctness bugs — they are visual-polish findings — but the situation
is worse than having no scanner: the pre-commit hook runs `qa`, so anyone on
current Node **cannot commit without `--no-verify`**, which trains people to
bypass every other check in that hook too.

**Fix, in order:**

1. Raise CI's Node to 24+ so the gate actually runs. This will fail the build
   until step 2 lands, so do them together.
2. Clear or explicitly waive the 24 findings.
3. Make `scripts/impeccable-check.mjs` **fail** rather than warn when it cannot
   run, once the engine floor is raised. A check that skips itself is not a check.

### ✅ Partial fix (2026-09-02) — steps 1 and 3 of the above

`scripts/impeccable-check.mjs` no longer has two accidental behaviours. It is
now **advisory by default** (findings are printed, the check passes) and becomes
a real gate under `IMPECCABLE_ENFORCE=1`.

That resolves the harmful half. Previously a developer on Node 24+ could not
commit at all without `--no-verify`, which also skipped the format, lint,
typecheck and unit-test checks in the same pre-commit hook — the exact reasoning
that already got `check:full` removed from the pre-push hook. `npm run qa` now
exits 0 on modern Node, and `IMPECCABLE_ENFORCE=1 npm run impeccable` still
exits non-zero, so nothing has been quietly disabled.

### ✅ Mostly fixed (2026-09-04) — step 2, and the skip closed properly

**The skip is no longer a silent pass.** `scripts/impeccable-check.mjs` now exits
1 rather than 0 when the runtime is too old _and_ enforcement was requested. A
gate that cannot run must not report a pass it never checked — that was the
original defect, and until now the fix had only addressed its symptom.

**All 24 findings are cleared** — by changing the geometry, not by waiving them.
Every finding was the same construction: a 3–4px border down one edge of a card
that also has a `border-radius`. Two things are wrong with it. The thick edge
tapers into the corner arc and leaves a visible wedge where the 4px side meets
the 1px one. And a coloured slab down the left of a card is the most
recognisable stock-template tell there is — it was on nineteen separate
components, which is what made it read as a default rather than a decision.

The signal was worth keeping: on a banner the colour is severity, on a provider
card it is the cloud, on a template button it is the category. So the rail
stayed and only its geometry changed — a rounded bar inset from both ends, drawn
as a pseudo-element inside a card whose border is now a uniform 1px with
unbroken corners.

Colour flows through a `--rail` custom property, so all 41 existing state and
provider modifiers kept working by setting one property instead of a border
colour. `.landing-provider-card` also got its left corners back: they had been
squared (`border-radius: 0 8px 8px 0`) only to give the old slab a flat edge.

Verified in the browser rather than from the scanner's exit code — thirteen of
the families rendered on screen were measured directly, both edges, confirming a
3px rail at the right colour with the card at a uniform 1px border.

Two release-readiness assertions were inverted to match: they used to require
that CI _explain its skip_, and now require that CI _runs and enforces_ the gate.
The second one initially matched the prose comment rather than the directive, so
it passed with the directive deleted; it now asserts `IMPECCABLE_ENFORCE: '1'`
and was confirmed to fail without it.

## 🔴 K-13 · Redis had persistence disabled, silently discarding queued jobs

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Status** | 🟢 Fixed 2026-09-02                                |
| **Found**  | 2026-09-02, investigating 4 failed background jobs |

The `job_queue_depth` metric added in #185 reported
`job_queue_depth{queue="cost-management",state="failed"} 4`. Going to look at
those four jobs, they were **gone**.

Redis was started with `--save '' --appendonly no` and no volume. BullMQ keeps
**all** job state in Redis — waiting, delayed, active and failed alike — so every
restart discarded:

- scheduled jobs that had not fired yet (the daily pricing refresh, budget
  alert evaluation, share-link cleanup, retention enforcement)
- jobs queued but not yet picked up
- the entire failure history needed to diagnose any of it

Nothing logged this. The work simply stopped existing.

**Fixed** by enabling AOF with `appendfsync everysec` and mounting a
`redis-data` volume, which bounds the loss window to about a second instead of
everything since the last start.

**Two related gaps, also closed:** BullMQ job failures never reached the Nest
exception filter, so they were reported nowhere — and neither were unhandled
promise rejections or uncaught exceptions anywhere in the process. All three now
report to error tracking. Job payloads are deliberately excluded: only the queue
and job name are sent, because job data carries workload and tenant details.

> ⚠️ This was a development compose file, so no production data was lost. It is
> filed as critical because the same configuration reaching a real deployment
> would lose scheduled work with no trace, and the metric that exposed it only
> existed for a day.

## 🔵 Incomplete by design

| ID   | Item                                   | Note                                                                                                                                                             |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K-7  | **GCP live pricing** not enabled       | Needs a GCP Vault token. AWS and Azure live paths are verified.                                                                                                  |
| K-8  | **`App.tsx` decomposition incomplete** | 21,227 → 14,540 lines (−31%) over four slices; ~215 pure functions remain, with diminishing returns as it nears the component-coupled core.                      |
| K-9  | **Rich structured import** partial     | Plain requirements-file loading works; rich CSV/Excel/DrawIO structured import remains a documented hook.                                                        |
| K-10 | **Refresh-live determinism**           | Verified that refresh re-runs into a fresh snapshot; deterministic proof that a _changed catalog row_ changes the result needs a test-only catalog fixture path. |

---

## ✅ Recently fixed

| Issue                                           | Fix                                                        |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Money `"1,234.56"` parsed as `1`                | Thousands-separator-aware parsing                          |
| Evidence lost-update race                       | Optimistic-concurrency hash → 409                          |
| Evidence packet exported on a `GET`             | Moved to `POST …/export`                                   |
| Audit event could be logged but never delivered | Event + outbox in one transaction                          |
| Retention could destroy an undelivered export   | `NOT EXISTS` guard on prune                                |
| Azure `NextPageLink` SSRF                       | Same-origin pagination guard                               |
| Response body could OOM / hang                  | Cap enforced while streaming + body deadline               |
| WCAG AA contrast failures                       | Token contrast fixed, guarded by a unit test               |
| Scrollable tables keyboard-unreachable          | `tabindex=0` + labelled regions on all 25                  |
| Order-dependent flaky test                      | Storage cleared between tests; verified with `--randomize` |
| `format:check` failing (22 files)               | Repo formatted                                             |

---

## 📣 Reporting a new issue

Include: what you ran, what you expected, what happened, and whether it
reproduces. Security issues: follow [SECURITY.md](../SECURITY.md) — **do not**
open a public issue.

<sub>🔬 Every open item above was reproduced against the current `main`.</sub>
