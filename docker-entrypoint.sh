#!/bin/sh
set -e

echo "Starting JellyTrack Server..."

# Normalize JELLYTRACK_* environment variable aliases
export TZ="${TZ:-UTC}"
export PORT="${JELLYTRACK_PORT:-${PORT:-3000}}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-${JELLYTRACK_SECRET:-}}"
export JELLYFIN_WEBHOOK_SECRET="${JELLYFIN_WEBHOOK_SECRET:-${JELLYTRACK_WEBHOOK_SECRET:-}}"
export JELLYFIN_API_KEY="${JELLYFIN_API_KEY:-${JELLYTRACK_JELLYFIN_API_KEY:-}}"

# Build DATABASE_URL from env vars (DB_* or POSTGRES_*).
# Priority order for compatibility:
# DB_* / JELLYTRACK_DB_* (host-network friendly) > POSTGRES_* (legacy) > defaults
# Treat obvious placeholder values as "not provided" so the entrypoint can
# reconstruct a usable DATABASE_URL without removing or changing user env vars.
rebuild_db=false
if [ -z "$DATABASE_URL" ]; then
  rebuild_db=true
else
  case "$DATABASE_URL" in
    *placeholder*|*PLACEHOLDER*)
      rebuild_db=true
      ;;
  esac
fi


# Percent-encode a string for safe inclusion in a URI using Node.js.
urlencode() {
  node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"
}

if [ "$rebuild_db" = true ]; then
  DB_USER=${JELLYTRACK_DB_USER:-${DB_USER:-${POSTGRES_USER:-JellyTrack}}}
  if [ -z "${JELLYTRACK_DB_PASSWORD:-${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}}" ] && [ "${NODE_ENV:-}" = "production" ]; then
    echo "ERROR: DB_PASSWORD, JELLYTRACK_DB_PASSWORD, or POSTGRES_PASSWORD must be set in production."
    exit 1
  fi
  DB_PASSWORD=${JELLYTRACK_DB_PASSWORD:-${DB_PASSWORD:-${POSTGRES_PASSWORD:-JellyTrack_password}}}
  DB_HOST=${DB_HOST:-${POSTGRES_IP:-postgres}}
  DB_PORT=${DB_PORT:-${POSTGRES_PORT:-5432}}
  DB_NAME=${JELLYTRACK_DB_NAME:-${DB_NAME:-${POSTGRES_DB:-JellyTrack}}}

  # Encode user and password to safely handle special characters in URIs
  SAFE_USER=$(urlencode "$DB_USER")
  SAFE_PASSWORD=$(urlencode "$DB_PASSWORD")

  export DATABASE_URL="postgresql://${SAFE_USER}:${SAFE_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&connection_limit=5"
  echo "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
else
  echo "Database: using provided DATABASE_URL"
fi

# Ensure runtime directories exist
mkdir -p /app/.next/cache /data/backups 2>/dev/null || true

run_prisma() {
  npx prisma "$@"
}

run_prisma_db_push() {
  if [ "$JELLYTRACK_PRISMA_ACCEPT_DATA_LOSS" = "true" ]; then
    echo "JELLYTRACK_PRISMA_ACCEPT_DATA_LOSS=true: allowing Prisma db push data-loss changes."
    run_prisma db push --accept-data-loss
  else
    run_prisma db push
  fi
}

baseline_prisma_migrations() {
  migration_files="$(find prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql -type f 2>/dev/null | sort || true)"

  if [ -z "$migration_files" ]; then
    echo "No concrete Prisma migration files found to baseline."
    return 0
  fi

  echo "Existing non-empty database without Prisma migration history detected."
  echo "Reconciling the schema safely, then baselining shipped migrations."

  echo "Running prisma db push to add any missing schema objects."
  run_prisma_db_push

  echo "$migration_files" | while IFS= read -r migration_file; do
    migration_name="$(basename "$(dirname "$migration_file")")"
    echo "Marking Prisma migration as applied: $migration_name"
    run_prisma migrate resolve --applied "$migration_name"
  done

  echo "Prisma migration baseline completed successfully."
}

# Prisma schema setup.
if [ -d "prisma/migrations" ] && [ -n "$(find prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql -type f 2>/dev/null | head -n 1)" ]; then
  echo "Prisma migrations detected. Running prisma migrate deploy..."
  migration_log="$(mktemp)"
  if run_prisma migrate deploy >"$migration_log" 2>&1; then
    cat "$migration_log"
    rm -f "$migration_log"
    echo "Prisma migrations applied successfully."
  else
    status=$?
    cat "$migration_log"
    if grep -q -E "P3005|does not exist" "$migration_log"; then
      rm -f "$migration_log"
      baseline_prisma_migrations
    else
      rm -f "$migration_log"
      exit "$status"
    fi
  fi
else
  echo "No Prisma migrations found (missing or empty prisma/migrations)."
  echo "Running prisma db push fallback to initialize schema."
  run_prisma_db_push
  echo "Prisma schema pushed successfully (fallback mode)."
fi

# Store the runtime port for the healthcheck script
echo "${PORT:-3000}" > /tmp/jellytrack-port

# Launch app
echo "Launching Next.js Standalone server..."
exec node server.js
