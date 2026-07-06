/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: fixture reads are resolved from repository-controlled test data; see docs/SECURITY-SUPPRESSIONS.md. */
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
      'missing required GCP Cloud Billing access token',
    );
  });
});
