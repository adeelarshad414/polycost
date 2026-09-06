/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: fixture reads are resolved from repository-controlled test data; see docs/SECURITY-SUPPRESSIONS.md. */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InMemoryPricingCatalogReader } from '../common/in-memory-pricing-catalog.reader.js';
import { FetchLike } from '../common/http-client.js';
import { PricingCatalogRecord } from '../common/cloud-provider-adapter.js';
import { AzureProviderAdapter, parseAzureUnitOfMeasure } from './azure-provider.adapter.js';

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
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/azure/retail-compute.json')),
      )
      .mockResolvedValueOnce(jsonResponse({ Items: [] }));
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
        unit: 'Hour',
        unitPriceUsd: 0.0416,
        attributes: expect.objectContaining({
          pricingModel: 'on-demand',
          vcpu: 2,
          memoryGb: 8,
          unitOfMeasure: '1 Hour',
          unitOfMeasureQuantity: 1,
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
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(firstPage))
      .mockResolvedValueOnce(jsonResponse(secondPage));
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

  it('refuses a NextPageLink that points off the pinned Azure host (M-B1)', async () => {
    const maliciousPage = {
      Items: [],
      // A compromised/spoofed feed points the next page at the cloud metadata
      // service; the adapter must refuse to follow it.
      NextPageLink: 'https://169.254.169.254/api/retail/prices?page=2',
    };
    const fetchClient = jest.fn<FetchLike>().mockResolvedValue(jsonResponse(maliciousPage));
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    await expect(adapter.refreshPricingCatalog({ categories: ['storage'] })).rejects.toThrow(
      /possible SSRF/,
    );
    // The pinned first page was fetched, but the metadata host never was.
    expect(fetchClient).not.toHaveBeenCalledWith(expect.stringContaining('169.254.169.254'));
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

  it('divides block-priced meters ("N Hours"/"N GB") to a true per-unit rate', async () => {
    // Regression for the unit-of-measure blocker: a meter priced per "100 Hours"
    // must be normalized to per-hour, not stored as a 100x-inflated hourly rate.
    const blockMeter = {
      Items: [
        {
          currencyCode: 'USD',
          retailPrice: 3.2,
          unitPrice: 3.2, // price for the whole 100-hour block
          armRegionName: 'eastus',
          effectiveStartDate: '2026-01-01T00:00:00Z',
          meterId: 'azure-meter-block',
          meterName: 'Standard Data Processed',
          productId: 'azure-product-block',
          skuId: 'AZURE-BLOCK-100H',
          productName: 'Some Metered Service',
          skuName: 'Std S1',
          serviceName: 'Some Service',
          serviceFamily: 'Compute',
          unitOfMeasure: '100 Hours',
          type: 'Consumption',
          isPrimaryMeterRegion: true,
          armSkuName: 'Standard_S1',
        },
      ],
    };
    const fetchClient = jest
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(blockMeter))
      .mockResolvedValueOnce(jsonResponse({ Items: [] }));
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({ categories: ['compute'] });

    expect(records).toHaveLength(1);
    // 3.2 / 100 = 0.032 per hour, NOT 3.2.
    expect(records[0].unitPriceUsd).toBeCloseTo(0.032, 6);
    expect(records[0].unit).toBe('Hours');
    expect(records[0].attributes?.unitOfMeasureQuantity).toBe(100);
    expect(records[0].attributes?.rawBlockUnitPriceUsd).toBe(3.2);
  });

  describe('parseAzureUnitOfMeasure', () => {
    it.each([
      ['1 Hour', 1, 'Hour'],
      ['10 Hours', 10, 'Hours'],
      ['100 Hours', 100, 'Hours'],
      ['1 GB/Month', 1, 'GB/Month'],
      ['100 GB', 100, 'GB'],
      ['1/Month', 1, '/Month'],
      ['GB', 1, 'GB'],
      ['', 1, ''],
    ])('parses %j into quantity %d and unit %j', (input, quantity, unit) => {
      expect(parseAzureUnitOfMeasure(input as string)).toEqual({ quantity, unit });
    });

    it('never divides by zero or drops the unit on malformed input', () => {
      expect(parseAzureUnitOfMeasure('0 Hours')).toEqual({ quantity: 1, unit: '0 Hours' });
      expect(parseAzureUnitOfMeasure(undefined)).toEqual({ quantity: 1, unit: '' });
    });
  });

  it('does not let an undefined-spec cheap row out-rank a properly-specced instance', async () => {
    // Regression: a compute row missing memoryGb must not masquerade as the
    // "smallest fit" and win on price over a row that actually declares 2/8.
    const records: PricingCatalogRecord[] = [
      {
        provider: 'azure',
        serviceCategory: 'compute',
        serviceName: 'Underspecified VM',
        skuId: 'AZURE-UNKNOWN-CHEAP',
        region: 'eastus',
        unit: '1 Hour',
        unitPriceUsd: 0.02,
        attributes: { vcpu: 2, pricingModel: 'on-demand' }, // no memoryGb
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
      {
        provider: 'azure',
        serviceCategory: 'compute',
        serviceName: 'Virtual Machines D2s v5',
        skuId: 'AZURE-D2S-V5',
        region: 'eastus',
        unit: '1 Hour',
        unitPriceUsd: 0.096,
        attributes: { vcpu: 2, memoryGb: 8, pricingModel: 'on-demand' },
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
    ];
    const adapter = new AzureProviderAdapter(new InMemoryPricingCatalogReader(records), 'eastus');

    const result = await adapter.priceWorkload({
      schemaVersion: '1.0',
      metadata: { sourceType: 'structured_form', createdAt: '2026-06-28T00:00:00.000Z' },
      workload: { type: 'web_app', region: { preference: 'eastus', isDefault: false } },
      compute: [{ role: 'web', vcpu: 2, memoryGb: 8, instanceCount: 2, scalingType: 'fixed' }],
      storage: [],
      database: [],
      network: { cdn: false, loadBalancer: false },
      availability: { multiAz: false, multiRegion: false },
    });

    // Picks the properly-specced 2/8 D2s v5 (0.096 x 2 x 730 = 140.16),
    // NOT the cheaper undefined-memory row (0.02 -> 29.20).
    expect(result.lineItems[0].skuId).toBe('AZURE-D2S-V5');
    expect(result.baseMonthlyCostUsd).toBe(140.16);
  });

  it('does not overflow the stack on a very large page (regression for push(...spread))', async () => {
    // The old code did `records.push(...items.map(...))`; an array beyond ~125k
    // elements throws "Maximum call stack size exceeded" when spread as call
    // arguments. Azure's unfiltered global catalog easily exceeds that.
    const N = 150_000;
    const items = Array.from({ length: N }, (_, i) => ({
      currencyCode: 'USD',
      retailPrice: 0.01,
      unitPrice: 0.01,
      armRegionName: 'eastus',
      effectiveStartDate: '2026-01-01T00:00:00Z',
      meterId: `m${i}`,
      meterName: `Meter ${i}`,
      productId: `p${i}`,
      skuId: `SKU-${i}`,
      productName: 'Virtual Machines Dsv5 Series',
      skuName: 'D2s v5',
      serviceName: 'Virtual Machines',
      serviceFamily: 'Compute',
      unitOfMeasure: '1 Hour',
      type: 'Consumption',
      isPrimaryMeterRegion: true,
      armSkuName: 'Standard_D2s_v5',
    }));
    const fetchClient = jest
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ Items: items }))
      .mockResolvedValue(jsonResponse({ Items: [] }));
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records).toHaveLength(N);
  }, 30_000);

  it('excludes Spot / Low-Priority / DevTest meters from the on-demand catalog', async () => {
    const base = {
      currencyCode: 'USD',
      retailPrice: 0.096,
      unitPrice: 0.096,
      armRegionName: 'eastus',
      effectiveStartDate: '2026-01-01T00:00:00Z',
      productId: 'p',
      productName: 'Virtual Machines Dsv5 Series',
      serviceName: 'Virtual Machines',
      serviceFamily: 'Compute',
      unitOfMeasure: '1 Hour',
      isPrimaryMeterRegion: true,
      armSkuName: 'Standard_D2s_v5',
    };
    const page = {
      Items: [
        {
          ...base,
          meterId: 'm1',
          meterName: 'D2s v5',
          skuId: 'OD',
          skuName: 'D2s v5',
          type: 'Consumption',
        },
        {
          ...base,
          meterId: 'm2',
          meterName: 'D2s v5 Spot',
          skuId: 'SPOT',
          skuName: 'D2s v5 Spot',
          unitPrice: 0.0038,
          type: 'Consumption',
        },
        {
          ...base,
          meterId: 'm3',
          meterName: 'D2s v5 Low Priority',
          skuId: 'LOW',
          skuName: 'D2s v5 Low Priority',
          unitPrice: 0.02,
          type: 'Consumption',
        },
        {
          ...base,
          meterId: 'm4',
          meterName: 'D2s v5',
          skuId: 'DEVTEST',
          skuName: 'D2s v5',
          type: 'DevTestConsumption',
        },
      ],
    };
    const fetchClient = jest
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValue(jsonResponse({ Items: [] }));
    const adapter = new AzureProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'eastus',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({ categories: ['compute'] });

    // Only the true on-demand meter survives.
    expect(records.map((r) => r.skuId)).toEqual(['OD']);
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
