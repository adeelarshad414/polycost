\set ON_ERROR_STOP on

UPDATE pricing_rates
SET is_estimate = true,
    estimate_range_low_usd = COALESCE(
        estimate_range_low_usd,
        ROUND((hourly_rate_usd * 0.80)::numeric, 6)
    ),
    estimate_range_high_usd = COALESCE(
        estimate_range_high_usd,
        ROUND((hourly_rate_usd * 1.20)::numeric, 6)
    )
FROM pricing_terms
WHERE pricing_rates.pricing_term_id = pricing_terms.id
  AND pricing_terms.is_estimate_only = true
  AND (
      pricing_rates.is_estimate IS DISTINCT FROM true
      OR pricing_rates.estimate_range_low_usd IS NULL
      OR pricing_rates.estimate_range_high_usd IS NULL
  );

CREATE OR REPLACE FUNCTION enforce_estimate_only_pricing_rate()
RETURNS TRIGGER AS $$
DECLARE
    term_is_estimate_only BOOLEAN;
BEGIN
    SELECT pricing_terms.is_estimate_only
    INTO term_is_estimate_only
    FROM pricing_terms
    WHERE pricing_terms.id = NEW.pricing_term_id;

    IF COALESCE(term_is_estimate_only, false)
       AND NEW.is_estimate IS DISTINCT FROM true THEN
        RAISE EXCEPTION
            'pricing_rates rows for estimate-only terms must set is_estimate=true';
    END IF;

    IF COALESCE(term_is_estimate_only, false)
       AND (
           NEW.estimate_range_low_usd IS NULL
           OR NEW.estimate_range_high_usd IS NULL
       ) THEN
        RAISE EXCEPTION
            'pricing_rates rows for estimate-only terms must include an estimate range';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'pricing_rates_estimate_only_guard'
    ) THEN
        CREATE TRIGGER pricing_rates_estimate_only_guard
            BEFORE INSERT OR UPDATE OF
                pricing_term_id,
                is_estimate,
                estimate_range_low_usd,
                estimate_range_high_usd
            ON pricing_rates
            FOR EACH ROW
            EXECUTE FUNCTION enforce_estimate_only_pricing_rate();
    END IF;
END $$;

INSERT INTO schema_migrations (version, name)
VALUES ('020', 'pricing_rates_estimate_only_guard')
ON CONFLICT (version) DO NOTHING;
