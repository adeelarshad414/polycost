import { spawnSync } from 'node:child_process';
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

const browser = await chromium.launch({
  channel: browserChannel,
  headless: true,
});

try {
  const template = await verifyTemplateRecommendationJourney();
  const diagram = await verifyDiagramToPdfJourney();
  const redis = verifyRedisDown ? await verifyRedisDegradation() : undefined;

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
} finally {
  await browser.close();
}

async function verifyTemplateRecommendationJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const startedAt = Date.now();

  try {
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /web app tier/i }).click();
    await page.getByRole('button', { name: /compare costs/i }).click();
    await page.getByLabel('Provider cost summary').waitFor({
      state: 'visible',
      timeout: templateThresholdMs,
    });
    await page.getByText('Executive monthly baseline').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await expectNoHorizontalOverflow(page, 'template recommendation desktop');

    const durationMs = Date.now() - startedAt;
    assertWithin(durationMs, templateThresholdMs, 'template-to-recommendation journey');

    return { durationMs };
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

  try {
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /upload diagram/i }).click();
    await page
      .getByLabel(/upload architecture diagram/i)
      .setInputFiles(path.join(fixtureRoot, 'drawio/web-app.drawio'));
    await page.getByText('Loaded from web-app.drawio').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page
      .locator('.diagram-import-panel')
      .getByRole('button', { name: /^Parse diagram$/ })
      .click();
    await page.getByLabel('Diagram parse review').waitFor({
      state: 'visible',
      timeout: 45_000,
    });
    await page.getByText('Parser confidence').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /^Compare costs$/ }).click();
    await page.getByLabel('Provider cost summary').waitFor({
      state: 'visible',
      timeout: 45_000,
    });

    const quickActions = page.getByLabel('Comparison quick actions');
    await quickActions.waitFor({ state: 'visible', timeout: 15_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await quickActions.getByRole('button', { name: /^PDF$/ }).click();
    await page
      .locator('.status-message')
      .filter({ hasText: 'PDF report generated and downloaded.' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    if (!suggestedName.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Expected a PDF download, got ${suggestedName}`);
    }
    await expectNoHorizontalOverflow(page, 'diagram-to-PDF desktop');

    const durationMs = Date.now() - startedAt;
    assertWithin(durationMs, diagramThresholdMs, 'diagram-to-PDF journey');

    return { durationMs };
  } finally {
    await context.close();
  }
}

async function verifyRedisDegradation() {
  await expectJson(`${apiOrigin}/health`, 'initial health', (body) => body.status === 'ok');

  run('docker', ['compose', 'stop', 'redis']);

  try {
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

    return {
      healthStatus: health.status,
      deepHealthStatus: deepHealth.status,
      dataHealthStatus: dataHealth.status,
    };
  } finally {
    run('docker', ['compose', 'start', 'redis'], { allowFailure: true });
    await waitForJson(`${apiOrigin}/health`, 'restored health', (body) => body.status === 'ok');
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

function delay(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
