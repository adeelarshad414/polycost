import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'LOADING-INVENTORY.md',
  'LOADING-AUDIT-REPORT.md',
  'apps/web/src/components/LoadingExperience.tsx',
  'apps/web/src/components/LoadingExperience.spec.tsx',
];

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(root, filePath))) {
    failures.push(`Missing loading experience file: ${filePath}`);
  }
}

await assertFileContains('apps/web/src/components/LoadingExperience.tsx', [
  ['BootSplash component', 'export function BootSplash'],
  ['SessionLoader component', 'export function SessionLoader'],
  ['Skeleton presets', 'export const Skeleton'],
  ['ProgressBar component', 'export function ProgressBar'],
  ['TaskQueue component', 'export function TaskQueue'],
  ['JobToast component', 'export function JobToast'],
  ['LiveTail component', 'export function LiveTail'],
  ['delay mount constant', 'LOADER_DELAY_MS = 150'],
]);

await assertFileContains('apps/web/src/components/TopLoadingBar.tsx', [
  ['top bar delay mount', 'LOADING_DELAY_MS = 150'],
  ['top bar minimum hold', 'COMPLETE_MIN_VISIBLE_MS = 320'],
]);

await assertFileContains('apps/web/src/App.tsx', [
  ['boot splash wired', '<BootSplash active={isBooting} />'],
  ['session loader wired', '<SessionLoader'],
  ['task queue wired', '<TaskQueue items={taskItems} />'],
  ['pricing evidence shared loader', 'Syncing pricing evidence'],
]);

await assertFileContains('apps/web/src/components/PersonaComparisonWorkspace.tsx', [
  ['workspace shared loading status', 'Building engineering rows'],
  ['workspace skeleton grid', '<Skeleton.Grid cards={3} />'],
]);

await assertFileContains('apps/web/src/components/FinOpsFeatureLayer.tsx', [
  ['shared report loading status', 'Opening shared report'],
  ['shared report skeleton grid', '<Skeleton.Grid cards={3} />'],
]);

await assertFileContains('apps/web/src/styles.css', [
  ['boot splash styles', '.boot-splash'],
  ['session loader styles', '.session-loader'],
  ['skeleton styles', '.skeleton-grid'],
  ['task queue styles', '.task-queue'],
  ['reduced motion override', 'prefers-reduced-motion'],
]);

await assertFileContains('LOADING-INVENTORY.md', [
  ['inventory method', 'Method:'],
  ['boot wait', 'Cold SPA boot'],
  ['workspace wait', 'Stored workspace token verification'],
  ['export wait', 'Export PDF/CSV/Excel'],
  ['honesty note', 'No time-based fake progress was added'],
]);

await assertFileContains('LOADING-AUDIT-REPORT.md', [
  ['finding table', '## Findings And Disposition'],
  ['component set', '## Component Set'],
  ['human gates', '## HUMAN_DECISION_GATE'],
  ['blocked section', '## Blocked'],
]);

await assertOnlySharedButtonSpinners();

if (failures.length > 0) {
  console.error('Loading experience check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Loading experience check passed.');

async function assertFileContains(filePath, checks) {
  const absolutePath = path.join(root, filePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing file for content check: ${filePath}`);
    return;
  }

  const content = await readFile(absolutePath, 'utf8');
  for (const [description, needle] of checks) {
    if (!content.includes(needle)) {
      failures.push(`${filePath} missing ${description}: ${needle}`);
    }
  }
}

async function assertOnlySharedButtonSpinners() {
  const files = await findFiles(path.join(root, 'apps/web/src'), /\.(tsx|ts)$/);
  const offenders = [];

  for (const file of files) {
    const relativePath = path.relative(root, file);
    if (/\.spec\.(ts|tsx)$/.test(relativePath)) {
      continue;
    }

    const content = await readFile(file, 'utf8');
    if (content.includes('animate-spin') && relativePath !== 'apps/web/src/components/Button.tsx') {
      offenders.push(relativePath);
    }
  }

  for (const offender of offenders) {
    failures.push(`Ad-hoc animate-spin remains outside shared Button: ${offender}`);
  }
}

async function findFiles(directory, pattern) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(entryPath, pattern)));
    } else if (pattern.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}
