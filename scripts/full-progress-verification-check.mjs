import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
let evidenceAnchors = 0;

await assertMonthlyHourStandard();
await assertForbiddenTimeFormulaAudit();
await assertPhaseEvidenceAnchors();

if (failures.length > 0) {
  console.error('Full progress verification check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Full progress verification check passed: ${evidenceAnchors} phase evidence anchors verified.`,
);

async function assertMonthlyHourStandard() {
  const standard = JSON.parse(
    await readFile(path.join(root, 'packages/types/monthly-hour-standard.json'), 'utf8'),
  );

  assertEqual('monthly-hour standard hoursPerMonth', standard.hoursPerMonth, 730);
  assertEqual('monthly-hour standard hoursPerDay', standard.hoursPerDay, 24);
  assertEqual('monthly-hour standard daysPerWeek', standard.daysPerWeek, 7);
  assertEqual('monthly-hour standard monthsPerQuarter', standard.monthsPerQuarter, 3);

  await assertFileContains('apps/api/src/cost-time.ts', [
    ['shared monthly-hour import', "from '@polycost/types/monthly-hour-standard.json'"],
    [
      'monthly interval derived from shared constant',
      'monthly: roundCurrency(hourlyCostUsd * HOURS_PER_MONTH)',
    ],
    [
      'quarterly interval derived from shared constant',
      'quarterly: roundCurrency(hourlyCostUsd * HOURS_PER_MONTH * MONTHS_PER_QUARTER)',
    ],
    [
      'yearly interval derived from shared constant',
      'yearly: roundCurrency(hourlyCostUsd * HOURS_PER_YEAR)',
    ],
  ]);

  await assertFileContains('apps/api/src/cost-time.spec.ts', [
    ['730-hour month regression', 'expect(HOURS_PER_MONTH).toBe(730)'],
    ['all reporting intervals regression', 'derives every reporting interval'],
  ]);
}

async function assertForbiddenTimeFormulaAudit() {
  const files = await listFiles(['apps', 'packages', 'database', 'scripts']);
  const allowListed720 = new Map([
    ['apps/api/src/reports/report-generators.spec.ts', ['quarterly: 720']],
    ['apps/api/src/pricing-normalization/egress-tier-calculator.spec.ts', ['billableGb: 30_720']],
  ]);

  for (const file of files) {
    if (path.relative(root, file) === 'scripts/full-progress-verification-check.mjs') {
      continue;
    }

    const relativePath = path.relative(root, file);
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (/24\s*\*\s*30/.test(line)) {
        failures.push(
          `${relativePath}:${index + 1} uses 24*30 month math instead of HOURS_PER_MONTH`,
        );
      }

      if (/365\s*\/\s*12/.test(line)) {
        failures.push(
          `${relativePath}:${index + 1} uses 365/12 month math instead of HOURS_PER_MONTH`,
        );
      }

      if (/\b720\b/.test(line) && !isAllowed720(relativePath, line, allowListed720)) {
        failures.push(
          `${relativePath}:${index + 1} contains bare 720; use the 730-hour standard or document an explicit non-time value`,
        );
      }
    }
  }

  evidenceAnchors += 1;
}

async function assertPhaseEvidenceAnchors() {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assertScriptIncludes(packageJson, 'check', [
    'npm run progress:verify',
    'npm run pricing:coverage:check',
    'npm run provider:credentials:check',
  ]);
  assertScriptIncludes(packageJson, 'test:production-readiness', [
    'src/pricing-normalization/pricing-reconciliation.spec.ts',
    'src/api/live-pricing-traceability.spec.ts',
    'src/api/auth-billing.spec.ts',
    'src/diagram-parser/diagram-parser.service.spec.ts',
    'src/reports/report-generators.spec.ts',
    'src/App.spec.tsx',
  ]);

  await assertFileContains('database/migrations/009_pricing_rates_matrix.sql', [
    ['hourly stored unit', 'hourly_rate_usd'],
    ['estimate flag', 'is_estimate'],
    ['append-only valid-from', 'valid_from'],
    ['append-only valid-to', 'valid_to'],
  ]);

  await assertFileContains('database/migrations/028_pricing_lineage_metadata.sql', [
    ['pricing source endpoint lineage', 'source_endpoint'],
    ['pricing source record lineage', 'source_record_id'],
    ['pricing transform version lineage', 'transform_version'],
    ['pricing payload hash lineage', 'source_payload_hash'],
  ]);

  await assertFileContains('apps/api/src/pricing-normalization/egress-tier-calculator.spec.ts', [
    ['80TB manual egress regression', 'matches the manual AWS-style tier calculation for 80TB'],
    ['manual 80TB total', '6553.6'],
  ]);

  await assertFileContains('apps/api/src/pricing-normalization/pricing-reconciliation.spec.ts', [
    ['20-rate reconciliation floor', 'at least 20 distinct'],
    ['raw lineage recomputation', 'expectCompleteLineage'],
    ['provider breadth coverage', 'covers mainstream %s compute families'],
  ]);

  await assertFileContains('apps/api/src/comparison/comparison-orchestrator.service.ts', [
    ['phase 3 integration hook', 'PHASE_3_HOOK'],
    ['break-even engine', 'break-even'],
  ]);

  await assertFileContains('apps/api/src/nws-parser/requirement-parser.service.ts', [
    ['requirement parser interface adapter', 'NwsBackedRequirementParser'],
    ['phase 2 integration hook', 'PHASE_2_HOOK'],
    ['phase 3 parser hook', 'PHASE_3_HOOK'],
  ]);

  await assertFileContains('apps/web/src/App.spec.tsx', [
    ['executive view evidence', 'Executive monthly baseline'],
    ['engineering view evidence', 'Engineering cost controls'],
    ['break-even UI evidence', 'Break-even timeline'],
    [
      'natural-language editable form evidence',
      'parses natural-language input into the editable form',
    ],
    ['pricing model what-if evidence', '3yr reserved'],
  ]);

  await assertFileContains('apps/api/src/api/mvp-acceptance.e2e.spec.ts', [
    ['natural language E2E source', "sourceType).toBe('natural_language')"],
    ['PDF export E2E', 'export?format=pdf'],
    ['CSV export E2E', 'export?format=csv'],
    ['Excel export E2E', 'export?format=xlsx'],
    ['share revoke E2E', '/revoke'],
    ['SKU evidence E2E', 'expands SKU evidence'],
    ['auth RBAC E2E', 'member RBAC denial'],
    ['Mermaid diagram E2E', "'Mermaid'"],
    ['draw.io diagram E2E', "'draw.io'"],
    ['Lucid diagram E2E', "'Lucid CSV'"],
    ['VSDX diagram E2E', "'VSDX'"],
    ['malicious XXE E2E', 'malicious/xxe.drawio'],
    ['malicious ZIP E2E', 'malicious/zip-bomb.vsdx'],
  ]);

  for (const fixture of [
    'fixtures/diagrams/mermaid/web-app.mmd',
    'fixtures/diagrams/drawio/web-app.drawio',
    'fixtures/diagrams/lucid/lucid-export.csv',
    'fixtures/diagrams/vsdx/simple.vsdx',
    'fixtures/diagrams/malicious/xxe.drawio',
    'fixtures/diagrams/malicious/deflate-bomb.drawio',
    'fixtures/diagrams/malicious/oversized.drawio',
    'fixtures/diagrams/malicious/png-renamed.drawio',
    'fixtures/diagrams/malicious/zip-bomb.vsdx',
  ]) {
    assertExists(fixture);
  }

  await assertFileContains('apps/api/src/api/auth-billing.spec.ts', [
    ['team RBAC matrix', 'enforces the team RBAC matrix'],
    ['billing admin RBAC', 'requires owner or admin access for billing imports'],
    ['mock OIDC round trip', 'mock OIDC start, authorize, and callback'],
  ]);

  await assertFileContains('apps/api/src/health/health.controller.spec.ts', [
    ['deep health with pricing freshness', 'returns deep health with pricing data freshness'],
    ['degraded Redis evidence', "host === 'redis' ? 'degraded'"],
  ]);

  await assertFileContains('apps/api/src/api/api-contract.spec.ts', [
    ['public rate limiting', 'rate limits parse requests by identity'],
    ['data-health warnings', 'adds pricing data-health warnings'],
    ['public data health endpoint', 'GET /data-health returns public pricing freshness'],
  ]);

  await assertFileContains('apps/web/src/styles.css', [
    ['reduced motion rule', 'prefers-reduced-motion'],
    ['brand orange token usage', '--brand-orange'],
    ['brand blue token usage', '--brand-blue'],
    ['brand green token usage', '--brand-green'],
  ]);

  await assertFileContains('.github/workflows/ci.yml', [
    ['progress verification CI gate', 'npm run progress:verify'],
    ['production-readiness CI gate', 'npm run test:production-readiness'],
    ['E2E CI gate', 'npm run ci:e2e'],
    ['security audit CI gate', 'npm run security:audit'],
  ]);

  evidenceAnchors += 1;
}

function assertScriptIncludes(packageJson, scriptName, snippets) {
  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    failures.push(`package.json is missing script: ${scriptName}`);
    return;
  }

  for (const snippet of snippets) {
    if (!script.includes(snippet)) {
      failures.push(`package.json script ${scriptName} is missing: ${snippet}`);
    }
  }

  evidenceAnchors += snippets.length;
}

async function assertFileContains(relativePath, expectations) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing evidence file: ${relativePath}`);
    return;
  }

  const content = await readFile(absolutePath, 'utf8');
  for (const [label, snippet] of expectations) {
    if (!content.includes(snippet)) {
      failures.push(`${relativePath} is missing ${label}: ${snippet}`);
    } else {
      evidenceAnchors += 1;
    }
  }
}

function assertExists(relativePath) {
  if (!existsSync(path.join(root, relativePath))) {
    failures.push(`Missing fixture or release artifact: ${relativePath}`);
  } else {
    evidenceAnchors += 1;
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} expected ${expected}, got ${actual}`);
  } else {
    evidenceAnchors += 1;
  }
}

function isAllowed720(relativePath, line, allowListed720) {
  const snippets = allowListed720.get(relativePath);
  return snippets?.some((snippet) => line.includes(snippet)) ?? false;
}

async function listFiles(relativeDirectories) {
  const files = [];

  for (const relativeDirectory of relativeDirectories) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    if (existsSync(absoluteDirectory)) {
      files.push(...(await listFilesRecursive(absoluteDirectory)));
    }
  }

  return files;
}

async function listFilesRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(entryPath)));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|sql|json)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}
