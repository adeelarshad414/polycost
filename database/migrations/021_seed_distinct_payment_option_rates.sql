\set ON_ERROR_STOP on

WITH payment_option_factors (
    pricing_term_code,
    source_payment_option_code,
    target_payment_option_code,
    multiplier
) AS (
    VALUES
        ('reserved_1yr', 'no_upfront', 'partial_upfront', 0.62::numeric / 0.68::numeric),
        ('reserved_1yr', 'no_upfront', 'all_upfront', 0.58::numeric / 0.68::numeric),
        ('reserved_3yr', 'no_upfront', 'partial_upfront', 0.47::numeric / 0.52::numeric),
        ('reserved_3yr', 'no_upfront', 'all_upfront', 0.43::numeric / 0.52::numeric),
        ('savings_plan_1yr', 'no_upfront', 'partial_upfront', 0.68::numeric / 0.72::numeric),
        ('savings_plan_1yr', 'no_upfront', 'all_upfront', 0.64::numeric / 0.72::numeric),
        ('savings_plan_3yr', 'no_upfront', 'partial_upfront', 0.54::numeric / 0.58::numeric),
        ('savings_plan_3yr', 'no_upfront', 'all_upfront', 0.50::numeric / 0.58::numeric)
),
source_rates AS (
    SELECT
        pricing_rates.sku_id,
        pricing_rates.region,
        pricing_rates.pricing_term_id,
        target_payment_options.id AS target_payment_option_id,
        pricing_rates.hourly_rate_usd,
        pricing_rates.currency,
        pricing_rates.is_estimate,
        pricing_rates.estimate_range_low_usd,
        pricing_rates.estimate_range_high_usd,
        pricing_rates.source_fetched_at,
        pricing_rates.valid_from,
        pricing_rates.valid_to,
        pricing_rates.sync_status,
        payment_option_factors.multiplier
    FROM pricing_rates
    JOIN pricing_terms
      ON pricing_terms.id = pricing_rates.pricing_term_id
    JOIN payment_options AS source_payment_options
      ON source_payment_options.id = pricing_rates.payment_option_id
    JOIN payment_option_factors
      ON payment_option_factors.pricing_term_code = pricing_terms.code
     AND payment_option_factors.source_payment_option_code = source_payment_options.code
    JOIN payment_options AS target_payment_options
      ON target_payment_options.code = payment_option_factors.target_payment_option_code
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
    source_rates.sku_id,
    source_rates.region,
    source_rates.pricing_term_id,
    source_rates.target_payment_option_id,
    ROUND((source_rates.hourly_rate_usd * source_rates.multiplier)::numeric, 6),
    source_rates.currency,
    source_rates.is_estimate,
    CASE
        WHEN source_rates.estimate_range_low_usd IS NOT NULL
            THEN ROUND((source_rates.estimate_range_low_usd * source_rates.multiplier)::numeric, 6)
        ELSE NULL
    END,
    CASE
        WHEN source_rates.estimate_range_high_usd IS NOT NULL
            THEN ROUND((source_rates.estimate_range_high_usd * source_rates.multiplier)::numeric, 6)
        ELSE NULL
    END,
    source_rates.source_fetched_at,
    source_rates.valid_from,
    source_rates.valid_to,
    source_rates.sync_status
FROM source_rates
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

INSERT INTO schema_migrations (version, name)
VALUES ('021', 'seed_distinct_payment_option_rates')
ON CONFLICT (version) DO NOTHING;
