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

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --file /polycost-migrations/004_seed_local_pricing_catalog.sql

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --file /polycost-migrations/005_backend_architecture_tables.sql

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --file /polycost-migrations/006_cost_management_jobs.sql

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --file /polycost-migrations/007_pricing_etl_run_counters.sql
