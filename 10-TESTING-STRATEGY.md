# PolyCost - Testing Strategy

Companion to `00-MASTER-PROMPT.md` section 3.11. This defines the test pyramid,
coverage floors enforced in CI, and the E2E approach. "Tests exist" is not enough;
coverage thresholds must pass in CI and critical user journeys must be verified
against a real running system.

## 1. Test pyramid

```text
                    E2E (Playwright)
             Few, slow, high-confidence user journeys

          Integration (Jest + Supertest + Testcontainers)
       Module boundaries, database, real infrastructure contracts

                         Unit (Jest)
              Fast pure logic and isolated services
```

Most coverage should come from fast unit tests for pure logic such as
`IntervalCostCalculator`, `NWSValidator`, and `EquivalentServiceMapper`. Integration
tests verify modules against real infrastructure. E2E tests cover only journeys where
a regression would be a real user-facing failure.

## 2. Coverage thresholds

Coverage is enforced in CI. A pull request fails if the overall threshold or any
per-module threshold regresses.

| Layer/module | Minimum coverage | Why |
| --- | --- | --- |
| `IntervalCostCalculator` | 100% | Pure trusted math |
| `NWSValidator` | 100% | Every validation rule must have positive and negative tests |
| `EquivalentServiceMapper` | 95% | Near-total coverage for mapping correctness |
| `ComparisonOrchestratorService` | 90% | Core business logic |
| Cloud provider adapters | 85% per adapter | External API variability makes full enumeration harder |
| Report generators | 85% | Fixture-based testing against fixed `ComparisonResult` input |
| NestJS controllers / API layer | 90% | Every documented endpoint and error shape |
| React components | 80% | Focus on logic-bearing components |
| Overall project | 85% | Main CI gate |

Jest coverage should be configured through `coverageThreshold`, including module-level
thresholds for load-bearing files.

```javascript
module.exports = {
  coverageThreshold: {
    global: { branches: 85, functions: 85, lines: 85, statements: 85 },
    './src/comparison/interval-cost-calculator.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/nws/nws-validator.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
```

## 3. Unit testing approach

- Framework: Jest for backend and frontend.
- Scope: pure functions and single classes/services in isolation.
- Dependencies are mocked, including `ConfigService` and `SecretsService`.
- Naming convention: `*.spec.ts` co-located with the file under test.

Required unit coverage:

- Every public method of every Comparison Engine service.
- Every `NWSValidator` validation rule, including pass and fail cases.
- Every interval calculation against hand-verified fixture outputs.
- Every error path, not only happy paths.

## 4. Integration testing approach

Frameworks:

- Jest
- Supertest for API-level testing
- Testcontainers for real Postgres, Redis, and local Vault dev-server

Integration tests cover:

- API contracts from `05-API-CONTRACTS.md`, including request/response shape and
  error responses.
- Database repository/query logic against real Postgres.
- Cloud adapter `refreshPricingCatalog()` behavior against recorded fixtures or
  sandbox/test-mode credentials when providers support them.
- Pricing ETL job behavior against mocked adapter responses, including partial
  provider failure.

Integration tests must not use production provider credentials or staging/production
Vault.

## 5. End-to-end testing approach

Framework: Playwright across Chromium, Firefox, and WebKit.

E2E tests are deliberately limited to critical user journeys:

1. Happy path, natural-language input: user enters requirements, reviews parsed
   structured form, confirms, sees three-column comparison with all five intervals,
   and successfully exports PDF, CSV, and Excel.
2. Happy path, structured form: user skips NL, fills the form, then completes the
   same comparison/export flow.
3. Cloud-specific requirement: user names a provider-specific managed service and
   sees a complete three-cloud comparison with non-native columns marked approximate.
4. Theme switching: Light to Dark to System with no flash of wrong theme, verified
   with screenshot comparison.
5. Responsive comparison view: desktop three-column layout and mobile swipeable
   carousel.
6. Partial provider failure: one cloud adapter is unavailable, the page renders the
   other providers with a visible warning.
7. Keyboard-only navigation: complete the happy path using only keyboard input,
   verifying focus order and visible focus states.

E2E does not verify pricing calculation correctness, exhaustive validation
permutations, or pixel-perfect visual detail beyond the required theme screenshot
check. Those belong in lower test layers.

## 6. CI pipeline gates

Run these gates in order. Failure at any stage blocks merge:

1. Lint and typecheck.
2. Unit tests plus coverage threshold check.
3. Integration tests backed by Testcontainers.
4. Backend and frontend build.
5. E2E tests against the built artifact in a Docker Compose stack.
6. Security scan per `11-SECURITY.md`.

No main-branch gate may be skipped or marked non-blocking.

## 7. Test data and fixtures

- Pricing catalog fixtures live in `test/fixtures/pricing/`.
- Fixtures are recorded real API responses sanitized of account-specific identifiers.
- Fixtures are refreshed periodically, not regenerated on every CI run.
- Canonical NWS fixtures live in `test/fixtures/nws/`.

Required NWS fixtures:

- Minimal valid workload.
- Maximal workload exercising every optional field.
- Invalid workload for each validation rule.
- Cloud-specific-service workload for approximation-label tests.

Shared fixtures should be reused across unit, integration, and E2E layers so the same
examples are verified consistently.
