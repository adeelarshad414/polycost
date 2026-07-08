\set ON_ERROR_STOP on

ALTER TABLE invoice_artifact_blobs
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_storage_backend_check,
    DROP CONSTRAINT IF EXISTS invoice_artifact_blobs_content_length_check;

ALTER TABLE invoice_artifact_blobs
    ALTER COLUMN content DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS object_store_bucket TEXT,
    ADD COLUMN IF NOT EXISTS object_store_region TEXT,
    ADD COLUMN IF NOT EXISTS object_store_key TEXT,
    ADD COLUMN IF NOT EXISTS object_store_uri TEXT,
    ADD COLUMN IF NOT EXISTS object_store_etag TEXT,
    ADD COLUMN IF NOT EXISTS object_store_version TEXT;

UPDATE invoice_artifact_blobs
SET object_store_bucket = NULL,
    object_store_region = NULL,
    object_store_key = NULL,
    object_store_uri = NULL,
    object_store_etag = NULL,
    object_store_version = NULL
WHERE storage_backend = 'database-bytea';

ALTER TABLE invoice_artifact_blobs
    ADD CONSTRAINT invoice_artifact_blobs_storage_backend_check
        CHECK (storage_backend IN ('database-bytea', 'aws-s3', 'azure-blob', 'gcp-gcs')),
    ADD CONSTRAINT invoice_artifact_blobs_content_storage_check
        CHECK (
            (
                storage_backend = 'database-bytea'
                AND content IS NOT NULL
                AND octet_length(content) = content_size_bytes
                AND object_store_key IS NULL
                AND object_store_uri IS NULL
            )
            OR (
                storage_backend IN ('aws-s3', 'azure-blob', 'gcp-gcs')
                AND content IS NULL
                AND object_store_bucket IS NOT NULL
                AND object_store_key IS NOT NULL
                AND object_store_uri IS NOT NULL
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_object_store_bucket_check
        CHECK (
            object_store_bucket IS NULL
            OR (
                length(object_store_bucket) BETWEEN 3 AND 240
                AND object_store_bucket !~ '[[:cntrl:]]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_object_store_region_check
        CHECK (
            object_store_region IS NULL
            OR (
                length(object_store_region) BETWEEN 2 AND 80
                AND object_store_region !~ '[[:cntrl:]]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_object_store_key_check
        CHECK (
            object_store_key IS NULL
            OR (
                length(object_store_key) BETWEEN 1 AND 1024
                AND object_store_key !~ '[[:cntrl:]]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_object_store_uri_check
        CHECK (
            object_store_uri IS NULL
            OR (
                length(object_store_uri) BETWEEN 8 AND 1200
                AND object_store_uri !~ '[[:cntrl:]]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_object_store_etag_check
        CHECK (
            object_store_etag IS NULL
            OR (
                length(object_store_etag) BETWEEN 1 AND 240
                AND object_store_etag !~ '[[:cntrl:]]'
            )
        ),
    ADD CONSTRAINT invoice_artifact_blobs_object_store_version_check
        CHECK (
            object_store_version IS NULL
            OR (
                length(object_store_version) BETWEEN 1 AND 240
                AND object_store_version !~ '[[:cntrl:]]'
            )
        );

CREATE INDEX IF NOT EXISTS idx_invoice_artifact_blobs_object_store
    ON invoice_artifact_blobs (storage_backend, object_store_bucket, object_store_key);

GRANT DELETE
    ON invoice_artifact_blobs
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('034', 'invoice_artifact_external_storage')
ON CONFLICT (version) DO NOTHING;
