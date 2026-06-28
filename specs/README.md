# Specs

PolyCost uses specs-first, tests-first development. Every non-trivial feature should
start with a short spec in this directory before implementation work begins.

## Workflow

1. Copy `TEMPLATE.md` to `specs/YYYY-MM-DD-feature-name.md`.
2. Fill in the problem, acceptance criteria, data/API/UI impact, and test plan.
3. Add or update failing tests that prove the acceptance criteria.
4. Implement the smallest code change that makes the tests pass.
5. Run focused checks, then `npm run check` or `npm run check:full`.
6. Update `PROGRESS.md` or the feature spec status before stopping.

Specs are living documents. Update the spec when implementation decisions change, and
call out deviations instead of silently drifting from the original plan.
