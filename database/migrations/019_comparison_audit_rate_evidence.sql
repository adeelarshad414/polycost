\set ON_ERROR_STOP on

ALTER TABLE comparison_audit_logs
    ADD COLUMN IF NOT EXISTS rate_source TEXT,
    ADD COLUMN IF NOT EXISTS rate_source_sku_id TEXT,
    ADD COLUMN IF NOT EXISTS pricing_term_code TEXT,
    ADD COLUMN IF NOT EXISTS payment_option_code TEXT,
    ADD COLUMN IF NOT EXISTS rate_currency VARCHAR(10),
    ADD COLUMN IF NOT EXISTS rate_unit TEXT,
    ADD COLUMN IF NOT EXISTS rate_valid_from TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rate_source_fetched_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'comparison_audit_logs_rate_source_check'
    ) THEN
        ALTER TABLE comparison_audit_logs
            ADD CONSTRAINT comparison_audit_logs_rate_source_check
            CHECK (
                rate_source IS NULL
                OR rate_source IN (
                    'pricing_catalog',
                    'pricing_rates',
                    'modeled_estimate',
                    'manual_model'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'comparison_audit_logs_rate_currency_check'
    ) THEN
        ALTER TABLE comparison_audit_logs
            ADD CONSTRAINT comparison_audit_logs_rate_currency_check
            CHECK (rate_currency IS NULL OR rate_currency ~ '^[A-Z]{3}$');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comparison_audit_logs_rate_source
    ON comparison_audit_logs (comparison_id, rate_source, rate_source_sku_id);

INSERT INTO schema_migrations (version, name)
VALUES ('019', 'comparison_audit_rate_evidence')
ON CONFLICT (version) DO NOTHING;
