\set ON_ERROR_STOP on

-- Portable across environments (audit H-06): the database name used to be
-- hard-coded as polycost_dev, so this failed on any other database, and the
-- roles were created unconditionally, so it failed where an operator had
-- pre-created them (common on managed Postgres). Roles are cluster-level.
SELECT current_database() AS polycost_db \gset

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'polycost_app') AS create_app_role \gset
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'polycost_etl') AS create_etl_role \gset

\if :create_app_role
SELECT :'app_password' = '' AS app_password_missing \gset
\if :app_password_missing
DO $$ BEGIN RAISE EXCEPTION 'APP_DB_PASSWORD is required to create role polycost_app'; END $$;
\endif
CREATE ROLE polycost_app LOGIN PASSWORD :'app_password';
\endif

\if :create_etl_role
SELECT :'etl_password' = '' AS etl_password_missing \gset
\if :etl_password_missing
DO $$ BEGIN RAISE EXCEPTION 'ETL_DB_PASSWORD is required to create role polycost_etl'; END $$;
\endif
CREATE ROLE polycost_etl LOGIN PASSWORD :'etl_password';
\endif

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE :"polycost_db" FROM PUBLIC;

GRANT CONNECT ON DATABASE :"polycost_db" TO polycost_app;
GRANT CONNECT ON DATABASE :"polycost_db" TO polycost_etl;

GRANT USAGE ON SCHEMA public TO polycost_app;
GRANT USAGE ON SCHEMA public TO polycost_etl;

GRANT SELECT
    ON pricing_catalog,
       service_equivalence_map,
       pricing_etl_runs
    TO polycost_app;

GRANT SELECT, INSERT
    ON comparisons
    TO polycost_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON pricing_catalog
    TO polycost_etl;

GRANT SELECT, INSERT, UPDATE
    ON pricing_etl_runs
    TO polycost_etl;

GRANT SELECT
    ON service_equivalence_map
    TO polycost_etl;

INSERT INTO schema_migrations (version, name)
VALUES ('002', 'least_privilege_roles')
ON CONFLICT (version) DO NOTHING;
