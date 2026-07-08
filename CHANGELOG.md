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
- Open-source readiness files: license, contribution guide, support policy,
  governance notes, issue templates, pull request template, CODEOWNERS, and
  dependency update configuration.
- One-command self-hosted demo startup and demo artifact capture scripts.
- Account, team, invite, session, billing-reconciliation, and mock SSO readiness
  surfaces on top of the anonymous comparison workflow.
- Machine-readable release readiness check covering community files, README demo
  path, public-release checklist language, issue templates, and the security ledger.

### Notes

- The repository is prepared for an eventual public open-source launch while the
  GitHub repository remains private.
- Loading UX now follows delay-mounted indicators, real step/phase labels, token-only
  styling, reduced-motion overrides, and explicit blocked notes for API progress that
  is not yet measurable.
- Production-readiness hardening now includes pricing catalog lineage, SKU evidence
  derivation checks, UI-priced service coverage guards, VSDX partial-parse evidence,
  Tier 3 diagram classifier fallback diagnostics, RBAC UI controls aligned to API
  authorization, and an explicit security suppression/advisory ledger.
- Remaining future work is intentionally documented: full invoice-grade live cloud
  billing coverage, full Visio visual rendering, hosted/team account product depth,
  production email/SSO/SCIM workflows, and Terraform generation.

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
