import { spawnSync } from 'node:child_process';

const root = process.cwd();
const skipCompose = process.env.POLYCOST_E2E_SKIP_COMPOSE === '1';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const apiOrigin =
  process.env.POLYCOST_API_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? '3001'}`;
const webOrigin =
  process.env.POLYCOST_WEB_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? '3000'}`;
let runnerFailure;
let testsFailed = false;

try {
  process.env.POLYCOST_API_BASE_URL = process.env.POLYCOST_API_BASE_URL ?? `${apiOrigin}/api/v1`;
  process.env.POLYCOST_WEB_BASE_URL = webOrigin;

  if (!skipCompose) {
    run('docker', ['compose', 'up', '--build', '-d', '--remove-orphans']);
    run(npmCommand, ['run', 'db:migrate']);
  }

  await waitForJson('API health', `${apiOrigin}/health`, (body) => {
    return body?.status === 'ok' && body?.service === 'polycost-api';
  });
  await waitForText('web shell', webOrigin, (body) => {
    return body.includes('PolyCost') && body.includes('<div id="root">');
  });

  const result = spawnSync(npmCommand, ['run', 'test:e2e', '--workspaces', '--if-present'], {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  testsFailed = result.status !== 0;
  if (testsFailed) {
    process.exitCode = result.status ?? 1;
    printComposeDiagnostics();
  }
} catch (error) {
  runnerFailure = error;
  process.exitCode = 1;

  console.error('E2E runner failed before tests completed.');
  if (!skipCompose) {
    printComposeDiagnostics();
  }
} finally {
  if (!skipCompose) {
    run('docker', ['compose', 'down', '--remove-orphans'], { allowFailure: true });
  }
}

if (runnerFailure) {
  if (runnerFailure instanceof Error) {
    console.error(runnerFailure.stack ?? runnerFailure.message);
  } else {
    console.error(runnerFailure);
  }

  process.exit(1);
}

if (testsFailed) {
  process.exit(process.exitCode ?? 1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) {
    if (options.allowFailure) {
      console.warn(`${command} ${args.join(' ')} failed: ${result.error.message}`);
      return result;
    }

    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }

  return result;
}

async function waitForJson(label, url, predicate) {
  await waitFor(label, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return predicate(await response.json());
  });
}

async function waitForText(label, url, predicate) {
  await waitFor(label, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return predicate(await response.text());
  });
}

async function waitFor(label, probe) {
  const timeoutMs = Number(process.env.POLYCOST_E2E_WAIT_TIMEOUT_MS ?? 180_000);
  const intervalMs = Number(process.env.POLYCOST_E2E_WAIT_INTERVAL_MS ?? 2_000);
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      if (await probe()) {
        console.log(`${label} is ready.`);
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`${label} was not ready within ${timeoutMs}ms.${detail}`);
}

function printComposeDiagnostics() {
  console.error('E2E tests failed. Compose service status:');
  run('docker', ['compose', 'ps'], { allowFailure: true });
  console.error('Recent Compose logs:');
  run('docker', ['compose', 'logs', '--tail', '120', 'api', 'web', 'postgres', 'vault-seed'], {
    allowFailure: true,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
