import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/*
  The silent failure this file exists for.

  OpenTelemetry instruments by monkey-patching modules as they load. Under
  CommonJS it hooks the require cache; ESM has no require cache, so it needs a
  loader hook registered before anything else imports. Without

      register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)

  the SDK starts cleanly, reports healthy, logs nothing, and instruments
  absolutely nothing. No existing test would notice: every span assertion in
  this repo builds its spans directly rather than through a patched module.

  So there are two checks here. The first proves the mechanism genuinely works
  on this Node version - that the hook patches a real module - by running it in
  a child process, because the hook has to be registered before the module under
  observation is imported and that cannot be arranged in-process. The second
  proves our bootstrap actually performs it, and in the right order.
*/

const apiRoot = resolve(import.meta.dirname, '../..');
const bootstrap = join(apiRoot, 'otel-register.mjs');

describe('OpenTelemetry ESM instrumentation', () => {
  it('patches an imported module when the loader hook is registered', () => {
    // Inside the project: the child has to resolve @opentelemetry/* by walking
    // up to the workspace node_modules, which an OS temp directory cannot do.
    const dir = mkdtempSync(join(apiRoot, '.otel-esm-check-'));
    // Mirrors the two operations the bootstrap performs, in the same order.
    writeFileSync(
      join(dir, 'register.mjs'),
      `import { register } from 'node:module';
       import { NodeSDK } from '@opentelemetry/sdk-node';
       import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
       register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
       new NodeSDK({ instrumentations: [new HttpInstrumentation()] }).start();
      `,
    );
    // http.get is the builtin's own `get` until something wraps it; OTel's
    // wrapper is named outgoingGetRequest, so the name is the observable proof
    // that patching happened rather than merely that the SDK started.
    writeFileSync(
      join(dir, 'probe.mjs'),
      `import http from 'node:http';
       console.log(http.get.name);
      `,
    );

    const out = execFileSync(
      process.execPath,
      ['--import', join(dir, 'register.mjs'), join(dir, 'probe.mjs')],
      { cwd: apiRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    rmSync(dir, { recursive: true, force: true });

    expect(out).toBe('outgoingGetRequest');
  });

  it('registers the loader hook before starting the SDK', () => {
    // Comments are stripped first, and deliberately: the file's own header
    // explains the hook and quotes the call, so searching the raw source finds
    // the prose and passes even with the real call deleted. This assertion was
    // written that way, and only failed to catch its own mutation test.
    const code = readFileSync(bootstrap, 'utf8')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
      })
      .join('\n');

    const registerAt = code.indexOf("register('@opentelemetry/instrumentation/hook.mjs'");
    const startAt = code.indexOf('startTracing(');

    expect(registerAt).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(-1);
    // Order matters: instrumentations added after the hook is registered still
    // work, but a module imported before it is registered is never patched.
    expect(registerAt).toBeLessThan(startAt);
  });

  it('declares the package the loader hook comes from', () => {
    /*
      Found by running the production image, not by any test.

      @opentelemetry/instrumentation ships hook.mjs and otel-register.mjs
      imports it directly, but it was never declared - it only happened to be
      hoisted in the dev tree. In the runtime image it existed solely nested
      inside two plugins at two different versions, so the bootstrap could not
      resolve it, the try/catch swallowed the failure, and tracing was off in
      production while every test passed.

      Resolvability is not the assertion, because it resolves here either way.
      The declaration is.
    */
    const pkg = JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.['@opentelemetry/instrumentation']).toBeDefined();
  });

  it('loads the tracing bootstrap with --import, not --require', () => {
    // --require cannot load an ESM bootstrap, and the hook has to be registered
    // from one. A revert to --require would leave tracing silently inert.
    const cmd = readFileSync(join(apiRoot, 'Dockerfile'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('CMD ['));

    expect(cmd).toContain('"--import", "./otel-register.mjs"');
    expect(cmd).not.toContain('--require');
  });
});
