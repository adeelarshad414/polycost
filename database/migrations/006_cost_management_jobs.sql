\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS workload_cost_observations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workload_id           UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    budget_id             UUID REFERENCES budgets(id) ON DELETE SET NULL,
    term                  TEXT NOT NULL DEFAULT 'on_demand',
    provider              TEXT NOT NULL,
    observed_monthly_usd  NUMERIC(14, 2) NOT NULL,
    source                TEXT NOT NULL DEFAULT 'modeled_cache',
    observed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT workload_cost_observations_term_check
        CHECK (term IN ('on_demand', 'reserved_1yr', 'reserved_3yr')),
    CONSTRAINT workload_cost_observations_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT workload_cost_observations_amount_check
        CHECK (observed_monthly_usd >= 0),
    CONSTRAINT workload_cost_observations_source_check
        CHECK (source IN ('modeled_cache'))
);

CREATE INDEX IF NOT EXISTS idx_workload_cost_observations_lookup
    ON workload_cost_observations (workload_id, budget_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_share_links_expiry
    ON share_links (expires_at)
    WHERE revoked_at IS NULL;

GRANT SELECT, INSERT
    ON workload_cost_observations
    TO polycost_app;

GRANT INSERT, UPDATE
    ON exchange_rates
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('006', 'cost_management_jobs')
ON CONFLICT (version) DO NOTHING;
