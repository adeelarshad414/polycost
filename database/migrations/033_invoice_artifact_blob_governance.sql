\set ON_ERROR_STOP on

ALTER TABLE invoice_artifact_blobs
    ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'database-bytea',
    ADD COLUMN IF NOT EXISTS kms_key_reference TEXT,
    ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS malware_scan_status TEXT NOT NULL DEFAULT 'passed',
    ADD COLUMN IF NOT EXISTS malware_scan_engine TEXT NOT NULL DEFAULT 'polycost-eicar-signature-v1',
    ADD COLUMN IF NOT EXISTS malware_scan_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS malware_scan_finding TEXT;

UPDATE invoice_artifact_blobs
SET retention_until = COALESCE(retention_until, uploaded_at + interval '365 days'),
    malware_scan_checked_at = COALESCE(malware_scan_checked_at, uploaded_at)
WHERE retention_until IS NULL
   OR malware_scan_checked_at IS NULL;

ALTER TABLE invoice_artifact_blobs
    ALTER COLUMN retention_until SET NOT NULL,
    ALTER COLUMN malware_scan_checked_at SET NOT NULL;

ALTER TABLE invoice_artifact_blobs
    ADD CONSTRAINT invoice_artifact_blobs_storage_backend_check
        CHECK (storage_backend IN ('database-bytea')),
    ADD CONSTRAINT invoice_artifact_blobs_kms_key_reference_check
        CHECK (
            kms_key_reference IS NULL
            OR (
                length(kms_key_reference) BETWEEN 3 AND 240
                AND kms_key_reference !~ '[[:cntrl:]]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_retention_until_check
        CHECK (retention_until IS NULL OR retention_until >= uploaded_at),
    ADD CONSTRAINT invoice_artifact_blobs_malware_scan_status_check
        CHECK (malware_scan_status IN ('passed', 'failed')),
    ADD CONSTRAINT invoice_artifact_blobs_malware_scan_engine_check
        CHECK (
            length(malware_scan_engine) BETWEEN 3 AND 120
            AND malware_scan_engine !~ '[[:cntrl:]]'
        ),
    ADD CONSTRAINT invoice_artifact_blobs_malware_scan_finding_check
        CHECK (
            malware_scan_finding IS NULL
            OR (
                length(malware_scan_finding) BETWEEN 1 AND 400
                AND malware_scan_finding !~ '[[:cntrl:]]'
            )
        );

CREATE INDEX IF NOT EXISTS idx_invoice_artifact_blobs_retention
    ON invoice_artifact_blobs (retention_until, legal_hold);

INSERT INTO schema_migrations (version, name)
VALUES ('033', 'invoice_artifact_blob_governance')
ON CONFLICT (version) DO NOTHING;
