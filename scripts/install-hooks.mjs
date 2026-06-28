import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('.git')) {
  console.warn('Git hooks not installed: this workspace is not currently a git repository.');
  process.exit(0);
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to configure git hooks: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
