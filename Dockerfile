# Declare BUILDPLATFORM argument
ARG BUILDPLATFORM

# Base image for the build environment (runs on the host build architecture)
FROM --platform=$BUILDPLATFORM mirror.gcr.io/library/node:22-alpine AS build-base
RUN apk add --no-cache libc6-compat openssl

# 1. Install dependencies only when needed (on build platform)
FROM build-base AS deps
WORKDIR /app
# Copy lockfile explicitly to ensure it's present in the build context
COPY package.json package-lock.json ./
# Install build tools and git (some deps fetch via git), then install packages
RUN apk add --no-cache python3 build-base git ca-certificates && \
    npm --version && \
    npm install -g npm@10 || true && \
    npm ci --no-audit --progress=false || npm install --no-audit --progress=false

# 2. Rebuild the source code only when needed (on build platform)
FROM build-base AS builder
RUN apk add --no-cache binutils
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Provide dummy variables so Prisma/Next.js build steps do not connect to a real DB.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Copy Prisma config and schema first to cache the generate step
COPY prisma.config.ts ./prisma.config.ts
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code only after dependencies and prisma are ready
COPY . .

# Environment variables for build time
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js project
RUN NEXTAUTH_SECRET=build-placeholder npm run build

# Prune devDependencies to keep only production dependencies (including prisma CLI)
RUN npm prune --omit=dev

# ── Clean up Prisma engines: keep only linux-musl (Alpine), remove all others ──
# This saves ~50-60MB by removing Windows, macOS, Debian, etc. engine binaries
# Note: Since we are building multi-arch, both amd64 and arm64 engine binaries contain 'linux-musl'
# and will be kept.
RUN find /app/node_modules/.prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/prisma -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    # Keep only Alpine-compatible Prisma schema/migration engines for runtime setup
    find /app/node_modules -name "schema-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "migration-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true

# Strip debug symbols from Prisma engine binaries to reduce binary size significantly
RUN find /app/node_modules -name "libquery_engine-linux-musl.so.node" -exec strip {} \; 2>/dev/null || true && \
    find /app/node_modules -name "schema-engine-linux-musl" -exec strip {} \; 2>/dev/null || true

# Clean up unnecessary files inside node_modules (source maps, typings, readmes, tests) to save space
RUN find /app/node_modules -type f -name "*.map" -delete 2>/dev/null || true && \
    find /app/node_modules -type f -name "*.ts" -delete 2>/dev/null || true && \
    find /app/node_modules -type f -name "*.tsx" -delete 2>/dev/null || true && \
    find /app/node_modules -type f -name "*.md" -delete 2>/dev/null || true && \
    find /app/node_modules -type d -name "test" -exec rm -rf {} \; 2>/dev/null || true && \
    find /app/node_modules -type d -name "tests" -exec rm -rf {} \; 2>/dev/null || true && \
    find /app/node_modules -type d -name "__tests__" -exec rm -rf {} \; 2>/dev/null || true

# Base image for the target runner (runs on the target platform architecture, e.g. arm64 or amd64)
FROM mirror.gcr.io/library/node:22-alpine AS run-base
RUN apk add --no-cache libc6-compat openssl

# 3. Production image, copy all the files and run next
FROM run-base AS runner
RUN apk add --no-cache su-exec shadow
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Default user/group (overridden at runtime via PUID/PGID)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data/backups

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy all production node_modules from builder (includes Prisma CLI and its config dependencies)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

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
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

# Healthcheck to monitor app status (uses Alpine built-in wget)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:$(cat /tmp/jellytrack-port 2>/dev/null || echo 3000)/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
