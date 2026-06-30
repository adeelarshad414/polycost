import {
  configuredApiBaseUrl,
  createPolyCostClient,
  formatApiError,
  PolyCostApiError,
} from './api-client';
import { buildNwsFromForm, defaultWorkloadForm } from './workload';

const originalFetch = global.fetch;

describe('api client', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reads configured base URL from document metadata', () => {
    const meta = document.createElement('meta');
    meta.name = 'polycost-api-base-url';
    meta.content = 'http://api.test/api/v1/';
    document.head.appendChild(meta);

    expect(configuredApiBaseUrl()).toBe('http://api.test/api/v1');
  });

  it('falls back when Vite did not inject a URL', () => {
    const meta = document.createElement('meta');
    meta.name = 'polycost-api-base-url';
    meta.content = '%VITE_API_BASE_URL%';
    document.head.appendChild(meta);

    expect(configuredApiBaseUrl()).toBe('/api/v1');
  });

  it('sends comparison requests with cached-pricing options', async () => {
    const nws = buildNwsFromForm(defaultWorkloadForm);
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        comparisonId: 'comparison-1',
        pricingAsOf: '2026-06-29T00:00:00.000Z',
        cheapestProviderId: 'aws',
        providers: [],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createComparison(nws);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/comparisons',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          nws,
          options: {
            useLivePricing: false,
          },
        }),
      }),
    );
  });

  it('maps API error envelopes', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Bad request',
            details: [{ field: 'nws', issue: 'required' }],
          },
        },
        400,
      ),
    ) as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.validateWorkload(buildNwsFromForm(defaultWorkloadForm))).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Bad request',
        details: [{ field: 'nws', issue: 'required' }],
      }) as PolyCostApiError,
    );
  });

  it('downloads binary exports', async () => {
    const blob = new Blob(['csv']);
    const fetchMock = jest.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          blob: jest.fn(async () => blob),
        }) as unknown as Response,
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.exportComparison('comparison-1', 'csv')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/comparisons/comparison-1/export?format=csv',
    );
  });

  it('fetches API health from the backend root', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        status: 'ok',
        service: 'polycost-api',
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getHealth()).resolves.toEqual({
      status: 'ok',
      service: 'polycost-api',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches the live cloud region catalog', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        generatedAt: '2026-06-29T00:00:00.000Z',
        cacheTtlSeconds: 43_200,
        providers: [
          {
            providerId: 'aws',
            label: 'AWS',
            source: 'live',
            sourceUrl: 'https://b0.p.awsstatic.com/locations/1.0/aws/current/locations.json',
            calculatorUrl: 'https://calculator.aws/#/',
            regions: [
              {
                providerId: 'aws',
                id: 'us-east-1',
                label: 'US East (N. Virginia)',
                source: 'live',
              },
            ],
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getRegionCatalog()).resolves.toEqual(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: 'aws',
            calculatorUrl: 'https://calculator.aws/#/',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/regions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches pricing model metadata', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        defaultModel: 'on-demand',
        generatedAt: '2026-06-30T00:00:00.000Z',
        models: [
          {
            model: 'spot',
            cachedTerm: 'spot',
            label: 'Spot',
            default: false,
            volatility: 'volatile',
            providerTerms: {
              aws: 'EC2 Spot Instances',
              azure: 'Azure Spot VMs',
              gcp: 'Google Cloud Spot VMs',
            },
            caveat: 'Spot prices are interruptible and volatile.',
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(client.getPricingModels()).resolves.toEqual(
      expect.objectContaining({
        defaultModel: 'on-demand',
        models: expect.arrayContaining([
          expect.objectContaining({
            model: 'spot',
            volatility: 'volatile',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/pricing/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('fetches provider/service pricing model metadata for dynamic selectors', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        schemaVersion: 2,
        provider: 'aws',
        service: 'compute',
        region: 'us-east-1',
        generatedAt: '2026-06-30T00:00:00.000Z',
        models: [
          {
            code: 'reserved_3yr',
            label: 'Reserved (3-Year)',
            termMonths: 36,
            requiresPaymentOption: true,
            isEstimateOnly: false,
            paymentOptions: [{ code: 'no_upfront', label: 'No upfront' }],
            defaultPaymentOption: 'no_upfront',
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await expect(
      client.getPricingModelsForService('aws', 'compute', 'us-east-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        models: expect.arrayContaining([
          expect.objectContaining({
            code: 'reserved_3yr',
          }),
        ]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/pricing/aws/compute/models?region=us-east-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('creates workload-scoped share links and resolves public reports', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'workload-1',
          instanceFamily: 'general-purpose',
          vcpu: 2,
          memoryGb: 4,
          region: 'us-east',
          instanceCount: 2,
          hoursPerMonth: 730,
          storageGb: 250,
          storageTier: 'standard',
          egressGbPerMonth: 750,
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'public-token',
          url: '/api/v1/share/public-token',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'public-token',
          watermark: true,
          expiresAt: '2026-07-29T00:00:00.000Z',
          workload: {},
          breakdown: {},
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createWorkload({
      instanceFamily: 'general-purpose',
      vcpu: 2,
      memoryGb: 4,
      region: 'us-east',
      instanceCount: 2,
      hoursPerMonth: 730,
      storageGb: 250,
      storageTier: 'standard',
      egressGbPerMonth: 750,
    });
    await client.createShareLink({
      workloadId: 'workload-1',
      watermark: true,
      expiresInDays: 30,
    });
    await client.getSharedReport('public-token');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/workloads',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/share-links',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/share/public-token',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('uses budget, alert, and exchange-rate endpoints', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'budget-1',
          workloadId: 'workload-1',
          thresholdUsd: 500,
          alertOnAnomalyPercent: 20,
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'alert-1',
            workloadId: 'workload-1',
            budgetId: 'budget-1',
            alertType: 'budget_threshold',
            message: 'Budget exceeded',
            dismissed: false,
            triggeredAt: '2026-06-29T00:00:00.000Z',
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'alert-1',
          workloadId: 'workload-1',
          budgetId: 'budget-1',
          alertType: 'budget_threshold',
          message: 'Budget exceeded',
          dismissed: true,
          triggeredAt: '2026-06-29T00:00:00.000Z',
          dismissedAt: '2026-06-29T01:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          base: 'USD',
          lastUpdated: '2026-06-29T00:00:00.000Z',
          rates: {
            PKR: 278,
          },
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createBudget({
      workloadId: 'workload-1',
      thresholdUsd: 500,
      alertOnAnomalyPercent: 20,
    });
    await client.listAlerts('workload-1');
    await client.updateAlertDismissed('alert-1', true);
    await client.getExchangeRates('USD');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/budgets',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/alerts?workloadId=workload-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/v1/alerts/alert-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ dismissed: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/api/v1/exchange-rates?base=USD',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('formats unknown and API errors for UI display', () => {
    expect(
      formatApiError(
        new PolyCostApiError(400, 'VALIDATION_ERROR', 'Invalid NWS', [
          {
            issue: 'compute is required',
          },
        ]),
      ),
    ).toBe('Invalid NWS compute is required');
    expect(formatApiError(new Error('Broken'))).toBe('Broken');
    expect(formatApiError('bad')).toBe('Unexpected application error');
  });

  it('parses workload and refreshes live comparisons', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          draftNws: buildNwsFromForm(defaultWorkloadForm),
          parserConfidence: 'high',
          fieldsRequiringReview: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          comparisonId: 'comparison-2',
          pricingAsOf: '2026-06-29T00:00:00.000Z',
          cheapestProviderId: 'aws',
          providers: [],
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.parseWorkload('web app');
    await client.refreshLiveComparison('comparison-2');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/v1/workload/parse',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/v1/comparisons/comparison-2/refresh-live',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  const bodyText = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => JSON.parse(bodyText) as unknown),
    blob: jest.fn(async () => new Blob([bodyText])),
  } as unknown as Response;
}
