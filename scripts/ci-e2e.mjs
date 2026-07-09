import { spawnSync } from 'node:child_process';
import net from 'node:net';

const root = process.cwd();
const skipCompose = process.env.POLYCOST_E2E_SKIP_COMPOSE === '1';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commandTimeoutMs = Number(process.env.POLYCOST_E2E_COMMAND_TIMEOUT_MS ?? 900_000);
const diagnosticsTimeoutMs = Number(process.env.POLYCOST_E2E_DIAGNOSTICS_TIMEOUT_MS ?? 60_000);
const allocatedHostPorts = new Set();
const dockerBindProbeHost = '0.0.0.0';

const composeProjectName =
  process.env.COMPOSE_PROJECT_NAME ??
  process.env.POLYCOST_E2E_COMPOSE_PROJECT_NAME ??
  `polycoste2e${process.pid}`;
const apiContainerPort =
  process.env.API_PORT ?? process.env.POLYCOST_E2E_API_CONTAINER_PORT ?? '3001';
const apiHostPort =
  process.env.API_HOST_PORT ??
  process.env.POLYCOST_E2E_API_HOST_PORT ??
  (skipCompose ? apiContainerPort : await findAvailablePort(3301));
const webHostPort =
  process.env.WEB_PORT ??
  process.env.POLYCOST_E2E_WEB_PORT ??
  (skipCompose ? '3000' : await findAvailablePort(3300));
const vaultHostPort =
  process.env.VAULT_HOST_PORT ??
  process.env.POLYCOST_E2E_VAULT_HOST_PORT ??
  (skipCompose ? '8200' : await findAvailablePort(18220));
const apiOrigin = process.env.POLYCOST_API_ORIGIN ?? `http://localhost:${apiHostPort}`;
const webOrigin = process.env.POLYCOST_WEB_BASE_URL ?? `http://localhost:${webHostPort}`;
let runnerFailure;
let testsFailed = false;

try {
  if (skipCompose) {
    process.env.POLYCOST_API_ORIGIN = process.env.POLYCOST_API_ORIGIN ?? apiOrigin;
    process.env.POLYCOST_API_BASE_URL = process.env.POLYCOST_API_BASE_URL ?? `${apiOrigin}/api/v1`;
    process.env.POLYCOST_WEB_BASE_URL = webOrigin;
  } else {
    process.env.POLYCOST_API_ORIGIN = apiOrigin;
    process.env.POLYCOST_API_BASE_URL = `${apiOrigin}/api/v1`;
    process.env.POLYCOST_WEB_BASE_URL = webOrigin;
  }

  if (!skipCompose) {
    process.env.COMPOSE_PROJECT_NAME = composeProjectName;
    process.env.API_PORT = apiContainerPort;
    process.env.API_HOST_PORT = apiHostPort;
    process.env.PORT = process.env.PORT ?? apiContainerPort;
    process.env.WEB_PORT = webHostPort;
    process.env.VAULT_HOST_PORT = vaultHostPort;
    process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? `${apiOrigin}/api/v1`;
    process.env.CORS_ALLOWED_ORIGINS =
      process.env.CORS_ALLOWED_ORIGINS ??
      [
        `http://localhost:${webHostPort}`,
        `http://127.0.0.1:${webHostPort}`,
        `http://localhost:${apiHostPort}`,
        `http://127.0.0.1:${apiHostPort}`,
      ].join(',');

    console.log(
      [
        `E2E Compose project: ${composeProjectName}`,
        `web=${webOrigin}`,
        `api=${apiOrigin}`,
        `vaultHostPort=${vaultHostPort}`,
      ].join(' | '),
    );

    run('docker', ['compose', 'up', '--build', '-d', '--remove-orphans'], {
      timeoutMs: commandTimeoutMs,
    });
    run(npmCommand, ['run', 'db:migrate'], { timeoutMs: commandTimeoutMs });
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
    timeout: commandTimeoutMs,
  });

  if (result.error) {
    const detail =
      result.error.code === 'ETIMEDOUT'
        ? `timed out after ${commandTimeoutMs}ms`
        : result.error.message;
    throw new Error(`${npmCommand} run test:e2e --workspaces --if-present failed: ${detail}`, {
      cause: result.error,
    });
  }

  testsFailed = result.status !== 0;
  if (testsFailed) {
    process.exitCode = result.status ?? 1;
    printComposeDiagnostics();
  } else {
    run(npmCommand, ['run', 'live:verify'], { timeoutMs: commandTimeoutMs });
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
    timeout: options.timeoutMs ?? commandTimeoutMs,
  });

  if (result.error) {
    const detail =
      result.error.code === 'ETIMEDOUT'
        ? `timed out after ${options.timeoutMs ?? commandTimeoutMs}ms`
        : result.error.message;

    if (options.allowFailure) {
      console.warn(`${command} ${args.join(' ')} failed: ${detail}`);
      return result;
    }

    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`, {
      cause: result.error,
    });
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
  run('docker', ['compose', 'ps'], { allowFailure: true, timeoutMs: diagnosticsTimeoutMs });
  console.error('Recent Compose logs:');
  run('docker', ['compose', 'logs', '--tail', '120', 'api', 'web', 'postgres', 'vault-seed'], {
    allowFailure: true,
    timeoutMs: diagnosticsTimeoutMs,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findAvailablePort(preferredPort) {
  const preferred = Number(preferredPort);

  if (
    Number.isInteger(preferred) &&
    preferred > 0 &&
    !allocatedHostPorts.has(String(preferred)) &&
    (await canBind(preferred))
  ) {
    allocatedHostPorts.add(String(preferred));
    return String(preferred);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await allocateEphemeralPort();
    if (!allocatedHostPorts.has(port)) {
      allocatedHostPorts.add(port);
      return port;
    }
  }

  throw new Error('Could not allocate a distinct E2E host port.');
}

async function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, dockerBindProbeHost, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(String(address.port));
        } else {
          reject(new Error('Could not allocate an E2E host port.'));
        }
      });
    });
  });
}

async function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      resolve(false);
    });
    server.listen(port, dockerBindProbeHost, () => {
      server.close(() => resolve(true));
    });
  });
}
