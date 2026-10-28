import type { ModeledRateCard } from '../types';

/**
 * Test-only copy of the API rate card (ADR-0002), with the values the API
 * served when this was written. Imported by specs, never by the app.
 */
export const RATE_CARD_FIXTURE: ModeledRateCard = {
  kind: 'modeled',
  pricingAsOf: '2026-07-01',
  maxAgeDays: 180,
  appPlatform: {
    source: 'test fixture',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        requestPerMillion: 0,
        vcpuHour: 0.064,
        memoryGbHour: 0.007,
        alwaysOnVcpuHour: 0.064,
        alwaysOnMemoryGbHour: 0.007,
        evidence: 'App Runner-style active vCPU plus provisioned/active memory model.',
      },
      azure: {
        requestPerMillion: 0.4,
        vcpuHour: 0.0864,
        memoryGbHour: 0.009,
        alwaysOnVcpuHour: 0.095,
        alwaysOnMemoryGbHour: 0.012,
        evidence:
          'App Service always-on plan compared with a request-metered managed-app approximation.',
      },
      gcp: {
        requestPerMillion: 0.4,
        vcpuHour: 0.0864,
        memoryGbHour: 0.009,
        alwaysOnVcpuHour: 0.0648,
        alwaysOnMemoryGbHour: 0.00675,
        evidence:
          'Cloud Run request-based model compared with always-allocated CPU worker posture.',
      },
    },
  },
  serverlessFunctions: {
    source: 'test fixture',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        requestPerMillion: 0.2,
        gbSecond: 0.0000166667,
        evidence: 'Lambda-style requests plus GB-second duration model.',
      },
      azure: {
        requestPerMillion: 0.2,
        gbSecond: 0.000016,
        evidence: 'Azure Functions-style executions plus GB-second duration model.',
      },
      gcp: {
        requestPerMillion: 0.4,
        gbSecond: 0.0000025,
        evidence: 'Cloud Run functions-style invocations plus GB-second duration model.',
      },
    },
  },
  computeArmCostFactors: {
    source: 'test fixture',
    reviewedAt: '2026-07-02',
    rates: { aws: 0.8, azure: 0.85, gcp: 0.82 },
  },
  regionVariance: {
    source: 'test fixture',
    reviewedAt: '2026-07-02',
    rates: [
      {
        regionId: 'us-east',
        multiplier: 1,
        evidence: 'Baseline North America pricing sensitivity.',
      },
      {
        regionId: 'us-central',
        multiplier: 0.99,
        evidence: 'Modeled 1% regional discount for central US capacity sensitivity.',
      },
      {
        regionId: 'us-west',
        multiplier: 1.03,
        evidence: 'Modeled 3% regional premium for west-coast capacity sensitivity.',
      },
      {
        regionId: 'eu-west',
        multiplier: 1.08,
        evidence: 'Modeled 8% regional premium for EU residency/compliance sensitivity.',
      },
      {
        regionId: 'eu-central',
        multiplier: 1.09,
        evidence: 'Modeled 9% regional premium for EU central capacity sensitivity.',
      },
      {
        regionId: 'uk',
        multiplier: 1.1,
        evidence: 'Modeled 10% regional premium for UK residency sensitivity.',
      },
      {
        regionId: 'canada',
        multiplier: 1.04,
        evidence: 'Modeled 4% regional premium for Canada residency sensitivity.',
      },
      {
        regionId: 'ap-southeast',
        multiplier: 1.12,
        evidence: 'Modeled 12% regional premium for APAC latency/residency sensitivity.',
      },
      {
        regionId: 'ap-south',
        multiplier: 0.96,
        evidence: 'Modeled 4% discount sensitivity for lower-cost APAC alternatives.',
      },
    ],
  },
};
