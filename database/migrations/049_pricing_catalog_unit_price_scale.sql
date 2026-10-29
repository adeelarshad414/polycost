\set ON_ERROR_STOP on

-- KNOWN-ISSUES K-14: pricing_catalog.unit_price_usd was NUMERIC(14, 6), so
-- Postgres rounded every write to 6 decimals and a unit price below
-- $0.0000005 (AWS Lambda requests at $0.0000002 each, for example) was stored
-- as 0. The normalized tables already keep NUMERIC(14, 8); widen the raw
-- catalog to NUMERIC(20, 10) so it is never the narrower of the two.
--
-- migrate:allow-lock pricing_catalog is ETL-owned and rebuilt by every refresh; the app only reads it, and the rewrite of its tens of thousands of rows takes seconds
--
-- Why an in-place type change rather than add-column + backfill + swap:
--   - Changing a NUMERIC scale rewrites the table under ACCESS EXCLUSIVE, but
--     on this table that is a short pause in reads, not lost writes: only the
--     ETL writes, and a refresh blocked by the lock simply waits.
--   - ALTER COLUMN TYPE keeps the column's position, the
--     pricing_catalog_unit_price_usd_check constraint, the table grants
--     (polycost_app SELECT; polycost_etl SELECT/INSERT/UPDATE/DELETE), the
--     UNIQUE (provider, sku_id, region, effective_date) constraint and every
--     index. A swap would have to recreate the CHECK and leave the column
--     last.
--   - Every stored value is exact in the new type (6 decimals fit in 10, and
--     14 - 6 = 8 integer digits fit in 20 - 10 = 10), so nothing is rounded.
--
-- lock_timeout makes the migration fail fast instead of queueing its exclusive
-- lock behind a long read, which would stall every read queued after it. A
-- failure rolls back cleanly; rerun the migrator.
SET LOCAL lock_timeout = '5s';

-- Guarded so a rerun does not rewrite the table a second time.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pricing_catalog'
          AND column_name = 'unit_price_usd'
          AND (numeric_precision, numeric_scale) IS DISTINCT FROM (20, 10)
    ) THEN
        ALTER TABLE public.pricing_catalog
            ALTER COLUMN unit_price_usd TYPE NUMERIC(20, 10);
    END IF;
END;
$$;

INSERT INTO schema_migrations (version, name)
VALUES ('049', 'pricing_catalog_unit_price_scale')
ON CONFLICT (version) DO NOTHING;
