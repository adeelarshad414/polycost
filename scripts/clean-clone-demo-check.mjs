import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const thresholdMs = Number(process.env.POLYCOST_CLEAN_CLONE_MAX_MS ?? 600_000);
const keepClone = process.env.POLYCOST_KEEP_CLEAN_CLONE === '1';
const sourceRepo = process.env.POLYCOST_CLEAN_CLONE_SOURCE ?? root;
const tempRoot = process.env.POLYCOST_CLEAN_CLONE_TMPDIR ?? path.join(root, '.tmp', 'clean-clones');
mkdirSync(tempRoot, { recursive: true });
const tempParent = mkdtempSync(path.join(tempRoot, 'polycost-clean-clone-'));
const cloneDir = path.join(tempParent, 'repo');
const composeProjectName = `polycostclean${process.pid}`;
const webPort = process.env.POLYCOST_CLEAN_CLONE_WEB_PORT ?? '3200';
const apiHostPort = process.env.POLYCOST_CLEAN_CLONE_API_HOST_PORT ?? '3201';
const vaultHostPort = process.env.POLYCOST_CLEAN_CLONE_VAULT_HOST_PORT ?? '18210';
const apiBaseUrl = `http://localhost:${apiHostPort}/api/v1`;
const startedAt = Date.now();

console.log('Clean-clone demo verification starting.');
console.log(`Source: ${sourceRepo}`);
console.log(`Budget: ${thresholdMs}ms`);

let cloneCreated = false;
let demoFailed = false;

try {
  run('git', ['clone', '--local', '--no-hardlinks', sourceRepo, cloneDir], { cwd: root });
  cloneCreated = true;

  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: composeProjectName,
    WEB_PORT: webPort,
    API_HOST_PORT: apiHostPort,
    API_PORT: '3001',
    PORT: '3001',
    VAULT_HOST_PORT: vaultHostPort,
    VITE_API_BASE_URL: apiBaseUrl,
    CORS_ALLOWED_ORIGINS: [
      `http://localhost:${webPort}`,
      `http://127.0.0.1:${webPort}`,
      `http://localhost:${apiHostPort}`,
      `http://127.0.0.1:${apiHostPort}`,
    ].join(','),
  };

  run('npm', ['run', 'demo:up'], { cwd: cloneDir, env });

  const durationMs = Date.now() - startedAt;
  assertWithin(durationMs, thresholdMs, 'clean-clone-to-running');

  console.log('Clean-clone demo verification passed.');
  console.log(`- Clone path: ${cloneDir}`);
  console.log(`- Web app: http://127.0.0.1:${webPort}/`);
  console.log(`- API health: http://127.0.0.1:${apiHostPort}/health`);
  console.log(`- Duration: ${durationMs}ms (limit ${thresholdMs}ms)`);
} catch (error) {
  demoFailed = true;
  throw error;
} finally {
  if (cloneCreated) {
    if (demoFailed) {
      run('docker', ['compose', 'logs', '--tail', '160', 'vault', 'vault-seed'], {
        cwd: cloneDir,
        env: { ...process.env, COMPOSE_PROJECT_NAME: composeProjectName },
        allowFailure: true,
      });
    }

    run('docker', ['compose', 'down', '--remove-orphans', '--volumes'], {
      cwd: cloneDir,
      env: { ...process.env, COMPOSE_PROJECT_NAME: composeProjectName },
      allowFailure: true,
    });
  }

  if (!keepClone) {
    rmSync(tempParent, { recursive: true, force: true });
  } else {
    console.log(`Keeping clean clone at ${cloneDir}`);
  }
}

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    env: options.env ?? process.env,
  });

  if (result.error) {
    if (options.allowFailure) {
      console.warn(`${command} failed to start: ${result.error.message}`);
      return result;
    }

    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }

  return result;
}

function assertWithin(durationMs, limitMs, label) {
  if (durationMs > limitMs) {
    throw new Error(`${label} took ${durationMs}ms, exceeding ${limitMs}ms`);
  }
}
