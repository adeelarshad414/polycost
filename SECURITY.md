# Security Policy

Please report security vulnerabilities privately. Do not open a public GitHub issue
for suspected vulnerabilities.

If GitHub private vulnerability reporting is enabled for this repository, use:

`https://github.com/adeelarshad414/polycost/security/advisories/new`

If that page is unavailable while the repository is private, contact the maintainer
directly with:

- A clear description of the issue.
- Steps to reproduce.
- Any known affected versions or deployment modes.
- Impact and suggested remediation if known.

Reported vulnerabilities are triaged before new feature work.

## Supported Versions

PolyCost is pre-1.0. Security fixes target the current `main` branch unless a
tagged release explicitly documents longer support.

| Version   | Supported |
| --------- | --------- |
| `main`    | Yes       |
| `< 0.1.0` | No        |

## Handling Expectations

- Do not include secrets, provider credentials, customer diagrams, invoices, or
  confidential pricing agreements in reports.
- Maintainers will acknowledge validated reports as soon as practical.
- Fixes may be handled privately before public disclosure.
- Public advisories should avoid exploit details until a fix is available.

## Local Security Checks

Run these before phase checkpoints and releases:

```bash
npm run security:audit
npm run security:suppressions
npm run security:scan
npm run qa
```

- `security:audit` runs the high/critical npm audit gate.
- `security:suppressions` verifies security-rule ESLint suppressions include dated
  review evidence and a ledger reference.
- `security:scan` runs gitleaks and Trivy when those CLIs are installed.
- `qa` checks required workflow files and verifies application source does not add
  direct `process.env` access outside the config/secrets boundary, then runs the
  suppression hygiene gate.

## Review Checklist

- No committed secrets, API keys, provider tokens, or credential-bearing connection
  strings.
- Secrets are retrieved through Vault-backed services, not direct environment reads.
- CORS allowlists, security headers, rate limits, and input validation are reviewed
  for every API-facing feature.
- Pricing-provider credentials are mocked in tests and never required for CI.
- Logs avoid request bodies, credentials, and provider response payloads that may
  expose sensitive metadata.
