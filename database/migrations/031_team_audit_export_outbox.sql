\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS team_audit_event_exports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_event_id   UUID NOT NULL REFERENCES team_audit_events(id) ON DELETE CASCADE,
    destination      TEXT NOT NULL DEFAULT 'webhook',
    status           TEXT NOT NULL DEFAULT 'pending',
    attempts         INTEGER NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at  TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT team_audit_event_exports_destination_check
        CHECK (destination IN ('webhook')),
    CONSTRAINT team_audit_event_exports_status_check
        CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
    CONSTRAINT team_audit_event_exports_attempts_check
        CHECK (attempts >= 0),
    CONSTRAINT team_audit_event_exports_delivery_check
        CHECK (
            (status = 'delivered' AND delivered_at IS NOT NULL)
            OR (status <> 'delivered')
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_audit_event_exports_unique_destination
    ON team_audit_event_exports (audit_event_id, destination);

CREATE INDEX IF NOT EXISTS idx_team_audit_event_exports_pending
    ON team_audit_event_exports (status, next_attempt_at, last_attempt_at, created_at, id)
    WHERE status IN ('pending', 'processing');

GRANT SELECT, INSERT, UPDATE
    ON team_audit_event_exports
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('031', 'team_audit_export_outbox')
ON CONFLICT (version) DO NOTHING;
