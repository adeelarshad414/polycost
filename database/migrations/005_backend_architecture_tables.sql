\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS provider_skus (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL,
    provider_sku_id TEXT NOT NULL,
    family          TEXT NOT NULL,
    vcpu            INTEGER NOT NULL,
    memory_gb       NUMERIC(10, 2) NOT NULL,
    region          TEXT NOT NULL,
    os              TEXT NOT NULL DEFAULT 'linux',
    raw_payload     JSONB NOT NULL,
    last_synced_at  TIMESTAMPTZ NOT NULL,

    CONSTRAINT provider_skus_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT provider_skus_family_check
        CHECK (
            family IN (
                'general-purpose',
                'compute-optimized',
                'memory-optimized',
                'storage-optimized',
                'accelerated-computing'
            )
        ),
    CONSTRAINT provider_skus_vcpu_check
        CHECK (vcpu > 0),
    CONSTRAINT provider_skus_memory_check
        CHECK (memory_gb > 0),
    CONSTRAINT provider_skus_raw_payload_object_check
        CHECK (jsonb_typeof(raw_payload) = 'object'),
    UNIQUE (provider, provider_sku_id, region)
);

CREATE INDEX IF NOT EXISTS idx_provider_skus_lookup
    ON provider_skus (family, vcpu, memory_gb, provider, region);

CREATE TABLE IF NOT EXISTS pricing_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id          UUID NOT NULL REFERENCES provider_skus(id) ON DELETE CASCADE,
    term            TEXT NOT NULL,
    price_per_hour  NUMERIC(14, 8) NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'USD',
    effective_date  DATE NOT NULL,

    CONSTRAINT pricing_snapshots_term_check
        CHECK (term IN ('on_demand', 'reserved_1yr', 'reserved_3yr')),
    CONSTRAINT pricing_snapshots_price_check
        CHECK (price_per_hour >= 0),
    CONSTRAINT pricing_snapshots_currency_check
        CHECK (currency ~ '^[A-Z]{3}$'),
    UNIQUE (sku_id, term, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_lookup
    ON pricing_snapshots (term, effective_date DESC, price_per_hour);

CREATE TABLE IF NOT EXISTS storage_pricing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider            TEXT NOT NULL,
    region              TEXT NOT NULL,
    tier                TEXT NOT NULL,
    price_per_gb_month  NUMERIC(14, 8) NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'USD',
    effective_date      DATE NOT NULL,

    CONSTRAINT storage_pricing_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT storage_pricing_tier_check
        CHECK (tier IN ('standard', 'infrequent_access', 'archive')),
    CONSTRAINT storage_pricing_price_check
        CHECK (price_per_gb_month >= 0),
    CONSTRAINT storage_pricing_currency_check
        CHECK (currency ~ '^[A-Z]{3}$'),
    UNIQUE (provider, region, tier, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_storage_pricing_lookup
    ON storage_pricing (provider, region, tier, effective_date DESC);

CREATE TABLE IF NOT EXISTS egress_tier_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL,
    region          TEXT NOT NULL,
    tier_from_gb    NUMERIC(14, 2) NOT NULL,
    tier_to_gb      NUMERIC(14, 2),
    price_per_gb    NUMERIC(14, 8) NOT NULL,
    effective_date  DATE NOT NULL,

    CONSTRAINT egress_tier_rates_provider_check
        CHECK (provider IN ('aws', 'azure', 'gcp')),
    CONSTRAINT egress_tier_rates_from_check
        CHECK (tier_from_gb >= 0),
    CONSTRAINT egress_tier_rates_to_check
        CHECK (tier_to_gb IS NULL OR tier_to_gb > tier_from_gb),
    CONSTRAINT egress_tier_rates_price_check
        CHECK (price_per_gb >= 0),
    UNIQUE (provider, region, tier_from_gb, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_egress_tier_rates_lookup
    ON egress_tier_rates (provider, region, effective_date DESC, tier_from_gb);

CREATE TABLE IF NOT EXISTS exchange_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency   TEXT NOT NULL DEFAULT 'USD',
    quote_currency  TEXT NOT NULL,
    rate            NUMERIC(18, 8) NOT NULL,
    source          TEXT,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT exchange_rates_base_currency_check
        CHECK (base_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT exchange_rates_quote_currency_check
        CHECK (quote_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT exchange_rates_rate_check
        CHECK (rate > 0),
    UNIQUE (base_currency, quote_currency, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
    ON exchange_rates (base_currency, quote_currency, fetched_at DESC);

CREATE TABLE IF NOT EXISTS workloads (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_family       TEXT NOT NULL,
    vcpu                  INTEGER NOT NULL,
    memory_gb             NUMERIC(10, 2) NOT NULL,
    region                TEXT NOT NULL,
    instance_count        INTEGER NOT NULL DEFAULT 1,
    hours_per_month       NUMERIC(10, 2) NOT NULL DEFAULT 730,
    storage_gb            NUMERIC(14, 2) NOT NULL DEFAULT 0,
    storage_tier          TEXT NOT NULL DEFAULT 'standard',
    egress_gb_per_month   NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT workloads_instance_family_check
        CHECK (
            instance_family IN (
                'general-purpose',
                'compute-optimized',
                'memory-optimized',
                'storage-optimized',
                'accelerated-computing'
            )
        ),
    CONSTRAINT workloads_vcpu_check
        CHECK (vcpu > 0),
    CONSTRAINT workloads_memory_check
        CHECK (memory_gb > 0),
    CONSTRAINT workloads_instance_count_check
        CHECK (instance_count > 0),
    CONSTRAINT workloads_hours_check
        CHECK (hours_per_month > 0),
    CONSTRAINT workloads_storage_check
        CHECK (storage_gb >= 0),
    CONSTRAINT workloads_storage_tier_check
        CHECK (storage_tier IN ('standard', 'infrequent_access', 'archive')),
    CONSTRAINT workloads_egress_check
        CHECK (egress_gb_per_month >= 0)
);

CREATE INDEX IF NOT EXISTS idx_workloads_region
    ON workloads (region);

CREATE TABLE IF NOT EXISTS budgets (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workload_id               UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    threshold_usd             NUMERIC(14, 2) NOT NULL,
    alert_on_anomaly_percent  NUMERIC(8, 2),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT budgets_threshold_check
        CHECK (threshold_usd > 0),
    CONSTRAINT budgets_anomaly_check
        CHECK (alert_on_anomaly_percent IS NULL OR alert_on_anomaly_percent > 0),
    UNIQUE (workload_id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workload_id      UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    budget_id        UUID REFERENCES budgets(id) ON DELETE SET NULL,
    alert_type       TEXT NOT NULL,
    message          TEXT NOT NULL,
    threshold_usd    NUMERIC(14, 2),
    observed_usd     NUMERIC(14, 2),
    anomaly_percent  NUMERIC(8, 2),
    dismissed        BOOLEAN NOT NULL DEFAULT false,
    triggered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed_at     TIMESTAMPTZ,

    CONSTRAINT alerts_type_check
        CHECK (alert_type IN ('budget_threshold', 'anomaly')),
    CONSTRAINT alerts_dismissed_at_check
        CHECK ((dismissed = false AND dismissed_at IS NULL) OR dismissed = true)
);

CREATE INDEX IF NOT EXISTS idx_alerts_workload_triggered
    ON alerts (workload_id, triggered_at DESC);

CREATE TABLE IF NOT EXISTS share_links (
    token        TEXT PRIMARY KEY,
    workload_id  UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    watermark    BOOLEAN NOT NULL DEFAULT true,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT share_links_token_check
        CHECK (length(token) >= 24),
    CONSTRAINT share_links_expiry_check
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_share_links_workload
    ON share_links (workload_id);

GRANT SELECT
    ON provider_skus,
       pricing_snapshots,
       storage_pricing,
       egress_tier_rates,
       exchange_rates,
       workloads,
       budgets,
       alerts,
       share_links
    TO polycost_app;

GRANT INSERT, UPDATE
    ON workloads,
       budgets,
       alerts,
       share_links
    TO polycost_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON provider_skus,
       pricing_snapshots,
       storage_pricing,
       egress_tier_rates,
       exchange_rates
    TO polycost_etl;

INSERT INTO schema_migrations (version, name)
VALUES ('005', 'backend_architecture_tables')
ON CONFLICT (version) DO NOTHING;
