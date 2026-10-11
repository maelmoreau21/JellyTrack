# ── STAGE 1: Build static Go executable ──
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS builder

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /src

# Download Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy the entire Go source tree (including web/dist and migrations)
COPY . .

# Target architecture provided by Docker Buildx
ARG TARGETOS
ARG TARGETARCH

# Build static binary with optimizations
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath -ldflags="-s -w -buildid=" -o /out/jellytrack ./cmd/jellytrack


# ── STAGE 2: Minimal non-root runner image ──
FROM alpine:3.24 AS runner

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 1000 jellytrack \
    && adduser -u 1000 -G jellytrack -s /bin/sh -D jellytrack \
    && mkdir -p /data/backups /data/logs /tmp \
    && chown -R jellytrack:jellytrack /data \
    && chmod 770 /data /data/backups /data/logs \
    && chmod 1777 /tmp

WORKDIR /app

# Copy executable
COPY --from=builder /out/jellytrack /app/jellytrack

ENV PORT=3000 \
    DATABASE_PATH=/data/jellytrack.db \
    BACKUP_DIR=/data/backups \
    LOG_DIR=/data/logs \
    TZ=UTC

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/maelmoreau21/JellyTrack" \
      org.opencontainers.image.description="JellyTrack — Observability & Analytics for Jellyfin (100% Go)" \
      org.opencontainers.image.licenses="MIT"

USER 1000:1000

EXPOSE 3000

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/app/jellytrack", "healthcheck"]

ENTRYPOINT ["/app/jellytrack"]
