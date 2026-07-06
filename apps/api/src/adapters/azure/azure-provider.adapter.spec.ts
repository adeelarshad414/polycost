/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: fixture reads are resolved from repository-controlled test data; see docs/SECURITY-SUPPRESSIONS.md. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InMemoryPricingCatalogReader } from '../common/in-memory-pricing-catalog.reader';
import { FetchLike } from '../common/http-client';
import { PricingCatalogRecord } from '../common/cloud-provider-adapter';
import { AzureProviderAdapter } from './azure-provider.adapter';

const fixture = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../..', relativePath), 'utf8')) as T;

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => JSON.stringify(body),
});

describe('AzureProviderAdapter', () => {
  it('normalizes Azure Retail Prices responses into catalog records', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/azure/retail-compute.json')),
      )
      .mockResolvedValueOnce(jsonResponse({ Items: [] })) as FetchLike;
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
      region: 'eastus',
    });

    expect(records).toEqual([
      expect.objectContaining({
        provider: 'azure',
        serviceCategory: 'compute',
        serviceName: 'Virtual Machines',
        skuId: 'AZURE-D2S-V5',
        region: 'eastus',
        unit: '1 Hour',
        unitPriceUsd: 0.0416,
        attributes: expect.objectContaining({
          pricingModel: 'on-demand',
          vcpu: 2,
          memoryGb: 8,
        }),
      }),
    ]);
    expect(fetchClient).toHaveBeenCalledWith(
      expect.stringContaining('https://prices.azure.com/api/retail/prices'),
    );
    expect(fetchClient).toHaveBeenCalledWith(expect.stringContaining('currencyCode=USD'));
  });

  it('follows Azure pagination links', async () => {
    const firstPage = {
      Items: [],
      NextPageLink: 'https://prices.azure.com/api/retail/prices?page=2',
    };
    const secondPage = fixture('test/fixtures/pricing/azure/retail-storage.json');
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(firstPage))
      .mockResolvedValueOnce(jsonResponse(secondPage)) as FetchLike;
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({ categories: ['storage'] });

    expect(records).toHaveLength(1);
    expect(records[0].skuId).toBe('AZURE-BLOB-HOT-LRS');
    expect(fetchClient).toHaveBeenCalledTimes(2);
  });

  it('prices a workload from cached Azure catalog records', async () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'azure',
        serviceCategory: 'compute',
        serviceName: 'Virtual Machines D2s v5',
        skuId: 'AZURE-D2S-V5',
        region: 'eastus',
        unit: '1 Hour',
        unitPriceUsd: 0.0416,
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
    ];
    const adapter = new AzureProviderAdapter(new InMemoryPricingCatalogReader(records), 'eastus');

    const result = await adapter.priceWorkload({
      schemaVersion: '1.0',
      metadata: {
        sourceType: 'structured_form',
        createdAt: '2026-06-28T00:00:00.000Z',
      },
      workload: {
        type: 'web_app',
        region: {
          preference: 'eastus',
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

    expect(result.baseMonthlyCostUsd).toBe(60.74);
  });

  it('filters live Azure pricing by requested service id', async () => {
    const fetchClient = jest.fn(async () =>
      jsonResponse(fixture('test/fixtures/pricing/azure/retail-storage.json')),
    ) as FetchLike;
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
    );

    const records = await adapter.refreshLivePricing(['AZURE-BLOB-HOT-LRS']);

    expect(records).toHaveLength(1);
    expect(records[0].skuId).toBe('AZURE-BLOB-HOT-LRS');
  });
});
