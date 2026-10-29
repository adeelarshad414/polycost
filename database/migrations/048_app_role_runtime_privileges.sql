\set ON_ERROR_STOP on

-- Audit H-11: the first integration tests to run the repository as
-- polycost_app (instead of a mocked pool) found statements the role was never
-- granted, each a "permission denied" in production:
--
--   comparisons UPDATE   claiming an anonymous comparison (ADR-0001 P2-1b) and
--                        the retention sweep stamping expiry (P2-1c)
--   invoice_reconciliation_results UPDATE
--                        attaching invoice evidence to a reconciliation
--   DELETE on the tables the retention sweep prunes in delete-expired mode
--
-- Grants take no table lock worth noting and are idempotent, so this is safe
-- to re-run. role-privileges.integration.spec.ts now fails if a repository
-- writes a table its role cannot.
GRANT UPDATE, DELETE
    ON comparisons
    TO polycost_app;

GRANT UPDATE
    ON invoice_reconciliation_results
    TO polycost_app;

GRANT DELETE
    ON workloads,
       comparison_audit_logs,
       account_sessions,
       exchange_rates,
       pricing_etl_runs,
       team_audit_events,
       team_audit_event_exports
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('048', 'app_role_runtime_privileges')
ON CONFLICT (version) DO NOTHING;
