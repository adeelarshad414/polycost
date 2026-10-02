import { defineConfig } from '@playwright/test';

const isCi = process.env.CI === 'true';

/*
  Visual regression (UI-7). Screenshot tests are tagged @visual and only run with
  POLYCOST_VISUAL=1, inside the official Playwright image
  (mcr.microsoft.com/playwright:v1.63.0-noble) both locally and in CI, so fonts
  and rasterisation match the committed baselines pixel for pixel. They run
  against a static `vite preview` of the build with every API call mocked.
*/
const isVisual = process.env.POLYCOST_VISUAL === '1';
const visualPort = 4173;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  grep: isVisual ? /@visual/ : undefined,
  grepInvert: isVisual ? undefined : /@visual/,
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 12_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    },
  },
  // One platform-free baseline per view: the container is the only renderer.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL: isVisual
      ? `http://127.0.0.1:${visualPort}`
      : (process.env.POLYCOST_WEB_BASE_URL ?? 'http://localhost:3000'),
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? (isVisual ? 'chromium' : 'chrome'),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: isVisual
    ? {
        command: `npx vite preview --host 127.0.0.1 --port ${visualPort} --strictPort`,
        url: `http://127.0.0.1:${visualPort}`,
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
  outputDir: '../../test-results/web-playwright',
});
