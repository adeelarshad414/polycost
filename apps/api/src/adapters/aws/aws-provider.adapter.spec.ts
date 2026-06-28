import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SecretsReader } from '../../secrets/secrets.service';
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

const secretsReader = (): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'access_key_id') {
      return 'test-access-key';
    }

    if (key === 'secret_access_key') {
      return 'test-secret-key';
    }

    throw new Error('missing optional secret');
  }),
});

const secretsReaderWithSessionToken = (): SecretsReader => ({
  getSecret: jest.fn(async (_path, key) => {
    if (key === 'access_key_id') {
      return 'test-access-key';
    }

    if (key === 'secret_access_key') {
      return 'test-secret-key';
    }

    if (key === 'session_token') {
      return 'test-session-token';
    }

    throw new Error('missing secret');
  }),
});

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
  it('normalizes AWS GetProducts responses into pricing catalog records', async () => {
    const fetchClient = jest.fn(async () =>
      jsonResponse(fixture('test/fixtures/pricing/aws/get-products-ec2.json')),
    ) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
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
        vcpu: 2,
        memoryGb: 2,
      }),
    );
    expect(fetchClient).toHaveBeenCalledWith(
      'https://api.pricing.us-east-1.amazonaws.com',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: expect.stringContaining('AWS4-HMAC-SHA256'),
          'x-amz-target': 'AWSPriceListService.GetProducts',
        }),
      }),
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
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader(records),
      'us-east-1',
      secretsReader(),
    );

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

  it('filters live AWS pricing by requested service id', async () => {
    const fetchClient = jest.fn(async () =>
      jsonResponse(fixture('test/fixtures/pricing/aws/get-products-s3.json')),
    ) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      secretsReader(),
      fetchClient,
      () => new Date('2026-06-28T00:00:00.000Z'),
    );

    const records = await adapter.refreshLivePricing(['AWS-S3-STANDARD']);

    expect(records).toHaveLength(1);
    expect(records[0].skuId).toBe('AWS-S3-STANDARD');
  });

  it('drops AWS records outside the requested region or without a USD price', async () => {
    const noPriceRecord = {
      FormatVersion: 'aws_v1',
      PriceList: [
        JSON.stringify({
          product: {
            sku: 'AWS-EC2-NOPRICE',
            productFamily: 'Compute Instance',
            attributes: {
              servicename: 'Amazon Elastic Compute Cloud',
              location: 'US East (N. Virginia)',
              regionCode: 'us-east-1',
            },
          },
          serviceCode: 'AmazonEC2',
          terms: {
            OnDemand: {},
          },
        }),
      ],
    };
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/aws/get-products-ec2.json')),
      )
      .mockResolvedValueOnce(jsonResponse(noPriceRecord)) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      secretsReader(),
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

  it('follows AWS pagination and includes optional session tokens', async () => {
    const fetchClient = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          FormatVersion: 'aws_v1',
          PriceList: [],
          NextToken: 'aws-page-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(fixture('test/fixtures/pricing/aws/get-products-ec2.json')),
      ) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      secretsReaderWithSessionToken(),
      fetchClient,
    );

    const records = await adapter.refreshPricingCatalog({ categories: ['compute'] });

    expect(records).toHaveLength(1);
    expect(fetchClient).toHaveBeenNthCalledWith(
      2,
      'https://api.pricing.us-east-1.amazonaws.com',
      expect.objectContaining({
        body: expect.stringContaining('aws-page-2'),
        headers: expect.objectContaining({
          'x-amz-security-token': 'test-session-token',
        }),
      }),
    );
  });

  it('uses AWS fallback service names and fetched-at effective dates', async () => {
    const fallbackRecord = {
      FormatVersion: 'aws_v1',
      PriceList: [
        JSON.stringify({
          product: {
            sku: 'AWS-FALLBACK-SKU',
            attributes: {
              servicecode: 'AmazonEC2',
              location: 'US East (N. Virginia)',
              vcpu: 'not-a-number',
            },
          },
          serviceCode: 'AmazonEC2',
          terms: {
            OnDemand: {
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
        }),
      ],
    };
    const fetchClient = jest.fn(async () => jsonResponse(fallbackRecord)) as FetchLike;
    const adapter = new AwsProviderAdapter(
      new InMemoryPricingCatalogReader([]),
      'us-east-1',
      secretsReader(),
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

  it('fails clearly when required AWS credentials are unavailable', async () => {
    const adapter = new AwsProviderAdapter(new InMemoryPricingCatalogReader([]), 'us-east-1', {
      getSecret: jest.fn(async () => {
        throw new Error('missing');
      }),
    });

    await expect(adapter.refreshPricingCatalog({ categories: ['compute'] })).rejects.toThrow(
      'missing required AWS pricing credential access_key_id',
    );
  });
});
