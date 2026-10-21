#!/usr/bin/env bash
# Prepares deploy/.env for the HRC Shelf stack.
#
# - Copies env.example to .env if .env does not exist yet.
# - Fills every EMPTY secret with a random value, and signs the Supabase
#   ANON_KEY and SERVICE_ROLE_KEY JWTs with JWT_SECRET.
#
# Values that are already set are never touched, so the script is safe to run
# again. To rotate a secret, clear it in .env first (and read the rotation
# notes in apps/docs/self-hosted-stack.md: the database password and the JWT
# secret cannot simply be swapped on a running install).
#
# Pass --local to test on one machine with docker-compose.local.yml: the URLs
# point at localhost and mail goes to the Mailpit container. On an existing
# .env it rewrites only those URL and SMTP settings; secrets are kept.
#
# Requires: bash, openssl, awk.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
EXAMPLE_FILE="${DEPLOY_DIR}/env.example"

LOCAL=false
if [ "${1:-}" = "--local" ]; then
  LOCAL=true
fi

CREATED=false
if [ ! -f "$ENV_FILE" ]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  CREATED=true
  echo "Created ${ENV_FILE} from env.example"
fi
chmod 600 "$ENV_FILE"

# get_var <KEY>: prints the value of KEY in .env, without surrounding quotes.
get_var() {
  awk -v key="$1" -F= '
    $1 == key { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }
  ' "$ENV_FILE"
}

# set_var <KEY> <VALUE>: replaces the KEY line, or appends it if missing.
set_var() {
  local tmp
  tmp="$(mktemp)"
  awk -v key="$1" -v value="$2" -F= '
    $1 == key { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}

# Hex only, so values are safe inside URLs and connection strings.
random_hex() {
  openssl rand -hex "$1"
}

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

# sign_jwt <role> <secret>: HS256 JWT valid for 10 years, as Supabase expects.
sign_jwt() {
  local role="$1" secret="$2" now exp header payload signature
  now="$(date +%s)"
  exp=$((now + 10 * 365 * 24 * 3600))
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64url)"
  payload="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$now" "$exp" | base64url)"
  signature="$(printf '%s' "${header}.${payload}" | openssl dgst -sha256 -hmac "$secret" -binary | base64url)"
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

# fill <KEY> <VALUE>: sets KEY only when it is empty.
fill() {
  if [ -z "$(get_var "$1")" ]; then
    set_var "$1" "$2"
    echo "  generated $1"
  else
    echo "  kept      $1"
  fi
}

if [ "$LOCAL" = true ]; then
  echo "Applying localhost settings"
  set_var SERVER_URL "http://localhost:3000"
  set_var SUPABASE_PUBLIC_URL "http://supabase.localhost:8000"
  set_var SUPABASE_HOST ""
  set_var SMTP_HOST "mailpit"
  set_var SMTP_PORT "1025"
  set_var SMTP_USER ""
  set_var SMTP_PWD ""
  set_var GEOCODING_USER_AGENT '"Hellenic Red Cross Assets (local test)"'
fi

echo "Filling secrets in ${ENV_FILE}"
fill POSTGRES_PASSWORD "$(random_hex 24)"
fill PG_META_CRYPTO_KEY "$(random_hex 32)"
fill SESSION_SECRET "$(random_hex 32)"
fill INVITE_TOKEN_SECRET "$(random_hex 32)"
fill FINGERPRINT "$(random_hex 32)"

if [ -z "$(get_var JWT_SECRET)" ]; then
  if [ -n "$(get_var ANON_KEY)" ] || [ -n "$(get_var SERVICE_ROLE_KEY)" ]; then
    echo "JWT_SECRET is empty but API keys are set. Clear ANON_KEY and" >&2
    echo "SERVICE_ROLE_KEY too, so all three are generated together." >&2
    exit 1
  fi
fi
fill JWT_SECRET "$(random_hex 32)"

JWT_SECRET_VALUE="$(get_var JWT_SECRET)"
fill ANON_KEY "$(sign_jwt anon "$JWT_SECRET_VALUE")"
fill SERVICE_ROLE_KEY "$(sign_jwt service_role "$JWT_SECRET_VALUE")"

echo
if [ "$LOCAL" = true ]; then
  echo "Done. Start the stack with:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build"
else
  echo "Done. Now edit ${ENV_FILE} and set at least:"
  echo "  SERVER_URL, SUPABASE_PUBLIC_URL, SUPABASE_HOST, and the SMTP_* values."
fi
