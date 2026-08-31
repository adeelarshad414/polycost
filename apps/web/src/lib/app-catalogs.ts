// Static catalogs and lookup tables extracted from App.tsx (H-F1, slice 3).
//
// Plain data: storage keys, option lists, label maps, ordering tables and
// defaults. Moving them out frees the remaining pure helpers that referenced
// them, which were otherwise pinned inside the monolith.

import {
  AppPlatformModelRates,
  ComputeSizePreset,
  ComputeSpecificationProfile,
  ComputeStorageDefault,
  InputMode,
  ServerlessFunctionRates,
  ServiceCategory,
  ServiceRequirementCategory,
} from './app-view-types';
import {
  PricingModelKey,
  ProviderId,
  TerraformAvailabilityMode,
  TerraformNetworkTopology,
  TerraformRuntimeTarget,
} from '../types';
import { WorkloadFormState, defaultWorkloadForm } from '../workload';

export const INPUT_MODE_OPTIONS: Array<{
  key: InputMode;
  label: string;
  summaryLabel: string;
  description: string;
}> = [
  {
    key: 'form',
    label: 'Guided form',
    summaryLabel: 'Manual entry',
    description: 'Structured sizing fields',
  },
  {
    key: 'describe',
    label: 'Paste / parse',
    summaryLabel: 'Parsed from text',
    description: 'Natural language or pasted bill text',
  },
  {
    key: 'diagram',
    label: 'Upload diagram',
    summaryLabel: 'Parsed from diagram',
    description: 'Mermaid, draw.io XML, Lucid CSV, or VSDX',
  },
];

export const PRICING_MODEL_STORAGE_KEY = 'polycost-pricing-model';

export const REQUIREMENT_SESSION_STORAGE_KEY = 'polycost-current-requirements-v1';

export const COMPARISON_HISTORY_STORAGE_KEY = 'polycost-comparison-history-v1';

export const AUTH_SESSION_STORAGE_KEY = 'polycost-auth-session-v1';

export const AUTH_SESSION_EXPIRES_AT_STORAGE_KEY = 'polycost-auth-session-expires-at-v1';

export const MAX_COMPARISON_HISTORY_ENTRIES = 8;

export const REQUIREMENTS_FILE_MAX_BYTES = 128 * 1024;

export const DIAGRAM_FILE_MAX_BYTES = 5 * 1024 * 1024;

export const CONFIDENCE_TOOLTIP =
  'Confidence reflects how closely the equivalent service matches on specs, not just name.';

export const HOURS_PER_MONTH_TOOLTIP =
  'AWS/Azure billing standard: 365 days divided by 12 months times 24 hours. Used consistently for all monthly calculations.';

export const SPOT_ESTIMATE_TOOLTIP =
  'Spot prices are estimate ranges, not guaranteed rates. They can change materially by provider, region, instance family, and interruption tolerance; do not treat them as fixed commitments.';

export const REQUIREMENTS_FILE_ACCEPT =
  '.txt,.md,.markdown,.json,.yaml,.yml,text/plain,text/markdown,application/json,application/yaml,application/x-yaml,text/yaml';

export const REQUIREMENTS_FILE_EXTENSIONS = ['.txt', '.md', '.markdown', '.json', '.yaml', '.yml'];

export const REQUIREMENTS_FILE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/yaml',
  'application/x-yaml',
  'text/yaml',
]);

export const DIAGRAM_FILE_ACCEPT =
  '.mmd,.mermaid,.drawio,.xml,.csv,.vsdx,text/plain,text/csv,application/xml,application/vnd.visio,application/vnd.ms-visio.drawing.main+xml,application/octet-stream';

export const DIAGRAM_REVIEW_SERVICE_OPTIONS: Array<{
  label: string;
  serviceCategory: ServiceRequirementCategory;
  serviceType: string;
}> = [
  { label: 'Compute / VM', serviceCategory: 'compute', serviceType: 'vm-compute' },
  { label: 'Container app', serviceCategory: 'containers', serviceType: 'container-app' },
  { label: 'Object storage', serviceCategory: 'storage', serviceType: 'object-storage' },
  { label: 'Relational database', serviceCategory: 'database', serviceType: 'relational-database' },
  { label: 'Load balancer', serviceCategory: 'networking', serviceType: 'load-balancer' },
  { label: 'CDN', serviceCategory: 'networking', serviceType: 'cdn' },
  { label: 'Message queue', serviceCategory: 'integration', serviceType: 'queue' },
  { label: 'Analytics warehouse', serviceCategory: 'analytics', serviceType: 'warehouse' },
];

export const PRICING_MODEL_OPTIONS: Array<{
  key: PricingModelKey;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'on-demand',
    label: 'On-demand',
    shortLabel: 'On-demand',
    description: 'Baseline cached pay-as-you-go pricing.',
  },
  {
    key: 'reserved-1yr',
    label: 'Reserved 1yr',
    shortLabel: 'Reserved 1yr',
    description: 'One-year commitment scenario.',
  },
  {
    key: 'reserved-3yr',
    label: 'Reserved 3yr',
    shortLabel: 'Reserved 3yr',
    description: 'Three-year commitment scenario.',
  },
  {
    key: 'savings-plan',
    label: 'Savings/CUD',
    shortLabel: 'Savings/CUD',
    description: 'Savings Plans, Azure reservations, or GCP committed-use discounts.',
  },
  {
    key: 'spot',
    label: 'Spot estimate',
    shortLabel: 'Spot estimate',
    description: 'Interruptible compute shown as an estimate range.',
  },
];

export const REGION_VARIANCE_PROFILES = [
  {
    regionId: 'us-east',
    multiplier: 1,
    evidence: 'Baseline North America pricing sensitivity.',
  },
  {
    regionId: 'us-central',
    multiplier: 0.99,
    evidence: 'Modeled 1% regional discount for central US capacity sensitivity.',
  },
  {
    regionId: 'us-west',
    multiplier: 1.03,
    evidence: 'Modeled 3% regional premium for west-coast capacity sensitivity.',
  },
  {
    regionId: 'eu-west',
    multiplier: 1.08,
    evidence: 'Modeled 8% regional premium for EU residency/compliance sensitivity.',
  },
  {
    regionId: 'eu-central',
    multiplier: 1.09,
    evidence: 'Modeled 9% regional premium for EU central capacity sensitivity.',
  },
  {
    regionId: 'uk',
    multiplier: 1.1,
    evidence: 'Modeled 10% regional premium for UK residency sensitivity.',
  },
  {
    regionId: 'canada',
    multiplier: 1.04,
    evidence: 'Modeled 4% regional premium for Canada residency sensitivity.',
  },
  {
    regionId: 'ap-southeast',
    multiplier: 1.12,
    evidence: 'Modeled 12% regional premium for APAC latency/residency sensitivity.',
  },
  {
    regionId: 'ap-south',
    multiplier: 0.96,
    evidence: 'Modeled 4% discount sensitivity for lower-cost APAC alternatives.',
  },
] as const;

export const INSTANCE_TIER_OPTIONS: Array<[WorkloadFormState['instanceTier'], string]> = [
  ['small', 'Small - dev/test or light production'],
  ['balanced', 'Balanced - general production'],
  ['compute', 'Compute optimized - CPU-heavy'],
  ['memory', 'Memory optimized - data-heavy'],
  ['storage', 'Storage optimized - high I/O'],
  ['accelerated', 'GPU / accelerated - ML and CUDA'],
  ['custom', 'Custom - use vCPU and memory fields'],
];

export const COMPUTE_SIZE_PRESETS: ComputeSizePreset[] = [
  {
    id: 'burstable-2-4',
    label: 'Burstable 2x4',
    tier: 'small',
    vcpu: 2,
    memoryGb: 4,
    fit: 'Low average CPU',
    families: 'AWS T4g/T3 · Azure Bsv2 · GCP E2 shared',
  },
  {
    id: 'balanced-4-16',
    label: 'Balanced 4x16',
    tier: 'balanced',
    vcpu: 4,
    memoryGb: 16,
    fit: 'General app tier',
    families: 'AWS M7i/M7g · Azure Dv5/Dpsv5 · GCP N2/T2A',
  },
  {
    id: 'balanced-8-32',
    label: 'Balanced 8x32',
    tier: 'balanced',
    vcpu: 8,
    memoryGb: 32,
    fit: 'API or worker tier',
    families: 'AWS M7i/M7g · Azure Dv5/Dpsv5 · GCP N2/T2A',
  },
  {
    id: 'compute-8-16',
    label: 'Compute optimized 8x16',
    tier: 'compute',
    vcpu: 8,
    memoryGb: 16,
    fit: 'CPU-bound service',
    families: 'AWS C7i/C7g · Azure Fsv2 · GCP C3/C2',
  },
  {
    id: 'memory-8-64',
    label: 'Memory optimized 8x64',
    tier: 'memory',
    vcpu: 8,
    memoryGb: 64,
    fit: 'Cache or database',
    families: 'AWS R7i/R7g · Azure Esv5/Epsv5 · GCP M3/M2',
  },
  {
    id: 'storage-16-64',
    label: 'Storage optimized 16x64',
    tier: 'storage',
    vcpu: 16,
    memoryGb: 64,
    fit: 'High I/O data tier',
    families: 'AWS I4i/I4g · Azure Lsv3 · GCP Z3',
  },
  {
    id: 'accelerated-16-64',
    label: 'GPU accelerated 16x64',
    tier: 'accelerated',
    vcpu: 16,
    memoryGb: 64,
    fit: 'CUDA or ML',
    families: 'AWS G5/P4d · Azure NC · GCP A2/G2',
  },
];

export const COMPUTE_STORAGE_DEFAULTS: Record<
  WorkloadFormState['instanceTier'],
  ComputeStorageDefault
> = {
  small: {
    sizeGb: '50',
    storageRole: 'starter disk',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'standard',
  },
  balanced: {
    sizeGb: '100',
    storageRole: 'app data disk',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'standard',
  },
  compute: {
    sizeGb: '100',
    storageRole: 'compute scratch disk',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'standard',
  },
  memory: {
    sizeGb: '250',
    storageRole: 'data working set',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'standard',
  },
  storage: {
    sizeGb: '1000',
    storageRole: 'high I/O data tier',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'premium',
    provisionedIops: '16000',
    provisionedThroughputMbps: '500',
  },
  accelerated: {
    sizeGb: '500',
    storageRole: 'accelerator scratch disk',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'premium',
    provisionedIops: '8000',
    provisionedThroughputMbps: '250',
  },
  custom: {
    sizeGb: '100',
    storageRole: 'custom compute disk',
    storageType: 'block',
    storageAccessPattern: 'frequent',
    storageClass: 'standard',
  },
};

export const PROCESSOR_ARCHITECTURE_OPTIONS: Array<
  [WorkloadFormState['processorArchitecture'], string]
> = [
  ['x86_64', 'x86 - Intel / AMD'],
  ['arm64', 'ARM - Graviton / Ampere / Tau'],
  ['gpu', 'GPU - accelerator attached'],
];

export const COMPUTE_TENANCY_OPTIONS: Array<[WorkloadFormState['computeTenancy'], string]> = [
  ['shared', 'Shared cloud tenancy'],
  ['dedicated-host', 'Dedicated host'],
  ['sole-tenant', 'Sole-tenant node'],
];

export const STORAGE_CLASS_OPTIONS: Array<[WorkloadFormState['storageClass'], string]> = [
  ['standard', 'Standard / hot default'],
  ['hot', 'Azure Hot'],
  ['cool', 'Azure Cool'],
  ['cold', 'Azure Cold'],
  ['nearline', 'GCS Nearline'],
  ['coldline', 'GCS Coldline'],
  ['intelligent-tiering', 'S3 Intelligent-Tiering'],
  ['infrequent-access', 'Infrequent access'],
  ['one-zone-infrequent-access', 'S3 One Zone-IA'],
  ['archive-instant', 'Archive instant'],
  ['archive', 'Archive'],
  ['deep-archive', 'Deep archive'],
  ['premium', 'Premium disk / file'],
  ['ultra', 'Ultra disk'],
];

export const STORAGE_REPLICATION_OPTIONS: Array<[WorkloadFormState['storageReplication'], string]> =
  [
    ['none', 'No replication modeled'],
    ['same-region', 'Same-region replication'],
    ['cross-region', 'Cross-region replication'],
  ];

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'compute',
  'storage',
  'database',
  'network',
  'support',
  'licensing',
  'operations',
];

export const SERVICE_FAMILY_ALIASES: Record<string, string> = {
  s3: 'object-storage',
  t3: 'burstable-compute',
  t4g: 'burstable-compute',
  bseries: 'burstable-compute',
  bsv2: 'burstable-compute',
  e2shared: 'burstable-compute',
  amazons3: 'object-storage',
  blob: 'object-storage',
  azureblob: 'object-storage',
  gcs: 'object-storage',
  cloudstorage: 'object-storage',
  eks: 'container-orchestration',
  aks: 'container-orchestration',
  gke: 'container-orchestration',
  kubernetes: 'container-orchestration',
  lambda: 'serverless-functions',
  cloudfunctions: 'serverless-functions',
  rds: 'relational-database',
  aurora: 'relational-database',
  cloudsql: 'relational-database',
  dynamodb: 'nosql-database',
  cosmosdb: 'nosql-database',
  redis: 'cache',
  cloudfront: 'cdn-edge',
  cdn: 'cdn-edge',
  dns: 'dns',
  route53: 'dns',
  azuredns: 'dns',
  clouddns: 'dns',
  nat: 'private-networking',
  natgateway: 'private-networking',
  vpn: 'private-networking',
  vpngateway: 'private-networking',
  directconnect: 'dedicated-connectivity',
  expressroute: 'dedicated-connectivity',
  cloudinterconnect: 'dedicated-connectivity',
  interconnect: 'dedicated-connectivity',
  sagemaker: 'ml-platform',
  azureml: 'ml-platform',
  azuremachinelearning: 'ml-platform',
  vertexai: 'ml-platform',
  bedrock: 'generative-ai',
  azureopenai: 'generative-ai',
  openai: 'generative-ai',
  gemini: 'generative-ai',
  rekognition: 'ai-apis',
  transcribe: 'ai-apis',
  comprehend: 'ai-apis',
  visionai: 'ai-apis',
  speech: 'ai-apis',
};

export const ENVIRONMENT_OPTIONS: Array<[WorkloadFormState['environment'], string]> = [
  ['production', 'Production'],
  ['staging', 'Staging'],
  ['development', 'Development'],
  ['test', 'Test'],
];

export const OPERATING_SYSTEM_OPTIONS: Array<[WorkloadFormState['operatingSystem'], string]> = [
  ['linux', 'Linux'],
  ['windows', 'Windows'],
  ['byol', 'BYOL'],
];

export const SUPPORT_TIER_OPTIONS: Array<[WorkloadFormState['supportTier'], string]> = [
  ['none', 'No support'],
  ['developer', 'Developer / Standard'],
  ['business', 'Business / Enhanced'],
  ['enterprise_onramp', 'Enterprise On-Ramp / Pro Direct'],
  ['enterprise', 'Enterprise / Premier'],
];

export const USAGE_PATTERN_OPTIONS: Array<[WorkloadFormState['usagePattern'], string]> = [
  ['always_on', 'Always on'],
  ['scheduled', 'Scheduled'],
  ['bursty', 'Bursty'],
];

export const FAULT_TOLERANCE_OPTIONS: Array<[WorkloadFormState['faultTolerance'], string]> = [
  ['single-zone', 'Single-zone'],
  ['multi-az', 'Multi-AZ'],
  ['multi-region', 'Multi-region'],
  ['active-active', 'Active-active'],
];

export const TERRAFORM_RUNTIME_OPTIONS: Array<[TerraformRuntimeTarget, string]> = [
  ['vm', 'VM baseline'],
  ['containers', 'Containers'],
  ['serverless', 'Serverless'],
  ['kubernetes', 'Kubernetes'],
];

export const TERRAFORM_NETWORK_OPTIONS: Array<[TerraformNetworkTopology, string]> = [
  ['private', 'Private first'],
  ['public', 'Public demo'],
  ['landing-zone', 'Landing zone'],
];

export const TERRAFORM_AVAILABILITY_OPTIONS: Array<[TerraformAvailabilityMode, string]> = [
  ['single-region', 'Single region'],
  ['multi-az', 'Multi-AZ'],
  ['multi-region-dr', 'Multi-region DR'],
  ['active-active', 'Active-active'],
];

export const INITIAL_HOME_FORM: WorkloadFormState = {
  ...defaultWorkloadForm,
  workloadName: '',
  dailyActiveUsers: '',
  peakConcurrentUsers: '',
  instanceCount: '1',
  autoscaleMin: '1',
  autoscaleMax: '3',
  storageEnabled: false,
  storageSizeGb: '',
  databaseEnabled: false,
  databaseSizeGb: '',
  monthlyEgressGb: '',
  cdn: false,
  loadBalancer: false,
  selectedServiceCategory: 'compute',
  selectedServiceFamilyId: 'vm-compute',
  instanceTier: 'small',
  availabilityZoneCount: '1',
  selectedServiceFamilyIds: [],
  multiAz: false,
  multiRegion: false,
  slaTarget: '',
};

export const APP_PLATFORM_MODEL_RATES: Record<ProviderId, AppPlatformModelRates> = {
  aws: {
    requestPerMillion: 0,
    vcpuHour: 0.064,
    memoryGbHour: 0.007,
    alwaysOnVcpuHour: 0.064,
    alwaysOnMemoryGbHour: 0.007,
    evidence: 'App Runner-style active vCPU plus provisioned/active memory model.',
  },
  azure: {
    requestPerMillion: 0.4,
    vcpuHour: 0.0864,
    memoryGbHour: 0.009,
    alwaysOnVcpuHour: 0.095,
    alwaysOnMemoryGbHour: 0.012,
    evidence:
      'App Service always-on plan compared with a request-metered managed-app approximation.',
  },
  gcp: {
    requestPerMillion: 0.4,
    vcpuHour: 0.0864,
    memoryGbHour: 0.009,
    alwaysOnVcpuHour: 0.0648,
    alwaysOnMemoryGbHour: 0.00675,
    evidence: 'Cloud Run request-based model compared with always-allocated CPU worker posture.',
  },
};

export const SERVERLESS_FUNCTION_RATES: Record<ProviderId, ServerlessFunctionRates> = {
  aws: {
    requestPerMillion: 0.2,
    gbSecond: 0.0000166667,
    evidence: 'Lambda-style requests plus GB-second duration model.',
  },
  azure: {
    requestPerMillion: 0.2,
    gbSecond: 0.000016,
    evidence: 'Azure Functions-style executions plus GB-second duration model.',
  },
  gcp: {
    requestPerMillion: 0.4,
    gbSecond: 0.0000025,
    evidence: 'Cloud Run functions-style invocations plus GB-second duration model.',
  },
};

export const COMPUTE_ARM_COST_FACTORS: Record<ProviderId, number> = {
  aws: 0.8,
  azure: 0.85,
  gcp: 0.82,
};

export const COMPUTE_SPEC_PROFILES: Record<
  WorkloadFormState['instanceTier'],
  Record<ProviderId, ComputeSpecificationProfile>
> = {
  small: {
    aws: {
      x86Family: 'T3',
      armFamily: 'T4g',
      useCase: 'Burstable/shared-core dev, test, and light production services.',
      networkBaseline: 'Low-to-moderate burst network; CPU credits affect sustained load.',
      diskBaseline: 'General block storage baseline; validate gp3 baseline IOPS.',
      performanceNote: 'Best when average CPU is low and spikes are short.',
    },
    azure: {
      x86Family: 'Bsv2',
      armFamily: 'Bpsv2',
      useCase: 'Burstable app tiers and lightweight services.',
      networkBaseline: 'Variable burst network; validate credit balance under steady CPU.',
      diskBaseline: 'Standard/Premium SSD baseline depends on chosen VM size.',
      performanceNote: 'Use for low average CPU, not sustained compute pressure.',
    },
    gcp: {
      x86Family: 'E2 shared-core',
      armFamily: 'Tau T2A',
      useCase: 'Small web tiers and cost-sensitive background services.',
      networkBaseline: 'Shared-core network profile; validate noisy-neighbor sensitivity.',
      diskBaseline: 'Balanced PD/Standard PD baseline depends on disk size.',
      performanceNote: 'Good entry point when latency targets are not tight.',
    },
  },
  balanced: {
    aws: {
      x86Family: 'M7i / M6i',
      armFamily: 'M7g Graviton3',
      useCase: 'General production services with balanced CPU and memory.',
      networkBaseline: 'Moderate-to-high ENA networking; exact bandwidth scales by size.',
      diskBaseline: 'EBS baseline and burst throughput must be sized with gp3/io2 choice.',
      performanceNote: 'Default landing zone for web, API, and enterprise application tiers.',
    },
    azure: {
      x86Family: 'Dv5 / Dsv5',
      armFamily: 'Dpsv5 Ampere Altra',
      useCase: 'Balanced application and middleware tiers.',
      networkBaseline: 'Accelerated Networking capable; bandwidth scales by VM size.',
      diskBaseline: 'Managed Disk IOPS/throughput depends on Premium/Standard tier.',
      performanceNote: 'Use when CPU-to-memory ratio is conventional.',
    },
    gcp: {
      x86Family: 'N2 / N2D',
      armFamily: 'Tau T2A',
      useCase: 'General purpose services and portable enterprise workloads.',
      networkBaseline: 'Tiered network bandwidth by machine size.',
      diskBaseline: 'Persistent Disk or Hyperdisk baseline must be selected explicitly.',
      performanceNote: 'N2D is useful when AMD economics are acceptable.',
    },
  },
  compute: {
    aws: {
      x86Family: 'C7i / C6i',
      armFamily: 'C7g Graviton3',
      useCase: 'CPU-intensive workloads, web fleets, encoding, and batch processing.',
      networkBaseline: 'Higher packet/network profile than general purpose at similar sizes.',
      diskBaseline: 'EBS throughput should be validated for batch and scratch workloads.',
      performanceNote: 'Choose when CPU saturation, not memory, drives scaling.',
    },
    azure: {
      x86Family: 'Fsv2',
      armFamily: 'Dpsv5 Ampere Altra',
      useCase: 'Compute-heavy APIs, batch jobs, and analytics workers.',
      networkBaseline: 'High CPU-to-memory ratio; validate NIC bandwidth per size.',
      diskBaseline: 'Premium SSD/Ultra Disk if scratch throughput is material.',
      performanceNote: 'Good when app code can trade memory headroom for CPU price.',
    },
    gcp: {
      x86Family: 'C3 / C2',
      armFamily: 'Tau T2A',
      useCase: 'CPU-bound services, simulation, and batch processing.',
      networkBaseline: 'High-performance networking on larger compute-optimized shapes.',
      diskBaseline: 'Use Hyperdisk/Balanced PD when storage throughput gates compute.',
      performanceNote: 'C3/C2 fit latency-sensitive CPU work better than general shapes.',
    },
  },
  memory: {
    aws: {
      x86Family: 'R7i / X2idn',
      armFamily: 'R7g Graviton3',
      useCase: 'Databases, caches, and memory-heavy application tiers.',
      networkBaseline: 'High bandwidth options on larger memory sizes.',
      diskBaseline: 'Validate EBS-optimized throughput and IOPS for database placement.',
      performanceNote: 'Memory-per-dollar is the key comparison metric.',
    },
    azure: {
      x86Family: 'Esv5 / Mv2',
      armFamily: 'Epsv5 Ampere Altra',
      useCase: 'SQL, SAP, cache, and memory-intensive line-of-business workloads.',
      networkBaseline: 'Bandwidth scales materially by VM size and accelerated networking.',
      diskBaseline: 'Premium SSD v2 or Ultra Disk may be required for database I/O.',
      performanceNote: 'Validate RAM headroom before comparing purely on monthly cost.',
    },
    gcp: {
      x86Family: 'M3 / M2',
      armFamily: 'Tau T2A',
      useCase: 'Large in-memory data stores and database engines.',
      networkBaseline: 'High-memory network profiles vary by family and size.',
      diskBaseline: 'Hyperdisk or SSD PD should be modeled for sustained database I/O.',
      performanceNote: 'Check if memory-optimized sizing reduces node count.',
    },
  },
  storage: {
    aws: {
      x86Family: 'I4i / D3',
      armFamily: 'I4g',
      useCase: 'High I/O databases, search, cache, and local NVMe data tiers.',
      networkBaseline: 'High network/EBS bandwidth on local-storage families.',
      diskBaseline: 'Local NVMe or dense HDD profile; validate durability and replication.',
      performanceNote: 'Compare IOPS and throughput beside cost, not GB alone.',
    },
    azure: {
      x86Family: 'Lsv3',
      armFamily: 'Lasv3',
      useCase: 'High-throughput storage engines and latency-sensitive local disk.',
      networkBaseline: 'Storage-optimized networking varies by L-series size.',
      diskBaseline: 'Local NVMe capacity plus managed-disk persistence requirements.',
      performanceNote: 'Validate cache/search durability if using ephemeral local disk.',
    },
    gcp: {
      x86Family: 'Z3',
      armFamily: 'Tau T2A',
      useCase: 'Storage-optimized analytics, databases, and scratch-heavy workloads.',
      networkBaseline: 'High-throughput machine profile; size determines bandwidth.',
      diskBaseline: 'Local SSD and Hyperdisk tradeoffs must be modeled explicitly.',
      performanceNote: 'Use when IOPS/throughput is the limiting factor.',
    },
  },
  accelerated: {
    aws: {
      x86Family: 'G5 / P4d',
      armFamily: 'G5g',
      gpuFamily: 'G5 / P4d',
      useCase: 'CUDA, ML training/inference, graphics, and accelerator workloads.',
      networkBaseline: 'Validate GPU interconnect, EFA, and data-ingest bandwidth.',
      diskBaseline: 'Model local NVMe/EBS throughput for dataset staging.',
      performanceNote: 'GPU availability and model compatibility matter more than list price.',
    },
    azure: {
      x86Family: 'NCv3 / NC A100',
      armFamily: 'NC A100',
      gpuFamily: 'NCv3 / NC A100',
      useCase: 'CUDA, ML, HPC, visualization, and accelerator-backed services.',
      networkBaseline: 'Validate InfiniBand/RDMA support where training scale needs it.',
      diskBaseline: 'Premium SSD/Ultra Disk often required for data staging.',
      performanceNote: 'Confirm GPU SKU quota and framework support before procurement.',
    },
    gcp: {
      x86Family: 'A2 / G2',
      armFamily: 'G2',
      gpuFamily: 'A2 / G2',
      useCase: 'ML training/inference, rendering, and accelerator-heavy workloads.',
      networkBaseline: 'Validate GPU count, local SSD, and network tier for training.',
      diskBaseline: 'Local SSD/Hyperdisk staging can dominate effective throughput.',
      performanceNote: 'Choose by accelerator type and availability zone, not only price.',
    },
  },
  custom: {
    aws: {
      x86Family: 'Custom-sized EC2 family',
      armFamily: 'Custom Graviton target',
      useCase: 'User-defined vCPU/RAM shape; validate nearest family fit.',
      networkBaseline: 'Bandwidth depends on the selected nearest EC2 size.',
      diskBaseline: 'EBS baseline depends on volume type and attached instance size.',
      performanceNote: 'Use the custom profile to pressure-test the sizing assumption.',
    },
    azure: {
      x86Family: 'Custom-sized VM family',
      armFamily: 'Custom Ampere target',
      useCase: 'User-defined vCPU/RAM shape; validate closest VM family.',
      networkBaseline: 'Bandwidth depends on the chosen VM size and NIC limits.',
      diskBaseline: 'Managed Disk IOPS/throughput depends on disk tier and VM size.',
      performanceNote: 'Confirm the closest available SKU before final quote.',
    },
    gcp: {
      x86Family: 'Custom machine type',
      armFamily: 'Custom Tau target',
      useCase: 'Custom CPU/memory ratio where standard shapes are inefficient.',
      networkBaseline: 'Network bandwidth scales with vCPU count and machine family.',
      diskBaseline: 'Persistent Disk or Hyperdisk performance must be sized separately.',
      performanceNote: 'Custom shapes can reduce waste when CPU/RAM ratios are unusual.',
    },
  },
};
