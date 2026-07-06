\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS accounts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                  TEXT NOT NULL,
    display_name           TEXT,
    auth_provider          TEXT NOT NULL,
    external_subject_hash  TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'active',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT accounts_email_format_check
        CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT accounts_status_check
        CHECK (status IN ('active', 'disabled', 'invited')),
    CONSTRAINT accounts_auth_provider_check
        CHECK (auth_provider IN ('local', 'oidc', 'saml', 'github', 'google', 'azure-ad')),
    CONSTRAINT accounts_external_subject_hash_check
        CHECK (external_subject_hash ~ '^[a-f0-9]{64}$'),
    UNIQUE (auth_provider, external_subject_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_lower
    ON accounts (lower(email));

CREATE TABLE IF NOT EXISTS teams (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    slug              TEXT NOT NULL,
    name              TEXT NOT NULL,
    plan              TEXT NOT NULL DEFAULT 'oss',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT teams_slug_check
        CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
    CONSTRAINT teams_plan_check
        CHECK (plan IN ('oss', 'team', 'enterprise')),
    UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS team_memberships (
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ,

    CONSTRAINT team_memberships_role_check
        CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    PRIMARY KEY (team_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_account
    ON team_memberships (account_id, team_id);

ALTER TABLE workloads
    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workloads_team
    ON workloads (team_id, updated_at DESC);

ALTER TABLE comparisons
    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comparisons_team
    ON comparisons (team_id, created_at DESC);

ALTER TABLE diagram_imports
    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_diagram_imports_team
    ON diagram_imports (team_id, created_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES ('025', 'account_team_foundation')
ON CONFLICT (version) DO NOTHING;
