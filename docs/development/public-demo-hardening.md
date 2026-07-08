# Public Demo Hardening

PolyCost is prepared for an eventual public open-source launch, while the GitHub
repository can remain private until the maintainer intentionally changes visibility.
This page is the reviewer-facing checklist for a polished public demo and community
handover.

## Current Verdict

Status: private-demo ready with explicit production boundaries.

PolyCost is ready to show as a self-hosted, decision-grade cost comparison product.
It should not yet be marketed as invoice-grade billing software, full Visio rendering,
production enterprise identity management, or complete landing-zone Terraform.

## Public Demo Modes

| Mode              | Command                          | Purpose                                                                               | Evidence                           |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| One-command demo  | `npm run demo:up`                | Clean local startup for reviewers                                                     | Health checks and seeded demo data |
| Clean-clone proof | `npm run demo:verify-clean`      | Confirms a new clone can reach a running demo within the startup budget               | Timed verifier output              |
| Demo artifacts    | `npm run demo:artifacts`         | Captures executive, engineering, mobile, and walkthrough artifacts                    | `docs/demo-artifacts/`             |
| Browser audit     | `npm run browser:audit`          | Captures screenshots, reflow/zoom evidence, axe accessibility, and Lighthouse metrics | `docs/browser-audit/`              |
| Release guard     | `npm run public:readiness:check` | Verifies public-readiness docs, templates, security posture, and demo evidence hooks  | Terminal pass/fail output          |

## Repository Health Checklist

Before changing repository visibility to public, confirm:

- `README.md` describes PolyCost as decision-grade estimating, not billing or invoice
  reconciliation.
- `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`,
  `GOVERNANCE.md`, and `CHANGELOG.md` are current.
- `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`,
  and `.github/dependabot.yml` exist and render correctly.
- `.env`, `.env.local`, provider credentials, customer diagrams, invoices, and
  confidential pricing agreements are not tracked.
- Cloud provider names are used descriptively; provider logos are not committed or
  shown as endorsements.
- Known limits remain visible in `handover/KNOWN-LIMITS.md` and
  `HANDOVER-EXCELLENCE-REPORT.md`.

## Demo Reviewer Path

1. Start with `docs/HOW-TO-USE.md` for the product workflow.
2. Use `handover/DEMO-SCRIPT.md` for the 10-minute stakeholder walkthrough.
3. Show executive analytics first, then expand engineering evidence.
4. Open pricing evidence from a result so reviewers can inspect provider, SKU, source
   URI, transform version, confidence, and derivation math.
5. Generate PDF, CSV, and Excel exports.
6. Show Terraform starter bundle generation as reviewed starter IaC, not as applied
   production infrastructure.
7. Close with `handover/KNOWN-LIMITS.md` so the demo is credible and bounded.

## Verification Floor

Run before a public demo:

```bash
npm run format:check
npm run ci:lint
npm run public:readiness:check
npm run release:check
npm run handover:check
npm run browser:audit
npm run test:production-readiness
npm run ci:build
```

For a full local release rehearsal, run:

```bash
npm run check
npm run demo:verify-clean
npm run demo:artifacts
npm run browser:audit
```

`demo:artifacts` requires the web app to be reachable. Set `DEMO_WEB_URL` when the
demo is running on a non-default host or port.

## Blocked Or Deferred

- `npm run browser:audit` now runs formal axe-core and Lighthouse checks locally on
  Node 20 using the deterministic browser-audit server. Keep refreshing
  `docs/browser-audit/` before public demos so the dated evidence remains current.
- Real provider, production SSO, production LLM, and Terraform provider validation
  require external credentials or a staging environment.
- Hosted GitHub Actions must be able to allocate runners before remote CI is used as
  release evidence.
