/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: fixture reads are resolved from repository-controlled test data; see docs/SECURITY-SUPPRESSIONS.md. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { InMemoryPricingCatalogReader } from '../common/in-memory-pricing-catalog.reader';
import { FetchLike } from '../common/http-client';
import { PricingCatalogRecord } from '../common/cloud-provider-adapter';
import { AwsProviderAdapter } from './aws-provider.adapter';

const fixture = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../..', relativePath), 'utf8')) as T;

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => JSON.stringify(body),
});

const awsBulkFixture = (relativePath: string) => {
  const getProducts = fixture<{ PriceList: string[] }>(relativePath);
  const products: Record<string, unknown> = {};
  const onDemand: Record<string, unknown> = {};
  const reserved: Record<string, unknown> = {};
  let publicationDate: string | undefined;

  for (const rawItem of getProducts.PriceList) {
    const item = JSON.parse(rawItem) as {
      product: { sku: string };
      terms: { OnDemand?: Record<string, unknown>; Reserved?: Record<string, unknown> };
      publicationDate?: string;
    };
    products[item.product.sku] = item.product;
    onDemand[item.product.sku] = item.terms.OnDemand ?? {};

    if (item.terms.Reserved) {
      reserved[item.product.sku] = item.terms.Reserved;
    }

    publicationDate = item.publicationDate ?? publicationDate;
  }

  return {
    products,
    terms: {
      OnDemand: onDemand,
      Reserved: reserved,
    },
    publicationDate,
  };
};

const emptyAwsBulkCatalog = {
  products: {},
  terms: {
    OnDemand: {},
    Reserved: {},
  },
  publicationDate: '2026-01-01T00:00:00Z',
};

const mixedEc2BulkCatalog = {
  products: {
    'AWS-EC2-T3SMALL': {
      sku: 'AWS-EC2-T3SMALL',
      productFamily: 'Compute Instance',
      attributes: {
        servicecode: 'AmazonEC2',
        servicename: 'Amazon Elastic Compute Cloud',
        location: 'US East (N. Virginia)',
        regionCode: 'us-east-1',
        instanceType: 't3.small',
        vcpu: '2',
        memory: '2 GiB',
      },
    },
    'AWS-DATA-TRANSFER-OUT': {
      sku: 'AWS-DATA-TRANSFER-OUT',
      productFamily: 'Data Transfer',
      attributes: {
        servicecode: 'AmazonEC2',
        servicename: 'AWS Data Transfer',
        location: 'US East (N. Virginia)',
        regionCode: 'us-east-1',
        transferType: 'AWS Outbound',
        usagetype: 'DataTransfer-Out-Bytes',
      },
    },
  },
  terms: {
    OnDemand: {
      'AWS-EC2-T3SMALL': {
        'AWS-EC2-T3SMALL.JRTCKXETXF': {
          effectiveDate: '2026-01-01T00:00:00Z',
          priceDimensions: {
            'AWS-EC2-T3SMALL.JRTCKXETXF.6YS6EN2CT7': {
              unit: 'Hrs',
              description: 'Linux t3.small instance hour',
              pricePerUnit: {
                USD: '0.0208000000',
              },
            },
          },
        },
      },
      'AWS-DATA-TRANSFER-OUT': {
        'AWS-DATA-TRANSFER-OUT.JRTCKXETXF': {
          effectiveDate: '2026-01-01T00:00:00Z',
          priceDimensions: {
            'AWS-DATA-TRANSFER-OUT.JRTCKXETXF.6YS6EN2CT7': {
              unit: 'GB',
              description: 'Data Transfer Out from Amazon EC2 to Internet',
              pricePerUnit: {
                USD: '0.0900000000',
              },
            },
          },
        },
      },
    },
    Reserved: {},
  },
  publicationDate: '2026-01-01T00:00:00Z',
};

const minimalNws = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-06-28T00:00:00.000Z',
  },
  workload: {
    type: 'web_app',
    region: {
      preference: 'us-east-1',
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
};

describe('AwsProviderAdapter', () => {
  it('normalizes public AWS Bulk Price List responses into pricing catalog records', async () => {
    const fetchClient = jest.fn(async () =>
      jsonResponse(awsBulkFixture('test/fixtures/pricing/aws/get-products-ec2.json')),
    ) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records).toEqual([
      expect.objectContaining({
        provider: 'aws',
        serviceCategory: 'compute',
        serviceName: 'Amazon Elastic Compute Cloud',
        skuId: 'AWS-EC2-T3SMALL',
        region: 'us-east-1',
        unit: 'Hrs',
        unitPriceUsd: 0.0208,
      }),
    ]);
    expect(records[0].attributes).toEqual(
      expect.objectContaining({
        pricingModel: 'on-demand',
        vcpu: 2,
        memoryGb: 2,
      }),
    );
    expect(fetchClient).toHaveBeenCalledWith(
      'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.json',
    );
  });

  it('stream-parses the bulk price list when the response exposes a body stream', async () => {
    // The real ~480MB EC2 index must be streamed, not buffered. Providing a body
    // stream (and a text() that throws) proves the streaming path is taken and
    // yields the same normalized records as the buffered path.
    const catalog = awsBulkFixture('test/fixtures/pricing/aws/get-products-ec2.json');
    const fetchClient = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: Readable.from(JSON.stringify(catalog)),
      text: async () => {
        throw new Error('streaming path must not buffer the body via text()');
      },
    })) as unknown as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records).toEqual([
      expect.objectContaining({
        provider: 'aws',
        serviceCategory: 'compute',
        skuId: 'AWS-EC2-T3SMALL',
        unit: 'Hrs',
        unitPriceUsd: 0.0208,
      }),
    ]);
    expect(records[0].attributes).toEqual(expect.objectContaining({ vcpu: 2, memoryGb: 2 }));
  });

  it('keeps only the standard Linux/Shared/Used/OnDemand EC2 SKU (excludes Windows/Dedicated/Spot/capacity-reservation)', async () => {
    const onDemandTerm = (sku: string, usd: string) => ({
      [`${sku}.OD`]: {
        effectiveDate: '2026-01-01T00:00:00Z',
        priceDimensions: {
          [`${sku}.OD.1`]: { unit: 'Hrs', description: 'hr', pricePerUnit: { USD: usd } },
        },
      },
    });
    const attrs = (extra: Record<string, string>) => ({
      servicecode: 'AmazonEC2',
      location: 'US East (N. Virginia)',
      regionCode: 'us-east-1',
      instanceType: 'm6i.large',
      vcpu: '2',
      memory: '8 GiB',
      operatingSystem: 'Linux',
      tenancy: 'Shared',
      preInstalledSw: 'NA',
      capacitystatus: 'Used',
      marketoption: 'OnDemand',
      ...extra,
    });
    const product = (sku: string, extra: Record<string, string>) => ({
      sku,
      productFamily: 'Compute Instance',
      attributes: attrs(extra),
    });
    const catalog = {
      products: {
        OK: product('OK', {}),
        WIN: product('WIN', { operatingSystem: 'Windows' }),
        DED: product('DED', { tenancy: 'Dedicated' }),
        SPOT: product('SPOT', { marketoption: 'Spot' }),
        CAPRES: product('CAPRES', { capacitystatus: 'AllocatedCapacityReservation' }),
      },
      terms: {
        OnDemand: {
          OK: onDemandTerm('OK', '0.1000000000'),
          WIN: onDemandTerm('WIN', '0.0500000000'),
          DED: onDemandTerm('DED', '0.0200000000'),
          SPOT: onDemandTerm('SPOT', '0.0100000000'),
          CAPRES: onDemandTerm('CAPRES', '0.0000000000'),
        },
        Reserved: {},
      },
      publicationDate: '2026-01-01T00:00:00Z',
    };
    const fetchClient = jest.fn(async () => jsonResponse(catalog)) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records.map((r) => r.skuId)).toEqual(['OK']);
  });

  it('normalizes AWS reserved terms when hourly recurring dimensions exist', async () => {
    const bulkCatalog = awsBulkFixture('test/fixtures/pricing/aws/get-products-ec2.json') as {
      terms: { Reserved: Record<string, unknown> };
    };
    bulkCatalog.terms.Reserved = {
      'AWS-EC2-T3SMALL': {
        'AWS-EC2-T3SMALL.6QCMYABX3D': {
          effectiveDate: '2026-01-01T00:00:00Z',
          termAttributes: {
            LeaseContractLength: '3yr',
            PurchaseOption: 'No Upfront',
          },
          priceDimensions: {
            'AWS-EC2-T3SMALL.6QCMYABX3D.HRS': {
              unit: 'Hrs',
              description: 'Linux t3.small three-year reserved hourly recurring charge',
              pricePerUnit: {
                USD: '0.0100000000',
              },
            },
          },
        },
      },
    };
    const fetchClient = jest.fn(async () => jsonResponse(bulkCatalog)) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skuId: expect.stringContaining('reserved-3yr'),
          unitPriceUsd: 0.01,
          attributes: expect.objectContaining({
            pricingModel: 'reserved-3yr',
            PurchaseOption: 'No Upfront',
          }),
        }),
      ]),
    );
  });

  it('prices a workload from cached AWS catalog records', async () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'aws',
        serviceCategory: 'compute',
        serviceName: 'Amazon EC2 t3.small',
        skuId: 'AWS-EC2-T3SMALL',
        region: 'us-east-1',
        unit: 'Hrs',
        unitPriceUsd: 0.0208,
        effectiveDate: '2026-01-01T00:00:00Z',
        fetchedAt: '2026-06-28T00:00:00.000Z',
      },
    ];
    const adapter = new AwsProviderAdapter(new InMemoryPricingCatalogReader(records), 'us-east-1');

    const result = await adapter.priceWorkload(minimalNws);

    expect(result.providerId).toBe('aws');
    expect(result.baseMonthlyCostUsd).toBe(30.37);
    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        category: 'compute',
        skuId: 'AWS-EC2-T3SMALL',
      }),
    );
  });

  it('filters refreshed AWS pricing by requested service id', async () => {
    const fetchClient = jest.fn(async () =>
      jsonResponse(awsBulkFixture('test/fixtures/pricing/aws/get-products-s3.json')),
    ) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
    );

    const records = await adapter.refreshLivePricing(['AWS-S3-STANDARD']);

    expect(records).toHaveLength(1);
    expect(records[0].skuId).toBe('AWS-S3-STANDARD');
  });

  it('separates EC2 instance compute rows from EC2 data-transfer network rows', async () => {
    const computeFetchClient = jest.fn(async () => jsonResponse(mixedEc2BulkCatalog)) as FetchLike;
    const computeAdapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      computeFetchClient,
    );

    const computeRecords = await computeAdapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(computeRecords.map((record) => record.skuId)).toEqual(['AWS-EC2-T3SMALL']);

    const networkFetchClient = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(emptyAwsBulkCatalog))
      .mockResolvedValueOnce(jsonResponse(mixedEc2BulkCatalog)) as FetchLike;
    const networkAdapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      networkFetchClient,
    );

    const networkRecords = await networkAdapter.refreshPricingCatalog({
      categories: ['network'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(networkRecords).toEqual([
      expect.objectContaining({
        provider: 'aws',
        serviceCategory: 'network',
        serviceName: 'AWS Data Transfer',
        skuId: 'AWS-DATA-TRANSFER-OUT',
        region: 'us-east-1',
        unit: 'GB',
        unitPriceUsd: 0.09,
      }),
    ]);
    expect(networkRecords[0].attributes).toEqual(
      expect.objectContaining({
        rawServiceCode: 'AmazonEC2',
        transferType: 'AWS Outbound',
      }),
    );
  });

  it('drops AWS records outside the requested region or without a USD price', async () => {
    const noPriceRecord = {
      products: {
        'AWS-EC2-NOPRICE': {
          sku: 'AWS-EC2-NOPRICE',
          productFamily: 'Compute Instance',
          attributes: {
            servicename: 'Amazon Elastic Compute Cloud',
            location: 'US East (N. Virginia)',
            regionCode: 'us-east-1',
          },
        },
      },
      terms: {
        OnDemand: {
          'AWS-EC2-NOPRICE': {},
        },
      },
    };
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(awsBulkFixture('test/fixtures/pricing/aws/get-products-ec2.json')),
      )
      .mockResolvedValueOnce(jsonResponse(noPriceRecord)) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
    );

    await expect(
      adapter.refreshPricingCatalog({
        categories: ['compute'],
        region: 'us-west-2',
      }),
    ).resolves.toEqual([]);
    await expect(
      adapter.refreshPricingCatalog({
        categories: ['compute'],
        region: 'us-east-1',
      }),
    ).resolves.toEqual([]);
  });

  it('uses AWS fallback service names and fetched-at effective dates', async () => {
    const fallbackRecord = {
      products: {
        'AWS-FALLBACK-SKU': {
          sku: 'AWS-FALLBACK-SKU',
          productFamily: 'Compute Instance',
          attributes: {
            servicecode: 'AmazonEC2',
            location: 'US East (N. Virginia)',
            vcpu: 'not-a-number',
          },
        },
      },
      terms: {
        OnDemand: {
          'AWS-FALLBACK-SKU': {
            term: {
              priceDimensions: {
                dimension: {
                  unit: 'Hrs',
                  description: 'Fallback compute',
                  pricePerUnit: {
                    USD: '0.01',
                  },
                },
              },
            },
          },
        },
      },
    };
    const fetchClient = jest.fn(async () => jsonResponse(fallbackRecord)) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshPricingCatalog({
      categories: ['compute'],
      fetchedAt: '2026-06-28T00:00:00.000Z',
    });

    expect(records[0]).toEqual(
      expect.objectContaining({
        serviceName: 'AmazonEC2',
        region: 'us-east-1',
        effectiveDate: '2026-06-28T00:00:00.000Z',
      }),
    );
    expect(records[0].attributes).toEqual(
      expect.objectContaining({
        vcpu: undefined,
      }),
    );
  });

  it('does not require AWS credentials for public pricing refresh', async () => {
    const fetchClient = jest.fn(async () =>
      jsonResponse(awsBulkFixture('test/fixtures/pricing/aws/get-products-ec2.json')),
    ) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      fetchClient,
    );

    await expect(adapter.refreshPricingCatalog({ categories: ['compute'] })).resolves.toHaveLength(
      1,
    );
  });
});
