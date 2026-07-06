\set ON_ERROR_STOP on

ALTER TABLE pricing_catalog
    ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'success';

ALTER TABLE provider_skus
    ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'success';

ALTER TABLE pricing_rates
    ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'success';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pricing_catalog_sync_status_check'
    ) THEN
        ALTER TABLE pricing_catalog
            ADD CONSTRAINT pricing_catalog_sync_status_check
            CHECK (sync_status IN ('success', 'partial', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'provider_skus_sync_status_check'
    ) THEN
        ALTER TABLE provider_skus
            ADD CONSTRAINT provider_skus_sync_status_check
            CHECK (sync_status IN ('success', 'partial', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pricing_rates_sync_status_check'
    ) THEN
        ALTER TABLE pricing_rates
            ADD CONSTRAINT pricing_rates_sync_status_check
            CHECK (sync_status IN ('success', 'partial', 'failed'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pricing_catalog_sync_status
    ON pricing_catalog (provider, sync_status, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_skus_sync_status
    ON provider_skus (provider, sync_status, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_rates_sync_status
    ON pricing_rates (sync_status, source_fetched_at DESC)
    WHERE valid_to IS NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('016', 'pricing_cache_sync_status')
ON CONFLICT (version) DO NOTHING;
