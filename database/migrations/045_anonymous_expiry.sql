\set ON_ERROR_STOP on

-- ADR-0001 step 3 (P2-1c): anonymous comparisons and workloads expire.
--
-- expires_at is stamped when an anonymous row is created (now() +
-- ANONYMOUS_RETENTION_DAYS) and cleared when it is claimed into a team.
-- Team-owned rows keep NULL and never expire. Rows that already exist are
-- not backfilled here: the scheduled retention sweep stamps anonymous rows
-- whose expires_at is NULL with the grace period
-- (ANONYMOUS_RETENTION_GRACE_DAYS, default 60), in bounded batches, so this
-- migration stays a catalog-only change. A row with NULL expires_at has no
-- expiry yet, so nothing disappears before the grace period has been granted.
--
-- Reads treat an expired anonymous row as missing (404); deleting it is the
-- sweep's job and follows DATA_RETENTION_ENFORCEMENT_MODE.
--
-- Lock-safe: a nullable column without a default is catalog-only, and the
-- partial indexes are built CONCURRENTLY, so this file runs outside a
-- transaction. A failed concurrent build leaves an INVALID index that
-- IF NOT EXISTS would then skip, so each one is dropped first; on a first run
-- the drop is a no-op.
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN comparisons.expires_at IS
    'When an anonymous comparison expires; NULL when team-owned or not yet stamped.';
COMMENT ON COLUMN workloads.expires_at IS
    'When an anonymous workload expires; NULL when team-owned or not yet stamped.';

-- Serves the sweep: "anonymous and past expiry" and "anonymous, not stamped".
DROP INDEX CONCURRENTLY IF EXISTS idx_comparisons_anonymous_expiry;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comparisons_anonymous_expiry
    ON comparisons (expires_at)
    WHERE team_id IS NULL;

DROP INDEX CONCURRENTLY IF EXISTS idx_workloads_anonymous_expiry;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workloads_anonymous_expiry
    ON workloads (expires_at)
    WHERE team_id IS NULL;

INSERT INTO schema_migrations (version, name)
VALUES ('045', 'anonymous_expiry')
ON CONFLICT (version) DO NOTHING;
