import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import path from 'node:path';

const root = process.cwd();
const apiOrigin =
  process.env.POLYCOST_API_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? '3001'}`;
const webOrigin =
  process.env.POLYCOST_WEB_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? '3000'}`;
const fixtureRoot = path.join(root, 'fixtures/diagrams');
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome';
const templateThresholdMs = Number(process.env.POLYCOST_TEMPLATE_JOURNEY_MAX_MS ?? 60_000);
const diagramThresholdMs = Number(process.env.POLYCOST_DIAGRAM_JOURNEY_MAX_MS ?? 180_000);
const verifyRedisDown = process.env.POLYCOST_VERIFY_REDIS_DOWN !== '0';
const transcriptPath =
  process.env.POLYCOST_LIVE_VERIFY_TRANSCRIPT_PATH ??
  path.join(root, '.tmp/live-verification/latest.json');

const transcript = {
  schemaVersion: '1.0',
  startedAt: new Date().toISOString(),
  status: 'running',
  apiOrigin,
  webOrigin,
  browserChannel,
  thresholdsMs: {
    templateToRecommendation: templateThresholdMs,
    diagramToPdf: diagramThresholdMs,
  },
  verifyRedisDown,
  journeys: [],
  events: [],
};

let browser;

try {
  browser = await chromium.launch({
    channel: browserChannel,
    headless: true,
  });

  const template = await verifyTemplateRecommendationJourney();
  transcript.journeys.push(template);
  const diagram = await verifyDiagramToPdfJourney();
  transcript.journeys.push(diagram);
  const redis = verifyRedisDown ? await verifyRedisDegradation() : undefined;

  transcript.status = 'passed';
  transcript.completedAt = new Date().toISOString();
  if (redis) {
    transcript.redisDegradation = redis;
  }

  console.log('Live verification passed.');
  console.log(
    `- Template to recommendation: ${template.durationMs}ms (limit ${templateThresholdMs}ms)`,
  );
  console.log(`- Diagram to PDF: ${diagram.durationMs}ms (limit ${diagramThresholdMs}ms)`);
  if (redis) {
    console.log(
      `- Redis-down degradation: /health=${redis.healthStatus}, /health/deep=${redis.deepHealthStatus}, data-health HTTP ${redis.dataHealthStatus}`,
    );
  }
} catch (error) {
  transcript.status = 'failed';
  transcript.completedAt = new Date().toISOString();
  transcript.error =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: 'UnknownError', message: String(error) };
  throw error;
} finally {
  if (browser) {
    await browser.close();
  }
  await writeTranscript();
}

async function verifyTemplateRecommendationJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const startedAt = Date.now();
  const steps = [];
  const markStep = (label) => {
    steps.push({ label, atMs: Date.now() - startedAt });
  };

  try {
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
    markStep('opened home page');
    await page.getByRole('button', { name: /web app tier/i }).click();
    markStep('selected web app tier template');
    await page.getByRole('button', { name: /compare costs/i }).click();
    markStep('submitted comparison');
    await page.getByLabel('Provider cost summary').waitFor({
      state: 'visible',
      timeout: templateThresholdMs,
    });
    markStep('provider cost summary visible');
    await page.getByText('Executive monthly baseline').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('executive recommendation visible');
    await expectNoHorizontalOverflow(page, 'template recommendation desktop');
    markStep('desktop overflow check passed');

    const durationMs = Date.now() - startedAt;
    assertWithin(durationMs, templateThresholdMs, 'template-to-recommendation journey');

    return {
      name: 'template-to-recommendation',
      status: 'passed',
      durationMs,
      thresholdMs: templateThresholdMs,
      steps,
    };
  } finally {
    await context.close();
  }
}

async function verifyDiagramToPdfJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const startedAt = Date.now();
  const steps = [];
  const markStep = (label) => {
    steps.push({ label, atMs: Date.now() - startedAt });
  };

  try {
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
    markStep('opened home page');
    await page.getByRole('tab', { name: /upload diagram/i }).click();
    markStep('opened diagram upload tab');
    await page
      .getByLabel(/upload architecture diagram/i)
      .setInputFiles(path.join(fixtureRoot, 'drawio/web-app.drawio'));
    await page.getByText('Loaded from web-app.drawio').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('uploaded draw.io fixture');
    await page
      .locator('.diagram-import-panel')
      .getByRole('button', { name: /^Parse diagram$/ })
      .click();
    markStep('submitted diagram parse');
    await page.getByLabel('Diagram parse review').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    await page.getByText('Parser confidence').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    markStep('diagram review visible');
    await page.getByRole('button', { name: /^Compare costs$/ }).click();
    markStep('submitted comparison from diagram review');
    await page.getByLabel('Provider cost summary').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    markStep('provider cost summary visible');

    const quickActions = page.getByLabel('Comparison quick actions');
    await quickActions.waitFor({ state: 'visible', timeout: 15_000 });
    markStep('comparison quick actions visible');

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await quickActions.getByRole('button', { name: /^PDF$/ }).click();
    markStep('requested PDF export');
    await page
      .locator('.status-message')
      .filter({ hasText: 'PDF report generated and downloaded.' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    if (!suggestedName.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Expected a PDF download, got ${suggestedName}`);
    }
    markStep(`PDF downloaded: ${suggestedName}`);
    await expectNoHorizontalOverflow(page, 'diagram-to-PDF desktop');
    markStep('desktop overflow check passed');

    const durationMs = Date.now() - startedAt;
    assertWithin(durationMs, diagramThresholdMs, 'diagram-to-PDF journey');

    return {
      name: 'diagram-to-PDF',
      status: 'passed',
      durationMs,
      thresholdMs: diagramThresholdMs,
      steps,
      download: {
        suggestedFilename: suggestedName,
      },
    };
  } finally {
    await context.close();
  }
}

async function verifyRedisDegradation() {
  const startedAt = Date.now();
  recordEvent('redis-degradation', 'initial health check');
  await expectJson(`${apiOrigin}/health`, 'initial health', (body) => body.status === 'ok');

  recordEvent('redis-degradation', 'stopping redis');
  run('docker', ['compose', 'stop', 'redis']);

  try {
    recordEvent('redis-degradation', 'waiting for degraded health');
    const health = await waitForJson(`${apiOrigin}/health`, 'degraded health', (body) => {
      return body.status === 'degraded' && body.dependencies?.cache?.status === 'degraded';
    });
    const deepHealth = await waitForJson(
      `${apiOrigin}/health/deep`,
      'degraded deep health',
      (body) => {
        return (
          ['degraded', 'critical'].includes(body.status) &&
          body.dependencies?.cache?.status === 'degraded'
        );
      },
    );
    const dataHealth = await fetch(`${apiOrigin}/api/v1/data-health`);
    if (!dataHealth.ok) {
      throw new Error(`data-health returned HTTP ${dataHealth.status} while Redis was stopped`);
    }
    await dataHealth.json();
    recordEvent('redis-degradation', 'data-health remained available');

    return {
      status: 'passed',
      durationMs: Date.now() - startedAt,
      healthStatus: health.status,
      deepHealthStatus: deepHealth.status,
      dataHealthStatus: dataHealth.status,
    };
  } finally {
    recordEvent('redis-degradation', 'restarting redis');
    run('docker', ['compose', 'start', 'redis'], { allowFailure: true });
    await waitForJson(`${apiOrigin}/health`, 'restored health', (body) => body.status === 'ok');
    recordEvent('redis-degradation', 'redis restored');
  }
}

async function expectJson(url, label, predicate) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (!predicate(body)) {
    throw new Error(`${label} returned unexpected payload: ${JSON.stringify(body)}`);
  }

  return body;
}

async function waitForJson(url, label, predicate) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await expectJson(url, label, predicate);
    } catch (error) {
      lastError = error;
    }

    await delay(1_000);
  }

  throw lastError ?? new Error(`${label} was not ready`);
}

async function expectNoHorizontalOverflow(page, label) {
  const overflowPixels = await page.evaluate(() => {
    const rootElement = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(rootElement.scrollWidth, body.scrollWidth);
    const viewportWidth = Math.max(rootElement.clientWidth, window.innerWidth);

    return scrollWidth - viewportWidth;
  });

  if (overflowPixels > 1) {
    throw new Error(`${label} has ${overflowPixels}px horizontal overflow`);
  }
}

function assertWithin(durationMs, thresholdMs, label) {
  if (durationMs > thresholdMs) {
    throw new Error(`${label} took ${durationMs}ms, exceeding ${thresholdMs}ms`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    if (options.allowFailure) {
      console.warn(`${command} ${args.join(' ')} failed: ${result.error.message}`);
      return result;
    }

    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }

  return result;
}

function recordEvent(scope, message, details = {}) {
  transcript.events.push({
    scope,
    message,
    at: new Date().toISOString(),
    ...details,
  });
}

async function writeTranscript() {
  transcript.completedAt ??= new Date().toISOString();
  await mkdir(path.dirname(transcriptPath), { recursive: true });
  await writeFile(`${transcriptPath}.tmp`, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
  await writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
  console.log(`Live verification transcript written to ${transcriptPath}`);
}

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
