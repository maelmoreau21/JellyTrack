FROM node:20-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Rebuild the source code only when needed
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .



# Environment variables for build time
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client
RUN npx prisma generate

# Provide dummy variables so Next.js build doesn't crash trying to connect to a real DB
# Use non-sensitive build placeholders and avoid secret-like ARG names
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}

# Build Next.js project
RUN NEXTAUTH_SECRET=build-placeholder npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
RUN apk add --no-cache openssl dos2unix su-exec shadow
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install -g prisma@5

# Default user/group (overridden at runtime via PUID/PGID)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create backup directory
RUN mkdir -p /data/backups

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# We need the Prisma schema to execute migrate deploy
COPY --from=builder /app/prisma ./prisma
# Copy prisma related dependencies to be able to run migrations in entrypoint
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json

# Force copy geoip-country to standalone
COPY --from=builder /app/node_modules/geoip-country ./node_modules/geoip-country

# Force copy node-cron to standalone (serverExternalPackages = not bundled by Next.js)
COPY --from=builder /app/node_modules/node-cron ./node_modules/node-cron

# OCI labels — links the GHCR package to the GitHub repo + enables automatic visibility inheritance
LABEL org.opencontainers.image.source="https://github.com/MaelMoreau21/JellyTulli"
LABEL org.opencontainers.image.description="JellyTulli — Dashboard analytique pour Jellyfin"
LABEL org.opencontainers.image.licenses="MIT"


# Expose port and configure entrypoint
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the entrypoint script (runs as root initially, then drops to PUID/PGID)
COPY docker-entrypoint.sh ./
RUN dos2unix ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
