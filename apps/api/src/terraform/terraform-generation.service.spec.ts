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
    expect(result.generationProfile).toMatchObject({
      runtimeTarget: 'vm',
      networkTopology: 'private',
      availabilityMode: 'multi-az',
      policyPackIncluded: true,
      moduleScaffoldIncluded: true,
    });
    expect(result.resourceSummary).toMatchObject({
      computeInstances: 2,
      objectStorageBuckets: 1,
      blockStorageVolumes: 1,
      relationalDatabases: 1,
      loadBalancers: 1,
      multiAz: true,
    });
    expect(result.validation.status).toBe('passed');
    expect(result.validation.executionMode).toBe('static-plus-policy');
    expect(file(result, 'versions.tf')).toContain('hashicorp/aws');
    expect(file(result, 'versions.tf')).toContain('~> 5.0');
    expect(file(result, 'main.tf')).toContain('resource "aws_instance" "app"');
    expect(file(result, 'main.tf')).toContain('metadata_options');
    expect(file(result, 'main.tf')).toContain('resource "aws_subnet" "private"');
    expect(file(result, 'main.tf')).toContain('aws_iam_instance_profile');
    expect(file(result, 'main.tf')).toContain('publicly_accessible    = false');
    expect(file(result, 'main.tf')).toContain('storage_encrypted      = true');
    expect(file(result, 'backend.tf.example')).toContain('backend "s3"');
    expect(file(result, 'Makefile')).toContain('terraform validate');
    expect(file(result, 'FRAMEWORK-ALIGNMENT.md')).toContain('Cloud Framework Alignment');
    expect(file(result, 'FRAMEWORK-ALIGNMENT.md')).toContain('AWS Well-Architected');
    expect(file(result, '.tflint.hcl')).toContain('plugin "terraform"');
    expect(file(result, 'policies/terraform-plan.rego')).toContain('publicly accessible');
    expect(file(result, 'tests/static_validation.tftest.hcl')).toContain(
      'static_configuration_contract',
    );
    expect(file(result, 'modules/README.md')).toContain('Module Boundary Review');
    expect(file(result, 'variables.tf')).toContain('sensitive   = true');
    expect(file(result, 'variables.tf')).toContain('variable "network_topology"');
    expect(file(result, 'variables.tf')).toContain('variable "enable_public_load_balancer"');
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
    expect(result.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'framework-alignment-pack', status: 'passed' }),
        expect.objectContaining({ id: 'topology-aware-ingress', status: 'passed' }),
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
    expect(file(result, 'main.tf')).toContain('identity {');
    expect(file(result, 'main.tf')).toContain('public_network_access_enabled = false');
    expect(file(result, 'main.tf')).toContain('private_dns_zone_id');
    expect(file(result, 'main.tf')).toContain(
      'var.network_topology == "public" ? "Internet" : "VirtualNetwork"',
    );
    expect(file(result, 'FRAMEWORK-ALIGNMENT.md')).toContain('Azure Cloud Adoption Framework');
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
    expect(file(result, 'main.tf')).toContain('google_service_account');
    expect(file(result, 'main.tf')).toContain('google_service_networking_connection');
    expect(file(result, 'main.tf')).toContain('public_access_prevention    = "enforced"');
    expect(file(result, 'main.tf')).toContain('var.network_topology == "public" ? ["0.0.0.0/0"]');
    expect(file(result, 'main.tf')).toContain('resource "google_sql_database_instance" "main"');
    expect(file(result, 'backend.tf.example')).toContain('backend "gcs"');
    expect(file(result, 'variables.tf')).toContain('"costcenter" = "finops"');
    expect(file(result, 'FRAMEWORK-ALIGNMENT.md')).toContain('Google Cloud Architecture Framework');
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

  it('keeps non-VM runtime targets as explicit module-boundary work', () => {
    const result = service.generate({
      targetCloud: 'azure',
      nws: validNws,
      workspaceName: 'Revenue Portal',
      options: {
        runtimeTarget: 'kubernetes',
        networkTopology: 'landing-zone',
        availabilityMode: 'active-active',
      },
    });

    expect(result.generationProfile).toMatchObject({
      runtimeTarget: 'kubernetes',
      networkTopology: 'landing-zone',
      availabilityMode: 'active-active',
    });
    expect(result.assumptions.join(' ')).toContain('Runtime target kubernetes was requested');
    expect(result.serviceMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: 'kubernetes runtime',
          terraformResource: 'module.aks (module boundary)',
          confidence: 'manual-review',
        }),
      ]),
    );
    expect(file(result, 'modules/README.md')).toContain('Runtime target: kubernetes');
  });
});

function file(result: ReturnType<TerraformGenerationService['generate']>, path: string): string {
  const match = result.files.find((candidate) => candidate.path === path);

  if (!match) {
    throw new Error(`Expected generated file ${path}`);
  }

  return match.content;
}
