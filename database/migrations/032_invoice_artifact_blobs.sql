\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS invoice_artifact_blobs (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id          UUID NOT NULL REFERENCES invoice_reconciliation_results(id) ON DELETE CASCADE,
    artifact_id                TEXT NOT NULL,
    team_id                    UUID REFERENCES teams(id) ON DELETE SET NULL,
    file_name                  TEXT NOT NULL,
    mime_type                  TEXT NOT NULL,
    content_sha256             TEXT NOT NULL,
    content_size_bytes         INTEGER NOT NULL,
    content                    BYTEA NOT NULL,
    uploaded_by_account_id     UUID REFERENCES accounts(id) ON DELETE SET NULL,
    uploaded_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT invoice_artifact_blobs_artifact_id_check
        CHECK (length(artifact_id) BETWEEN 1 AND 120),
    CONSTRAINT invoice_artifact_blobs_file_name_check
        CHECK (
            length(file_name) BETWEEN 1 AND 180
            AND file_name !~ '[\\/]'
            AND file_name !~ '[[:cntrl:]]'
        ),
    CONSTRAINT invoice_artifact_blobs_mime_type_check
        CHECK (
            mime_type IN (
                'application/pdf',
                'application/json',
                'text/csv',
                'text/plain',
                'image/png',
                'image/jpeg'
            )
        ),
    CONSTRAINT invoice_artifact_blobs_content_sha256_check
        CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT invoice_artifact_blobs_content_size_check
        CHECK (content_size_bytes BETWEEN 1 AND 1048576),
    CONSTRAINT invoice_artifact_blobs_content_length_check
        CHECK (octet_length(content) = content_size_bytes)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_artifact_blobs_reconciliation_artifact
    ON invoice_artifact_blobs (reconciliation_id, artifact_id);

CREATE INDEX IF NOT EXISTS idx_invoice_artifact_blobs_team_uploaded
    ON invoice_artifact_blobs (team_id, uploaded_at DESC);

GRANT SELECT, INSERT, UPDATE
    ON invoice_artifact_blobs
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('032', 'invoice_artifact_blobs')
ON CONFLICT (version) DO NOTHING;
