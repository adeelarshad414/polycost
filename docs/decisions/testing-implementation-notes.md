# Testing Implementation Notes

These notes capture build-impact decisions from `10-TESTING-STRATEGY.md`.

## Coverage Gates

- Overall API coverage floor: 85% statements/lines/functions and 67% branches.
- Overall web coverage floor: 80% statements/lines/functions and 75% branches.
- Shared cost-time utilities: 100% in API and web, because this is the source of
  truth for hourly/daily/weekly/monthly/quarterly/yearly math.
- `IntervalCostCalculator`: 100%.
- `NWSValidator`: 100%.
- `EquivalentServiceMapper`: 95%.
- `ComparisonOrchestratorService`: 90%.
- Cloud provider adapters: 85% per adapter.
- Report generators: 85%.
- API layer: 90%.
- React logic-bearing components: 80%.

## CI Gate Order

1. Lint and typecheck.
2. Unit tests with coverage.
3. Integration tests with Testcontainers.
4. Backend and frontend build.
5. Playwright E2E against Docker Compose stack.
6. Security scan per `11-SECURITY.md`.

## Required Fixtures

- `test/fixtures/pricing/` for sanitized provider pricing responses.
- `test/fixtures/nws/` for minimal, maximal, invalid-per-rule, and cloud-specific
  workloads.

## E2E Must Cover

- Natural-language happy path with all exports.
- Structured-form happy path with all exports.
- Cloud-specific-service approximation labels.
- Light/Dark/System theme switching.
- Desktop layout and mobile carousel.
- Partial provider failure warning.
- Keyboard-only happy path.
