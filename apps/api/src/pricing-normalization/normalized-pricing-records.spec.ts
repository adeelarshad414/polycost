import { PricingCatalogRecord } from '../adapters/common/cloud-provider-adapter';
import { normalizePricingCatalogRecords } from './normalized-pricing-records';

const fetchedAt = '2026-06-28T00:00:00.000Z';
const effectiveDate = '2026-01-01T00:00:00.000Z';

describe('normalizePricingCatalogRecords', () => {
  it('normalizes AWS and Azure compute catalog records into comparable SKU snapshots', () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'aws',
        serviceCategory: 'compute',
        serviceName: 'Amazon EC2',
        skuId: 'AWS-EC2-T3SMALL',
        region: 'us-east-1',
        unit: 'Hrs',
        unitPriceUsd: 0.0208,
        attributes: {
          pricingModel: 'on-demand',
          instanceType: 't3.small',
          vcpu: 2,
          memoryGb: 2,
        },
        effectiveDate,
        fetchedAt,
      },
      {
        provider: 'azure',
        serviceCategory: 'compute',
        serviceName: 'Virtual Machines',
        skuId: 'AZURE-D2S-V5',
        region: 'eastus',
        unit: '1 Hour',
        unitPriceUsd: 0.0416,
        attributes: {
          pricingModel: 'on-demand',
          armSkuName: 'Standard_D2s_v5',
          vcpu: 2,
          memoryGb: 8,
        },
        effectiveDate,
        fetchedAt,
      },
    ];

    const normalized = normalizePricingCatalogRecords(records);

    expect(normalized.compute).toEqual([
      expect.objectContaining({
        provider: 'aws',
        providerSkuId: 't3.small',
        family: 'burstable',
        vcpu: 2,
        memoryGb: 2,
        term: 'on_demand',
        pricePerHour: 0.0208,
      }),
      expect.objectContaining({
        provider: 'azure',
        providerSkuId: 'Standard_D2s_v5',
        family: 'general-purpose',
        vcpu: 2,
        memoryGb: 8,
        term: 'on_demand',
        pricePerHour: 0.0416,
      }),
    ]);
    expect(normalized.skipped).toBe(0);
  });

  it('synthesizes GCP standard machine prices from real core and RAM component SKUs', () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'gcp',
        serviceCategory: 'compute',
        serviceName: 'Compute Engine',
        skuId: 'GCP-E2-CORE',
        skuDescription: 'E2 Instance Core running in Americas',
        region: 'us-central1',
        unit: 'hour',
        unitPriceUsd: 0.02,
        attributes: {
          resourceGroup: 'E2Standard',
          pricingModel: 'on-demand',
        },
        effectiveDate,
        fetchedAt,
      },
      {
        provider: 'gcp',
        serviceCategory: 'compute',
        serviceName: 'Compute Engine',
        skuId: 'GCP-E2-RAM',
        skuDescription: 'E2 Instance Ram running in Americas',
        region: 'us-central1',
        unit: 'gibibyte hour',
        unitPriceUsd: 0.003,
        attributes: {
          resourceGroup: 'E2Standard',
          pricingModel: 'on-demand',
        },
        effectiveDate,
        fetchedAt,
      },
    ];

    const normalized = normalizePricingCatalogRecords(records);

    expect(normalized.compute).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'gcp',
          providerSkuId: 'e2-standard-4',
          family: 'general-purpose',
          vcpu: 4,
          memoryGb: 16,
          pricePerHour: 0.128,
        }),
      ]),
    );
  });

  it('normalizes storage and egress records into cache tables', () => {
    const records: PricingCatalogRecord[] = [
      {
        provider: 'aws',
        serviceCategory: 'storage',
        serviceName: 'Amazon S3',
        skuId: 'AWS-S3-STANDARD',
        skuDescription: 'S3 Standard storage',
        region: 'us-east-1',
        unit: 'GB-Mo',
        unitPriceUsd: 0.023,
        attributes: {
          storageClass: 'General Purpose',
        },
        effectiveDate,
        fetchedAt,
      },
      {
        provider: 'gcp',
        serviceCategory: 'network',
        serviceName: 'Cloud CDN',
        skuId: 'GCP-EGRESS',
        region: 'us-central1',
        unit: 'GiBy',
        unitPriceUsd: 0,
        attributes: {
          egressTiers: [
            { startUsageAmount: 0, unitPriceUsd: 0.12 },
            { startUsageAmount: 10240, unitPriceUsd: 0.08 },
          ],
        },
        effectiveDate,
        fetchedAt,
      },
    ];

    const normalized = normalizePricingCatalogRecords(records);

    expect(normalized.storage).toEqual([
      {
        provider: 'aws',
        region: 'us-east-1',
        tier: 'standard',
        pricePerGbMonth: 0.023,
        currency: 'USD',
        effectiveDate,
      },
    ]);
    expect(normalized.egress).toEqual([
      {
        provider: 'gcp',
        region: 'us-central1',
        tierFromGb: 0,
        tierToGb: 10240,
        pricePerGb: 0.12,
        effectiveDate,
      },
      {
        provider: 'gcp',
        region: 'us-central1',
        tierFromGb: 10240,
        pricePerGb: 0.08,
        effectiveDate,
      },
    ]);
  });

  it('classifies local seed compute rows without treating provider prefixes as real families', () => {
    const normalized = normalizePricingCatalogRecords([
      {
        provider: 'azure',
        serviceCategory: 'compute',
        serviceName: 'Local Seed Azure General Compute 2 vCPU / 4 GB',
        skuId: 'local-seed-azure-compute-2x4',
        region: 'eastus',
        unit: 'hour',
        unitPriceUsd: 0.0416,
        attributes: {
          source: 'local_seed',
          vcpu: 2,
          memoryGb: 4,
        },
        effectiveDate,
        fetchedAt,
      },
      {
        provider: 'aws',
        serviceCategory: 'storage',
        serviceName: 'Local Seed Amazon EFS Standard',
        skuId: 'local-seed-aws-storage-file',
        region: 'us-east-1',
        unit: 'GB-Mo',
        unitPriceUsd: 0.3,
        attributes: {
          source: 'local_seed',
          type: 'file',
        },
        effectiveDate,
        fetchedAt,
      },
    ]);

    expect(normalized.compute).toEqual([
      expect.objectContaining({
        provider: 'azure',
        providerSkuId: 'local-seed-azure-compute-2x4',
        family: 'general-purpose',
      }),
    ]);
    expect(normalized.storage).toEqual([]);
  });
});
