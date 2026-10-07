# Build the SPA separately so the final image contains no Node runtime.
FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS frontend-build
WORKDIR /src
COPY v3/frontend/package.json v3/frontend/package-lock.json ./
RUN npm ci
COPY v3/frontend/ ./
RUN npm run build

# Build one static Go executable with the frontend embedded in it.
FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS server-build
WORKDIR /src
COPY v3/go.mod ./
COPY v3/go.sum ./
COPY v3/cmd ./cmd
COPY v3/internal ./internal
COPY --from=frontend-build /src/dist ./internal/web/dist
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -buildid=" -o /out/jellytrack ./cmd/jellytrack
RUN mkdir -p /tmp/data

# The runtime image is non-root and contains only the executable and CA roots.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:e2e927ec666bae08560abb3c55d0659eceabb657f56b6782ab500a9fc7f555e3
WORKDIR /
COPY --from=server-build --chown=65532:65532 /tmp/data /data
COPY --from=server-build --chown=65532:65532 /out/jellytrack /jellytrack
ENV PORT=3000 DATABASE_DRIVER=sqlite DATABASE_PATH=/data/jellytrack.db GOMEMLIMIT=32MiB
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["/jellytrack", "healthcheck"]
ENTRYPOINT ["/jellytrack"]
