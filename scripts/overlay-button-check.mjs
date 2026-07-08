import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'OVERLAY-INVENTORY.md',
  'BUTTON-INVENTORY.md',
  'OVERLAY-AUDIT-REPORT.md',
  'apps/web/src/components/OverlayPrimitives.tsx',
  'apps/web/src/components/OverlayPrimitives.spec.tsx',
  'apps/web/src/components/Button.tsx',
];

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing overlay/button artifact: ${filePath}`);
  }
}

await assertFileContains('apps/web/src/components/Button.tsx', [
  'destructiveQuiet',
  'pc-button-destructive-quiet',
  'pc-button-link',
  'pc-button-icon',
]);

await assertFileContains('apps/web/src/components/OverlayPrimitives.tsx', [
  'role="dialog"',
  'aria-modal="true"',
  'ToastStack',
  'Banner',
  'trapFocus',
  'inert',
]);

await assertFileContains('apps/web/src/styles.css', [
  '.pc-overlay-root',
  '.pc-dialog',
  '.pc-drawer',
  '.pc-popover',
  '.pc-toast',
  '.pc-banner',
]);

await assertNoLegacyInterruptions('apps/web/src');

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.scripts?.['overlay:check']) {
  failures.push('package.json is missing overlay:check');
}
if (!packageJson.scripts?.check?.includes('npm run overlay:check')) {
  failures.push('package.json check script must include npm run overlay:check');
}

if (failures.length > 0) {
  console.error('Overlay/button guard failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Overlay/button guard passed.');

async function assertFileContains(filePath, needles) {
  const absolutePath = path.join(root, filePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Cannot inspect missing file: ${filePath}`);
    return;
  }

  const content = await readFile(absolutePath, 'utf8');
  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${filePath} is missing required marker: ${needle}`);
    }
  }
}

async function assertNoLegacyInterruptions(relativeDir) {
  const { readdir } = await import('node:fs/promises');
  const rootDir = path.join(root, relativeDir);
  const filePaths = await collectFiles(rootDir, readdir);

  for (const filePath of filePaths) {
    if (!/\.(tsx|ts|jsx|js)$/.test(filePath) || /\.spec\.(tsx|ts|jsx|js)$/.test(filePath)) {
      continue;
    }

    const content = await readFile(filePath, 'utf8');
    if (/\bwindow\.(confirm|alert)\b/.test(content)) {
      failures.push(`${path.relative(root, filePath)} still uses window.confirm/window.alert`);
    }
  }
}

async function collectFiles(directory, readdir) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, readdir)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}
