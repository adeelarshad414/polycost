import { defineConfig } from '@playwright/test';

const isCi = process.env.CI === 'true';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  use: {
    baseURL: process.env.POLYCOST_WEB_BASE_URL ?? 'http://localhost:3000',
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: '../../test-results/web-playwright',
});
