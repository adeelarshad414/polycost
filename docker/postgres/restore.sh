#!/bin/sh
# PolyCost restore (audit H-16): the counterpart of backup.sh, and what the
# nightly drill runs. See docs/RUNBOOK.md "Incident: Restore From Backup" for
# when to use it; stop writers first.
#
# Fetches BACKUP_SOURCE/<stamp> (newest by default), decrypts it with the age
# identity, checks each file against the manifest's sha256, then restores the
# cluster globals (roles) BEFORE the database - the dump's GRANTs fail if the
# roles do not exist yet - into the cluster named by the libpq variables.
#
# Environment:
#   PGHOST PGPORT PGUSER PGPASSWORD PGSSLMODE   target cluster (owner/superuser)
#   BACKUP_SOURCE        rclone location backup.sh wrote to
#   BACKUP_STAMP         which backup; default: the newest
#   AGE_IDENTITY_FILE    age private key file
#   RESTORE_DATABASE     database to create and restore into; must not exist
set -eu

: "${BACKUP_SOURCE:?BACKUP_SOURCE is required}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required}"
: "${RESTORE_DATABASE:?RESTORE_DATABASE is required}"

stamp="${BACKUP_STAMP:-$(rclone lsf --dirs-only "$BACKUP_SOURCE" | sed 's#/$##' | sort | tail -n 1)}"
if [ -z "$stamp" ]; then
  echo "restore: no backups found in $BACKUP_SOURCE" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "restore: $BACKUP_SOURCE/$stamp -> $RESTORE_DATABASE"
rclone copy "$BACKUP_SOURCE/$stamp" "$work"

for file in db.dump globals.sql; do
  age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$work/$file" "$work/$file.age"
  expected="$(sed -n "/\"$file\"/s/.*\"sha256\": \"\([0-9a-f]*\)\".*/\1/p" "$work/manifest.json")"
  actual="$(sha256sum "$work/$file" | cut -d' ' -f1)"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    echo "restore: $file does not match the manifest checksum" >&2
    exit 1
  fi
done

# Roles first. "already exists" is expected when restoring into a cluster that
# has them (and for the connecting superuser); anything else is fatal.
psql --dbname=postgres --file="$work/globals.sql" > "$work/globals.log" 2>&1 || true
if grep 'ERROR' "$work/globals.log" | grep -v 'already exists' >&2; then
  echo "restore: restoring cluster globals failed" >&2
  exit 1
fi

createdb "$RESTORE_DATABASE"
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE" "$work/db.dump"

echo "restore: ok $stamp -> $RESTORE_DATABASE"
