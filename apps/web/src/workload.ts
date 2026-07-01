import { NormalizedWorkloadSpec, ServiceRequirement } from './types';
import {
  CLOUD_SERVICE_CATALOG,
  DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  SERVICE_CATALOG_CATEGORIES,
  orderedServiceFamilyIds,
  serviceCatalogTraceability,
  serviceFamilyIdsFromTraceability,
} from './service-catalog';
import {
  canonicalRegionForRegionPreference,
  DEFAULT_COMPARISON_REGION,
  regionPreferenceForResidencyLock,
} from './region-normalization';

export type WorkloadType = NormalizedWorkloadSpec['workload']['type'];
export type StorageType = NormalizedWorkloadSpec['storage'][number]['type'];
export type StorageClass = NonNullable<NormalizedWorkloadSpec['storage'][number]['storageClass']>;
export type StorageReplication = NonNullable<
  NormalizedWorkloadSpec['storage'][number]['replication']
>;
export type DatabaseEngine = NormalizedWorkloadSpec['database'][number]['engine'];
export type ProcessorArchitecture = NonNullable<
  NormalizedWorkloadSpec['compute'][number]['processorArchitecture']
>;
export type ComputeTenancy = NonNullable<NormalizedWorkloadSpec['compute'][number]['tenancy']>;
export type InstanceTier =
  'small' | 'balanced' | 'compute' | 'memory' | 'storage' | 'accelerated' | 'custom';

export interface WorkloadFormState {
  workloadName: string;
  workloadType: WorkloadType;
  regionPreference: string;
  environment: 'production' | 'staging' | 'development' | 'test';
  commitmentPreferencePercent: string;
  dataResidency: string;
  complianceLocked: boolean;
  complianceFrameworks: string;
  operatingSystem: 'linux' | 'windows' | 'byol';
  supportTier: 'none' | 'developer' | 'business' | 'enterprise';
  usagePattern: 'always_on' | 'scheduled' | 'bursty';
  usageHoursPerDay: string;
  usageDaysPerWeek: string;
  averageUtilizationPercent: string;
  tags: string;
  dailyActiveUsers: string;
  peakConcurrentUsers: string;
  computeRole: string;
  vcpu: string;
  memoryGb: string;
  instanceCount: string;
  scalingType: 'fixed' | 'autoscaling';
  autoscaleMin: string;
  autoscaleMax: string;
  processorArchitecture: ProcessorArchitecture;
  computeTenancy: ComputeTenancy;
  storageEnabled: boolean;
  storageRole: string;
  storageType: StorageType;
  storageSizeGb: string;
  storageAccessPattern: 'frequent' | 'infrequent' | 'archive';
  storageClass: StorageClass;
  monthlyPutRequestsThousand: string;
  monthlyGetRequestsThousand: string;
  monthlyDeleteRequestsThousand: string;
  monthlyListRequestsThousand: string;
  monthlyRetrievalGb: string;
  storageReplication: StorageReplication;
  lifecycleTransitionsThousand: string;
  snapshotSizeGb: string;
  snapshotRetentionDays: string;
  provisionedIops: string;
  provisionedThroughputMbps: string;
  databaseEnabled: boolean;
  databaseRole: string;
  databaseEngine: DatabaseEngine;
  databaseSizeGb: string;
  databaseHighAvailability: boolean;
  databaseBackupStorageGb: string;
  databaseBackupRetentionDays: string;
  databaseProvisionedIops: string;
  databaseReadReplicaCount: string;
  databaseCrossRegionReplicaTransferGb: string;
  databaseNosqlReadRequestUnitsMillion: string;
  databaseNosqlWriteRequestUnitsMillion: string;
  databaseRuPerSecond: string;
  databaseQueryDataTb: string;
  databaseCacheReplicaCount: string;
  databaseStorageGrowthGbPerMonth: string;
  analyticsWarehouseStorageGb: string;
  analyticsWarehouseQueryTb: string;
  analyticsDataLakeStorageGb: string;
  analyticsIntegrationJobHours: string;
  analyticsStreamingIngestGb: string;
  analyticsBiUsers: string;
  integrationQueueMessagesMillion: string;
  integrationEventsMillion: string;
  integrationWorkflowTransitionsThousand: string;
  integrationApiGatewayRequestsMillion: string;
  monthlyEgressGb: string;
  crossAzTransferGb: string;
  interRegionTransferGb: string;
  cdnTrafficGb: string;
  cdnCacheHitRatioPercent: string;
  natGatewayGb: string;
  natGatewayHours: string;
  dnsHostedZones: string;
  dnsQueriesMillion: string;
  loadBalancerProcessedGb: string;
  loadBalancerHours: string;
  observabilityMetricsMillion: string;
  observabilityLogsIngestGb: string;
  observabilityLogRetentionGb: string;
  observabilityAlarms: string;
  observabilityDashboards: string;
  observabilityTracesMillion: string;
  secretsCount: string;
  secretApiCallsTenThousand: string;
  securityProtectedResources: string;
  securityFindingsThousand: string;
  wafWebAclCount: string;
  wafRuleCount: string;
  wafRequestsMillion: string;
  ddosProtectedResources: string;
  functionInvocationsMillion: string;
  functionDurationMs: string;
  functionMemoryMb: string;
  appPlatformRequestsMillion: string;
  appPlatformRequestDurationMs: string;
  appPlatformVcpu: string;
  appPlatformMemoryGb: string;
  appPlatformAlwaysOnHours: string;
  appPlatformMinInstances: string;
  kubernetesClusterCount: string;
  kubernetesWorkerNodeCount: string;
  registryStorageGb: string;
  registryEgressGb: string;
  cdn: boolean;
  loadBalancer: boolean;
  selectedServiceCategory: string;
  selectedServiceFamilyId: string;
  instanceTier: InstanceTier;
  bulkServiceRows: BulkServiceRow[];
  availabilityZoneCount: string;
  selectedServiceFamilyIds: string[];
  multiAz: boolean;
  multiRegion: boolean;
  slaTarget: string;
  faultTolerance: 'single-zone' | 'multi-az' | 'multi-region' | 'active-active';
}

export interface BulkServiceRow {
  id: string;
  serviceFamilyId: string;
  quantity: string;
  tier: string;
  note: string;
}

export interface WorkloadFormIssue {
  field: keyof WorkloadFormState;
  message: string;
}

export interface ArchitectureTemplate {
  id: string;
  label: string;
  summary: string;
  form: WorkloadFormState;
}

type NumericWorkloadFormField =
  | 'dailyActiveUsers'
  | 'peakConcurrentUsers'
  | 'vcpu'
  | 'memoryGb'
  | 'instanceCount'
  | 'autoscaleMin'
  | 'autoscaleMax'
  | 'storageSizeGb'
  | 'monthlyPutRequestsThousand'
  | 'monthlyGetRequestsThousand'
  | 'monthlyDeleteRequestsThousand'
  | 'monthlyListRequestsThousand'
  | 'monthlyRetrievalGb'
  | 'lifecycleTransitionsThousand'
  | 'snapshotSizeGb'
  | 'snapshotRetentionDays'
  | 'provisionedIops'
  | 'provisionedThroughputMbps'
  | 'databaseSizeGb'
  | 'databaseBackupStorageGb'
  | 'databaseBackupRetentionDays'
  | 'databaseProvisionedIops'
  | 'databaseReadReplicaCount'
  | 'databaseCrossRegionReplicaTransferGb'
  | 'databaseNosqlReadRequestUnitsMillion'
  | 'databaseNosqlWriteRequestUnitsMillion'
  | 'databaseRuPerSecond'
  | 'databaseQueryDataTb'
  | 'databaseCacheReplicaCount'
  | 'databaseStorageGrowthGbPerMonth'
  | 'analyticsWarehouseStorageGb'
  | 'analyticsWarehouseQueryTb'
  | 'analyticsDataLakeStorageGb'
  | 'analyticsIntegrationJobHours'
  | 'analyticsStreamingIngestGb'
  | 'analyticsBiUsers'
  | 'integrationQueueMessagesMillion'
  | 'integrationEventsMillion'
  | 'integrationWorkflowTransitionsThousand'
  | 'integrationApiGatewayRequestsMillion'
  | 'monthlyEgressGb'
  | 'crossAzTransferGb'
  | 'interRegionTransferGb'
  | 'cdnTrafficGb'
  | 'cdnCacheHitRatioPercent'
  | 'natGatewayGb'
  | 'natGatewayHours'
  | 'dnsHostedZones'
  | 'dnsQueriesMillion'
  | 'loadBalancerProcessedGb'
  | 'loadBalancerHours'
  | 'observabilityMetricsMillion'
  | 'observabilityLogsIngestGb'
  | 'observabilityLogRetentionGb'
  | 'observabilityAlarms'
  | 'observabilityDashboards'
  | 'observabilityTracesMillion'
  | 'secretsCount'
  | 'secretApiCallsTenThousand'
  | 'securityProtectedResources'
  | 'securityFindingsThousand'
  | 'wafWebAclCount'
  | 'wafRuleCount'
  | 'wafRequestsMillion'
  | 'ddosProtectedResources'
  | 'functionInvocationsMillion'
  | 'functionDurationMs'
  | 'functionMemoryMb'
  | 'appPlatformRequestsMillion'
  | 'appPlatformRequestDurationMs'
  | 'appPlatformVcpu'
  | 'appPlatformMemoryGb'
  | 'appPlatformAlwaysOnHours'
  | 'appPlatformMinInstances'
  | 'kubernetesClusterCount'
  | 'kubernetesWorkerNodeCount'
  | 'registryStorageGb'
  | 'registryEgressGb'
  | 'commitmentPreferencePercent'
  | 'usageHoursPerDay'
  | 'usageDaysPerWeek'
  | 'averageUtilizationPercent';

const serviceCategoryIds = new Set(SERVICE_CATALOG_CATEGORIES.map((category) => category.id));

export const sampleNaturalLanguageInput =
  'A web app for 5,000 daily users with two web servers, a Postgres database, 250GB of upload storage, CDN, load balancing, and multi-AZ availability.';

export const defaultWorkloadForm: WorkloadFormState = {
  workloadName: 'Customer portal',
  workloadType: 'web_app',
  regionPreference: DEFAULT_COMPARISON_REGION,
  environment: 'production',
  commitmentPreferencePercent: '65',
  dataResidency: 'global',
  complianceLocked: false,
  complianceFrameworks: 'SOC 2',
  operatingSystem: 'linux',
  supportTier: 'business',
  usagePattern: 'always_on',
  usageHoursPerDay: '24',
  usageDaysPerWeek: '7',
  averageUtilizationPercent: '85',
  tags: 'team:platform, project:polycost-demo',
  dailyActiveUsers: '5000',
  peakConcurrentUsers: '600',
  computeRole: 'web',
  vcpu: '2',
  memoryGb: '4',
  instanceCount: '2',
  scalingType: 'fixed',
  autoscaleMin: '2',
  autoscaleMax: '6',
  processorArchitecture: 'x86_64',
  computeTenancy: 'shared',
  storageEnabled: true,
  storageRole: 'uploads',
  storageType: 'object',
  storageSizeGb: '250',
  storageAccessPattern: 'frequent',
  storageClass: 'standard',
  monthlyPutRequestsThousand: '0',
  monthlyGetRequestsThousand: '0',
  monthlyDeleteRequestsThousand: '0',
  monthlyListRequestsThousand: '0',
  monthlyRetrievalGb: '0',
  storageReplication: 'none',
  lifecycleTransitionsThousand: '0',
  snapshotSizeGb: '0',
  snapshotRetentionDays: '30',
  provisionedIops: '0',
  provisionedThroughputMbps: '0',
  databaseEnabled: true,
  databaseRole: 'primary',
  databaseEngine: 'postgres',
  databaseSizeGb: '100',
  databaseHighAvailability: true,
  databaseBackupStorageGb: '0',
  databaseBackupRetentionDays: '35',
  databaseProvisionedIops: '0',
  databaseReadReplicaCount: '0',
  databaseCrossRegionReplicaTransferGb: '0',
  databaseNosqlReadRequestUnitsMillion: '0',
  databaseNosqlWriteRequestUnitsMillion: '0',
  databaseRuPerSecond: '0',
  databaseQueryDataTb: '0',
  databaseCacheReplicaCount: '0',
  databaseStorageGrowthGbPerMonth: '0',
  analyticsWarehouseStorageGb: '0',
  analyticsWarehouseQueryTb: '0',
  analyticsDataLakeStorageGb: '0',
  analyticsIntegrationJobHours: '0',
  analyticsStreamingIngestGb: '0',
  analyticsBiUsers: '0',
  integrationQueueMessagesMillion: '0',
  integrationEventsMillion: '0',
  integrationWorkflowTransitionsThousand: '0',
  integrationApiGatewayRequestsMillion: '0',
  monthlyEgressGb: '750',
  crossAzTransferGb: '0',
  interRegionTransferGb: '0',
  cdnTrafficGb: '0',
  cdnCacheHitRatioPercent: '85',
  natGatewayGb: '0',
  natGatewayHours: '0',
  dnsHostedZones: '0',
  dnsQueriesMillion: '0',
  loadBalancerProcessedGb: '0',
  loadBalancerHours: '0',
  observabilityMetricsMillion: '0',
  observabilityLogsIngestGb: '0',
  observabilityLogRetentionGb: '0',
  observabilityAlarms: '0',
  observabilityDashboards: '0',
  observabilityTracesMillion: '0',
  secretsCount: '0',
  secretApiCallsTenThousand: '0',
  securityProtectedResources: '0',
  securityFindingsThousand: '0',
  wafWebAclCount: '0',
  wafRuleCount: '0',
  wafRequestsMillion: '0',
  ddosProtectedResources: '0',
  functionInvocationsMillion: '0',
  functionDurationMs: '100',
  functionMemoryMb: '512',
  appPlatformRequestsMillion: '0',
  appPlatformRequestDurationMs: '400',
  appPlatformVcpu: '1',
  appPlatformMemoryGb: '0.5',
  appPlatformAlwaysOnHours: '730',
  appPlatformMinInstances: '1',
  kubernetesClusterCount: '0',
  kubernetesWorkerNodeCount: '0',
  registryStorageGb: '0',
  registryEgressGb: '0',
  cdn: true,
  loadBalancer: true,
  selectedServiceCategory: 'compute',
  selectedServiceFamilyId: 'vm-compute',
  instanceTier: 'balanced',
  bulkServiceRows: [],
  availabilityZoneCount: '2',
  selectedServiceFamilyIds: DEFAULT_SELECTED_SERVICE_FAMILY_IDS,
  multiAz: true,
  multiRegion: false,
  slaTarget: '99.9%',
  faultTolerance: 'multi-az',
};

export const ARCHITECTURE_TEMPLATES: ArchitectureTemplate[] = [
  {
    id: 'web-application-tier',
    label: 'Web App Tier',
    summary: 'Autoscaled web nodes, object storage, relational database, CDN, and load balancing.',
    form: templateForm({
      workloadName: 'Web application tier',
      workloadType: 'web_app',
      dailyActiveUsers: '10000',
      peakConcurrentUsers: '1200',
      computeRole: 'web',
      vcpu: '4',
      memoryGb: '8',
      instanceCount: '3',
      scalingType: 'autoscaling',
      autoscaleMin: '2',
      autoscaleMax: '8',
      storageSizeGb: '500',
      databaseSizeGb: '150',
      monthlyEgressGb: '1200',
      selectedServiceFamilyIds: [
        'vm-compute',
        'autoscaling-compute',
        'object-storage',
        'relational-database',
        'cdn-edge',
        'load-balancing',
        'monitoring',
      ],
    }),
  },
  {
    id: 'data-analytics-pipeline',
    label: 'Analytics Pipeline',
    summary: 'Scheduled ETL, data lake storage, streaming ingest, and warehouse-style analytics.',
    form: templateForm({
      workloadName: 'Data analytics pipeline',
      workloadType: 'data_pipeline',
      dailyActiveUsers: '500',
      peakConcurrentUsers: '80',
      computeRole: 'etl workers',
      vcpu: '8',
      memoryGb: '32',
      instanceCount: '4',
      scalingType: 'autoscaling',
      autoscaleMin: '2',
      autoscaleMax: '10',
      storageRole: 'data lake',
      storageType: 'object',
      storageSizeGb: '2500',
      storageAccessPattern: 'infrequent',
      databaseEnabled: false,
      databaseHighAvailability: false,
      cdn: false,
      loadBalancer: false,
      usagePattern: 'scheduled',
      usageHoursPerDay: '10',
      usageDaysPerWeek: '5',
      monthlyEgressGb: '1500',
      analyticsWarehouseStorageGb: '500',
      analyticsWarehouseQueryTb: '20',
      analyticsDataLakeStorageGb: '5000',
      analyticsIntegrationJobHours: '120',
      analyticsStreamingIngestGb: '1000',
      analyticsBiUsers: '25',
      selectedServiceCategory: 'analytics',
      selectedServiceFamilyId: 'data-integration',
      selectedServiceFamilyIds: [
        'vm-compute',
        'object-storage',
        'data-lake',
        'data-integration',
        'streaming-analytics',
        'data-warehouse',
        'monitoring',
      ],
    }),
  },
  {
    id: 'machine-learning-training',
    label: 'ML Training',
    summary: 'Burst compute, large object storage, ML platform services, and governance controls.',
    form: templateForm({
      workloadName: 'Machine learning training',
      workloadType: 'ml_workload',
      dailyActiveUsers: '120',
      peakConcurrentUsers: '30',
      computeRole: 'training workers',
      vcpu: '16',
      memoryGb: '64',
      instanceCount: '2',
      instanceTier: 'accelerated',
      scalingType: 'autoscaling',
      autoscaleMin: '1',
      autoscaleMax: '6',
      storageRole: 'training data',
      storageSizeGb: '5000',
      databaseEnabled: false,
      databaseHighAvailability: false,
      usagePattern: 'bursty',
      averageUtilizationPercent: '60',
      monthlyEgressGb: '1000',
      selectedServiceCategory: 'ai',
      selectedServiceFamilyId: 'ml-platform',
      selectedServiceFamilyIds: [
        'vm-compute',
        'object-storage',
        'data-lake',
        'ml-platform',
        'monitoring',
        'keys-secrets',
      ],
    }),
  },
  {
    id: 'high-traffic-api',
    label: 'High-Traffic API',
    summary: 'API edge, autoscaling compute, cache, relational data, WAF, and observability.',
    form: templateForm({
      workloadName: 'High-traffic API',
      workloadType: 'api_backend',
      supportTier: 'enterprise',
      dailyActiveUsers: '100000',
      peakConcurrentUsers: '15000',
      computeRole: 'api nodes',
      vcpu: '4',
      memoryGb: '16',
      instanceCount: '6',
      scalingType: 'autoscaling',
      autoscaleMin: '3',
      autoscaleMax: '20',
      storageEnabled: false,
      databaseSizeGb: '500',
      databaseHighAvailability: true,
      monthlyEgressGb: '5000',
      commitmentPreferencePercent: '75',
      integrationApiGatewayRequestsMillion: '250',
      securityProtectedResources: '120',
      securityFindingsThousand: '30',
      wafWebAclCount: '2',
      wafRuleCount: '12',
      wafRequestsMillion: '250',
      ddosProtectedResources: '1',
      selectedServiceCategory: 'application',
      selectedServiceFamilyId: 'api-gateway',
      selectedServiceFamilyIds: [
        'autoscaling-compute',
        'api-gateway',
        'relational-database',
        'cache',
        'load-balancing',
        'cdn-edge',
        'waf-ddos',
        'monitoring',
        'keys-secrets',
      ],
    }),
  },
  {
    id: 'lamp-stack',
    label: 'LAMP Stack',
    summary: 'Linux web servers, block storage, MySQL-compatible database, DNS, and monitoring.',
    form: templateForm({
      workloadName: 'LAMP stack',
      workloadType: 'web_app',
      supportTier: 'developer',
      dailyActiveUsers: '3000',
      peakConcurrentUsers: '350',
      computeRole: 'web',
      vcpu: '2',
      memoryGb: '4',
      instanceCount: '2',
      scalingType: 'fixed',
      storageType: 'block',
      storageSizeGb: '200',
      databaseEngine: 'mysql',
      databaseSizeGb: '100',
      cdn: false,
      monthlyEgressGb: '400',
      selectedServiceFamilyIds: [
        'vm-compute',
        'block-storage',
        'relational-database',
        'load-balancing',
        'dns',
        'monitoring',
      ],
    }),
  },
  {
    id: 'three-tier-enterprise-app',
    label: 'Three-Tier Enterprise',
    summary: 'Presentation, app, and data tiers with compliance, private network, and logging.',
    form: templateForm({
      workloadName: 'Three-tier enterprise app',
      workloadType: 'api_backend',
      supportTier: 'enterprise',
      complianceLocked: true,
      complianceFrameworks: 'SOC 2, ISO 27001',
      dailyActiveUsers: '25000',
      peakConcurrentUsers: '3500',
      computeRole: 'application tier',
      vcpu: '4',
      memoryGb: '16',
      instanceCount: '4',
      scalingType: 'autoscaling',
      autoscaleMin: '2',
      autoscaleMax: '12',
      storageSizeGb: '1000',
      databaseSizeGb: '500',
      monthlyEgressGb: '2500',
      securityProtectedResources: '180',
      securityFindingsThousand: '45',
      wafWebAclCount: '2',
      wafRuleCount: '16',
      wafRequestsMillion: '120',
      ddosProtectedResources: '1',
      selectedServiceCategory: 'application',
      selectedServiceFamilyId: 'app-platform',
      selectedServiceFamilyIds: [
        'autoscaling-compute',
        'app-platform',
        'object-storage',
        'relational-database',
        'cache',
        'load-balancing',
        'cdn-edge',
        'private-networking',
        'identity-access',
        'keys-secrets',
        'waf-ddos',
        'monitoring',
        'logging-audit',
      ],
    }),
  },
  {
    id: 'microservices-platform',
    label: 'Microservices',
    summary: 'Kubernetes, containers, registry, messaging, CI/CD, observability, and IaC controls.',
    form: templateForm({
      workloadName: 'Microservices platform',
      workloadType: 'api_backend',
      dailyActiveUsers: '40000',
      peakConcurrentUsers: '6000',
      computeRole: 'worker nodes',
      vcpu: '4',
      memoryGb: '16',
      instanceCount: '5',
      scalingType: 'autoscaling',
      autoscaleMin: '3',
      autoscaleMax: '15',
      storageSizeGb: '750',
      databaseSizeGb: '250',
      monthlyEgressGb: '2000',
      integrationQueueMessagesMillion: '75',
      integrationEventsMillion: '40',
      integrationWorkflowTransitionsThousand: '120',
      selectedServiceCategory: 'containers',
      selectedServiceFamilyId: 'container-orchestration',
      selectedServiceFamilyIds: [
        'container-orchestration',
        'serverless-containers',
        'container-registry',
        'relational-database',
        'cache',
        'queues-messaging',
        'eventing',
        'load-balancing',
        'monitoring',
        'logging-audit',
        'cicd',
        'iac-config',
      ],
    }),
  },
];

function templateForm(overrides: Partial<WorkloadFormState>): WorkloadFormState {
  const selectedServiceFamilyIds =
    overrides.selectedServiceFamilyIds ?? defaultWorkloadForm.selectedServiceFamilyIds;

  return {
    ...defaultWorkloadForm,
    ...overrides,
    selectedServiceFamilyIds: orderedServiceFamilyIds(selectedServiceFamilyIds),
  };
}

export function validateWorkloadForm(form: WorkloadFormState): WorkloadFormIssue[] {
  const issues: WorkloadFormIssue[] = [];

  requirePositiveNumber(issues, form, 'vcpu', 'vCPU must be greater than 0.');
  requirePositiveNumber(issues, form, 'memoryGb', 'Memory must be greater than 0.');
  requirePositiveInteger(
    issues,
    form,
    'instanceCount',
    'Instances must be a whole number above 0.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'dailyActiveUsers',
    'Daily users must be a whole number 0 or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'peakConcurrentUsers',
    'Peak users must be a whole number 0 or higher.',
  );

  if (form.scalingType === 'autoscaling') {
    requirePositiveInteger(
      issues,
      form,
      'autoscaleMin',
      'Scale min must be a whole number above 0.',
    );
    requirePositiveInteger(
      issues,
      form,
      'autoscaleMax',
      'Scale max must be a whole number above 0.',
    );

    const autoscaleMin = parseOptionalNumber(form.autoscaleMin);
    const autoscaleMax = parseOptionalNumber(form.autoscaleMax);

    if (
      autoscaleMin !== undefined &&
      autoscaleMax !== undefined &&
      autoscaleMin > 0 &&
      autoscaleMax > 0 &&
      Number.isInteger(autoscaleMin) &&
      Number.isInteger(autoscaleMax) &&
      autoscaleMax < autoscaleMin
    ) {
      issues.push({
        field: 'autoscaleMax',
        message: 'Scale max must be greater than or equal to scale min.',
      });
    }
  }

  if (form.storageEnabled) {
    requirePositiveNumber(issues, form, 'storageSizeGb', 'Storage must be greater than 0 GB.');
    optionalNonNegativeNumberField(
      issues,
      form,
      'monthlyPutRequestsThousand',
      'PUT/write requests must be 0 thousand or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'monthlyGetRequestsThousand',
      'GET/read requests must be 0 thousand or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'monthlyDeleteRequestsThousand',
      'DELETE requests must be 0 thousand or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'monthlyListRequestsThousand',
      'LIST requests must be 0 thousand or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'monthlyRetrievalGb',
      'Retrieval volume must be 0 GB or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'lifecycleTransitionsThousand',
      'Lifecycle transitions must be 0 thousand or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'snapshotSizeGb',
      'Snapshot storage must be 0 GB or higher.',
    );
    requireBoundedInteger(
      issues,
      form,
      'snapshotRetentionDays',
      0,
      3650,
      'Snapshot retention must be a whole number from 0 to 3650 days.',
    );
    optionalNonNegativeIntegerField(
      issues,
      form,
      'provisionedIops',
      'Provisioned IOPS must be a whole number 0 or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'provisionedThroughputMbps',
      'Provisioned throughput must be 0 MB/s or higher.',
    );
  }

  if (form.databaseEnabled) {
    optionalPositiveNumberField(
      issues,
      form,
      'databaseSizeGb',
      'Database size must be greater than 0 GB when provided.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'databaseBackupStorageGb',
      'Backup storage must be 0 GB or higher.',
    );
    requireBoundedInteger(
      issues,
      form,
      'databaseBackupRetentionDays',
      0,
      3650,
      'Backup retention must be a whole number from 0 to 3650 days.',
    );
    optionalNonNegativeIntegerField(
      issues,
      form,
      'databaseProvisionedIops',
      'Database IOPS must be a whole number 0 or higher.',
    );
    optionalNonNegativeIntegerField(
      issues,
      form,
      'databaseReadReplicaCount',
      'Read replicas must be a whole number 0 or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'databaseCrossRegionReplicaTransferGb',
      'Replica transfer must be 0 GB or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'databaseNosqlReadRequestUnitsMillion',
      'NoSQL read units must be 0 million or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'databaseNosqlWriteRequestUnitsMillion',
      'NoSQL write units must be 0 million or higher.',
    );
    optionalNonNegativeIntegerField(
      issues,
      form,
      'databaseRuPerSecond',
      'RU/s capacity must be a whole number 0 or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'databaseQueryDataTb',
      'Query volume must be 0 TB or higher.',
    );
    optionalNonNegativeIntegerField(
      issues,
      form,
      'databaseCacheReplicaCount',
      'Cache replicas must be a whole number 0 or higher.',
    );
    optionalNonNegativeNumberField(
      issues,
      form,
      'databaseStorageGrowthGbPerMonth',
      'Database storage growth must be 0 GB/month or higher.',
    );
  }

  optionalNonNegativeNumberField(
    issues,
    form,
    'analyticsWarehouseStorageGb',
    'Warehouse storage must be 0 GB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'analyticsWarehouseQueryTb',
    'Warehouse query volume must be 0 TB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'analyticsDataLakeStorageGb',
    'Data lake storage must be 0 GB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'analyticsIntegrationJobHours',
    'Data integration job hours must be 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'analyticsStreamingIngestGb',
    'Streaming ingest must be 0 GB or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'analyticsBiUsers',
    'BI users must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'integrationQueueMessagesMillion',
    'Queue messages must be 0 million or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'integrationEventsMillion',
    'Event routing volume must be 0 million or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'integrationWorkflowTransitionsThousand',
    'Workflow transitions must be 0 thousand or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'integrationApiGatewayRequestsMillion',
    'API gateway requests must be 0 million or higher.',
  );

  optionalNonNegativeNumberField(issues, form, 'monthlyEgressGb', 'Egress must be 0 GB or higher.');
  optionalNonNegativeNumberField(
    issues,
    form,
    'crossAzTransferGb',
    'Cross-AZ transfer must be 0 GB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'interRegionTransferGb',
    'Inter-region transfer must be 0 GB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'cdnTrafficGb',
    'CDN-served traffic must be 0 GB or higher.',
  );
  requireBoundedNumber(
    issues,
    form,
    'cdnCacheHitRatioPercent',
    0,
    100,
    'CDN cache hit ratio must be between 0 and 100.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'natGatewayGb',
    'NAT processed data must be 0 GB or higher.',
  );
  requireBoundedNumber(
    issues,
    form,
    'natGatewayHours',
    0,
    730,
    'NAT hours must be between 0 and 730.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'dnsHostedZones',
    'DNS hosted zones must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'dnsQueriesMillion',
    'DNS queries must be 0 million or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'loadBalancerProcessedGb',
    'Load balancer data processed must be 0 GB or higher.',
  );
  requireBoundedNumber(
    issues,
    form,
    'loadBalancerHours',
    0,
    730,
    'Load balancer hours must be between 0 and 730.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'observabilityMetricsMillion',
    'Metric samples must be 0 million or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'observabilityLogsIngestGb',
    'Log ingestion must be 0 GB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'observabilityLogRetentionGb',
    'Log retention storage must be 0 GB or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'observabilityAlarms',
    'Alarms must be a whole number 0 or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'observabilityDashboards',
    'Dashboards must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'observabilityTracesMillion',
    'Trace spans must be 0 million or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'secretsCount',
    'Secrets must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'secretApiCallsTenThousand',
    'Secret API calls must be 0 ten-thousand-call units or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'securityProtectedResources',
    'Security protected resources must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'securityFindingsThousand',
    'Security findings must be 0 thousand or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'wafWebAclCount',
    'WAF ACLs must be a whole number 0 or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'wafRuleCount',
    'WAF rules must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'wafRequestsMillion',
    'WAF requests must be 0 million or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'ddosProtectedResources',
    'DDoS protected resources must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'functionInvocationsMillion',
    'Function invocations must be 0 million or higher.',
  );
  requirePositiveNumber(
    issues,
    form,
    'functionDurationMs',
    'Function duration must be greater than 0 ms.',
  );
  requirePositiveInteger(
    issues,
    form,
    'functionMemoryMb',
    'Function memory must be a whole number above 0 MB.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'appPlatformRequestsMillion',
    'App platform requests must be 0 million or higher.',
  );
  requirePositiveNumber(
    issues,
    form,
    'appPlatformRequestDurationMs',
    'App platform request duration must be greater than 0 ms.',
  );
  requirePositiveNumber(
    issues,
    form,
    'appPlatformVcpu',
    'App platform vCPU must be greater than 0.',
  );
  requirePositiveNumber(
    issues,
    form,
    'appPlatformMemoryGb',
    'App platform memory must be greater than 0 GB.',
  );
  requireBoundedNumber(
    issues,
    form,
    'appPlatformAlwaysOnHours',
    0,
    730,
    'App platform always-on hours must be between 0 and 730.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'appPlatformMinInstances',
    'App platform minimum instances must be a whole number 0 or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'kubernetesClusterCount',
    'Kubernetes clusters must be a whole number 0 or higher.',
  );
  optionalNonNegativeIntegerField(
    issues,
    form,
    'kubernetesWorkerNodeCount',
    'Kubernetes worker nodes must be a whole number 0 or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'registryStorageGb',
    'Registry storage must be 0 GB or higher.',
  );
  optionalNonNegativeNumberField(
    issues,
    form,
    'registryEgressGb',
    'Registry egress must be 0 GB or higher.',
  );
  requireBoundedNumber(
    issues,
    form,
    'commitmentPreferencePercent',
    0,
    100,
    'Commitment preference must be between 0 and 100.',
  );

  if (form.usagePattern === 'scheduled') {
    requireBoundedNumber(
      issues,
      form,
      'usageHoursPerDay',
      1,
      24,
      'Usage hours/day must be between 1 and 24.',
    );
    requireBoundedInteger(
      issues,
      form,
      'usageDaysPerWeek',
      1,
      7,
      'Usage days/week must be a whole number from 1 to 7.',
    );
  }

  if (form.usagePattern === 'bursty') {
    requireBoundedNumber(
      issues,
      form,
      'averageUtilizationPercent',
      1,
      100,
      'Average utilization must be between 1 and 100.',
    );
  }

  for (const row of form.bulkServiceRows) {
    const serviceExists = CLOUD_SERVICE_CATALOG.some((family) => family.id === row.serviceFamilyId);
    const quantity = parseOptionalNumber(row.quantity);

    if (!serviceExists || quantity === undefined || quantity <= 0 || !Number.isInteger(quantity)) {
      issues.push({
        field: 'bulkServiceRows',
        message:
          'Bulk service rows must match a supported cloud service and use whole-number quantities above 0.',
      });
      break;
    }
  }

  return issues;
}

export function buildNwsFromForm(
  form: WorkloadFormState,
  source: 'structured_form' | 'natural_language' = 'structured_form',
  rawInput?: string,
): NormalizedWorkloadSpec {
  const compute = {
    role: form.computeRole.trim() || 'web',
    ...instanceFamilyForTier(form.instanceTier),
    processorArchitecture: processorArchitectureForForm(form),
    tenancy: form.computeTenancy,
    ...optionalPositiveNumber('vcpu', form.vcpu),
    ...optionalPositiveNumber('memoryGb', form.memoryGb),
    ...optionalPositiveInteger('instanceCount', form.instanceCount),
    scalingType: form.scalingType,
    ...(form.scalingType === 'autoscaling'
      ? {
          autoscalingRange: {
            min: parseNonNegativeInteger(form.autoscaleMin, 1),
            max: parseNonNegativeInteger(form.autoscaleMax, 3),
          },
        }
      : {}),
  };

  return {
    schemaVersion: '1.0',
    metadata: {
      sourceType: source,
      ...(rawInput ? { rawInput } : {}),
      createdAt: new Date().toISOString(),
    },
    workload: {
      ...(form.workloadName.trim() ? { name: form.workloadName.trim() } : {}),
      type: form.workloadType,
      expectedUsers: {
        ...optionalNonNegativeInteger('dailyActiveUsers', form.dailyActiveUsers),
        ...optionalNonNegativeInteger('peakConcurrentUsers', form.peakConcurrentUsers),
      },
      region: normalizedRegionPreference(
        form.regionPreference,
        form.dataResidency,
        form.complianceLocked,
      ),
    },
    compute: [compute],
    storage: form.storageEnabled
      ? [
          {
            role: form.storageRole.trim() || 'storage',
            type: form.storageType,
            sizeGb: parsePositiveNumber(form.storageSizeGb, 1),
            accessPattern: form.storageAccessPattern,
            ...storageAdvancedAssumptionsFromForm(form),
          },
        ]
      : [],
    database: form.databaseEnabled
      ? [
          {
            role: form.databaseRole.trim() || 'database',
            engine: form.databaseEngine,
            ...optionalPositiveNumber('sizeGb', form.databaseSizeGb),
            highAvailability: form.databaseHighAvailability,
            ...databaseAdvancedAssumptionsFromForm(form),
          },
        ]
      : [],
    network: {
      ...optionalNonNegativeNumber('estimatedMonthlyEgressGb', form.monthlyEgressGb),
      ...optionalPositiveNumber('crossAzTransferGb', form.crossAzTransferGb),
      ...optionalPositiveNumber('interRegionTransferGb', form.interRegionTransferGb),
      ...optionalPositiveNumber('cdnTrafficGb', form.cdnTrafficGb),
      ...(parsePositiveNumber(form.cdnTrafficGb, 0) > 0
        ? {
            cdnCacheHitRatioPercent: parseBoundedNumber(form.cdnCacheHitRatioPercent, 0, 100, 85),
          }
        : {}),
      ...optionalPositiveNumber('natGatewayGb', form.natGatewayGb),
      ...optionalPositiveNumber('natGatewayHours', form.natGatewayHours),
      ...optionalPositiveInteger('dnsHostedZones', form.dnsHostedZones),
      ...optionalPositiveNumber('dnsQueriesMillion', form.dnsQueriesMillion),
      ...optionalPositiveNumber('loadBalancerProcessedGb', form.loadBalancerProcessedGb),
      ...optionalPositiveNumber('loadBalancerHours', form.loadBalancerHours),
      cdn: form.cdn,
      loadBalancer: form.loadBalancer,
    },
    availability: {
      multiAz: form.multiAz,
      multiRegion: form.multiRegion,
      ...(form.slaTarget.trim() ? { slaTarget: form.slaTarget.trim() } : {}),
      faultTolerance: form.faultTolerance,
    },
    workloadProfile: {
      environment: form.environment,
      commitmentPreferencePercent: parseBoundedNumber(form.commitmentPreferencePercent, 0, 100, 0),
      dataResidency: {
        scope: form.dataResidency.trim() || 'global',
        complianceLocked: form.complianceLocked,
        ...optionalStringList('frameworks', form.complianceFrameworks),
      },
      operatingSystem: form.operatingSystem,
      supportTier: form.supportTier,
      usagePattern: {
        type: form.usagePattern,
        ...(form.usagePattern === 'scheduled'
          ? {
              hoursPerDay: parseBoundedNumber(form.usageHoursPerDay, 1, 24, 24),
              daysPerWeek: parseBoundedInteger(form.usageDaysPerWeek, 1, 7, 7),
            }
          : {}),
        ...(form.usagePattern === 'bursty'
          ? {
              averageUtilizationPercent: parseBoundedNumber(
                form.averageUtilizationPercent,
                1,
                100,
                55,
              ),
            }
          : {}),
      },
      ...optionalTagList('tags', form.tags),
    },
    serviceRequirements: serviceRequirementsFromForm(form),
    sourceTraceability: serviceCatalogTraceability(traceableServiceFamilyIds(form)),
  };
}

export function formFromNws(nws: NormalizedWorkloadSpec): WorkloadFormState {
  const compute = nws.compute[0];
  const storage = nws.storage[0];
  const database = nws.database[0];
  const supportingServices = supportingServiceScaleParamsFromNws(nws);
  const runtimeServices = runtimeScaleParamsFromNws(nws);
  const analyticsServices = analyticsScaleParamsFromNws(nws);
  const integrationServices = integrationScaleParamsFromNws(nws);

  return {
    ...defaultWorkloadForm,
    workloadName: nws.workload.name ?? defaultWorkloadForm.workloadName,
    workloadType: nws.workload.type,
    regionPreference: nws.workload.region.preference ?? '',
    environment: nws.workloadProfile?.environment ?? defaultWorkloadForm.environment,
    commitmentPreferencePercent: numberToInput(
      nws.workloadProfile?.commitmentPreferencePercent ??
        Number(defaultWorkloadForm.commitmentPreferencePercent),
    ),
    dataResidency: nws.workloadProfile?.dataResidency?.scope ?? defaultWorkloadForm.dataResidency,
    complianceLocked:
      nws.workloadProfile?.dataResidency?.complianceLocked ?? defaultWorkloadForm.complianceLocked,
    complianceFrameworks:
      nws.workloadProfile?.dataResidency?.frameworks?.join(', ') ??
      defaultWorkloadForm.complianceFrameworks,
    operatingSystem: nws.workloadProfile?.operatingSystem ?? defaultWorkloadForm.operatingSystem,
    supportTier: nws.workloadProfile?.supportTier ?? defaultWorkloadForm.supportTier,
    usagePattern: nws.workloadProfile?.usagePattern?.type ?? defaultWorkloadForm.usagePattern,
    usageHoursPerDay: numberToInput(
      nws.workloadProfile?.usagePattern?.hoursPerDay ??
        Number(defaultWorkloadForm.usageHoursPerDay),
    ),
    usageDaysPerWeek: numberToInput(
      nws.workloadProfile?.usagePattern?.daysPerWeek ??
        Number(defaultWorkloadForm.usageDaysPerWeek),
    ),
    averageUtilizationPercent: numberToInput(
      nws.workloadProfile?.usagePattern?.averageUtilizationPercent ??
        Number(defaultWorkloadForm.averageUtilizationPercent),
    ),
    tags:
      nws.workloadProfile?.tags?.map((tag) => `${tag.key}:${tag.value}`).join(', ') ??
      defaultWorkloadForm.tags,
    dailyActiveUsers: numberToInput(nws.workload.expectedUsers?.dailyActiveUsers),
    peakConcurrentUsers: numberToInput(nws.workload.expectedUsers?.peakConcurrentUsers),
    computeRole: compute?.role ?? defaultWorkloadForm.computeRole,
    vcpu: numberToInput(compute?.vcpu),
    memoryGb: numberToInput(compute?.memoryGb),
    instanceCount: numberToInput(compute?.instanceCount),
    scalingType: compute?.scalingType ?? defaultWorkloadForm.scalingType,
    autoscaleMin: numberToInput(compute?.autoscalingRange?.min),
    autoscaleMax: numberToInput(compute?.autoscalingRange?.max),
    processorArchitecture:
      compute?.processorArchitecture ?? defaultWorkloadForm.processorArchitecture,
    computeTenancy: compute?.tenancy ?? defaultWorkloadForm.computeTenancy,
    storageEnabled: Boolean(storage),
    storageRole: storage?.role ?? defaultWorkloadForm.storageRole,
    storageType: storage?.type ?? defaultWorkloadForm.storageType,
    storageSizeGb: numberToInput(storage?.sizeGb),
    storageAccessPattern: storage?.accessPattern ?? defaultWorkloadForm.storageAccessPattern,
    storageClass: storage?.storageClass ?? defaultWorkloadForm.storageClass,
    monthlyPutRequestsThousand: numberToInput(
      storage?.monthlyPutRequestsThousand ?? Number(defaultWorkloadForm.monthlyPutRequestsThousand),
    ),
    monthlyGetRequestsThousand: numberToInput(
      storage?.monthlyGetRequestsThousand ?? Number(defaultWorkloadForm.monthlyGetRequestsThousand),
    ),
    monthlyDeleteRequestsThousand: numberToInput(
      storage?.monthlyDeleteRequestsThousand ??
        Number(defaultWorkloadForm.monthlyDeleteRequestsThousand),
    ),
    monthlyListRequestsThousand: numberToInput(
      storage?.monthlyListRequestsThousand ??
        Number(defaultWorkloadForm.monthlyListRequestsThousand),
    ),
    monthlyRetrievalGb: numberToInput(
      storage?.monthlyRetrievalGb ?? Number(defaultWorkloadForm.monthlyRetrievalGb),
    ),
    storageReplication: storage?.replication ?? defaultWorkloadForm.storageReplication,
    lifecycleTransitionsThousand: numberToInput(
      storage?.lifecycleTransitionsThousand ??
        Number(defaultWorkloadForm.lifecycleTransitionsThousand),
    ),
    snapshotSizeGb: numberToInput(
      storage?.snapshotSizeGb ?? Number(defaultWorkloadForm.snapshotSizeGb),
    ),
    snapshotRetentionDays: numberToInput(
      storage?.snapshotRetentionDays ?? Number(defaultWorkloadForm.snapshotRetentionDays),
    ),
    provisionedIops: numberToInput(
      storage?.provisionedIops ?? Number(defaultWorkloadForm.provisionedIops),
    ),
    provisionedThroughputMbps: numberToInput(
      storage?.provisionedThroughputMbps ?? Number(defaultWorkloadForm.provisionedThroughputMbps),
    ),
    databaseEnabled: Boolean(database),
    databaseRole: database?.role ?? defaultWorkloadForm.databaseRole,
    databaseEngine: database?.engine ?? defaultWorkloadForm.databaseEngine,
    databaseSizeGb: numberToInput(database?.sizeGb),
    databaseHighAvailability:
      database?.highAvailability ?? defaultWorkloadForm.databaseHighAvailability,
    databaseBackupStorageGb: numberToInput(
      database?.backupStorageGb ?? Number(defaultWorkloadForm.databaseBackupStorageGb),
    ),
    databaseBackupRetentionDays: numberToInput(
      database?.backupRetentionDays ?? Number(defaultWorkloadForm.databaseBackupRetentionDays),
    ),
    databaseProvisionedIops: numberToInput(
      database?.provisionedIops ?? Number(defaultWorkloadForm.databaseProvisionedIops),
    ),
    databaseReadReplicaCount: numberToInput(
      database?.readReplicaCount ?? Number(defaultWorkloadForm.databaseReadReplicaCount),
    ),
    databaseCrossRegionReplicaTransferGb: numberToInput(
      database?.crossRegionReplicaTransferGb ??
        Number(defaultWorkloadForm.databaseCrossRegionReplicaTransferGb),
    ),
    databaseNosqlReadRequestUnitsMillion: numberToInput(
      database?.nosqlReadRequestUnitsMillion ??
        Number(defaultWorkloadForm.databaseNosqlReadRequestUnitsMillion),
    ),
    databaseNosqlWriteRequestUnitsMillion: numberToInput(
      database?.nosqlWriteRequestUnitsMillion ??
        Number(defaultWorkloadForm.databaseNosqlWriteRequestUnitsMillion),
    ),
    databaseRuPerSecond: numberToInput(
      database?.ruPerSecond ?? Number(defaultWorkloadForm.databaseRuPerSecond),
    ),
    databaseQueryDataTb: numberToInput(
      database?.queryDataTb ?? Number(defaultWorkloadForm.databaseQueryDataTb),
    ),
    databaseCacheReplicaCount: numberToInput(
      database?.cacheReplicaCount ?? Number(defaultWorkloadForm.databaseCacheReplicaCount),
    ),
    databaseStorageGrowthGbPerMonth: numberToInput(
      database?.storageGrowthGbPerMonth ??
        Number(defaultWorkloadForm.databaseStorageGrowthGbPerMonth),
    ),
    analyticsWarehouseStorageGb: numberToInput(
      analyticsServices.analyticsWarehouseStorageGb ??
        Number(defaultWorkloadForm.analyticsWarehouseStorageGb),
    ),
    analyticsWarehouseQueryTb: numberToInput(
      analyticsServices.analyticsWarehouseQueryTb ??
        Number(defaultWorkloadForm.analyticsWarehouseQueryTb),
    ),
    analyticsDataLakeStorageGb: numberToInput(
      analyticsServices.analyticsDataLakeStorageGb ??
        Number(defaultWorkloadForm.analyticsDataLakeStorageGb),
    ),
    analyticsIntegrationJobHours: numberToInput(
      analyticsServices.analyticsIntegrationJobHours ??
        Number(defaultWorkloadForm.analyticsIntegrationJobHours),
    ),
    analyticsStreamingIngestGb: numberToInput(
      analyticsServices.analyticsStreamingIngestGb ??
        Number(defaultWorkloadForm.analyticsStreamingIngestGb),
    ),
    analyticsBiUsers: numberToInput(
      analyticsServices.analyticsBiUsers ?? Number(defaultWorkloadForm.analyticsBiUsers),
    ),
    integrationQueueMessagesMillion: numberToInput(
      integrationServices.integrationQueueMessagesMillion ??
        Number(defaultWorkloadForm.integrationQueueMessagesMillion),
    ),
    integrationEventsMillion: numberToInput(
      integrationServices.integrationEventsMillion ??
        Number(defaultWorkloadForm.integrationEventsMillion),
    ),
    integrationWorkflowTransitionsThousand: numberToInput(
      integrationServices.integrationWorkflowTransitionsThousand ??
        Number(defaultWorkloadForm.integrationWorkflowTransitionsThousand),
    ),
    integrationApiGatewayRequestsMillion: numberToInput(
      integrationServices.integrationApiGatewayRequestsMillion ??
        Number(defaultWorkloadForm.integrationApiGatewayRequestsMillion),
    ),
    monthlyEgressGb: numberToInput(nws.network.estimatedMonthlyEgressGb),
    crossAzTransferGb: numberToInput(
      nws.network.crossAzTransferGb ?? Number(defaultWorkloadForm.crossAzTransferGb),
    ),
    interRegionTransferGb: numberToInput(
      nws.network.interRegionTransferGb ?? Number(defaultWorkloadForm.interRegionTransferGb),
    ),
    cdnTrafficGb: numberToInput(
      nws.network.cdnTrafficGb ?? Number(defaultWorkloadForm.cdnTrafficGb),
    ),
    cdnCacheHitRatioPercent: numberToInput(
      nws.network.cdnCacheHitRatioPercent ?? Number(defaultWorkloadForm.cdnCacheHitRatioPercent),
    ),
    natGatewayGb: numberToInput(
      nws.network.natGatewayGb ?? Number(defaultWorkloadForm.natGatewayGb),
    ),
    natGatewayHours: numberToInput(
      nws.network.natGatewayHours ?? Number(defaultWorkloadForm.natGatewayHours),
    ),
    dnsHostedZones: numberToInput(
      nws.network.dnsHostedZones ?? Number(defaultWorkloadForm.dnsHostedZones),
    ),
    dnsQueriesMillion: numberToInput(
      nws.network.dnsQueriesMillion ?? Number(defaultWorkloadForm.dnsQueriesMillion),
    ),
    loadBalancerProcessedGb: numberToInput(
      nws.network.loadBalancerProcessedGb ?? Number(defaultWorkloadForm.loadBalancerProcessedGb),
    ),
    loadBalancerHours: numberToInput(
      nws.network.loadBalancerHours ?? Number(defaultWorkloadForm.loadBalancerHours),
    ),
    observabilityMetricsMillion: numberToInput(
      supportingServices.observabilityMetricsMillion ??
        Number(defaultWorkloadForm.observabilityMetricsMillion),
    ),
    observabilityLogsIngestGb: numberToInput(
      supportingServices.observabilityLogsIngestGb ??
        Number(defaultWorkloadForm.observabilityLogsIngestGb),
    ),
    observabilityLogRetentionGb: numberToInput(
      supportingServices.observabilityLogRetentionGb ??
        Number(defaultWorkloadForm.observabilityLogRetentionGb),
    ),
    observabilityAlarms: numberToInput(
      supportingServices.observabilityAlarms ?? Number(defaultWorkloadForm.observabilityAlarms),
    ),
    observabilityDashboards: numberToInput(
      supportingServices.observabilityDashboards ??
        Number(defaultWorkloadForm.observabilityDashboards),
    ),
    observabilityTracesMillion: numberToInput(
      supportingServices.observabilityTracesMillion ??
        Number(defaultWorkloadForm.observabilityTracesMillion),
    ),
    secretsCount: numberToInput(
      supportingServices.secretsCount ?? Number(defaultWorkloadForm.secretsCount),
    ),
    secretApiCallsTenThousand: numberToInput(
      supportingServices.secretApiCallsTenThousand ??
        Number(defaultWorkloadForm.secretApiCallsTenThousand),
    ),
    securityProtectedResources: numberToInput(
      supportingServices.securityProtectedResources ??
        Number(defaultWorkloadForm.securityProtectedResources),
    ),
    securityFindingsThousand: numberToInput(
      supportingServices.securityFindingsThousand ??
        Number(defaultWorkloadForm.securityFindingsThousand),
    ),
    wafWebAclCount: numberToInput(
      supportingServices.wafWebAclCount ?? Number(defaultWorkloadForm.wafWebAclCount),
    ),
    wafRuleCount: numberToInput(
      supportingServices.wafRuleCount ?? Number(defaultWorkloadForm.wafRuleCount),
    ),
    wafRequestsMillion: numberToInput(
      supportingServices.wafRequestsMillion ?? Number(defaultWorkloadForm.wafRequestsMillion),
    ),
    ddosProtectedResources: numberToInput(
      supportingServices.ddosProtectedResources ??
        Number(defaultWorkloadForm.ddosProtectedResources),
    ),
    functionInvocationsMillion: numberToInput(
      runtimeServices.functionInvocationsMillion ??
        Number(defaultWorkloadForm.functionInvocationsMillion),
    ),
    functionDurationMs: numberToInput(
      runtimeServices.functionDurationMs ?? Number(defaultWorkloadForm.functionDurationMs),
    ),
    functionMemoryMb: numberToInput(
      runtimeServices.functionMemoryMb ?? Number(defaultWorkloadForm.functionMemoryMb),
    ),
    appPlatformRequestsMillion: numberToInput(
      runtimeServices.appPlatformRequestsMillion ??
        Number(defaultWorkloadForm.appPlatformRequestsMillion),
    ),
    appPlatformRequestDurationMs: numberToInput(
      runtimeServices.appPlatformRequestDurationMs ??
        Number(defaultWorkloadForm.appPlatformRequestDurationMs),
    ),
    appPlatformVcpu: numberToInput(
      runtimeServices.appPlatformVcpu ?? Number(defaultWorkloadForm.appPlatformVcpu),
    ),
    appPlatformMemoryGb: numberToInput(
      runtimeServices.appPlatformMemoryGb ?? Number(defaultWorkloadForm.appPlatformMemoryGb),
    ),
    appPlatformAlwaysOnHours: numberToInput(
      runtimeServices.appPlatformAlwaysOnHours ??
        Number(defaultWorkloadForm.appPlatformAlwaysOnHours),
    ),
    appPlatformMinInstances: numberToInput(
      runtimeServices.appPlatformMinInstances ??
        Number(defaultWorkloadForm.appPlatformMinInstances),
    ),
    kubernetesClusterCount: numberToInput(
      runtimeServices.kubernetesClusterCount ?? Number(defaultWorkloadForm.kubernetesClusterCount),
    ),
    kubernetesWorkerNodeCount: numberToInput(
      runtimeServices.kubernetesWorkerNodeCount ??
        Number(defaultWorkloadForm.kubernetesWorkerNodeCount),
    ),
    registryStorageGb: numberToInput(
      runtimeServices.registryStorageGb ?? Number(defaultWorkloadForm.registryStorageGb),
    ),
    registryEgressGb: numberToInput(
      runtimeServices.registryEgressGb ?? Number(defaultWorkloadForm.registryEgressGb),
    ),
    cdn: nws.network.cdn,
    loadBalancer: nws.network.loadBalancer,
    selectedServiceCategory: primaryServiceRequirement(nws)?.serviceCategory ?? 'compute',
    selectedServiceFamilyId:
      primaryServiceRequirement(nws)?.serviceType ??
      serviceFamilyIdsFromTraceability(nws.sourceTraceability)[0] ??
      'vm-compute',
    instanceTier:
      tierForInstanceFamily(compute?.instanceFamily) ??
      instanceTierFromValue(primaryServiceRequirement(nws)?.tier) ??
      defaultWorkloadForm.instanceTier,
    availabilityZoneCount:
      primaryServiceRequirement(nws)?.az?.match(/\d+/)?.[0] ??
      (nws.availability.multiAz ? '2' : '1'),
    selectedServiceFamilyIds:
      nws.serviceRequirements?.length && nws.serviceRequirements.length > 0
        ? orderedRequirementFamilyIds(nws.serviceRequirements)
        : serviceFamilyIdsFromTraceability(nws.sourceTraceability),
    multiAz: nws.availability.multiAz,
    multiRegion: nws.availability.multiRegion,
    slaTarget: nws.availability.slaTarget ?? '',
    faultTolerance:
      nws.availability.faultTolerance ??
      (nws.availability.multiRegion
        ? 'multi-region'
        : nws.availability.multiAz
          ? 'multi-az'
          : 'single-zone'),
  };
}

export function serviceRequirementsFromForm(form: WorkloadFormState): ServiceRequirement[] {
  const selectedIds = orderedRequirementIds(form);
  const region = normalizedRegionPreference(
    form.regionPreference,
    form.dataResidency,
    form.complianceLocked,
  ).preference;
  const availabilityZones = form.multiAz
    ? `${Math.max(2, parseNonNegativeInteger(form.availabilityZoneCount, 2))} zones`
    : 'single-zone';
  const bulkRows = bulkServiceRowsByFamily(form.bulkServiceRows);

  return selectedIds.map((serviceType) => {
    const family = CLOUD_SERVICE_CATALOG.find((candidate) => candidate.id === serviceType);
    const serviceCategory = serviceCategoryForFamily(serviceType);
    const bulkRow = bulkRows.get(serviceType);

    return {
      serviceCategory,
      serviceType,
      instanceType: instanceTypeForServiceRequirement(serviceType, form),
      tier: tierForServiceRequirement(serviceType, form, bulkRow),
      ...(region ? { region } : {}),
      az: availabilityZones,
      quantity: quantityForServiceRequirement(serviceType, form, bulkRow),
      scaleParams: {
        categoryLabel:
          SERVICE_CATALOG_CATEGORIES.find((category) => category.id === serviceCategory)?.label ??
          serviceCategory,
        providerServices: family
          ? [
              ...family.providerServices.aws,
              ...family.providerServices.azure,
              ...family.providerServices.gcp,
            ].join(' | ')
          : serviceType,
        supportStatus: family?.supportStatus ?? 'mapped',
        environment: form.environment,
        supportTier: form.supportTier,
        operatingSystem: form.operatingSystem,
        dataResidency: form.dataResidency,
        complianceLocked: form.complianceLocked,
        commitmentPreferencePercent: parseBoundedNumber(
          form.commitmentPreferencePercent,
          0,
          100,
          0,
        ),
        usagePattern: form.usagePattern,
        faultTolerance: form.faultTolerance,
        internetEgressGb: parseOptionalNumber(form.monthlyEgressGb) ?? 0,
        crossAzTransferGb: parseOptionalNumber(form.crossAzTransferGb) ?? 0,
        interRegionTransferGb: parseOptionalNumber(form.interRegionTransferGb) ?? 0,
        cdnTrafficGb: parseOptionalNumber(form.cdnTrafficGb) ?? 0,
        cdnCacheHitRatioPercent: parseBoundedNumber(form.cdnCacheHitRatioPercent, 0, 100, 85),
        natGatewayGb: parseOptionalNumber(form.natGatewayGb) ?? 0,
        natGatewayHours: parseBoundedNumber(form.natGatewayHours, 0, 730, 0),
        dnsHostedZones: parseNonNegativeInteger(form.dnsHostedZones, 0),
        dnsQueriesMillion: parseOptionalNumber(form.dnsQueriesMillion) ?? 0,
        loadBalancerProcessedGb: parseOptionalNumber(form.loadBalancerProcessedGb) ?? 0,
        loadBalancerHours: parseBoundedNumber(form.loadBalancerHours, 0, 730, 0),
        ...(serviceType === 'monitoring' ||
        serviceType === 'logging-audit' ||
        serviceType === 'tracing-apm' ||
        serviceType === 'keys-secrets' ||
        serviceType === 'security-posture' ||
        serviceType === 'waf-ddos'
          ? supportingServicesScaleParamsFromForm(form)
          : {}),
        ...(serviceType === 'serverless-functions' ||
        serviceType === 'app-platform' ||
        serviceType === 'container-orchestration' ||
        serviceType === 'container-registry'
          ? runtimeScaleParamsFromForm(form)
          : {}),
        ...(isAnalyticsServiceFamily(serviceType) ? analyticsScaleParamsFromForm(form) : {}),
        ...(isIntegrationServiceFamily(serviceType) ? integrationScaleParamsFromForm(form) : {}),
        ...(serviceType.includes('storage') ? storageScaleParamsFromForm(form) : {}),
        ...(serviceType.includes('database') || serviceType === 'cache'
          ? databaseScaleParamsFromForm(form)
          : {}),
        ...(serviceType === 'vm-compute' || serviceType === 'autoscaling-compute'
          ? {
              ...instanceFamilyForTier(form.instanceTier),
              processorArchitecture: processorArchitectureForForm(form),
              tenancy: form.computeTenancy,
            }
          : {}),
        ...(bulkRow
          ? {
              bulkImport: true,
              bulkQuantity: parsePositiveInteger(bulkRow.quantity, 1),
              ...(bulkRow.tier.trim() ? { bulkTier: bulkRow.tier.trim() } : {}),
              ...(bulkRow.note.trim() ? { bulkNote: bulkRow.note.trim() } : {}),
            }
          : {}),
        ...(form.scalingType === 'autoscaling'
          ? {
              scalingType: form.scalingType,
              min: parseNonNegativeInteger(form.autoscaleMin, 1),
              max: parseNonNegativeInteger(form.autoscaleMax, 3),
            }
          : { scalingType: form.scalingType }),
      },
    };
  });
}

function orderedRequirementIds(form: WorkloadFormState): string[] {
  const ids = new Set([
    form.selectedServiceFamilyId,
    ...form.selectedServiceFamilyIds,
    ...validBulkServiceRows(form.bulkServiceRows).map((row) => row.serviceFamilyId),
    ...(form.storageEnabled ? [storageServiceFamilyId(form)] : []),
    ...(form.databaseEnabled ? [databaseServiceFamilyId(form)] : []),
    ...supportingServiceFamilyIds(form),
    ...runtimeServiceFamilyIds(form),
    ...analyticsServiceFamilyIds(form),
    ...integrationServiceFamilyIds(form),
    ...(form.cdn ? ['cdn-edge'] : []),
    ...(form.loadBalancer ? ['load-balancing'] : []),
  ]);

  return CLOUD_SERVICE_CATALOG.filter((family) => ids.has(family.id)).map((family) => family.id);
}

function traceableServiceFamilyIds(form: WorkloadFormState): string[] {
  return orderedServiceFamilyIds([
    ...form.selectedServiceFamilyIds,
    ...validBulkServiceRows(form.bulkServiceRows).map((row) => row.serviceFamilyId),
  ]);
}

function validBulkServiceRows(rows: BulkServiceRow[]): BulkServiceRow[] {
  return rows.filter((row) =>
    CLOUD_SERVICE_CATALOG.some((family) => family.id === row.serviceFamilyId),
  );
}

function supportingServiceFamilyIds(form: WorkloadFormState): string[] {
  const ids: string[] = [];

  if (
    hasPositiveFormNumber(form.observabilityMetricsMillion) ||
    hasPositiveFormNumber(form.observabilityAlarms) ||
    hasPositiveFormNumber(form.observabilityDashboards)
  ) {
    ids.push('monitoring');
  }

  if (
    hasPositiveFormNumber(form.observabilityLogsIngestGb) ||
    hasPositiveFormNumber(form.observabilityLogRetentionGb)
  ) {
    ids.push('logging-audit');
  }

  if (hasPositiveFormNumber(form.observabilityTracesMillion)) {
    ids.push('tracing-apm');
  }

  if (
    hasPositiveFormNumber(form.secretsCount) ||
    hasPositiveFormNumber(form.secretApiCallsTenThousand)
  ) {
    ids.push('keys-secrets');
  }

  if (
    hasPositiveFormNumber(form.securityProtectedResources) ||
    hasPositiveFormNumber(form.securityFindingsThousand)
  ) {
    ids.push('security-posture');
  }

  if (
    hasPositiveFormNumber(form.wafWebAclCount) ||
    hasPositiveFormNumber(form.wafRuleCount) ||
    hasPositiveFormNumber(form.wafRequestsMillion) ||
    hasPositiveFormNumber(form.ddosProtectedResources)
  ) {
    ids.push('waf-ddos');
  }

  return ids;
}

function runtimeServiceFamilyIds(form: WorkloadFormState): string[] {
  const ids: string[] = [];

  if (hasPositiveFormNumber(form.functionInvocationsMillion)) {
    ids.push('serverless-functions');
  }

  if (hasPositiveFormNumber(form.appPlatformRequestsMillion)) {
    ids.push('app-platform');
  }

  if (
    hasPositiveFormNumber(form.kubernetesClusterCount) ||
    hasPositiveFormNumber(form.kubernetesWorkerNodeCount)
  ) {
    ids.push('container-orchestration');
  }

  if (
    hasPositiveFormNumber(form.registryStorageGb) ||
    hasPositiveFormNumber(form.registryEgressGb)
  ) {
    ids.push('container-registry');
  }

  return ids;
}

function analyticsServiceFamilyIds(form: WorkloadFormState): string[] {
  const ids: string[] = [];

  if (
    hasPositiveFormNumber(form.analyticsWarehouseStorageGb) ||
    hasPositiveFormNumber(form.analyticsWarehouseQueryTb)
  ) {
    ids.push('data-warehouse');
  }

  if (hasPositiveFormNumber(form.analyticsDataLakeStorageGb)) {
    ids.push('data-lake');
  }

  if (hasPositiveFormNumber(form.analyticsIntegrationJobHours)) {
    ids.push('data-integration');
  }

  if (hasPositiveFormNumber(form.analyticsStreamingIngestGb)) {
    ids.push('streaming-analytics');
  }

  if (hasPositiveFormNumber(form.analyticsBiUsers)) {
    ids.push('business-intelligence');
  }

  return ids;
}

function integrationServiceFamilyIds(form: WorkloadFormState): string[] {
  const ids: string[] = [];

  if (hasPositiveFormNumber(form.integrationQueueMessagesMillion)) {
    ids.push('queues-messaging');
  }

  if (hasPositiveFormNumber(form.integrationEventsMillion)) {
    ids.push('eventing');
  }

  if (hasPositiveFormNumber(form.integrationWorkflowTransitionsThousand)) {
    ids.push('workflow-orchestration');
  }

  if (hasPositiveFormNumber(form.integrationApiGatewayRequestsMillion)) {
    ids.push('api-gateway');
  }

  return ids;
}

function isAnalyticsServiceFamily(serviceType: string): boolean {
  return [
    'data-warehouse',
    'data-lake',
    'data-integration',
    'streaming-analytics',
    'business-intelligence',
  ].includes(serviceType);
}

function isIntegrationServiceFamily(serviceType: string): boolean {
  return ['queues-messaging', 'eventing', 'workflow-orchestration', 'api-gateway'].includes(
    serviceType,
  );
}

function hasPositiveFormNumber(value: string): boolean {
  const parsed = parseOptionalNumber(value);

  return parsed !== undefined && parsed > 0;
}

function bulkServiceRowsByFamily(rows: BulkServiceRow[]): Map<string, BulkServiceRow> {
  return new Map(validBulkServiceRows(rows).map((row) => [row.serviceFamilyId, row]));
}

function orderedRequirementFamilyIds(requirements: ServiceRequirement[]): string[] {
  const ids = new Set(requirements.map((requirement) => requirement.serviceType));

  return CLOUD_SERVICE_CATALOG.filter((family) => ids.has(family.id)).map((family) => family.id);
}

function primaryServiceRequirement(nws: NormalizedWorkloadSpec): ServiceRequirement | undefined {
  return nws.serviceRequirements?.find((requirement) =>
    CLOUD_SERVICE_CATALOG.some((family) => family.id === requirement.serviceType),
  );
}

function supportingServiceScaleParamsFromNws(nws: NormalizedWorkloadSpec): Record<string, number> {
  const supportingRequirements =
    nws.serviceRequirements?.filter((requirement) =>
      [
        'monitoring',
        'logging-audit',
        'tracing-apm',
        'keys-secrets',
        'security-posture',
        'waf-ddos',
      ].includes(requirement.serviceType),
    ) ?? [];
  const keys = [
    'observabilityMetricsMillion',
    'observabilityLogsIngestGb',
    'observabilityLogRetentionGb',
    'observabilityAlarms',
    'observabilityDashboards',
    'observabilityTracesMillion',
    'secretsCount',
    'secretApiCallsTenThousand',
    'securityProtectedResources',
    'securityFindingsThousand',
    'wafWebAclCount',
    'wafRuleCount',
    'wafRequestsMillion',
    'ddosProtectedResources',
  ];

  return Object.fromEntries(
    keys.map((key) => [
      key,
      supportingRequirements
        .map((requirement) => numericScaleParam(requirement.scaleParams, key))
        .find((value) => value !== undefined),
    ]),
  ) as Record<string, number>;
}

function runtimeScaleParamsFromNws(nws: NormalizedWorkloadSpec): Record<string, number> {
  const runtimeRequirements =
    nws.serviceRequirements?.filter((requirement) =>
      [
        'serverless-functions',
        'app-platform',
        'container-orchestration',
        'container-registry',
      ].includes(requirement.serviceType),
    ) ?? [];
  const keys = [
    'functionInvocationsMillion',
    'functionDurationMs',
    'functionMemoryMb',
    'appPlatformRequestsMillion',
    'appPlatformRequestDurationMs',
    'appPlatformVcpu',
    'appPlatformMemoryGb',
    'appPlatformAlwaysOnHours',
    'appPlatformMinInstances',
    'kubernetesClusterCount',
    'kubernetesWorkerNodeCount',
    'registryStorageGb',
    'registryEgressGb',
  ];

  return Object.fromEntries(
    keys.map((key) => [
      key,
      runtimeRequirements
        .map((requirement) => numericScaleParam(requirement.scaleParams, key))
        .find((value) => value !== undefined),
    ]),
  ) as Record<string, number>;
}

function analyticsScaleParamsFromNws(nws: NormalizedWorkloadSpec): Record<string, number> {
  const analyticsRequirements =
    nws.serviceRequirements?.filter((requirement) =>
      isAnalyticsServiceFamily(requirement.serviceType),
    ) ?? [];
  const keys = [
    'analyticsWarehouseStorageGb',
    'analyticsWarehouseQueryTb',
    'analyticsDataLakeStorageGb',
    'analyticsIntegrationJobHours',
    'analyticsStreamingIngestGb',
    'analyticsBiUsers',
  ];

  return Object.fromEntries(
    keys.map((key) => [
      key,
      analyticsRequirements
        .map((requirement) => numericScaleParam(requirement.scaleParams, key))
        .find((value) => value !== undefined),
    ]),
  ) as Record<string, number>;
}

function integrationScaleParamsFromNws(nws: NormalizedWorkloadSpec): Record<string, number> {
  const integrationRequirements =
    nws.serviceRequirements?.filter((requirement) =>
      isIntegrationServiceFamily(requirement.serviceType),
    ) ?? [];
  const keys = [
    'integrationQueueMessagesMillion',
    'integrationEventsMillion',
    'integrationWorkflowTransitionsThousand',
    'integrationApiGatewayRequestsMillion',
  ];

  return Object.fromEntries(
    keys.map((key) => [
      key,
      integrationRequirements
        .map((requirement) => numericScaleParam(requirement.scaleParams, key))
        .find((value) => value !== undefined),
    ]),
  ) as Record<string, number>;
}

function numericScaleParam(
  scaleParams: ServiceRequirement['scaleParams'],
  key: string,
): number | undefined {
  const value = scaleParams?.[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function serviceCategoryForFamily(serviceType: string): ServiceRequirement['serviceCategory'] {
  const family = CLOUD_SERVICE_CATALOG.find((candidate) => candidate.id === serviceType);
  const categoryId = family?.categoryId ?? 'compute';

  return serviceCategoryIds.has(categoryId)
    ? (categoryId as ServiceRequirement['serviceCategory'])
    : 'compute';
}

function quantityForServiceRequirement(
  serviceType: string,
  form: WorkloadFormState,
  bulkRow?: BulkServiceRow,
): number {
  if (bulkRow) {
    return parsePositiveInteger(bulkRow.quantity, 1);
  }

  if (serviceType === 'vm-compute' || serviceType === 'autoscaling-compute') {
    return form.scalingType === 'autoscaling'
      ? Math.max(1, parseNonNegativeInteger(form.autoscaleMin, 1))
      : Math.max(1, parseNonNegativeInteger(form.instanceCount, 1));
  }

  return 1;
}

function instanceTypeForServiceRequirement(
  serviceType: string,
  form: WorkloadFormState,
): string | undefined {
  if (serviceType === 'vm-compute' || serviceType === 'autoscaling-compute') {
    return `${instanceTierLabel(form.instanceTier)} / ${processorArchitectureLabel(
      processorArchitectureForForm(form),
    )} / ${tenancyLabel(form.computeTenancy)} - ${form.vcpu || '?'} vCPU - ${
      form.memoryGb || '?'
    }GB`;
  }

  if (serviceType.includes('storage')) {
    return `${form.storageType} / ${storageClassLabel(form.storageClass)} - ${
      form.storageSizeGb || '0'
    }GB`;
  }

  if (serviceType.includes('database') || serviceType === 'cache') {
    return `${form.databaseEngine} - ${form.databaseSizeGb || 'provider default'}GB`;
  }

  if (serviceType === 'security-posture') {
    return `security posture - ${form.securityProtectedResources || '0'} resources, ${
      form.securityFindingsThousand || '0'
    }K findings`;
  }

  if (serviceType === 'waf-ddos') {
    return `WAF + DDoS - ${form.wafWebAclCount || '0'} ACLs, ${
      form.wafRuleCount || '0'
    } rules, ${form.wafRequestsMillion || '0'}M requests`;
  }

  return undefined;
}

function tierForServiceRequirement(
  serviceType: string,
  form: WorkloadFormState,
  bulkRow?: BulkServiceRow,
): string | undefined {
  if (bulkRow?.tier.trim()) {
    return bulkRow.tier.trim();
  }

  if (serviceType === 'vm-compute' || serviceType === 'autoscaling-compute') {
    return form.instanceTier;
  }

  if (serviceType.includes('storage')) {
    return form.storageClass === 'standard' ? form.storageAccessPattern : form.storageClass;
  }

  if (serviceType.includes('database') || serviceType === 'cache') {
    return form.databaseHighAvailability ? 'high-availability' : 'standard';
  }

  if (serviceType === 'security-posture') {
    return 'posture';
  }

  if (serviceType === 'waf-ddos') {
    return 'edge-protection';
  }

  return undefined;
}

function storageAdvancedAssumptionsFromForm(
  form: WorkloadFormState,
): Partial<NormalizedWorkloadSpec['storage'][number]> {
  const snapshotSizeGb = parseOptionalNumber(form.snapshotSizeGb);

  return {
    ...(form.storageClass !== 'standard' ? { storageClass: form.storageClass } : {}),
    ...optionalPositiveNumber('monthlyPutRequestsThousand', form.monthlyPutRequestsThousand),
    ...optionalPositiveNumber('monthlyGetRequestsThousand', form.monthlyGetRequestsThousand),
    ...optionalPositiveNumber('monthlyDeleteRequestsThousand', form.monthlyDeleteRequestsThousand),
    ...optionalPositiveNumber('monthlyListRequestsThousand', form.monthlyListRequestsThousand),
    ...optionalPositiveNumber('monthlyRetrievalGb', form.monthlyRetrievalGb),
    ...(form.storageReplication !== 'none' ? { replication: form.storageReplication } : {}),
    ...optionalPositiveNumber('lifecycleTransitionsThousand', form.lifecycleTransitionsThousand),
    ...optionalPositiveNumber('snapshotSizeGb', form.snapshotSizeGb),
    ...(snapshotSizeGb !== undefined && snapshotSizeGb > 0
      ? optionalNonNegativeInteger('snapshotRetentionDays', form.snapshotRetentionDays)
      : {}),
    ...optionalPositiveInteger('provisionedIops', form.provisionedIops),
    ...optionalPositiveNumber('provisionedThroughputMbps', form.provisionedThroughputMbps),
  };
}

function storageScaleParamsFromForm(form: WorkloadFormState): ServiceRequirement['scaleParams'] {
  return {
    storageRole: form.storageRole.trim() || 'storage',
    storageType: form.storageType,
    storageSizeGb: parsePositiveNumber(form.storageSizeGb, 1),
    storageAccessPattern: form.storageAccessPattern,
    storageClass: form.storageClass,
    monthlyPutRequestsThousand: parseOptionalNumber(form.monthlyPutRequestsThousand) ?? 0,
    monthlyGetRequestsThousand: parseOptionalNumber(form.monthlyGetRequestsThousand) ?? 0,
    monthlyDeleteRequestsThousand: parseOptionalNumber(form.monthlyDeleteRequestsThousand) ?? 0,
    monthlyListRequestsThousand: parseOptionalNumber(form.monthlyListRequestsThousand) ?? 0,
    monthlyRetrievalGb: parseOptionalNumber(form.monthlyRetrievalGb) ?? 0,
    storageReplication: form.storageReplication,
    lifecycleTransitionsThousand: parseOptionalNumber(form.lifecycleTransitionsThousand) ?? 0,
    snapshotSizeGb: parseOptionalNumber(form.snapshotSizeGb) ?? 0,
    snapshotRetentionDays: parseNonNegativeInteger(form.snapshotRetentionDays, 0),
    provisionedIops: parseNonNegativeInteger(form.provisionedIops, 0),
    provisionedThroughputMbps: parseOptionalNumber(form.provisionedThroughputMbps) ?? 0,
  };
}

function databaseAdvancedAssumptionsFromForm(
  form: WorkloadFormState,
): Partial<NormalizedWorkloadSpec['database'][number]> {
  const backupStorageGb = parseOptionalNumber(form.databaseBackupStorageGb);

  return {
    ...optionalPositiveNumber('backupStorageGb', form.databaseBackupStorageGb),
    ...(backupStorageGb !== undefined && backupStorageGb > 0
      ? optionalNonNegativeInteger('backupRetentionDays', form.databaseBackupRetentionDays)
      : {}),
    ...optionalPositiveInteger('provisionedIops', form.databaseProvisionedIops),
    ...optionalPositiveInteger('readReplicaCount', form.databaseReadReplicaCount),
    ...optionalPositiveNumber(
      'crossRegionReplicaTransferGb',
      form.databaseCrossRegionReplicaTransferGb,
    ),
    ...optionalPositiveNumber(
      'nosqlReadRequestUnitsMillion',
      form.databaseNosqlReadRequestUnitsMillion,
    ),
    ...optionalPositiveNumber(
      'nosqlWriteRequestUnitsMillion',
      form.databaseNosqlWriteRequestUnitsMillion,
    ),
    ...optionalPositiveInteger('ruPerSecond', form.databaseRuPerSecond),
    ...optionalPositiveNumber('queryDataTb', form.databaseQueryDataTb),
    ...optionalPositiveInteger('cacheReplicaCount', form.databaseCacheReplicaCount),
    ...optionalPositiveNumber('storageGrowthGbPerMonth', form.databaseStorageGrowthGbPerMonth),
  };
}

function databaseScaleParamsFromForm(form: WorkloadFormState): ServiceRequirement['scaleParams'] {
  return {
    databaseRole: form.databaseRole.trim() || 'database',
    databaseEngine: form.databaseEngine,
    databaseSizeGb: parseOptionalNumber(form.databaseSizeGb) ?? 0,
    databaseHighAvailability: form.databaseHighAvailability,
    backupStorageGb: parseOptionalNumber(form.databaseBackupStorageGb) ?? 0,
    backupRetentionDays: parseNonNegativeInteger(form.databaseBackupRetentionDays, 0),
    provisionedIops: parseNonNegativeInteger(form.databaseProvisionedIops, 0),
    readReplicaCount: parseNonNegativeInteger(form.databaseReadReplicaCount, 0),
    crossRegionReplicaTransferGb:
      parseOptionalNumber(form.databaseCrossRegionReplicaTransferGb) ?? 0,
    nosqlReadRequestUnitsMillion:
      parseOptionalNumber(form.databaseNosqlReadRequestUnitsMillion) ?? 0,
    nosqlWriteRequestUnitsMillion:
      parseOptionalNumber(form.databaseNosqlWriteRequestUnitsMillion) ?? 0,
    ruPerSecond: parseNonNegativeInteger(form.databaseRuPerSecond, 0),
    queryDataTb: parseOptionalNumber(form.databaseQueryDataTb) ?? 0,
    cacheReplicaCount: parseNonNegativeInteger(form.databaseCacheReplicaCount, 0),
    storageGrowthGbPerMonth: parseOptionalNumber(form.databaseStorageGrowthGbPerMonth) ?? 0,
  };
}

function supportingServicesScaleParamsFromForm(
  form: WorkloadFormState,
): ServiceRequirement['scaleParams'] {
  return {
    observabilityMetricsMillion: parseOptionalNumber(form.observabilityMetricsMillion) ?? 0,
    observabilityLogsIngestGb: parseOptionalNumber(form.observabilityLogsIngestGb) ?? 0,
    observabilityLogRetentionGb: parseOptionalNumber(form.observabilityLogRetentionGb) ?? 0,
    observabilityAlarms: parseNonNegativeInteger(form.observabilityAlarms, 0),
    observabilityDashboards: parseNonNegativeInteger(form.observabilityDashboards, 0),
    observabilityTracesMillion: parseOptionalNumber(form.observabilityTracesMillion) ?? 0,
    secretsCount: parseNonNegativeInteger(form.secretsCount, 0),
    secretApiCallsTenThousand: parseOptionalNumber(form.secretApiCallsTenThousand) ?? 0,
    securityProtectedResources: parseNonNegativeInteger(form.securityProtectedResources, 0),
    securityFindingsThousand: parseOptionalNumber(form.securityFindingsThousand) ?? 0,
    wafWebAclCount: parseNonNegativeInteger(form.wafWebAclCount, 0),
    wafRuleCount: parseNonNegativeInteger(form.wafRuleCount, 0),
    wafRequestsMillion: parseOptionalNumber(form.wafRequestsMillion) ?? 0,
    ddosProtectedResources: parseNonNegativeInteger(form.ddosProtectedResources, 0),
  };
}

function runtimeScaleParamsFromForm(form: WorkloadFormState): ServiceRequirement['scaleParams'] {
  return {
    functionInvocationsMillion: parseOptionalNumber(form.functionInvocationsMillion) ?? 0,
    functionDurationMs: parsePositiveNumber(form.functionDurationMs, 100),
    functionMemoryMb: parsePositiveInteger(form.functionMemoryMb, 512),
    appPlatformRequestsMillion: parseOptionalNumber(form.appPlatformRequestsMillion) ?? 0,
    appPlatformRequestDurationMs: parsePositiveNumber(form.appPlatformRequestDurationMs, 400),
    appPlatformVcpu: parsePositiveNumber(form.appPlatformVcpu, 1),
    appPlatformMemoryGb: parsePositiveNumber(form.appPlatformMemoryGb, 0.5),
    appPlatformAlwaysOnHours: parseBoundedNumber(form.appPlatformAlwaysOnHours, 0, 730, 730),
    appPlatformMinInstances: parseNonNegativeInteger(form.appPlatformMinInstances, 1),
    kubernetesClusterCount: parseNonNegativeInteger(form.kubernetesClusterCount, 0),
    kubernetesWorkerNodeCount: parseNonNegativeInteger(form.kubernetesWorkerNodeCount, 0),
    registryStorageGb: parseOptionalNumber(form.registryStorageGb) ?? 0,
    registryEgressGb: parseOptionalNumber(form.registryEgressGb) ?? 0,
  };
}

function analyticsScaleParamsFromForm(form: WorkloadFormState): ServiceRequirement['scaleParams'] {
  return {
    analyticsWarehouseStorageGb: parseOptionalNumber(form.analyticsWarehouseStorageGb) ?? 0,
    analyticsWarehouseQueryTb: parseOptionalNumber(form.analyticsWarehouseQueryTb) ?? 0,
    analyticsDataLakeStorageGb: parseOptionalNumber(form.analyticsDataLakeStorageGb) ?? 0,
    analyticsIntegrationJobHours: parseOptionalNumber(form.analyticsIntegrationJobHours) ?? 0,
    analyticsStreamingIngestGb: parseOptionalNumber(form.analyticsStreamingIngestGb) ?? 0,
    analyticsBiUsers: parseNonNegativeInteger(form.analyticsBiUsers, 0),
  };
}

function integrationScaleParamsFromForm(
  form: WorkloadFormState,
): ServiceRequirement['scaleParams'] {
  return {
    integrationQueueMessagesMillion: parseOptionalNumber(form.integrationQueueMessagesMillion) ?? 0,
    integrationEventsMillion: parseOptionalNumber(form.integrationEventsMillion) ?? 0,
    integrationWorkflowTransitionsThousand:
      parseOptionalNumber(form.integrationWorkflowTransitionsThousand) ?? 0,
    integrationApiGatewayRequestsMillion:
      parseOptionalNumber(form.integrationApiGatewayRequestsMillion) ?? 0,
  };
}

function instanceFamilyForTier(
  instanceTier: WorkloadFormState['instanceTier'],
): Pick<NormalizedWorkloadSpec['compute'][number], 'instanceFamily'> {
  switch (instanceTier) {
    case 'small':
    case 'balanced':
      return { instanceFamily: 'general-purpose' };
    case 'compute':
      return { instanceFamily: 'compute-optimized' };
    case 'memory':
      return { instanceFamily: 'memory-optimized' };
    case 'storage':
      return { instanceFamily: 'storage-optimized' };
    case 'accelerated':
      return { instanceFamily: 'accelerated-computing' };
    case 'custom':
      return {};
  }
}

function processorArchitectureForForm(form: WorkloadFormState): ProcessorArchitecture {
  return form.instanceTier === 'accelerated' ? 'gpu' : form.processorArchitecture;
}

function processorArchitectureLabel(architecture: ProcessorArchitecture): string {
  switch (architecture) {
    case 'x86_64':
      return 'x86';
    case 'arm64':
      return 'ARM';
    case 'gpu':
      return 'GPU';
  }
}

function tenancyLabel(tenancy: ComputeTenancy): string {
  switch (tenancy) {
    case 'shared':
      return 'shared tenancy';
    case 'dedicated-host':
      return 'dedicated host';
    case 'sole-tenant':
      return 'sole tenant';
  }
}

function tierForInstanceFamily(
  instanceFamily: NormalizedWorkloadSpec['compute'][number]['instanceFamily'],
): WorkloadFormState['instanceTier'] | undefined {
  switch (instanceFamily) {
    case 'general-purpose':
      return 'balanced';
    case 'compute-optimized':
      return 'compute';
    case 'memory-optimized':
      return 'memory';
    case 'storage-optimized':
      return 'storage';
    case 'accelerated-computing':
      return 'accelerated';
    case undefined:
      return undefined;
  }
}

function instanceTierFromValue(
  value: string | undefined,
): WorkloadFormState['instanceTier'] | undefined {
  switch (value) {
    case 'small':
    case 'balanced':
    case 'compute':
    case 'memory':
    case 'storage':
    case 'accelerated':
    case 'custom':
      return value;
    default:
      return undefined;
  }
}

function instanceTierLabel(instanceTier: WorkloadFormState['instanceTier']): string {
  switch (instanceTier) {
    case 'small':
      return 'small general-purpose tier';
    case 'balanced':
      return 'balanced general-purpose tier';
    case 'compute':
      return 'compute-optimized tier';
    case 'memory':
      return 'memory-optimized tier';
    case 'storage':
      return 'storage-optimized tier';
    case 'accelerated':
      return 'GPU / accelerated tier';
    case 'custom':
      return 'custom tier';
  }
}

function storageClassLabel(storageClass: StorageClass): string {
  switch (storageClass) {
    case 'standard':
      return 'Standard';
    case 'hot':
      return 'Hot';
    case 'cool':
      return 'Cool';
    case 'cold':
      return 'Cold';
    case 'nearline':
      return 'Nearline';
    case 'coldline':
      return 'Coldline';
    case 'intelligent-tiering':
      return 'Intelligent tiering';
    case 'infrequent-access':
      return 'Infrequent access';
    case 'one-zone-infrequent-access':
      return 'One Zone-IA';
    case 'archive-instant':
      return 'Archive instant';
    case 'archive':
      return 'Archive';
    case 'deep-archive':
      return 'Deep archive';
    case 'premium':
      return 'Premium';
    case 'ultra':
      return 'Ultra';
  }
}

function storageServiceFamilyId(form: WorkloadFormState): string {
  if (form.storageType === 'block') {
    return 'block-storage';
  }

  if (form.storageType === 'file') {
    return 'file-storage';
  }

  return form.storageAccessPattern === 'archive' ? 'archive-storage' : 'object-storage';
}

function databaseServiceFamilyId(form: WorkloadFormState): string {
  if (form.databaseEngine === 'redis') {
    return 'cache';
  }

  if (form.databaseEngine === 'mongodb' || form.databaseEngine === 'generic_nosql') {
    return 'nosql-database';
  }

  return 'relational-database';
}

function normalizedRegionPreference(
  regionPreference: string,
  dataResidency = 'global',
  complianceLocked = false,
): NormalizedWorkloadSpec['workload']['region'] {
  const trimmedPreference = regionPreference.trim();
  const lockedPreference = complianceLocked
    ? regionPreferenceForResidencyLock(trimmedPreference, dataResidency)
    : undefined;
  const canonicalPreference = canonicalRegionForRegionPreference(
    lockedPreference ?? trimmedPreference,
  );
  const preference = canonicalPreference ?? trimmedPreference;

  return {
    ...(preference ? { preference } : {}),
    isDefault: !preference,
  };
}

function optionalPositiveNumber<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? ({ [key]: parsed } as Record<K, number>) : {};
}

function optionalNonNegativeNumber<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed >= 0 ? ({ [key]: parsed } as Record<K, number>) : {};
}

function optionalPositiveInteger<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? ({ [key]: Math.round(parsed) } as Record<K, number>) : {};
}

function optionalNonNegativeInteger<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, number>> {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed >= 0
    ? ({ [key]: Math.round(parsed) } as Record<K, number>)
    : {};
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? parsed : fallback;
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? Math.round(parsed) : fallback;
}

function parseNonNegativeInteger(value: string, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed >= 0 ? Math.round(parsed) : fallback;
}

function parseBoundedNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

function parseBoundedInteger(value: string, min: number, max: number, fallback: number): number {
  return Math.round(parseBoundedNumber(value, min, max, fallback));
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.replace(/,/g, '').trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberToInput(value: number | undefined): string {
  return value === undefined ? '' : value.toString();
}

function optionalStringList<K extends string>(key: K, value: string): Partial<Record<K, string[]>> {
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? ({ [key]: parsed } as Record<K, string[]>) : {};
}

function optionalTagList<K extends string>(
  key: K,
  value: string,
): Partial<Record<K, Array<{ key: string; value: string }>>> {
  const tags = value
    .split(',')
    .map((item) => item.trim())
    .map((item) => {
      const [tagKey, ...tagValueParts] = item.split(':');
      const tagValue = tagValueParts.join(':').trim();

      return {
        key: tagKey?.trim() ?? '',
        value: tagValue || 'true',
      };
    })
    .filter((tag) => tag.key && tag.value);

  return tags.length > 0
    ? ({ [key]: tags } as Record<K, Array<{ key: string; value: string }>>)
    : {};
}

function requirePositiveNumber(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed <= 0) {
    issues.push({ field, message });
  }
}

function requirePositiveInteger(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed <= 0 || !Number.isInteger(parsed)) {
    issues.push({ field, message });
  }
}

function optionalPositiveNumberField(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const value = formNumericValue(form, field).trim();

  if (!value) {
    return;
  }

  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed <= 0) {
    issues.push({ field, message });
  }
}

function optionalNonNegativeNumberField(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const value = formNumericValue(form, field).trim();

  if (!value) {
    return;
  }

  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed < 0) {
    issues.push({ field, message });
  }
}

function optionalNonNegativeIntegerField(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  message: string,
): void {
  const value = formNumericValue(form, field).trim();

  if (!value) {
    return;
  }

  const parsed = parseOptionalNumber(value);

  if (parsed === undefined || parsed < 0 || !Number.isInteger(parsed)) {
    issues.push({ field, message });
  }
}

function requireBoundedNumber(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  min: number,
  max: number,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed < min || parsed > max) {
    issues.push({ field, message });
  }
}

function requireBoundedInteger(
  issues: WorkloadFormIssue[],
  form: WorkloadFormState,
  field: NumericWorkloadFormField,
  min: number,
  max: number,
  message: string,
): void {
  const parsed = parseOptionalNumber(formNumericValue(form, field));

  if (parsed === undefined || parsed < min || parsed > max || !Number.isInteger(parsed)) {
    issues.push({ field, message });
  }
}

function formNumericValue(form: WorkloadFormState, field: NumericWorkloadFormField): string {
  switch (field) {
    case 'dailyActiveUsers':
      return form.dailyActiveUsers;
    case 'peakConcurrentUsers':
      return form.peakConcurrentUsers;
    case 'vcpu':
      return form.vcpu;
    case 'memoryGb':
      return form.memoryGb;
    case 'instanceCount':
      return form.instanceCount;
    case 'autoscaleMin':
      return form.autoscaleMin;
    case 'autoscaleMax':
      return form.autoscaleMax;
    case 'storageSizeGb':
      return form.storageSizeGb;
    case 'monthlyPutRequestsThousand':
      return form.monthlyPutRequestsThousand;
    case 'monthlyGetRequestsThousand':
      return form.monthlyGetRequestsThousand;
    case 'monthlyDeleteRequestsThousand':
      return form.monthlyDeleteRequestsThousand;
    case 'monthlyListRequestsThousand':
      return form.monthlyListRequestsThousand;
    case 'monthlyRetrievalGb':
      return form.monthlyRetrievalGb;
    case 'lifecycleTransitionsThousand':
      return form.lifecycleTransitionsThousand;
    case 'snapshotSizeGb':
      return form.snapshotSizeGb;
    case 'snapshotRetentionDays':
      return form.snapshotRetentionDays;
    case 'provisionedIops':
      return form.provisionedIops;
    case 'provisionedThroughputMbps':
      return form.provisionedThroughputMbps;
    case 'databaseSizeGb':
      return form.databaseSizeGb;
    case 'databaseBackupStorageGb':
      return form.databaseBackupStorageGb;
    case 'databaseBackupRetentionDays':
      return form.databaseBackupRetentionDays;
    case 'databaseProvisionedIops':
      return form.databaseProvisionedIops;
    case 'databaseReadReplicaCount':
      return form.databaseReadReplicaCount;
    case 'databaseCrossRegionReplicaTransferGb':
      return form.databaseCrossRegionReplicaTransferGb;
    case 'databaseNosqlReadRequestUnitsMillion':
      return form.databaseNosqlReadRequestUnitsMillion;
    case 'databaseNosqlWriteRequestUnitsMillion':
      return form.databaseNosqlWriteRequestUnitsMillion;
    case 'databaseRuPerSecond':
      return form.databaseRuPerSecond;
    case 'databaseQueryDataTb':
      return form.databaseQueryDataTb;
    case 'databaseCacheReplicaCount':
      return form.databaseCacheReplicaCount;
    case 'databaseStorageGrowthGbPerMonth':
      return form.databaseStorageGrowthGbPerMonth;
    case 'analyticsWarehouseStorageGb':
      return form.analyticsWarehouseStorageGb;
    case 'analyticsWarehouseQueryTb':
      return form.analyticsWarehouseQueryTb;
    case 'analyticsDataLakeStorageGb':
      return form.analyticsDataLakeStorageGb;
    case 'analyticsIntegrationJobHours':
      return form.analyticsIntegrationJobHours;
    case 'analyticsStreamingIngestGb':
      return form.analyticsStreamingIngestGb;
    case 'analyticsBiUsers':
      return form.analyticsBiUsers;
    case 'integrationQueueMessagesMillion':
      return form.integrationQueueMessagesMillion;
    case 'integrationEventsMillion':
      return form.integrationEventsMillion;
    case 'integrationWorkflowTransitionsThousand':
      return form.integrationWorkflowTransitionsThousand;
    case 'integrationApiGatewayRequestsMillion':
      return form.integrationApiGatewayRequestsMillion;
    case 'monthlyEgressGb':
      return form.monthlyEgressGb;
    case 'crossAzTransferGb':
      return form.crossAzTransferGb;
    case 'interRegionTransferGb':
      return form.interRegionTransferGb;
    case 'cdnTrafficGb':
      return form.cdnTrafficGb;
    case 'cdnCacheHitRatioPercent':
      return form.cdnCacheHitRatioPercent;
    case 'natGatewayGb':
      return form.natGatewayGb;
    case 'natGatewayHours':
      return form.natGatewayHours;
    case 'dnsHostedZones':
      return form.dnsHostedZones;
    case 'dnsQueriesMillion':
      return form.dnsQueriesMillion;
    case 'loadBalancerProcessedGb':
      return form.loadBalancerProcessedGb;
    case 'loadBalancerHours':
      return form.loadBalancerHours;
    case 'observabilityMetricsMillion':
      return form.observabilityMetricsMillion;
    case 'observabilityLogsIngestGb':
      return form.observabilityLogsIngestGb;
    case 'observabilityLogRetentionGb':
      return form.observabilityLogRetentionGb;
    case 'observabilityAlarms':
      return form.observabilityAlarms;
    case 'observabilityDashboards':
      return form.observabilityDashboards;
    case 'observabilityTracesMillion':
      return form.observabilityTracesMillion;
    case 'secretsCount':
      return form.secretsCount;
    case 'secretApiCallsTenThousand':
      return form.secretApiCallsTenThousand;
    case 'securityProtectedResources':
      return form.securityProtectedResources;
    case 'securityFindingsThousand':
      return form.securityFindingsThousand;
    case 'wafWebAclCount':
      return form.wafWebAclCount;
    case 'wafRuleCount':
      return form.wafRuleCount;
    case 'wafRequestsMillion':
      return form.wafRequestsMillion;
    case 'ddosProtectedResources':
      return form.ddosProtectedResources;
    case 'functionInvocationsMillion':
      return form.functionInvocationsMillion;
    case 'functionDurationMs':
      return form.functionDurationMs;
    case 'functionMemoryMb':
      return form.functionMemoryMb;
    case 'appPlatformRequestsMillion':
      return form.appPlatformRequestsMillion;
    case 'appPlatformRequestDurationMs':
      return form.appPlatformRequestDurationMs;
    case 'appPlatformVcpu':
      return form.appPlatformVcpu;
    case 'appPlatformMemoryGb':
      return form.appPlatformMemoryGb;
    case 'appPlatformAlwaysOnHours':
      return form.appPlatformAlwaysOnHours;
    case 'appPlatformMinInstances':
      return form.appPlatformMinInstances;
    case 'kubernetesClusterCount':
      return form.kubernetesClusterCount;
    case 'kubernetesWorkerNodeCount':
      return form.kubernetesWorkerNodeCount;
    case 'registryStorageGb':
      return form.registryStorageGb;
    case 'registryEgressGb':
      return form.registryEgressGb;
    case 'commitmentPreferencePercent':
      return form.commitmentPreferencePercent;
    case 'usageHoursPerDay':
      return form.usageHoursPerDay;
    case 'usageDaysPerWeek':
      return form.usageDaysPerWeek;
    case 'averageUtilizationPercent':
      return form.averageUtilizationPercent;
  }
}
