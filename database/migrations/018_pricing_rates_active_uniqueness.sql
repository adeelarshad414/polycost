\set ON_ERROR_STOP on

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_pricing_rates_one_current
    ON pricing_rates (
        sku_id,
        region,
        pricing_term_id,
        (COALESCE(payment_option_id, 0))
    )
    WHERE valid_to IS NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('018', 'pricing_rates_active_uniqueness')
ON CONFLICT (version) DO NOTHING;
