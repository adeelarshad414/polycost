\set ON_ERROR_STOP on

-- ADR-0001 step 2 (P2-1b): anonymous comparisons and workloads get an edit key.
-- Reads stay capability URLs; changes need the key, which is returned once at
-- creation and stored here only as sha256 hex. NULL means either team-owned
-- (team_id set) or created before this migration - those anonymous rows become
-- read-only until claimed, by design (ADR-0001 §3.6).
--
-- Lock-safe: adding a nullable column without a default is a catalog-only
-- change in PostgreSQL 11+, so it does not rewrite or block these tables.
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS write_key_hash TEXT;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS write_key_hash TEXT;

COMMENT ON COLUMN comparisons.write_key_hash IS
    'sha256 hex of the anonymous edit key; NULL when team-owned or legacy.';
COMMENT ON COLUMN workloads.write_key_hash IS
    'sha256 hex of the anonymous edit key; NULL when team-owned or legacy.';

INSERT INTO schema_migrations (version, name)
VALUES ('044', 'anonymous_write_keys')
ON CONFLICT (version) DO NOTHING;
