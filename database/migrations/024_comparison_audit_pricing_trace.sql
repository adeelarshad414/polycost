\set ON_ERROR_STOP on

ALTER TABLE comparison_audit_logs
    ADD COLUMN IF NOT EXISTS pricing_trace JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'comparison_audit_logs_pricing_trace_object_check'
    ) THEN
        ALTER TABLE comparison_audit_logs
            ADD CONSTRAINT comparison_audit_logs_pricing_trace_object_check
            CHECK (pricing_trace IS NULL OR jsonb_typeof(pricing_trace) = 'object');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comparison_audit_logs_pricing_trace_key
    ON comparison_audit_logs ((pricing_trace->>'sourceRecordKey'));

INSERT INTO schema_migrations (version, name)
VALUES ('024', 'comparison_audit_pricing_trace')
ON CONFLICT (version) DO NOTHING;
