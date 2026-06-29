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

    expect(configuredApiBaseUrl()).toBe('http://localhost:3001/api/v1');
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
