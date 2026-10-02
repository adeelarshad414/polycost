/**
 * Lighthouse CI budgets (UI-7). Runs against the static production build with
 * Lighthouse's default mobile emulation (slow 4G, mid-range CPU), the stricter
 * of the two profiles. Measured on 2026-10-01: performance 85, accessibility
 * 100, best practices 96, SEO 100; LCP 3.4 s, TBT 0 ms, CLS 0.
 *
 * Accessibility and best practices fail the build below the bar. Performance
 * fails below 80 and LCP warns above 2.5 s: the landing still ships App.tsx in
 * one chunk, and splitting it is the follow-up that lets LCP become an error.
 */
module.exports = {
  ci: {
    collect: {
      staticDistDir: './apps/web/dist',
      numberOfRuns: 3,
      // The CI job runs as root inside the Playwright image, where Chrome
      // refuses to start sandboxed.
      settings: process.env.CI ? { chromeFlags: '--no-sandbox --headless=new' } : {},
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        'categories:performance': ['error', { minScore: 0.8 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        // A static build has no API behind it, so data requests fail by design.
        'errors-in-console': 'off',
        // Source maps are not published for production.
        'valid-source-maps': 'off',
      },
    },
    upload: {
      // Keep reports in CI artifacts; never publish them to public storage.
      target: 'filesystem',
      outputDir: './.lighthouseci/reports',
    },
  },
};
