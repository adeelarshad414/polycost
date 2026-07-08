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

const browser = await chromium.launch({ headless: true });

try {
  await captureDesktopArtifacts(browser);
  await captureMobileArtifact(browser);
  renameLatestVideo();
  console.log(`Demo artifacts written to ${artifactDir}`);
} finally {
  await browser.close();
}

async function captureDesktopArtifacts(browserInstance) {
  const context = await browserInstance.newContext({
    viewport: { width: 1440, height: 1100 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 1100 },
    },
  });
  const page = await context.newPage();

  await page.goto(webUrl, { waitUntil: 'networkidle' });
  await waitForHomeReady(page);
  await page.screenshot({
    path: path.join(artifactDir, 'executive-overview-desktop.png'),
    fullPage: true,
  });
  await page.mouse.wheel(0, 900);
  await page.waitForFunction(() => window.scrollY > 0);
  await page.screenshot({
    path: path.join(artifactDir, 'engineering-evidence-desktop.png'),
    fullPage: true,
  });
  await page.mouse.wheel(0, -900);
  await page.waitForFunction(() => window.scrollY <= 20);
  await context.close();
}

async function captureMobileArtifact(browserInstance) {
  const context = await browserInstance.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await context.newPage();

  await page.goto(webUrl, { waitUntil: 'networkidle' });
  await waitForHomeReady(page);
  await page.screenshot({
    path: path.join(artifactDir, 'mobile-workflow.png'),
    fullPage: true,
  });
  await context.close();
}

async function waitForHomeReady(page) {
  await page
    .getByRole('heading', { name: 'Multi-cloud cost clarity, in one place.' })
    .waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /compare costs/i }).waitFor({ state: 'visible' });
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
