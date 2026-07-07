\set ON_ERROR_STOP on

GRANT SELECT, INSERT, UPDATE
    ON accounts,
       account_password_credentials,
       account_sessions,
       teams,
       team_memberships,
       team_invitations,
       sso_identity_provider_configs
    TO polycost_app;

GRANT DELETE
    ON team_memberships
    TO polycost_app;

GRANT SELECT, INSERT, UPDATE
    ON billing_import_runs
    TO polycost_app;

GRANT SELECT, INSERT
    ON invoice_line_items,
       invoice_reconciliation_results
    TO polycost_app;

INSERT INTO schema_migrations (version, name)
VALUES ('029', 'auth_billing_runtime_privileges')
ON CONFLICT (version) DO NOTHING;
