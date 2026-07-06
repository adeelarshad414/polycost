\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS team_invitations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                  UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email                    TEXT NOT NULL,
    role                     TEXT NOT NULL,
    token_hash               TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'pending',
    invited_by_account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    accepted_by_account_id   UUID REFERENCES accounts(id) ON DELETE SET NULL,
    expires_at               TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at              TIMESTAMPTZ,
    revoked_at               TIMESTAMPTZ,

    CONSTRAINT team_invitations_email_format_check
        CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT team_invitations_role_check
        CHECK (role IN ('admin', 'member', 'viewer')),
    CONSTRAINT team_invitations_status_check
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    CONSTRAINT team_invitations_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_token_hash
    ON team_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_pending_email
    ON team_invitations (team_id, email)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_team_invitations_team_created
    ON team_invitations (team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sso_identity_provider_configs (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                  UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    provider_type            TEXT NOT NULL,
    display_name             TEXT NOT NULL,
    issuer_url               TEXT NOT NULL,
    client_id_hint           TEXT,
    status                   TEXT NOT NULL DEFAULT 'configured',
    created_by_account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sso_identity_provider_type_check
        CHECK (provider_type IN ('oidc', 'saml')),
    CONSTRAINT sso_identity_provider_status_check
        CHECK (status IN ('configured', 'disabled')),
    CONSTRAINT sso_identity_provider_issuer_check
        CHECK (issuer_url ~ '^https://')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_identity_provider_team_type
    ON sso_identity_provider_configs (team_id, provider_type, issuer_url);

INSERT INTO schema_migrations (version, name)
VALUES ('027', 'team_invites_and_sso')
ON CONFLICT (version) DO NOTHING;
