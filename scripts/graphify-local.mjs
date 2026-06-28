import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const command = process.argv[2] ?? 'build';
const root = process.cwd();
const outputDir = path.join(root, 'reports', 'graphify');
const graphPath = path.join(outputDir, 'project-graph.json');
const mermaidPath = path.join(outputDir, 'project-graph.mmd');

const ignoredDirectories = new Set([
  '.git',
  '.graphify',
  'coverage',
  'dist',
  'node_modules',
  'test-results',
]);

if (!['build', 'validate', 'visualize'].includes(command)) {
  fail(`Unknown graphify-local command: ${command}`);
}

const graph = await buildGraph();

if (command === 'validate') {
  validateGraph(graph);
  console.log(`Graph validation passed: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
} else {
  await mkdir(outputDir, { recursive: true });
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(mermaidPath, renderMermaid(graph));
  console.log(`Wrote ${path.relative(root, graphPath)}`);
  console.log(`Wrote ${path.relative(root, mermaidPath)}`);
}

async function buildGraph() {
  const nodes = new Map();
  const edges = [];

  const addNode = (id, label, type, metadata = {}) => {
    nodes.set(id, { id, label, type, metadata });
  };
  const addEdge = (source, target, type) => {
    edges.push({ source, target, type });
  };

  const rootPackage = await readJson(path.join(root, 'package.json'));
  addNode('repo:polycost', 'PolyCost repository', 'repository');
  addNode('package:root', rootPackage.name ?? 'root package', 'package');
  addEdge('repo:polycost', 'package:root', 'defines');

  const workspacePatterns = rootPackage.workspaces ?? [];
  for (const pattern of workspacePatterns) {
    const workspaceRoot = pattern.replace(/\/\*$/, '');
    const workspacePath = path.join(root, workspaceRoot);
    if (!existsSync(workspacePath)) {
      continue;
    }

    for (const entry of await readdir(workspacePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packagePath = path.join(workspacePath, entry.name, 'package.json');
      if (!existsSync(packagePath)) {
        continue;
      }

      const packageJson = await readJson(packagePath);
      const packageId = `package:${packageJson.name}`;
      addNode(packageId, packageJson.name, 'package', {
        path: path.relative(root, packagePath),
      });
      addEdge('package:root', packageId, 'workspace');

      for (const [dependencyName, version] of Object.entries({
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      })) {
        const dependencyId = `dependency:${dependencyName}`;
        addNode(dependencyId, dependencyName, 'dependency', { version });
        addEdge(packageId, dependencyId, 'depends_on');
      }

      const sourceRoot = path.join(workspacePath, entry.name, 'src');
      if (existsSync(sourceRoot)) {
        for (const filePath of await listFiles(sourceRoot)) {
          const relativePath = path.relative(root, filePath);
          const sourceId = `source:${relativePath}`;
          addNode(sourceId, relativePath, 'source_file');
          addEdge(packageId, sourceId, 'owns');
        }
      }
    }
  }

  for (const specPath of [
    ...docFilesAtRoot(),
    ...(existsSync(path.join(root, 'docs')) ? await listFiles(path.join(root, 'docs')) : []),
    ...(existsSync(path.join(root, 'specs')) ? await listFiles(path.join(root, 'specs')) : []),
  ]) {
    const relativePath = path.relative(root, specPath);
    const specId = `spec:${relativePath}`;
    addNode(specId, relativePath, 'spec_or_doc');
    addEdge('repo:polycost', specId, 'documents');
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) =>
      `${a.source}:${a.target}:${a.type}`.localeCompare(`${b.source}:${b.target}:${b.type}`),
    ),
  };
}

function validateGraph(graphToValidate) {
  const requiredNodeIds = [
    'repo:polycost',
    'package:root',
    'package:@polycost/api',
    'package:@polycost/web',
  ];
  const nodeIds = new Set(graphToValidate.nodes.map((node) => node.id));
  const missingRequired = requiredNodeIds.filter((nodeId) => !nodeIds.has(nodeId));

  if (missingRequired.length > 0) {
    fail(`Graph is missing required nodes: ${missingRequired.join(', ')}`);
  }

  for (const edge of graphToValidate.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      fail(`Graph has dangling edge: ${edge.source} -> ${edge.target}`);
    }
  }

  if (graphToValidate.nodes.length < 10 || graphToValidate.edges.length < 10) {
    fail('Graph is unexpectedly small.');
  }
}

function renderMermaid(graphToRender) {
  const lines = ['flowchart LR'];
  const selectedEdges = graphToRender.edges
    .filter((edge) => edge.source.startsWith('package:') || edge.source === 'repo:polycost')
    .slice(0, 120);

  for (const edge of selectedEdges) {
    lines.push(
      `  ${mermaidId(edge.source)}["${escapeMermaid(edge.source)}"] -->|${escapeMermaid(
        edge.type,
      )}| ${mermaidId(edge.target)}["${escapeMermaid(edge.target)}"]`,
    );
  }

  return `${lines.join('\n')}\n`;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await listFiles(entryPath)));
      }
      continue;
    }

    if (/\.(cjs|css|html|js|json|md|mjs|sql|ts|tsx|yml|yaml)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function docFilesAtRoot() {
  return [
    '00-MASTER-PROMPT.md',
    '01-VISION-AND-ROADMAP.md',
    '02-MVP-SCOPE.md',
    '03-ARCHITECTURE.md',
    '04-DATA-MODEL.md',
    '05-API-CONTRACTS.md',
    '06-ROADMAP-V2-V3-V4.md',
    '07-UI-UX-DESIGN-SYSTEM.md',
    '08-AGENTIC-BUILD-MASTER-PROMPT.md',
    '09-CONFIG-AND-SECRETS.md',
    '10-TESTING-STRATEGY.md',
    '11-SECURITY.md',
    'DEPLOY.md',
    'HOW-TO-USE.md',
    'PROGRESS.md',
    'SECURITY.md',
  ]
    .map((file) => path.join(root, file))
    .filter((filePath) => existsSync(filePath));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function mermaidId(id) {
  return id.replace(/[^a-zA-Z0-9]/g, '_');
}

function escapeMermaid(value) {
  return value.replace(/"/g, '\\"');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
