#!/bin/sh
# PolyCost scheduled backup (audit H-16). Run by the Helm CronJob and by the
# nightly restore drill, so the path that is drilled is the path that runs.
#
# Produces, under BACKUP_DESTINATION/<UTC stamp>/:
#   globals.sql.age   cluster roles and their passwords (pg_dumpall --globals-only)
#   db.dump.age       the database, custom format (pg_dump -Fc)
#   manifest.json     sha256 of each plaintext file, sizes, versions
#
# Both files are encrypted with age to BACKUP_AGE_RECIPIENT (a public key), so
# the destination never holds readable data and the private key lives only
# where restores happen. A dump without the globals cannot be restored into a
# new cluster (the app roles are cluster-level), so both are always taken.
#
# Environment:
#   PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE   libpq (database owner)
#   BACKUP_AGE_RECIPIENT     age public key (age1...), required
#   BACKUP_DESTINATION       rclone destination, e.g. ":s3:bucket/polycost" with
#                            RCLONE_S3_* variables, or a local path
#   BACKUP_RETENTION_DAYS    delete backups older than this (default 35; 0 keeps all)
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age public key) is required}"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION (rclone destination) is required}"
: "${PGDATABASE:?PGDATABASE is required}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "backup: $PGDATABASE -> $BACKUP_DESTINATION/$stamp"

pg_dumpall --globals-only > "$work/globals.sql"
pg_dump --format=custom --file="$work/db.dump" "$PGDATABASE"

# A dump that "succeeded" but is nearly empty is the classic silent failure.
dump_bytes="$(wc -c < "$work/db.dump" | tr -d ' ')"
globals_bytes="$(wc -c < "$work/globals.sql" | tr -d ' ')"
if [ "$dump_bytes" -lt 1024 ] || [ "$globals_bytes" -lt 128 ]; then
  echo "backup: refusing a suspiciously small backup (dump $dump_bytes B, globals $globals_bytes B)" >&2
  exit 1
fi

cat > "$work/manifest.json" <<EOF
{
  "stamp": "$stamp",
  "database": "$PGDATABASE",
  "serverVersion": "$(psql -tAc 'SHOW server_version' | tr -d '\n')",
  "schemaVersion": "$(psql -tAc 'SELECT max(version) FROM schema_migrations' 2>/dev/null | tr -d '\n')",
  "files": {
    "db.dump": { "bytes": $dump_bytes, "sha256": "$(sha256sum "$work/db.dump" | cut -d' ' -f1)" },
    "globals.sql": { "bytes": $globals_bytes, "sha256": "$(sha256sum "$work/globals.sql" | cut -d' ' -f1)" }
  }
}
EOF

age --recipient "$BACKUP_AGE_RECIPIENT" --output "$work/db.dump.age" "$work/db.dump"
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$work/globals.sql.age" "$work/globals.sql"
rm -f "$work/db.dump" "$work/globals.sql"

rclone copy --no-traverse "$work" "$BACKUP_DESTINATION/$stamp"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  rclone delete --min-age "${RETENTION_DAYS}d" "$BACKUP_DESTINATION"
  rclone rmdirs --leave-root "$BACKUP_DESTINATION"
fi

echo "backup: ok $stamp (dump $dump_bytes B, globals $globals_bytes B, retention ${RETENTION_DAYS}d)"
