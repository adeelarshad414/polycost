# Contributing to PolyCost

Thank you for helping make PolyCost better. This project aims to stay cloud-neutral,
self-hostable, transparent, and useful for decision-grade multi-cloud cost planning.

## Ground Rules

- Keep the core comparison engine open and auditable.
- Do not add vendor lock-in to a tool designed to evaluate vendor lock-in.
- Do not commit secrets, provider credentials, live account data, customer diagrams,
  invoices, exports, or private pricing agreements.
- Keep pricing claims honest: PolyCost estimates; it does not promise invoice-grade
  billing accuracy.
- Prefer small, reviewable pull requests with tests.

## Development Setup

Use Node.js 20+ and npm 10+.

```bash
npm ci
cp .env.example .env
npm run dev
```

The one-command demo path is:

```bash
npm run demo:up
```

## Before Opening a Pull Request

Run the same quality gates used by CI where practical:

```bash
npm run format:check
npm run ci:lint
npm run test:coverage
npm run ci:build
npm run security:audit
```

For larger changes, also run:

```bash
npm run qa
npm run graphify:validate
npm run devops:check
npm run cloud:check
npm run db:validate
```

## Contribution Types

Good first contributions include:

- Documentation improvements.
- Cloud service equivalence mapping corrections.
- Pricing traceability improvements.
- Region catalog updates.
- Tests for parser, comparison, report, or UI workflows.
- Accessibility, responsiveness, and UX polish.

Larger contributions should start with an issue or design note, especially if they
change API contracts, the Normalized Workload Specification, pricing math, report
formats, persistence schema, or security boundaries.

## Pull Request Expectations

- Explain the user-visible change.
- Link the issue or roadmap item when available.
- Include screenshots or short clips for UI changes.
- Include tests for behavior changes.
- Update documentation when commands, setup, architecture, APIs, or security posture
  changes.
- Keep unrelated refactors out of feature PRs.

## Security

Report vulnerabilities privately. See `SECURITY.md` for the reporting and review
process.

## License

By contributing, you agree that your contributions are licensed under the MIT
License in this repository.
