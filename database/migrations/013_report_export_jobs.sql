\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS report_export_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id  UUID NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    format         TEXT NOT NULL,
    interval       TEXT,
    pricing_model  TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    file_name      TEXT,
    content_type   TEXT,
    artifact       BYTEA,
    error_message  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,

    CONSTRAINT report_export_jobs_format_check
        CHECK (format IN ('pdf', 'csv', 'xlsx')),
    CONSTRAINT report_export_jobs_interval_check
        CHECK (
            interval IS NULL OR interval IN (
                'hourly',
                'daily',
                'weekly',
                'monthly',
                'quarterly',
                'yearly'
            )
        ),
    CONSTRAINT report_export_jobs_pricing_model_check
        CHECK (
            pricing_model IS NULL OR pricing_model IN (
                'on-demand',
                'reserved-1yr',
                'reserved-3yr',
                'savings-plan',
                'spot'
            )
        ),
    CONSTRAINT report_export_jobs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CONSTRAINT report_export_jobs_completed_payload_check
        CHECK (
            status <> 'completed'
            OR (file_name IS NOT NULL AND content_type IS NOT NULL AND artifact IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_comparison
    ON report_export_jobs (comparison_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_status
    ON report_export_jobs (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE
    ON report_export_jobs
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('013', 'report_export_jobs')
ON CONFLICT (version) DO NOTHING;
