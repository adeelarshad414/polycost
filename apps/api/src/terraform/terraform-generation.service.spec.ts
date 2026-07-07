import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { TerraformGenerationService } from './terraform-generation.service';

const validNws: NormalizedWorkloadSpec = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-07-07T00:00:00.000Z',
  },
  workload: {
    name: 'Revenue Portal',
    type: 'web_app',
    expectedUsers: {
      dailyActiveUsers: 1200,
      peakConcurrentUsers: 120,
    },
    region: {
      preference: 'us-east',
      isDefault: false,
    },
  },
  compute: [
    {
      role: 'web',
      instanceFamily: 'general-purpose',
      vcpu: 4,
      memoryGb: 16,
      instanceCount: 2,
      scalingType: 'fixed',
    },
  ],
  storage: [
    {
      role: 'uploads',
      type: 'object',
      sizeGb: 500,
      accessPattern: 'frequent',
    },
    {
      role: 'app disk',
      type: 'block',
      sizeGb: 100,
    },
  ],
  database: [
    {
      role: 'primary',
      engine: 'postgres',
      sizeGb: 80,
      highAvailability: true,
      backupStorageGb: 80,
      backupRetentionDays: 30,
    },
  ],
  network: {
    estimatedMonthlyEgressGb: 1000,
    cdn: true,
    loadBalancer: true,
  },
  availability: {
    multiAz: true,
    multiRegion: false,
    slaTarget: '99.9%',
  },
  workloadProfile: {
    environment: 'production',
    tags: [
      {
        key: 'CostCenter',
        value: 'finops',
      },
    ],
  },
};

describe('TerraformGenerationService', () => {
  const service = new TerraformGenerationService();

  it('generates a traceable AWS Terraform bundle with pinned provider and secure defaults', () => {
    const result = service.generate({
      targetCloud: 'aws',
      nws: validNws,
      workspaceName: 'Revenue Portal',
    });

    expect(result.targetCloud).toBe('aws');
    expect(result.bundleName).toBe('revenue-portal-aws-terraform');
    expect(result.region).toBe('us-east-1');
    expect(result.resourceSummary).toMatchObject({
      computeInstances: 2,
      objectStorageBuckets: 1,
      blockStorageVolumes: 1,
      relationalDatabases: 1,
      loadBalancers: 1,
      multiAz: true,
    });
    expect(result.validation.status).toBe('passed');
    expect(result.validation.executionMode).toBe('static');
    expect(file(result, 'versions.tf')).toContain('hashicorp/aws');
    expect(file(result, 'versions.tf')).toContain('~> 5.0');
    expect(file(result, 'main.tf')).toContain('resource "aws_instance" "app"');
    expect(file(result, 'main.tf')).toContain('metadata_options');
    expect(file(result, 'main.tf')).toContain('storage_encrypted      = true');
    expect(file(result, 'backend.tf.example')).toContain('backend "s3"');
    expect(file(result, 'variables.tf')).toContain('sensitive   = true');
    expect(file(result, 'variables.tf')).toContain('variable "database_password"');
    expect(
      file(result, 'variables.tf')
        .split('variable "database_password"')[1]
        .split('variable "database_multi_az"')[0],
    ).not.toContain('default');
    expect(result.serviceMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: 'compute',
          terraformResource: 'aws_instance.app',
          confidence: 'direct',
        }),
      ]),
    );
  });

  it('generates an Azure bundle with identity-based provider config and region override', () => {
    const result = service.generate({
      targetCloud: 'azure',
      nws: validNws,
      workspaceName: 'Revenue Portal',
      region: 'West Europe',
    });

    expect(result.region).toBe('West Europe');
    expect(result.validation.status).toBe('passed');
    expect(file(result, 'versions.tf')).toContain('hashicorp/azurerm');
    expect(file(result, 'providers.tf')).toContain('features');
    expect(file(result, 'main.tf')).toContain('resource "azurerm_linux_virtual_machine" "app"');
    expect(file(result, 'main.tf')).toContain('disable_password_authentication = true');
    expect(file(result, 'backend.tf.example')).toContain('backend "azurerm"');
    expect(result.securityNotes.join(' ')).toContain('SSH public keys');
  });

  it('generates a GCP bundle with labels, Shielded VM, and Cloud SQL mapping', () => {
    const result = service.generate({
      targetCloud: 'gcp',
      nws: validNws,
      workspaceName: 'Revenue Portal',
    });

    expect(result.region).toBe('us-central1');
    expect(result.validation.status).toBe('passed');
    expect(file(result, 'versions.tf')).toContain('hashicorp/google');
    expect(file(result, 'main.tf')).toContain('resource "google_compute_instance" "app"');
    expect(file(result, 'main.tf')).toContain('shielded_instance_config');
    expect(file(result, 'main.tf')).toContain('resource "google_sql_database_instance" "main"');
    expect(file(result, 'backend.tf.example')).toContain('backend "gcs"');
    expect(file(result, 'variables.tf')).toContain('"costcenter" = "finops"');
  });

  it('surfaces explicit assumptions instead of overclaiming unsupported resources', () => {
    const result = service.generate({
      targetCloud: 'aws',
      nws: {
        ...validNws,
        availability: {
          multiAz: true,
          multiRegion: true,
        },
        storage: [
          ...validNws.storage,
          {
            role: 'shared assets',
            type: 'file',
            sizeGb: 200,
          },
        ],
        database: [
          ...validNws.database,
          {
            role: 'cache',
            engine: 'redis',
            highAvailability: true,
          },
        ],
      },
    });

    expect(result.assumptions.join(' ')).toContain('File storage was detected');
    expect(result.assumptions.join(' ')).toContain('NoSQL/cache/search/analytics');
    expect(result.assumptions.join(' ')).toContain('Multi-region was requested');
  });
});

function file(result: ReturnType<TerraformGenerationService['generate']>, path: string): string {
  const match = result.files.find((candidate) => candidate.path === path);

  if (!match) {
    throw new Error(`Expected generated file ${path}`);
  }

  return match.content;
}
