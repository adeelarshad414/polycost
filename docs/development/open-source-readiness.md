# Open Source Readiness

PolyCost is intended to be open source and self-hostable. This repository is prepared
with community health files, but the GitHub repository can remain private until the
maintainer is ready to make it public.

## Current Repository Visibility

The repository should remain private until launch approval. Preparing open-source
files does not require changing GitHub visibility.

Before a public launch, confirm:

- GitHub repository visibility is intentionally changed by the maintainer.
- Branch protection is enabled for `main`.
- Private vulnerability reporting is enabled if available.
- Issues and discussions are configured intentionally.
- Secrets scanning and push protection are enabled where available.
- No private credentials, customer data, invoices, diagrams, or proprietary pricing
  terms are committed.

## Required Files

PolyCost includes:

- `LICENSE`
- `README.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `GOVERNANCE.md`
- `CHANGELOG.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/CODEOWNERS`
- `.github/dependabot.yml`

## Pre-Public Checklist

Run:

```bash
npm run release:check
npm run format:check
npm run ci:lint
npm run test:coverage
npm run ci:build
npm run security:audit
```

`npm run release:check` is the machine-readable guard for this page and
`RELEASE-CHECKLIST.md`. It verifies the required community health files, issue
templates, PR template, README demo path, security ledger, and private-to-public
human checklist language are still present before a release candidate is cut.

Recommended local scans before changing repo visibility:

```bash
npm run security:scan
git status --short
git ls-files .env
```

`git ls-files .env` should return no tracked local environment file.
