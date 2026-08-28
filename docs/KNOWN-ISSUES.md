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

### K-3 · `pre-push` hook is impractical to satisfy locally

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
