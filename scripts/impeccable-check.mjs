import { spawnSync } from 'node:child_process';

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

if (nodeMajor < 24) {
  // Release hygiene: keep Node 20 as the supported runtime until the project elects a Node 24 CI matrix.
  console.warn(
    'Impeccable check skipped: impeccable@3.1.0 requires Node.js 24+, while this repo currently targets Node.js 20.',
  );
  console.warn('Retry after upgrading the toolchain with: npm run impeccable');
  process.exit(0);
}

const result = spawnSync(
  'npx',
  ['--yes', 'impeccable@3.1.0', 'detect', 'apps/web/src', 'apps/web/index.html'],
  {
    encoding: 'utf8',
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`Impeccable failed to start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
