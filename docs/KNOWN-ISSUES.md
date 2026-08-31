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

|            |                                                 |
| ---------- | ----------------------------------------------- |
| **Status** | 🟠 Open — architectural decision needed         |
| **Found**  | 2026-08-31, while clearing the Dependabot queue |

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

## 🟠 K-12 · The `impeccable` gate silently skips on CI's Node version

|            |                                                   |
| ---------- | ------------------------------------------------- |
| **Status** | 🟠 Open — 24 findings unreviewed                  |
| **Found**  | 2026-08-31, while landing the `/metrics` endpoint |

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

Until then, treat an `impeccable` failure on a local commit as expected, and
verify it reproduces on a clean tree before bypassing.

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
