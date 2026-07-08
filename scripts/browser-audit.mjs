import { chromium } from 'playwright';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, 'apps/web');
const runDate = process.env.POLYCOST_BROWSER_AUDIT_DATE ?? new Date().toISOString().slice(0, 10);
const artifactRoot = path.join(root, 'docs/browser-audit');
const artifactDir = path.join(artifactRoot, runDate);
const port = Number(process.env.POLYCOST_BROWSER_AUDIT_PORT ?? 4176);
const baseUrl = `http://127.0.0.1:${port}`;
const comparisonId = '77777777-7777-4777-8777-000000000001';
const hoursPerMonth = 730;
const mobileReflowViewport = { width: 320, height: 360 * 2 };

mkdirSync(artifactDir, { recursive: true });

if (process.env.POLYCOST_BROWSER_AUDIT_SKIP_BUILD !== 'true') {
  await runCommand('npm', ['run', 'build', '--workspace', '@polycost/web'], root);
}

const server = await startPreviewServer();
const browser = await chromium.launch({ headless: true });

const audit = {
  generatedAt: new Date().toISOString(),
  runDate,
  baseUrl,
  status: 'passed',
  thresholds: {
    maxHorizontalOverflowPixels: 1,
    unnamedVisibleControls: 0,
    missingImageAltAttributes: 0,
    pageErrors: 0,
    consoleErrors: 0,
    keyboardFocusDeadEnds: 0,
  },
  toolCoverage: await resolveToolCoverage(),
  scenarios: [],
};

try {
  audit.scenarios.push(
    await runScenario(browser, {
      id: 'desktop',
      label: 'Desktop executive and engineering flow',
      viewport: { width: 1440, height: 1000 },
      screenshots: {
        executive: 'desktop-executive.png',
        engineering: 'desktop-engineering.png',
      },
    }),
  );
  audit.scenarios.push(
    await runScenario(browser, {
      id: 'reflow-320',
      label: 'WCAG 320px reflow',
      viewport: mobileReflowViewport,
      isMobile: true,
      screenshots: {
        executive: 'reflow-320-executive.png',
        engineering: 'reflow-320-engineering.png',
      },
    }),
  );
  audit.scenarios.push(
    await runScenario(browser, {
      id: 'zoom-200-equivalent',
      label: '200% zoom equivalent reflow',
      viewport: { width: 640, height: 900 },
      zoomEquivalentPercent: 200,
      screenshots: {
        executive: 'zoom-200-executive.png',
        engineering: 'zoom-200-engineering.png',
      },
    }),
  );

  const failures = audit.scenarios.flatMap((scenario) => scenario.failures);
  if (failures.length > 0) {
    audit.status = 'failed';
    audit.failures = failures;
  }

  writeAuditArtifacts(audit);

  if (audit.status === 'failed') {
    console.error(`Browser audit failed. See ${path.relative(root, artifactDir)}/README.md`);
    for (const failure of failures) {
      console.error(`- ${failure.scenario}: ${failure.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Browser audit passed. Artifacts written to ${path.relative(root, artifactDir)}`);
  }
} finally {
  await browser.close();
  await stopPreviewServer(server);
}

async function runCommand(command, args, cwd) {
  await execFileAsync(command, args, {
    cwd,
    env: {
      ...process.env,
      VITE_API_BASE_URL: '/api/v1',
    },
    maxBuffer: 1024 * 1024 * 12,
  });
}

async function startPreviewServer() {
  const viteBin = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  );
  const child = spawn(
    viteBin,
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        VITE_API_BASE_URL: '/api/v1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let startupOutput = '';
  child.stdout.on('data', (chunk) => {
    startupOutput += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    startupOutput += chunk.toString();
  });

  await waitForServer(baseUrl, 20_000, () => {
    if (child.exitCode !== null) {
      throw new Error(`Vite preview exited before becoming ready:\n${startupOutput}`);
    }
  });

  return child;
}

async function stopPreviewServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 2_000);
  });
}

async function waitForServer(url, timeoutMs, onAttempt) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      onAttempt?.();
      await request(url);
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`);
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
        resolve();
        return;
      }
      reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(5_000, () => {
      req.destroy(new Error('request timed out'));
    });
  });
}

async function runScenario(browserInstance, scenario) {
  const context = await browserInstance.newContext({
    viewport: scenario.viewport,
    isMobile: scenario.isMobile ?? false,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await installMockApi(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await waitForAppReady(page);
  const homeMetrics = await collectPageAudit(page, `${scenario.id}:home`);

  await page.getByRole('button', { name: /compare costs/i }).click();
  await page.getByLabel('Provider cost summary').waitFor({ state: 'visible', timeout: 30_000 });
  await page.screenshot({
    path: path.join(artifactDir, scenario.screenshots.executive),
    fullPage: true,
  });
  const executiveMetrics = await collectPageAudit(page, `${scenario.id}:executive`);

  const disclosure = page.getByRole('button', { name: /show full breakdown/i });
  await disclosure.waitFor({ state: 'visible' });
  await disclosure.scrollIntoViewIfNeeded();
  const openResult = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.result-disclosure-heading')];
    const target = buttons.find((button) => /show full breakdown/i.test(button.textContent ?? ''));
    if (!(target instanceof HTMLButtonElement)) {
      return {
        opened: false,
        buttonCount: buttons.length,
        buttonTexts: buttons.map((button) => button.textContent?.trim().slice(0, 120) ?? ''),
      };
    }

    target.scrollIntoView({ block: 'center' });
    for (const eventType of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(
        new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    }

    return {
      opened: true,
      buttonCount: buttons.length,
      buttonTexts: buttons.map((button) => button.textContent?.trim().slice(0, 120) ?? ''),
    };
  });
  if (!openResult.opened) {
    throw new Error(`Could not find result disclosure button: ${JSON.stringify(openResult)}`);
  }
  try {
    await page.waitForFunction(() => {
      const disclosureElement = document.querySelector('.result-disclosure');
      return (
        disclosureElement?.getAttribute('data-open') === 'true' &&
        disclosureElement.getAttribute('data-mounted') === 'true'
      );
    });
  } catch (error) {
    const disclosureDebug = await page.evaluate(() => {
      const disclosure = document.querySelector('.result-disclosure');
      return {
        url: window.location.href,
        open: disclosure?.getAttribute('data-open') ?? null,
        mounted: disclosure?.getAttribute('data-mounted') ?? null,
        pageText: document.body.textContent?.trim().replace(/\s+/g, ' ').slice(0, 500) ?? null,
      };
    });
    throw new Error(
      `Expanded disclosure did not open: ${JSON.stringify({ openResult, disclosureDebug })}`,
      {
        cause: error,
      },
    );
  }
  try {
    await page.waitForFunction(() => {
      const body = document.querySelector('.result-disclosure-body');
      return Boolean(body?.textContent && body.textContent.trim().length > 100);
    });
  } catch (error) {
    const disclosureDebug = await page.evaluate(() => {
      const disclosure = document.querySelector('.result-disclosure');
      const body = document.querySelector('.result-disclosure-body');
      return {
        url: window.location.href,
        open: disclosure?.getAttribute('data-open') ?? null,
        mounted: disclosure?.getAttribute('data-mounted') ?? null,
        bodyTextLength: body?.textContent?.trim().length ?? null,
        bodyText: body?.textContent?.trim().slice(0, 240) ?? null,
        pageText: document.body.textContent?.trim().replace(/\s+/g, ' ').slice(0, 500) ?? null,
      };
    });
    throw new Error(
      `Expanded disclosure body did not mount: ${JSON.stringify({
        disclosureDebug,
        pageErrors,
        consoleErrors,
      })}`,
      {
        cause: error,
      },
    );
  }
  await page.screenshot({
    path: path.join(artifactDir, scenario.screenshots.engineering),
    fullPage: true,
  });
  const engineeringMetrics = await collectPageAudit(page, `${scenario.id}:engineering`);
  const keyboardTrace = await collectKeyboardTrace(page);
  const performance = await collectPerformanceMetrics(page);

  await context.close();

  const failures = scenarioFailures({
    scenario,
    metrics: [homeMetrics, executiveMetrics, engineeringMetrics],
    keyboardTrace,
    consoleErrors,
    pageErrors,
  });

  return {
    id: scenario.id,
    label: scenario.label,
    viewport: scenario.viewport,
    zoomEquivalentPercent: scenario.zoomEquivalentPercent ?? null,
    screenshots: scenario.screenshots,
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
    consoleErrors,
    pageErrors,
    performance,
    audits: {
      home: homeMetrics,
      executive: executiveMetrics,
      engineering: engineeringMetrics,
      keyboardTrace,
    },
  };
}

async function installMockApi(page) {
  const comparison = browserComparison();

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/v1/regions') {
      await fulfillJson(route, regionCatalog());
      return;
    }
    if (pathname === '/api/v1/data-health') {
      await fulfillJson(route, dataHealth());
      return;
    }
    if (pathname === '/api/v1/exchange-rates') {
      await fulfillJson(route, {
        base: 'USD',
        lastUpdated: '2026-07-01T00:00:00.000Z',
        rates: {
          EUR: 0.92,
          GBP: 0.78,
          PKR: 278.5,
        },
      });
      return;
    }
    if (pathname === '/api/v1/pricing/aws/compute/models') {
      await fulfillJson(
        route,
        pricingModelsForService(url.searchParams.get('region') ?? 'us-east-1'),
      );
      return;
    }
    if (pathname === '/api/v1/workload/validate') {
      await fulfillJson(route, { valid: true });
      return;
    }
    if (pathname === '/api/v1/comparisons' && request.method() === 'POST') {
      await fulfillJson(route, comparison);
      return;
    }
    if (pathname === `/api/v1/comparisons/${comparison.comparisonId}/analytics`) {
      await fulfillJson(route, comparisonAnalytics(comparison));
      return;
    }
    if (pathname === `/api/v1/comparisons/${comparison.comparisonId}/evidence`) {
      await fulfillJson(route, comparisonPricingEvidence(comparison));
      return;
    }

    await fulfillJson(route, {});
  });
}

async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function waitForAppReady(page) {
  await page
    .getByRole('heading', { name: 'Multi-cloud cost clarity, in one place.' })
    .waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /compare costs/i }).waitFor({ state: 'visible' });
}

async function collectPageAudit(page, label) {
  return await page.evaluate((auditLabel) => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const viewportWidth = Math.max(root.clientWidth, window.innerWidth);
    const horizontalOverflowPixels = Math.max(0, scrollWidth - viewportWidth);
    const visibleElements = (selector) =>
      [...document.querySelectorAll(selector)].filter((element) => isVisible(element));

    const unnamedVisibleControls = visibleElements(
      [
        'button',
        'a[href]',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="tab"]',
        '[role="radio"]',
      ].join(','),
    )
      .filter((element) => !hasAccessibleName(element))
      .map(summaryForElement);

    const imagesMissingAlt = visibleElements('img')
      .filter((element) => !element.hasAttribute('alt'))
      .map(summaryForElement);

    const overflowElements = [...document.querySelectorAll('*')]
      .filter((element) => {
        if (!isVisible(element)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.right > viewportWidth + 1 || rect.left < -1;
      })
      .slice(0, 20)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: summaryForElement(element),
          left: round(rect.left),
          right: round(rect.right),
          width: round(rect.width),
        };
      });

    return {
      label: auditLabel,
      viewportWidth,
      scrollWidth,
      horizontalOverflowPixels,
      mainLandmarkCount: visibleElements('main, [role="main"]').length,
      h1Count: visibleElements('h1').length,
      unnamedVisibleControls,
      imagesMissingAlt,
      overflowElements,
      visibleButtonCount: visibleElements('button').length,
      visibleLinkCount: visibleElements('a[href]').length,
    };

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function hasAccessibleName(element) {
      const directName =
        element.getAttribute('aria-label') ?? element.getAttribute('title') ?? element.textContent;

      if (directName?.trim()) {
        return true;
      }

      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelText = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .join(' ')
          .trim();

        if (labelText) {
          return true;
        }
      }

      if (element instanceof HTMLInputElement && element.id) {
        return Boolean(document.querySelector(`label[for="${CSS.escape(element.id)}"]`));
      }

      const parentLabel = element.closest('label');
      if (parentLabel?.textContent?.trim()) {
        return true;
      }

      return false;
    }

    function summaryForElement(element) {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const role = element.getAttribute('role') ? `[role="${element.getAttribute('role')}"]` : '';
      const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
      return `${tag}${id}${role} ${label}`.replace(/\s+/g, ' ').slice(0, 180);
    }

    function round(value) {
      return Math.round(value * 100) / 100;
    }
  }, label);
}

async function collectKeyboardTrace(page) {
  await page.keyboard.press('Home');
  const visited = [];

  for (let index = 0; index < 18; index += 1) {
    await page.keyboard.press('Tab');
    visited.push(
      await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) {
          return {
            summary: 'outside-document',
            hasVisibleFocus: false,
            ignored: true,
          };
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const summary =
          `${element.tagName.toLowerCase()} ${element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''}`
            .replace(/\s+/g, ' ')
            .slice(0, 160);
        const hasVisibleFocus =
          (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== 'none';

        return {
          summary,
          hasVisibleFocus,
          ignored: false,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      }),
    );
  }

  return {
    visitedCount: visited.length,
    deadEnds: visited.filter((entry) => !entry.ignored && entry.summary === 'body'),
    focusWithoutVisibleIndicator: visited
      .filter((entry) => !entry.ignored && !entry.hasVisibleFocus)
      .slice(0, 10),
    visited,
  };
}

async function collectPerformanceMetrics(page) {
  return await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const totalTransferSize = resources.reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0);

    return {
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadEventMs: navigation ? Math.round(navigation.loadEventEnd) : null,
      resourceCount: resources.length,
      transferKb: Math.round(totalTransferSize / 1024),
    };
  });
}

function scenarioFailures({ scenario, metrics, keyboardTrace, consoleErrors, pageErrors }) {
  const failures = [];

  for (const metric of metrics) {
    if (metric.horizontalOverflowPixels > audit.thresholds.maxHorizontalOverflowPixels) {
      failures.push({
        scenario: scenario.id,
        message: `${metric.label} has ${metric.horizontalOverflowPixels}px horizontal overflow`,
        details: metric.overflowElements,
      });
    }
    if (metric.unnamedVisibleControls.length > audit.thresholds.unnamedVisibleControls) {
      failures.push({
        scenario: scenario.id,
        message: `${metric.label} has unnamed visible controls`,
        details: metric.unnamedVisibleControls,
      });
    }
    if (metric.imagesMissingAlt.length > audit.thresholds.missingImageAltAttributes) {
      failures.push({
        scenario: scenario.id,
        message: `${metric.label} has images without alt attributes`,
        details: metric.imagesMissingAlt,
      });
    }
    if (metric.mainLandmarkCount < 1) {
      failures.push({
        scenario: scenario.id,
        message: `${metric.label} has no visible main landmark`,
      });
    }
    if (metric.h1Count < 1) {
      failures.push({
        scenario: scenario.id,
        message: `${metric.label} has no visible h1`,
      });
    }
  }

  if (keyboardTrace.deadEnds.length > audit.thresholds.keyboardFocusDeadEnds) {
    failures.push({
      scenario: scenario.id,
      message: 'Keyboard trace encountered focus dead ends',
      details: keyboardTrace.deadEnds,
    });
  }
  if (keyboardTrace.focusWithoutVisibleIndicator.length > 0) {
    failures.push({
      scenario: scenario.id,
      message: 'Keyboard trace found focus stops without visible indicators',
      details: keyboardTrace.focusWithoutVisibleIndicator,
    });
  }
  if (consoleErrors.length > audit.thresholds.consoleErrors) {
    failures.push({
      scenario: scenario.id,
      message: 'Console errors were emitted',
      details: consoleErrors,
    });
  }
  if (pageErrors.length > audit.thresholds.pageErrors) {
    failures.push({
      scenario: scenario.id,
      message: 'Page errors were emitted',
      details: pageErrors,
    });
  }

  return failures;
}

async function resolveToolCoverage() {
  return {
    lighthouse: {
      status: optionalResolve('lighthouse') ? 'available-not-run' : 'dependency-unavailable',
      note: optionalResolve('lighthouse')
        ? 'The lighthouse package is installed, but this script currently records Playwright-native metrics only.'
        : 'The lighthouse package is not installed; Playwright-native navigation and resource metrics were captured instead.',
    },
    axe: {
      status: optionalResolve('axe-core') ? 'available' : 'dependency-unavailable',
      note: optionalResolve('axe-core')
        ? 'The axe-core package is installed; add injection here before treating this as a formal axe result.'
        : 'The axe-core package is not installed; Playwright-native accessibility heuristics were captured instead.',
    },
  };
}

function optionalResolve(packageName) {
  try {
    return import.meta.resolve(packageName);
  } catch {
    return null;
  }
}

function writeAuditArtifacts(auditResult) {
  const jsonPath = path.join(artifactDir, 'browser-audit.json');
  const reportPath = path.join(artifactDir, 'README.md');
  const indexPath = path.join(artifactRoot, 'README.md');

  writeFileSync(jsonPath, `${JSON.stringify(auditResult, null, 2)}\n`);
  writeFileSync(reportPath, renderReport(auditResult));
  writeFileSync(indexPath, renderIndex(auditResult));
}

function renderReport(auditResult) {
  const scenarioList = auditResult.scenarios
    .map(
      (scenario) => `- ${scenario.label}: ${scenario.status}
  - Viewport: ${scenario.viewport.width}x${scenario.viewport.height}
  - Zoom equivalent: ${scenario.zoomEquivalentPercent ?? 'native'}
  - Screenshots: ${Object.values(scenario.screenshots)
    .map((fileName) => `\`${fileName}\``)
    .join(', ')}`,
    )
    .join('\n');
  const failureList =
    auditResult.failures
      ?.map((failure) => `- ${failure.scenario}: ${failure.message}`)
      .join('\n') ?? '- None';

  return `# Browser Audit - ${auditResult.runDate}

Status: ${auditResult.status}

## Scope

This artifact captures fresh Playwright browser evidence for the production web build:
desktop executive/engineering views, 320px reflow, and 200% zoom-equivalent reflow.

## Tool Coverage

- Lighthouse: ${auditResult.toolCoverage.lighthouse.status}
  - ${auditResult.toolCoverage.lighthouse.note}
- axe: ${auditResult.toolCoverage.axe.status}
  - ${auditResult.toolCoverage.axe.note}

## Scenarios

${scenarioList}

## Checks

- Horizontal overflow must stay at or below ${auditResult.thresholds.maxHorizontalOverflowPixels}px.
- Visible interactive controls must have accessible names.
- Visible images must include an \`alt\` attribute.
- A visible main landmark and h1 must exist.
- Keyboard tab traversal must avoid dead ends and visible focus loss.
- Browser console and page errors must remain clean.

## Failures

${failureList}

## Machine Evidence

See \`browser-audit.json\`.
`;
}

function renderIndex(auditResult) {
  return `# Browser Audit Artifacts

Latest run: \`${auditResult.runDate}\`

Run the audit with:

\`\`\`bash
npm run browser:audit
\`\`\`

The latest report is in \`${auditResult.runDate}/README.md\`.
`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataHealth() {
  return {
    generatedAt: '2026-07-01T00:00:00.000Z',
    freshnessPolicyHours: 24,
    overallStatus: 'fresh',
    alertCount: 0,
    alerts: [],
    providers: ['aws', 'azure', 'gcp'].map((providerId) => ({
      providerId,
      status: 'success',
      freshness: 'fresh',
      lastSuccessfulRun: '2026-07-01T00:00:00.000Z',
      ageHours: 1,
      recordsUpdated: 20,
      recordsRejected: 0,
      recordsSkipped: 0,
      cache: {
        catalogRows: 20,
        currentRateRows: 20,
        latestCatalogSyncAt: '2026-07-01T00:00:00.000Z',
        latestRateSyncAt: '2026-07-01T00:00:00.000Z',
        ageHours: 1,
        freshness: 'fresh',
        syncStatusCounts: {
          success: 20,
          partial: 0,
          failed: 0,
        },
      },
      message: 'Fresh mock browser audit data.',
    })),
  };
}

function comparisonAnalytics(comparison) {
  return {
    comparisonId: comparison.comparisonId,
    generatedAt: '2026-07-01T00:00:00.000Z',
    pricingAsOf: comparison.pricingAsOf,
    executiveForecast: {
      horizonDays: 90,
      assumption: 'Browser audit forecast fixture.',
      providerForecasts: comparison.providers.map((provider) => ({
        providerId: provider.providerId,
        monthlyRunRateUsd: provider.totals.monthly,
        ninetyDayRunRateUsd: round(provider.totals.monthly * 3),
        annualizedRunRateUsd: provider.totals.yearly,
      })),
    },
    costCoverageMap: [],
    costComposition: [],
    providerDeltaAnalysis: [],
    regionVarianceHeatMap: [],
    egressNetworkingDetails: [],
    sensitivityScenarios: [],
    commitmentRoiTimelines: [],
    commitmentCoverage: [],
    tcoSignals: [],
    optimizationOpportunities: [],
    finOpsFindings: [],
  };
}

function comparisonPricingEvidence(comparison) {
  return {
    comparisonId: comparison.comparisonId,
    pricingAsOf: comparison.pricingAsOf,
    generatedAt: '2026-07-01T00:00:00.000Z',
    providerCount: comparison.providers.length,
    lineItemCount: comparison.providers.reduce(
      (count, provider) => count + provider.lineItems.length,
      0,
    ),
    evidence: [],
  };
}

function browserComparison() {
  return {
    comparisonId,
    pricingAsOf: '2026-07-01T00:00:00.000Z',
    cheapestProviderId: 'gcp',
    requirements: {
      sourceType: 'structured_form',
      workloadName: 'Customer portal',
      workloadType: 'web_app',
      regionPreference: 'us-east',
      serviceRequirements: [
        {
          serviceCategory: 'compute',
          serviceType: 'vm-compute',
          tier: 'balanced',
          region: 'us-east',
          az: '2 zones',
          quantity: 2,
        },
      ],
    },
    providers: [
      provider('aws', 124.5, [
        lineItem('compute', 'Amazon EC2 equivalent web tier', 84.5, 'us-east-1'),
        lineItem('storage', 'Amazon S3 object storage', 40, 'us-east-1'),
      ]),
      provider('azure', 138.25, [
        lineItem('compute', 'Azure Virtual Machines web tier', 92.25, 'eastus', true),
        lineItem('database', 'Azure Database for PostgreSQL', 46, 'eastus', true),
      ]),
      provider('gcp', 110.75, [
        lineItem('compute', 'Google Compute Engine web tier', 72.75, 'us-east1'),
        lineItem('storage', 'Cloud Storage object storage', 38, 'us-east1'),
      ]),
    ],
  };
}

function provider(providerId, monthly, lineItems) {
  const hourly = round(monthly / hoursPerMonth);

  return {
    providerId,
    lineItems,
    totals: {
      hourly,
      daily: round(hourly * 24),
      weekly: round(hourly * 168),
      monthly,
      quarterly: round(monthly * 3),
      yearly: round(monthly * 12),
    },
    pricingModels: [
      {
        model: 'on-demand',
        available: true,
        monthlyCostUsd: monthly,
        hourlyCostUsd: hourly,
      },
      {
        model: 'reserved-3yr',
        available: true,
        monthlyCostUsd: round(monthly * 0.68),
        hourlyCostUsd: round((monthly * 0.68) / hoursPerMonth),
        caveat: 'Modeled three-year commitment.',
      },
    ],
    breakdown: {
      computeMonthlyCostUsd: round(
        lineItems
          .filter((item) => item.category === 'compute')
          .reduce((sum, item) => sum + item.baseMonthlyCostUsd, 0),
      ),
      storageMonthlyCostUsd: round(
        lineItems
          .filter((item) => item.category === 'storage')
          .reduce((sum, item) => sum + item.baseMonthlyCostUsd, 0),
      ),
      databaseMonthlyCostUsd: round(
        lineItems
          .filter((item) => item.category === 'database')
          .reduce((sum, item) => sum + item.baseMonthlyCostUsd, 0),
      ),
      egressMonthlyCostUsd: 0,
      scopedMonthlyCostUsd: monthly,
    },
  };
}

function lineItem(category, description, monthly, region, isApproximate = false) {
  return {
    category,
    description,
    isApproximate,
    baseHourlyCostUsd: round(monthly / hoursPerMonth),
    baseMonthlyCostUsd: monthly,
    region,
    unit: 'hour',
    unitPriceUsd: round(monthly / hoursPerMonth),
  };
}

function regionCatalog() {
  return {
    generatedAt: '2026-07-01T00:00:00.000Z',
    providers: [
      {
        providerId: 'aws',
        calculatorUrl: 'https://calculator.aws/#/',
        regionsUrl: 'https://aws.amazon.com/about-aws/global-infrastructure/regions_az/',
        regions: [{ id: 'us-east-1', label: 'US East (N. Virginia)', geography: 'North America' }],
      },
      {
        providerId: 'azure',
        calculatorUrl: 'https://azure.microsoft.com/en-us/pricing/calculator/',
        regionsUrl: 'https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/',
        regions: [{ id: 'eastus', label: 'East US', geography: 'North America' }],
      },
      {
        providerId: 'gcp',
        calculatorUrl: 'https://cloud.google.com/products/calculator',
        regionsUrl: 'https://cloud.google.com/compute/docs/regions-zones',
        regions: [{ id: 'us-east1', label: 'South Carolina', geography: 'North America' }],
      },
    ],
  };
}

function pricingModelsForService(region) {
  return {
    schemaVersion: 2,
    provider: 'aws',
    service: 'compute',
    region,
    generatedAt: '2026-07-01T00:00:00.000Z',
    models: [
      {
        code: 'on-demand',
        label: 'On-demand',
        requiresPaymentOption: false,
        isEstimateOnly: false,
        paymentOptions: [],
      },
      {
        code: 'reserved-1yr',
        label: '1yr reserved',
        termMonths: 12,
        requiresPaymentOption: true,
        isEstimateOnly: false,
        paymentOptions: [
          { code: 'no_upfront', label: 'No upfront' },
          { code: 'partial_upfront', label: 'Partial upfront' },
          { code: 'all_upfront', label: 'All upfront' },
        ],
        defaultPaymentOption: 'no_upfront',
      },
      {
        code: 'reserved-3yr',
        label: '3yr reserved',
        termMonths: 36,
        requiresPaymentOption: true,
        isEstimateOnly: false,
        paymentOptions: [
          { code: 'no_upfront', label: 'No upfront' },
          { code: 'partial_upfront', label: 'Partial upfront' },
          { code: 'all_upfront', label: 'All upfront' },
        ],
        defaultPaymentOption: 'no_upfront',
      },
      {
        code: 'spot',
        label: 'Spot',
        requiresPaymentOption: false,
        isEstimateOnly: true,
        paymentOptions: [],
      },
    ],
  };
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
