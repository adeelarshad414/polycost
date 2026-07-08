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
- Confirm trademark-sensitive cloud logos are not present in the UI.
- Confirm docs describe AWS/Azure/GCP as provider integrations, not endorsements.

## Product Honesty

- Confirm README and reports describe pricing as catalog list-price estimates, not invoices.
- Confirm known future gaps remain plainly stated: invoice-grade billing, full visual VSDX rendering, production SSO/RBAC polish, and Terraform/V3.
- Confirm `docs/SECURITY-SUPPRESSIONS.md` is current.
- Confirm `npm run security:audit` passes the high/critical gate.

## Verification

- Run `npm ci`.
- Run `npm run demo:up` from a clean clone or freshly reset local workspace.
- Run `npm run demo:verify-clean` to prove the clean-clone demo path stays under
  the 10-minute startup budget.
- Run `npm run format:check`.
- Run `npm run overlay:check`.
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
- Validate the executive and engineering screenshots show pricing traceability.
- Validate a demo comparison can expand evidence from UI number to SKU, source endpoint/record ID, payload hash, transform version, and derivation math.
