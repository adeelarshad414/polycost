\set ON_ERROR_STOP on

ALTER TABLE share_links
    ADD COLUMN IF NOT EXISTS pricing_model TEXT NOT NULL DEFAULT 'on-demand',
    ADD COLUMN IF NOT EXISTS granularity TEXT NOT NULL DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
    ALTER TABLE share_links
        ADD CONSTRAINT share_links_pricing_model_check
        CHECK (pricing_model IN ('on-demand', 'reserved-1yr', 'reserved-3yr', 'savings-plan', 'spot'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE share_links
        ADD CONSTRAINT share_links_granularity_check
        CHECK (granularity IN ('hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO schema_migrations (version, name)
VALUES ('010', 'share_link_context')
ON CONFLICT (version) DO NOTHING;
