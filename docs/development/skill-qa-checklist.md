# Skill QA Checklist

Use this checklist before and after Codex sessions that create or modify specs,
prompts, skills, or workflow instructions.

## Prompt And Spec Quality

- [ ] The latest user request is reflected in the active task.
- [ ] The relevant spec or roadmap phase is identified.
- [ ] Acceptance criteria are observable and testable.
- [ ] Non-goals and phase boundaries are explicit.
- [ ] Ambiguous external tools are verified before installation.

## Test-First Execution

- [ ] Tests are added or updated before implementation when practical.
- [ ] Mocked fixtures are used for cloud/provider behavior.
- [ ] Partial failure behavior is tested where provider or queue work is involved.
- [ ] Coverage changes are reviewed against project thresholds.

## Security And Cloud Review

- [ ] No direct `process.env` access is added outside config/secrets boundaries.
- [ ] No secrets are committed or printed.
- [ ] CORS, headers, rate limits, logging, and input validation are considered.
- [ ] Cloud resource creation is avoided unless explicitly approved.
- [ ] Required environment variables and secret paths are documented.

## DevOps Review

- [ ] Docker/Compose changes are validated.
- [ ] CI scripts still run non-interactively.
- [ ] Database migration and rollback impact is documented.
- [ ] Generated artifacts are ignored unless intentionally committed.

## Commands

```bash
npm run qa
npm run check
npm run check:full
```
