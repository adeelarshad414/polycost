\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS team_audit_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    action           TEXT NOT NULL,
    target_type      TEXT NOT NULL,
    target_id        TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT team_audit_events_action_check
        CHECK (action IN (
            'team.created',
            'team.settings.updated',
            'team.invitation.created',
            'team.invitation.resent',
            'team.invitation.revoked',
            'team.invitation.accepted',
            'team.member.role_updated',
            'team.member.removed',
            'team.sso.configured',
            'billing.import.created',
            'billing.reconciliation.created'
        )),
    CONSTRAINT team_audit_events_target_type_check
        CHECK (target_type IN (
            'team',
            'invitation',
            'member',
            'sso_provider',
            'billing_import',
            'billing_reconciliation'
        )),
    CONSTRAINT team_audit_events_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_team_audit_events_team_created
    ON team_audit_events (team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_audit_events_actor_created
    ON team_audit_events (actor_account_id, created_at DESC);

GRANT SELECT, INSERT
    ON team_audit_events
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('030', 'team_audit_events')
ON CONFLICT (version) DO NOTHING;
