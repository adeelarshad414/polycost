import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['apps/web/src'];
const allowedFiles = new Set([path.normalize('apps/web/src/styles/tokens.css')]);
const sourceExtensions = new Set(['.css', '.ts', '.tsx']);
const hexPattern = /#[0-9A-Fa-f]{3,8}\b/g;
const findings = [];

for (const scanRoot of scanRoots) {
  await scanDirectory(path.join(root, scanRoot));
}

if (findings.length > 0) {
  console.error(
    'Theme hex guard failed. Move raw color values into apps/web/src/styles/tokens.css:',
  );
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Theme hex guard passed.');

async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      await scanDirectory(absolutePath);
      continue;
    }

    if (!sourceExtensions.has(path.extname(entry.name)) || allowedFiles.has(relativePath)) {
      continue;
    }

    const source = await readFile(absolutePath, 'utf8');
    for (const match of source.matchAll(hexPattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      findings.push(`${relativePath}:${line}: ${match[0]}`);
    }
  }
}
