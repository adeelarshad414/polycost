\set ON_ERROR_STOP on

-- Audit H-01 (target state): a team proves it owns an email domain before its
-- SCIM token may create or link accounts on that domain. Ownership is a DNS TXT
-- record at _polycost-verification.<domain> holding the token below.
--
-- One verified owner per domain: two teams may both start verifying
-- acme.com, but only one can hold it verified (partial unique index), so
-- verification cannot be used to take identities from the team that has it.
--
-- migrate:allow-lock team_domains is created empty in this same migration, so its indexes lock nothing in use
CREATE TABLE IF NOT EXISTS team_domains (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id                UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    domain                 TEXT NOT NULL,
    -- Public by design: it is published in DNS. It binds the record to this team.
    verification_token     TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'pending',
    created_by_account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_checked_at        TIMESTAMPTZ,
    verified_at            TIMESTAMPTZ,

    CONSTRAINT team_domains_status_check CHECK (status IN ('pending', 'verified')),
    CONSTRAINT team_domains_domain_check
        CHECK (domain = lower(domain) AND domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
    CONSTRAINT team_domains_verified_at_check CHECK ((status = 'verified') = (verified_at IS NOT NULL)),
    CONSTRAINT team_domains_team_domain_unique UNIQUE (team_id, domain)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_domains_verified_domain
    ON team_domains (domain)
    WHERE status = 'verified';

-- Domain changes are audited. The allowed-value checks are replaced the
-- lock-safe way: added NOT VALID (no scan under an exclusive lock), then
-- validated, which only takes a SHARE UPDATE EXCLUSIVE lock.
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
            'team.domain.added',
            'team.domain.verified',
            'team.domain.removed',
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
        )) NOT VALID;

ALTER TABLE team_audit_events VALIDATE CONSTRAINT team_audit_events_action_check;

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
            'domain',
            'billing_import',
            'billing_reconciliation'
        )) NOT VALID;

ALTER TABLE team_audit_events VALIDATE CONSTRAINT team_audit_events_target_type_check;

GRANT SELECT, INSERT, UPDATE, DELETE ON team_domains TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('046', 'team_domains')
ON CONFLICT (version) DO NOTHING;
