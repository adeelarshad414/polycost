set -eu

if [ ! -f /run/polycost-secrets/owner_db_password ]; then
  echo "Missing generated local database owner password." >&2
  exit 1
fi

export POSTGRES_PASSWORD
POSTGRES_PASSWORD="$(cat /run/polycost-secrets/owner_db_password)"

exec docker-entrypoint.sh postgres
