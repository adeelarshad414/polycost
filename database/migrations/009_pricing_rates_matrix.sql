\set ON_ERROR_STOP on

ALTER TABLE provider_skus
    ADD COLUMN IF NOT EXISTS supports_reserved BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS supports_savings_plan BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS supports_spot BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pricing_terms (
    id                       SERIAL PRIMARY KEY,
    code                     VARCHAR(40) UNIQUE NOT NULL,
    label                    VARCHAR(80) NOT NULL,
    term_months              INTEGER,
    requires_payment_option  BOOLEAN NOT NULL DEFAULT false,
    is_estimate_only         BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS payment_options (
    id     SERIAL PRIMARY KEY,
    code   VARCHAR(40) UNIQUE NOT NULL,
    label  VARCHAR(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_rates (
    id                       BIGSERIAL PRIMARY KEY,
    sku_id                   UUID NOT NULL REFERENCES provider_skus(id) ON DELETE CASCADE,
    region                   VARCHAR(60) NOT NULL,
    pricing_term_id          INTEGER NOT NULL REFERENCES pricing_terms(id),
    payment_option_id        INTEGER REFERENCES payment_options(id),
    hourly_rate_usd          NUMERIC(14, 6) NOT NULL,
    currency                 VARCHAR(10) NOT NULL DEFAULT 'USD',
    is_estimate              BOOLEAN NOT NULL DEFAULT false,
    estimate_range_low_usd   NUMERIC(14, 6),
    estimate_range_high_usd  NUMERIC(14, 6),
    source_fetched_at        TIMESTAMPTZ NOT NULL,
    valid_from               TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to                 TIMESTAMPTZ,

    CONSTRAINT pricing_rates_hourly_rate_check
        CHECK (hourly_rate_usd >= 0),
    CONSTRAINT pricing_rates_estimate_range_check
        CHECK (
            (estimate_range_low_usd IS NULL AND estimate_range_high_usd IS NULL)
            OR (
                estimate_range_low_usd IS NOT NULL
                AND estimate_range_high_usd IS NOT NULL
                AND estimate_range_low_usd >= 0
                AND estimate_range_high_usd >= estimate_range_low_usd
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rates_identity
    ON pricing_rates (
        sku_id,
        region,
        pricing_term_id,
        (COALESCE(payment_option_id, 0)),
        valid_from
    );

CREATE INDEX IF NOT EXISTS idx_pricing_rates_lookup
    ON pricing_rates (sku_id, region, pricing_term_id, payment_option_id)
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_rates_current_term_region
    ON pricing_rates (region, pricing_term_id, payment_option_id, hourly_rate_usd)
    WHERE valid_to IS NULL;

INSERT INTO pricing_terms (code, label, term_months, requires_payment_option, is_estimate_only)
VALUES
    ('on_demand', 'On-demand', NULL, false, false),
    ('reserved_1yr', 'Reserved (1-Year)', 12, true, false),
    ('reserved_3yr', 'Reserved (3-Year)', 36, true, false),
    ('savings_plan_1yr', 'Savings Plan / CUD (1-Year)', 12, true, false),
    ('savings_plan_3yr', 'Savings Plan / CUD (3-Year)', 36, true, false),
    ('spot_estimate', 'Spot estimate', NULL, false, true)
ON CONFLICT (code)
DO UPDATE SET
    label = EXCLUDED.label,
    term_months = EXCLUDED.term_months,
    requires_payment_option = EXCLUDED.requires_payment_option,
    is_estimate_only = EXCLUDED.is_estimate_only;

INSERT INTO payment_options (code, label)
VALUES
    ('no_upfront', 'No upfront'),
    ('partial_upfront', 'Partial upfront'),
    ('all_upfront', 'All upfront'),
    ('n_a', 'Not applicable')
ON CONFLICT (code)
DO UPDATE SET label = EXCLUDED.label;

WITH sku_flags AS (
    SELECT provider_skus.id AS sku_id,
           BOOL_OR(pricing_snapshots.term IN ('reserved_1yr', 'reserved_3yr')) AS supports_reserved,
           BOOL_OR(pricing_snapshots.term = 'savings_plan') AS supports_savings_plan,
           BOOL_OR(pricing_snapshots.term = 'spot') AS supports_spot
    FROM provider_skus
    LEFT JOIN pricing_snapshots
      ON pricing_snapshots.sku_id = provider_skus.id
    GROUP BY provider_skus.id
)
UPDATE provider_skus
SET supports_reserved = COALESCE(sku_flags.supports_reserved, false),
    supports_savings_plan = COALESCE(sku_flags.supports_savings_plan, false),
    supports_spot = COALESCE(sku_flags.supports_spot, false)
FROM sku_flags
WHERE provider_skus.id = sku_flags.sku_id;

WITH normalized_snapshots AS (
    SELECT pricing_snapshots.sku_id,
           provider_skus.region,
           CASE pricing_snapshots.term
               WHEN 'spot' THEN 'spot_estimate'
               WHEN 'savings_plan' THEN 'savings_plan_1yr'
               ELSE pricing_snapshots.term
           END AS pricing_term_code,
           CASE
               WHEN pricing_snapshots.term IN ('reserved_1yr', 'reserved_3yr', 'savings_plan')
                   THEN 'no_upfront'
               ELSE NULL
           END AS payment_option_code,
           pricing_snapshots.price_per_hour,
           pricing_snapshots.currency,
           pricing_snapshots.effective_date,
           provider_skus.last_synced_at,
           pricing_snapshots.term = 'spot' AS is_spot_estimate
    FROM pricing_snapshots
    JOIN provider_skus
      ON provider_skus.id = pricing_snapshots.sku_id
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
    valid_from
)
SELECT normalized_snapshots.sku_id,
       normalized_snapshots.region,
       pricing_terms.id,
       payment_options.id,
       ROUND(normalized_snapshots.price_per_hour::numeric, 6),
       normalized_snapshots.currency,
       normalized_snapshots.is_spot_estimate,
       CASE
           WHEN normalized_snapshots.is_spot_estimate
               THEN ROUND((normalized_snapshots.price_per_hour * 0.80)::numeric, 6)
           ELSE NULL
       END,
       CASE
           WHEN normalized_snapshots.is_spot_estimate
               THEN ROUND((normalized_snapshots.price_per_hour * 1.20)::numeric, 6)
           ELSE NULL
       END,
       normalized_snapshots.last_synced_at,
       normalized_snapshots.effective_date::timestamptz
FROM normalized_snapshots
JOIN pricing_terms
  ON pricing_terms.code = normalized_snapshots.pricing_term_code
LEFT JOIN payment_options
  ON payment_options.code = normalized_snapshots.payment_option_code
ON CONFLICT (
    sku_id,
    region,
    pricing_term_id,
    (COALESCE(payment_option_id, 0)),
    valid_from
)
DO NOTHING;

GRANT SELECT
    ON pricing_terms,
       payment_options,
       pricing_rates
    TO polycost_app;

GRANT SELECT, INSERT, UPDATE
    ON pricing_terms,
       payment_options,
       pricing_rates
    TO polycost_etl;

GRANT USAGE, SELECT
    ON SEQUENCE pricing_terms_id_seq,
       payment_options_id_seq,
       pricing_rates_id_seq
    TO polycost_etl;

INSERT INTO schema_migrations (version, name)
VALUES ('009', 'pricing_rates_matrix')
ON CONFLICT (version) DO NOTHING;
