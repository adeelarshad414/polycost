#!/usr/bin/env node
// Validates ops/prometheus/alerts.yaml against the rest of the repository.
//
// Alert rules rot silently: a metric gets renamed, or a runbook section is
// retitled, and the rule keeps parsing perfectly while pointing at nothing. The
// failure only surfaces during an incident, which is the worst possible moment
// to discover it. This turns both cases into a build failure.
//
// It deliberately does not evaluate PromQL - promtool does that. This checks
// that the things the rules reference actually exist.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES_FILE = path.join(root, 'ops/prometheus/alerts.yaml');
const DASHBOARD_DIR = path.join(root, 'ops/grafana/dashboards');
const RUNBOOK_RELATIVE = 'docs/RUNBOOK.md';
const METRICS_DIR = path.join(root, 'apps/api/src/observability');

const failures = [];

// Series Prometheus derives from a histogram; the base name is what code declares.
const HISTOGRAM_SUFFIXES = ['_bucket', '_count', '_sum'];

// Real series that this service does not declare itself.
const EXTERNAL_METRICS = new Set(['up']);

// PromQL functions, aggregators and keywords that look like metric names.
const PROMQL_IDENTIFIERS = new Set([
  'rate',
  'irate',
  'increase',
  'delta',
  'idelta',
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'count_values',
  'stddev',
  'stdvar',
  'topk',
  'bottomk',
  'quantile',
  'histogram_quantile',
  'absent',
  'absent_over_time',
  'clamp',
  'clamp_min',
  'clamp_max',
  'time',
  'timestamp',
  'vector',
  'scalar',
  'label_replace',
  'label_join',
  'round',
  'floor',
  'ceil',
  'abs',
  'changes',
  'resets',
  'predict_linear',
  'deriv',
  'group',
  'without',
  'ignoring',
  'unless',
  'offset',
  'bool',
  'on',
  'by',
  'and',
  'or',
]);

function stripHistogramSuffix(metric) {
  for (const suffix of HISTOGRAM_SUFFIXES) {
    if (metric.endsWith(suffix)) {
      return metric.slice(0, -suffix.length);
    }
  }
  return metric;
}

/** GitHub's heading-to-anchor rule, which is what the runbook links rely on. */
function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function declaredMetrics() {
  const names = new Set();

  for (const entry of await readdir(METRICS_DIR)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      continue;
    }
    const content = await readFile(path.join(METRICS_DIR, entry), 'utf8');
    for (const match of content.matchAll(/name:\s*'([a-z][a-z0-9_]*)'/g)) {
      names.add(match[1]);
    }
  }

  return names;
}

async function runbookAnchors() {
  const content = await readFile(path.join(root, RUNBOOK_RELATIVE), 'utf8');
  const anchors = new Set();

  for (const match of content.matchAll(/^#{2,4}\s+(.+?)\s*$/gm)) {
    anchors.add(slugify(match[1]));
  }

  return anchors;
}

/** Metric-name-shaped tokens in an expression, excluding label values and functions. */
function referencedMetrics(expression) {
  // Drop label matchers so string values inside them are not mistaken for metrics.
  const withoutLabels = expression.replace(/\{[^}]*\}/g, '');
  const found = new Set();

  for (const match of withoutLabels.matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) {
    const token = match[1];
    if (PROMQL_IDENTIFIERS.has(token) || EXTERNAL_METRICS.has(token)) {
      continue;
    }
    // Metric names in this project always contain an underscore.
    if (!token.includes('_')) {
      continue;
    }
    found.add(stripHistogramSuffix(token));
  }

  return found;
}

const document = yaml.load(await readFile(RULES_FILE, 'utf8'));
const metrics = await declaredMetrics();
const anchors = await runbookAnchors();

const rules = (document?.groups ?? []).flatMap((group) => group.rules ?? []);

if (rules.length === 0) {
  failures.push(
    'No alert rules found - is ops/prometheus/alerts.yaml still in the expected shape?',
  );
}

for (const rule of rules) {
  const name = rule.alert ?? '(unnamed)';

  if (!rule.alert) {
    failures.push('A rule has no `alert` name.');
  }
  if (!rule.labels?.severity) {
    failures.push(`${name}: no severity label, so it cannot be routed.`);
  }
  if (!rule.annotations?.summary) {
    failures.push(`${name}: no summary annotation.`);
  }

  const link = rule.annotations?.runbook;
  if (!link) {
    // An alert with no instructions is a page nobody can act on.
    failures.push(`${name}: no runbook annotation.`);
  } else {
    const [file, anchor] = link.split('#');
    if (file !== RUNBOOK_RELATIVE) {
      failures.push(`${name}: runbook link points outside the runbook (${link}).`);
    } else if (!anchor || !anchors.has(anchor)) {
      failures.push(`${name}: runbook section does not exist (${link}).`);
    }
  }

  for (const metric of referencedMetrics(String(rule.expr ?? ''))) {
    if (!metrics.has(metric)) {
      failures.push(`${name}: references a metric the service does not emit (${metric}).`);
    }
  }
}

// Dashboards rot the same way, and worse: a renamed metric leaves a panel that
// renders perfectly and is simply always empty, which reads as "nothing is
// happening" rather than "this is broken".
let panelCount = 0;

for (const entry of await readdir(DASHBOARD_DIR)) {
  if (!entry.endsWith('.json')) {
    continue;
  }

  const file = path.join(DASHBOARD_DIR, entry);
  let dashboard;

  try {
    dashboard = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    failures.push(`${entry}: not valid JSON (${error.message}).`);
    continue;
  }

  for (const panel of dashboard.panels ?? []) {
    panelCount += 1;

    if (!panel.title) {
      failures.push(`${entry}: a panel has no title.`);
    }
    // A panel nobody can interpret is decoration. The description is where the
    // "what does a bad reading mean" lives.
    if (!panel.description) {
      failures.push(`${entry}: panel "${panel.title}" has no description.`);
    }

    for (const target of panel.targets ?? []) {
      for (const metric of referencedMetrics(String(target.expr ?? ''))) {
        if (!metrics.has(metric)) {
          failures.push(
            `${entry}: panel "${panel.title}" references a metric the service does not emit (${metric}).`,
          );
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Alert rules check failed:');
  for (const failure of [...new Set(failures)]) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Alert rules check passed: ${rules.length} alerts and ${panelCount} dashboard panels, ` +
    'each referencing only metrics the service emits.',
);
