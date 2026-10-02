// Renders the 1200x630 social preview (UI-6) to apps/web/public/brand/og-image.png.
// Social platforms do not render SVG previews, so the image is a PNG built from
// the Aurora palette and the logomark. Run: node scripts/generate-og-image.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const logo = readFileSync(path.join(root, 'apps/web/public/brand/polycost-logomark.svg'), 'utf8');
const output = path.join(root, 'apps/web/public/brand/og-image.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1200px; height: 630px; font-family: Inter, system-ui, sans-serif;
    background:
      radial-gradient(60% 55% at 12% 8%, #c7d2fe 0%, transparent 60%),
      radial-gradient(50% 50% at 88% 6%, #f5d0fe 0%, transparent 60%),
      radial-gradient(60% 55% at 55% 105%, #a5f3fc 0%, transparent 65%), #f5f6fb;
    color: #0f1222; display: grid; grid-template-columns: 1.1fr 1fr; align-items: center;
    gap: 48px; padding: 0 72px; box-sizing: border-box; }
  body::before { content: ''; position: absolute; inset: 0 0 auto; height: 8px;
    background: linear-gradient(90deg, #4f46e5, #7c3aed 45%, #db2777 75%, #0891b2); }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 700; }
  .brand svg { width: 64px; height: 64px; }
  h1 { font-size: 64px; line-height: 1.05; letter-spacing: -0.03em; margin: 28px 0 18px; }
  p { font-size: 26px; color: #2e3348; margin: 0; line-height: 1.4; }
  .card { background: rgba(255,255,255,.82); border: 1px solid #e4e7f0; border-radius: 24px;
    padding: 32px; box-shadow: 0 24px 48px -16px rgba(49,46,129,.24); }
  .eyebrow { font-size: 16px; letter-spacing: .08em; text-transform: uppercase; color: #565c74; font-weight: 600; }
  .verdict { font-size: 26px; font-weight: 600; margin: 8px 0 4px; }
  .price { font-size: 52px; font-weight: 700; letter-spacing: -0.03em; }
  .price small { font-size: 20px; font-weight: 400; color: #2e3348; letter-spacing: 0; }
  .row { display: grid; grid-template-columns: 80px 1fr 120px; align-items: center; gap: 14px; margin-top: 16px; font-size: 20px; font-weight: 600; }
  .bar { height: 22px; border-radius: 4px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style></head><body>
  <div>
    <div class="brand">${logo}<span>PolyCost</span></div>
    <h1>Multi-cloud cost clarity, in one place.</h1>
    <p>Compare AWS, Azure and GCP costs side by side, with the evidence behind every number.</p>
  </div>
  <div class="card">
    <div class="eyebrow">Sample result</div>
    <div class="verdict">Azure is the lowest-cost option</div>
    <div class="price">$122.96 <small>/ month</small></div>
    <div class="row"><span>Azure</span><span class="bar" style="width:24%;background:#3b6fe8"></span><span class="num">$122.96</span></div>
    <div class="row"><span>AWS</span><span class="bar" style="width:26%;background:#fdf1e3;border:2px solid #e98a15"></span><span class="num">$132.94</span></div>
    <div class="row"><span>GCP</span><span class="bar" style="width:100%;background:#e4f4eb;border:2px solid #0f7a43"></span><span class="num">$521.55</span></div>
  </div>
</body></html>`;

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: output, type: 'png' });
await browser.close();
console.log(`Social preview written to ${path.relative(root, output)}`);
