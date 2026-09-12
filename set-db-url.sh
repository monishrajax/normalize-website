#!/bin/sh
# Writes DATABASE_URL into server/.env from just your Supabase password.
#
#   ./set-db-url.sh 'your-password'
#
# Everything except the password is already known from the project, so this
# removes the two things that kept going wrong: finding the hidden file, and
# assembling the connection string by hand (pooler host, port 6543, and the
# username that must carry the project ref).
set -e

PW="$1"
if [ -z "$PW" ]; then
  echo "Usage: ./set-db-url.sh 'your-supabase-password'"
  exit 1
fi

REF=kdifmzozjyndptvkfjqc
HOST=aws-0-ap-southeast-2.pooler.supabase.com
URL="postgresql://postgres.${REF}:${PW}@${HOST}:6543/postgres"

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/server/.env"
[ -f "$ENV_FILE" ] || { echo "Not found: $ENV_FILE"; exit 1; }

# Replace the existing DATABASE_URL line rather than appending a second one.
TMP="${ENV_FILE}.tmp$$"
grep -v '^DATABASE_URL=' "$ENV_FILE" > "$TMP"
printf 'DATABASE_URL=%s\n' "$URL" >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Written to server/.env:"
echo "  user postgres.${REF}  host ${HOST}  port 6543  password ${#PW} chars"
