\set ON_ERROR_STOP on

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
            'billing.import.created',
            'billing.reconciliation.created',
            'billing.reconciliation.artifact_registered',
            'billing.reconciliation.artifact_verified',
            'billing.reconciliation.artifact_blob_uploaded',
            'billing.reconciliation.artifact_legal_hold_updated',
            'billing.reconciliation.artifact_review_updated',
            'billing.reconciliation.artifact_exception_updated'
        ));

INSERT INTO schema_migrations (version, name)
VALUES ('037', 'team_audit_artifact_exception_action')
ON CONFLICT (version) DO NOTHING;
