/* eslint-disable security/detect-non-literal-fs-filename -- Reviewed 2026-07-06: fixture reads are resolved from repository-controlled test data; see docs/SECURITY-SUPPRESSIONS.md. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json',
    );
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
