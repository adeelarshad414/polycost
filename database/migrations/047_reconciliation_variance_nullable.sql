\set ON_ERROR_STOP on

-- Audit M-04: a reconciliation against a $0 estimate has no variance
-- percentage. It used to be stored as 100%, a figure nobody measured. NULL now
-- means "no estimate to compare against"; the status is already 'unmatched'.
-- Existing rows are corrected to match.
--
-- DROP NOT NULL is a catalog-only change. The UPDATE touches only the rows with
-- a zero estimate, which is a handful at most.
ALTER TABLE invoice_reconciliation_results ALTER COLUMN variance_percent DROP NOT NULL;

UPDATE invoice_reconciliation_results
SET variance_percent = NULL
WHERE estimated_total_usd = 0
  AND invoiced_total_usd <> 0;

INSERT INTO schema_migrations (version, name)
VALUES ('047', 'reconciliation_variance_nullable')
ON CONFLICT (version) DO NOTHING;
