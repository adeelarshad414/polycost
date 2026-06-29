\set ON_ERROR_STOP on

WITH seed (
    provider,
    service_category,
    service_name,
    sku_id,
    sku_description,
    region,
    unit,
    unit_price_usd,
    attributes
) AS (
    VALUES
        ('aws', 'compute', 'Local Seed AWS General Compute 2 vCPU / 4 GB', 'local-seed-aws-compute-2x4', 'Local development baseline compute estimate', 'us-east-1', 'hour', 0.041600, '{"source":"local_seed","vcpu":2,"memoryGb":4}'::jsonb),
        ('aws', 'compute', 'Local Seed AWS General Compute 4 vCPU / 8 GB', 'local-seed-aws-compute-4x8', 'Local development baseline compute estimate', 'us-east-1', 'hour', 0.083200, '{"source":"local_seed","vcpu":4,"memoryGb":8}'::jsonb),
        ('aws', 'compute', 'Local Seed AWS General Compute 8 vCPU / 32 GB', 'local-seed-aws-compute-8x32', 'Local development baseline compute estimate', 'us-east-1', 'hour', 0.332800, '{"source":"local_seed","vcpu":8,"memoryGb":32}'::jsonb),
        ('aws', 'storage', 'Local Seed Amazon S3 Standard', 'local-seed-aws-storage-object', 'Local development baseline object storage estimate', 'us-east-1', 'GB-Mo', 0.023000, '{"source":"local_seed","type":"object","accessPattern":"frequent"}'::jsonb),
        ('aws', 'storage', 'Local Seed Amazon EBS General Purpose', 'local-seed-aws-storage-block', 'Local development baseline block storage estimate', 'us-east-1', 'GB-Mo', 0.080000, '{"source":"local_seed","type":"block","accessPattern":"frequent","isApproximate":true}'::jsonb),
        ('aws', 'storage', 'Local Seed Amazon EFS Standard', 'local-seed-aws-storage-file', 'Local development baseline file storage estimate', 'us-east-1', 'GB-Mo', 0.300000, '{"source":"local_seed","type":"file","accessPattern":"frequent","isApproximate":true}'::jsonb),
        ('aws', 'database', 'Local Seed Amazon RDS PostgreSQL', 'local-seed-aws-db-postgres', 'Local development baseline managed database estimate', 'us-east-1', 'hour', 0.068000, '{"source":"local_seed","engine":"postgres"}'::jsonb),
        ('aws', 'database', 'Local Seed Amazon RDS MySQL', 'local-seed-aws-db-mysql', 'Local development baseline managed database estimate', 'us-east-1', 'hour', 0.068000, '{"source":"local_seed","engine":"mysql"}'::jsonb),
        ('aws', 'database', 'Local Seed Amazon DocumentDB', 'local-seed-aws-db-mongodb', 'Local development baseline document database estimate', 'us-east-1', 'hour', 0.120000, '{"source":"local_seed","engine":"mongodb","isApproximate":true}'::jsonb),
        ('aws', 'database', 'Local Seed Amazon ElastiCache Redis', 'local-seed-aws-db-redis', 'Local development baseline cache estimate', 'us-east-1', 'hour', 0.050000, '{"source":"local_seed","engine":"redis","isApproximate":true}'::jsonb),
        ('aws', 'database', 'Local Seed AWS Relational Database', 'local-seed-aws-db-generic-relational', 'Local development baseline relational database estimate', 'us-east-1', 'hour', 0.068000, '{"source":"local_seed","engine":"generic_relational","isApproximate":true}'::jsonb),
        ('aws', 'database', 'Local Seed AWS NoSQL Database', 'local-seed-aws-db-generic-nosql', 'Local development baseline NoSQL database estimate', 'us-east-1', 'hour', 0.090000, '{"source":"local_seed","engine":"generic_nosql","isApproximate":true}'::jsonb),
        ('aws', 'database', 'Local Seed AWS Database Storage', 'local-seed-aws-db-storage', 'Local development baseline database storage estimate', 'us-east-1', 'GB-Mo', 0.115000, '{"source":"local_seed","usage":"storage"}'::jsonb),
        ('aws', 'network', 'Local Seed AWS Internet Egress', 'local-seed-aws-network-egress', 'Local development baseline network egress estimate', 'us-east-1', 'GB', 0.090000, '{"source":"local_seed"}'::jsonb),

        ('azure', 'compute', 'Local Seed Azure General Compute 2 vCPU / 4 GB', 'local-seed-azure-compute-2x4', 'Local development baseline compute estimate', 'eastus', 'hour', 0.041600, '{"source":"local_seed","vcpu":2,"memoryGb":4}'::jsonb),
        ('azure', 'compute', 'Local Seed Azure General Compute 4 vCPU / 8 GB', 'local-seed-azure-compute-4x8', 'Local development baseline compute estimate', 'eastus', 'hour', 0.083200, '{"source":"local_seed","vcpu":4,"memoryGb":8}'::jsonb),
        ('azure', 'compute', 'Local Seed Azure General Compute 8 vCPU / 32 GB', 'local-seed-azure-compute-8x32', 'Local development baseline compute estimate', 'eastus', 'hour', 0.332800, '{"source":"local_seed","vcpu":8,"memoryGb":32}'::jsonb),
        ('azure', 'storage', 'Local Seed Azure Blob Hot LRS', 'local-seed-azure-storage-object', 'Local development baseline object storage estimate', 'eastus', 'GB-Mo', 0.018400, '{"source":"local_seed","type":"object","accessPattern":"frequent"}'::jsonb),
        ('azure', 'storage', 'Local Seed Azure Managed Disk', 'local-seed-azure-storage-block', 'Local development baseline block storage estimate', 'eastus', 'GB-Mo', 0.076800, '{"source":"local_seed","type":"block","accessPattern":"frequent","isApproximate":true}'::jsonb),
        ('azure', 'storage', 'Local Seed Azure Files', 'local-seed-azure-storage-file', 'Local development baseline file storage estimate', 'eastus', 'GB-Mo', 0.060000, '{"source":"local_seed","type":"file","accessPattern":"frequent","isApproximate":true}'::jsonb),
        ('azure', 'database', 'Local Seed Azure Database for PostgreSQL', 'local-seed-azure-db-postgres', 'Local development baseline managed database estimate', 'eastus', 'hour', 0.068000, '{"source":"local_seed","engine":"postgres"}'::jsonb),
        ('azure', 'database', 'Local Seed Azure Database for MySQL', 'local-seed-azure-db-mysql', 'Local development baseline managed database estimate', 'eastus', 'hour', 0.068000, '{"source":"local_seed","engine":"mysql"}'::jsonb),
        ('azure', 'database', 'Local Seed Azure Cosmos DB MongoDB API', 'local-seed-azure-db-mongodb', 'Local development baseline document database estimate', 'eastus', 'hour', 0.120000, '{"source":"local_seed","engine":"mongodb","isApproximate":true}'::jsonb),
        ('azure', 'database', 'Local Seed Azure Cache for Redis', 'local-seed-azure-db-redis', 'Local development baseline cache estimate', 'eastus', 'hour', 0.050000, '{"source":"local_seed","engine":"redis","isApproximate":true}'::jsonb),
        ('azure', 'database', 'Local Seed Azure Relational Database', 'local-seed-azure-db-generic-relational', 'Local development baseline relational database estimate', 'eastus', 'hour', 0.068000, '{"source":"local_seed","engine":"generic_relational","isApproximate":true}'::jsonb),
        ('azure', 'database', 'Local Seed Azure NoSQL Database', 'local-seed-azure-db-generic-nosql', 'Local development baseline NoSQL database estimate', 'eastus', 'hour', 0.090000, '{"source":"local_seed","engine":"generic_nosql","isApproximate":true}'::jsonb),
        ('azure', 'database', 'Local Seed Azure Database Storage', 'local-seed-azure-db-storage', 'Local development baseline database storage estimate', 'eastus', 'GB-Mo', 0.115000, '{"source":"local_seed","usage":"storage"}'::jsonb),
        ('azure', 'network', 'Local Seed Azure Internet Egress', 'local-seed-azure-network-egress', 'Local development baseline network egress estimate', 'eastus', 'GB', 0.087000, '{"source":"local_seed"}'::jsonb),

        ('gcp', 'compute', 'Local Seed GCP General Compute 2 vCPU / 4 GB', 'local-seed-gcp-compute-2x4', 'Local development baseline compute estimate', 'us-central1', 'hour', 0.067000, '{"source":"local_seed","vcpu":2,"memoryGb":4}'::jsonb),
        ('gcp', 'compute', 'Local Seed GCP General Compute 4 vCPU / 8 GB', 'local-seed-gcp-compute-4x8', 'Local development baseline compute estimate', 'us-central1', 'hour', 0.134000, '{"source":"local_seed","vcpu":4,"memoryGb":8}'::jsonb),
        ('gcp', 'compute', 'Local Seed GCP General Compute 8 vCPU / 32 GB', 'local-seed-gcp-compute-8x32', 'Local development baseline compute estimate', 'us-central1', 'hour', 0.536000, '{"source":"local_seed","vcpu":8,"memoryGb":32}'::jsonb),
        ('gcp', 'storage', 'Local Seed Google Cloud Storage Standard', 'local-seed-gcp-storage-object', 'Local development baseline object storage estimate', 'us-central1', 'GB-Mo', 0.020000, '{"source":"local_seed","type":"object","accessPattern":"frequent"}'::jsonb),
        ('gcp', 'storage', 'Local Seed Google Persistent Disk Balanced', 'local-seed-gcp-storage-block', 'Local development baseline block storage estimate', 'us-central1', 'GB-Mo', 0.100000, '{"source":"local_seed","type":"block","accessPattern":"frequent","isApproximate":true}'::jsonb),
        ('gcp', 'storage', 'Local Seed Google Filestore Basic', 'local-seed-gcp-storage-file', 'Local development baseline file storage estimate', 'us-central1', 'GB-Mo', 0.200000, '{"source":"local_seed","type":"file","accessPattern":"frequent","isApproximate":true}'::jsonb),
        ('gcp', 'database', 'Local Seed Cloud SQL PostgreSQL', 'local-seed-gcp-db-postgres', 'Local development baseline managed database estimate', 'us-central1', 'hour', 0.082000, '{"source":"local_seed","engine":"postgres"}'::jsonb),
        ('gcp', 'database', 'Local Seed Cloud SQL MySQL', 'local-seed-gcp-db-mysql', 'Local development baseline managed database estimate', 'us-central1', 'hour', 0.082000, '{"source":"local_seed","engine":"mysql"}'::jsonb),
        ('gcp', 'database', 'Local Seed MongoDB-compatible Service', 'local-seed-gcp-db-mongodb', 'Local development baseline document database estimate', 'us-central1', 'hour', 0.120000, '{"source":"local_seed","engine":"mongodb","isApproximate":true}'::jsonb),
        ('gcp', 'database', 'Local Seed Memorystore Redis', 'local-seed-gcp-db-redis', 'Local development baseline cache estimate', 'us-central1', 'hour', 0.050000, '{"source":"local_seed","engine":"redis","isApproximate":true}'::jsonb),
        ('gcp', 'database', 'Local Seed GCP Relational Database', 'local-seed-gcp-db-generic-relational', 'Local development baseline relational database estimate', 'us-central1', 'hour', 0.082000, '{"source":"local_seed","engine":"generic_relational","isApproximate":true}'::jsonb),
        ('gcp', 'database', 'Local Seed GCP NoSQL Database', 'local-seed-gcp-db-generic-nosql', 'Local development baseline NoSQL database estimate', 'us-central1', 'hour', 0.090000, '{"source":"local_seed","engine":"generic_nosql","isApproximate":true}'::jsonb),
        ('gcp', 'database', 'Local Seed GCP Database Storage', 'local-seed-gcp-db-storage', 'Local development baseline database storage estimate', 'us-central1', 'GB-Mo', 0.170000, '{"source":"local_seed","usage":"storage"}'::jsonb),
        ('gcp', 'network', 'Local Seed GCP Internet Egress', 'local-seed-gcp-network-egress', 'Local development baseline network egress estimate', 'us-central1', 'GB', 0.085000, '{"source":"local_seed"}'::jsonb)
)
INSERT INTO pricing_catalog (
    provider,
    service_category,
    service_name,
    sku_id,
    sku_description,
    region,
    unit,
    unit_price_usd,
    attributes,
    effective_date,
    fetched_at
)
SELECT
    provider,
    service_category,
    service_name,
    sku_id,
    sku_description,
    region,
    unit,
    unit_price_usd,
    attributes,
    TIMESTAMP '2026-06-29 00:00:00',
    TIMESTAMP '2026-06-29 00:00:00'
FROM seed
ON CONFLICT (provider, sku_id, region, effective_date)
DO UPDATE SET
    service_category = EXCLUDED.service_category,
    service_name = EXCLUDED.service_name,
    sku_description = EXCLUDED.sku_description,
    unit = EXCLUDED.unit,
    unit_price_usd = EXCLUDED.unit_price_usd,
    attributes = EXCLUDED.attributes,
    fetched_at = EXCLUDED.fetched_at;

INSERT INTO pricing_etl_runs (
    provider,
    started_at,
    completed_at,
    status,
    records_updated,
    error_detail
)
SELECT provider, started_at, completed_at, status, records_updated, error_detail
FROM (
    VALUES
        ('aws', TIMESTAMP '2026-06-29 00:00:00', TIMESTAMP '2026-06-29 00:00:00', 'success', 14, 'Local seed catalog baseline'),
        ('azure', TIMESTAMP '2026-06-29 00:00:00', TIMESTAMP '2026-06-29 00:00:00', 'success', 14, 'Local seed catalog baseline'),
        ('gcp', TIMESTAMP '2026-06-29 00:00:00', TIMESTAMP '2026-06-29 00:00:00', 'success', 14, 'Local seed catalog baseline')
) AS run(provider, started_at, completed_at, status, records_updated, error_detail)
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '004'
);

INSERT INTO schema_migrations (version, name)
VALUES ('004', 'seed_local_pricing_catalog')
ON CONFLICT (version) DO NOTHING;
