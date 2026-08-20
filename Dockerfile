# Declare BUILDPLATFORM argument
ARG BUILDPLATFORM

# ── STAGE 1: Install dependencies & generate Prisma client ──
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl python3 build-base git ca-certificates binutils
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


# ── STAGE 2: Build Next.js application & assemble runtime ──
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat binutils openssl
RUN npm install -g pnpm@10.2.0

WORKDIR /app

# Copy main node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/.npmrc* ./
COPY --from=deps /app/prisma ./prisma

# Copy only source files needed for build
COPY src ./src
COPY public ./public
COPY messages ./messages
COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./
COPY prisma.config.ts ./
COPY docker-entrypoint.sh ./

# Build variables
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Build Next.js standalone package
RUN NEXTAUTH_SECRET=build-placeholder pnpm run build

# ── Clean standalone output: remove source maps, docs, tests, non-musl sharp/prisma prebuilts ──
RUN find /app/.next/standalone -type f \( -name "*.map" -o -name "*.d.ts" -o -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "LICENSE*" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true && \
    find /app/.next/standalone -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" -o -name ".github" \) -exec rm -rf {} + 2>/dev/null || true && \
    find /app/.next/standalone/node_modules -name "libquery_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/.next/standalone/node_modules -name "query_engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/.next/standalone/node_modules -name "*query_engine*linux-musl*" -exec strip {} \; 2>/dev/null || true && \
    find /app/.next/standalone/node_modules -name "*.node" -exec strip {} \; 2>/dev/null || true && \
    find /app/.next/standalone/node_modules/@img -mindepth 1 -maxdepth 1 ! -name "*linuxmusl*" ! -name "sharp" ! -name "colour" -exec rm -rf {} + 2>/dev/null || true

# ── Extract serverExternalPackages and Prisma CLI tools ──
RUN pnpm prune --prod && \
    mkdir -p /app/external-modules && \
    for pkg in node-cron geoip-country prisma @prisma dotenv; do \
      if [ -d "/app/node_modules/$pkg" ]; then \
        cp -r "/app/node_modules/$pkg" "/app/external-modules/$pkg"; \
      fi; \
    done && \
    find /app/external-modules -name "schema-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/external-modules -name "migration-engine-*" ! -name "*linux-musl*" -delete 2>/dev/null || true && \
    find /app/external-modules -name "*schema-engine*linux-musl*" -exec strip {} \; 2>/dev/null || true && \
    find /app/external-modules -type f \( -name "*.map" -o -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "LICENSE*" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true && \
    find /app/external-modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true

# ── Assemble single clean runtime directory with final permissions ──
RUN mkdir -p /app/runtime/.next /app/runtime/node_modules /app/runtime/.next/cache/images /app/runtime/.next/cache/fetch-cache && \
    cp -r /app/.next/standalone/* /app/runtime/ && \
    cp -r /app/.next/standalone/.next/* /app/runtime/.next/ && \
    cp -r /app/.next/static /app/runtime/.next/static && \
    cp -r /app/public /app/runtime/public && \
    cp -r /app/external-modules/* /app/runtime/node_modules/ && \
    cp -r /app/prisma /app/runtime/prisma && \
    cp /app/prisma.config.ts /app/runtime/prisma.config.ts && \
    cp /app/docker-entrypoint.sh /app/runtime/docker-entrypoint.sh && \
    sed -i 's/\r$//' /app/runtime/docker-entrypoint.sh && \
    chmod 755 /app/runtime/docker-entrypoint.sh && \
    chmod -R 777 /app/runtime/node_modules /app/runtime/.next/cache && \
    find /app/runtime -type f \( -name "*.map" -o -name "*.md" -o -name "LICENSE*" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true


# ── STAGE 3: Final lightweight & rock-solid single-layer runner image ──
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl && \
    mkdir -p /data/backups /data/logs /tmp/.cache && \
    chown -R node:node /data /tmp/.cache && \
    chmod -R 777 /data /tmp/.cache

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=UTC
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy entire pre-built runtime with exact ownership in ONE single layer
COPY --from=builder --chown=node:node /app/runtime /app

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/MaelMoreau21/JellyTrack"
LABEL org.opencontainers.image.description="JellyTrack — Dashboard analytique pour Jellyfin"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 3000

USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
