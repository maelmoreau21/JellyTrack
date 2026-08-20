# Declare BUILDPLATFORM argument
ARG BUILDPLATFORM

# ── STAGE 1: Install dependencies & generate Prisma client ──
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl python3 build-base git ca-certificates
RUN npm install -g pnpm@10.2.0

WORKDIR /app

# Copy lockfile, package configuration and npmrc
COPY package.json pnpm-lock.yaml .npmrc* ./

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy Prisma schema to generate the client
COPY prisma ./prisma

# Provide dummy variable so Prisma generate doesn't check for real DB connection
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma Client
RUN pnpm exec prisma generate

# Install an isolated minimal Prisma CLI for database migrations at startup
WORKDIR /app/prisma-cli
COPY prisma ./prisma
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x,linux-musl-arm64-openssl-3.0.x"
RUN pnpm init && pnpm add --save-prod prisma@7.8.0 @prisma/client@7.8.0 dotenv@17.4.2 && pnpm exec prisma generate


# ── STAGE 2: Build Next.js application & clean up assets ──
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat binutils openssl
RUN npm install -g pnpm@10.2.0

WORKDIR /app

# Copy main node_modules and isolated prisma-cli from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/.npmrc* ./
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/prisma-cli ./prisma-cli

# Copy source code
COPY . .

# Build variables
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Build Next.js standalone package
RUN NEXTAUTH_SECRET=build-placeholder pnpm run build

# ── Aggressively clean prisma-cli: keep only linux-musl engines, strip binaries, remove junk ──
RUN find /app/prisma-cli/node_modules -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -name "schema-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -name "migration-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -name "*query_engine*linux-musl*" -exec strip {} \; 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -name "*schema-engine*linux-musl*" -exec strip {} \; 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -type f \( -name "*.map" -o -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "LICENSE*" -o -name "CHANGELOG*" -o -name "*.d.ts" \) -delete 2>/dev/null || true && \
    find /app/prisma-cli/node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true

# ── Clean standalone output: remove source maps and unnecessary files ──
RUN find /app/.next/standalone -type f -name "*.map" -delete 2>/dev/null || true && \
    find /app/.next/standalone/node_modules -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "LICENSE*" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true && \
    find /app/.next/standalone/node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true

# ── Strip Prisma engine binaries inside standalone node_modules ──
RUN find /app/.next/standalone/node_modules/.prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/.next/standalone/node_modules/@prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/.next/standalone/node_modules/.prisma -name "*linux-musl*" -exec strip {} \; 2>/dev/null || true && \
    find /app/.next/standalone/node_modules/@prisma -name "*linux-musl*" -exec strip {} \; 2>/dev/null || true

# ── Copy serverExternalPackages that standalone doesn't bundle ──
# Next.js standalone doesn't include packages listed in serverExternalPackages
# We need to selectively copy only those packages (node-cron, geoip-country) after pruning
RUN pnpm prune --prod && \
    mkdir -p /app/external-modules && \
    for pkg in node-cron geoip-country; do \
      if [ -d "/app/node_modules/$pkg" ]; then \
        cp -r "/app/node_modules/$pkg" "/app/external-modules/$pkg"; \
      fi; \
    done


# ── STAGE 3: Final lightweight & rock-solid runner image ──
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=UTC

# Ensure runtime directories exist and are owned by the default node user (UID/GID 1000)
RUN mkdir -p /data/backups /data/logs /app/.next/cache && \
    chown -R node:node /data /app && \
    chmod -R 775 /app/.next/cache /data

# Copy public folder and static assets from builder
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Copy standalone server (includes its own node_modules with bundled deps)
COPY --from=builder --chown=node:node /app/.next/standalone ./

# Copy serverExternalPackages that standalone doesn't include
COPY --from=builder --chown=node:node /app/external-modules/ ./node_modules/

# Copy Prisma schema, config, and lightweight migration CLI
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/prisma-cli ./prisma-cli

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/MaelMoreau21/JellyTrack"
LABEL org.opencontainers.image.description="JellyTrack — Dashboard analytique pour Jellyfin"
LABEL org.opencontainers.image.licenses="MIT"

# Expose port and configure environment
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the entrypoint script
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh && chown node:node ./docker-entrypoint.sh

# Ensure runtime directories exist and have proper permissions for the node user
RUN mkdir -p /app/.next/cache/images /app/.next/cache/fetch-cache /data/backups /data/logs && \
    chown -R node:node /app /data && \
    chmod -R 777 /app/.next/cache /data

# Run as non-root user 'node'
USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
