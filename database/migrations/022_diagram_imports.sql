\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS diagram_imports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    format              TEXT NOT NULL,
    file_name           TEXT,
    mime_type           TEXT,
    size_bytes          INTEGER NOT NULL,
    sha256              TEXT NOT NULL,
    parser_confidence   TEXT NOT NULL,
    unresolved_count    INTEGER NOT NULL DEFAULT 0,
    ignored_count       INTEGER NOT NULL DEFAULT 0,
    graph_snapshot      JSONB NOT NULL,
    nws_snapshot        JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',

    CONSTRAINT diagram_imports_format_check
        CHECK (format IN ('mermaid', 'drawio', 'lucid_csv', 'vsdx')),
    CONSTRAINT diagram_imports_parser_confidence_check
        CHECK (parser_confidence IN ('high', 'medium', 'low')),
    CONSTRAINT diagram_imports_size_check
        CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    CONSTRAINT diagram_imports_sha256_check
        CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT diagram_imports_counts_check
        CHECK (unresolved_count >= 0 AND ignored_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_diagram_imports_created_at
    ON diagram_imports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagram_imports_expires_at
    ON diagram_imports (expires_at);

GRANT SELECT, INSERT, DELETE
    ON diagram_imports
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('022', 'diagram_imports')
ON CONFLICT (version) DO NOTHING;
