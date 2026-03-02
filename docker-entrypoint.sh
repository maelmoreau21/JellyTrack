#!/bin/sh
set -e

echo "Starting JellyTulli Server..."

# ─── Build DATABASE_URL from individual POSTGRES_* variables ────────
if [ -z "$DATABASE_URL" ]; then
  POSTGRES_USER=${POSTGRES_USER:-jellytulli}
  POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-jellytulli_password}
  POSTGRES_IP=${POSTGRES_IP:-postgres}
  POSTGRES_PORT=${POSTGRES_PORT:-5432}
  POSTGRES_DB=${POSTGRES_DB:-jellytulli}
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_IP}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public&connection_limit=5"
fi
echo "Database: ${POSTGRES_IP:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-jellytulli}"

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

# Fix ownership of critical directories
chown -R "$PUID:$PGID" /app /data/backups 2>/dev/null || true

# ─── Prisma Migration ──────────────────────────────────────────────
echo "Running Prisma db push..."
su-exec "$PUID:$PGID" npx prisma db push --accept-data-loss --skip-generate

echo "Prisma schema pushed successfully."

# ─── Launch App as the configured user ──────────────────────────────
echo "Launching Next.js Standalone server..."
exec su-exec "$PUID:$PGID" node server.js
