import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const frontendCatalogPath = 'apps/web/src/service-catalog.ts';
const apiCoverageSpecPath = 'apps/api/src/comparison/comparison-orchestrator.service.spec.ts';

const frontendCatalog = await readSourceFile(frontendCatalogPath);
const apiCoverageSpec = await readSourceFile(apiCoverageSpecPath);

const frontendPricedFamilyIds = extractPricedFamilyIds(frontendCatalog);
const apiCoverageFamilyIds = extractStringArray(apiCoverageSpec, 'UI_PRICED_SERVICE_FAMILY_IDS');
const failures = [];

if (frontendPricedFamilyIds.length === 0) {
  failures.push('No priced service families were discovered in the frontend service catalog.');
}

if (apiCoverageFamilyIds.length === 0) {
  failures.push('No API pricing coverage family IDs were discovered in the orchestrator spec.');
}

const frontendSet = new Set(frontendPricedFamilyIds);
const apiSet = new Set(apiCoverageFamilyIds);
const missingFromApiCoverage = frontendPricedFamilyIds.filter((id) => !apiSet.has(id));
const staleApiCoverage = apiCoverageFamilyIds.filter((id) => !frontendSet.has(id));
const orderMismatch =
  missingFromApiCoverage.length === 0 &&
  staleApiCoverage.length === 0 &&
  frontendPricedFamilyIds.some((id, index) => id !== apiCoverageFamilyIds[index]);

if (missingFromApiCoverage.length > 0) {
  failures.push(
    `Frontend priced families missing from API pricing coverage guard: ${missingFromApiCoverage.join(
      ', ',
    )}`,
  );
}

if (staleApiCoverage.length > 0) {
  failures.push(
    `API pricing coverage guard contains non-priced or removed service families: ${staleApiCoverage.join(
      ', ',
    )}`,
  );
}

if (orderMismatch) {
  failures.push(
    'API pricing coverage family list order differs from the frontend service catalog.',
  );
}

if (failures.length > 0) {
  console.error('Pricing service coverage check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Pricing service coverage check passed: ${frontendPricedFamilyIds.length} frontend priced families are covered by the API pricing guard.`,
);

async function readSourceFile(relativePath) {
  const sourceText = await readFile(path.join(root, relativePath), 'utf8');

  return ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true);
}

function extractPricedFamilyIds(sourceFile) {
  const pricedFamilyIds = [];

  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }

    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'family') {
      return;
    }

    const [id, , , supportStatus] = node.arguments;

    if (ts.isStringLiteralLike(id) && ts.isStringLiteralLike(supportStatus)) {
      if (supportStatus.text === 'priced') {
        pricedFamilyIds.push(id.text);
      }
    }
  });

  return pricedFamilyIds;
}

function extractStringArray(sourceFile, variableName) {
  const values = [];

  visit(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) {
      return;
    }

    if (node.name.text !== variableName || !node.initializer) {
      return;
    }

    const initializer = unwrapExpression(node.initializer);

    if (!ts.isArrayLiteralExpression(initializer)) {
      return;
    }

    for (const element of initializer.elements) {
      if (ts.isStringLiteralLike(element)) {
        values.push(element.text);
      }
    }
  });

  return values;
}

function unwrapExpression(expression) {
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
