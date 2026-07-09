\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS team_scim_tokens (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                  UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    display_name             TEXT NOT NULL,
    token_hash               TEXT NOT NULL,
    token_prefix             TEXT NOT NULL,
    created_by_account_id    UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at             TIMESTAMPTZ,
    revoked_at               TIMESTAMPTZ,
    expires_at               TIMESTAMPTZ,

    CONSTRAINT team_scim_tokens_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT team_scim_tokens_prefix_check
        CHECK (token_prefix ~ '^pc_scim_[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT team_scim_tokens_display_name_check
        CHECK (length(trim(display_name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_scim_tokens_hash
    ON team_scim_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_team_scim_tokens_team_created
    ON team_scim_tokens (team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_scim_tokens_team_active
    ON team_scim_tokens (team_id, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS team_scim_external_users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    external_id       TEXT NOT NULL,
    account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_name         TEXT NOT NULL,
    display_name      TEXT,
    active            BOOLEAN NOT NULL DEFAULT true,
    raw_profile       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deactivated_at    TIMESTAMPTZ,

    CONSTRAINT team_scim_external_users_user_name_check
        CHECK (user_name = lower(user_name) AND user_name ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT team_scim_external_users_external_id_check
        CHECK (length(trim(external_id)) BETWEEN 1 AND 200),
    CONSTRAINT team_scim_external_users_raw_profile_check
        CHECK (jsonb_typeof(raw_profile) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_scim_external_users_external
    ON team_scim_external_users (team_id, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_scim_external_users_user_name
    ON team_scim_external_users (team_id, user_name);

CREATE INDEX IF NOT EXISTS idx_team_scim_external_users_account
    ON team_scim_external_users (account_id, team_id);

GRANT SELECT, INSERT, UPDATE
    ON team_scim_tokens,
       team_scim_external_users
    TO polycost_app;

ALTER TABLE team_audit_events
    DROP CONSTRAINT IF EXISTS team_audit_events_action_check;

ALTER TABLE team_audit_events
    ADD CONSTRAINT team_audit_events_action_check
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
            'team.scim_token.created',
            'team.scim_token.revoked',
            'team.scim.user_upserted',
            'team.scim.user_deactivated',
            'billing.import.created',
            'billing.reconciliation.created',
            'billing.reconciliation.artifact_registered',
            'billing.reconciliation.artifact_verified',
            'billing.reconciliation.artifact_blob_uploaded',
            'billing.reconciliation.artifact_blob_downloaded',
            'billing.reconciliation.artifact_legal_hold_updated',
            'billing.reconciliation.artifact_provider_retention_proof_attached',
            'billing.reconciliation.artifact_review_updated',
            'billing.reconciliation.artifact_exception_updated',
            'billing.reconciliation.evidence_packet_exported',
            'billing.reconciliation.invoice_control_validated'
        ));

ALTER TABLE team_audit_events
    DROP CONSTRAINT IF EXISTS team_audit_events_target_type_check;

ALTER TABLE team_audit_events
    ADD CONSTRAINT team_audit_events_target_type_check
        CHECK (target_type IN (
            'team',
            'invitation',
            'member',
            'sso_provider',
            'scim_token',
            'scim_user',
            'billing_import',
            'billing_reconciliation'
        ));

INSERT INTO schema_migrations (version, name)
VALUES ('040', 'team_scim_provisioning')
ON CONFLICT (version) DO NOTHING;
