import { existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = process.env.API_PORT ?? process.env.PORT ?? '3001';
const apiHostPort = process.env.API_HOST_PORT ?? apiPort;
const webPort = process.env.WEB_PORT ?? '3000';
const apiHealthUrl = `http://127.0.0.1:${apiHostPort}/health`;
const webUrl = `http://127.0.0.1:${webPort}/`;
const webApiDataHealthUrl = `http://127.0.0.1:${webPort}/api/v1/data-health`;

console.log('PolyCost demo bootstrap starting.');
ensureNodeVersion();
ensureEnvFile();
ensureDependencies();
run('node', ['scripts/provider-credential-check.mjs']);
run('docker', ['compose', 'up', '--build', '-d']);
run('npm', ['run', 'db:migrate']);
await waitForHttp(apiHealthUrl, 'API health');
await waitForHttp(webUrl, 'web app');
await waitForJson(webApiDataHealthUrl, 'web-origin API proxy');

console.log('');
console.log('PolyCost demo is ready.');
console.log(`Web app: ${webUrl}`);
console.log(`API health: ${apiHealthUrl}`);
console.log(`API base: http://127.0.0.1:${apiHostPort}/api/v1`);
console.log('');
console.log('Suggested next command: npm run demo:artifacts');

function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

  if (major < 20) {
    fail(`Node.js 20+ is required. Current version is ${process.versions.node}.`);
  }
}

function ensureEnvFile() {
  const envPath = path.join(root, '.env');
  const examplePath = path.join(root, '.env.example');

  if (existsSync(envPath)) {
    return;
  }

  copyFileSync(examplePath, envPath);
  console.log('Created .env from .env.example.');
}

function ensureDependencies() {
  if (existsSync(path.join(root, 'node_modules'))) {
    return;
  }

  run('npm', ['ci']);
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 180_000;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        console.log(`${label} is responding at ${url}.`);
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
    }

    await delay(2500);
  }

  fail(`${label} did not become ready at ${url}: ${lastError}`);
}

async function waitForJson(url, label) {
  const deadline = Date.now() + 60_000;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') ?? '';

      if (response.ok && contentType.includes('application/json')) {
        await response.json();
        console.log(`${label} is returning JSON at ${url}.`);
        return;
      }

      lastError = `HTTP ${response.status} content-type ${contentType || 'unknown'}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
    }

    await delay(2500);
  }

  fail(`${label} did not return JSON at ${url}: ${lastError}`);
}

function run(command, args) {
  console.log(`> ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
