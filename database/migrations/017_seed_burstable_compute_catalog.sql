\set ON_ERROR_STOP on

ALTER TABLE provider_skus
    DROP CONSTRAINT IF EXISTS provider_skus_family_check;

ALTER TABLE provider_skus
    ADD CONSTRAINT provider_skus_family_check
    CHECK (
        family IN (
            'general-purpose',
            'burstable',
            'compute-optimized',
            'memory-optimized',
            'storage-optimized',
            'accelerated-computing'
        )
    );

ALTER TABLE workloads
    DROP CONSTRAINT IF EXISTS workloads_instance_family_check;

ALTER TABLE workloads
    ADD CONSTRAINT workloads_instance_family_check
    CHECK (
        instance_family IN (
            'general-purpose',
            'burstable',
            'compute-optimized',
            'memory-optimized',
            'storage-optimized',
            'accelerated-computing'
        )
    );

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
        ('aws', 'compute', 'Local Seed AWS Burstable Compute 2 vCPU / 4 GB', 'local-seed-aws-compute-burstable-2x4', 'Local development burstable compute estimate', 'us-east-1', 'hour', 0.024200, '{"source":"local_seed","vcpu":2,"memoryGb":4,"instanceFamily":"burstable","processorArchitecture":"x86_64","cpuCreditModel":"burstable","networkBaseline":"low-to-moderate burst network","diskBaseline":"gp3 baseline; validate sustained IOPS","isApproximate":true}'::jsonb),
        ('azure', 'compute', 'Local Seed Azure Burstable Compute 2 vCPU / 4 GB', 'local-seed-azure-compute-burstable-2x4', 'Local development burstable compute estimate', 'eastus', 'hour', 0.026200, '{"source":"local_seed","vcpu":2,"memoryGb":4,"instanceFamily":"burstable","processorArchitecture":"x86_64","cpuCreditModel":"burstable","networkBaseline":"variable B-series burst network","diskBaseline":"Managed Disk baseline depends on VM size","isApproximate":true}'::jsonb),
        ('gcp', 'compute', 'Local Seed GCP Shared-Core Compute 2 vCPU / 4 GB', 'local-seed-gcp-compute-burstable-2x4', 'Local development shared-core compute estimate', 'us-central1', 'hour', 0.023200, '{"source":"local_seed","vcpu":2,"memoryGb":4,"instanceFamily":"burstable","processorArchitecture":"x86_64","cpuCreditModel":"shared-core","networkBaseline":"E2 shared-core network profile","diskBaseline":"Persistent Disk baseline depends on type and size","isApproximate":true}'::jsonb),
        ('gcp', 'compute', 'Local Seed GCP Shared-Core Compute 2 vCPU / 4 GB', 'local-seed-gcp-compute-burstable-2x4', 'Local development shared-core compute estimate', 'us-east1', 'hour', 0.024600, '{"source":"local_seed","vcpu":2,"memoryGb":4,"instanceFamily":"burstable","processorArchitecture":"x86_64","cpuCreditModel":"shared-core","networkBaseline":"E2 shared-core network profile","diskBaseline":"Persistent Disk baseline depends on type and size","isApproximate":true}'::jsonb)
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
    TIMESTAMP '2026-07-02 00:00:00',
    TIMESTAMP '2026-07-02 00:00:00'
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
        ('reserved-3yr', 'Reserved 3-Year', 0.52::numeric)
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
                   THEN 0.50::numeric
               WHEN pricing_catalog.provider = 'azure'
                    AND commitment_terms.pricing_model = 'reserved-1yr'
                   THEN 0.70::numeric
               WHEN pricing_catalog.provider = 'azure'
                    AND commitment_terms.pricing_model = 'reserved-3yr'
                   THEN 0.52::numeric
               WHEN pricing_catalog.provider = 'gcp'
                    AND commitment_terms.pricing_model = 'reserved-1yr'
                   THEN 0.72::numeric
               WHEN pricing_catalog.provider = 'gcp'
                    AND commitment_terms.pricing_model = 'reserved-3yr'
                   THEN 0.54::numeric
               ELSE commitment_terms.multiplier
           END AS provider_multiplier
    FROM pricing_catalog
    CROSS JOIN commitment_terms
    WHERE pricing_catalog.sku_id IN (
        'local-seed-aws-compute-burstable-2x4',
        'local-seed-azure-compute-burstable-2x4',
        'local-seed-gcp-compute-burstable-2x4'
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
    COALESCE(sku_description, 'Local development burstable compute estimate') || ' ' || label,
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

WITH sku_seed (
    provider,
    provider_sku_id,
    family,
    vcpu,
    memory_gb,
    region,
    price_per_hour,
    raw_payload
) AS (
    VALUES
        ('aws', 'local-t3-medium', 'burstable', 2, 4.00, 'us-east-1', 0.024200, '{"source":"local_seed","family":"T3","cpuCreditModel":"burstable"}'::jsonb),
        ('azure', 'local-b2s', 'burstable', 2, 4.00, 'eastus', 0.026200, '{"source":"local_seed","family":"B-series","cpuCreditModel":"burstable"}'::jsonb),
        ('gcp', 'local-e2-small', 'burstable', 2, 4.00, 'us-central1', 0.023200, '{"source":"local_seed","family":"E2 shared-core","cpuCreditModel":"shared-core"}'::jsonb),
        ('gcp', 'local-e2-small', 'burstable', 2, 4.00, 'us-east1', 0.024600, '{"source":"local_seed","family":"E2 shared-core","cpuCreditModel":"shared-core"}'::jsonb)
)
INSERT INTO provider_skus (
    provider,
    provider_sku_id,
    family,
    vcpu,
    memory_gb,
    region,
    os,
    raw_payload,
    last_synced_at,
    supports_reserved,
    supports_savings_plan,
    supports_spot,
    sync_status
)
SELECT
    provider,
    provider_sku_id,
    family,
    vcpu,
    memory_gb,
    region,
    'linux',
    raw_payload,
    TIMESTAMPTZ '2026-07-02 00:00:00+00',
    true,
    true,
    true,
    'success'
FROM sku_seed
ON CONFLICT (provider, provider_sku_id, region)
DO UPDATE SET
    family = EXCLUDED.family,
    vcpu = EXCLUDED.vcpu,
    memory_gb = EXCLUDED.memory_gb,
    raw_payload = EXCLUDED.raw_payload,
    last_synced_at = EXCLUDED.last_synced_at,
    supports_reserved = EXCLUDED.supports_reserved,
    supports_savings_plan = EXCLUDED.supports_savings_plan,
    supports_spot = EXCLUDED.supports_spot,
    sync_status = EXCLUDED.sync_status;

WITH base_rates (
    provider,
    provider_sku_id,
    region,
    price_per_hour
) AS (
    VALUES
        ('aws', 'local-t3-medium', 'us-east-1', 0.024200::numeric),
        ('azure', 'local-b2s', 'eastus', 0.026200::numeric),
        ('gcp', 'local-e2-small', 'us-central1', 0.023200::numeric),
        ('gcp', 'local-e2-small', 'us-east1', 0.024600::numeric)
),
terms (
    term,
    multiplier
) AS (
    VALUES
        ('on_demand', 1.00::numeric),
        ('reserved_1yr', 0.70::numeric),
        ('reserved_3yr', 0.52::numeric),
        ('savings_plan', 0.68::numeric),
        ('spot', 0.35::numeric)
)
INSERT INTO pricing_snapshots (
    sku_id,
    term,
    price_per_hour,
    currency,
    effective_date
)
SELECT
    provider_skus.id,
    terms.term,
    ROUND((base_rates.price_per_hour * terms.multiplier)::numeric, 8),
    'USD',
    DATE '2026-07-02'
FROM base_rates
JOIN provider_skus
  ON provider_skus.provider = base_rates.provider
 AND provider_skus.provider_sku_id = base_rates.provider_sku_id
 AND provider_skus.region = base_rates.region
CROSS JOIN terms
ON CONFLICT (sku_id, term, effective_date)
DO UPDATE SET
    price_per_hour = EXCLUDED.price_per_hour,
    currency = EXCLUDED.currency;

WITH base_rates (
    provider,
    provider_sku_id,
    region,
    price_per_hour
) AS (
    VALUES
        ('aws', 'local-t3-medium', 'us-east-1', 0.024200::numeric),
        ('azure', 'local-b2s', 'eastus', 0.026200::numeric),
        ('gcp', 'local-e2-small', 'us-central1', 0.023200::numeric),
        ('gcp', 'local-e2-small', 'us-east1', 0.024600::numeric)
),
terms (
    term_code,
    payment_option_code,
    multiplier,
    is_estimate
) AS (
    VALUES
        ('on_demand', NULL, 1.00::numeric, false),
        ('reserved_1yr', 'no_upfront', 0.70::numeric, false),
        ('reserved_3yr', 'no_upfront', 0.52::numeric, false),
        ('savings_plan_1yr', 'no_upfront', 0.68::numeric, false),
        ('savings_plan_3yr', 'no_upfront', 0.55::numeric, false),
        ('spot_estimate', NULL, 0.35::numeric, true)
)
INSERT INTO pricing_rates (
    sku_id,
    region,
    pricing_term_id,
    payment_option_id,
    hourly_rate_usd,
    currency,
    is_estimate,
    estimate_range_low_usd,
    estimate_range_high_usd,
    source_fetched_at,
    valid_from,
    valid_to,
    sync_status
)
SELECT
    provider_skus.id,
    base_rates.region,
    pricing_terms.id,
    payment_options.id,
    ROUND((base_rates.price_per_hour * terms.multiplier)::numeric, 6),
    'USD',
    terms.is_estimate,
    CASE
        WHEN terms.is_estimate
            THEN ROUND((base_rates.price_per_hour * terms.multiplier * 0.80)::numeric, 6)
        ELSE NULL
    END,
    CASE
        WHEN terms.is_estimate
            THEN ROUND((base_rates.price_per_hour * terms.multiplier * 1.20)::numeric, 6)
        ELSE NULL
    END,
    TIMESTAMPTZ '2026-07-02 00:00:00+00',
    TIMESTAMPTZ '2026-07-02 00:00:00+00',
    NULL,
    'success'
FROM base_rates
JOIN provider_skus
  ON provider_skus.provider = base_rates.provider
 AND provider_skus.provider_sku_id = base_rates.provider_sku_id
 AND provider_skus.region = base_rates.region
CROSS JOIN terms
JOIN pricing_terms
  ON pricing_terms.code = terms.term_code
LEFT JOIN payment_options
  ON payment_options.code = terms.payment_option_code
ON CONFLICT (
    sku_id,
    region,
    pricing_term_id,
    (COALESCE(payment_option_id, 0)),
    valid_from
)
DO UPDATE SET
    hourly_rate_usd = EXCLUDED.hourly_rate_usd,
    currency = EXCLUDED.currency,
    is_estimate = EXCLUDED.is_estimate,
    estimate_range_low_usd = EXCLUDED.estimate_range_low_usd,
    estimate_range_high_usd = EXCLUDED.estimate_range_high_usd,
    source_fetched_at = EXCLUDED.source_fetched_at,
    valid_to = EXCLUDED.valid_to,
    sync_status = EXCLUDED.sync_status;

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
        'compute-fixed-burstable',
        'EC2 T3/T4g burstable instances',
        'Virtual Machines B-series burstable instances',
        'Compute Engine E2 shared-core machine types',
        'Burstable/shared-core capacity for light or variable workloads. CPU credits and sustained-utilization caveats differ by provider.',
        false
    ),
    (
        'compute',
        'compute-autoscaling-burstable',
        'EC2 Auto Scaling with T3/T4g burstable instances',
        'Virtual Machine Scale Sets with B-series burstable instances',
        'Managed Instance Groups with E2 shared-core machine types',
        'Autoscaling burstable/shared-core capacity. Validate CPU credits, baseline utilization, and sustained-load throttling before production use.',
        false
    )
ON CONFLICT (category, tier_label)
DO UPDATE SET
    aws_sku_pattern = EXCLUDED.aws_sku_pattern,
    azure_sku_pattern = EXCLUDED.azure_sku_pattern,
    gcp_sku_pattern = EXCLUDED.gcp_sku_pattern,
    notes = EXCLUDED.notes,
    is_approximate = EXCLUDED.is_approximate;

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
        ('aws', TIMESTAMP '2026-07-02 00:00:00', TIMESTAMP '2026-07-02 00:00:00', 'success', 1, 'Local burstable compute seed extension'),
        ('azure', TIMESTAMP '2026-07-02 00:00:00', TIMESTAMP '2026-07-02 00:00:00', 'success', 1, 'Local burstable compute seed extension'),
        ('gcp', TIMESTAMP '2026-07-02 00:00:00', TIMESTAMP '2026-07-02 00:00:00', 'success', 2, 'Local burstable compute seed extension')
) AS run(provider, started_at, completed_at, status, records_updated, error_detail)
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '017'
);

INSERT INTO schema_migrations (version, name)
VALUES ('017', 'seed_burstable_compute_catalog')
ON CONFLICT (version) DO NOTHING;
