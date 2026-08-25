\set ON_ERROR_STOP on

-- M-D2: the stale-live prune runs on every live refresh with
--   WHERE provider = $1 AND source_endpoint LIKE 'https://%' AND fetched_at < $2
-- On a pricing_catalog holding tens of thousands of live rows this was a full
-- sequential scan. A partial index restricted to live (provider-fetched) rows
-- makes it an index range scan on (provider, fetched_at); seed rows (null
-- source_endpoint) and mock rows (fixture://) are excluded from the index, so it
-- stays small and only covers the rows the prune actually touches.
CREATE INDEX IF NOT EXISTS idx_pricing_catalog_live_prune
    ON pricing_catalog (provider, fetched_at)
    WHERE source_endpoint LIKE 'https://%';

-- M-D1: prefix filters on source_endpoint (LIKE 'https://%' / 'fixture://%') use
-- pattern matching, which the default collation-aware btree cannot serve. A
-- text_pattern_ops index supports left-anchored LIKE prefix scans on
-- source_endpoint outside the partial index above.
CREATE INDEX IF NOT EXISTS idx_pricing_catalog_source_endpoint_pattern
    ON pricing_catalog (source_endpoint text_pattern_ops);

-- M-D1: data-provenance reads filter/aggregate on attributes->>'source'
-- ('local_seed', 'mock_provider'). An expression index on
-- (provider, (attributes->>'source')) makes provider-scoped lookups by
-- provenance index-backed instead of re-parsing JSONB per row.
CREATE INDEX IF NOT EXISTS idx_pricing_catalog_provider_source
    ON pricing_catalog (provider, (attributes->>'source'));

INSERT INTO schema_migrations (version, name)
VALUES ('041', 'pricing_catalog_live_indexes')
ON CONFLICT (version) DO NOTHING;
