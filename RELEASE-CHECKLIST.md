# Public Open-Source Release Checklist

Complete this checklist before changing the GitHub repository visibility from private to public.

## Secrets And History

- Rotate any local/demo credentials that may have been used during development.
- Run a git-history secret scan with the final release branch checked out.
- Confirm `.env` is ignored and not committed.
- Confirm `.env.example` contains placeholders only.
- Confirm Vault seed values are local-development only.
- Verify `DUMMY-VALUES.md` and `docs/PROVIDER-CREDENTIALS.md` match the release configuration.

## Repository Settings

- Keep the repository private until this checklist is complete.
- Enable branch protection on `main`.
- Require the CI workflow to pass before merge.
- Confirm GitHub Actions jobs can start. Resolve account billing, spending-limit,
  or runner-quota blockers before treating CI as release evidence.
- Require pull request review for external contributions.
- Enable Dependabot alerts and security updates.
- Confirm issue templates and PR template render correctly.

## Legal And Community

- Confirm `LICENSE` is the intended project license.
- Review `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, and `GOVERNANCE.md`.
- Review the customer handover package:
  `docs/HOW-TO-USE.md`, `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`,
  `docs/COMPARISON.md`, `docs/ARCHITECTURE.md`, and
  `docs/CUSTOMER-HANDOVER-LEDGER.md`.
- Review the final handover excellence artifacts:
  `HANDOVER-CENSUS.md`, `HANDOVER-EXCELLENCE-REPORT.md`, and
  `handover/HANDOVER-README.md`.
- Review the public demo hardening checklist:
  `docs/development/public-demo-hardening.md`.
- Confirm trademark-sensitive cloud logos are not present in the UI.
- Confirm docs describe AWS/Azure/GCP as provider integrations, not endorsements.

## Product Honesty

- Confirm README and reports describe pricing as catalog list-price estimates, not invoices.
- Confirm known future gaps remain plainly stated: invoice-grade billing, full visual VSDX rendering, formal SCIM/SSO certification and production RBAC polish, and Terraform/V3.
- Confirm current VSDX preview evidence is archived with
  `npm run vsdx:visual-evidence:check -- --require-human-review <bundle.json>`
  before claiming reviewed VSDX visual proof.
- Confirm production diagram-classifier evidence is archived with
  `npm run diagram:llm-corpus:check -- --require-live-model <bundle.json>` before
  claiming production LLM quality.
- Confirm managed enterprise IdP pilot evidence is archived with
  `npm run enterprise:idp:evidence:check -- --require-managed-idp <bundle.json>`
  before claiming Okta/Entra/Auth0/Google Workspace SSO plus SCIM pilot readiness.
- Confirm provider invoice-of-record pilot evidence is archived with
  `npm run invoice:record:evidence:check -- --require-provider-invoice <bundle.json>`
  before claiming invoice-grade finance pilot readiness.
- Confirm destination Terraform evidence can be assembled from runner artifacts with
  `npm run terraform:evidence:capture:smoke` before claiming Terraform destination-plan
  handoff readiness.
- Confirm `docs/SECURITY-SUPPRESSIONS.md` is current.
- Confirm `npm run security:audit` passes the high/critical gate.
- Confirm audit export receiver evidence is archived before claiming SIEM/WORM
  readiness: local proof from `npm run audit:export:smoke:local`, and staging
  proof from `npm run audit:export:smoke` when a real receiver is configured.
- Confirm invoice evidence notary receiver evidence is archived before claiming
  external notary/WORM handoff readiness: local proof from
  `npm run invoice:evidence:notary:smoke:local`, and staging proof from
  `npm run invoice:evidence:notary:smoke` when a real HTTPS receiver is
  configured.
- If using PolyCost's reference receiver for staging, confirm
  `npm run invoice:evidence:notary:receiver:smoke` passed and the JSONL artifact
  directory is backed by WORM/object-lock storage before claiming immutability.

## Verification

- Run `npm ci`.
- Run `npm run demo:up` from a clean clone or freshly reset local workspace.
- Run `npm run demo:verify-clean` to prove the clean-clone demo path stays under
  the 10-minute startup budget.
- Run `npm run format:check`.
- Run `npm run overlay:check`.
- Run `npm run public:readiness:check`.
- Run `npm run browser:audit`.
- Run `npm run audit:export:smoke:local`.
- Run `npm run invoice:evidence:notary:smoke:local`.
- Run `npm run invoice:evidence:notary:receiver:smoke`.
- Run `npm run terraform:evidence:capture:smoke`.
- Run `npm run vsdx:visual-evidence:check`.
- Run `npm run diagram:llm-corpus:check`.
- Run `npm run enterprise:idp:evidence:check`.
- Run `npm run invoice:record:evidence:check`.
- Run `npm run release:check`.
- Run `npm run loading:check`.
- Run `npm run handover:check`.
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run ci:unit` to execute coverage and the pricing-logic coverage gate.
- If coverage was run manually, run `npm run pricing:logic:coverage` after
  `npm run test:coverage`.
- Run `npm run ci:integration`.
- Run `npm run ci:build`.
- Run `npm run ci:e2e`.
- Run `npm run provider:credentials:check`.
- Run `npm run db:validate`.
- On Node 24, run `npm run impeccable` or keep the Node 20 skip documented.

## Demo Artifacts

- Refresh `docs/demo-artifacts/` with `npm run demo:artifacts`.
- Refresh `docs/browser-audit/` with `npm run browser:audit`.
- Validate the executive and engineering screenshots show pricing traceability.
- Validate a demo comparison can expand evidence from UI number to SKU, source endpoint/record ID, payload hash, transform version, and derivation math.
