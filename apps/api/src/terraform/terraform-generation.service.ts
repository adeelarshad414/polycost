import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { DatabaseComponent, NormalizedWorkloadSpec, StorageComponent } from '../nws/nws.types';
import { NWSValidator } from '../nws/nws-validator';
import {
  TerraformBundleArchive,
  TerraformGeneratedFile,
  TerraformGenerateInput,
  TerraformGenerationProfile,
  TerraformGenerationResult,
  TerraformGenerationValidation,
  TerraformResourceSummary,
  TerraformTargetCloud,
} from './terraform.types';

interface TerraformBundleDraft {
  files: Array<{
    path: string;
    content: string;
  }>;
  assumptions: string[];
  securityNotes: string[];
  nextSteps: string[];
  serviceMappings: TerraformGenerationResult['serviceMappings'];
}

interface WorkloadFacts {
  projectName: string;
  environment: 'production' | 'staging' | 'development' | 'test';
  region: string;
  computeCount: number;
  storageSummary: {
    objectCount: number;
    blockCount: number;
    fileCount: number;
    totalStorageGb: number;
    blockStorageGb: number;
  };
  relationalDatabase?: DatabaseComponent;
  databaseStorageGb: number;
  resourceSummary: TerraformResourceSummary;
  tags: Record<string, string>;
  generationProfile: TerraformGenerationProfile;
}

@Injectable()
export class TerraformGenerationService {
  generate(input: TerraformGenerateInput): TerraformGenerationResult {
    const nws = NWSValidator.validate(input.nws);
    const targetCloud = input.targetCloud;
    const workspaceName = sanitizeSlug(input.workspaceName ?? nws.workload.name ?? 'polycost-app');
    const generationProfile = generationProfileFor(input, nws);
    const facts = workloadFacts(nws, targetCloud, input.region, workspaceName, generationProfile);
    const draft = bundleForTarget(targetCloud, nws, facts);
    const generatedAt = new Date().toISOString();
    const bundleName = `${workspaceName}-${targetCloud}-terraform`;
    const baseFiles = draft.files.map((file) => ({
      path: file.path,
      content: ensureTrailingNewline(file.content),
      sha256: sha256(ensureTrailingNewline(file.content)),
    }));
    const files = baseFiles.concat(
      generatedFile(
        'BUNDLE-MANIFEST.json',
        bundleManifest({
          bundleName,
          generatedAt,
          targetCloud,
          facts,
          files: baseFiles,
        }),
      ),
    );
    const archive = zipArchive(`${bundleName}.zip`, files);

    return {
      targetCloud,
      generatedAt,
      bundleName,
      workspaceName,
      region: facts.region,
      generationProfile,
      source: {
        schemaVersion: nws.schemaVersion,
        ...(nws.workload.name ? { workloadName: nws.workload.name } : {}),
        workloadType: nws.workload.type,
        sourceType: nws.metadata.sourceType,
      },
      resourceSummary: facts.resourceSummary,
      serviceMappings: draft.serviceMappings,
      files,
      archive,
      validation: validateGeneratedFiles(targetCloud, files, archive),
      assumptions: draft.assumptions,
      securityNotes: draft.securityNotes,
      nextSteps: draft.nextSteps,
    };
  }
}

function bundleForTarget(
  targetCloud: TerraformTargetCloud,
  nws: NormalizedWorkloadSpec,
  facts: WorkloadFacts,
): TerraformBundleDraft {
  switch (targetCloud) {
    case 'aws':
      return awsBundle(nws, facts);
    case 'azure':
      return azureBundle(nws, facts);
    case 'gcp':
      return gcpBundle(nws, facts);
  }
}

function generationProfileFor(
  input: TerraformGenerateInput,
  nws: NormalizedWorkloadSpec,
): TerraformGenerationProfile {
  const inferredAvailabilityMode = input.options?.availabilityMode ?? availabilityModeFromNws(nws);
  const networkTopology =
    input.options?.networkTopology ??
    (nws.workloadProfile?.environment === 'production' ||
    nws.database.length > 0 ||
    nws.network.loadBalancer
      ? 'private'
      : 'public');

  return {
    runtimeTarget: input.options?.runtimeTarget ?? 'vm',
    networkTopology,
    availabilityMode: inferredAvailabilityMode,
    policyPackIncluded: input.options?.includePolicyPack ?? true,
    moduleScaffoldIncluded: input.options?.includeModuleScaffold ?? true,
  };
}

function availabilityModeFromNws(
  nws: NormalizedWorkloadSpec,
): TerraformGenerationProfile['availabilityMode'] {
  if (nws.availability.faultTolerance === 'active-active') {
    return 'active-active';
  }

  if (nws.availability.multiRegion || nws.availability.faultTolerance === 'multi-region') {
    return 'multi-region-dr';
  }

  if (nws.availability.multiAz || nws.availability.faultTolerance === 'multi-az') {
    return 'multi-az';
  }

  return 'single-region';
}

function workloadFacts(
  nws: NormalizedWorkloadSpec,
  targetCloud: TerraformTargetCloud,
  requestedRegion: string | undefined,
  workspaceName: string,
  generationProfile: TerraformGenerationProfile,
): WorkloadFacts {
  const computeCount = Math.max(
    1,
    nws.compute.reduce((total, component) => {
      if (component.scalingType === 'autoscaling' && component.autoscalingRange) {
        return total + Math.max(component.autoscalingRange.min, 1);
      }

      return total + (component.instanceCount ?? 1);
    }, 0),
  );
  const storageSummary = storageFacts(nws.storage);
  const relationalDatabase = nws.database.find((database) => relationalDatabaseEngine(database));
  const databaseStorageGb = Math.max(20, Math.ceil(relationalDatabase?.sizeGb ?? 20));
  const environment = nws.workloadProfile?.environment ?? 'development';
  const region = requestedRegion ?? regionForProvider(targetCloud, nws.workload.region.preference);
  const tags = Object.fromEntries(
    (nws.workloadProfile?.tags ?? [])
      .map((tag) => [sanitizeTagKey(tag.key), tag.value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  );

  return {
    projectName: sanitizeSlug(workspaceName),
    environment,
    region,
    computeCount,
    storageSummary,
    relationalDatabase,
    databaseStorageGb,
    resourceSummary: {
      computeInstances: computeCount,
      objectStorageBuckets: storageSummary.objectCount > 0 ? 1 : 0,
      blockStorageVolumes: storageSummary.blockCount,
      fileShares: storageSummary.fileCount,
      relationalDatabases: relationalDatabase ? 1 : 0,
      loadBalancers: nws.network.loadBalancer ? 1 : 0,
      cdnEnabled: nws.network.cdn,
      multiAz: nws.availability.multiAz,
      multiRegion: nws.availability.multiRegion,
    },
    tags,
    generationProfile,
  };
}

function storageFacts(storage: StorageComponent[]) {
  return storage.reduce(
    (summary, component) => {
      if (component.type === 'object') {
        summary.objectCount += 1;
      } else if (component.type === 'block') {
        summary.blockCount += 1;
        summary.blockStorageGb += component.sizeGb;
      } else if (component.type === 'file') {
        summary.fileCount += 1;
      }

      summary.totalStorageGb += component.sizeGb;
      return summary;
    },
    {
      objectCount: 0,
      blockCount: 0,
      fileCount: 0,
      totalStorageGb: 0,
      blockStorageGb: 0,
    },
  );
}

function relationalDatabaseEngine(database: DatabaseComponent): boolean {
  return (
    database.engine === 'postgres' ||
    database.engine === 'mysql' ||
    database.engine === 'sql_server' ||
    database.engine === 'generic_relational'
  );
}

function awsBundle(nws: NormalizedWorkloadSpec, facts: WorkloadFacts): TerraformBundleDraft {
  const databaseEngine = awsDatabaseEngine(facts.relationalDatabase?.engine);
  const instanceType = awsInstanceType(nws);
  const files = [
    file('versions.tf', awsVersions()),
    file('providers.tf', awsProviders()),
    file('backend.tf.example', awsBackendExample()),
    file('variables.tf', awsVariables(facts, instanceType, databaseEngine)),
    file('main.tf', awsMain()),
    file('outputs.tf', awsOutputs()),
    file('terraform.tfvars.example', awsTfvarsExample(facts)),
    file('README.md', bundleReadme('aws', facts)),
    ...hardeningFiles('aws', facts),
  ];

  return {
    files,
    assumptions: commonAssumptions(nws, facts, 'AWS').concat([
      'EC2 uses the latest Amazon Linux 2 AMI data source by default; verify OS, AMI hardening, and golden-image requirements before apply.',
      'Relational databases map to RDS for PostgreSQL/MySQL-compatible workloads; SQL Server and specialty engines require solution-architect review.',
      'Generated IAM creates an EC2 instance profile without broad inline policies; add workload-specific least-privilege statements only after access review.',
    ]),
    securityNotes: commonSecurityNotes('AWS').concat([
      'S3 buckets include public-access blocking, versioning, and server-side encryption.',
      'RDS password is a sensitive Terraform variable with no committed default.',
    ]),
    nextSteps: commonNextSteps('AWS').concat([
      'Create the S3/DynamoDB remote-state backend from backend.tf.example before team use.',
      'Run terraform init, terraform fmt -check, terraform validate, and terraform plan with environment credentials.',
    ]),
    serviceMappings: serviceMappings('aws', facts),
  };
}

function azureBundle(nws: NormalizedWorkloadSpec, facts: WorkloadFacts): TerraformBundleDraft {
  const files = [
    file('versions.tf', azureVersions()),
    file('providers.tf', azureProviders()),
    file('backend.tf.example', azureBackendExample()),
    file('variables.tf', azureVariables(facts, azureVmSize(nws))),
    file('main.tf', azureMain()),
    file('outputs.tf', azureOutputs()),
    file('terraform.tfvars.example', azureTfvarsExample(facts)),
    file('README.md', bundleReadme('azure', facts)),
    ...hardeningFiles('azure', facts),
  ];

  return {
    files,
    assumptions: commonAssumptions(nws, facts, 'Azure').concat([
      'Linux VM generation is the default compute path; Windows, AKS, App Service, and specialized PaaS shapes require a follow-up module selection pass.',
      'Database generation uses Azure Database for PostgreSQL Flexible Server as the relational baseline unless the user edits variables.',
      'Generated VMs use system-assigned managed identities; attach role assignments only after the target workload access matrix is reviewed.',
    ]),
    securityNotes: commonSecurityNotes('Azure').concat([
      'Storage accounts require HTTPS, TLS 1.2, private container access, and versioning.',
      'VM access uses SSH public keys; no password authentication is generated.',
    ]),
    nextSteps: commonNextSteps('Azure').concat([
      'Create the Azure Blob remote-state account/container from backend.tf.example before team use.',
      'Authenticate with Azure CLI, managed identity, or service principal before running terraform plan.',
    ]),
    serviceMappings: serviceMappings('azure', facts),
  };
}

function gcpBundle(nws: NormalizedWorkloadSpec, facts: WorkloadFacts): TerraformBundleDraft {
  const files = [
    file('versions.tf', gcpVersions()),
    file('providers.tf', gcpProviders()),
    file('backend.tf.example', gcpBackendExample()),
    file('variables.tf', gcpVariables(facts, gcpMachineType(nws))),
    file('main.tf', gcpMain()),
    file('outputs.tf', gcpOutputs()),
    file('terraform.tfvars.example', gcpTfvarsExample(facts)),
    file('README.md', bundleReadme('gcp', facts)),
    ...hardeningFiles('gcp', facts),
  ];

  return {
    files,
    assumptions: commonAssumptions(nws, facts, 'GCP').concat([
      'Compute Engine is the baseline compute target; GKE, Cloud Run, and App Engine should be selected in a follow-up module pass when requested explicitly.',
      'Cloud SQL is generated for relational database needs; NoSQL, cache, and analytics engines require manual module selection.',
      'Generated VM service accounts include only logging/monitoring scopes; grant application permissions through explicit IAM review.',
    ]),
    securityNotes: commonSecurityNotes('GCP').concat([
      'Cloud Storage buckets use uniform bucket-level access and versioning.',
      'Compute Engine enables OS Login metadata and Shielded VM settings.',
    ]),
    nextSteps: commonNextSteps('GCP').concat([
      'Create the GCS remote-state bucket from backend.tf.example before team use.',
      'Authenticate with Application Default Credentials or service-account impersonation before planning.',
    ]),
    serviceMappings: serviceMappings('gcp', facts),
  };
}

function hardeningFiles(
  targetCloud: TerraformTargetCloud,
  facts: WorkloadFacts,
): TerraformBundleDraft['files'] {
  const files: TerraformBundleDraft['files'] = [
    file('Makefile', validationMakefile()),
    file('FRAMEWORK-ALIGNMENT.md', frameworkAlignmentReadme(targetCloud, facts)),
    file('scripts/validate-bundle.mjs', validationRunnerScript()),
  ];

  if (facts.generationProfile.policyPackIncluded) {
    files.push(
      file('.tflint.hcl', tflintConfig()),
      file('tests/static_validation.tftest.hcl', terraformStaticTest(targetCloud, facts)),
      file('policies/terraform-plan.rego', terraformPlanPolicy()),
    );
  }

  if (facts.generationProfile.moduleScaffoldIncluded) {
    files.push(
      file('modules/README.md', moduleScaffoldReadme(targetCloud, facts)),
      file('modules/network/README.md', moduleReadme('network', targetCloud)),
      file('modules/compute/README.md', moduleReadme('compute', targetCloud)),
      file('modules/data/README.md', moduleReadme('data', targetCloud)),
      ...moduleLibraryFiles(targetCloud),
    );
  }

  return files;
}

function validationMakefile(): string {
  return `.PHONY: fmt init-local validate test plan policy clean

fmt:
\tterraform fmt -check -recursive

init-local:
\tterraform init -backend=false

validate: fmt init-local
\tterraform validate

test:
\tterraform test

plan:
\tterraform plan -var-file=terraform.tfvars -out=tfplan
\tterraform show -json tfplan > tfplan.json

policy:
\tconftest test tfplan.json --policy policies

clean:
\trm -f tfplan tfplan.json
`;
}

function validationRunnerScript(): string {
  return `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const commands = [
  { id: 'terraform-fmt', command: 'terraform', args: ['fmt', '-check', '-recursive'], required: true },
  { id: 'terraform-init', command: 'terraform', args: ['init', '-backend=false'], required: true },
  { id: 'terraform-validate', command: 'terraform', args: ['validate'], required: true },
  { id: 'terraform-test', command: 'terraform', args: ['test'], required: false },
  { id: 'tflint', command: 'tflint', args: ['--recursive'], required: false },
];

if (existsSync('tfplan.json') && existsSync('policies/terraform-plan.rego')) {
  commands.push({
    id: 'conftest-policy',
    command: 'conftest',
    args: ['test', 'tfplan.json', '--policy', 'policies'],
    required: false,
  });
}

const results = commands.map((step) => {
  const probe = spawnSync(step.command, ['--version'], { encoding: 'utf8' });

  if (probe.error && probe.error.code === 'ENOENT') {
    return {
      id: step.id,
      status: step.required ? 'failed' : 'skipped',
      command: [step.command, ...step.args].join(' '),
      message: step.required
        ? step.command + ' is required but was not found on PATH.'
        : step.command + ' was not found on PATH; optional check skipped.',
    };
  }

  const run = spawnSync(step.command, step.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  return {
    id: step.id,
    status: run.status === 0 ? 'passed' : step.required ? 'failed' : 'warning',
    command: [step.command, ...step.args].join(' '),
    exitCode: run.status,
    stdout: run.stdout?.slice(0, 4000) ?? '',
    stderr: run.stderr?.slice(0, 4000) ?? '',
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  status: results.some((result) => result.status === 'failed')
    ? 'failed'
    : results.some((result) => result.status === 'warning')
      ? 'warning'
      : 'passed',
  results,
};

writeFileSync('terraform-validation-result.json', JSON.stringify(summary, null, 2) + '\\n');
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.status === 'failed' ? 1 : 0);
`;
}

function tflintConfig(): string {
  return `config {
  call_module_type = "local"
  force            = false
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
`;
}

function frameworkAlignmentReadme(targetCloud: TerraformTargetCloud, facts: WorkloadFacts): string {
  return `# Cloud Framework Alignment

This bundle is generated for ${providerDisplayName(targetCloud)} and should be reviewed against the
provider architecture framework plus Terraform platform standards before any production plan/apply.

## Generation Profile

- Runtime target: ${facts.generationProfile.runtimeTarget}
- Network topology: ${facts.generationProfile.networkTopology}
- Availability mode: ${facts.generationProfile.availabilityMode}
- Environment: ${facts.environment}
- Region: ${facts.region}

## Universal Terraform Controls

| Control | Bundle evidence | Required production review |
| --- | --- | --- |
| Version pinning | \`versions.tf\` pins Terraform and official provider constraints | Confirm provider major version against platform baseline |
| Remote state | \`backend.tf.example\` uses provider-native encrypted remote state | Create state backend and locking before team use |
| Input validation | \`variables.tf\` uses typed variables and validation blocks | Add organization-specific policy and naming validation |
| Secrets handling | Sensitive variables have no committed runtime defaults | Source secrets from CI/Vault/cloud secret manager |
| Policy as code | \`policies/terraform-plan.rego\`, \`.tflint.hcl\`, and \`Makefile\` are generated | Run plan JSON through policy gates in CI |
| Module lifecycle | \`modules/\` documents extraction boundaries | Promote into versioned internal modules after review |

## Architecture Framework Mapping

| Framework area | Bundle evidence | Gap to close before production |
| --- | --- | --- |
| Operational excellence | Makefile, Terraform test skeleton, module boundary docs | Add runbooks, dashboards, alerts, release rollback playbooks |
| Security | Private database networking, runtime identities, sensitive variables, policy pack | Attach least-privilege permissions, secrets manager, WAF/CDN rules, audit logging |
| Reliability | Multi-AZ intent, private subnets/managed database HA where supported | Add DR runbooks, restore tests, active-active/multi-region modules when required |
| Performance efficiency | Workload-size-driven VM defaults and review notes | Benchmark selected SKUs, autoscaling, cache/CDN, database sizing |
| Cost optimization | Cost-allocation tags/labels and FinOps review notes | Add budgets, commitment strategy, lifecycle policies, right-sizing telemetry |
| Sustainability | Right-sizing, lifecycle placeholders, managed service defaults | Add utilization targets and low-carbon/regional placement review where relevant |

## Provider-Specific Review Notes

${providerFrameworkNotes(targetCloud)}

## Promotion Gate

Production promotion requires:

1. Platform owner approval of naming, identity, network, state, and module boundaries.
2. \`make validate\`, \`terraform test\`, \`terraform plan\`, and policy checks passing in CI.
3. Security review for public ingress, secrets, encryption, logging, WAF/CDN, and least privilege.
4. Reliability review for backup, restore, failover, RTO/RPO, and region/zone placement.
5. FinOps review for tags/labels, budgets, commitment model, and lifecycle policies.
`;
}

function providerFrameworkNotes(targetCloud: TerraformTargetCloud): string {
  switch (targetCloud) {
    case 'aws':
      return `- AWS Well-Architected: review all six pillars, especially IAM least privilege, private subnet placement, encrypted RDS/S3, and ALB/WAF/CDN edge decisions.
- AWS Cloud Adoption Framework: validate business, people, governance, platform, security, and operations perspectives before promotion.
- AWS Terraform: confirm S3/DynamoDB backend, account/region provider aliases, SCP/permission-boundary alignment, and tagging standards.`;
    case 'azure':
      return `- Azure Well-Architected: review reliability, security, cost, operational excellence, and performance efficiency pillars.
- Azure Cloud Adoption Framework: validate landing-zone design areas including identity, management, connectivity, resource organization, governance, and security.
- Azure Terraform: confirm AzureRM backend, subscription/tenant provider configuration, managed identity, private DNS, policy assignments, and naming standards.`;
    case 'gcp':
      return `- Google Cloud Architecture Framework: review operational excellence, security/privacy/compliance, reliability, cost optimization, performance optimization, and sustainability.
- Google Cloud landing-zone foundations: validate project/folder structure, IAM, VPC/service networking, logging, organization policies, and billing labels.
- Google Terraform: confirm GCS backend, service-account impersonation, provider aliases, private service access, labels, and policy validation.`;
  }
}

function terraformStaticTest(targetCloud: TerraformTargetCloud, facts: WorkloadFacts): string {
  const providerVariables = terraformTestVariables(targetCloud, facts);

  return `run "static_configuration_contract" {
  command = plan

  variables {
${providerVariables}
  }

  assert {
    condition     = var.project_name != ""
    error_message = "project_name must be populated for deterministic naming."
  }

  assert {
    condition     = contains(["production", "staging", "development", "test"], var.environment)
    error_message = "environment must remain one of PolyCost's supported values."
  }
}
`;
}

function terraformTestVariables(targetCloud: TerraformTargetCloud, facts: WorkloadFacts): string {
  const common = [
    `    project_name = "${facts.projectName}"`,
    '    environment  = "test"',
    '    compute_instance_count = 0',
    '    enable_object_storage = false',
    '    enable_relational_database = false',
    '    enable_load_balancer = false',
  ];

  if (targetCloud === 'aws') {
    return common.concat(['    database_password = "CHANGE_ME_DEV_ONLY_TEST_ONLY"']).join('\n');
  }

  if (targetCloud === 'azure') {
    return common
      .concat([
        '    subscription_id = "00000000-0000-0000-0000-000000000000"',
        '    tenant_id = "00000000-0000-0000-0000-000000000000"',
        '    admin_ssh_public_key = "ssh-rsa CHANGE_ME_DEV_ONLY_TEST_ONLY"',
        '    database_admin_password = "CHANGE_ME_DEV_ONLY_TEST_ONLY"',
      ])
      .join('\n');
  }

  return common
    .concat([
      '    project_id = "CHANGE_ME_DEV_ONLY_GCP_PROJECT_ID"',
      '    database_password = "CHANGE_ME_DEV_ONLY_TEST_ONLY"',
    ])
    .join('\n');
}

function terraformPlanPolicy(): string {
  return `package polycost.terraform

deny[msg] {
  change := input.resource_changes[_]
  change.type == "aws_db_instance"
  change.change.after.publicly_accessible == true
  msg := sprintf("RDS instance %s must not be publicly accessible", [change.address])
}

deny[msg] {
  change := input.resource_changes[_]
  change.type == "google_sql_database_instance"
  change.change.after.settings.ip_configuration.ipv4_enabled == true
  msg := sprintf("Cloud SQL instance %s must keep public IPv4 disabled", [change.address])
}

deny[msg] {
  change := input.resource_changes[_]
  change.type == "azurerm_postgresql_flexible_server"
  change.change.after.public_network_access_enabled == true
  msg := sprintf("Azure PostgreSQL server %s must keep public network access disabled", [change.address])
}

deny[msg] {
  change := input.resource_changes[_]
  taggable_aws_resource(change.type)
  not change.change.after.tags
  msg := sprintf("AWS resource %s is missing tags", [change.address])
}

deny[msg] {
  change := input.resource_changes[_]
  taggable_azure_resource(change.type)
  not change.change.after.tags
  msg := sprintf("Azure resource %s is missing tags", [change.address])
}

deny[msg] {
  change := input.resource_changes[_]
  taggable_gcp_resource(change.type)
  not change.change.after.labels
  msg := sprintf("GCP resource %s is missing labels", [change.address])
}

taggable_aws_resource(type) {
  type == "aws_instance"
} {
  type == "aws_s3_bucket"
} {
  type == "aws_db_instance"
} {
  type == "aws_lb"
}

taggable_azure_resource(type) {
  type == "azurerm_resource_group"
} {
  type == "azurerm_virtual_network"
} {
  type == "azurerm_linux_virtual_machine"
} {
  type == "azurerm_storage_account"
} {
  type == "azurerm_postgresql_flexible_server"
} {
  type == "azurerm_lb"
}

taggable_gcp_resource(type) {
  type == "google_compute_instance"
} {
  type == "google_storage_bucket"
}
`;
}

function moduleScaffoldReadme(targetCloud: TerraformTargetCloud, facts: WorkloadFacts): string {
  return `# Module Library Review

PolyCost generated a root module for immediate review plus provider-specific starter modules for
the platform team's extraction path. Keep generated root files as the contract test, then promote
the module library into versioned internal modules once naming, network, IAM, and state conventions
are approved.

## Generation Profile

- Runtime target: ${facts.generationProfile.runtimeTarget}
- Network topology: ${facts.generationProfile.networkTopology}
- Availability mode: ${facts.generationProfile.availabilityMode}
- Provider: ${providerDisplayName(targetCloud)}

## Generated Starter Modules

- \`modules/network\`: VPC/VNet/VPC network, subnets, firewall/security group baseline, and private service hooks.
- \`modules/compute\`: VM runtime, least-privilege identity attachment, and provider-native hardening defaults.
- \`modules/data\`: object storage plus relational database starter resources with sensitive credentials.

## Future Internal Modules

- \`modules/edge\`: load balancer, CDN, WAF, certificates, health checks.
- \`modules/observability\`: logs, metrics, alerts, dashboards, audit trails.
- \`modules/dr\`: backup, restore, replicated storage, and active-active or active-passive failover.

## Promotion Gate

Do not promote this bundle to production until \`make validate\`, \`make plan\`, policy checks, and
a human architecture review have all passed in the destination account/subscription/project.
`;
}

function moduleReadme(moduleName: string, targetCloud: TerraformTargetCloud): string {
  const providerName = providerDisplayName(targetCloud);

  return `# ${moduleName} Starter Module

This directory contains a provider-specific ${moduleName} starter module for ${providerName}. The
root module remains the immediate review baseline, while this module gives the platform team a clean
extraction point for versioned internal module ownership.

Before production promotion, confirm provider aliases, state ownership, naming standards, policy
requirements, and environment-specific security controls with the platform team.
`;
}

function moduleLibraryFiles(targetCloud: TerraformTargetCloud): TerraformBundleDraft['files'] {
  switch (targetCloud) {
    case 'aws':
      return awsModuleLibraryFiles();
    case 'azure':
      return azureModuleLibraryFiles();
    case 'gcp':
      return gcpModuleLibraryFiles();
  }
}

function awsModuleLibraryFiles(): TerraformBundleDraft['files'] {
  return [
    file('modules/network/variables.tf', awsNetworkModuleVariables()),
    file('modules/network/main.tf', awsNetworkModuleMain()),
    file('modules/network/outputs.tf', awsNetworkModuleOutputs()),
    file('modules/compute/variables.tf', awsComputeModuleVariables()),
    file('modules/compute/main.tf', awsComputeModuleMain()),
    file('modules/compute/outputs.tf', awsComputeModuleOutputs()),
    file('modules/data/variables.tf', awsDataModuleVariables()),
    file('modules/data/main.tf', awsDataModuleMain()),
    file('modules/data/outputs.tf', awsDataModuleOutputs()),
  ];
}

function azureModuleLibraryFiles(): TerraformBundleDraft['files'] {
  return [
    file('modules/network/variables.tf', azureNetworkModuleVariables()),
    file('modules/network/main.tf', azureNetworkModuleMain()),
    file('modules/network/outputs.tf', azureNetworkModuleOutputs()),
    file('modules/compute/variables.tf', azureComputeModuleVariables()),
    file('modules/compute/main.tf', azureComputeModuleMain()),
    file('modules/compute/outputs.tf', azureComputeModuleOutputs()),
    file('modules/data/variables.tf', azureDataModuleVariables()),
    file('modules/data/main.tf', azureDataModuleMain()),
    file('modules/data/outputs.tf', azureDataModuleOutputs()),
  ];
}

function gcpModuleLibraryFiles(): TerraformBundleDraft['files'] {
  return [
    file('modules/network/variables.tf', gcpNetworkModuleVariables()),
    file('modules/network/main.tf', gcpNetworkModuleMain()),
    file('modules/network/outputs.tf', gcpNetworkModuleOutputs()),
    file('modules/compute/variables.tf', gcpComputeModuleVariables()),
    file('modules/compute/main.tf', gcpComputeModuleMain()),
    file('modules/compute/outputs.tf', gcpComputeModuleOutputs()),
    file('modules/data/variables.tf', gcpDataModuleVariables()),
    file('modules/data/main.tf', gcpDataModuleMain()),
    file('modules/data/outputs.tf', gcpDataModuleOutputs()),
  ];
}

function awsNetworkModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,23}$", var.project_name))
    error_message = "project_name must start with a letter and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the application VPC."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid CIDR block."
  }
}

variable "availability_zones" {
  description = "Optional explicit availability zones. Defaults to the first available zones in the provider region."
  type        = list(string)
  default     = []
}

variable "public_subnet_count" {
  description = "Number of public subnets to create."
  type        = number
  default     = 2

  validation {
    condition     = var.public_subnet_count >= 0 && var.public_subnet_count <= 6
    error_message = "public_subnet_count must be between 0 and 6."
  }
}

variable "private_subnet_count" {
  description = "Number of private subnets to create."
  type        = number
  default     = 2

  validation {
    condition     = var.private_subnet_count >= 1 && var.private_subnet_count <= 6
    error_message = "private_subnet_count must be between 1 and 6."
  }
}

variable "tags" {
  description = "Tags to apply to all supported AWS resources."
  type        = map(string)
  default     = {}
}
`;
}

function awsNetworkModuleMain(): string {
  return `data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  subnet_azs = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, max(var.public_subnet_count, var.private_subnet_count))
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = format("%s-vpc", var.project_name)
  })
}

resource "aws_subnet" "public" {
  count                   = var.public_subnet_count
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.subnet_azs[count.index % length(local.subnet_azs)]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = format("%s-public-%02d", var.project_name, count.index + 1)
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = var.private_subnet_count
  vpc_id            = aws_vpc.this.id
  availability_zone = local.subnet_azs[count.index % length(local.subnet_azs)]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 16)

  tags = merge(var.tags, {
    Name = format("%s-private-%02d", var.project_name, count.index + 1)
    Tier = "private"
  })
}

resource "aws_security_group" "app" {
  name        = format("%s-app-sg", var.project_name)
  description = "Application ingress and egress baseline"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTPS from inside the VPC by default"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = format("%s-app-sg", var.project_name)
  })
}
`;
}

function awsNetworkModuleOutputs(): string {
  return `output "vpc_id" {
  description = "ID of the generated VPC."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets."
  value       = aws_subnet.private[*].id
}

output "app_security_group_id" {
  description = "Application security group ID."
  value       = aws_security_group.app.id
}
`;
}

function awsComputeModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "ami_id" {
  description = "Approved AMI ID from the platform image pipeline."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.micro"
}

variable "instance_count" {
  description = "Number of application instances."
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count >= 1 && var.instance_count <= 50
    error_message = "instance_count must be between 1 and 50."
  }
}

variable "subnet_ids" {
  description = "Private subnet IDs for application instances."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs attached to each instance."
  type        = list(string)
}

variable "iam_instance_profile_name" {
  description = "Optional least-privilege IAM instance profile name."
  type        = string
  default     = null
}

variable "enable_public_ip" {
  description = "Whether instances should receive public IP addresses."
  type        = bool
  default     = false
}

variable "root_volume_gb" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to all supported AWS resources."
  type        = map(string)
  default     = {}
}
`;
}

function awsComputeModuleMain(): string {
  return `resource "aws_instance" "app" {
  count                       = var.instance_count
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_ids[count.index % length(var.subnet_ids)]
  vpc_security_group_ids      = var.security_group_ids
  associate_public_ip_address = var.enable_public_ip
  iam_instance_profile        = var.iam_instance_profile_name

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    encrypted   = true
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }

  tags = merge(var.tags, {
    Name = format("%s-app-%02d", var.project_name, count.index + 1)
  })
}
`;
}

function awsComputeModuleOutputs(): string {
  return `output "instance_ids" {
  description = "Application instance IDs."
  value       = aws_instance.app[*].id
}

output "private_ips" {
  description = "Private IP addresses for application instances."
  value       = aws_instance.app[*].private_ip
}
`;
}

function awsDataModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for object storage."
  type        = string
}

variable "enable_database" {
  description = "Whether to create the relational database starter resource."
  type        = bool
  default     = false
}

variable "database_subnet_ids" {
  description = "Private subnet IDs for database placement."
  type        = list(string)
  default     = []
}

variable "database_security_group_ids" {
  description = "Security groups allowed to reach the database."
  type        = list(string)
  default     = []
}

variable "database_engine" {
  description = "RDS engine."
  type        = string
  default     = "postgres"
}

variable "database_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "database_allocated_storage_gb" {
  description = "Allocated database storage in GiB."
  type        = number
  default     = 20
}

variable "db_username" {
  description = "Database administrator username."
  type        = string
  default     = "appadmin"
}

variable "db_password" {
  description = "Database administrator password. Provide from a secret manager or CI secret."
  type        = string
  sensitive   = true
  default     = null
}

variable "tags" {
  description = "Tags to apply to all supported AWS resources."
  type        = map(string)
  default     = {}
}
`;
}

function awsDataModuleMain(): string {
  return `resource "aws_s3_bucket" "object_storage" {
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "object_storage" {
  bucket                  = aws_s3_bucket.object_storage.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "object_storage" {
  bucket = aws_s3_bucket.object_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_db_subnet_group" "main" {
  count      = var.enable_database ? 1 : 0
  name       = format("%s-db-subnets", var.project_name)
  subnet_ids = var.database_subnet_ids
  tags       = var.tags
}

resource "aws_db_instance" "main" {
  count                  = var.enable_database ? 1 : 0
  identifier             = format("%s-db", var.project_name)
  engine                 = var.database_engine
  instance_class         = var.database_instance_class
  allocated_storage      = var.database_allocated_storage_gb
  storage_encrypted      = true
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = var.database_security_group_ids
  publicly_accessible    = false
  skip_final_snapshot    = false
  tags                   = var.tags
}
`;
}

function awsDataModuleOutputs(): string {
  return `output "bucket_id" {
  description = "S3 bucket ID."
  value       = aws_s3_bucket.object_storage.id
}

output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = aws_s3_bucket.object_storage.arn
}

output "database_endpoint" {
  description = "RDS endpoint when database creation is enabled."
  value       = try(aws_db_instance.main[0].address, null)
}
`;
}

function azureNetworkModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "location" {
  description = "Azure region for network resources."
  type        = string
}

variable "address_space" {
  description = "Virtual network address space."
  type        = list(string)
  default     = ["10.50.0.0/16"]
}

variable "app_subnet_prefix" {
  description = "Application subnet CIDR prefix."
  type        = string
  default     = "10.50.1.0/24"
}

variable "database_subnet_prefix" {
  description = "Delegated database subnet CIDR prefix."
  type        = string
  default     = "10.50.10.0/24"
}

variable "ingress_source_prefix" {
  description = "Source prefix allowed to reach HTTPS."
  type        = string
  default     = "VirtualNetwork"
}

variable "tags" {
  description = "Tags to apply to all supported Azure resources."
  type        = map(string)
  default     = {}
}
`;
}

function azureNetworkModuleMain(): string {
  return `resource "azurerm_resource_group" "this" {
  name     = format("%s-rg", var.project_name)
  location = var.location
  tags     = var.tags
}

resource "azurerm_virtual_network" "this" {
  name                = format("%s-vnet", var.project_name)
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  address_space       = var.address_space
  tags                = var.tags
}

resource "azurerm_subnet" "app" {
  name                 = "app"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.app_subnet_prefix]
}

resource "azurerm_subnet" "database" {
  name                 = "database"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.database_subnet_prefix]

  delegation {
    name = "postgresql-flexible-server"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_network_security_group" "app" {
  name                = format("%s-app-nsg", var.project_name)
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  tags                = var.tags

  security_rule {
    name                       = "AllowHttps"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = var.ingress_source_prefix
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}
`;
}

function azureNetworkModuleOutputs(): string {
  return `output "resource_group_name" {
  description = "Generated resource group name."
  value       = azurerm_resource_group.this.name
}

output "virtual_network_id" {
  description = "Generated virtual network ID."
  value       = azurerm_virtual_network.this.id
}

output "app_subnet_id" {
  description = "Application subnet ID."
  value       = azurerm_subnet.app.id
}

output "database_subnet_id" {
  description = "Delegated database subnet ID."
  value       = azurerm_subnet.database.id
}

output "app_network_security_group_id" {
  description = "Application NSG ID."
  value       = azurerm_network_security_group.app.id
}
`;
}

function azureComputeModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for compute resources."
  type        = string
}

variable "location" {
  description = "Azure region for compute resources."
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for VM network interfaces."
  type        = string
}

variable "vm_size" {
  description = "Azure VM size."
  type        = string
  default     = "Standard_B1s"
}

variable "instance_count" {
  description = "Number of Linux VMs."
  type        = number
  default     = 1
}

variable "admin_username" {
  description = "Admin username for SSH access."
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key" {
  description = "SSH public key from the platform secrets process."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags to apply to all supported Azure resources."
  type        = map(string)
  default     = {}
}
`;
}

function azureComputeModuleMain(): string {
  return `resource "azurerm_network_interface" "app" {
  count               = var.instance_count
  name                = format("%s-nic-%02d", var.project_name, count.index + 1)
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = var.subnet_id
    private_ip_address_allocation = "Dynamic"
  }
}

resource "azurerm_linux_virtual_machine" "app" {
  count                           = var.instance_count
  name                            = format("%s-vm-%02d", var.project_name, count.index + 1)
  resource_group_name             = var.resource_group_name
  location                        = var.location
  size                            = var.vm_size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.app[count.index].id]
  tags                            = var.tags

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.ssh_public_key
  }

  identity {
    type = "SystemAssigned"
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }
}
`;
}

function azureComputeModuleOutputs(): string {
  return `output "virtual_machine_ids" {
  description = "Linux VM IDs."
  value       = azurerm_linux_virtual_machine.app[*].id
}

output "principal_ids" {
  description = "System-assigned managed identity principal IDs."
  value       = azurerm_linux_virtual_machine.app[*].identity[0].principal_id
}

output "private_ip_addresses" {
  description = "Private IP addresses for VM NICs."
  value       = azurerm_network_interface.app[*].private_ip_address
}
`;
}

function azureDataModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for data resources."
  type        = string
}

variable "location" {
  description = "Azure region for data resources."
  type        = string
}

variable "enable_database" {
  description = "Whether to create the PostgreSQL Flexible Server starter resource."
  type        = bool
  default     = false
}

variable "database_subnet_id" {
  description = "Delegated subnet ID for PostgreSQL Flexible Server."
  type        = string
  default     = null
}

variable "private_dns_zone_id" {
  description = "Private DNS zone ID for PostgreSQL private name resolution."
  type        = string
  default     = null
}

variable "db_admin_username" {
  description = "Database administrator username."
  type        = string
  default     = "appadmin"
}

variable "db_admin_password" {
  description = "Database administrator password. Provide from a secret manager or CI secret."
  type        = string
  sensitive   = true
  default     = null
}

variable "tags" {
  description = "Tags to apply to all supported Azure resources."
  type        = map(string)
  default     = {}
}
`;
}

function azureDataModuleMain(): string {
  return `resource "azurerm_storage_account" "object_storage" {
  name                            = lower(substr(replace(format("%sst", var.project_name), "-", ""), 0, 24))
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = var.tags

  blob_properties {
    versioning_enabled = true
  }
}

resource "azurerm_storage_container" "object_storage" {
  name                  = "app-data"
  storage_account_name  = azurerm_storage_account.object_storage.name
  container_access_type = "private"
}

resource "azurerm_postgresql_flexible_server" "main" {
  count                         = var.enable_database && var.database_subnet_id != null && var.private_dns_zone_id != null && var.db_admin_password != null ? 1 : 0
  name                          = format("%s-pg", var.project_name)
  resource_group_name           = var.resource_group_name
  location                      = var.location
  version                       = "16"
  delegated_subnet_id           = var.database_subnet_id
  private_dns_zone_id           = var.private_dns_zone_id
  public_network_access_enabled = false
  administrator_login           = var.db_admin_username
  administrator_password        = var.db_admin_password
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  tags                          = var.tags
}
`;
}

function azureDataModuleOutputs(): string {
  return `output "storage_account_id" {
  description = "Storage account ID."
  value       = azurerm_storage_account.object_storage.id
}

output "storage_container_name" {
  description = "Private storage container name."
  value       = azurerm_storage_container.object_storage.name
}

output "database_fqdn" {
  description = "PostgreSQL FQDN when database creation is enabled."
  value       = try(azurerm_postgresql_flexible_server.main[0].fqdn, null)
}
`;
}

function gcpNetworkModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "region" {
  description = "Google Cloud region for network resources."
  type        = string
}

variable "network_cidr" {
  description = "CIDR range for the application subnet."
  type        = string
  default     = "10.60.0.0/20"
}

variable "ingress_source_ranges" {
  description = "CIDR ranges allowed to reach HTTPS."
  type        = list(string)
  default     = ["10.60.0.0/20"]
}

variable "labels" {
  description = "Labels to apply to supported Google Cloud resources."
  type        = map(string)
  default     = {}
}
`;
}

function gcpNetworkModuleMain(): string {
  return `resource "google_compute_network" "this" {
  name                    = format("%s-vpc", var.project_name)
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "app" {
  name                     = format("%s-app", var.project_name)
  region                   = var.region
  network                  = google_compute_network.this.id
  ip_cidr_range            = var.network_cidr
  private_ip_google_access = true
}

resource "google_compute_firewall" "https" {
  name          = format("%s-allow-https", var.project_name)
  network       = google_compute_network.this.name
  source_ranges = var.ingress_source_ranges
  target_tags   = [format("%s-app", var.project_name)]

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
}
`;
}

function gcpNetworkModuleOutputs(): string {
  return `output "network_id" {
  description = "Generated VPC network ID."
  value       = google_compute_network.this.id
}

output "network_self_link" {
  description = "Generated VPC network self link."
  value       = google_compute_network.this.self_link
}

output "subnetwork_id" {
  description = "Application subnetwork ID."
  value       = google_compute_subnetwork.app.id
}

output "subnetwork_self_link" {
  description = "Application subnetwork self link."
  value       = google_compute_subnetwork.app.self_link
}
`;
}

function gcpComputeModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "zone" {
  description = "Google Cloud zone for Compute Engine instances."
  type        = string
}

variable "machine_type" {
  description = "Compute Engine machine type."
  type        = string
  default     = "e2-micro"
}

variable "instance_count" {
  description = "Number of Compute Engine instances."
  type        = number
  default     = 1
}

variable "subnetwork_self_link" {
  description = "Subnetwork self link for VM network interfaces."
  type        = string
}

variable "image" {
  description = "Approved boot image from the platform image pipeline."
  type        = string
  default     = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts"
}

variable "boot_disk_gb" {
  description = "Boot disk size in GiB."
  type        = number
  default     = 30
}

variable "labels" {
  description = "Labels to apply to supported Google Cloud resources."
  type        = map(string)
  default     = {}
}
`;
}

function gcpComputeModuleMain(): string {
  return `resource "google_service_account" "app" {
  account_id   = substr(format("%s-app", var.project_name), 0, 30)
  display_name = format("%s application runtime", var.project_name)
}

resource "google_compute_instance" "app" {
  count        = var.instance_count
  name         = format("%s-app-%02d", var.project_name, count.index + 1)
  zone         = var.zone
  machine_type = var.machine_type
  labels       = var.labels
  tags         = [format("%s-app", var.project_name)]

  boot_disk {
    initialize_params {
      image = var.image
      size  = var.boot_disk_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = var.subnetwork_self_link
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  service_account {
    email  = google_service_account.app.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  shielded_instance_config {
    enable_integrity_monitoring = true
    enable_secure_boot          = true
    enable_vtpm                 = true
  }
}
`;
}

function gcpComputeModuleOutputs(): string {
  return `output "instance_ids" {
  description = "Compute Engine instance IDs."
  value       = google_compute_instance.app[*].id
}

output "service_account_email" {
  description = "Runtime service account email."
  value       = google_service_account.app.email
}

output "private_ips" {
  description = "Private IP addresses for instances."
  value       = google_compute_instance.app[*].network_interface[0].network_ip
}
`;
}

function gcpDataModuleVariables(): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names."
  type        = string
}

variable "region" {
  description = "Google Cloud region for data resources."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique Cloud Storage bucket name."
  type        = string
}

variable "enable_database" {
  description = "Whether to create the Cloud SQL starter resource."
  type        = bool
  default     = false
}

variable "private_network" {
  description = "VPC network ID or self link for private Cloud SQL access."
  type        = string
  default     = null
}

variable "database_tier" {
  description = "Cloud SQL instance tier."
  type        = string
  default     = "db-f1-micro"
}

variable "db_username" {
  description = "Database username."
  type        = string
  default     = "appuser"
}

variable "db_password" {
  description = "Database password. Provide from Secret Manager or CI secret."
  type        = string
  sensitive   = true
  default     = null
}

variable "deletion_protection" {
  description = "Whether Cloud SQL deletion protection is enabled."
  type        = bool
  default     = true
}

variable "labels" {
  description = "Labels to apply to supported Google Cloud resources."
  type        = map(string)
  default     = {}
}
`;
}

function gcpDataModuleMain(): string {
  return `resource "google_storage_bucket" "object_storage" {
  name                        = var.bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  versioning {
    enabled = true
  }
}

resource "google_sql_database_instance" "main" {
  count               = var.enable_database && var.private_network != null && var.db_password != null ? 1 : 0
  name                = format("%s-sql", var.project_name)
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.database_tier
    availability_type = "ZONAL"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
  }
}

resource "google_sql_user" "app" {
  count    = var.enable_database && var.private_network != null && var.db_password != null ? 1 : 0
  name     = var.db_username
  instance = google_sql_database_instance.main[0].name
  password = var.db_password
}
`;
}

function gcpDataModuleOutputs(): string {
  return `output "bucket_name" {
  description = "Cloud Storage bucket name."
  value       = google_storage_bucket.object_storage.name
}

output "bucket_url" {
  description = "Cloud Storage bucket URL."
  value       = google_storage_bucket.object_storage.url
}

output "database_connection_name" {
  description = "Cloud SQL connection name when database creation is enabled."
  value       = try(google_sql_database_instance.main[0].connection_name, null)
}
`;
}

function awsVersions(): string {
  return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}`;
}

function awsProviders(): string {
  return `provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}`;
}

function awsBackendExample(): string {
  return `terraform {
  backend "s3" {
    bucket         = "CHANGE_ME_DEV_ONLY_TERRAFORM_STATE_BUCKET"
    key            = "CHANGE_ME_DEV_ONLY_PROJECT/CHANGE_ME_DEV_ONLY_ENVIRONMENT/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "CHANGE_ME_DEV_ONLY_TERRAFORM_LOCK_TABLE"
  }
}`;
}

function awsVariables(facts: WorkloadFacts, instanceType: string, databaseEngine: string): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names and tags."
  type        = string
  default     = "${facts.projectName}"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.project_name))
    error_message = "project_name must be 2-31 chars, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "${facts.environment}"

  validation {
    condition     = contains(["production", "staging", "development", "test"], var.environment)
    error_message = "environment must be production, staging, development, or test."
  }
}

variable "aws_region" {
  description = "AWS region for workload resources."
  type        = string
  default     = "${facts.region}"
}

variable "vpc_cidr_block" {
  description = "CIDR block for the workload VPC."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr_block, 0))
    error_message = "vpc_cidr_block must be a valid IPv4 CIDR block."
  }
}

variable "public_subnets" {
  description = "Public subnet map keyed by availability-zone suffix."
  type = map(object({
    cidr_block = string
    az_suffix  = string
  }))
  default = {
    a = { cidr_block = "10.40.1.0/24", az_suffix = "a" }
    b = { cidr_block = "10.40.2.0/24", az_suffix = "b" }
  }
}

variable "private_subnets" {
  description = "Private subnet map keyed by availability-zone suffix."
  type = map(object({
    cidr_block = string
    az_suffix  = string
  }))
  default = {
    a = { cidr_block = "10.40.101.0/24", az_suffix = "a" }
    b = { cidr_block = "10.40.102.0/24", az_suffix = "b" }
  }
}

variable "network_topology" {
  description = "Network exposure model for compute placement."
  type        = string
  default     = "${facts.generationProfile.networkTopology === 'public' ? 'public' : 'private'}"

  validation {
    condition     = contains(["public", "private", "landing-zone"], var.network_topology)
    error_message = "network_topology must be public, private, or landing-zone."
  }
}

variable "enable_public_compute_ip" {
  description = "Attach public IPs directly to compute instances. Prefer false behind a load balancer or private ingress."
  type        = bool
  default     = ${facts.generationProfile.networkTopology === 'public'}
}

variable "compute_instance_count" {
  description = "Number of application compute instances generated from the NWS baseline."
  type        = number
  default     = ${facts.computeCount}

  validation {
    condition     = var.compute_instance_count >= 0 && var.compute_instance_count <= 50
    error_message = "compute_instance_count must be between 0 and 50."
  }
}

variable "instance_type" {
  description = "EC2 instance type for application compute."
  type        = string
  default     = "${instanceType}"
}

variable "root_volume_gb" {
  description = "Encrypted root volume size for compute instances."
  type        = number
  default     = ${Math.max(30, Math.ceil(facts.storageSummary.blockStorageGb || 30))}
}

variable "enable_object_storage" {
  description = "Create an encrypted S3 bucket when object storage exists in NWS."
  type        = bool
  default     = ${facts.resourceSummary.objectStorageBuckets > 0}
}

variable "object_storage_bucket_name" {
  description = "Globally unique S3 bucket name. Leave empty to derive one from project/environment."
  type        = string
  default     = ""
}

variable "enable_relational_database" {
  description = "Create an encrypted RDS instance for relational database requirements."
  type        = bool
  default     = ${facts.resourceSummary.relationalDatabases > 0}
}

variable "database_engine" {
  description = "RDS database engine. Supported generated defaults are postgres and mysql."
  type        = string
  default     = "${databaseEngine}"
}

variable "database_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "database_storage_gb" {
  description = "RDS allocated storage in GB."
  type        = number
  default     = ${facts.databaseStorageGb}
}

variable "database_username" {
  description = "RDS administrator username."
  type        = string
  default     = "appadmin"
}

variable "database_password" {
  description = "RDS administrator password supplied by CI, tfvars, or a secrets manager integration."
  type        = string
  sensitive   = true
}

variable "database_multi_az" {
  description = "Enable RDS Multi-AZ for higher availability."
  type        = bool
  default     = ${facts.resourceSummary.multiAz}
}

variable "enable_load_balancer" {
  description = "Create an application load balancer."
  type        = bool
  default     = ${facts.resourceSummary.loadBalancers > 0}
}

variable "enable_public_load_balancer" {
  description = "Create an internet-facing load balancer when load balancing is requested."
  type        = bool
  default     = ${facts.generationProfile.networkTopology === 'public'}
}

variable "tags" {
  description = "Additional AWS tags."
  type        = map(string)
  default     = ${hclMap(facts.tags, 'aws')}
}`;
}

function awsMain(): string {
  return `locals {
  name_prefix   = "\${var.project_name}-\${var.environment}"
  bucket_prefix = substr(replace(local.name_prefix, "_", "-"), 0, 36)
  app_subnet_ids = var.network_topology == "public" ? values(aws_subnet.public)[*].id : values(aws_subnet.private)[*].id
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Source      = "PolyCost"
    },
    var.tags
  )
}

data "aws_ami" "linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "\${local.name_prefix}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "\${local.name_prefix}-igw"
  }
}

resource "aws_subnet" "public" {
  for_each = var.public_subnets

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value.cidr_block
  availability_zone       = "\${var.aws_region}\${each.value.az_suffix}"
  map_public_ip_on_launch = true

  tags = {
    Name = "\${local.name_prefix}-public-\${each.key}"
    Type = "public"
  }
}

resource "aws_subnet" "private" {
  for_each = var.private_subnets

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value.cidr_block
  availability_zone       = "\${var.aws_region}\${each.value.az_suffix}"
  map_public_ip_on_launch = false

  tags = {
    Name = "\${local.name_prefix}-private-\${each.key}"
    Type = "private"
  }
}

data "aws_iam_policy_document" "app_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "app" {
  name               = "\${local.name_prefix}-app-role"
  assume_role_policy = data.aws_iam_policy_document.app_assume_role.json

  tags = {
    Name = "\${local.name_prefix}-app-role"
  }
}

resource "aws_iam_instance_profile" "app" {
  name = "\${local.name_prefix}-app-profile"
  role = aws_iam_role.app.name
}

resource "aws_security_group" "app" {
  name        = "\${local.name_prefix}-app-sg"
  description = "Application ingress for PolyCost generated workload"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.network_topology == "public" ? ["0.0.0.0/0"] : [var.vpc_cidr_block]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "\${local.name_prefix}-app-sg"
  }
}

resource "aws_instance" "app" {
  count = var.compute_instance_count

  ami                    = data.aws_ami.linux.id
  instance_type          = var.instance_type
  subnet_id              = local.app_subnet_ids[count.index % length(local.app_subnet_ids)]
  vpc_security_group_ids = [aws_security_group.app.id]
  associate_public_ip_address = var.enable_public_compute_ip
  iam_instance_profile        = aws_iam_instance_profile.app.name

  root_block_device {
    encrypted   = true
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = {
    Name = "\${local.name_prefix}-app-\${count.index + 1}"
    Role = "application"
  }
}

resource "aws_s3_bucket" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  bucket = var.object_storage_bucket_name != "" ? var.object_storage_bucket_name : "\${local.bucket_prefix}-objects"

  tags = {
    Name = "\${local.name_prefix}-objects"
  }
}

resource "aws_s3_bucket_public_access_block" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  bucket                  = aws_s3_bucket.object_storage[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  bucket = aws_s3_bucket.object_storage[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  bucket = aws_s3_bucket.object_storage[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_db_subnet_group" "main" {
  count = var.enable_relational_database ? 1 : 0

  name       = "\${local.name_prefix}-db-subnets"
  subnet_ids = values(aws_subnet.private)[*].id

  tags = {
    Name = "\${local.name_prefix}-db-subnets"
  }
}

resource "aws_security_group" "database" {
  count = var.enable_relational_database ? 1 : 0

  name        = "\${local.name_prefix}-db-sg"
  description = "Database ingress from application security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Database from application tier"
    from_port       = var.database_engine == "mysql" ? 3306 : 5432
    to_port         = var.database_engine == "mysql" ? 3306 : 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "main" {
  count = var.enable_relational_database ? 1 : 0

  identifier             = "\${local.name_prefix}-db"
  allocated_storage      = var.database_storage_gb
  engine                 = var.database_engine
  instance_class         = var.database_instance_class
  username               = var.database_username
  password               = var.database_password
  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.database[0].id]
  storage_encrypted      = true
  publicly_accessible    = false
  multi_az               = var.database_multi_az
  deletion_protection    = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"

  tags = {
    Name = "\${local.name_prefix}-db"
  }
}

resource "aws_lb" "app" {
  count = var.enable_load_balancer ? 1 : 0

  name               = "\${local.name_prefix}-alb"
  internal           = !var.enable_public_load_balancer
  load_balancer_type = "application"
  security_groups    = [aws_security_group.app.id]
  subnets            = var.enable_public_load_balancer ? values(aws_subnet.public)[*].id : values(aws_subnet.private)[*].id

  tags = {
    Name = "\${local.name_prefix}-alb"
  }
}`;
}

function awsOutputs(): string {
  return `output "vpc_id" {
  description = "Generated VPC ID."
  value       = aws_vpc.main.id
}

output "application_instance_ids" {
  description = "Application EC2 instance IDs."
  value       = aws_instance.app[*].id
}

output "object_storage_bucket" {
  description = "Generated S3 object storage bucket name, when enabled."
  value       = var.enable_object_storage ? aws_s3_bucket.object_storage[0].bucket : null
}

output "database_endpoint" {
  description = "Generated RDS endpoint, when enabled."
  value       = var.enable_relational_database ? aws_db_instance.main[0].endpoint : null
  sensitive   = true
}

output "load_balancer_dns_name" {
  description = "Generated ALB DNS name, when enabled."
  value       = var.enable_load_balancer ? aws_lb.app[0].dns_name : null
}`;
}

function azureVersions(): string {
  return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}`;
}

function azureProviders(): string {
  return `provider "azurerm" {
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id

  features {
    resource_group {
      prevent_deletion_if_contains_resources = true
    }

    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}`;
}

function azureBackendExample(): string {
  return `terraform {
  backend "azurerm" {
    resource_group_name  = "CHANGE_ME_DEV_ONLY_TERRAFORM_STATE_RG"
    storage_account_name = "CHANGE_ME_DEV_ONLY_TFSTATE_STORAGE"
    container_name       = "tfstate"
    key                  = "CHANGE_ME_DEV_ONLY_PROJECT/CHANGE_ME_DEV_ONLY_ENVIRONMENT/terraform.tfstate"
    use_azuread_auth     = true
  }
}`;
}

function azureVariables(facts: WorkloadFacts, vmSize: string): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names and tags."
  type        = string
  default     = "${facts.projectName}"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,22}$", var.project_name))
    error_message = "project_name must be 2-23 chars, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "${facts.environment}"

  validation {
    condition     = contains(["production", "staging", "development", "test"], var.environment)
    error_message = "environment must be production, staging, development, or test."
  }
}

variable "subscription_id" {
  description = "Azure subscription ID. Prefer Azure CLI, OIDC, or workload identity for auth."
  type        = string
}

variable "tenant_id" {
  description = "Azure tenant ID."
  type        = string
}

variable "location" {
  description = "Azure region display name."
  type        = string
  default     = "${facts.region}"
}

variable "vnet_cidr_block" {
  description = "CIDR block for workload virtual network."
  type        = string
  default     = "10.50.0.0/16"
}

variable "app_subnet_cidr_block" {
  description = "CIDR block for application subnet."
  type        = string
  default     = "10.50.1.0/24"
}

variable "database_subnet_cidr_block" {
  description = "CIDR block for private database subnet."
  type        = string
  default     = "10.50.101.0/24"
}

variable "network_topology" {
  description = "Network exposure model for compute placement."
  type        = string
  default     = "${facts.generationProfile.networkTopology === 'public' ? 'public' : 'private'}"

  validation {
    condition     = contains(["public", "private", "landing-zone"], var.network_topology)
    error_message = "network_topology must be public, private, or landing-zone."
  }
}

variable "enable_public_compute_ip" {
  description = "Attach public IPs directly to compute instances. Prefer false behind a load balancer, VPN, Bastion, or private ingress."
  type        = bool
  default     = ${facts.generationProfile.networkTopology === 'public'}
}

variable "compute_instance_count" {
  description = "Number of Linux VMs generated from the NWS baseline."
  type        = number
  default     = ${facts.computeCount}

  validation {
    condition     = var.compute_instance_count >= 0 && var.compute_instance_count <= 50
    error_message = "compute_instance_count must be between 0 and 50."
  }
}

variable "vm_size" {
  description = "Azure VM size for application compute."
  type        = string
  default     = "${vmSize}"
}

variable "admin_username" {
  description = "Linux VM administrator username."
  type        = string
  default     = "azureuser"
}

variable "admin_ssh_public_key" {
  description = "SSH public key for Linux VM login."
  type        = string
  sensitive   = true
}

variable "enable_object_storage" {
  description = "Create a secure StorageV2 account when object storage exists in NWS."
  type        = bool
  default     = ${facts.resourceSummary.objectStorageBuckets > 0}
}

variable "storage_account_name" {
  description = "Globally unique storage account name. Leave empty to derive one from project/environment."
  type        = string
  default     = ""
}

variable "enable_relational_database" {
  description = "Create PostgreSQL Flexible Server for relational database requirements."
  type        = bool
  default     = ${facts.resourceSummary.relationalDatabases > 0}
}

variable "database_admin_username" {
  description = "PostgreSQL administrator username."
  type        = string
  default     = "pgadminuser"
}

variable "database_admin_password" {
  description = "PostgreSQL administrator password supplied by CI, tfvars, or a secrets manager integration."
  type        = string
  sensitive   = true
}

variable "database_storage_gb" {
  description = "PostgreSQL storage in GB."
  type        = number
  default     = ${facts.databaseStorageGb}
}

variable "database_sku_name" {
  description = "PostgreSQL Flexible Server SKU."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "enable_load_balancer" {
  description = "Create an Azure Load Balancer shell when load balancing is requested."
  type        = bool
  default     = ${facts.resourceSummary.loadBalancers > 0}
}

variable "enable_public_load_balancer" {
  description = "Create a public Azure Load Balancer frontend when load balancing is requested."
  type        = bool
  default     = ${facts.generationProfile.networkTopology === 'public'}
}

variable "tags" {
  description = "Additional Azure tags."
  type        = map(string)
  default     = ${hclMap(facts.tags, 'azure')}
}`;
}

function azureMain(): string {
  return `locals {
  name_prefix = "\${var.project_name}-\${var.environment}"
  storage_account_name = var.storage_account_name != "" ? var.storage_account_name : substr(
    replace("\${var.project_name}\${var.environment}pc", "-", ""),
    0,
    24
  )
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Source      = "PolyCost"
    },
    var.tags
  )
}

resource "azurerm_resource_group" "main" {
  name     = "\${local.name_prefix}-rg"
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_virtual_network" "main" {
  name                = "\${local.name_prefix}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = [var.vnet_cidr_block]
  tags                = local.common_tags
}

resource "azurerm_subnet" "app" {
  name                 = "\${local.name_prefix}-app-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.app_subnet_cidr_block]
}

resource "azurerm_subnet" "database" {
  name                 = "\${local.name_prefix}-db-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.database_subnet_cidr_block]

  delegation {
    name = "postgres-flexible-server"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_network_security_group" "app" {
  name                = "\${local.name_prefix}-app-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags

  security_rule {
    name                       = "AllowHttps"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = var.network_topology == "public" ? "Internet" : "VirtualNetwork"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_public_ip" "app" {
  count = var.enable_public_compute_ip ? var.compute_instance_count : 0

  name                = "\${local.name_prefix}-pip-\${count.index + 1}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.common_tags
}

resource "azurerm_network_interface" "app" {
  count = var.compute_instance_count

  name                = "\${local.name_prefix}-nic-\${count.index + 1}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = var.enable_public_compute_ip ? azurerm_public_ip.app[count.index].id : null
  }
}

resource "azurerm_linux_virtual_machine" "app" {
  count = var.compute_instance_count

  name                = "\${local.name_prefix}-vm-\${count.index + 1}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  size                = var.vm_size
  admin_username      = var.admin_username
  network_interface_ids = [
    azurerm_network_interface.app[count.index].id
  ]
  tags                            = local.common_tags
  disable_password_authentication = true

  identity {
    type = "SystemAssigned"
  }

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }
}

resource "azurerm_storage_account" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  name                            = local.storage_account_name
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = local.common_tags

  blob_properties {
    versioning_enabled = true
  }
}

resource "azurerm_storage_container" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  name                  = "objects"
  storage_account_name  = azurerm_storage_account.object_storage[0].name
  container_access_type = "private"
}

resource "azurerm_private_dns_zone" "postgres" {
  count = var.enable_relational_database ? 1 : 0

  name                = "\${local.name_prefix}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  count = var.enable_relational_database ? 1 : 0

  name                  = "\${local.name_prefix}-postgres-vnet-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres[0].name
  virtual_network_id    = azurerm_virtual_network.main.id
  tags                  = local.common_tags
}

resource "azurerm_postgresql_flexible_server" "main" {
  count = var.enable_relational_database ? 1 : 0

  name                   = "\${local.name_prefix}-postgres"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = var.database_admin_username
  administrator_password = var.database_admin_password
  sku_name               = var.database_sku_name
  storage_mb             = var.database_storage_gb * 1024
  backup_retention_days  = var.environment == "production" ? 35 : 7
  delegated_subnet_id    = azurerm_subnet.database.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres[0].id
  public_network_access_enabled = false
  zone                   = "1"
  tags                   = local.common_tags

  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.postgres
  ]
}

resource "azurerm_public_ip" "load_balancer" {
  count = var.enable_load_balancer && var.enable_public_load_balancer ? 1 : 0

  name                = "\${local.name_prefix}-lb-pip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.common_tags
}

resource "azurerm_lb" "app" {
  count = var.enable_load_balancer ? 1 : 0

  name                = "\${local.name_prefix}-lb"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Standard"
  tags                = local.common_tags

  frontend_ip_configuration {
    name                          = var.enable_public_load_balancer ? "public" : "private"
    public_ip_address_id          = var.enable_public_load_balancer ? azurerm_public_ip.load_balancer[0].id : null
    subnet_id                     = var.enable_public_load_balancer ? null : azurerm_subnet.app.id
    private_ip_address_allocation = var.enable_public_load_balancer ? null : "Dynamic"
  }
}`;
}

function azureOutputs(): string {
  return `output "resource_group_name" {
  description = "Generated resource group name."
  value       = azurerm_resource_group.main.name
}

output "virtual_network_id" {
  description = "Generated virtual network ID."
  value       = azurerm_virtual_network.main.id
}

output "application_vm_ids" {
  description = "Generated Linux VM IDs."
  value       = azurerm_linux_virtual_machine.app[*].id
}

output "object_storage_account_name" {
  description = "Generated Storage Account name, when enabled."
  value       = var.enable_object_storage ? azurerm_storage_account.object_storage[0].name : null
}

output "database_fqdn" {
  description = "Generated PostgreSQL Flexible Server FQDN, when enabled."
  value       = var.enable_relational_database ? azurerm_postgresql_flexible_server.main[0].fqdn : null
  sensitive   = true
}`;
}

function gcpVersions(): string {
  return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}`;
}

function gcpProviders(): string {
  return `provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}`;
}

function gcpBackendExample(): string {
  return `terraform {
  backend "gcs" {
    bucket = "CHANGE_ME_DEV_ONLY_TERRAFORM_STATE_BUCKET"
    prefix = "CHANGE_ME_DEV_ONLY_PROJECT/CHANGE_ME_DEV_ONLY_ENVIRONMENT"
  }
}`;
}

function gcpVariables(facts: WorkloadFacts, machineType: string): string {
  return `variable "project_name" {
  description = "Lowercase project slug used in resource names and labels."
  type        = string
  default     = "${facts.projectName}"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.project_name))
    error_message = "project_name must be 2-31 chars, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "${facts.environment}"

  validation {
    condition     = contains(["production", "staging", "development", "test"], var.environment)
    error_message = "environment must be production, staging, development, or test."
  }
}

variable "project_id" {
  description = "GCP project ID. Prefer Application Default Credentials or service-account impersonation."
  type        = string
}

variable "region" {
  description = "GCP region for regional resources."
  type        = string
  default     = "${facts.region}"
}

variable "zone" {
  description = "GCP zone for zonal compute."
  type        = string
  default     = "${facts.region}-a"
}

variable "vpc_cidr_block" {
  description = "CIDR block for workload subnet."
  type        = string
  default     = "10.60.1.0/24"
}

variable "network_topology" {
  description = "Network exposure model for compute placement."
  type        = string
  default     = "${facts.generationProfile.networkTopology === 'public' ? 'public' : 'private'}"

  validation {
    condition     = contains(["public", "private", "landing-zone"], var.network_topology)
    error_message = "network_topology must be public, private, or landing-zone."
  }
}

variable "enable_public_compute_ip" {
  description = "Attach external NAT access configs directly to compute instances. Prefer false behind a load balancer, VPN, IAP, or private ingress."
  type        = bool
  default     = ${facts.generationProfile.networkTopology === 'public'}
}

variable "compute_instance_count" {
  description = "Number of Compute Engine instances generated from the NWS baseline."
  type        = number
  default     = ${facts.computeCount}

  validation {
    condition     = var.compute_instance_count >= 0 && var.compute_instance_count <= 50
    error_message = "compute_instance_count must be between 0 and 50."
  }
}

variable "machine_type" {
  description = "Compute Engine machine type for application compute."
  type        = string
  default     = "${machineType}"
}

variable "root_volume_gb" {
  description = "Boot disk size for compute instances."
  type        = number
  default     = ${Math.max(30, Math.ceil(facts.storageSummary.blockStorageGb || 30))}
}

variable "boot_disk_type" {
  description = "Compute Engine boot disk type."
  type        = string
  default     = "pd-balanced"
}

variable "enable_object_storage" {
  description = "Create a secure Cloud Storage bucket when object storage exists in NWS."
  type        = bool
  default     = ${facts.resourceSummary.objectStorageBuckets > 0}
}

variable "storage_bucket_name" {
  description = "Globally unique Cloud Storage bucket name. Leave empty to derive one from project/environment."
  type        = string
  default     = ""
}

variable "enable_relational_database" {
  description = "Create Cloud SQL for relational database requirements."
  type        = bool
  default     = ${facts.resourceSummary.relationalDatabases > 0}
}

variable "database_version" {
  description = "Cloud SQL database version."
  type        = string
  default     = "POSTGRES_16"
}

variable "database_tier" {
  description = "Cloud SQL tier."
  type        = string
  default     = "db-f1-micro"
}

variable "database_storage_gb" {
  description = "Cloud SQL storage in GB."
  type        = number
  default     = ${facts.databaseStorageGb}
}

variable "database_username" {
  description = "Cloud SQL application username."
  type        = string
  default     = "appuser"
}

variable "database_password" {
  description = "Cloud SQL application user password supplied by CI, tfvars, or a secrets manager integration."
  type        = string
  sensitive   = true
}

variable "enable_load_balancer" {
  description = "Reserve a global address for a future load-balancer module."
  type        = bool
  default     = ${facts.resourceSummary.loadBalancers > 0}
}

variable "enable_public_load_balancer" {
  description = "Reserve a public global address when load balancing is requested."
  type        = bool
  default     = ${facts.generationProfile.networkTopology === 'public'}
}

variable "labels" {
  description = "Additional GCP labels."
  type        = map(string)
  default     = ${hclMap(facts.tags, 'gcp')}
}`;
}

function gcpMain(): string {
  return `locals {
  name_prefix   = "\${var.project_name}-\${var.environment}"
  bucket_prefix = substr(replace(local.name_prefix, "_", "-"), 0, 40)
  common_labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
      source      = "polycost"
    },
    var.labels
  )
}

data "google_compute_image" "debian" {
  family  = "debian-12"
  project = "debian-cloud"
}

resource "google_compute_network" "main" {
  name                    = "\${local.name_prefix}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "app" {
  name                  = "\${local.name_prefix}-app-subnet"
  ip_cidr_range         = var.vpc_cidr_block
  network               = google_compute_network.main.id
  region                = var.region
  private_ip_google_access = true
}

resource "google_compute_firewall" "https" {
  name    = "\${local.name_prefix}-allow-https"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = var.network_topology == "public" ? ["0.0.0.0/0"] : [var.vpc_cidr_block]
  target_tags   = ["https"]
}

resource "google_service_account" "app" {
  account_id   = substr(replace(local.name_prefix, "-", ""), 0, 28)
  display_name = "\${local.name_prefix} application runtime"
}

resource "google_compute_instance" "app" {
  count = var.compute_instance_count

  name         = "\${local.name_prefix}-vm-\${count.index + 1}"
  machine_type = var.machine_type
  zone         = var.zone
  labels       = local.common_labels
  tags         = ["https"]

  boot_disk {
    initialize_params {
      image = data.google_compute_image.debian.self_link
      size  = var.root_volume_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id

    dynamic "access_config" {
      for_each = var.enable_public_compute_ip ? [1] : []

      content {}
    }
  }

  service_account {
    email = google_service_account.app.email
    scopes = [
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
    ]
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}

resource "google_storage_bucket" "object_storage" {
  count = var.enable_object_storage ? 1 : 0

  name                        = var.storage_bucket_name != "" ? var.storage_bucket_name : "\${local.bucket_prefix}-objects"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.common_labels

  versioning {
    enabled = true
  }
}

resource "google_compute_global_address" "private_service_access" {
  count = var.enable_relational_database ? 1 : 0

  name          = "\${local.name_prefix}-private-service-access"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  count = var.enable_relational_database ? 1 : 0

  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_access[0].name]
}

resource "google_sql_database_instance" "main" {
  count = var.enable_relational_database ? 1 : 0

  name                = "\${local.name_prefix}-sql"
  database_version    = var.database_version
  region              = var.region
  deletion_protection = var.environment == "production"

  settings {
    tier              = var.database_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_size         = var.database_storage_gb
    disk_type         = "PD_SSD"
    user_labels       = local.common_labels

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }

    ip_configuration {
      ipv4_enabled = false
      private_network = google_compute_network.main.id
    }
  }

  depends_on = [
    google_service_networking_connection.private_vpc_connection
  ]
}

resource "google_sql_user" "app" {
  count = var.enable_relational_database ? 1 : 0

  name     = var.database_username
  instance = google_sql_database_instance.main[0].name
  password = var.database_password
}

resource "google_compute_global_address" "load_balancer" {
  count = var.enable_load_balancer && var.enable_public_load_balancer ? 1 : 0

  name = "\${local.name_prefix}-lb-ip"
}`;
}

function gcpOutputs(): string {
  return `output "network_id" {
  description = "Generated VPC network ID."
  value       = google_compute_network.main.id
}

output "application_instance_ids" {
  description = "Generated Compute Engine instance IDs."
  value       = google_compute_instance.app[*].id
}

output "object_storage_bucket" {
  description = "Generated Cloud Storage bucket name, when enabled."
  value       = var.enable_object_storage ? google_storage_bucket.object_storage[0].name : null
}

output "database_connection_name" {
  description = "Generated Cloud SQL connection name, when enabled."
  value       = var.enable_relational_database ? google_sql_database_instance.main[0].connection_name : null
  sensitive   = true
}

output "load_balancer_address" {
  description = "Reserved load-balancer address, when enabled."
  value       = var.enable_load_balancer && var.enable_public_load_balancer ? google_compute_global_address.load_balancer[0].address : null
}`;
}

function awsTfvarsExample(facts: WorkloadFacts): string {
  return `project_name = "${facts.projectName}"
environment  = "${facts.environment}"
aws_region   = "${facts.region}"
network_topology = "${facts.generationProfile.networkTopology === 'public' ? 'public' : 'private'}"
enable_public_compute_ip = ${facts.generationProfile.networkTopology === 'public'}
enable_public_load_balancer = ${facts.generationProfile.networkTopology === 'public'}

# database_password = "CHANGE_ME_DEV_ONLY_SUPPLIED_BY_SECRET_MANAGER"
`;
}

function azureTfvarsExample(facts: WorkloadFacts): string {
  return `project_name = "${facts.projectName}"
environment  = "${facts.environment}"
location     = "${facts.region}"
network_topology = "${facts.generationProfile.networkTopology === 'public' ? 'public' : 'private'}"
enable_public_compute_ip = ${facts.generationProfile.networkTopology === 'public'}
enable_public_load_balancer = ${facts.generationProfile.networkTopology === 'public'}

subscription_id = "CHANGE_ME_DEV_ONLY_AZURE_SUBSCRIPTION_ID"
tenant_id       = "CHANGE_ME_DEV_ONLY_AZURE_TENANT_ID"

# admin_ssh_public_key     = "CHANGE_ME_DEV_ONLY_SSH_PUBLIC_KEY"
# database_admin_password  = "CHANGE_ME_DEV_ONLY_SUPPLIED_BY_SECRET_MANAGER"
`;
}

function gcpTfvarsExample(facts: WorkloadFacts): string {
  return `project_name = "${facts.projectName}"
environment  = "${facts.environment}"
region       = "${facts.region}"
zone         = "${facts.region}-a"
network_topology = "${facts.generationProfile.networkTopology === 'public' ? 'public' : 'private'}"
enable_public_compute_ip = ${facts.generationProfile.networkTopology === 'public'}
enable_public_load_balancer = ${facts.generationProfile.networkTopology === 'public'}

project_id = "CHANGE_ME_DEV_ONLY_GCP_PROJECT_ID"

# database_password = "CHANGE_ME_DEV_ONLY_SUPPLIED_BY_SECRET_MANAGER"
`;
}

function bundleReadme(targetCloud: TerraformTargetCloud, facts: WorkloadFacts): string {
  return `# PolyCost Terraform Bundle - ${providerDisplayName(targetCloud)}

Generated from a PolyCost Normalized Workload Specification for \`${facts.projectName}\`.

## What this bundle includes

- Pinned Terraform provider versions.
- Provider-native authentication expectations.
- Network, compute, object storage, optional relational database, and optional load-balancer baseline resources.
- Cost-allocation tags or labels generated from the workload profile.
- \`backend.tf.example\` for encrypted remote state and locking where the provider supports explicit locks.
- \`Makefile\`, \`.tflint.hcl\`, \`tests/static_validation.tftest.hcl\`, and \`policies/terraform-plan.rego\` when hardening artifacts are enabled.
- \`modules/\` boundary documentation for extracting the reviewed root bundle into internal platform modules.

## Generation profile

- Runtime target: \`${facts.generationProfile.runtimeTarget}\`
- Network topology: \`${facts.generationProfile.networkTopology}\`
- Availability mode: \`${facts.generationProfile.availabilityMode}\`
- Policy pack included: \`${facts.generationProfile.policyPackIncluded}\`
- Module scaffold included: \`${facts.generationProfile.moduleScaffoldIncluded}\`

## Before running

1. Copy \`backend.tf.example\` to \`backend.tf\` only after creating the remote-state storage.
2. Review every generated resource with a solution architect.
3. Supply credentials through the provider-native CLI, OIDC/workload identity, managed identity, or environment variables.
4. Provide sensitive variables from a secret manager or CI secret store.

## Verification

\`\`\`bash
make validate
terraform test
terraform plan -var-file=terraform.tfvars -out=tfplan
terraform show -json tfplan > tfplan.json
conftest test tfplan.json --policy policies
\`\`\`

PolyCost does not run \`apply\`. Treat this as reviewed starter infrastructure, not a managed deployment platform.
`;
}

function commonAssumptions(
  nws: NormalizedWorkloadSpec,
  facts: WorkloadFacts,
  providerName: string,
): string[] {
  const assumptions = [
    `Generated from NWS ${nws.schemaVersion} for ${providerName}; verify provider quotas, naming constraints, and organization guardrails before plan/apply.`,
    `Region defaults to ${facts.region}; edit region variables when latency, residency, or existing landing-zone placement requires a different region.`,
    `Generation profile selected ${facts.generationProfile.runtimeTarget} runtime, ${facts.generationProfile.networkTopology} topology, and ${facts.generationProfile.availabilityMode} availability mode.`,
  ];

  if (facts.generationProfile.runtimeTarget === 'vm') {
    assumptions.push(
      'Generated compute is VM-first for portability across clouds. Container/serverless modules should be selected in a follow-up pass when the workload explicitly requires them.',
    );
  } else {
    assumptions.push(
      `Runtime target ${facts.generationProfile.runtimeTarget} was requested; this bundle keeps a VM baseline plus module-boundary documentation until provider-specific runtime modules are approved.`,
    );
  }

  if (facts.storageSummary.fileCount > 0) {
    assumptions.push(
      'File storage was detected in the NWS but is not provisioned in this first Terraform bundle; add provider-native file storage after access protocol review.',
    );
  }

  if (nws.database.some((database) => !relationalDatabaseEngine(database))) {
    assumptions.push(
      'NoSQL/cache/search/analytics database components are documented for manual module selection instead of being force-mapped to a relational database.',
    );
  }

  if (facts.resourceSummary.multiRegion) {
    assumptions.push(
      'Multi-region was requested; this bundle creates a single-region baseline and requires a DR/active-active module pass before production.',
    );
  }

  return assumptions;
}

function commonSecurityNotes(providerName: string): string[] {
  return [
    `${providerName} credentials are not written into generated Terraform files.`,
    'Remote state is provided as an example file so teams can wire encrypted state after creating the storage backend.',
    'Generated variables mark database passwords and SSH key material as sensitive.',
    'Generated policy scaffolding checks for public database exposure, missing cost tags/labels, and plan-time guardrail drift.',
    'Apply should run only from a controlled CI/CD runner or reviewed operator workstation.',
  ];
}

function commonNextSteps(providerName: string): string[] {
  return [
    `Save the ${providerName} bundle to a new branch or infrastructure repository.`,
    'Run make validate, terraform test, terraform plan, and policy checks before adding environment-specific tfvars.',
    'Attach policy-as-code checks for required tags, encryption, public exposure, and deletion protection.',
  ];
}

function serviceMappings(
  targetCloud: TerraformTargetCloud,
  facts: WorkloadFacts,
): TerraformGenerationResult['serviceMappings'] {
  const mappings: TerraformGenerationResult['serviceMappings'] = [];

  if (facts.resourceSummary.computeInstances > 0) {
    mappings.push({
      requirement: 'compute',
      terraformResource: computeResource(targetCloud),
      confidence: 'direct',
      note: 'NWS compute maps to VM compute for the first deployable baseline.',
    });
  }

  if (facts.generationProfile.runtimeTarget !== 'vm') {
    mappings.push({
      requirement: `${facts.generationProfile.runtimeTarget} runtime`,
      terraformResource: `${providerRuntimeModule(targetCloud, facts.generationProfile.runtimeTarget)} (module boundary)`,
      confidence: 'manual-review',
      note: 'Runtime-specific Terraform is documented as a module boundary until provider, networking, identity, and deployment conventions are selected.',
    });
  }

  if (facts.resourceSummary.objectStorageBuckets > 0) {
    mappings.push({
      requirement: 'object storage',
      terraformResource: objectStorageResource(targetCloud),
      confidence: 'direct',
      note: 'Object storage maps to encrypted provider-native object storage.',
    });
  }

  if (facts.resourceSummary.relationalDatabases > 0) {
    mappings.push({
      requirement: 'relational database',
      terraformResource: relationalDatabaseResource(targetCloud),
      confidence: 'approximate',
      note: 'Engine, HA, backup, private networking, and licensing choices must be reviewed before production.',
    });
  }

  if (facts.resourceSummary.loadBalancers > 0) {
    mappings.push({
      requirement: 'load balancer',
      terraformResource: loadBalancerResource(targetCloud),
      confidence: targetCloud === 'gcp' ? 'manual-review' : 'approximate',
      note:
        targetCloud === 'gcp'
          ? 'GCP reserves an address only; URL map/backend/service resources require app protocol selection.'
          : 'Generated load-balancer shell requires listener/target-pool wiring after app protocol review.',
    });
  }

  return mappings;
}

function validateGeneratedFiles(
  targetCloud: TerraformTargetCloud,
  files: TerraformGeneratedFile[],
  archive: TerraformBundleArchive,
): TerraformGenerationValidation {
  const joined = files.map((file) => file.content).join('\n');
  const checks = [
    {
      id: 'required-provider-pinned',
      status:
        joined.includes(providerSource(targetCloud)) &&
        joined.includes(providerVersion(targetCloud))
          ? 'passed'
          : 'failed',
      message: 'Generated bundle pins the official HashiCorp provider version constraint.',
    },
    {
      id: 'remote-state-example',
      status:
        files.some((file) => file.path === 'backend.tf.example') &&
        joined.includes(remoteBackendIdentifier(targetCloud))
          ? 'passed'
          : 'failed',
      message: 'Generated bundle includes a provider-native remote-state example.',
    },
    {
      id: 'no-hardcoded-runtime-secrets',
      status: containsHardcodedSecretDefault(joined) ? 'failed' : 'passed',
      message: 'Sensitive runtime values are variables/placeholders, not committed defaults.',
    },
    {
      id: 'cost-allocation-tags',
      status:
        joined.includes('Project') || joined.includes('project     = var.project_name')
          ? 'passed'
          : 'failed',
      message: 'Generated resources include cost-allocation tags or labels.',
    },
    {
      id: 'private-database-networking',
      status: hasPrivateDatabaseNetworking(targetCloud, joined) ? 'passed' : 'warning',
      message:
        'Relational database resources are generated with private network exposure controls.',
    },
    {
      id: 'runtime-identity-baseline',
      status: hasRuntimeIdentity(targetCloud, joined) ? 'passed' : 'warning',
      message:
        'Generated compute includes a provider-native runtime identity baseline for least-privilege review.',
    },
    {
      id: 'policy-pack-generated',
      status:
        files.some((file) => file.path === 'policies/terraform-plan.rego') &&
        files.some((file) => file.path === '.tflint.hcl')
          ? 'passed'
          : 'warning',
      message: 'Generated bundle includes policy-as-code and lint scaffolding.',
    },
    {
      id: 'terraform-test-harness',
      status:
        files.some((file) => file.path === 'Makefile') &&
        files.some((file) => file.path === 'tests/static_validation.tftest.hcl')
          ? 'passed'
          : 'warning',
      message: 'Generated bundle includes local validation and terraform test entry points.',
    },
    {
      id: 'bundle-manifest-generated',
      status:
        files.some((file) => file.path === 'BUNDLE-MANIFEST.json') &&
        joined.includes('polycost.terraform.bundle.v1')
          ? 'passed'
          : 'warning',
      message: 'Generated bundle includes a manifest with file hashes and validation commands.',
    },
    {
      id: 'validation-runner-generated',
      status:
        files.some((file) => file.path === 'scripts/validate-bundle.mjs') &&
        joined.includes('terraform-validation-result.json')
          ? 'passed'
          : 'warning',
      message: 'Generated bundle includes an operator-side validation runner script.',
    },
    {
      id: 'zip-archive-generated',
      status:
        archive.format === 'zip' &&
        archive.mimeType === 'application/zip' &&
        archive.contentBase64.length > 0 &&
        archive.sha256.length === 64 &&
        archive.sizeBytes > 0
          ? 'passed'
          : 'warning',
      message: 'Generated Terraform files are packaged into a downloadable ZIP archive.',
    },
    {
      id: 'module-boundary-scaffold',
      status: files.some((file) => file.path === 'modules/README.md') ? 'passed' : 'warning',
      message: 'Generated bundle includes module boundary documentation for platform extraction.',
    },
    {
      id: 'module-library-generated',
      status: hasModuleLibrary(files) ? 'passed' : 'warning',
      message:
        'Generated bundle includes reusable network, compute, and data starter module files.',
    },
    {
      id: 'framework-alignment-pack',
      status: files.some((file) => file.path === 'FRAMEWORK-ALIGNMENT.md') ? 'passed' : 'warning',
      message: 'Generated bundle includes CAF/WAF/Terraform framework alignment evidence.',
    },
    {
      id: 'topology-aware-ingress',
      status: hasTopologyAwareIngress(targetCloud, joined) ? 'passed' : 'warning',
      message:
        'Generated public ingress and load-balancer exposure follow the selected network topology.',
    },
  ] satisfies TerraformGenerationValidation['checks'];
  const status = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'passed';

  return {
    status,
    executionMode: 'static-plus-policy',
    checks,
    commands: [
      {
        command: 'node scripts/validate-bundle.mjs',
        status: 'not-run',
        message:
          'Runs generated validation steps and writes terraform-validation-result.json after saving files.',
      },
      {
        command: 'make validate',
        status: 'not-run',
        message:
          'Runs terraform fmt -check -recursive, init -backend=false, and validate after saving files.',
      },
      {
        command: 'terraform test',
        status: 'not-run',
        message: 'Runs generated static Terraform tests after provider configuration is available.',
      },
      {
        command: 'terraform plan -var-file=terraform.tfvars -out=tfplan',
        status: 'not-run',
        message: 'Creates the provider-authenticated plan artifact in the destination account.',
      },
      {
        command: 'conftest test tfplan.json --policy policies',
        status: 'not-run',
        message: 'Evaluates generated policy-as-code against the Terraform plan JSON.',
      },
    ],
  };
}

function hasModuleLibrary(files: TerraformGeneratedFile[]): boolean {
  const paths = new Set(files.map((file) => file.path));
  const requiredFiles = [
    'modules/network/variables.tf',
    'modules/network/main.tf',
    'modules/network/outputs.tf',
    'modules/compute/variables.tf',
    'modules/compute/main.tf',
    'modules/compute/outputs.tf',
    'modules/data/variables.tf',
    'modules/data/main.tf',
    'modules/data/outputs.tf',
  ];

  return requiredFiles.every((path) => paths.has(path));
}

function hasPrivateDatabaseNetworking(targetCloud: TerraformTargetCloud, content: string): boolean {
  switch (targetCloud) {
    case 'aws':
      return (
        content.includes('subnet_ids = values(aws_subnet.private)[*].id') &&
        content.includes('publicly_accessible    = false')
      );
    case 'azure':
      return (
        content.includes('delegated_subnet_id') &&
        content.includes('private_dns_zone_id') &&
        content.includes('public_network_access_enabled = false')
      );
    case 'gcp':
      return (
        content.includes('google_service_networking_connection') &&
        content.includes('private_network = google_compute_network.main.id') &&
        content.includes('ipv4_enabled = false')
      );
  }
}

function hasRuntimeIdentity(targetCloud: TerraformTargetCloud, content: string): boolean {
  switch (targetCloud) {
    case 'aws':
      return content.includes('aws_iam_instance_profile') && content.includes('aws_iam_role');
    case 'azure':
      return content.includes('identity {') && content.includes('type = "SystemAssigned"');
    case 'gcp':
      return content.includes('google_service_account') && content.includes('service_account {');
  }
}

function hasTopologyAwareIngress(targetCloud: TerraformTargetCloud, content: string): boolean {
  switch (targetCloud) {
    case 'aws':
      return (
        content.includes('var.network_topology == "public" ? ["0.0.0.0/0"]') &&
        content.includes('internal           = !var.enable_public_load_balancer') &&
        content.includes('enable_public_load_balancer')
      );
    case 'azure':
      return (
        content.includes('var.network_topology == "public" ? "Internet" : "VirtualNetwork"') &&
        content.includes('var.enable_public_load_balancer ? "public" : "private"') &&
        content.includes('enable_public_load_balancer')
      );
    case 'gcp':
      return (
        content.includes('var.network_topology == "public" ? ["0.0.0.0/0"]') &&
        content.includes('var.enable_load_balancer && var.enable_public_load_balancer') &&
        content.includes('enable_public_load_balancer')
      );
  }
}

function containsHardcodedSecretDefault(content: string): boolean {
  const withoutComments = content.replace(/#.*$/gm, '');
  const chunks = withoutComments.split(/\n(?=variable\s+")/g);

  return chunks.some((chunk) => {
    const name = chunk.match(/variable\s+"([^"]+)"/)?.[1] ?? '';
    const secretLike =
      /(password|secret|token|private_key|client_secret)/i.test(name) && !/public_key/i.test(name);
    const defaultValue = chunk.match(/\n\s*default\s*=\s*([^\n]+)/)?.[1]?.trim();

    return secretLike && defaultValue !== undefined && defaultValue !== 'null';
  });
}

function generatedFile(path: string, content: string): TerraformGeneratedFile {
  const normalizedContent = ensureTrailingNewline(content);

  return {
    path,
    content: normalizedContent,
    sha256: sha256(normalizedContent),
  };
}

function bundleManifest(input: {
  bundleName: string;
  generatedAt: string;
  targetCloud: TerraformTargetCloud;
  facts: WorkloadFacts;
  files: TerraformGeneratedFile[];
}): string {
  return JSON.stringify(
    {
      schemaVersion: 'polycost.terraform.bundle.v1',
      bundleName: input.bundleName,
      generatedAt: input.generatedAt,
      targetCloud: input.targetCloud,
      workspaceName: input.facts.projectName,
      region: input.facts.region,
      generationProfile: input.facts.generationProfile,
      resourceSummary: input.facts.resourceSummary,
      validationRunner: 'scripts/validate-bundle.mjs',
      validationCommands: [
        'node scripts/validate-bundle.mjs',
        'make validate',
        'terraform test',
        'terraform plan -var-file=terraform.tfvars -out=tfplan',
        'conftest test tfplan.json --policy policies',
      ],
      files: input.files.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        sizeBytes: Buffer.byteLength(file.content, 'utf8'),
      })),
    },
    null,
    2,
  );
}

function zipArchive(filename: string, files: TerraformGeneratedFile[]): TerraformBundleArchive {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of files) {
    const pathBuffer = Buffer.from(entry.path, 'utf8');
    const contentBuffer = Buffer.from(entry.content, 'utf8');
    const checksum = crc32(contentBuffer);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(pathBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, pathBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(pathBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, pathBuffer);
    localOffset += localHeader.length + pathBuffer.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(files.length, 8);
  endOfCentralDirectory.writeUInt16LE(files.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  const archive = Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);

  return {
    filename,
    format: 'zip',
    mimeType: 'application/zip',
    contentBase64: archive.toString('base64'),
    sha256: sha256Buffer(archive),
    sizeBytes: archive.length,
  };
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): number[] {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let checksum = index;

    for (let bit = 0; bit < 8; bit += 1) {
      checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
    }

    table.push(checksum >>> 0);
  }

  return table;
}

function crc32(data: Buffer): number {
  let checksum = 0xffffffff;

  for (const byte of data) {
    const tableIndex = (checksum ^ byte) & 0xff;
    // eslint-disable-next-line security/detect-object-injection -- Reviewed 2026-07-07: CRC table index is masked to 0-255; see docs/SECURITY-SUPPRESSIONS.md.
    checksum = (checksum >>> 8) ^ CRC32_TABLE[tableIndex];
  }

  return (checksum ^ 0xffffffff) >>> 0;
}

function file(path: string, content: string): TerraformBundleDraft['files'][number] {
  return { path, content };
}

function providerSource(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'hashicorp/aws';
    case 'azure':
      return 'hashicorp/azurerm';
    case 'gcp':
      return 'hashicorp/google';
  }
}

function providerVersion(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return '~> 5.0';
    case 'azure':
      return '~> 3.0';
    case 'gcp':
      return '~> 5.0';
  }
}

function remoteBackendIdentifier(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'backend "s3"';
    case 'azure':
      return 'backend "azurerm"';
    case 'gcp':
      return 'backend "gcs"';
  }
}

function computeResource(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'aws_instance.app';
    case 'azure':
      return 'azurerm_linux_virtual_machine.app';
    case 'gcp':
      return 'google_compute_instance.app';
  }
}

function objectStorageResource(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'aws_s3_bucket.object_storage';
    case 'azure':
      return 'azurerm_storage_account.object_storage';
    case 'gcp':
      return 'google_storage_bucket.object_storage';
  }
}

function relationalDatabaseResource(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'aws_db_instance.main';
    case 'azure':
      return 'azurerm_postgresql_flexible_server.main';
    case 'gcp':
      return 'google_sql_database_instance.main';
  }
}

function loadBalancerResource(providerId: ProviderId): string {
  switch (providerId) {
    case 'aws':
      return 'aws_lb.app';
    case 'azure':
      return 'azurerm_lb.app';
    case 'gcp':
      return 'google_compute_global_address.load_balancer';
  }
}

function providerRuntimeModule(
  providerId: ProviderId,
  runtimeTarget: TerraformGenerationProfile['runtimeTarget'],
): string {
  if (runtimeTarget === 'containers') {
    switch (providerId) {
      case 'aws':
        return 'module.ecs_or_eks';
      case 'azure':
        return 'module.aks_or_container_apps';
      case 'gcp':
        return 'module.gke_or_cloud_run';
    }
  }

  if (runtimeTarget === 'serverless') {
    switch (providerId) {
      case 'aws':
        return 'module.lambda_apigateway';
      case 'azure':
        return 'module.functions_app_service';
      case 'gcp':
        return 'module.cloud_functions_cloud_run';
    }
  }

  switch (providerId) {
    case 'aws':
      return 'module.eks';
    case 'azure':
      return 'module.aks';
    case 'gcp':
      return 'module.gke';
  }
}

function awsInstanceType(nws: NormalizedWorkloadSpec): string {
  const firstCompute = nws.compute[0];

  if (!firstCompute) {
    return 't3.micro';
  }

  if (firstCompute.processorArchitecture === 'arm64') {
    return 't4g.micro';
  }

  if ((firstCompute.vcpu ?? 0) >= 8 || firstCompute.instanceFamily === 'compute-optimized') {
    return 'c7i.2xlarge';
  }

  if ((firstCompute.memoryGb ?? 0) >= 32 || firstCompute.instanceFamily === 'memory-optimized') {
    return 'r7i.xlarge';
  }

  if ((firstCompute.vcpu ?? 0) >= 4) {
    return 'm7i.xlarge';
  }

  return 't3.micro';
}

function azureVmSize(nws: NormalizedWorkloadSpec): string {
  const firstCompute = nws.compute[0];

  if (!firstCompute) {
    return 'Standard_B1s';
  }

  if ((firstCompute.vcpu ?? 0) >= 8 || firstCompute.instanceFamily === 'compute-optimized') {
    return 'Standard_F8s_v2';
  }

  if ((firstCompute.memoryGb ?? 0) >= 32 || firstCompute.instanceFamily === 'memory-optimized') {
    return 'Standard_E4s_v5';
  }

  if ((firstCompute.vcpu ?? 0) >= 4) {
    return 'Standard_D4s_v5';
  }

  return 'Standard_B1s';
}

function gcpMachineType(nws: NormalizedWorkloadSpec): string {
  const firstCompute = nws.compute[0];

  if (!firstCompute) {
    return 'e2-micro';
  }

  if ((firstCompute.vcpu ?? 0) >= 8 || firstCompute.instanceFamily === 'compute-optimized') {
    return 'c3-standard-8';
  }

  if ((firstCompute.memoryGb ?? 0) >= 32 || firstCompute.instanceFamily === 'memory-optimized') {
    return 'n2-highmem-4';
  }

  if ((firstCompute.vcpu ?? 0) >= 4) {
    return 'e2-standard-4';
  }

  return 'e2-micro';
}

function awsDatabaseEngine(engine?: DatabaseComponent['engine']): string {
  if (engine === 'mysql') {
    return 'mysql';
  }

  return 'postgres';
}

function regionForProvider(targetCloud: TerraformTargetCloud, regionPreference?: string): string {
  const normalized = regionPreference?.toLowerCase();

  if (!normalized || normalized === 'global') {
    return defaultRegion(targetCloud);
  }

  if (targetCloud === 'aws') {
    if (normalized.includes('west')) {
      return 'us-west-2';
    }
    if (normalized.includes('eu')) {
      return 'eu-west-1';
    }
    if (normalized.includes('asia') || normalized.includes('ap-')) {
      return 'ap-southeast-1';
    }

    return 'us-east-1';
  }

  if (targetCloud === 'azure') {
    if (normalized.includes('west')) {
      return 'West US 2';
    }
    if (normalized.includes('eu') || normalized.includes('europe')) {
      return 'West Europe';
    }
    if (normalized.includes('asia') || normalized.includes('ap-')) {
      return 'Southeast Asia';
    }

    return 'East US';
  }

  if (normalized.includes('west')) {
    return 'us-west1';
  }
  if (normalized.includes('eu') || normalized.includes('europe')) {
    return 'europe-west1';
  }
  if (normalized.includes('asia') || normalized.includes('ap-')) {
    return 'asia-southeast1';
  }

  return 'us-central1';
}

function defaultRegion(targetCloud: TerraformTargetCloud): string {
  switch (targetCloud) {
    case 'aws':
      return 'us-east-1';
    case 'azure':
      return 'East US';
    case 'gcp':
      return 'us-central1';
  }
}

function providerDisplayName(targetCloud: TerraformTargetCloud): string {
  switch (targetCloud) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'GCP';
  }
}

function sanitizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  return /^[a-z]/.test(slug) ? slug : `pc-${slug || 'workload'}`;
}

function sanitizeTagKey(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.:/=+-]/g, '-')
    .slice(0, 64);
}

function hclMap(tags: Record<string, string>, targetCloud: TerraformTargetCloud): string {
  const entries = Object.entries(tags);

  if (entries.length === 0) {
    return '{}';
  }

  const lines = entries
    .map(([key, value]) => {
      const normalizedKey =
        targetCloud === 'gcp' ? key.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : key;
      return `    ${JSON.stringify(normalizedKey)} = ${JSON.stringify(value)}`;
    })
    .join('\n');

  return `{\n${lines}\n  }`;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Buffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
