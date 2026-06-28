\set ON_ERROR_STOP on

CREATE ROLE polycost_app LOGIN PASSWORD :'app_password';
CREATE ROLE polycost_etl LOGIN PASSWORD :'etl_password';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE polycost_dev FROM PUBLIC;

GRANT CONNECT ON DATABASE polycost_dev TO polycost_app;
GRANT CONNECT ON DATABASE polycost_dev TO polycost_etl;

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
