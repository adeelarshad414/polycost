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
        ('aws', 'compute', 'Local Seed AWS Accelerated Compute 16 vCPU / 64 GB GPU', 'local-seed-aws-compute-gpu-16x64', 'Local development accelerated compute estimate', 'us-east-1', 'hour', 3.060000, '{"source":"local_seed","vcpu":16,"memoryGb":64,"instanceFamily":"accelerated-computing","processorArchitecture":"gpu","isApproximate":true}'::jsonb),
        ('azure', 'compute', 'Local Seed Azure Accelerated Compute 16 vCPU / 64 GB GPU', 'local-seed-azure-compute-gpu-16x64', 'Local development accelerated compute estimate', 'eastus', 'hour', 3.670000, '{"source":"local_seed","vcpu":16,"memoryGb":64,"instanceFamily":"accelerated-computing","processorArchitecture":"gpu","isApproximate":true}'::jsonb),
        ('gcp', 'compute', 'Local Seed GCP Accelerated Compute 16 vCPU / 64 GB GPU', 'local-seed-gcp-compute-gpu-16x64', 'Local development accelerated compute estimate', 'us-central1', 'hour', 2.930000, '{"source":"local_seed","vcpu":16,"memoryGb":64,"instanceFamily":"accelerated-computing","processorArchitecture":"gpu","isApproximate":true}'::jsonb)
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

WITH commitment_terms (
    pricing_model,
    label,
    multiplier
) AS (
    VALUES
        ('reserved-1yr', 'Reserved 1-Year', 0.70::numeric),
        ('reserved-3yr', 'Reserved 3-Year', 0.50::numeric)
),
provider_adjusted_terms AS (
    SELECT pricing_catalog.provider,
           pricing_catalog.service_category,
           pricing_catalog.service_name,
           pricing_catalog.sku_id,
           pricing_catalog.sku_description,
           pricing_catalog.region,
           pricing_catalog.unit,
           pricing_catalog.unit_price_usd,
           pricing_catalog.attributes,
           pricing_catalog.effective_date,
           pricing_catalog.fetched_at,
           commitment_terms.pricing_model,
           commitment_terms.label,
           CASE
               WHEN pricing_catalog.provider = 'aws'
                    AND commitment_terms.pricing_model = 'reserved-1yr'
                   THEN 0.68::numeric
               WHEN pricing_catalog.provider = 'aws'
                    AND commitment_terms.pricing_model = 'reserved-3yr'
                   THEN 0.48::numeric
               WHEN pricing_catalog.provider = 'azure'
                    AND commitment_terms.pricing_model = 'reserved-1yr'
                   THEN 0.70::numeric
               WHEN pricing_catalog.provider = 'azure'
                    AND commitment_terms.pricing_model = 'reserved-3yr'
                   THEN 0.50::numeric
               WHEN pricing_catalog.provider = 'gcp'
                    AND commitment_terms.pricing_model = 'reserved-1yr'
                   THEN 0.72::numeric
               WHEN pricing_catalog.provider = 'gcp'
                    AND commitment_terms.pricing_model = 'reserved-3yr'
                   THEN 0.52::numeric
               ELSE commitment_terms.multiplier
           END AS provider_multiplier
    FROM pricing_catalog
    CROSS JOIN commitment_terms
    WHERE pricing_catalog.sku_id IN (
        'local-seed-aws-compute-gpu-16x64',
        'local-seed-azure-compute-gpu-16x64',
        'local-seed-gcp-compute-gpu-16x64'
    )
      AND pricing_catalog.attributes->>'source' = 'local_seed'
      AND COALESCE(pricing_catalog.attributes->>'pricingModel', 'on-demand') = 'on-demand'
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
    service_name || ' ' || label,
    sku_id || '-' || pricing_model,
    COALESCE(sku_description, 'Local development accelerated compute estimate') || ' ' || label,
    region,
    unit,
    ROUND((unit_price_usd * provider_multiplier)::numeric, 6),
    attributes
        || jsonb_build_object(
            'pricingModel', pricing_model,
            'upfrontOption', 'none',
            'commitmentSeed', true
        ),
    effective_date,
    fetched_at
FROM provider_adjusted_terms
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
        ('aws', TIMESTAMP '2026-06-29 00:00:00', TIMESTAMP '2026-06-29 00:00:00', 'success', 1, 'Local accelerated compute seed extension'),
        ('azure', TIMESTAMP '2026-06-29 00:00:00', TIMESTAMP '2026-06-29 00:00:00', 'success', 1, 'Local accelerated compute seed extension'),
        ('gcp', TIMESTAMP '2026-06-29 00:00:00', TIMESTAMP '2026-06-29 00:00:00', 'success', 1, 'Local accelerated compute seed extension')
) AS run(provider, started_at, completed_at, status, records_updated, error_detail)
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '015'
);

INSERT INTO schema_migrations (version, name)
VALUES ('015', 'seed_accelerated_compute_pricing_catalog')
ON CONFLICT (version) DO NOTHING;
