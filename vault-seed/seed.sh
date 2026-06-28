set -eu

until vault status >/dev/null 2>&1; do
  sleep 1
done

mkdir -p /run/polycost-secrets
mkdir -p /run/polycost-vault-auth

generate_secret_file() {
  secret_file="$1"

  if [ ! -f "$secret_file" ]; then
    vault write -field=random_bytes sys/tools/random/32 format=base64 > "$secret_file"
    chmod 0444 "$secret_file"
  fi
}

generate_secret_file /run/polycost-secrets/owner_db_password
generate_secret_file /run/polycost-secrets/app_db_password
generate_secret_file /run/polycost-secrets/etl_db_password

printf '%s' "$VAULT_TOKEN" > /run/polycost-vault-auth/token
chmod 0444 /run/polycost-vault-auth/token

OWNER_DB_PASSWORD="$(cat /run/polycost-secrets/owner_db_password)"
APP_DB_PASSWORD="$(cat /run/polycost-secrets/app_db_password)"
ETL_DB_PASSWORD="$(cat /run/polycost-secrets/etl_db_password)"

vault kv put secret/polycost/db \
  database="polycost_dev" \
  owner_username="polycost_owner" \
  owner_password="$OWNER_DB_PASSWORD" \
  username="polycost_app" \
  password="$APP_DB_PASSWORD" \
  etl_username="polycost_etl" \
  etl_password="$ETL_DB_PASSWORD" >/dev/null
vault kv put secret/polycost/llm api_key="configure-directly-in-local-vault" >/dev/null
vault kv put secret/polycost/admin api_key="configure-directly-in-local-vault" >/dev/null

echo "Local development secrets seeded into Vault."
