import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const coveragePath = path.join(root, 'coverage/api/coverage-final.json');
const metricThreshold = Number(process.env.POLYCOST_PRICING_LOGIC_COVERAGE_THRESHOLD ?? 80);
const branchThreshold = Number(process.env.POLYCOST_PRICING_LOGIC_BRANCH_THRESHOLD ?? 75);
const pricingPathFragments = [
  'apps/api/src/cost-time.ts',
  'apps/api/src/adapters/',
  'apps/api/src/comparison/',
  'apps/api/src/pricing-etl/',
  'apps/api/src/pricing-models/',
  'apps/api/src/pricing-normalization/',
];

if (!existsSync(coveragePath)) {
  console.error(
    `Pricing logic coverage check failed: missing ${path.relative(root, coveragePath)}. Run npm run test:coverage first.`,
  );
  process.exit(1);
}

const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const pricingFiles = Object.values(coverage).filter((fileCoverage) => {
  const normalizedPath = path.relative(root, fileCoverage.path).replaceAll(path.sep, '/');
  return pricingPathFragments.some((fragment) => normalizedPath.includes(fragment));
});

if (pricingFiles.length === 0) {
  console.error('Pricing logic coverage check failed: no pricing coverage files were found.');
  process.exit(1);
}

const summary = {
  statements: ratio(sumCovered(pricingFiles, 's'), sumTotal(pricingFiles, 's')),
  functions: ratio(sumCovered(pricingFiles, 'f'), sumTotal(pricingFiles, 'f')),
  branches: ratio(sumCoveredBranches(pricingFiles), sumTotalBranches(pricingFiles)),
  lines: ratio(sumCoveredLines(pricingFiles), sumTotalLines(pricingFiles)),
};

const failures = [
  assertMetric('statements', summary.statements, metricThreshold),
  assertMetric('functions', summary.functions, metricThreshold),
  assertMetric('lines', summary.lines, metricThreshold),
  assertMetric('branches', summary.branches, branchThreshold),
].filter(Boolean);

if (failures.length > 0) {
  console.error('Pricing logic coverage check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(formatSummary(summary, pricingFiles.length));
  process.exit(1);
}

console.log(formatSummary(summary, pricingFiles.length));

function sumCovered(files, key) {
  return files.reduce((total, fileCoverage) => {
    return total + Object.values(fileCoverage[key]).filter((count) => count > 0).length;
  }, 0);
}

function sumTotal(files, key) {
  return files.reduce((total, fileCoverage) => total + Object.keys(fileCoverage[key]).length, 0);
}

function sumCoveredBranches(files) {
  return files.reduce((total, fileCoverage) => {
    return (
      total +
      Object.values(fileCoverage.b).reduce((branchTotal, branchCounts) => {
        return branchTotal + branchCounts.filter((count) => count > 0).length;
      }, 0)
    );
  }, 0);
}

function sumTotalBranches(files) {
  return files.reduce((total, fileCoverage) => {
    return (
      total +
      Object.values(fileCoverage.b).reduce((branchTotal, branchCounts) => {
        return branchTotal + branchCounts.length;
      }, 0)
    );
  }, 0);
}

function sumCoveredLines(files) {
  return files.reduce((total, fileCoverage) => {
    return total + collectLineCoverage(fileCoverage).filter((count) => count > 0).length;
  }, 0);
}

function sumTotalLines(files) {
  return files.reduce((total, fileCoverage) => {
    return total + collectLineCoverage(fileCoverage).length;
  }, 0);
}

function collectLineCoverage(fileCoverage) {
  const lineCounts = new Map();

  for (const [statementId, location] of Object.entries(fileCoverage.statementMap)) {
    const line = location.start.line;
    const count = fileCoverage.s[statementId] ?? 0;
    lineCounts.set(line, Math.max(lineCounts.get(line) ?? 0, count));
  }

  return [...lineCounts.values()];
}

function ratio(covered, total) {
  return {
    covered,
    total,
    percent: total === 0 ? 100 : (covered / total) * 100,
  };
}

function assertMetric(label, metric, threshold) {
  if (metric.percent >= threshold) {
    return undefined;
  }

  return `${label} ${formatPercent(metric.percent)} is below ${formatPercent(threshold)}`;
}

function formatSummary(summary, fileCount) {
  return [
    `Pricing logic coverage check passed for ${fileCount} file(s).`,
    `- statements: ${summary.statements.covered}/${summary.statements.total} (${formatPercent(summary.statements.percent)})`,
    `- functions: ${summary.functions.covered}/${summary.functions.total} (${formatPercent(summary.functions.percent)})`,
    `- lines: ${summary.lines.covered}/${summary.lines.total} (${formatPercent(summary.lines.percent)})`,
    `- branches: ${summary.branches.covered}/${summary.branches.total} (${formatPercent(summary.branches.percent)}, threshold ${formatPercent(branchThreshold)})`,
  ].join('\n');
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}
