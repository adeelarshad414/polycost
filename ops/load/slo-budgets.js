// Load test for the Service Objectives in docs/RUNBOOK.md.
//
// The alert rules added in #188 assert these budgets in production, and the
// runbook has always stated them, but nothing had ever measured them under
// concurrency. This turns them into a check that can fail.
//
// The thresholds below ARE the budgets - k6 exits non-zero when one is
// breached, so this is a gate rather than a report someone has to read.
//
// Run with: npm run load:test
import http from 'k6/http';
import { check, group } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3101';

// Concurrency is configurable so the same budgets can be re-checked at higher
// load without editing the script. The default is deliberately modest: this is
// a regression gate, not a capacity test.
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '30s';

// Scenarios run one after another, never overlapping: two journeys competing
// for the same server would attribute each other's queueing delay to the wrong
// budget. Start times are derived from DURATION so that stays true when the
// load is turned up.
const DURATION_SECONDS = Number(String(DURATION).replace(/[^0-9.]/g, '')) || 30;
const SECOND_SCENARIO_START = `${DURATION_SECONDS}s`;
const THIRD_SCENARIO_START = `${DURATION_SECONDS * 2}s`;

// Requests rejected by the rate limiter. Tracked separately and asserted to be
// zero: a 429 is fast, so throttled runs produce flattering latency numbers
// while measuring the limiter instead of the service. If this is non-zero the
// run is invalid, not merely degraded.
const rateLimited = new Counter('rate_limited_requests');

const NWS = {
  nws: {
    schemaVersion: '1.0',
    metadata: { sourceType: 'structured_form', createdAt: '2026-06-29T00:00:00.000Z' },
    workload: { type: 'web_app', region: { isDefault: true } },
    compute: [{ role: 'web', scalingType: 'fixed' }],
    storage: [],
    database: [],
    network: { cdn: false, loadBalancer: false },
    availability: { multiAz: false, multiRegion: false },
  },
};

export const options = {
  scenarios: {
    // Read-heavy, which is what the 500 ms budget describes. Creation is a
    // separate, heavier path and is measured in its own scenario.
    cached_comparison: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'cachedComparison',
      tags: { journey: 'cached_comparison' },
    },
    pricing_matrix: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'pricingMatrix',
      tags: { journey: 'pricing_matrix' },
      startTime: SECOND_SCENARIO_START,
    },
    comparison_create: {
      // Low arrival rate on purpose: creation is rate limited in production and
      // hammering it would measure the limiter.
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 5,
      exec: 'createComparison',
      tags: { journey: 'comparison_create' },
      startTime: THIRD_SCENARIO_START,
    },
  },

  thresholds: {
    // Straight from the runbook Service Objectives table.
    'http_req_duration{journey:cached_comparison}': ['p(95)<500'],
    'http_req_duration{journey:pricing_matrix}': ['p(95)<800'],

    // No published budget for creation; this is a regression tripwire, not an
    // objective, and is labelled as such in the runbook.
    'http_req_duration{journey:comparison_create}': ['p(95)<3000'],

    // A fast run full of errors is not a passing run.
    http_req_failed: ['rate<0.01'],
    rate_limited_requests: ['count==0'],
    checks: ['rate>0.99'],
  },
};

// Created once, in setup, so the read scenario measures a cached read rather
// than paying for creation on every iteration.
export function setup() {
  const response = http.post(`${BASE_URL}/api/v1/comparisons`, JSON.stringify(NWS), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(
      `setup could not create a comparison: ${response.status} ${String(response.body).slice(0, 200)}`,
    );
  }

  const comparisonId = response.json('comparisonId');
  if (!comparisonId) {
    throw new Error('setup got no comparisonId back');
  }

  return { comparisonId };
}

function track(response) {
  if (response.status === 429) {
    rateLimited.add(1);
  }
  return response;
}

export function cachedComparison(data) {
  group('cached comparison read', () => {
    const response = track(http.get(`${BASE_URL}/api/v1/comparisons/${data.comparisonId}`));

    check(response, {
      'status is 200': (r) => r.status === 200,
      // Guards against a fast 200 that returns nothing useful, which would
      // make the latency budget meaningless.
      'body has the comparison': (r) => String(r.body).includes('comparisonId'),
    });
  });
}

export function pricingMatrix() {
  group('pricing matrix and breakdown', () => {
    const matrix = track(http.get(`${BASE_URL}/api/v1/pricing/aws/compute/matrix`));
    check(matrix, { 'matrix status is 200': (r) => r.status === 200 });

    const service = track(http.get(`${BASE_URL}/api/v1/pricing/aws/compute`));
    check(service, { 'service status is 200': (r) => r.status === 200 });
  });
}

export function createComparison() {
  group('comparison creation', () => {
    const response = track(
      http.post(`${BASE_URL}/api/v1/comparisons`, JSON.stringify(NWS), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    check(response, { 'create status is 2xx': (r) => r.status >= 200 && r.status < 300 });
  });
}
