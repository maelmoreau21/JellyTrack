#!/bin/sh
set -e

echo "Starting JellyTrack Server..."

# ─── Build DATABASE_URL from env vars (DB_* or POSTGRES_*) ──────────
# Priority order for compatibility:
# DB_* (host-network friendly) > POSTGRES_* (legacy) > defaults
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

if [ "$rebuild_db" = true ]; then
  DB_USER=${DB_USER:-${POSTGRES_USER:-JellyTrack}}
  DB_PASSWORD=${DB_PASSWORD:-${POSTGRES_PASSWORD:-JellyTrack_password}}
  DB_HOST=${DB_HOST:-${POSTGRES_IP:-postgres}}
  DB_PORT=${DB_PORT:-${POSTGRES_PORT:-5432}}
  DB_NAME=${DB_NAME:-${POSTGRES_DB:-JellyTrack}}
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&connection_limit=5"
  echo "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
else
  echo "Database: using provided DATABASE_URL"
fi

# ─── PUID / PGID Support ───────────────────────────────────────────
PUID=${PUID:-1001}
PGID=${PGID:-1001}

echo "Configuring user: UID=$PUID, GID=$PGID"

# Update the nextjs group GID and user UID on the fly
if [ "$(id -g nextjs)" != "$PGID" ]; then
    groupmod -o -g "$PGID" nodejs 2>/dev/null || true
fi
if [ "$(id -u nextjs)" != "$PUID" ]; then
    usermod -o -u "$PUID" nextjs 2>/dev/null || true
fi

# Fix ownership of runtime-writable directories only (not all of /app — avoids slow chown -R)
chown -R "$PUID:$PGID" /data/backups 2>/dev/null || true
mkdir -p /app/.next/cache 2>/dev/null || true
chown -R "$PUID:$PGID" /app/.next 2>/dev/null || true

# ─── Prisma Migration ──────────────────────────────────────────────
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Prisma migrations detected. Running prisma migrate deploy..."
  su-exec "$PUID:$PGID" npx prisma migrate deploy
  echo "Prisma migrations applied successfully."
else
  echo "No Prisma migrations found (missing or empty prisma/migrations)."
  echo "Running prisma db push fallback to initialize schema..."
  su-exec "$PUID:$PGID" npx prisma db push --skip-generate --accept-data-loss
  echo "Prisma schema pushed successfully (fallback mode)."
fi

# ─── Launch App as the configured user ──────────────────────────────
echo "Launching Next.js Standalone server..."
exec su-exec "$PUID:$PGID" node server.js
