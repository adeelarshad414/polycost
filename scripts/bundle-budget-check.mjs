// Bundle budget (UI-5): fail CI when the JS and CSS a first-time visitor
// downloads before interacting grows past the agreed budget. Reads the built
// apps/web/dist/index.html, so run it after `npm run build`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const webRoot = path.join(process.cwd(), 'apps/web');
const indexPath = path.join(webRoot, 'dist/index.html');
const budgetPath = path.join(webRoot, 'bundle-budget.json');

if (!existsSync(indexPath)) {
  console.error('Bundle budget check needs a build: run `npm run build` first.');
  process.exit(1);
}

const { initialGzipKb } = JSON.parse(readFileSync(budgetPath, 'utf8'));
const html = readFileSync(indexPath, 'utf8');
// Entry script, modulepreloaded chunks and stylesheets referenced by index.html.
const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map(
  (match) => match[1],
);

const rows = assets.map((asset) => {
  const bytes = readFileSync(path.join(webRoot, 'dist', asset));
  return { asset, rawKb: bytes.length / 1024, gzipKb: gzipSync(bytes).length / 1024 };
});
const totalGzipKb = rows.reduce((sum, row) => sum + row.gzipKb, 0);

for (const row of rows) {
  console.log(`  ${row.asset.padEnd(48)} ${row.gzipKb.toFixed(1).padStart(7)} KB gzip`);
}
console.log(
  `Initial load: ${totalGzipKb.toFixed(1)} KB gzip across ${rows.length} files (budget ${initialGzipKb} KB).`,
);

if (rows.length === 0) {
  console.error('Bundle budget check found no assets in dist/index.html.');
  process.exit(1);
}

if (totalGzipKb > initialGzipKb) {
  console.error(
    `Bundle budget exceeded by ${(totalGzipKb - initialGzipKb).toFixed(1)} KB. Lazy-load the new ` +
      'code, or raise initialGzipKb in apps/web/bundle-budget.json with a reason in the PR.',
  );
  process.exit(1);
}

console.log('Bundle budget check passed.');
