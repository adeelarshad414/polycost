\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS account_password_credentials (
    account_id           UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    password_hash        TEXT NOT NULL,
    password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    failed_attempts      INTEGER NOT NULL DEFAULT 0,
    locked_until         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT account_password_credentials_hash_check
        CHECK (password_hash ~ '^scrypt:v1:[0-9]+:[0-9]+:[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'),
    CONSTRAINT account_password_credentials_failed_attempts_check
        CHECK (failed_attempts >= 0)
);

CREATE TABLE IF NOT EXISTS account_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    team_id           UUID REFERENCES teams(id) ON DELETE SET NULL,
    token_hash        TEXT NOT NULL,
    user_agent_hash   TEXT,
    ip_hash           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked_at        TIMESTAMPTZ,

    CONSTRAINT account_sessions_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT account_sessions_user_agent_hash_check
        CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT account_sessions_ip_hash_check
        CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_sessions_token_hash
    ON account_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account_active
    ON account_sessions (account_id, expires_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS billing_import_runs (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                    UUID REFERENCES teams(id) ON DELETE SET NULL,
    provider                   TEXT NOT NULL,
    source_type                TEXT NOT NULL,
    status                     TEXT NOT NULL DEFAULT 'processing',
    billing_period_start       DATE NOT NULL,
    billing_period_end         DATE NOT NULL,
    original_file_sha256       TEXT NOT NULL,
    rows_received              INTEGER NOT NULL DEFAULT 0,
    rows_accepted              INTEGER NOT NULL DEFAULT 0,
    rows_rejected              INTEGER NOT NULL DEFAULT 0,
    total_cost_usd             NUMERIC(18, 6) NOT NULL DEFAULT 0,
    created_by_account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at               TIMESTAMPTZ,
    error_detail               TEXT,

    CONSTRAINT billing_import_runs_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT billing_import_runs_source_type_check
        CHECK (source_type IN ('aws-cur', 'azure-cost-management', 'gcp-billing-export', 'normalized-csv')),
    CONSTRAINT billing_import_runs_status_check
        CHECK (status IN ('processing', 'completed', 'failed')),
    CONSTRAINT billing_import_runs_file_hash_check
        CHECK (original_file_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT billing_import_runs_period_check
        CHECK (billing_period_end >= billing_period_start),
    CONSTRAINT billing_import_runs_row_counts_check
        CHECK (rows_received >= 0 AND rows_accepted >= 0 AND rows_rejected >= 0)
);

CREATE INDEX IF NOT EXISTS idx_billing_import_runs_team_created
    ON billing_import_runs (team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_run_id          UUID NOT NULL REFERENCES billing_import_runs(id) ON DELETE CASCADE,
    team_id                UUID REFERENCES teams(id) ON DELETE SET NULL,
    provider               TEXT NOT NULL,
    billing_period_start   DATE NOT NULL,
    billing_period_end     DATE NOT NULL,
    usage_start            TIMESTAMPTZ,
    usage_end              TIMESTAMPTZ,
    service_name           TEXT NOT NULL,
    sku_id                 TEXT,
    region                 TEXT,
    resource_id            TEXT,
    usage_quantity         NUMERIC(18, 6),
    usage_unit             TEXT,
    cost_usd               NUMERIC(18, 6) NOT NULL,
    currency               TEXT NOT NULL DEFAULT 'USD',
    tags                   JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
    line_item_hash         TEXT NOT NULL,
    matched_comparison_id  UUID REFERENCES comparisons(id) ON DELETE SET NULL,
    matched_trace_key      TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT invoice_line_items_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT invoice_line_items_period_check
        CHECK (billing_period_end >= billing_period_start),
    CONSTRAINT invoice_line_items_hash_check
        CHECK (line_item_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT invoice_line_items_tags_check
        CHECK (jsonb_typeof(tags) = 'object'),
    CONSTRAINT invoice_line_items_raw_payload_check
        CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_line_items_import_hash
    ON invoice_line_items (import_run_id, line_item_hash);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_team_period
    ON invoice_line_items (team_id, billing_period_start, billing_period_end);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_comparison
    ON invoice_line_items (matched_comparison_id)
    WHERE matched_comparison_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_reconciliation_results (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_run_id         UUID NOT NULL REFERENCES billing_import_runs(id) ON DELETE CASCADE,
    comparison_id         UUID NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    provider              TEXT NOT NULL,
    estimated_total_usd   NUMERIC(18, 6) NOT NULL,
    invoiced_total_usd    NUMERIC(18, 6) NOT NULL,
    variance_usd          NUMERIC(18, 6) NOT NULL,
    variance_percent      NUMERIC(9, 4) NOT NULL,
    status                TEXT NOT NULL,
    evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT invoice_reconciliation_results_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT invoice_reconciliation_results_status_check
        CHECK (status IN ('matched', 'variance-warning', 'variance-critical', 'unmatched')),
    CONSTRAINT invoice_reconciliation_results_evidence_check
        CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_invoice_reconciliation_import
    ON invoice_reconciliation_results (import_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_reconciliation_comparison
    ON invoice_reconciliation_results (comparison_id, created_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES ('026', 'auth_sessions_and_billing_actuals')
ON CONFLICT (version) DO NOTHING;
