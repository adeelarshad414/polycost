\set ON_ERROR_STOP on

-- DB-5: several of the oldest tables store `timestamp without time zone` and are
-- compared against UTC `new Date()` in the app. The node-postgres driver reads a
-- naive timestamp in the server's LOCAL timezone, so ordering and freshness/prune
-- math drift by the server's UTC offset. Convert these columns to `timestamptz`,
-- interpreting the stored naive values as UTC (which is what the app wrote).
--
-- Each ALTER is guarded so the migration is re-runnable: a bare
-- `ALTER … timestamptz USING col AT TIME ZONE 'UTC'` on a column that is ALREADY
-- timestamptz would convert it BACK to a naive timestamp and corrupt the data, so
-- it must run only while the column is still `timestamp without time zone`.
CREATE OR REPLACE FUNCTION pg_temp.to_utc_timestamptz(
    target_table text,
    target_column text
) RETURNS void AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = target_table
          AND column_name = target_column
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
            target_table, target_column, target_column
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

SELECT pg_temp.to_utc_timestamptz('team_audit_events', 'created_at');
SELECT pg_temp.to_utc_timestamptz('comparisons', 'created_at');
SELECT pg_temp.to_utc_timestamptz('comparisons', 'pricing_as_of');
SELECT pg_temp.to_utc_timestamptz('pricing_catalog', 'effective_date');
SELECT pg_temp.to_utc_timestamptz('pricing_catalog', 'fetched_at');
SELECT pg_temp.to_utc_timestamptz('pricing_etl_runs', 'started_at');
SELECT pg_temp.to_utc_timestamptz('pricing_etl_runs', 'completed_at');
SELECT pg_temp.to_utc_timestamptz('schema_migrations', 'applied_at');

INSERT INTO schema_migrations (version, name)
VALUES ('042', 'utc_timestamptz')
ON CONFLICT (version) DO NOTHING;
