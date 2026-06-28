\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(64) PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE pricing_catalog (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider         VARCHAR(20) NOT NULL,
    service_category VARCHAR(50) NOT NULL,
    service_name     VARCHAR(200) NOT NULL,
    sku_id           VARCHAR(200) NOT NULL,
    sku_description  TEXT,
    region           VARCHAR(50) NOT NULL,
    unit             VARCHAR(50) NOT NULL,
    unit_price_usd   NUMERIC(14, 6) NOT NULL,
    attributes       JSONB,
    effective_date   TIMESTAMP NOT NULL,
    fetched_at       TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT pricing_catalog_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT pricing_catalog_unit_price_usd_check
        CHECK (unit_price_usd >= 0),
    CONSTRAINT pricing_catalog_attributes_object_check
        CHECK (attributes IS NULL OR jsonb_typeof(attributes) = 'object'),
    UNIQUE (provider, sku_id, region, effective_date)
);

CREATE INDEX idx_pricing_provider_category
    ON pricing_catalog (provider, service_category);

CREATE INDEX idx_pricing_region
    ON pricing_catalog (region);

CREATE TABLE service_equivalence_map (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category            VARCHAR(50) NOT NULL,
    tier_label          VARCHAR(100) NOT NULL,
    aws_sku_pattern     VARCHAR(200),
    azure_sku_pattern   VARCHAR(200),
    gcp_sku_pattern     VARCHAR(200),
    notes               TEXT,
    is_approximate      BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE pricing_etl_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(20) NOT NULL,
    started_at      TIMESTAMP NOT NULL,
    completed_at    TIMESTAMP,
    status          VARCHAR(20) NOT NULL,
    records_updated INTEGER,
    error_detail    TEXT,

    CONSTRAINT pricing_etl_runs_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT pricing_etl_runs_status_check
        CHECK (status IN ('success', 'partial', 'failed')),
    CONSTRAINT pricing_etl_runs_records_updated_check
        CHECK (records_updated IS NULL OR records_updated >= 0),
    CONSTRAINT pricing_etl_runs_completed_after_started_check
        CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE comparisons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nws_snapshot    JSONB NOT NULL,
    result_snapshot JSONB NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    pricing_as_of   TIMESTAMP NOT NULL,

    CONSTRAINT comparisons_nws_snapshot_object_check
        CHECK (jsonb_typeof(nws_snapshot) = 'object'),
    CONSTRAINT comparisons_result_snapshot_object_check
        CHECK (jsonb_typeof(result_snapshot) = 'object')
);

INSERT INTO schema_migrations (version, name)
VALUES ('001', 'core_schema')
ON CONFLICT (version) DO NOTHING;
