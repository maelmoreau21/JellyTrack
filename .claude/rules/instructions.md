---
description: "Instructions and memory for AI agents - JellyTrack"
paths:
  - "."
  - "cmd/**/*.go"
  - "internal/**/*.go"
  - "web/**/*"
---

# JellyTrack - Instructions For AI Agents

Read this document before changing the project.

- The Jellyfin companion plugin is required. JellyTrack does not collect useful data without it.
- Docker Compose is the canonical install mode.
- The project is 100% Go native. No Node.js, npm, pnpm, or external frontend build tools are used.
- Do not commit, push, create branches, or merge without an explicit user request.
- `.env.example` contains placeholders only. Never add real secrets.

## Canonical Stack

- Language: Go 1.26+
- Server: Standard library `net/http` with `embed.FS`
- Frontend: Embedded SPA in `web/` (HTML5, Vanilla CSS, Vanilla JS, Chart.js)
- Database: Dual driver support - PostgreSQL (`jackc/pgx/v5`) and SQLite (`modernc.org/sqlite`)
- Schema Migrations: Embedded SQL scripts in `migrations/`
- Auth: Custom session management, local admin bcrypt authentication, and OIDC Single Sign-On with PKCE
- Task Scheduler: Internal Go background runner (`internal/scheduler`)

## Plugin Event Rules

Source of truth: `internal/plugin/events.go`.

- Canonical download event: `MediaDownloaded`.
- Accepted download aliases: `ItemDownloaded`, `DownloadCompleted`.
- Downloads create closed `PlaybackHistory` rows with `eventSource = "download"`, `playMethod = "Download"`, full `durationWatched`, and a `TelemetryEvent` with `eventType = "download"`.
- `PlaybackHistory.sourceEventId` deduplicates plugin retries per server.
- Downloads always count as complete views unless an excluded library filter rejects them.
- Plugin events must respect excluded libraries and reject malformed required user/media payloads.

## Quality Gate

Before finalization when code changed:
1. Run `go test ./...`
2. Run `go vet ./...`
3. Run `go build ./...`
