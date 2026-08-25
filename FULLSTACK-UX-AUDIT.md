# PolyCost — Full-Stack + UI/UX Audit

**Date:** 2026-08-20
**Scope:** Backend (NestJS/Fastify API + provider adapters), Database (Postgres), Frontend (React/Vite), UI/UX & accessibility.
**Method:** One completed specialist agent (adapters/HTTP security) plus direct code probes. The deeper backend/DB/frontend/UX agents were interrupted by a session limit (resets 23:40) — a re-run would add depth, but the high-severity findings below are confirmed against real code.

> Note: this audit is about the *application*, separate from the pricing-accuracy remediation (PRs #115–#124), which is already merged.

---

## 🔴 Top 5 to fix first

1. **`apps/web/src/App.tsx` is 21,227 lines** — an extreme single-file React god-component. Unreviewable, hard to test, and a re-render/perf risk. Split into feature modules.
2. **ETL catalog upsert is N+1 writes** — `upsertPricingRecords` runs one `INSERT` per record in a loop (`pricing-catalog.repository.ts:145-148`). A live refresh of thousands of SKUs = thousands of sequential round-trips → very slow ETL. Batch (multi-row INSERT or `COPY`).
3. **HTTP client can OOM / hang** (adapters): the 64 MB cap is bypassed on chunked responses (no `Content-Length`), the timeout only covers headers (not the body), and pagination is unbounded. See Backend HIGH-1/2/3.
4. **Azure SSRF via unvalidated `NextPageLink`** — the next page URL comes from the response body and is fetched with no host/scheme check (`azure-provider.adapter.ts:118,134`).
5. **No graceful shutdown** — `main.ts` never calls `enableShutdownHooks()`, so on SIGTERM the BullMQ workers and PG pool aren't drained (in-flight ETL/exports can be cut off, connections leak).

---

## Backend / Adapters

### HIGH
- **H-B1 — Response-size cap bypassed on chunked bodies.** `http-client.ts:65-66` reads `content-length`; when absent (chunked, common for large paginated JSON), `Number('')=NaN`, the guard is skipped, and `response.text()` buffers unbounded → OOM. Enforce the cap while reading the body, not from the header.
- **H-B2 — Timeout covers headers only, not the body.** `http-client.ts:42-54` clears the abort timer once `fetch()` resolves (headers). Body download (incl. the AWS 480 MB stream) then runs untimed → slow-loris hang. Keep an overall deadline armed through body consumption.
- **H-B3 — Synchronous `JSON.parse` of up to 64 MB blocks the event loop.** `http-client.ts:75-81`. Azure/GCP never use the streaming path; a multi-MB page stalls all concurrent requests. Stream-parse or cap page size well below 64 MB.
- **H-B4 — Unbounded pagination.** Azure `while (nextPageUrl)` and GCP `do…while (pageToken)` have no max-page, cumulative-size, or wall-clock ceiling → infinite loop / OOM on a misbehaving feed. Add caps.

### MEDIUM
- **M-B1 — Azure SSRF via `NextPageLink`** (`azure-provider.adapter.ts:118`). Validate host/scheme against the pinned endpoint before fetching.
- **M-B2 — No graceful shutdown.** `main.ts` lacks `enableShutdownHooks()`; BullMQ/PG not drained on SIGTERM.
- **M-B3 — AWS bulk temp-file spool has no disk cap** (`aws-bulk-stream.ts:37`) → disk-fill DoS; also read 3× (~1.4 GB reads per 480 MB refresh).
- **M-B4 — GCP `getOptionalSecret` swallows all errors** (`gcp-provider.adapter.ts:305-314`) → a Vault outage looks identical to "credential not set". Distinguish not-found from failure.
- **M-B5 — Provider error bodies embedded verbatim in exceptions** (`adapter-errors.ts:15-18`) → raw upstream/token-endpoint bodies land in logs unredacted. Truncate/redact.
- **M-B6 — Per-page/per-service failure aborts the whole refresh.** One transient failure discards all accumulated records (the ETL service retries at the *provider* level, but there's no partial-result tolerance within a provider).

### LOW
- **L-B1 — AWS `$0` price coercion** (`aws-provider.adapter.ts:271`): `USD ?? '0'` turns a missing price into a $0 record that "cheapest-wins" then prefers. Skip the dimension instead.
- **L-B2 — Dead SigV4 module** (`aws/aws-signature-v4.ts`) — unused; remove or wire+harden.
- **L-B3 — No global `ValidationPipe`/`enableVersioning`.** Validation is manual (zod in controllers) and versioning is a hardcoded `api/v1` prefix — acceptable, but confirm every mutating route validates its body.

---

## Database (Postgres)

### HIGH
- **H-D1 — N+1 write in `upsertPricingRecords`** (`pricing-catalog.repository.ts:145`): one parameterized `INSERT … ON CONFLICT` per record inside a JS loop. Thousands of SKUs → thousands of round-trips. Batch into multi-row `INSERT` (or `COPY` + upsert) — likely 10–100× faster ETL.

### MEDIUM
- **M-D1 — No GIN/expression index for JSONB & prefix filters.** `getDataHealth` filters `attributes->>'source'` and the new prune filters `source_endpoint LIKE 'https://%'` — neither is index-backed, so both sequential-scan `pricing_catalog` (which now holds tens of thousands of live rows). Add an expression index on `(provider, (attributes->>'source'))` and/or on `source_endpoint text_pattern_ops`.
- **M-D2 — `fetched_at < $2` prune scan.** The prune (`pruneStaleLiveRows`) has no composite index on `(provider, source_endpoint, fetched_at)`; add one to avoid a full scan on every refresh.

### GOOD
- SQL is consistently parameterized (no injection). 65 indexes defined. Transactions are used for the outbox/audit atomic writes (26 references).

---

## Frontend (React/Vite)

### HIGH
- **H-F1 — 21,227-line `App.tsx`.** A single component holding the entire app (auth, comparison, FinOps, billing, diagram import, exports…). Unmaintainable, hard to test in isolation, and likely causes broad re-renders. Extract routed feature modules + context; target < ~500 lines per file.

### MEDIUM
- **M-F1 — Bearer token in `localStorage`** (`polycost-auth-session-v1`). XSS-exfiltratable. Prefer an httpOnly cookie, or accept the documented risk with a strict CSP.
- **M-F2 — Demo credentials pre-filled in the login form.** `App.tsx:1964-1968` seeds `email='architect@example.com'`, `password='correct horse battery staple'`, `displayName='Architecture Lead'`. Pre-filling a password field is bad practice and ships demo creds to production — gate behind a dev flag or remove.

### GOOD
- `AppErrorBoundary` is wired at the root (`main.tsx`). No `dangerouslySetInnerHTML` in the main surface.

---

## UI/UX & Accessibility

### GOOD foundation
- Strong ARIA usage (373 `aria-*`, 93 `role=`), skip links (21), `focus-visible` styling (73), and a theme-token system with a `theme:hex:check` guard.

### MEDIUM
- **M-U1 — Weak reduced-motion support.** Only **1** `prefers-reduced-motion` guard across the app, despite an animation-heavy loading/overlay system. Vestibular-sensitive users get unmitigated motion. Wrap transitions/animations in a reduced-motion media query.
- **M-U2 — Sparse live-region announcements.** Only **3** `aria-live` regions. Dynamic results (comparison completion, async export status, inline errors, toasts) may not be announced to screen readers. Add polite/assertive live regions for those flows.
- **M-U3 — Incomplete form-label association.** ~32 `<input>` but only 10 `htmlFor` bindings in `App.tsx`. Some inputs likely rely on visual proximity, not programmatic labels. Bind every control with `htmlFor`/`id` (or `aria-label`).

### LOW
- **L-U1 — 84 hardcoded hex colors** in web components/CSS despite the token system — verify these aren't bypassing light/dark theming (some may be legitimate token definitions).
- **L-U2 — Mixed number formatting** (`Intl.NumberFormat` + `toLocaleString` + `toFixed`) — standardize a currency/number formatter for consistent, locale-aware money display.

---

## Suggested sequencing
1. **Quick wins / safety:** M-F2 (remove demo creds), M-B2 (shutdown hooks), L-B1 (AWS $0), M-B5 (redact error bodies).
2. **Resilience:** H-B1/2/3/4 + M-B1 (harden `http-client` + pagination + SSRF) — one focused pass on the shared adapter layer.
3. **Performance:** H-D1 (batch upsert) + M-D1/2 (indexes) — big ETL speedup.
4. **Accessibility:** M-U1/2/3 — a contained a11y pass.
5. **Big refactor (own initiative):** H-F1 — decompose `App.tsx`.

---

# Deep-dive findings (full specialist agent re-run, 2026-08-20)

The four deep agents completed. These go **beyond** the baseline above. Most severe first.

## 🔴🔴 SECURITY BLOCKERS (backend) — Phase 0 status

**FIXED & merged:** SEC-1 (#125), SEC-2 (#125), SEC-3 (#126), SEC-4 (#127), SEC-5 hardened via Option A (refresh-live rate-limit verified per-IP + bounded live-pricing cache + capability-URL model documented in README). The findings below are retained for the record.



- **SEC-1 — `GET /api/v1/alerts` is unauthenticated and dumps every tenant's alerts.** No guard; `listAlerts` runs `WHERE ($1::uuid IS NULL OR workload_id=$1)` and with `workloadId` omitted returns **all budget alerts for all tenants** (thresholds, observed spend, anomaly %, messages). `api-database.repository.ts:1685-1706`, `cost-management.controller.ts:184`.
- **SEC-2 — Cross-tenant destructive delete (IDOR).** `enforceInvoiceArtifactRetention` only checks the *caller's* team admin, then runs **global, unscoped** `deleteInvoiceArtifactBlobsByIds`. With `INVOICE_ARTIFACT_RETENTION_ENFORCEMENT_MODE=delete-expired`, one team's admin can permanently delete **every tenant's** expired invoice artifacts (DB rows + S3/Azure/GCS objects). `billing.service.ts:1253-1291`, `api-database.repository.ts:4842-4922`.
- **SEC-3 — Invoice-artifact re-upload breaks WORM guarantees.** The upsert `ON CONFLICT DO UPDATE SET content=…, legal_hold=EXCLUDED.legal_hold, retention_until=EXCLUDED.retention_until` lets a re-upload overwrite "immutable" evidence bytes, **turn off an active legal hold**, and shorten retention. `billing.service.ts:708-837`, `api-database.repository.ts:4509-4539`.
- **SEC-4 — Mock OIDC callback = authentication bypass (no prod gate).** `completeMockOidcCallback` takes the caller-supplied `email` from the query (state doesn't bind it) and mints a real session for any OIDC-configured team. Nothing disables the mock routes in production. `auth.service.ts:703-735`, `auth.controller.ts:216-247`.
- **SEC-5 (HIGH) — Whole comparison + cost-management surface is unauthenticated, "public-by-secret-URL".** `getComparison(id)`, workloads, budgets, alerts, share-links carry no tenant binding; UUIDs never expire; `POST /comparisons/:id/refresh-live` lets any URL-holder trigger paid provider API calls. Decide explicitly (bind+guard, or document capability-URLs + expiry + abuse controls).

Other backend HIGH/MED: stale-role privilege via session cache (`auth.service.ts:884`); share-link password in the **URL query** and revoke/analytics reachable by any token-holder (`cost-management.*:299/138`); **non-USD invoice costs summed as USD** (`billing.service.ts:1549-1604`) — wrong reconciliation variance; lost-update race on `reconciliation.evidence` (non-transactional read-modify-write); **unbounded NWS arrays** (no `.max()`, `nws.types.ts:247-249`) → single-request DoS; `getInvoiceEvidencePacket` fires the notary webhook + audit write **on a GET**; `firstNumber`/`parseFloat` mis-parses `"1,234.56"`→`1`; `AUTH_SSO_STATE_SECRET` ships a hardcoded dev default (`config.schema.ts:77`).

## 🟠 Database (deep)
- **DB-1 (HIGH) — Migrations lock large tables & aren't atomic/re-runnable.** `033/034/039` full-scan-validate / rewrite `invoice_artifact_blobs` (1 MB blobs) under `ACCESS EXCLUSIVE`; the `team_audit_events` action CHECK is dropped+rebuilt every release (035-039); `db.mjs` runs `psql -f` with no transaction, and `033` isn't `IF NOT EXISTS`-guarded so a partial failure can't re-apply. No in-place prod migrator (init only runs on empty data dir). `scripts/db.mjs:191`, `033/034/039_*.sql`.
- **DB-2 (HIGH) — No retention on the fastest-growing tables.** `comparison_audit_logs`, `team_audit_events`, the delivered outbox (`team_audit_event_exports`), `account_sessions`, `exchange_rates`, `pricing_etl_runs` are all append-only with **zero cleanup** → unbounded storage/index bloat.
- **DB-3 (HIGH) — Compliance/evidence writes non-atomic.** `recordTeamAuditEvent` (pool path) inserts event + outbox as two autocommits (`:2878/2929`) → logged-but-never-exported events; comparison persist + its audit trail are two separate writes (`comparison-application.service.ts:106`).
- **DB-4 (HIGH) — Hot paths full-scan / N+1.** `getDataHealth` full-scans `pricing_catalog` with per-row JSONB+`LIKE` on every poll (`:996`); invoice import inserts line items one row per round-trip in one long transaction (`:4060`).
- **DB-5 (HIGH) — `timestamp` (no tz) on the compliance audit table** (`team_audit_events.created_at`) and the oldest pricing/comparison tables, compared against UTC `new Date()` — ambiguous ordering + freshness/prune drift by the server's UTC offset. Migrate to `timestamptz`.
- MED: money summed in JS float (columns are correctly `NUMERIC`); `ON DELETE SET NULL` orphans tenant rows (`workloads`/`comparisons`/`invoice_line_items`); min-price read sorts on an unindexable `attributes->>'source'` CASE (`pricing-catalog.repository.ts:131`).

## 🟠 Frontend (deep)
- **FE-1 (HIGH) — Render storm:** `App()` = 112 `useState` / 19 `useEffect` / **0 `useMemo` / 0 `useCallback`**; every keystroke recomputes ~21 provider×line-item datasets + re-renders ~20 panels (`App.tsx:11088`).
- **FE-2 (HIGH) — Effect overwrites user input:** Terraform topology/availability selections reset on any unrelated form change (`App.tsx:18167`); same class at team-name field (`:2171`).
- **FE-3 (HIGH) — `(await response.json()) as T` for all ~90 endpoints** (`api-client.ts:1061`); a malformed 200 crashes the whole app via the error boundary. (File is otherwise clean — 0 `any`.)
- **FE-4 (HIGH) — No code-splitting;** entire 21K-line app + `recharts` load synchronously on first paint.
- **FE-5 (MED) — No request cancellation / retry / refetch-on-focus;** workspace load is all-or-nothing `Promise.all` (one failure discards 5 good responses); 60 s export poll can't be cancelled.
- MED/LOW: timestamps rendered in browser-local time with no TZ label (bad for audit/invoice context); index-in-key on data lists; USD-only display despite an exchange-rate API. **Strengths:** async-action id guard + `isMounted` cleanups are correct; error-message scrubbing thorough; localStorage parsing fully sanitized.

## 🟠 UI/UX & Accessibility (deep)
- **UX-1 (HIGH) — Contrast failures at the token level (WCAG AA).** Muted text `--ink-400/--text-muted #8b8880` ≈ **3.4:1** (both themes); success `--status-ok #2e9e76` ≈ 3.4:1 (light); provider brand hex used as **text** (`--brand-blue/orange/green`) ≈ 3.6–3.9:1 (light) — accessible `*-label-tint` tokens already exist but are used in only ~8 rules. `tokens.css:11,12,51-53`.
- **UX-2 (HIGH) — `Popover` has zero focus management** (no focus-in, trap, or focus-return) despite `role="dialog"` (`OverlayPrimitives.tsx:277-322`). (Dialog/Drawer are excellent by contrast.)
- **UX-3 (HIGH) — Horizontally-scrollable tables aren't keyboard-reachable** (`.table-wrap`/`.bulk-service-table-wrap` lack `tabindex="0"`), and `overflow-x:clip` on the root can hide overflow with no scrollbar → off-screen comparison columns unreachable at 320px/200% zoom. `styles.css:18,8837,4509`.
- **UX-4 (MED) — Requirement input tabs are a broken ARIA tab pattern** (no `tabpanel`, `aria-controls`, or arrow-key roving) `App.tsx:6063`; per-field errors not associated (54 inputs, 3 `aria-invalid`/`aria-describedby`) — only a lumped `role="alert"` summary `App.tsx:8496`.
- MED/LOW: 36px compact touch targets; two import tables miss `scope`/`caption`; duplicate `id="page-title"`/multiple `<h1>` risk; charts encode series by color only. **Strengths:** Dialog/Drawer focus lifecycle, ConfirmDialog type-to-confirm + Cancel-default, skip link, `tabular-nums` currency alignment, `role="img"`+`<title>` on charts.
