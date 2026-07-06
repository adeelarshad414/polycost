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
        ('aws', 'database', 'Local Seed Amazon RDS SQL Server', 'local-seed-aws-db-sql-server', 'Local development baseline managed SQL Server estimate', 'us-east-1', 'hour', 0.146000, '{"source":"local_seed","engine":"sql_server","licenseModel":"license_included","isApproximate":true}'::jsonb),
        ('azure', 'database', 'Local Seed Azure SQL Database', 'local-seed-azure-db-sql-server', 'Local development baseline managed SQL Server estimate', 'eastus', 'hour', 0.121000, '{"source":"local_seed","engine":"sql_server","licenseModel":"license_included"}'::jsonb),
        ('gcp', 'database', 'Local Seed Cloud SQL for SQL Server', 'local-seed-gcp-db-sql-server', 'Local development baseline managed SQL Server estimate', 'us-central1', 'hour', 0.152000, '{"source":"local_seed","engine":"sql_server","licenseModel":"license_included","isApproximate":true}'::jsonb)
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
    TIMESTAMP '2026-07-06 00:00:00',
    TIMESTAMP '2026-07-06 00:00:00'
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

INSERT INTO service_equivalence_map (
    category,
    tier_label,
    aws_sku_pattern,
    azure_sku_pattern,
    gcp_sku_pattern,
    notes,
    is_approximate
)
VALUES (
    'database',
    'database-sql-server-managed',
    'Amazon RDS for SQL Server',
    'Azure SQL Database or SQL Managed Instance',
    'Cloud SQL for SQL Server',
    'Managed SQL Server-compatible database. License-included, BYOL, and hybrid benefit terms can materially change cost.',
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
VALUES ('023', 'seed_sql_server_database_catalog')
ON CONFLICT (version) DO NOTHING;
