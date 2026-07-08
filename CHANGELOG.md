# Changelog

All notable changes to PolyCost will be documented in this file.

The format is inspired by Keep a Changelog, and this project uses semantic versioning
once tagged releases begin.

## Unreleased

### Added

- Loading/progress experience system with shared `BootSplash`, `SessionLoader`,
  skeleton presets, progress bars, task queue, job toast, and live-tail components.
- Loading inventory and audit report with `npm run loading:check` wired into the
  full local regression floor and release-readiness validation.
- Customer handover documentation package: usage guide, deployment guide, runbook,
  competitive comparison, architecture overview, and handover evidence ledger.
- Final handover excellence package with census, design-system handoff, journey
  evidence, known-limits register, demo script, and screenshot gallery index.
- `npm run handover:check` gate, wired into the full `npm run check` regression
  floor and release-readiness validation.
- Open-source readiness files: license, contribution guide, support policy,
  governance notes, issue templates, pull request template, CODEOWNERS, and
  dependency update configuration.
- One-command self-hosted demo startup and demo artifact capture scripts.
- Account, team, invite, session, billing-reconciliation, and mock SSO readiness
  surfaces on top of the anonymous comparison workflow.
- Machine-readable release readiness check covering community files, README demo
  path, public-release checklist language, issue templates, and the security ledger.
- Public demo hardening guide and `npm run public:readiness:check` gate covering
  community files, demo evidence hooks, tracked environment files, provider-logo
  safeguards, and public-launch honesty language.
- Browser audit command with desktop, 320px reflow, and 200% zoom-equivalent
  screenshot artifacts plus formal axe-core accessibility and Lighthouse
  performance/accessibility/best-practices/SEO evidence.
- Canonical overlay/dialog/drawer/popover/toast/banner primitives, expanded shared
  button variants, and the `npm run overlay:check` guard.
- Terraform bundle integrity verifier generated in every ZIP handoff, with
  manifest hash/size checks and tamper-detection regression coverage.
- Azure Cost Management and nested GCP Billing Export mapper hardening with
  allocation tag/label evidence for estimate-vs-actual reconciliation.
- Backend-backed active workspace/team switching with membership-checked session
  updates and a signed-in account-panel selector.
- Workspace invitation resend lifecycle with guarded token-hash rotation, visible
  pending/expired invite status, and refreshed one-time invite links for demos.
- Invite delivery webhook foundation with local panel mode, production HTTPS webhook
  mode, HMAC signatures, config guards, and browser-safe delivery receipts.
- Append-only team audit trail foundation for team, invite, SSO, billing import,
  and reconciliation actions, with guarded admin API reads and workspace UI visibility.
- Transaction-coupled audit writes for privileged team, invite, SSO, billing import,
  and reconciliation mutations.
- Team audit export outbox with signed webhook delivery, retry/dead-letter status, and
  staging/production config guards.
- Audit export receiver smoke scripts for local HMAC contract proof and staging
  SIEM/WORM canary acceptance evidence.
- Approximate VSDX SVG visual previews generated from extracted page geometry, with
  browser rendering and explicit non-pixel-perfect Visio caveats.
- Invoice adjustment classification for imported actuals, separating usage rows from
  taxes, credits, discounts, support, marketplace charges, refunds, fees, and other
  non-usage adjustments in reconciliation evidence and the workspace billing panel.
- Provider commitment billing semantics for reconciliation evidence, including
  covered usage, commitment discounts/negations, recurring or upfront commitment
  fees, and amortization or unused commitment rows.
- Commitment evidence requirements in reconciliation summaries, showing rows that
  still need provider inventory, amortization-period proof, or allocation evidence
  before invoice-grade interpretation.
- Invoice-grade readiness matrix for actuals reconciliation, listing present,
  partial, missing, and not-applicable billing evidence with required provider
  artifacts and blockers.
- Invoice artifact metadata registration for reconciliations, including an
  Owner/Admin API route, audit event, workspace action, registered/verified counts,
  control-total deltas, and explicit "metadata registered, not verified" caveats.
- Invoice artifact verification status for registered reconciliation artifacts,
  including checksum/control-total mismatch rejection, verified/rejected review
  evidence, readiness updates limited to covered checks, and workspace verification
  action.
- Invoice artifact blob storage for registered reconciliation artifacts, including
  database-backed upload/download APIs, raw-byte SHA-256 validation, MIME/file-name
  guards, metadata-only reconciliation evidence, audit events, and workspace
  store/download actions.
- Invoice artifact legal-hold administration for stored reconciliation artifacts,
  including Owner/Admin PATCH API, persistence/evidence synchronization, audit event,
  and workspace place/release action.
- Invoice artifact review workflow for stored reconciliation artifacts, including
  pending/approved/rejected review state, Owner/Admin API routes, audit event,
  workspace send/approve/reject actions, and register-level review counts.
- Invoice artifact storage readiness and retention enforcement foundation, including
  production-bound config guards for external object storage/KMS/webhook scanning,
  strict credential-check coverage, signed scanner webhook integration, and admin
  retention enforcement for expired non-held database-backed artifacts.
- Invoice artifact governance metadata for stored artifacts, including retention
  windows, legal-hold state, KMS production-readiness flags, and an EICAR-signature
  scan hook that blocks known test-malware content before storage.
- Provider-native invoice artifact object storage adapters for AWS S3, Azure Blob
  Storage, and GCP Cloud Storage, including Vault-backed credentials, object pointer
  persistence, checksum-verified reads, and production credential-check coverage.
- External invoice artifact retention deletion now purges AWS S3, Azure Blob Storage,
  and GCP Cloud Storage objects before deleting expired non-held database pointers.

### Notes

- The repository is prepared for an eventual public open-source launch while the
  GitHub repository remains private.
- Loading UX now follows delay-mounted indicators, real step/phase labels, token-only
  styling, reduced-motion overrides, and explicit blocked notes for API progress that
  is not yet measurable.
- Customer handover is now documented as private-demo ready with explicit caveats for
  invoice-grade pricing, full Visio rendering, production enterprise auth, and full
  landing-zone Terraform.
- Production-readiness hardening now includes pricing catalog lineage, SKU evidence
  derivation checks, UI-priced service coverage guards, VSDX partial-parse evidence,
  Tier 3 diagram classifier fallback diagnostics, RBAC UI controls aligned to API
  authorization, and an explicit security suppression/advisory ledger.
- Billing reconciliation now has native export mapper evidence for AWS CUR, Azure
  Cost Management CSV, and nested GCP Billing Export JSON, plus adjustment-aware
  usage-comparable variance, commitment row evidence, invoice artifact metadata
  registration/verification status, database-backed artifact file storage, provider
  object-storage adapters, external object retention deletion, and artifact governance
  metadata plus an internal artifact review status workflow. Provider invoice-of-record
  validation, real malware scanning operation, external reviewer workflow automation,
  and legal retention workflow enforcement remain future scope.
- Account/team UX now supports switching the current active workspace without a
  new login, refreshing pending/expired invite tokens, and handing invite links to
  a signed delivery webhook, while provider-specific email templates, SSO/SAML,
  SCIM, recovery, and org-billing administration remain future scope.
- Remaining future work is intentionally documented: full invoice-grade live cloud
  billing coverage, full Visio visual rendering, hosted/team account product depth,
  production email/SSO/SCIM workflows, and provider-authenticated Terraform plan
  execution.

## 0.1.0

### Added

- V1 MVP multi-cloud comparison workflow.
- Natural-language, structured-form, and diagram-input paths.
- AWS, Azure, and GCP side-by-side estimates.
- Daily, weekly, monthly, quarterly, and yearly cost views.
- PDF, CSV, and Excel report exports.
- FinOps workflows for budgets, alerts, exchange rates, share links, and report
  evidence.
- Pricing traceability foundation and provider billing export reconciliation
  foundation.
- Backend/session primitives and early team/RBAC/SSO readiness paths.
- Layout-aware VSDX extraction, without full Visio visual rendering.
