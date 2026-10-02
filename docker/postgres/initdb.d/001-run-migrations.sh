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

# Apply every remaining migration in version order. The list used to be written
# out by hand and stopped at 040, so a fresh volume silently missed 041 and 042
# (audit H-06). Each migration records itself in schema_migrations, so
# `npm run db:migrate` later skips what ran here. POSIX glob expansion is sorted.
for migration_path in /polycost-migrations/[0-9][0-9][0-9]_*.sql; do
  migration="$(basename "$migration_path")"
  case "$migration" in
    001_* | 002_* | 003_*) continue ;;
  esac

  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --file "$migration_path"
done
