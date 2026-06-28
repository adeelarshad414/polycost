\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'service_equivalence_map_category_tier_label_key'
    ) THEN
        ALTER TABLE service_equivalence_map
            ADD CONSTRAINT service_equivalence_map_category_tier_label_key
            UNIQUE (category, tier_label);
    END IF;
END $$;

INSERT INTO service_equivalence_map (
    category,
    tier_label,
    aws_sku_pattern,
    azure_sku_pattern,
    gcp_sku_pattern,
    notes,
    is_approximate
)
VALUES
    (
        'compute',
        'compute-fixed-general-purpose',
        'EC2 general purpose instances (T/M families)',
        'Virtual Machines general purpose instances (B/D families)',
        'Compute Engine general purpose machine types (E2/N2 families)',
        'Baseline fixed VM or instance capacity for web and API workloads.',
        false
    ),
    (
        'compute',
        'compute-autoscaling-general-purpose',
        'EC2 Auto Scaling with general purpose instances',
        'Virtual Machine Scale Sets with general purpose instances',
        'Managed Instance Groups with general purpose machine types',
        'Autoscaling VM capacity. Scaling policy semantics differ by cloud.',
        false
    ),
    (
        'storage',
        'storage-object-standard',
        'S3 Standard',
        'Blob Storage Hot tier',
        'Cloud Storage Standard',
        'Frequently accessed object storage.',
        false
    ),
    (
        'storage',
        'storage-object-infrequent',
        'S3 Standard-IA',
        'Blob Storage Cool tier',
        'Cloud Storage Nearline',
        'Infrequently accessed object storage. Minimum storage duration differs by cloud.',
        false
    ),
    (
        'storage',
        'storage-object-archive',
        'S3 Glacier Flexible Retrieval',
        'Blob Storage Archive tier',
        'Cloud Storage Archive',
        'Archive object storage. Retrieval and early deletion rules differ by cloud.',
        true
    ),
    (
        'storage',
        'storage-block-general-purpose',
        'EBS gp3',
        'Managed Disks Premium SSD v2 or Standard SSD',
        'Persistent Disk Balanced',
        'General purpose block storage for attached volumes.',
        false
    ),
    (
        'storage',
        'storage-file-shared',
        'EFS Standard',
        'Azure Files Premium or Transaction Optimized',
        'Filestore Basic or Enterprise',
        'Managed shared file storage. Throughput and protocol options differ by cloud.',
        true
    ),
    (
        'database',
        'database-postgres-managed',
        'RDS for PostgreSQL or Aurora PostgreSQL',
        'Azure Database for PostgreSQL Flexible Server',
        'Cloud SQL for PostgreSQL',
        'Managed PostgreSQL-compatible relational database.',
        false
    ),
    (
        'database',
        'database-mysql-managed',
        'RDS for MySQL or Aurora MySQL',
        'Azure Database for MySQL Flexible Server',
        'Cloud SQL for MySQL',
        'Managed MySQL-compatible relational database.',
        false
    ),
    (
        'database',
        'database-mongodb-managed',
        'Amazon DocumentDB or MongoDB Atlas on AWS',
        'Azure Cosmos DB for MongoDB or MongoDB Atlas on Azure',
        'MongoDB Atlas on Google Cloud',
        'MongoDB-compatible managed service choices are not feature-identical.',
        true
    ),
    (
        'database',
        'database-redis-managed',
        'ElastiCache for Redis or Valkey',
        'Azure Cache for Redis',
        'Memorystore for Redis or Valkey',
        'Managed Redis-compatible cache.',
        false
    ),
    (
        'database',
        'database-generic-relational-managed',
        'RDS or Aurora managed relational database',
        'Azure managed relational database service',
        'Cloud SQL or AlloyDB',
        'Generic relational database requirements need user confirmation before exact pricing.',
        true
    ),
    (
        'database',
        'database-generic-nosql-managed',
        'DynamoDB or DocumentDB',
        'Cosmos DB',
        'Firestore or Bigtable',
        'Generic NoSQL systems use provider-specific data models and capacity units.',
        true
    ),
    (
        'network',
        'network-egress-internet',
        'Data Transfer Out to Internet',
        'Bandwidth Data Transfer Out',
        'Internet Egress',
        'Public internet egress. Regional tiers and free allowances vary.',
        false
    ),
    (
        'network',
        'network-cdn',
        'CloudFront',
        'Azure Front Door or Azure CDN',
        'Cloud CDN',
        'CDN services use provider-specific request and egress dimensions.',
        true
    ),
    (
        'network',
        'network-load-balancer',
        'Elastic Load Balancing',
        'Azure Load Balancer or Application Gateway',
        'Cloud Load Balancing',
        'Managed load balancing. LCU, rule, and proxy pricing dimensions differ by cloud.',
        true
    )
ON CONFLICT (category, tier_label)
DO UPDATE SET
    aws_sku_pattern = EXCLUDED.aws_sku_pattern,
    azure_sku_pattern = EXCLUDED.azure_sku_pattern,
    gcp_sku_pattern = EXCLUDED.gcp_sku_pattern,
    notes = EXCLUDED.notes,
    is_approximate = EXCLUDED.is_approximate;

INSERT INTO schema_migrations (version, name)
VALUES ('003', 'seed_service_equivalence_map')
ON CONFLICT (version) DO NOTHING;
