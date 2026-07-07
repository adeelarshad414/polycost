import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const checkedExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const failures = [];
let reviewedSuppressions = 0;

for (const filePath of await listSourceFiles(root)) {
  const relativePath = path.relative(root, filePath);
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!/eslint-disable(?:-next-line|-line)?\b.*security\//.test(line)) {
      return;
    }

    const hasReviewDate = /Reviewed \d{4}-\d{2}-\d{2}/.test(line);
    const hasLedgerReference = line.includes('docs/SECURITY-SUPPRESSIONS.md');

    if (!hasReviewDate || !hasLedgerReference) {
      failures.push(
        `${relativePath}:${index + 1} security ESLint suppression must include "Reviewed YYYY-MM-DD" and docs/SECURITY-SUPPRESSIONS.md`,
      );
      return;
    }

    reviewedSuppressions += 1;
  });
}

if (failures.length > 0) {
  console.error('Security suppression check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Security suppression check passed: ${reviewedSuppressions} reviewed suppression(s).`);

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && entryPath !== path.join(root, 'apps/web/dist')) {
        files.push(...(await listSourceFiles(entryPath)));
      }
      continue;
    }

    if (checkedExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}
