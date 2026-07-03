# Declare BUILDPLATFORM argument
ARG BUILDPLATFORM

# ── STAGE 1: Install dependencies & generate Prisma client ──
FROM --platform=$BUILDPLATFORM node:26-alpine AS deps
RUN apk add --no-cache libc6-compat openssl python3 build-base git ca-certificates

WORKDIR /app

# Copy lockfile and package configuration
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci --no-audit --progress=false

# Copy Prisma schema to generate the client
COPY prisma ./prisma

# Provide dummy variable so Prisma generate doesn't check for real DB connection
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma Client
RUN npx prisma generate


# ── STAGE 2: Build Next.js application & clean up assets ──
FROM --platform=$BUILDPLATFORM node:26-alpine AS builder
RUN apk add --no-cache libc6-compat binutils openssl

WORKDIR /app

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/prisma ./prisma

# Copy source code
COPY . .

# Build variables
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Build Next.js standalone package
RUN NEXTAUTH_SECRET=build-placeholder npm run build

# ── Clean up Prisma engines: keep only linux-musl (Alpine), remove all others ──
RUN find /app/node_modules/.prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/prisma -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/node_modules/prisma -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
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


# ── STAGE 3: Final lightweight runner image ──
FROM node:26-alpine AS runner
RUN apk add --no-cache libc6-compat openssl su-exec shadow

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Ensure runtime directories exist and are owned by the default node user (UID/GID 1000)
RUN mkdir -p /data/backups /app/.next/cache && \
    chown -R node:node /data/backups /app

# Copy public folder and static assets from builder
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Copy Next.js standalone server
COPY --from=builder --chown=node:node /app/.next/standalone ./

# Copy Prisma schema and config
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts

# Copy Prisma CLI and minimum dependencies required for runtime migrations
COPY --from=builder --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=node:node /app/node_modules/.bin ./node_modules/.bin

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

# Run as non-root user 'node'
USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
