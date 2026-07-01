set -eu

required_secret_files="
/run/polycost-secrets/app_db_password
/run/polycost-secrets/etl_db_password
"

for secret_file in $required_secret_files; do
  if [ ! -f "$secret_file" ]; then
    echo "Missing generated local database secret: $secret_file" >&2
    exit 1
  fi
done

APP_DB_PASSWORD="$(cat /run/polycost-secrets/app_db_password)"
ETL_DB_PASSWORD="$(cat /run/polycost-secrets/etl_db_password)"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --file /polycost-migrations/001_core_schema.sql

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set app_password="$APP_DB_PASSWORD" \
  --set etl_password="$ETL_DB_PASSWORD" \
  --file /polycost-migrations/002_least_privilege_roles.sql

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --file /polycost-migrations/003_seed_service_equivalence_map.sql

for migration in \
  004_seed_local_pricing_catalog.sql \
  005_backend_architecture_tables.sql \
  006_cost_management_jobs.sql \
  007_pricing_etl_run_counters.sql \
  008_pricing_model_terms.sql \
  009_pricing_rates_matrix.sql \
  010_share_link_context.sql \
  011_seed_local_commitment_pricing_catalog.sql \
  012_production_depth_audit_analytics.sql \
  013_report_export_jobs.sql \
  014_comparison_prewarm_jobs.sql
do
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --file "/polycost-migrations/$migration"
done
