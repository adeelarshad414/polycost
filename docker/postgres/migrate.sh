#!/bin/sh
# PolyCost database migrator (audit H-06).
#
# One way to migrate everywhere: the compose initdb hook, `npm run db:migrate`
# and the Helm pre-install/pre-upgrade Job all run this script. It replaces a
# hand-written file list that drifted (fresh volumes silently missed 041/042)
# and gives production what it lacked:
#
#   - ordering     every database/migrations/NNN_*.sql, in version order
#   - one runner   a session advisory lock, so two pods or Jobs never race
#   - atomicity    each file runs in a transaction unless it must not
#                  (CREATE INDEX CONCURRENTLY, or `-- migrate:no-transaction`)
#   - integrity    a sha256 per applied file in schema_migrations.checksum;
#                  editing a migration after it ran fails the next run
#
# Connection: standard libpq variables (PGHOST, PGPORT, PGDATABASE, PGUSER,
# PGPASSWORD, PGSSLMODE, PGSSLROOTCERT). Inside the postgres container the
# socket defaults work as-is.
#
# Role passwords for 002_least_privilege_roles.sql:
#   APP_DB_PASSWORD / ETL_DB_PASSWORD, or *_FILE pointing at a file.
#
#   MIGRATIONS_DIR   default /polycost-migrations
#   MIGRATE_DRY_RUN  1 = list pending migrations and exit without applying
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/polycost-migrations}"
# Arbitrary constant: the same key for every runner of this database.
LOCK_KEY=740331

read_secret() {
  value="$1"
  file="$2"
  if [ -n "$value" ]; then
    printf '%s' "$value"
  elif [ -n "$file" ] && [ -f "$file" ]; then
    cat "$file"
  fi
}

APP_DB_PASSWORD="$(read_secret "${APP_DB_PASSWORD:-}" "${APP_DB_PASSWORD_FILE:-}")"
ETL_DB_PASSWORD="$(read_secret "${ETL_DB_PASSWORD:-}" "${ETL_DB_PASSWORD_FILE:-}")"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

needs_no_transaction() {
  grep -qiE 'CONCURRENTLY|-- migrate:no-transaction' "$1"
}

set -- "$MIGRATIONS_DIR"/[0-9][0-9][0-9]_*.sql
if [ ! -f "$1" ]; then
  echo "migrate: no migrations found in $MIGRATIONS_DIR" >&2
  exit 1
fi

plan="$(mktemp)"
trap 'rm -f "$plan"' EXIT

{
  echo '\set ON_ERROR_STOP on'
  echo '\set QUIET on'
  echo 'SET client_min_messages = warning;'
  # Held for the whole session; released automatically if the runner dies.
  echo "SELECT pg_advisory_lock($LOCK_KEY) AS locked \\gset"
  # 001 creates this too; creating it first lets the checks below run on an
  # empty database.
  echo 'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT now());'
  echo 'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;'

  for path in "$@"; do
    file="$(basename "$path")"
    version="$(printf '%s' "$file" | cut -c1-3)"
    name="$(printf '%s' "$file" | sed -e 's/^[0-9]\{3\}_//' -e 's/\.sql$//')"
    sum="$(sha256_of "$path")"

    echo "SELECT NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '$version') AS pending \\gset"
    echo '\if :pending'
    if [ "${MIGRATE_DRY_RUN:-0}" = "1" ]; then
      echo "  \\echo 'pending  $file'"
    else
      echo "  \\echo 'applying $file'"
      if needs_no_transaction "$path"; then
        echo "  \\i $path"
      else
        echo '  BEGIN;'
        echo "  \\i $path"
        echo '  COMMIT;'
      fi
      # Most files record themselves; this covers any that do not.
      echo "  INSERT INTO schema_migrations (version, name, checksum) VALUES ('$version', '$name', '$sum') ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;"
    fi
    echo '\else'
    # Rows from before checksums existed adopt the current file as baseline.
    if [ "${MIGRATE_DRY_RUN:-0}" != "1" ]; then
      echo "  UPDATE schema_migrations SET checksum = '$sum' WHERE version = '$version' AND checksum IS NULL;"
    fi
    echo "  SELECT checksum <> '$sum' AS drifted FROM schema_migrations WHERE version = '$version' \\gset"
    echo '  \if :drifted'
    echo "    DO \$\$ BEGIN RAISE EXCEPTION 'migration $file changed after it was applied (checksum mismatch). Add a new migration instead of editing an applied one.'; END \$\$;"
    echo '  \endif'
    echo '\endif'
  done

  echo "SELECT pg_advisory_unlock($LOCK_KEY) AS unlocked \\gset"
  if [ "${MIGRATE_DRY_RUN:-0}" = "1" ]; then
    echo "\\echo 'migrate: dry run complete, nothing applied'"
  else
    echo "\\echo 'migrate: database is up to date'"
  fi
} > "$plan"

exec psql \
  --no-psqlrc \
  --set app_password="$APP_DB_PASSWORD" \
  --set etl_password="$ETL_DB_PASSWORD" \
  --file "$plan"
