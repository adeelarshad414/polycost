# Security Policy

Please report security vulnerabilities privately. Do not open a public GitHub issue
for suspected vulnerabilities.

For now, contact the project maintainer directly with:

- A clear description of the issue.
- Steps to reproduce.
- Any known affected versions or deployment modes.

Reported vulnerabilities are triaged before new feature work.

## Local Security Checks

Run these before phase checkpoints and releases:

```bash
npm run security:audit
npm run security:scan
npm run qa
```

- `security:audit` runs the high/critical npm audit gate.
- `security:scan` runs gitleaks and Trivy when those CLIs are installed.
- `qa` checks required workflow files and verifies application source does not add
  direct `process.env` access outside the config/secrets boundary.

## Review Checklist

- No committed secrets, API keys, provider tokens, or credential-bearing connection
  strings.
- Secrets are retrieved through Vault-backed services, not direct environment reads.
- CORS allowlists, security headers, rate limits, and input validation are reviewed
  for every API-facing feature.
- Pricing-provider credentials are mocked in tests and never required for CI.
- Logs avoid request bodies, credentials, and provider response payloads that may
  expose sensitive metadata.
