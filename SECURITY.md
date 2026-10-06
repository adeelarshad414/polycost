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
- `security:scan` runs the same scans CI runs: gitleaks over the full git history,
  Trivy over dependencies and secrets, and Trivy IaC over the Dockerfiles and Helm
  chart (HIGH/CRITICAL fail).

## Enforced In CI

Every pull request must pass four required checks before it can merge into
`main` (branch protection): `quality`, `visual`, `security` and CodeQL `analyze`.

- **`security`** runs gitleaks (full history, so a secret committed and then
  deleted is still caught) and both Trivy scans from digest-pinned images.
- **CodeQL** (`security-extended`) runs on every PR, on `main`, and weekly.
- Reviewed exceptions are versioned with a reason: `.gitleaksignore` (historical
  false positives) and `.trivyignore.yaml` (path-scoped). Inline
  `gitleaks:allow` comments mark current false positives. Dismissed CodeQL
  alerts carry a dismissal comment.
- Every GitHub Action is pinned to a commit SHA and the workflow token is
  read-only unless a job asks for more.

## Supply Chain

- Images are built only in CI (`.github/workflows/release.yml`) and scanned with
  Trivy before they are pushed.
- Every published image carries an SPDX SBOM and SLSA provenance (BuildKit
  attestations), a keyless cosign signature, and a GitHub build-provenance
  attestation. Verify with `cosign verify` and `gh attestation verify` (DEPLOY.md).
- Release charts pin images by digest. There is no `latest` tag.
- Workflows are linted with actionlint and shellcheck on every PR.

## Backups

Scheduled backups are encrypted with age to a public key before they leave the
cluster, so the backup bucket never holds readable data and the cluster cannot
decrypt its own backups. Restores verify a sha256 manifest. See
[docs/BACKUP-AND-DR.md](docs/BACKUP-AND-DR.md).

## Runtime Protections

- **Web:** nginx serves a strict Content-Security-Policy (no `'unsafe-inline'`;
  the pre-paint theme script is allowed by its SHA-256 hash, computed at image
  build), `frame-ancestors 'none'`, `nosniff`, Referrer-Policy,
  Permissions-Policy, COOP and HSTS.
- **Auth:** credential routes accept at most 16 KB; scrypt runs asynchronously;
  unknown, disabled and locked accounts get the same response, after the same
  work, as a wrong password; repeated failures lock the account.
- **Rate limits** key on the client address resolved through exactly
  `TRUST_PROXY_HOPS` proxies, so a forged `X-Forwarded-For` is ignored.
- **Tenancy (ADR-0001):** team-owned comparisons and workloads are visible only to
  their team (others get `404`); viewers are read-only; billing reconciliation only
  accepts the team's own comparisons; `ANONYMOUS_MODE=disabled` requires a session on
  every core route. Every route declares an access class, enforced by a contract test.
- **Share links** are stored as SHA-256 hashes, expire within 90 days, use
  salted scrypt for passwords, and take the password only in a POST body.
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
