import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webUrl = process.env.DEMO_WEB_URL ?? `http://127.0.0.1:${process.env.WEB_PORT ?? '3000'}/`;
const artifactDir = path.join(root, 'docs/demo-artifacts');
const videoDir = path.join(artifactDir, 'video-work');

mkdirSync(artifactDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
});

try {
  await captureDesktopArtifacts(browser);
  await captureMobileArtifact(browser);
  renameLatestVideo();
  console.log(`Demo artifacts written to ${artifactDir}`);
} finally {
  await browser.close();
}

// UI-8: each artifact shows what its name promises. The previous version took
// two full-page screenshots of the landing page (scrolling changes nothing in a
// full-page capture), so "executive" and "engineering" were byte-identical.
async function captureDesktopArtifacts(browserInstance) {
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 1100 },
    },
  });
  const page = await context.newPage();

  await page.goto(webUrl, { waitUntil: 'networkidle' });
  await waitForHomeReady(page);
  await page.screenshot({ path: path.join(artifactDir, 'landing-desktop.png') });

  // Executive: the answer - verdict, key figures and the sorted comparison.
  await runComparison(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifactDir, 'executive-overview-desktop.png') });

  // Engineering: cost controls and the expanded evidence behind the numbers.
  await page.getByText('Evidence and assumptions').click();
  await page.getByRole('tab', { name: 'Cost controls' }).click();
  await page.locator('.evidence-disclosure').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifactDir, 'engineering-evidence-desktop.png') });
  await context.close();
}

async function captureMobileArtifact(browserInstance) {
  const context = await browserInstance.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  await page.goto(webUrl, { waitUntil: 'networkidle' });
  await waitForHomeReady(page);
  await runComparison(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifactDir, 'mobile-workflow.png') });
  await context.close();
}

async function runComparison(page) {
  await page.getByRole('button', { name: /^compare costs$/i }).click();
  await page
    .getByRole('heading', { name: /is the lowest-cost option/ })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function waitForHomeReady(page) {
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^compare costs$/i }).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
}

function renameLatestVideo() {
  if (!existsSync(videoDir)) {
    return;
  }

  const videos = readdirSync(videoDir)
    .filter((fileName) => fileName.endsWith('.webm'))
    .map((fileName) => ({
      fileName,
      path: path.join(videoDir, fileName),
    }));

  const latestVideo = videos.at(-1);

  if (!latestVideo) {
    return;
  }

  renameSync(latestVideo.path, path.join(artifactDir, 'demo-walkthrough.webm'));
}
