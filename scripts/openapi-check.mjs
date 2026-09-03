#!/usr/bin/env node
// Fails the build when docs/api/openapi.json no longer matches the controllers.
//
// A published spec that has drifted is worse than no spec: clients generate
// code from it and only discover the lie at runtime. This regenerates from
// source and diffs, so adding or renaming a route without regenerating is a
// build failure rather than a support ticket.
//
// Same reasoning as scripts/alert-rules-check.mjs - a document that can rot
// silently needs a check that notices.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SPEC = path.join(root, 'docs/api/openapi.json');

if (!existsSync(SPEC)) {
  console.error('docs/api/openapi.json is missing. Run: npm run openapi:generate');
  process.exit(1);
}

const committed = readFileSync(SPEC, 'utf8');

// Regenerate over the committed file, compare, then restore whatever was there
// so a failing check never leaves the working tree modified.
execFileSync('node', ['scripts/openapi-generate.mjs'], { stdio: 'pipe' });
const regenerated = readFileSync(SPEC, 'utf8');

if (committed !== regenerated) {
  writeFileSync(SPEC, committed);

  const committedPaths = operationSet(JSON.parse(committed));
  const currentPaths = operationSet(JSON.parse(regenerated));

  const added = [...currentPaths].filter((op) => !committedPaths.has(op));
  const removed = [...committedPaths].filter((op) => !currentPaths.has(op));

  console.error('OpenAPI spec is out of date with the controllers.\n');
  for (const op of added.slice(0, 20)) {
    console.error(`  + ${op} exists in the code but not in the spec`);
  }
  for (const op of removed.slice(0, 20)) {
    console.error(`  - ${op} is in the spec but no longer in the code`);
  }
  if (added.length === 0 && removed.length === 0) {
    console.error('  The operation list matches; something else in the document changed.');
  }
  console.error('\nRegenerate with: npm run openapi:generate');
  process.exit(1);
}

const document = JSON.parse(regenerated);
const operations = operationSet(document);

console.log(
  `OpenAPI check passed: ${operations.size} operations across ${Object.keys(document.paths).length} paths, matching the controllers.`,
);

function operationSet(document) {
  const operations = new Set();

  for (const [routePath, methods] of Object.entries(document.paths ?? {})) {
    for (const method of Object.keys(methods)) {
      operations.add(`${method.toUpperCase()} ${routePath}`);
    }
  }

  return operations;
}
