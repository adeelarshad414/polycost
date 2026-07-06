import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, Page, test } from '@playwright/test';
import type {
  ComparisonResult,
  ProviderId,
  RegionCatalogResponse,
  ReportExportJobResponse,
  ReportFormat,
} from '../src/types';

const HOURS_PER_MONTH = 730;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, '../../../fixtures/diagrams');
const E2E_COMPARISON_ID = '77777777-7777-4777-8777-000000000001';

test('persists light and dark theme choices across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'system');

  await page.getByRole('radio', { name: /use light theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'light');
  await expect(page.getByRole('radio', { name: /use dark theme/i })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'light');

  await page.getByRole('radio', { name: /use dark theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: /use dark theme/i })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('compares the default workload on mobile without page-level horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('tab', { name: /guided form/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /compare costs/i }).click();
  await expect(page.getByLabel('Provider cost summary')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Executive monthly baseline')).toBeVisible();
  await expect(page.getByText('Service driver split')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const disclosure = page.getByRole('button', { name: /show full breakdown/i });
  await expect(disclosure).toBeVisible();
  await disclosure.click();
  await expect(page.getByRole('button', { name: /hide full breakdown/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByLabel('Engineering cost controls')).toBeVisible();
  await expect(page.getByText('Service driver split')).toBeVisible();
  await expect(page.getByLabel('Architecture and engineering evidence')).toBeVisible();
  await expect(page.getByLabel('Official cloud pricing and region references')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('surfaces provider pricing warnings in the engineering evidence view', async ({ page }) => {
  await mockRegionCatalog(page);
  await mockComparisonCreation(
    page,
    browserComparison({
      warnings: [
        {
          providerId: 'azure',
          code: 'provider_pricing_failed',
          message: 'Azure pricing unavailable; using cached comparison evidence.',
        },
      ],
    }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /compare costs/i }).click();
  await expect(page.getByLabel('Provider cost summary')).toBeVisible();

  await page.getByRole('button', { name: /show full breakdown/i }).click();
  const pricingWarning = page.getByRole('alert').filter({ hasText: 'Pricing warnings:' });

  await expect(pricingWarning).toBeVisible();
  await expect(pricingWarning).toContainText(
    'Azure pricing unavailable; using cached comparison evidence.',
  );
});

test('uploads a draw.io diagram, reviews extracted services, and runs a live comparison', async ({
  page,
}) => {
  let submittedSourceType: string | undefined;
  let submittedServiceCount = 0;

  await page.route('**/api/v1/comparisons', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as {
        nws?: {
          metadata?: {
            sourceType?: string;
          };
          serviceRequirements?: unknown[];
        };
      };

      submittedSourceType = payload.nws?.metadata?.sourceType;
      submittedServiceCount = payload.nws?.serviceRequirements?.length ?? 0;
    }

    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('tab', { name: /upload diagram/i }).click();
  await page
    .getByLabel(/upload architecture diagram/i)
    .setInputFiles(resolve(FIXTURE_ROOT, 'drawio/web-app.drawio'));
  await expect(page.locator('.requirements-file-status')).toContainText(
    'Loaded from web-app.drawio',
  );

  await page
    .locator('.diagram-import-panel')
    .getByRole('button', { name: /^Parse diagram$/ })
    .click();
  await expect(page.getByLabel('Diagram parse review')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Parser confidence')).toBeVisible();
  await expect(page.getByText(/services/i).first()).toBeVisible();

  await page.getByRole('button', { name: /^Compare costs$/ }).click();
  await expect(page.getByLabel('Provider cost summary')).toBeVisible({ timeout: 30_000 });
  expect(submittedSourceType).toBe('drawio_diagram');
  expect(submittedServiceCount).toBeGreaterThan(0);
});

test('requests PDF, CSV, and Excel exports with the selected scenario context', async ({
  page,
}) => {
  const exportRequests: Array<{
    format: ReportFormat;
    interval: string | null;
    pricingModel: string | null;
  }> = [];

  await mockRegionCatalog(page);
  await mockComparisonCreation(page, browserComparison());
  await page.route(`**/api/v1/comparisons/${E2E_COMPARISON_ID}/export-jobs`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const payload = JSON.parse(route.request().postData() ?? '{}') as {
      format?: ReportFormat;
      interval?: string;
      pricingModel?: string;
    };
    const format = payload.format;

    if (!format) {
      await route.fulfill({ status: 400, body: 'missing format' });
      return;
    }

    exportRequests.push({
      format,
      interval: payload.interval ?? null,
      pricingModel: payload.pricingModel ?? null,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(exportJob(format, 'completed')),
    });
  });
  await page.route(
    `**/api/v1/comparisons/${E2E_COMPARISON_ID}/export-jobs/job-*/download`,
    async (route) => {
      const url = new URL(route.request().url());
      const jobId = url.pathname.split('/').at(-2) ?? '';
      const format = jobId.replace(/^job-/, '') as ReportFormat;

      await route.fulfill({
        status: 200,
        contentType: exportContentType(format),
        body: exportBody(format),
      });
    },
  );
  await page.route(
    `**/api/v1/comparisons/${E2E_COMPARISON_ID}/export-jobs/job-*`,
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/download')) {
        await route.fallback();
        return;
      }

      const jobId = url.pathname.split('/').at(-1) ?? '';
      const format = jobId.replace(/^job-/, '') as ReportFormat;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(exportJob(format, 'completed')),
      });
    },
  );

  await page.goto('/');
  await page.getByRole('button', { name: /reserved 3yr/i }).click();
  await page.getByRole('button', { name: /compare costs/i }).click();
  await expect(page.getByLabel('Comparison quick actions')).toBeVisible();

  const quickActions = page.getByLabel('Comparison quick actions');
  for (const [buttonName, notice] of [
    [/^PDF$/, 'PDF report generated and downloaded.'],
    [/^CSV$/, 'CSV report generated and downloaded.'],
    [/^Excel$/, 'XLSX report generated and downloaded.'],
  ] as const) {
    await quickActions.getByRole('button', { name: buttonName }).click();
    await expect(page.locator('.status-message').filter({ hasText: notice })).toBeVisible();
  }

  expect(exportRequests.map((request) => request.format)).toEqual(['pdf', 'csv', 'xlsx']);
  for (const request of exportRequests) {
    expect(request.interval).toBe('monthly');
    expect(request.pricingModel).toBe('reserved-3yr');
  }
});

test('supports keyboard-only comparison, disclosure, and interval controls', async ({ page }) => {
  await mockRegionCatalog(page);
  await mockComparisonCreation(page, browserComparison());

  await page.goto('/');

  const compareButton = page.getByRole('button', { name: /compare costs/i });
  await compareButton.focus();
  await expect(compareButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Provider cost summary')).toBeVisible();

  const disclosure = page.getByRole('button', { name: /show full breakdown/i });
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /hide full breakdown/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  const yearly = page.getByRole('button', { name: /^Yearly$/ });
  await yearly.focus();
  await expect(yearly).toBeFocused();
  await page.keyboard.press('Space');
  await expect(yearly).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Yearly estimate').first()).toBeVisible();
});

async function mockRegionCatalog(page: Page): Promise<void> {
  await page.route('**/api/v1/regions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(regionCatalog()),
    });
  });
}

async function mockComparisonCreation(page: Page, comparison: ComparisonResult): Promise<void> {
  await page.route('**/api/v1/workload/validate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true }),
    });
  });
  await page.route('**/api/v1/comparisons', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(comparison),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflowPixels = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const viewportWidth = Math.max(root.clientWidth, window.innerWidth);

    return scrollWidth - viewportWidth;
  });

  expect(overflowPixels).toBeLessThanOrEqual(1);
}

function browserComparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    comparisonId: E2E_COMPARISON_ID,
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
    ...overrides,
  };
}

function provider(
  providerId: ProviderId,
  monthly: number,
  lineItems: ComparisonResult['providers'][number]['lineItems'],
): ComparisonResult['providers'][number] {
  const hourly = round(monthly / HOURS_PER_MONTH);

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
        hourlyCostUsd: round((monthly * 0.68) / HOURS_PER_MONTH),
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
      egressMonthlyCostUsd: round(
        lineItems
          .filter((item) => item.category === 'network')
          .reduce((sum, item) => sum + item.baseMonthlyCostUsd, 0),
      ),
      scopedMonthlyCostUsd: monthly,
    },
  };
}

function lineItem(
  category: ComparisonResult['providers'][number]['lineItems'][number]['category'],
  description: string,
  monthly: number,
  region: string,
  isApproximate = false,
): ComparisonResult['providers'][number]['lineItems'][number] {
  return {
    category,
    description,
    isApproximate,
    baseHourlyCostUsd: round(monthly / HOURS_PER_MONTH),
    baseMonthlyCostUsd: monthly,
    region,
    unit: 'hour',
    unitPriceUsd: round(monthly / HOURS_PER_MONTH),
  };
}

function regionCatalog(): RegionCatalogResponse {
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

function exportJob(
  format: ReportFormat,
  status: ReportExportJobResponse['status'],
): ReportExportJobResponse {
  const jobId = `job-${format}`;
  const statusUrl = `/api/v1/comparisons/${E2E_COMPARISON_ID}/export-jobs/${jobId}`;

  return {
    jobId,
    comparisonId: E2E_COMPARISON_ID,
    format,
    interval: 'monthly',
    pricingModel: 'reserved-3yr',
    status,
    fileName: `polycost-e2e-browser.${format}`,
    contentType: exportContentType(format),
    createdAt: '2026-07-01T00:00:00.000Z',
    ...(status === 'completed' ? { completedAt: '2026-07-01T00:00:01.000Z' } : {}),
    statusUrl,
    ...(status === 'completed' ? { downloadUrl: `${statusUrl}/download` } : {}),
  };
}

function exportContentType(format: ReportFormat): string {
  if (format === 'pdf') {
    return 'application/pdf';
  }

  if (format === 'csv') {
    return 'text/csv';
  }

  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function exportBody(format: ReportFormat): string {
  if (format === 'pdf') {
    return '%PDF-1.4 e2e';
  }

  if (format === 'csv') {
    return `Comparison ID,${E2E_COMPARISON_ID}\n`;
  }

  return 'PK e2e';
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
