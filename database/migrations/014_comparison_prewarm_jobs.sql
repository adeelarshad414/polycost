\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS comparison_prewarm_jobs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id           UUID NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'pending',
    requested_combinations  INTEGER NOT NULL,
    warmed_combinations     INTEGER NOT NULL DEFAULT 0,
    failed_combinations     INTEGER NOT NULL DEFAULT 0,
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,

    CONSTRAINT comparison_prewarm_jobs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CONSTRAINT comparison_prewarm_jobs_requested_check
        CHECK (requested_combinations >= 0),
    CONSTRAINT comparison_prewarm_jobs_warmed_check
        CHECK (warmed_combinations >= 0),
    CONSTRAINT comparison_prewarm_jobs_failed_check
        CHECK (failed_combinations >= 0),
    CONSTRAINT comparison_prewarm_jobs_outcome_check
        CHECK (warmed_combinations + failed_combinations <= requested_combinations)
);

CREATE INDEX IF NOT EXISTS idx_comparison_prewarm_jobs_comparison
    ON comparison_prewarm_jobs (comparison_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comparison_prewarm_jobs_status
    ON comparison_prewarm_jobs (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE
    ON comparison_prewarm_jobs
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('014', 'comparison_prewarm_jobs')
ON CONFLICT (version) DO NOTHING;
