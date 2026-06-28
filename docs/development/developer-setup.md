# Developer Setup

This repo is an npm-workspaces monorepo:

- API: NestJS/Fastify in `apps/api`
- Web: React/Vite in `apps/web`
- Data services: Postgres, Redis, and Vault through Docker Compose
- Tests: Jest
- Quality: ESLint, Prettier, TypeScript, security audit, gitleaks, Trivy

## First-Time Setup

```bash
npm run setup
```

`setup` runs `npm ci` and installs git hooks when the workspace is a git repository.
This Codex workspace may not have `.git`; in that case hook installation is skipped
with a warning.

## Daily Development

```bash
npm run dev
```

This starts the full Docker Compose stack. The API is available at
`http://localhost:3001/health`, and the web app is available at
`http://localhost:3000`.

Useful focused commands:

```bash
npm run api:dev
npm run web:dev
npm run test:unit
npm run ci:lint
npm run db:validate
```

## Verification Commands

```bash
npm run check
npm run check:full
```

`check` is the everyday local confidence suite. `check:full` adds coverage, build,
integration/e2e placeholders, npm audit, gitleaks, and Trivy.

## Graphify

The verified package installed for Graphify is `@sentropic/graphify`.

Project-safe commands:

```bash
npm run graphify
npm run graphify:validate
npm run graphify:visualize
```

These commands create and validate deterministic local dependency/spec graph artifacts
under `reports/graphify/`. The full external Graphify CLI is also available:

```bash
npm run graphify:tool
```

Full Graphify ontology extraction may require model/provider credentials. Generated
`.graphify/` and `reports/` outputs are ignored by git.

## Caveman

The npm package that matches the Caveman name is `@juliusbrussee/caveman-code`, a
separate terminal coding-agent harness. It is not installed as a project dependency
because PolyCost already runs inside Codex and the requested need here is reproducible
local workflows.

Repo-local Caveman workflow aliases:

```bash
npm run caveman
npm run caveman:setup
npm run caveman:dev
npm run caveman:doctor
npm run caveman:full
npm run caveman:db
```

## Impeccable

`impeccable@3.1.0` is the verified package for AI-generated UI anti-pattern
detection, but it requires Node.js 24+. PolyCost currently targets Node.js 20, so the
repo uses a compatibility wrapper:

```bash
npm run impeccable
```

On Node 20, this exits successfully with a clear skip message. After upgrading the
project toolchain to Node 24+, the same command runs `impeccable detect` against the
web app.

## Hooks

Install hooks with:

```bash
npm run hooks:install
```

Hooks use `.githooks/`:

- `pre-commit`: format check, lint/typecheck, unit tests, QA
- `pre-push`: full verification
