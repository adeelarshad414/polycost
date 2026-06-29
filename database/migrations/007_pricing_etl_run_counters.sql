\set ON_ERROR_STOP on

ALTER TABLE pricing_etl_runs
    ADD COLUMN IF NOT EXISTS records_rejected INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS records_skipped INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pricing_etl_runs_records_rejected_check'
    ) THEN
        ALTER TABLE pricing_etl_runs
            ADD CONSTRAINT pricing_etl_runs_records_rejected_check
                CHECK (records_rejected >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pricing_etl_runs_records_skipped_check'
    ) THEN
        ALTER TABLE pricing_etl_runs
            ADD CONSTRAINT pricing_etl_runs_records_skipped_check
                CHECK (records_skipped >= 0);
    END IF;
END $$;

INSERT INTO schema_migrations (version, name)
VALUES ('007', 'pricing_etl_run_counters')
ON CONFLICT (version) DO NOTHING;
