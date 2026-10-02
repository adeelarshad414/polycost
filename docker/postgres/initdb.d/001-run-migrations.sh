set -eu

# Runs once, on a fresh volume, as the postgres image's init hook. It applies
# every migration through the same migrator `npm run db:migrate` and the Helm
# migration Job use (audit H-06), so the three can never disagree.
for secret_file in /run/polycost-secrets/app_db_password /run/polycost-secrets/etl_db_password; do
  if [ ! -f "$secret_file" ]; then
    echo "Missing generated local database secret: $secret_file" >&2
    exit 1
  fi
done

PGUSER="$POSTGRES_USER" \
PGDATABASE="$POSTGRES_DB" \
APP_DB_PASSWORD_FILE=/run/polycost-secrets/app_db_password \
ETL_DB_PASSWORD_FILE=/run/polycost-secrets/etl_db_password \
MIGRATIONS_DIR=/polycost-migrations \
  sh /polycost-postgres/migrate.sh
