\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS comparison_audit_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id     UUID NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    service_category  TEXT NOT NULL,
    cost_component    TEXT NOT NULL,
    service_label     TEXT NOT NULL,
    resolved_sku_id   TEXT,
    provider_region   TEXT,
    confidence        TEXT NOT NULL,
    rate_used_usd     NUMERIC(18, 8),
    monthly_cost_usd  NUMERIC(18, 4) NOT NULL,
    pricing_basis     TEXT,
    is_approximate    BOOLEAN NOT NULL DEFAULT false,
    raw_line_item     JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT comparison_audit_logs_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT comparison_audit_logs_confidence_check
        CHECK (confidence IN ('direct', 'approximate')),
    CONSTRAINT comparison_audit_logs_monthly_cost_check
        CHECK (monthly_cost_usd >= 0),
    CONSTRAINT comparison_audit_logs_raw_item_object_check
        CHECK (jsonb_typeof(raw_line_item) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_comparison_audit_logs_comparison
    ON comparison_audit_logs (comparison_id, provider, service_category);

CREATE TABLE IF NOT EXISTS share_link_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token            TEXT NOT NULL REFERENCES share_links(token) ON DELETE CASCADE,
    event_type       TEXT NOT NULL DEFAULT 'view',
    country_code     TEXT,
    section          TEXT NOT NULL DEFAULT 'summary',
    user_agent_hash  TEXT,
    viewed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT share_link_events_type_check
        CHECK (event_type IN ('view')),
    CONSTRAINT share_link_events_country_check
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT share_link_events_section_check
        CHECK (section ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);

CREATE INDEX IF NOT EXISTS idx_share_link_events_token_viewed
    ON share_link_events (token, viewed_at DESC);

GRANT SELECT, INSERT
    ON comparison_audit_logs,
       share_link_events
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('012', 'production_depth_audit_analytics')
ON CONFLICT (version) DO NOTHING;
