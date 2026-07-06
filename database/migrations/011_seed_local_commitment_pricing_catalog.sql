\set ON_ERROR_STOP on

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
    WHERE pricing_catalog.service_category = 'compute'
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
    COALESCE(sku_description, 'Local development baseline compute estimate') || ' ' || label,
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

INSERT INTO schema_migrations (version, name)
VALUES ('011', 'seed_local_commitment_pricing_catalog')
ON CONFLICT (version) DO NOTHING;
