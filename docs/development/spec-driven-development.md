# Spec-Driven Development

PolyCost development should follow a specs-first, tests-first loop:

1. Write or update a spec in `specs/`.
2. Add failing tests that capture the acceptance criteria.
3. Implement the smallest useful change.
4. Run focused tests while iterating.
5. Run `npm run check`.
6. Review security, cloud, DevOps, migration, and observability implications.
7. Update docs, `PROGRESS.md`, and the spec status before stopping.

## Phase Checkpoints

For roadmap phases, stop at the checkpoint defined in
`08-AGENTIC-BUILD-MASTER-PROMPT.md`. Do not start the next phase until the user
approves it.

Each checkpoint should report:

- What was built
- Tests and coverage
- Security checks
- Runtime/Docker verification
- Deviations from spec
- Known carried-forward issues

## Test Expectations

- Add unit tests for pure logic and validators.
- Add integration tests for database, queue, API, and adapter boundaries.
- Add E2E tests when the user workflow crosses API and frontend surfaces.
- Keep tests deterministic; use recorded fixtures or mocked provider responses for
  cloud pricing APIs.
- Do not require real cloud credentials in CI.

## Definition of Done

A feature is done when its spec acceptance criteria are satisfied, focused tests pass,
full checks pass or documented blockers are recorded, and user-facing docs/progress are
updated.
