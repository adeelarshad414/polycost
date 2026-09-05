# ESM Migration — Scope

Scoping spike for K-11's option 1: moving `apps/api` from CommonJS to ESM.

Every number below was measured against this repository, and every risk marked
**proven** was executed as a working spike rather than reasoned about. The
spike sources are reproduced inline so the claims can be re-run.

## Why this is now worth doing

K-11 was filed as staying current with the ecosystem. Clearing K-2 changed that.
Two **runtime** security advisories can only be fixed by packages that are
ESM-only, and a third blocked upgrade is the whole Nest 12 line:

| Blocked by CommonJS                | Severity | What it unblocks                           |
| ---------------------------------- | -------- | ------------------------------------------ |
| `fastify` schema-validation bypass | moderate | needs `@nestjs/platform-fastify@12`        |
| `stream-json` O(depth²) filter DoS | moderate | needs `stream-json@3.6.0`                  |
| `@nestjs/config@12`                | —        | ESM-only                                   |
| TypeScript 7                       | —        | separately blocked by ts-jest, not by this |

`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify` and
`@nestjs/config` at v12 are each `"type": "module"` with no CommonJS condition in
their `exports`. `stream-json@3.6.0` likewise.

The `stream-json` advisory is not theoretical here.
`apps/api/src/adapters/aws/aws-bulk-stream.ts` imports `pick` from
`stream-json/filters/Pick` to parse the AWS bulk price feed — the exact filter
named in the advisory, on exactly the large nested input it describes.

## The headline: the application code is not the problem

The thing that usually makes an ESM migration expensive — CommonJS constructs
scattered through the source — is essentially absent here.

| Construct                           | Occurrences in `apps/api/src` (non-spec) |
| ----------------------------------- | ---------------------------------------- |
| `require(`                          | **0**                                    |
| `module.exports`                    | **0**                                    |
| `require.resolve` / `createRequire` | **0**                                    |
| `__filename`                        | **0**                                    |
| `__dirname`                         | **1** real site                          |
| dynamic `import()`                  | 0                                        |

The 29 apparent `exports.` matches are SQL column names
(`team_audit_event_exports.id`) and one metrics field. There is no CommonJS
module syntax in the source at all.

The single `__dirname` is `specSearchPaths(baseDir: string = __dirname)` in
`apps/api/src/api/openapi.controller.ts:46` — and it is already parameterised,
so it becomes `import.meta.dirname` in one line.

`scripts/` is already **74 `.mjs`, 0 `.cjs`**. Only `apps/api` is CommonJS.

## What the work actually is

### 1. Import specifiers — 850 edits, mechanical

Node ESM requires file extensions on relative imports.

|            | Extensionless relative specifiers | Files     |
| ---------- | --------------------------------- | --------- |
| Production | 546                               | 128 / 150 |
| Specs      | 304                               | 72 / 72   |
| **Total**  | **850**                           | **200**   |

Scriptable: append `.js` to every relative specifier. This is the bulk of the
diff and close to none of the risk — a missed one fails loudly at import time,
not subtly at runtime.

### 2. `isolatedModules: true` — 113 edits, one pattern, 27 files

`ts-jest` requires `isolatedModules: true` for `node16`-family module kinds.
Turning it on today produces **113 errors, all of them `TS1272`**, across 27
files, and **zero errors of any other kind**:

> A type referenced in a decorated signature must be imported with `import type`
> or a namespace import when `isolatedModules` and `emitDecoratorMetadata` are
> enabled.

The fix is `import { Foo }` → `import type { Foo }` for types used in decorated
signatures. Also mechanical. There are no `const enum` declarations and only two
`export { ... }` re-exports, so none of the other `isolatedModules` hazards
apply.

### 3. Tests — one import per file, and one genuine rewrite

644 `jest.*` references across 72 spec files, but the distribution is benign:

| API             | Count              | Cost under ESM                   |
| --------------- | ------------------ | -------------------------------- |
| `jest.fn`       | 599                | none                             |
| `jest.Mocked`   | 21                 | none (type-only)                 |
| `jest.spyOn`    | 6                  | none                             |
| `jest.mock`     | **2, in one file** | needs `jest.unstable_mockModule` |
| everything else | 4                  | none                             |

Two costs:

- **Every spec file needs `import { jest } from '@jest/globals'`.** In ESM mode
  Jest injects no globals — `jest` is simply not defined. All 72 files.
- **`apps/api/src/health/health.service.spec.ts`** is the only file using
  `jest.mock` (mocking `node:net` to test `probeTcp`). It moves to
  `jest.unstable_mockModule`, or `probeTcp` takes `createConnection` as a
  parameter and the mock disappears entirely. The second is the better change.

No runner switch is required: `ts-jest` ships a `default-esm` preset.

### 4. Tracing bootstrap — the one piece that is not mechanical

`apps/api/otel-register.cjs` is loaded with `node --require` and uses a
top-level `return`, which is legal only in CommonJS. Under ESM it becomes
`otel-register.mjs` loaded with `--import`, and — critically — it must register
the ESM loader hook:

```js
import { register } from 'node:module';
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
```

ESM has no require cache for OpenTelemetry to monkey-patch. **Without that line
the SDK starts cleanly and instruments nothing** — a tracer that reports healthy
and produces no spans, which no test would catch.

Touches `apps/api/Dockerfile:28,53` and the `start:prod` script.

`start:dev` uses `ts-node src/main.ts`, which needs `--loader ts-node/esm` or a
switch to `tsx` (both already available).

## Proven, not assumed

Three risks were executed as working spikes.

**Nest 11 boots as real ESM.** A minimal app with `@Injectable`/`@Module`/
`@Controller`, constructor-parameter DI via `emitDecoratorMetadata`,
`ConfigModule.forRoot` and the Fastify adapter, compiled with
`module: node16` and run under `"type": "module"`:

```
BOOT OK: {"ok":true,"detail":"injected|env=unset"}
import.meta.dirname works: true
```

The emit is genuine ESM (top-level `import`, no `require`), DI resolved, and
Fastify served a request. Nest 11 itself is plain CommonJS with no `exports`
map, so ESM imports it without trouble — the ESM-only problem is Nest **12**.

**`ts-jest` runs Nest DI under ESM.** With `ts-jest/presets/default-esm`,
`extensionsToTreatAsEsm: ['.ts']` and `NODE_OPTIONS=--experimental-vm-modules`,
three tests pass: constructor-parameter DI through
`NestFactory.createApplicationContext` (the shape this repo's own DI tests use),
`jest.fn` spies, and `jest.unstable_mockModule` replacing `jest.mock`.

**OpenTelemetry actually instruments under ESM.** Verified by the observable
difference rather than by the SDK reporting success — after `--import` with the
loader hook registered, `http.get` is OTel's `outgoingGetRequest` wrapper, not
the pristine builtin.

## Estimate

| Step                                             | Size             | Risk                                          |
| ------------------------------------------------ | ---------------- | --------------------------------------------- |
| Append `.js` to 850 relative specifiers          | large, scripted  | low — fails loudly                            |
| 113 `import type` fixes across 27 files          | medium, scripted | low                                           |
| `import { jest }` into 72 spec files             | medium, scripted | low                                           |
| Rewrite the one `jest.mock` file                 | small            | low                                           |
| `__dirname` → `import.meta.dirname` (1 site)     | trivial          | low                                           |
| `otel-register.mjs` + `--import` + loader hook   | small            | **highest** — silent failure mode             |
| Dockerfile, `start:prod`, `start:dev`            | small            | medium — verify in the container, not locally |
| Flip `"type": "module"` + tsconfig + jest config | small            | low                                           |

Roughly **four mechanical passes and two genuine changes**. The mechanical
passes are most of the diff and little of the risk; the tracing bootstrap is
little of the diff and most of the risk.

## Sequencing

1. `isolatedModules: true` and the 113 `import type` fixes — valid on CommonJS
   today, so this lands and proves itself before anything moves.
2. `.js` extensions on all 850 specifiers — also valid on CommonJS under
   `node16`, so this too lands independently.
3. `import { jest }` into all 72 spec files — valid today.
4. Flip `"type": "module"`, jest to the ESM preset, rewrite the one mock file.
5. `otel-register.mjs`, Dockerfile, start scripts.

Steps 1–3 are ~95% of the diff and can all merge **before** the switch, each
verifiable on the current runtime. That leaves the actual flip as a small,
reviewable change instead of one 200-file commit that either works or does not.

## Verification that must not be skipped

- **Tracing produces spans after the flip.** Assert the wrapper, not SDK
  startup. This is the one failure that is silent, and the repo has been bitten
  by exactly this shape before (`/health/ready` returning 200 while degraded;
  Redis persistence disabled discarding jobs).
- **The container build, not just the local one.** The Tailwind 4 upgrade in
  #204 passed locally and failed in the container over a workspace-nested
  dependency. Same class of hazard applies here.
- **`start:dev`**, which no CI job currently exercises.

## What this does not cover

Nest 12 itself. This migration makes the API _able_ to consume ESM-only
packages; taking `@nestjs/platform-fastify@12` and `@nestjs/config@12` is a
separate upgrade with its own API-surface changes, and should follow rather than
ride along.
