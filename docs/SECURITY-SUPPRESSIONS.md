# Security Warning And Advisory Ledger

Reviewer date: 2026-07-07

This ledger tracks security-plugin findings reviewed during the production-readiness pass. Runtime security gating remains `npm run security:audit`, which fails on high/critical npm advisories. `npm run lint` now exits cleanly; remaining reviewed findings are covered by explicit file-level ESLint suppressions with dated justifications. `npm run security:suppressions` enforces that every security-rule suppression includes a review date and a pointer back to this ledger.

## ESLint Security Plugin Warnings

Status: warnings reviewed, categorized, and either fixed or suppressed with dated comments that point back to this ledger. New code added in this pass was adjusted so `apps/api/src/pricing-normalization/pricing-lineage.ts`, `apps/api/src/api/regions.service.ts`, and the diagram LLM batch classifier path do not emit object-injection warnings.

| Rule                                      | Locations                                                                                                                                                | Reasoning                                                                                                                                                                                                                                                        | Follow-up                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `security/detect-non-literal-fs-filename` | Adapter fixture specs, diagram parser specs, `diagram-temp-file.store.ts`, `secrets.service.ts`                                                          | Test fixture reads are bounded to repository fixture roots. Runtime diagram temp-file writes use configured temp directory plus generated file names and are covered by upload safety checks. Vault token file path is deployment configuration, not user input. | Add local wrapper helpers with explicit root validation comments if/when lint policy is raised from warning to error.             |
| `security/detect-object-injection`        | Provider adapters, comparison analytics/orchestrator, region catalog parser, report evidence, mock fixtures, secrets specs, selected config/test helpers | These are typed maps over provider IDs, pricing dimensions, provider-owned region/catalog fields, report row dictionaries, or controlled fixture objects. No user-supplied key is used to mutate an arbitrary object on a privilege boundary.                    | Prefer `Map`, switch statements, or typed accessor helpers as files are next touched.                                             |
| `security/detect-unsafe-regex`            | `nws-parser.service.ts`, AWS adapter SKU parsing, report evidence helpers                                                                                | Regexes operate on bounded parser strings or provider SKU/label strings and are already behind request-size limits. The largest parser input is constrained by `NL_PARSE_MAX_INPUT_CHARS`.                                                                       | Move high-traffic parser expressions to tested helper functions with ReDoS-focused cases before enabling error-level enforcement. |
| `security/detect-non-literal-regexp`      | `nws-parser.service.ts` dynamic parser patterns                                                                                                          | Dynamic patterns are generated from internal dictionaries, not raw user regex input.                                                                                                                                                                             | Escape helper coverage should be extended before changing severity.                                                               |

Suppression locations reviewed on 2026-07-06:

- `apps/api/src/adapters/aws/aws-provider.adapter.spec.ts`
- `apps/api/src/adapters/aws/aws-provider.adapter.ts`
- `apps/api/src/adapters/aws/aws-signature-v4.ts`
- `apps/api/src/adapters/azure/azure-provider.adapter.spec.ts`
- `apps/api/src/adapters/azure/azure-provider.adapter.ts`
- `apps/api/src/adapters/common/base-cloud-provider.adapter.ts`
- `apps/api/src/adapters/gcp/gcp-provider.adapter.spec.ts`
- `apps/api/src/adapters/gcp/gcp-provider.adapter.ts`
- `apps/api/src/adapters/mock/mock-pricing-fixtures.ts`
- `apps/api/src/api/comparison-analytics.service.ts`
- `apps/api/src/api/mvp-acceptance.e2e.spec.ts`
- `apps/api/src/comparison/comparison-orchestrator.service.ts`
- `apps/api/src/database/pricing-catalog.repository.spec.ts`
- `apps/api/src/diagram-parser/diagram-parser.service.spec.ts`
- `apps/api/src/diagram-parser/diagram-temp-file.store.ts`
- `apps/api/src/nws-parser/nl-parser.service.ts`
- `apps/api/src/reports/report-evidence.ts`
- `apps/api/src/secrets/secrets.service.spec.ts`
- `apps/api/src/secrets/secrets.service.ts`
- `apps/api/src/terraform/terraform-generation.service.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/workload.ts`

## npm Audit

Command evidence:

- `npm run security:audit` completed on 2026-07-07 with exit code 0 under `--audit-level=high`.
- `npm run security:suppressions` completed on 2026-07-07 with exit code 0 and 21 reviewed suppressions.
- `npm audit --audit-level=low` completed on 2026-07-07 with exit code 1 because the low advisory below remains present.
- Remaining advisory: `@ai-sdk/provider-utils <=3.0.97` via `ollama-ai-provider` via `@sentropic/graphify`.
- Severity: low.
- Advisory: `GHSA-866g-f22w-33x8`
  (`https://github.com/advisories/GHSA-866g-f22w-33x8`).
- Scope: development tooling path for Graphify, not PolyCost runtime API/web bundles.
- Current fix status: no safe lockfile-only fix available from the installed dependency tree.

Follow-up:

1. Track `@sentropic/graphify` and `ollama-ai-provider` releases.
2. Re-run `npm audit --audit-level=low` before public release and after dependency bumps.
3. Keep `npm run security:audit` in CI at high/critical threshold until an upstream fix exists.

## Impeccable

`scripts/impeccable-check.mjs` intentionally exits 0 with a warning on Node 20 because `impeccable@3.1.0` requires Node 24+. PolyCost currently declares Node `>=20.0.0`.

Follow-up before public release:

1. Decide whether CI should add a Node 24 auxiliary quality job.
2. Keep Node 20 as the supported runtime unless the project intentionally raises `engines.node`.
3. Re-run `npm run impeccable` on Node 24 before cutting a public release candidate.
