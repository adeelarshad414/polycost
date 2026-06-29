import { ComparisonResult } from '../comparison/comparison.types';
import { NormalizedWorkloadSpec } from '../nws/nws.types';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const WEB_BASE_URL = 'http://localhost:3000';

interface ParsedNwsDraftResponse {
  draftNws: NormalizedWorkloadSpec;
  parserConfidence: 'high' | 'medium' | 'low';
  fieldsRequiringReview: string[];
}

describe('MVP acceptance criteria E2E', () => {
  let structuredComparison: ComparisonResult;

  beforeAll(async () => {
    await expectApiHealth();
    structuredComparison = await createComparison(buildStructuredWorkload('Phase 10 baseline'));
  }, 60_000);

  it('serves the frontend shell from the Compose stack without a manual seed step', async () => {
    const html = await requestText(WEB_BASE_URL);

    expect(html).toContain('PolyCost');
    expect(html).toContain('<div id="root">');
    expectProviderComparison(structuredComparison);
  });

  it('turns plain-English requirements into a three-cloud comparison', async () => {
    const parsed = await requestJson<ParsedNwsDraftResponse>('/workload/parse', {
      method: 'POST',
      body: JSON.stringify({
        naturalLanguageInput:
          'Estimate a web app for 12000 daily users and 900 peak users in us-east-1 with 4 web servers, 4 vCPU, 16 GB memory, 500 GB object storage, PostgreSQL database, 1200 GB monthly egress, CDN, load balancer, and multi-AZ high availability.',
      }),
    });

    expect(parsed.draftNws.metadata.sourceType).toBe('natural_language');
    expect(['high', 'medium', 'low']).toContain(parsed.parserConfidence);
    expect(Array.isArray(parsed.fieldsRequiringReview)).toBe(true);

    await requestJson<{ valid: true }>('/workload/validate', {
      method: 'POST',
      body: JSON.stringify(parsed.draftNws),
    });

    const comparison = await createComparison(parsed.draftNws);

    expectProviderComparison(comparison);
    expect(comparison.providers.some((provider) => provider.lineItems.length > 0)).toBe(true);
  });

  it('refreshes an existing comparison against the current pricing catalog', async () => {
    const refreshed = await requestJson<ComparisonResult>(
      `/comparisons/${structuredComparison.comparisonId}/refresh-live`,
      {
        method: 'POST',
      },
    );

    expectProviderComparison(refreshed);
    expect(refreshed.comparisonId).not.toBe(structuredComparison.comparisonId);
    expect(Date.parse(refreshed.pricingAsOf)).not.toBeNaN();
  });

  it('exports the same comparison as PDF, CSV, and Excel downloads', async () => {
    const pdf = await requestDownload(
      `/comparisons/${structuredComparison.comparisonId}/export?format=pdf`,
    );
    const csv = await requestDownload(
      `/comparisons/${structuredComparison.comparisonId}/export?format=csv`,
    );
    const xlsx = await requestDownload(
      `/comparisons/${structuredComparison.comparisonId}/export?format=xlsx`,
    );

    expect(pdf.contentType).toContain('application/pdf');
    expect(pdf.text.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(500);

    expect(csv.contentType).toContain('text/csv');
    expect(csv.text).toContain('Comparison ID,');
    expect(csv.text).toContain(
      'Provider,Daily USD,Weekly USD,Monthly USD,Quarterly USD,Yearly USD',
    );
    expect(csv.text).toContain('Provider,Category,Description,Approximate,Monthly USD');

    expect(xlsx.contentType).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsx.text.startsWith('PK')).toBe(true);
    expect(xlsx.text).toContain('[Content_Types].xml');
    expect(xlsx.byteLength).toBeGreaterThan(500);
  });

  it('labels non-native equivalents when the requirement names an AWS-specific service', async () => {
    const comparison = await createComparison(
      buildStructuredWorkload('Phase 10 Aurora portability', 'Amazon Aurora PostgreSQL'),
    );
    const azure = comparison.providers.find((provider) => provider.providerId === 'azure');
    const gcp = comparison.providers.find((provider) => provider.providerId === 'gcp');

    expectProviderComparison(comparison);
    expect(azure?.lineItems.some((lineItem) => lineItem.category === 'database')).toBe(true);
    expect(gcp?.lineItems.some((lineItem) => lineItem.category === 'database')).toBe(true);
    expect(
      azure?.lineItems.some(
        (lineItem) => lineItem.category === 'database' && lineItem.isApproximate,
      ),
    ).toBe(true);
    expect(
      gcp?.lineItems.some((lineItem) => lineItem.category === 'database' && lineItem.isApproximate),
    ).toBe(true);
  });
});

async function expectApiHealth(): Promise<void> {
  const health = await requestJson<{ status: string; service: string }>(
    'http://localhost:3001/health',
  );

  expect(health).toEqual({
    status: 'ok',
    service: 'polycost-api',
  });
}

async function createComparison(nws: NormalizedWorkloadSpec): Promise<ComparisonResult> {
  await requestJson<{ valid: true }>('/workload/validate', {
    method: 'POST',
    body: JSON.stringify(nws),
  });

  return requestJson<ComparisonResult>('/comparisons', {
    method: 'POST',
    body: JSON.stringify({
      nws,
      options: {
        useLivePricing: false,
      },
    }),
  });
}

async function requestJson<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
  const response = await request(pathOrUrl, init);
  const text = await response.text();

  return JSON.parse(text) as T;
}

async function requestText(pathOrUrl: string, init?: RequestInit): Promise<string> {
  const response = await request(pathOrUrl, init);

  return response.text();
}

async function requestDownload(pathOrUrl: string): Promise<{
  byteLength: number;
  contentType: string;
  text: string;
}> {
  const response = await request(pathOrUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    byteLength: buffer.length,
    contentType: response.headers.get('content-type') ?? '',
    text: buffer.toString('utf8'),
  };
}

async function request(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const headers =
    init?.body === undefined
      ? init?.headers
      : {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        };
  const response = await fetch(toUrl(pathOrUrl), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `E2E request failed: ${response.status} ${response.statusText} ${await response.text()}`,
    );
  }

  return response;
}

function toUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) {
    return pathOrUrl;
  }

  return `${API_BASE_URL}${pathOrUrl}`;
}

function expectProviderComparison(result: ComparisonResult): void {
  expect(result.comparisonId).toEqual(expect.any(String));
  expect(Date.parse(result.pricingAsOf)).not.toBeNaN();
  expect(['aws', 'azure', 'gcp']).toContain(result.cheapestProviderId);
  expect(result.providers.map((provider) => provider.providerId).sort()).toEqual([
    'aws',
    'azure',
    'gcp',
  ]);

  result.providers.forEach((provider) => {
    expect(provider.lineItems.length).toBeGreaterThan(0);
    expect(provider.totals.daily).toBeGreaterThan(0);
    expect(provider.totals.weekly).toBeGreaterThan(0);
    expect(provider.totals.monthly).toBeGreaterThan(0);
    expect(provider.totals.quarterly).toBeGreaterThan(0);
    expect(provider.totals.yearly).toBeGreaterThan(0);
  });
}

function buildStructuredWorkload(
  name: string,
  databasePreference?: string,
): NormalizedWorkloadSpec {
  return {
    schemaVersion: '1.0',
    metadata: {
      sourceType: 'structured_form',
      createdAt: '2026-06-29T00:00:00.000Z',
    },
    workload: {
      name,
      type: 'web_app',
      expectedUsers: {
        dailyActiveUsers: 5000,
        peakConcurrentUsers: 600,
      },
      region: {
        preference: 'us-east-1',
        isDefault: false,
      },
    },
    compute: [
      {
        role: 'web',
        vcpu: 2,
        memoryGb: 4,
        instanceCount: 2,
        scalingType: 'fixed',
      },
    ],
    storage: [
      {
        role: 'uploads',
        type: 'object',
        sizeGb: 250,
        accessPattern: 'frequent',
      },
    ],
    database: [
      {
        role: 'primary',
        engine: 'postgres',
        sizeGb: 100,
        highAvailability: true,
        ...(databasePreference ? { managedServicePreference: databasePreference } : {}),
      },
    ],
    network: {
      estimatedMonthlyEgressGb: 750,
      cdn: true,
      loadBalancer: true,
    },
    availability: {
      multiAz: true,
      multiRegion: false,
      slaTarget: '99.9%',
    },
  };
}
