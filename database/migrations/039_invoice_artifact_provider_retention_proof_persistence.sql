\set ON_ERROR_STOP on

ALTER TABLE invoice_artifact_blobs
    ADD COLUMN IF NOT EXISTS provider_retention_proof_status TEXT,
    ADD COLUMN IF NOT EXISTS provider_retention_proof_evidence_source TEXT,
    ADD COLUMN IF NOT EXISTS provider_retention_proof_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_retention_proof_retention_mode TEXT,
    ADD COLUMN IF NOT EXISTS provider_retention_proof_reference TEXT,
    ADD COLUMN IF NOT EXISTS provider_retention_proof_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS provider_retention_proof_caveats JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE invoice_artifact_blobs
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_status_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_evidence_source_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_retention_mode_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_reference_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_sha256_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_caveats_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_provider_retention_proof_consistency_check;

ALTER TABLE invoice_artifact_blobs
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_status_check
        CHECK (
            provider_retention_proof_status IS NULL
            OR provider_retention_proof_status IN ('declared', 'provider-verified')
        ),
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_evidence_source_check
        CHECK (
            provider_retention_proof_evidence_source IS NULL
            OR provider_retention_proof_evidence_source IN ('local-config', 'provider-control-plane')
        ),
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_retention_mode_check
        CHECK (
            provider_retention_proof_retention_mode IS NULL
            OR provider_retention_proof_retention_mode IN (
                'not-configured',
                'provider-object-lock',
                'external-worm-receiver'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_reference_check
        CHECK (
            provider_retention_proof_reference IS NULL
            OR (
                length(provider_retention_proof_reference) BETWEEN 8 AND 1200
                AND provider_retention_proof_reference !~ '[[:cntrl:]]'
                AND provider_retention_proof_reference !~ '[?#]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_sha256_check
        CHECK (
            provider_retention_proof_sha256 IS NULL
            OR provider_retention_proof_sha256 ~ '^[a-f0-9]{64}$'
        ),
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_caveats_check
        CHECK (jsonb_typeof(provider_retention_proof_caveats) = 'array'),
    ADD CONSTRAINT invoice_artifact_blobs_provider_retention_proof_consistency_check
        CHECK (
            (
                provider_retention_proof_status IS NULL
                AND provider_retention_proof_evidence_source IS NULL
                AND provider_retention_proof_checked_at IS NULL
                AND provider_retention_proof_retention_mode IS NULL
                AND provider_retention_proof_reference IS NULL
                AND provider_retention_proof_sha256 IS NULL
            )
            OR (
                provider_retention_proof_status IS NOT NULL
                AND provider_retention_proof_evidence_source IS NOT NULL
                AND provider_retention_proof_checked_at IS NOT NULL
                AND provider_retention_proof_retention_mode IS NOT NULL
                AND (
                    provider_retention_proof_status <> 'provider-verified'
                    OR (
                        storage_backend <> 'database-bytea'
                        AND provider_retention_proof_evidence_source = 'provider-control-plane'
                        AND provider_retention_proof_retention_mode = 'provider-object-lock'
                        AND provider_retention_proof_reference IS NOT NULL
                        AND provider_retention_proof_sha256 IS NOT NULL
                    )
                )
            )
        );

CREATE INDEX IF NOT EXISTS idx_invoice_artifact_blobs_provider_retention_proof
    ON invoice_artifact_blobs (provider_retention_proof_status, storage_backend)
    WHERE provider_retention_proof_status IS NOT NULL;

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
            'billing.reconciliation.artifact_blob_downloaded',
            'billing.reconciliation.artifact_legal_hold_updated',
            'billing.reconciliation.artifact_provider_retention_proof_attached',
            'billing.reconciliation.artifact_review_updated',
            'billing.reconciliation.artifact_exception_updated',
            'billing.reconciliation.evidence_packet_exported',
            'billing.reconciliation.invoice_control_validated'
        ));

INSERT INTO schema_migrations (version, name)
VALUES ('039', 'invoice_artifact_provider_retention_proof_persistence')
ON CONFLICT (version) DO NOTHING;
