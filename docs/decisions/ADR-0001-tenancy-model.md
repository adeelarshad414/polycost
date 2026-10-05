# ADR-0001: Tenancy model for core data

|                |                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | **Proposed**: awaiting maintainer approval. Implementation must not start before it is accepted.                                     |
| **Date**       | 2026-10-05                                                                                                                           |
| **Audit**      | H-04 (High): "Core data is anonymous and not tenant-scoped". Also SEC-5 in `FULLSTACK-UX-AUDIT.md`.                                  |
| **Decides**    | Who may read and change comparisons, workloads, budgets, alerts, share links, report exports and diagram imports.                    |
| **Supersedes** | The MVP stack decision "Auth (MVP): Optional, stateless; MVP works anonymously; accounts are a fast-follow" (`00-MASTER-PROMPT.md`). |

## 1. Context

PolyCost started anonymous by design. Accounts, teams, SSO and SCIM came later,
but only the account-bound features (teams, billing reconciliation, invoice
artifacts, SCIM) were scoped to a team. Everything a user actually _makes_ is still
reachable by anyone who holds its id. As of `main` at 2026-10-05:

### What is anonymous

| Resource        | Routes                                                                                                 | Access today                        | Gap                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Comparisons     | `POST /comparisons`, `GET /comparisons/:id` (+ evidence, analytics, export, export-jobs, refresh-live) | No auth; per-IP rate limit; v4 UUID | Readable by anyone with the id, forever                                                                |
| Workloads       | `POST /workloads`, `GET /pricing/breakdown?workloadId=`                                                | No auth                             | Readable by anyone with the id                                                                         |
| Budgets         | `POST /budgets` (upsert on `workload_id`)                                                              | No auth                             | **Anyone with a workload id can overwrite its budget**                                                 |
| Alerts          | `GET /alerts?workloadId=`, `PATCH /alerts/:id`                                                         | No auth                             | **Anyone with an alert id can dismiss it**                                                             |
| Share links     | `POST /share-links`, `…/:token/revoke`, `…/:token/analytics`                                           | No auth                             | **Anyone with a workload id can mint links; anyone with a token can revoke one or read its analytics** |
| Diagram imports | `POST /parse/diagram`                                                                                  | No auth                             | Stored without an owner (24 h expiry)                                                                  |
| Terraform       | `POST /terraform/generate`                                                                             | No auth, **no rate limit**          | Stateless, but unthrottled                                                                             |

### What already exists, and what doesn't

- **The schema is half there.** Migration 025 added `team_id` (FK `teams`, `ON DELETE SET NULL`,
  indexed) to `comparisons`, `workloads` and `diagram_imports`. **No code ever writes
  or reads these columns.** The audit's "no `team_id` on comparisons" is out of date, but
  only in the schema: the columns have no effect.
- `budgets`, `alerts`, `share_links`, `report_export_jobs` and
  `workload_cost_observations` have no owner column. They hang off `workload_id` or
  `comparison_id` with `ON DELETE CASCADE`.
- **There are no list endpoints**, so nothing can be enumerated. "Recent comparisons" lives only in
  the browser's `localStorage`. It is **not cleared on logout**, so the next person on a shared
  machine sees it.
- **Cross-tenant bug:** `POST /billing/imports/:id/reconcile` loads _any_ comparison by
  id (`billing.service.ts`), so a team can reconcile its invoices against another
  team's comparison, or an anonymous one, if it knows the id.
- **Sessions:** a bearer token in `localStorage`. The identity carries `accountId`, the
  active `teamId` and `role` (owner, admin or member). The active team is switched with
  `POST /auth/sessions/team`, which only accepts a team the user belongs to.
- **Docs overstate the protection:** `docs/REQUIREMENTS.md` marks FR-6.5 ("tenant-scoped
  access on team-owned resources") and NFR-2.2 ("all tenant data is access-checked") as
  done. They are true only for billing, teams and SCIM.
- **Current mitigations:** 122-bit random ids, no enumeration, per-IP rate limits,
  share-link hardening (hashed tokens, a 90-day cap, passwords in a POST body). None of these
  stops someone who learns an id (a forwarded URL, a log line, a screenshot) from reading it
  forever, or from changing what hangs off it.

### Forces

1. **Anonymous-first is the product.** Comparing without signing up is the top of
   the funnel, the open-source demo (`npm run demo:up`), and what presales use live.
2. **Hosted, multi-tenant use needs real isolation.** A team's comparisons can carry
   confidential architecture and spend. "Unguessable URL" isn't an access-control
   model a CTO will sign off.
3. **Self-hosters vary.** A single team may want anonymous use behind its VPN, while a
   hosted service may want it off.
4. **Be honest about what's protected.** Whatever we choose must be explainable in one
   paragraph and enforced by tests, not by convention.

## 2. Options considered

### Option A: Accounts required everywhere

Every core route requires a session, and all data is team-scoped. Anonymous use is removed.

- ✅ Simplest security model. Nothing is reachable without membership.
- ❌ Removes the product's front door and the one-command demo; every evaluation starts
  with sign-up.
- ❌ Breaks existing capability URLs and share links that people already hold.

### Option B: Keep everything anonymous, and document it

Formally accept capability URLs as the model; add expiry and retention to anonymous rows.

- ✅ No product change, little code.
- ❌ Signed-in teams still get no isolation. The `team_id` columns stay meaningless.
- ❌ Doesn't close the write gaps (budget overwrite, alert dismissal, share-link minting).
- ❌ Fails the audit's "safe for multi-tenant customers" exit criterion.

### Option C: Two ownership modes, chosen per resource (**recommended**)

Every core resource is either **team-owned** or **anonymous**, decided when it's
created, and enforced in one place.

|                                                              | Team-owned                                                                                 | Anonymous                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Created by                                                   | A request with a valid session                                                             | A request without one (when anonymous mode is enabled)                         |
| `team_id`                                                    | The caller's active team                                                                   | `NULL`                                                                         |
| Read                                                         | Members of that team only; **everyone else gets 404** (not 403, so existence doesn't leak) | Anyone with the id (capability URL), as today                                  |
| Change (budgets, alerts, share links, refresh-live, exports) | Members, by role (§3.3)                                                                    | Only with a **write key** returned once at creation, separate from the read id |
| Lifetime                                                     | Kept until deleted                                                                         | **Expires** after `ANONYMOUS_RETENTION_DAYS` (default 30), then pruned         |
| Billing reconciliation                                       | Allowed against the team's own comparisons                                                 | **Never**                                                                      |
| Share links                                                  | Created by members; analytics and revoke by members                                        | Created and revoked with the write key                                         |

Plus a deployment switch, **`ANONYMOUS_MODE=enabled|disabled`**:

- **Default `enabled`**, so the self-hosted and demo experience is unchanged.
- **`disabled`** makes every core route require a session. That's Option A, for a hosted multi-tenant deployment.

## 3. Decision

**Adopt Option C.**

### 3.1 Ownership

- On create, a valid session stamps `team_id` with the session's **active team**.
  Without a session it's `NULL` (anonymous), allowed only when `ANONYMOUS_MODE=enabled`.
- Child records (budgets, alerts, share links, export jobs, observations) **inherit**
  ownership from their workload or comparison. They don't get their own `team_id`; this
  avoids a second source of truth.
- A user with no team can't create team-owned data. They create anonymous data until they
  create or join a team. The UI already says so.

### 3.2 One enforcement point

- A single `ResourceAccess` service answers `canRead`, `canWrite` and `canAdmin` for
  (resource, identity, presented write key). **Every** core controller calls it before the
  repository. No ad-hoc checks.
- Repository reads for team-owned rows include `team_id` in the `WHERE` clause, so a missed
  check fails closed rather than open.
- **A contract test** lists every route with its access class (public reference, anonymous
  capability, team-scoped, admin, health). Adding a route without declaring its class fails CI.

### 3.3 Roles on team-owned data

- **member:** create, read, change budgets and alerts, create share links.
- **admin / owner:** also revoke any share link, delete comparisons and workloads.
- **viewer:** read-only. Can see team comparisons, workloads, reports and alerts, but cannot
  change budgets, alerts or share links, or create data. The role already exists in the
  schema's CHECK constraint and is now modelled in code (decision 3).

### 3.4 Anonymous write key

- At creation, an anonymous workload or comparison gets a random 256-bit **write key**,
  returned once and stored as sha256 (the same pattern as share-link tokens). Reads stay
  capability URLs. Changes need the key in a header (`X-PolyCost-Write-Key`).
- The web app keeps the write key next to its local history, so the person who created the
  resource can still change it, and a forwarded read link can't. A **copy edit key** action
  lets them move it to another device or claim it into a team later (decision 4).

### 3.5 Claiming

A signed-in user who holds an anonymous resource's **write key** can move it into their
active team (`POST /…/:id/claim`). That's the path from "tried it anonymously" to "our
team's comparison". Read access alone can't claim.

### 3.6 Existing data

- Existing rows have `team_id IS NULL`, so they become **anonymous**. Their behaviour is
  unchanged for readers.
- They get **no write key**, so their budgets, alerts and share links become read-only
  until claimed. This is a deliberate tightening; the alternative is leaving the write gap
  open.
- Retention applies to them after a **grace period** (open question 2), not immediately.

### 3.7 Web app

- Send the session token on core calls when signed in.
- Add a **Team comparisons** list (team-owned, server-side) to the workspace.
- **Clear local history and write keys on logout.**
- Show ownership on the results page ("Team: Acme" or "Anonymous, expires in 30 days").

## 4. Consequences

**Positive**

- Team data is isolated and enforced at one point, with a test that fails if a route is
  left unclassified.
- The anonymous funnel and the one-command demo keep working.
- The write gaps (budget overwrite, alert dismissal, share-link minting by id) close for both modes.
- The billing cross-tenant bug is fixed by construction.
- Hosted deployments can switch anonymous mode off entirely.

**Negative / costs**

- About 4–5 PRs (§5), plus web changes. Every core controller is touched.
- **Existing anonymous resources lose write access** until claimed (budgets, alerts and
  share-link management on old workloads).
- Anonymous data now expires, so a bookmarked anonymous comparison stops working after the
  retention period. The UI must say so up front.
- Two modes are more to explain than one. The README section is rewritten to match.

**Neutral**

- Rate limits stay per-IP for anonymous traffic. Team-owned traffic can later be limited
  per team.

## 5. Implementation plan (each step is one PR, gated by this ADR)

1. **P2-1a Enforcement foundation.** `ResourceAccess`, the route-classification contract test,
   `ANONYMOUS_MODE`, ownership stamping on create, 404 for non-members on reads.
   Fix billing reconcile to require a same-team comparison. Rate-limit `/terraform/generate`.
2. **P2-1b Write keys and claiming.** A migration for `write_key_hash` on workloads and
   comparisons, enforcement on every change route, `POST …/claim`.
3. **P2-1c Retention.** `ANONYMOUS_RETENTION_DAYS` in the scheduled retention sweep, with a grace
   period for existing rows, and metrics for what was pruned.
4. **P2-1d Web.** Send the token on core calls, the Team comparisons list, ownership badges, clearing
   history and keys on logout, and a claim action.
5. **P2-1e Docs.** Rewrite the README "Anonymous and Workspace Features" section and `11-SECURITY.md`
   authn/authz, correct REQUIREMENTS FR-6.5 / NFR-2.2, and update DIAGRAMS.

## 6. Decisions (resolved 2026-10-05)

| #   | Question                                                        | Decision                                                                                                                                                                    |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should hosted deployments default to `ANONYMOUS_MODE=disabled`? | **Default `enabled`.** The Helm chart sets the value explicitly (`config.anonymousMode`), so every Kubernetes install makes a deliberate choice, like `USE_MOCK_PROVIDERS`. |
| 2   | Anonymous retention                                             | **30 days** for new anonymous data. **A 60-day grace period** for rows that exist when retention ships. The UI shows the expiry.                                            |
| 3   | The `viewer` role                                               | **Implement it as read-only** (§3.3).                                                                                                                                       |
| 4   | Write-key handling                                              | **Kept in the creating browser, plus a "copy edit key" action** for other devices and for claiming.                                                                         |

## 7. Verification (definition of done for H-04)

- The contract test classifies every route; no route is unclassified.
- Integration tests prove that a member of team A gets **404** reading, and **404 or 403**
  changing, a team-B comparison, workload, budget, alert, share link and export job.
- Anonymous changes without the write key are rejected. With the key, they succeed.
- Billing reconcile rejects another team's comparison and anonymous comparisons.
- With `ANONYMOUS_MODE=disabled`, every core route returns 401 without a session.
- Docs no longer claim protection that the code doesn't enforce.
