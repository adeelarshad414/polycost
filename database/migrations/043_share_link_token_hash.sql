\set ON_ERROR_STOP on

-- Audit M-02: share-link tokens were stored in plaintext, so anyone who could
-- read the table (a backup, a replica, a log of a slow query) could open every
-- shared report. Store sha256(token) instead; the raw token exists only in the
-- URL handed to the link's creator.
--
-- The token is the primary key and share_link_events references it, so the
-- foreign key is recreated with ON UPDATE CASCADE before the keys change.
-- Re-runnable: raw tokens are 43-character base64url strings and are never
-- 64 lowercase hex characters, so only unhashed rows are touched.
ALTER TABLE share_link_events
    DROP CONSTRAINT IF EXISTS share_link_events_token_fkey;
ALTER TABLE share_link_events
    ADD CONSTRAINT share_link_events_token_fkey
    FOREIGN KEY (token) REFERENCES share_links(token)
    ON UPDATE CASCADE ON DELETE CASCADE;

UPDATE share_links
SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
WHERE token !~ '^[0-9a-f]{64}$';

COMMENT ON COLUMN share_links.token IS
    'sha256 hex of the share token. The raw token is never stored.';

INSERT INTO schema_migrations (version, name)
VALUES ('043', 'share_link_token_hash')
ON CONFLICT (version) DO NOTHING;
