FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# 1. Install dependencies only when needed
FROM base AS deps
WORKDIR /app
# Copy lockfile explicitly to ensure it's present in the build context
COPY package.json package-lock.json ./
# Install build tools and git (some deps fetch via git), then install packages
RUN apk add --no-cache python3 build-base git ca-certificates && \
    npm --version && \
    npm install -g npm@10 || true && \
    npm ci --no-audit --progress=false || npm install --no-audit --progress=false

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma schema first to cache the generate step
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code only after dependencies and prisma are ready
COPY . .

# Environment variables for build time
ENV NEXT_TELEMETRY_DISABLED=1

# Provide dummy variables so Next.js build doesn't crash trying to connect to a real DB
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Build Next.js project
RUN NEXTAUTH_SECRET=build-placeholder npm run build

# ── Clean up Prisma engines: keep only linux-musl (Alpine), remove all others ──
# This saves ~50-60MB by removing Windows, macOS, Debian, etc. engine binaries
RUN find /app/node_modules/.prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/prisma -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    # Remove Prisma CLI's bundled engines (schema-engine, migration-engine) — we only use db push
    find /app/node_modules -name "schema-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "migration-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true

# 3. Production image, copy all the files and run next
FROM base AS runner
RUN apk add --no-cache su-exec shadow
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Default user/group (overridden at runtime via PUID/PGID)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data/backups

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma: schema + client + CLI (already stripped of non-linux engines in builder)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/package.json ./package.json

# Force copy serverExternalPackages (not bundled by Next.js standalone)
COPY --from=builder /app/node_modules/geoip-country ./node_modules/geoip-country
COPY --from=builder /app/node_modules/node-cron ./node_modules/node-cron

# OCI labels — links the GHCR package to the GitHub repo
LABEL org.opencontainers.image.source="https://github.com/MaelMoreau21/JellyTrack"
LABEL org.opencontainers.image.description="JellyTrack — Dashboard analytique pour Jellyfin"
LABEL org.opencontainers.image.licenses="MIT"

# Expose port and configure entrypoint
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the entrypoint script (runs as root initially, then drops to PUID/PGID)
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
