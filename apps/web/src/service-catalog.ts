import { ProviderId } from './types';

export type ServiceSupportStatus = 'priced' | 'mapped' | 'roadmap';

export interface ServiceCatalogCategory {
  id: string;
  label: string;
}

export interface CloudServiceFamily {
  id: string;
  categoryId: string;
  label: string;
  supportStatus: ServiceSupportStatus;
  providerServices: Record<ProviderId, string[]>;
}

export const SERVICE_CATALOG_TRACE_PREFIX = 'serviceCatalog:';

export const SERVICE_CATALOG_CATEGORIES: ServiceCatalogCategory[] = [
  { id: 'compute', label: 'Compute' },
  { id: 'containers', label: 'Containers' },
  { id: 'application', label: 'Application' },
  { id: 'storage', label: 'Storage' },
  { id: 'database', label: 'Database' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'ai', label: 'AI + ML' },
  { id: 'integration', label: 'Integration' },
  { id: 'networking', label: 'Networking' },
  { id: 'security', label: 'Security' },
  { id: 'operations', label: 'Operations' },
  { id: 'devops', label: 'DevOps' },
  { id: 'migration', label: 'Migration' },
  { id: 'edge', label: 'Edge + Hybrid' },
  { id: 'business', label: 'Business' },
];

export const CLOUD_SERVICE_CATALOG: CloudServiceFamily[] = [
  family('vm-compute', 'compute', 'Virtual machines', 'priced', {
    aws: ['Amazon EC2'],
    azure: ['Azure Virtual Machines'],
    gcp: ['Compute Engine'],
  }),
  family('burstable-compute', 'compute', 'Burstable / shared-core VMs', 'priced', {
    aws: ['Amazon EC2 T3/T4g'],
    azure: ['Azure B-series'],
    gcp: ['Compute Engine E2 shared-core'],
  }),
  family('autoscaling-compute', 'compute', 'Autoscaling fleets', 'priced', {
    aws: ['EC2 Auto Scaling'],
    azure: ['Virtual Machine Scale Sets'],
    gcp: ['Managed Instance Groups'],
  }),
  family('serverless-functions', 'compute', 'Serverless functions', 'priced', {
    aws: ['AWS Lambda'],
    azure: ['Azure Functions'],
    gcp: ['Cloud Run functions'],
  }),
  family('batch-hpc', 'compute', 'Batch + HPC', 'roadmap', {
    aws: ['AWS Batch', 'AWS ParallelCluster'],
    azure: ['Azure Batch', 'Azure CycleCloud'],
    gcp: ['Batch', 'Cloud HPC Toolkit'],
  }),
  family('container-orchestration', 'containers', 'Managed Kubernetes', 'priced', {
    aws: ['Amazon EKS'],
    azure: ['Azure Kubernetes Service'],
    gcp: ['Google Kubernetes Engine'],
  }),
  family('serverless-containers', 'containers', 'Serverless containers', 'mapped', {
    aws: ['AWS Fargate', 'Amazon ECS'],
    azure: ['Azure Container Apps', 'Azure Container Instances'],
    gcp: ['Cloud Run'],
  }),
  family('container-registry', 'containers', 'Container registry', 'priced', {
    aws: ['Amazon ECR'],
    azure: ['Azure Container Registry'],
    gcp: ['Artifact Registry'],
  }),
  family('app-platform', 'application', 'App hosting', 'priced', {
    aws: ['AWS Elastic Beanstalk', 'AWS App Runner'],
    azure: ['Azure App Service'],
    gcp: ['Cloud Run', 'App Engine'],
  }),
  family('static-web', 'application', 'Static web apps', 'mapped', {
    aws: ['AWS Amplify Hosting', 'Amazon S3 website hosting'],
    azure: ['Azure Static Web Apps'],
    gcp: ['Firebase Hosting', 'Cloud Storage website hosting'],
  }),
  family('api-gateway', 'application', 'API gateway', 'priced', {
    aws: ['Amazon API Gateway'],
    azure: ['Azure API Management'],
    gcp: ['Apigee API Management'],
  }),
  family('low-code', 'application', 'Low-code apps', 'roadmap', {
    aws: ['AWS App Studio'],
    azure: ['Power Apps'],
    gcp: ['AppSheet'],
  }),
  family('object-storage', 'storage', 'Object storage', 'priced', {
    aws: ['Amazon S3'],
    azure: ['Azure Blob Storage'],
    gcp: ['Cloud Storage'],
  }),
  family('block-storage', 'storage', 'Block storage', 'priced', {
    aws: ['Amazon EBS'],
    azure: ['Azure Managed Disks'],
    gcp: ['Persistent Disk'],
  }),
  family('file-storage', 'storage', 'File storage', 'priced', {
    aws: ['Amazon EFS', 'Amazon FSx'],
    azure: ['Azure Files'],
    gcp: ['Filestore'],
  }),
  family('archive-storage', 'storage', 'Archive storage', 'priced', {
    aws: ['Amazon S3 Glacier'],
    azure: ['Blob Storage Archive'],
    gcp: ['Cloud Storage Archive'],
  }),
  family('backup-dr', 'storage', 'Backup + disaster recovery', 'roadmap', {
    aws: ['AWS Backup', 'Elastic Disaster Recovery'],
    azure: ['Azure Backup', 'Azure Site Recovery'],
    gcp: ['Backup and DR Service'],
  }),
  family('relational-database', 'database', 'Relational database', 'priced', {
    aws: ['Amazon RDS', 'Amazon Aurora'],
    azure: ['Azure SQL', 'Azure Database for PostgreSQL', 'Azure Database for MySQL'],
    gcp: ['Cloud SQL', 'AlloyDB'],
  }),
  family('nosql-database', 'database', 'NoSQL database', 'priced', {
    aws: ['Amazon DynamoDB', 'Amazon DocumentDB'],
    azure: ['Azure Cosmos DB', 'Azure DocumentDB'],
    gcp: ['Firestore', 'Bigtable'],
  }),
  family('cache', 'database', 'Managed cache', 'priced', {
    aws: ['Amazon ElastiCache'],
    azure: ['Azure Managed Redis'],
    gcp: ['Memorystore'],
  }),
  family('managed-search', 'database', 'Managed search', 'priced', {
    aws: ['Amazon OpenSearch Service'],
    azure: ['Azure AI Search'],
    gcp: ['Cloud Search', 'Vertex AI Search'],
  }),
  family('graph-ledger', 'database', 'Graph + ledger data', 'roadmap', {
    aws: ['Amazon Neptune', 'Amazon QLDB'],
    azure: ['Azure Cosmos DB Gremlin API'],
    gcp: ['Spanner Graph', 'Dataplex metadata'],
  }),
  family('data-warehouse', 'analytics', 'Data warehouse', 'priced', {
    aws: ['Amazon Redshift'],
    azure: ['Azure Synapse Analytics', 'Microsoft Fabric'],
    gcp: ['BigQuery'],
  }),
  family('data-lake', 'analytics', 'Data lake', 'priced', {
    aws: ['AWS Lake Formation', 'AWS Glue Data Catalog'],
    azure: ['Azure Data Lake Storage', 'Microsoft Purview'],
    gcp: ['Dataplex', 'Cloud Storage'],
  }),
  family('data-integration', 'analytics', 'Data integration', 'priced', {
    aws: ['AWS Glue'],
    azure: ['Azure Data Factory'],
    gcp: ['Dataflow', 'Cloud Data Fusion'],
  }),
  family('streaming-analytics', 'analytics', 'Streaming analytics', 'priced', {
    aws: ['Amazon Kinesis', 'Amazon Managed Service for Apache Flink'],
    azure: ['Event Hubs', 'Azure Stream Analytics'],
    gcp: ['Pub/Sub', 'Dataflow'],
  }),
  family('business-intelligence', 'analytics', 'Business intelligence', 'priced', {
    aws: ['Amazon QuickSight'],
    azure: ['Power BI', 'Microsoft Fabric'],
    gcp: ['Looker'],
  }),
  family('ml-platform', 'ai', 'Machine learning platform', 'mapped', {
    aws: ['Amazon SageMaker AI'],
    azure: ['Azure Machine Learning'],
    gcp: ['Vertex AI'],
  }),
  family('generative-ai', 'ai', 'Generative AI', 'mapped', {
    aws: ['Amazon Bedrock', 'Amazon Q'],
    azure: ['Azure OpenAI in Foundry Models', 'Microsoft Foundry'],
    gcp: ['Gemini Enterprise', 'Vertex AI'],
  }),
  family('ai-apis', 'ai', 'Vision, speech + language APIs', 'mapped', {
    aws: ['Amazon Rekognition', 'Amazon Transcribe', 'Amazon Comprehend'],
    azure: ['Azure AI Vision', 'Azure Speech', 'Azure Language'],
    gcp: ['Cloud Vision', 'Speech-to-Text', 'Natural Language AI'],
  }),
  family('queues-messaging', 'integration', 'Queues + messaging', 'priced', {
    aws: ['Amazon SQS', 'Amazon SNS'],
    azure: ['Azure Service Bus'],
    gcp: ['Pub/Sub'],
  }),
  family('eventing', 'integration', 'Event routing', 'priced', {
    aws: ['Amazon EventBridge'],
    azure: ['Azure Event Grid'],
    gcp: ['Eventarc'],
  }),
  family('workflow-orchestration', 'integration', 'Workflow orchestration', 'priced', {
    aws: ['AWS Step Functions'],
    azure: ['Azure Logic Apps'],
    gcp: ['Workflows'],
  }),
  family('cdn-edge', 'networking', 'CDN + edge acceleration', 'priced', {
    aws: ['Amazon CloudFront'],
    azure: ['Azure Front Door', 'Azure CDN'],
    gcp: ['Cloud CDN'],
  }),
  family('load-balancing', 'networking', 'Load balancing', 'priced', {
    aws: ['Elastic Load Balancing'],
    azure: ['Azure Load Balancer', 'Application Gateway'],
    gcp: ['Cloud Load Balancing'],
  }),
  family('dns', 'networking', 'DNS', 'priced', {
    aws: ['Amazon Route 53'],
    azure: ['Azure DNS'],
    gcp: ['Cloud DNS'],
  }),
  family('private-networking', 'networking', 'Private networking + NAT/VPN', 'priced', {
    aws: ['Amazon VPC', 'NAT Gateway', 'Site-to-Site VPN'],
    azure: ['Azure Virtual Network', 'NAT Gateway', 'VPN Gateway'],
    gcp: ['Virtual Private Cloud', 'Cloud NAT', 'Cloud VPN'],
  }),
  family('dedicated-connectivity', 'networking', 'Dedicated connectivity', 'priced', {
    aws: ['AWS Direct Connect'],
    azure: ['ExpressRoute'],
    gcp: ['Cloud Interconnect'],
  }),
  family('identity-access', 'security', 'Identity + access', 'roadmap', {
    aws: ['AWS IAM', 'IAM Identity Center'],
    azure: ['Microsoft Entra ID', 'Managed identities'],
    gcp: ['Cloud IAM', 'Identity Platform'],
  }),
  family('keys-secrets', 'security', 'Keys + secrets', 'priced', {
    aws: ['AWS KMS', 'AWS Secrets Manager'],
    azure: ['Azure Key Vault'],
    gcp: ['Cloud KMS', 'Secret Manager'],
  }),
  family('security-posture', 'security', 'Security posture', 'priced', {
    aws: ['AWS Security Hub', 'Amazon GuardDuty'],
    azure: ['Microsoft Defender for Cloud', 'Microsoft Sentinel'],
    gcp: ['Security Command Center'],
  }),
  family('waf-ddos', 'security', 'WAF + DDoS protection', 'priced', {
    aws: ['AWS WAF', 'AWS Shield'],
    azure: ['Azure Web Application Firewall', 'Azure DDoS Protection'],
    gcp: ['Cloud Armor'],
  }),
  family('monitoring', 'operations', 'Monitoring', 'priced', {
    aws: ['Amazon CloudWatch'],
    azure: ['Azure Monitor'],
    gcp: ['Cloud Monitoring'],
  }),
  family('logging-audit', 'operations', 'Logging + audit', 'priced', {
    aws: ['AWS CloudTrail', 'CloudWatch Logs'],
    azure: ['Azure Activity Log', 'Log Analytics'],
    gcp: ['Cloud Audit Logs', 'Cloud Logging'],
  }),
  family('tracing-apm', 'operations', 'Tracing + APM', 'priced', {
    aws: ['AWS X-Ray'],
    azure: ['Application Insights'],
    gcp: ['Cloud Trace', 'Cloud Profiler'],
  }),
  family('cost-management', 'operations', 'Cost management', 'roadmap', {
    aws: ['AWS Cost Explorer', 'AWS Budgets'],
    azure: ['Microsoft Cost Management'],
    gcp: ['Cloud Billing', 'Cost Management'],
  }),
  family('cicd', 'devops', 'CI/CD', 'roadmap', {
    aws: ['AWS CodePipeline', 'AWS CodeBuild'],
    azure: ['Azure DevOps', 'GitHub Actions'],
    gcp: ['Cloud Build', 'Cloud Deploy'],
  }),
  family('iac-config', 'devops', 'IaC + configuration', 'roadmap', {
    aws: ['AWS CloudFormation', 'AWS CDK'],
    azure: ['ARM templates', 'Bicep'],
    gcp: ['Infrastructure Manager', 'Config Controller'],
  }),
  family('migration', 'migration', 'Migration', 'roadmap', {
    aws: ['AWS Application Migration Service', 'AWS DMS'],
    azure: ['Azure Migrate', 'Database Migration Service'],
    gcp: ['Migration Center', 'Database Migration Service'],
  }),
  family('hybrid-edge', 'edge', 'Hybrid + distributed cloud', 'roadmap', {
    aws: ['AWS Outposts', 'AWS Local Zones'],
    azure: ['Azure Arc', 'Azure Local'],
    gcp: ['Google Distributed Cloud'],
  }),
  family('iot', 'edge', 'Internet of Things', 'roadmap', {
    aws: ['AWS IoT Core', 'AWS IoT Greengrass'],
    azure: ['Azure IoT Hub', 'Azure IoT Edge'],
    gcp: ['Pub/Sub', 'Google Cloud partners'],
  }),
  family('desktop-end-user', 'business', 'Virtual desktop', 'roadmap', {
    aws: ['Amazon WorkSpaces', 'Amazon AppStream 2.0'],
    azure: ['Azure Virtual Desktop', 'Windows 365'],
    gcp: ['Google Cloud VMware Engine', 'Chrome Enterprise Premium'],
  }),
  family('marketplace', 'business', 'Marketplace', 'roadmap', {
    aws: ['AWS Marketplace'],
    azure: ['Azure Marketplace'],
    gcp: ['Google Cloud Marketplace'],
  }),
];

export const DEFAULT_SELECTED_SERVICE_FAMILY_IDS = [
  'vm-compute',
  'autoscaling-compute',
  'object-storage',
  'relational-database',
  'cache',
  'cdn-edge',
  'load-balancing',
];

const serviceFamilyIdSet = new Set(CLOUD_SERVICE_CATALOG.map((service) => service.id));

export function orderedServiceFamilyIds(ids: string[]): string[] {
  const selected = new Set(ids.filter((id) => serviceFamilyIdSet.has(id)));

  return CLOUD_SERVICE_CATALOG.filter((service) => selected.has(service.id)).map(
    (service) => service.id,
  );
}

export function serviceCatalogTraceability(
  ids: string[],
): Array<{ nwsPath: string; sourceRef: string }> {
  return orderedServiceFamilyIds(ids).map((id) => ({
    nwsPath: 'metadata.serviceCatalog',
    sourceRef: `${SERVICE_CATALOG_TRACE_PREFIX}${id}`,
  }));
}

export function serviceFamilyIdsFromTraceability(
  traceability: Array<{ sourceRef: string }> | undefined,
): string[] {
  const ids =
    traceability
      ?.map((entry) =>
        entry.sourceRef.startsWith(SERVICE_CATALOG_TRACE_PREFIX)
          ? entry.sourceRef.slice(SERVICE_CATALOG_TRACE_PREFIX.length)
          : '',
      )
      .filter((id) => serviceFamilyIdSet.has(id)) ?? [];

  return ids.length > 0 ? orderedServiceFamilyIds(ids) : DEFAULT_SELECTED_SERVICE_FAMILY_IDS;
}

export function supportLabel(status: ServiceSupportStatus): string {
  switch (status) {
    case 'priced':
      return 'Priced';
    case 'mapped':
      return 'Mapped';
    case 'roadmap':
      return 'Roadmap';
  }
}

function family(
  id: string,
  categoryId: string,
  label: string,
  supportStatus: ServiceSupportStatus,
  providerServices: Record<ProviderId, string[]>,
): CloudServiceFamily {
  return {
    id,
    categoryId,
    label,
    supportStatus,
    providerServices,
  };
}
