#!/usr/bin/env node
/**
 * Pricing accuracy golden harness.
 *
 * Prices each reference workload in test/golden/pricing-accuracy-golden.json
 * through the running PolyCost API and compares each provider's monthly total
 * to the real AWS/Azure/GCP Pricing Calculator value (the golden), within a
 * per-row tolerance. This is the harness that proves — or disproves — that
 * "PolyCost's billing calculations equal a manual provider calculation".
 *
 * Usage:
 *   node scripts/pricing-accuracy-harness.mjs
 *   POLYCOST_API_BASE=http://localhost:3101/api/v1 node scripts/pricing-accuracy-harness.mjs
 *
 * Env:
 *   POLYCOST_API_BASE   API base URL. Default http://localhost:3000/api/v1
 *                       (the web proxy). Use http://localhost:3101/api/v1 to hit
 *                       the API container directly on this machine's mapped port.
 *   POLYCOST_GOLDEN     Path to the golden JSON. Default test/golden/pricing-accuracy-golden.json
 *
 * Exit code: non-zero if any provider row with a populated calculator value
 * breaches its tolerance, or if any request fails. Report-only rows (null
 * calculator value) never fail the run — they print for manual capture.
 *
 * To capture real numbers, run against a live-mode stack (USE_MOCK_PROVIDERS=false)
 * and fill in expected.<provider>.calculatorMonthlyUsd in the golden file.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_BASE = process.env.POLYCOST_API_BASE ?? 'http://localhost:3000/api/v1';
const GOLDEN_PATH = resolve(
  process.env.POLYCOST_GOLDEN ?? 'test/golden/pricing-accuracy-golden.json',
);
const PROVIDERS = ['aws', 'azure', 'gcp'];

function money(n) {
  return n === null || n === undefined ? '     n/a' : `$${n.toFixed(2)}`.padStart(11);
}

function pct(n) {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

async function priceWorkload(nws) {
  const res = await fetch(`${API_BASE}/comparisons`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nws }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /comparisons -> HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
  }
  return res.json();
}

function providerMonthly(comparison, providerId) {
  const provider = (comparison.providers ?? []).find((p) => p.providerId === providerId);
  return provider?.totals?.monthly ?? null;
}

async function main() {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  console.log(`\nPolyCost pricing accuracy harness`);
  console.log(`API:    ${API_BASE}`);
  console.log(`Golden: ${GOLDEN_PATH}`);
  console.log(`Note:   compares PolyCost monthly total vs real provider calculator (golden) per row.\n`);

  // Surface the provenance of the data the API is actually serving.
  try {
    const health = await fetch(`${API_BASE}/data-health`).then((r) => (r.ok ? r.json() : null));
    if (health) {
      const banner =
        health.usesNonLivePricing === true
          ? `DATA PROVENANCE: ${String(health.dataProvenance).toUpperCase()} (NON-LIVE) — numbers below are NOT real provider prices. Run with USE_MOCK_PROVIDERS=false for a true accuracy test.`
          : `DATA PROVENANCE: ${String(health.dataProvenance ?? 'unknown').toUpperCase()}`;
      console.log(`  ${banner}\n`);
    }
  } catch {
    /* data-health is best-effort context only */
  }

  let failures = 0;
  let comparisons = 0;
  let reportOnly = 0;

  for (const workload of golden.workloads) {
    let comparison;
    try {
      comparison = await priceWorkload(workload.nws);
    } catch (error) {
      console.log(`■ ${workload.id}\n  REQUEST FAILED: ${error.message}\n`);
      failures += 1;
      continue;
    }

    console.log(`■ ${workload.id} — ${workload.description}`);
    console.log(
      `  provider  polycost      calculator    delta     tol    result`,
    );
    for (const providerId of PROVIDERS) {
      const expected = workload.expected?.[providerId] ?? {};
      const calc = expected.calculatorMonthlyUsd ?? null;
      const actual = providerMonthly(comparison, providerId);
      const tol = expected.tolerancePercent ?? 10;

      if (actual === null) {
        console.log(`  ${providerId.padEnd(8)} ${money(null)}   ${money(calc)}   (no PolyCost result)`);
        failures += 1;
        continue;
      }
      if (calc === null) {
        console.log(
          `  ${providerId.padEnd(8)} ${money(actual)}   ${money(null)}   report-only (capture calculator value)`,
        );
        reportOnly += 1;
        continue;
      }

      const deltaPct = ((actual - calc) / calc) * 100;
      const within = Math.abs(deltaPct) <= tol;
      comparisons += 1;
      if (!within) failures += 1;
      console.log(
        `  ${providerId.padEnd(8)} ${money(actual)}   ${money(calc)}   ${pct(deltaPct).padStart(7)}  ${`${tol}%`.padStart(5)}  ${within ? 'PASS' : 'FAIL'}`,
      );
    }
    console.log('');
  }

  console.log(
    `Summary: ${comparisons} enforced comparison(s), ${reportOnly} report-only, ${failures} failure(s).`,
  );
  if (comparisons === 0 && reportOnly > 0) {
    console.log(
      'No enforced golden values yet — capture real calculator numbers into the golden file to enable pass/fail.',
    );
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Harness error: ${error?.stack ?? error}`);
  process.exit(1);
});
