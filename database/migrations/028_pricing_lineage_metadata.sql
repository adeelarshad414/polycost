\set ON_ERROR_STOP on

ALTER TABLE pricing_catalog
    ADD COLUMN IF NOT EXISTS source_endpoint TEXT,
    ADD COLUMN IF NOT EXISTS source_record_id TEXT,
    ADD COLUMN IF NOT EXISTS source_record_key TEXT,
    ADD COLUMN IF NOT EXISTS transform_version TEXT,
    ADD COLUMN IF NOT EXISTS source_payload_hash TEXT;

ALTER TABLE pricing_rates
    ADD COLUMN IF NOT EXISTS source_endpoint TEXT,
    ADD COLUMN IF NOT EXISTS source_record_id TEXT,
    ADD COLUMN IF NOT EXISTS source_record_key TEXT,
    ADD COLUMN IF NOT EXISTS transform_version TEXT,
    ADD COLUMN IF NOT EXISTS source_payload_hash TEXT;

ALTER TABLE storage_pricing
    ADD COLUMN IF NOT EXISTS source_endpoint TEXT,
    ADD COLUMN IF NOT EXISTS source_record_id TEXT,
    ADD COLUMN IF NOT EXISTS source_record_key TEXT,
    ADD COLUMN IF NOT EXISTS source_fetched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transform_version TEXT,
    ADD COLUMN IF NOT EXISTS source_payload_hash TEXT;

ALTER TABLE egress_tier_rates
    ADD COLUMN IF NOT EXISTS source_endpoint TEXT,
    ADD COLUMN IF NOT EXISTS source_record_id TEXT,
    ADD COLUMN IF NOT EXISTS source_record_key TEXT,
    ADD COLUMN IF NOT EXISTS source_fetched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transform_version TEXT,
    ADD COLUMN IF NOT EXISTS source_payload_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_pricing_catalog_lineage
    ON pricing_catalog (provider, source_record_id, source_payload_hash);

CREATE INDEX IF NOT EXISTS idx_pricing_rates_lineage
    ON pricing_rates (source_record_id, source_payload_hash)
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_storage_pricing_lineage
    ON storage_pricing (provider, source_record_id, source_payload_hash);

CREATE INDEX IF NOT EXISTS idx_egress_tier_rates_lineage
    ON egress_tier_rates (provider, source_record_id, source_payload_hash);

COMMENT ON COLUMN pricing_rates.source_endpoint IS
    'Provider pricing endpoint, or fixture URI in mock/local mode, used to derive this rate row.';
COMMENT ON COLUMN pricing_rates.source_record_id IS
    'Raw provider record identifier such as AWS SKU, Azure meter/product ID, GCP SKU, or fixture row ID.';
COMMENT ON COLUMN pricing_rates.source_payload_hash IS
    'SHA-256 hash of the normalized raw source payload used for reconciliation drift checks.';

INSERT INTO schema_migrations (version, name)
VALUES ('028', 'pricing_lineage_metadata')
ON CONFLICT (version) DO NOTHING;
