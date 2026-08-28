/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: fixture reads are resolved from repository-controlled test data; see docs/SECURITY-SUPPRESSIONS.md. */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SecretsReader } from '../../secrets/secrets.service';
import { InMemoryPricingCatalogReader } from '../common/in-memory-pricing-catalog.reader';
import { PricingCatalogRecord } from '../common/cloud-provider-adapter';
import { FetchLike } from '../common/http-client';
import { GcpProviderAdapter } from './gcp-provider.adapter';

const fixture = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../..', relativePath), 'utf8')) as T;

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => JSON.stringify(body),
});

const secretsReader = (): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'access_token') {
      return 'test-access-token';
    }

    throw new Error('missing secret');
  }),
});

const serviceAccountSecretsReader = (serviceAccountJson: string): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'access_token') {
      throw new Error('missing access token');
    }

    if (key === 'service_account_json') {
      return serviceAccountJson;
    }

    throw new Error('missing secret');
  }),
});

function serviceAccountJson(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return JSON.stringify({
    client_email: 'polycost-pricing-reader@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
}

describe('GcpProviderAdapter', () => {
  it('normalizes GCP Cloud Billing Catalog responses into catalog records', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/services.json')))
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/gcp/compute-skus.json')),
      ) as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      secretsReader(),
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records).toEqual([
      expect.objectContaining({
        provider: 'gcp',
        serviceCategory: 'compute',
        serviceName: 'Compute Engine',
        skuId: 'GCP-E2-STANDARD-2',
        region: 'us-central1',
        unit: 'hour',
        unitPriceUsd: 0.067,
      }),
    ]);
    expect(fetchClient).toHaveBeenCalledWith(
      expect.stringContaining('https://cloudbilling.googleapis.com/v1/services'),
      expect.objectContaining({
        headers: {
          authorization: 'Bearer test-access-token',
        },
      }),
    );
  });

  it('prices a workload from cached GCP catalog records', async () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'gcp',
        serviceCategory: 'compute',
        serviceName: 'Compute Engine E2',
        skuId: 'GCP-E2-STANDARD-2',
        region: 'us-central1',
        unit: 'hour',
        unitPriceUsd: 0.067,
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
    ];
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader(records),
      'us-central1',
      secretsReader(),
    );

    const result = await adapter.priceWorkload({
      schemaVersion: '1.0',
      metadata: {
        sourceType: 'structured_form',
        createdAt: '2026-06-28T00:00:00.000Z',
      },
      workload: {
        type: 'web_app',
        region: {
          preference: 'us-central1',
          isDefault: false,
        },
      },
      compute: [
        {
          role: 'web',
          scalingType: 'fixed',
          instanceCount: 2,
        },
      ],
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      availability: {
        multiAz: false,
        multiRegion: false,
      },
    });

    expect(result.baseMonthlyCostUsd).toBe(97.82);
  });

  it('applies the GCP sustained-use discount to eligible on-demand compute (N2)', async () => {
    // N2 is SUD-eligible (20%). E2 (above) is not, which is why it stays at list.
    const records: PricingCatalogRecord[] = [
      {
        provider: 'gcp',
        serviceCategory: 'compute',
        serviceName: 'Compute Engine N2',
        skuId: 'GCP-N2-STANDARD-2',
        region: 'us-central1',
        unit: 'hour',
        unitPriceUsd: 0.097,
        attributes: { machineType: 'n2-standard-2', pricingModel: 'on-demand' },
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
    ];
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader(records),
      'us-central1',
      secretsReader(),
    );

    const result = await adapter.priceWorkload({
      schemaVersion: '1.0',
      metadata: { sourceType: 'structured_form', createdAt: '2026-06-28T00:00:00.000Z' },
      workload: { type: 'web_app', region: { preference: 'us-central1', isDefault: false } },
      compute: [{ role: 'web', scalingType: 'fixed', instanceCount: 2 }],
      storage: [],
      database: [],
      network: { cdn: false, loadBalancer: false },
      availability: { multiAz: false, multiRegion: false },
    });

    // List: 0.097 x 2 x 730 = 141.62; with 20% SUD -> 113.30 (not 141.62).
    expect(result.baseMonthlyCostUsd).toBe(113.3);
    const derivation = result.lineItems[0].pricingTrace?.derivation;
    expect(derivation?.sustainedUseDiscountPercent).toBe(20);
    expect(derivation?.listMonthlyCostUsd).toBe(141.62);
    expect(derivation?.monthlyCostUsd).toBe(113.3);
  });

  it('pins the compute category to the Compute Engine serviceId (ignores decoy services)', async () => {
    const services = {
      services: [
        {
          name: 'services/6F81-5844-456A',
          serviceId: '6F81-5844-456A',
          displayName: 'Compute Engine',
        },
        // Decoy: display name contains "compute" (old regex would sweep it in),
        // but a different serviceId — must be ignored.
        {
          name: 'services/DECOY-0000-0000',
          serviceId: 'DECOY-0000-0000',
          displayName: 'Compute Metadata Service',
        },
      ],
    };
    const skus = fixture('test/fixtures/pricing/gcp/compute-skus.json');
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(services))
      .mockResolvedValue(jsonResponse(skus)) as unknown as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      secretsReader(),
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    await adapter.refreshPricingCatalog({ categories: ['compute'] });

    const urls = (fetchClient as unknown as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('6F81-5844-456A/skus'))).toBe(true);
    expect(urls.some((u) => u.includes('DECOY-0000-0000'))).toBe(false);
  });

  it('does not offer a savings-plan pricing model (GCP has none)', async () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'gcp',
        serviceCategory: 'compute',
        serviceName: 'Compute Engine E2',
        skuId: 'GCP-E2-STANDARD-2',
        region: 'us-central1',
        unit: 'hour',
        unitPriceUsd: 0.067,
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
    ];
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader(records),
      'us-central1',
      secretsReader(),
    );

    const result = await adapter.priceWorkload({
      schemaVersion: '1.0',
      metadata: { sourceType: 'structured_form', createdAt: '2026-06-28T00:00:00.000Z' },
      workload: { type: 'web_app', region: { preference: 'us-central1', isDefault: false } },
      compute: [{ role: 'web', scalingType: 'fixed', instanceCount: 1 }],
      storage: [],
      database: [],
      network: { cdn: false, loadBalancer: false },
      availability: { multiAz: false, multiRegion: false },
    });

    const models = (result.lineItems[0].pricingModels ?? []).map((m) => m.model);
    expect(models).not.toContain('savings-plan');
    expect(models).toContain('spot'); // spot estimate is still offered
  });

  it('filters live GCP pricing by requested service id', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/services.json')))
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/compute-skus.json')))
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/gcp/storage-skus.json')),
      ) as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      secretsReader(),
      fetchClient,
    );

    const records = await adapter.refreshLivePricing(['GCP-STORAGE-STANDARD']);

    expect(records).toHaveLength(1);
    expect(records[0].skuId).toBe('GCP-STORAGE-STANDARD');
  });

  it('exchanges service account JSON for a GCP Cloud Billing access token', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'service-account-token' }))
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/services.json')))
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/gcp/compute-skus.json')),
      ) as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      serviceAccountSecretsReader(serviceAccountJson()),
      fetchClient,
      () => new Date('2026-07-07T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({ categories: ['compute'] });

    expect(records).toHaveLength(1);
    expect(fetchClient).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: expect.stringContaining(
          'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
        ),
      }),
    );
    expect(fetchClient).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://cloudbilling.googleapis.com/v1/services'),
      expect.objectContaining({
        headers: {
          authorization: 'Bearer service-account-token',
        },
      }),
    );

    const fetchMock = fetchClient as jest.MockedFunction<FetchLike>;
    const tokenRequest = fetchMock.mock.calls[0]?.[1];
    const tokenRequestBody = tokenRequest?.body;

    expect(typeof tokenRequestBody).toBe('string');
    if (typeof tokenRequestBody !== 'string') {
      throw new Error('Expected GCP token exchange request body to be URL-encoded text.');
    }
    expect(new URLSearchParams(tokenRequestBody).get('assertion')?.split('.')).toHaveLength(3);
  });

  it('follows GCP service and SKU pagination while applying region filters', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          services: [],
          nextPageToken: 'service-page-2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/services.json')))
      .mockResolvedValueOnce(
        jsonResponse({
          skus: [],
          nextPageToken: 'sku-page-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/gcp/compute-skus.json')),
      ) as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      secretsReader(),
      fetchClient,
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      region: 'us-central1',
    });

    expect(records).toHaveLength(1);
    expect(fetchClient).toHaveBeenCalledWith(
      expect.stringContaining('pageToken=service-page-2'),
      expect.any(Object),
    );
    expect(fetchClient).toHaveBeenCalledWith(
      expect.stringContaining('pageToken=sku-page-2'),
      expect.any(Object),
    );
  });

  it('drops GCP SKUs that do not expose a unit price', async () => {
    const computeSkus = fixture<{ skus: Array<{ pricingInfo: unknown[] }> }>(
      'test/fixtures/pricing/gcp/compute-skus.json',
    );
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/services.json')))
      .mockResolvedValueOnce(
        jsonResponse({
          skus: [
            {
              ...computeSkus.skus[0],
              pricingInfo: [],
            },
          ],
        }),
      ) as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      secretsReader(),
      fetchClient,
    );

    await expect(adapter.refreshPricingCatalog({ categories: ['compute'] })).resolves.toEqual([]);
  });

  it('uses GCP usage-unit and fetched-at fallbacks when optional pricing fields are absent', async () => {
    const computeSkus = fixture<{
      skus: Array<{
        pricingInfo: Array<{
          effectiveTime?: string;
          pricingExpression: {
            usageUnitDescription?: string;
            usageUnit?: string;
            tieredRates: Array<{
              unitPrice: {
                units?: string;
                nanos?: number;
              };
            }>;
          };
        }>;
      }>;
    }>('test/fixtures/pricing/gcp/compute-skus.json');
    const sku = {
      ...computeSkus.skus[0],
      pricingInfo: [
        {
          pricingExpression: {
            usageUnit: 'h',
            tieredRates: [
              {
                unitPrice: {},
              },
            ],
          },
        },
      ],
    };
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(fixture('test/fixtures/pricing/gcp/services.json')))
      .mockResolvedValueOnce(
        jsonResponse({
          skus: [sku],
        }),
      ) as FetchLike;
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      secretsReader(),
      fetchClient,
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records[0]).toEqual(
      expect.objectContaining({
        unit: 'h',
        unitPriceUsd: 0,
        effectiveDate: '2026-06-28T00:00:00.000Z',
      }),
    );
  });

  it('fails clearly when the GCP access token is unavailable', async () => {
    const adapter = new GcpProviderAdapter(new InMemoryPricingCatalogReader([]), 'us-central1', {
      getSecret: jest.fn(async () => {
        throw new Error('missing');
      }),
    });

    await expect(adapter.refreshPricingCatalog({ categories: ['compute'] })).rejects.toThrow(
      'missing required GCP Cloud Billing access token or service account JSON',
    );
  });

  it('fails clearly when GCP service account JSON is malformed', async () => {
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      serviceAccountSecretsReader('{not-json'),
    );

    await expect(adapter.refreshPricingCatalog({ categories: ['compute'] })).rejects.toThrow(
      'GCP service account JSON is not valid JSON',
    );
  });

  it('fails clearly when the GCP service account private key cannot sign tokens', async () => {
    const adapter = new GcpProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-central1',
      serviceAccountSecretsReader(
        JSON.stringify({
          client_email: 'polycost-pricing-reader@example.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----',
        }),
      ),
    );

    await expect(adapter.refreshPricingCatalog({ categories: ['compute'] })).rejects.toThrow(
      'GCP service account private_key could not sign a JWT assertion',
    );
  });
});
