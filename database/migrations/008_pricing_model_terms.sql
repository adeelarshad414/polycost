\set ON_ERROR_STOP on

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pricing_snapshots_term_check'
    ) THEN
        ALTER TABLE pricing_snapshots
            DROP CONSTRAINT pricing_snapshots_term_check;
    END IF;

    ALTER TABLE pricing_snapshots
        ADD CONSTRAINT pricing_snapshots_term_check
            CHECK (term IN ('on_demand', 'reserved_1yr', 'reserved_3yr', 'spot', 'savings_plan'));
END $$;

INSERT INTO schema_migrations (version, name)
VALUES ('008', 'pricing_model_terms')
ON CONFLICT (version) DO NOTHING;
