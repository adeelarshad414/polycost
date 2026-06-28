import { ProviderId, ServiceCategory } from '../adapters/common/cloud-provider-adapter';

export interface ServiceEquivalenceRule {
  category: ServiceCategory;
  tierLabel: string;
  awsSkuPattern?: string;
  azureSkuPattern?: string;
  gcpSkuPattern?: string;
  notes: string;
  isApproximate: boolean;
}

export type ProviderSkuPatterns = Partial<Record<ProviderId, string>>;

export const SERVICE_EQUIVALENCE_SEED: ServiceEquivalenceRule[] = [
  {
    category: 'compute',
    tierLabel: 'compute-fixed-general-purpose',
    awsSkuPattern: 'EC2 general purpose instances (T/M families)',
    azureSkuPattern: 'Virtual Machines general purpose instances (B/D families)',
    gcpSkuPattern: 'Compute Engine general purpose machine types (E2/N2 families)',
    notes: 'Baseline fixed VM or instance capacity for web and API workloads.',
    isApproximate: false,
  },
  {
    category: 'compute',
    tierLabel: 'compute-autoscaling-general-purpose',
    awsSkuPattern: 'EC2 Auto Scaling with general purpose instances',
    azureSkuPattern: 'Virtual Machine Scale Sets with general purpose instances',
    gcpSkuPattern: 'Managed Instance Groups with general purpose machine types',
    notes: 'Autoscaling VM capacity. Scaling policy semantics differ by cloud.',
    isApproximate: false,
  },
  {
    category: 'storage',
    tierLabel: 'storage-object-standard',
    awsSkuPattern: 'S3 Standard',
    azureSkuPattern: 'Blob Storage Hot tier',
    gcpSkuPattern: 'Cloud Storage Standard',
    notes: 'Frequently accessed object storage.',
    isApproximate: false,
  },
  {
    category: 'storage',
    tierLabel: 'storage-object-infrequent',
    awsSkuPattern: 'S3 Standard-IA',
    azureSkuPattern: 'Blob Storage Cool tier',
    gcpSkuPattern: 'Cloud Storage Nearline',
    notes: 'Infrequently accessed object storage. Minimum storage duration differs by cloud.',
    isApproximate: false,
  },
  {
    category: 'storage',
    tierLabel: 'storage-object-archive',
    awsSkuPattern: 'S3 Glacier Flexible Retrieval',
    azureSkuPattern: 'Blob Storage Archive tier',
    gcpSkuPattern: 'Cloud Storage Archive',
    notes: 'Archive object storage. Retrieval and early deletion rules differ by cloud.',
    isApproximate: true,
  },
  {
    category: 'storage',
    tierLabel: 'storage-block-general-purpose',
    awsSkuPattern: 'EBS gp3',
    azureSkuPattern: 'Managed Disks Premium SSD v2 or Standard SSD',
    gcpSkuPattern: 'Persistent Disk Balanced',
    notes: 'General purpose block storage for attached volumes.',
    isApproximate: false,
  },
  {
    category: 'storage',
    tierLabel: 'storage-file-shared',
    awsSkuPattern: 'EFS Standard',
    azureSkuPattern: 'Azure Files Premium or Transaction Optimized',
    gcpSkuPattern: 'Filestore Basic or Enterprise',
    notes: 'Managed shared file storage. Throughput and protocol options differ by cloud.',
    isApproximate: true,
  },
  {
    category: 'database',
    tierLabel: 'database-postgres-managed',
    awsSkuPattern: 'RDS for PostgreSQL or Aurora PostgreSQL',
    azureSkuPattern: 'Azure Database for PostgreSQL Flexible Server',
    gcpSkuPattern: 'Cloud SQL for PostgreSQL',
    notes: 'Managed PostgreSQL-compatible relational database.',
    isApproximate: false,
  },
  {
    category: 'database',
    tierLabel: 'database-mysql-managed',
    awsSkuPattern: 'RDS for MySQL or Aurora MySQL',
    azureSkuPattern: 'Azure Database for MySQL Flexible Server',
    gcpSkuPattern: 'Cloud SQL for MySQL',
    notes: 'Managed MySQL-compatible relational database.',
    isApproximate: false,
  },
  {
    category: 'database',
    tierLabel: 'database-mongodb-managed',
    awsSkuPattern: 'Amazon DocumentDB or MongoDB Atlas on AWS',
    azureSkuPattern: 'Azure Cosmos DB for MongoDB or MongoDB Atlas on Azure',
    gcpSkuPattern: 'MongoDB Atlas on Google Cloud',
    notes: 'MongoDB-compatible managed service choices are not feature-identical.',
    isApproximate: true,
  },
  {
    category: 'database',
    tierLabel: 'database-redis-managed',
    awsSkuPattern: 'ElastiCache for Redis or Valkey',
    azureSkuPattern: 'Azure Cache for Redis',
    gcpSkuPattern: 'Memorystore for Redis or Valkey',
    notes: 'Managed Redis-compatible cache.',
    isApproximate: false,
  },
  {
    category: 'database',
    tierLabel: 'database-generic-relational-managed',
    awsSkuPattern: 'RDS or Aurora managed relational database',
    azureSkuPattern: 'Azure managed relational database service',
    gcpSkuPattern: 'Cloud SQL or AlloyDB',
    notes: 'Generic relational database requirements need user confirmation before exact pricing.',
    isApproximate: true,
  },
  {
    category: 'database',
    tierLabel: 'database-generic-nosql-managed',
    awsSkuPattern: 'DynamoDB or DocumentDB',
    azureSkuPattern: 'Cosmos DB',
    gcpSkuPattern: 'Firestore or Bigtable',
    notes: 'Generic NoSQL systems use provider-specific data models and capacity units.',
    isApproximate: true,
  },
  {
    category: 'network',
    tierLabel: 'network-egress-internet',
    awsSkuPattern: 'Data Transfer Out to Internet',
    azureSkuPattern: 'Bandwidth Data Transfer Out',
    gcpSkuPattern: 'Internet Egress',
    notes: 'Public internet egress. Regional tiers and free allowances vary.',
    isApproximate: false,
  },
  {
    category: 'network',
    tierLabel: 'network-cdn',
    awsSkuPattern: 'CloudFront',
    azureSkuPattern: 'Azure Front Door or Azure CDN',
    gcpSkuPattern: 'Cloud CDN',
    notes: 'CDN services use provider-specific request and egress dimensions.',
    isApproximate: true,
  },
  {
    category: 'network',
    tierLabel: 'network-load-balancer',
    awsSkuPattern: 'Elastic Load Balancing',
    azureSkuPattern: 'Azure Load Balancer or Application Gateway',
    gcpSkuPattern: 'Cloud Load Balancing',
    notes: 'Managed load balancing. LCU, rule, and proxy pricing dimensions differ by cloud.',
    isApproximate: true,
  },
];
