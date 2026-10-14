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
- Go is the application runtime. Node/npm are build and QA dependencies for the embedded SvelteKit frontend.
- Do not commit, push, create branches, or merge without an explicit user request.
- `.env.example` contains placeholders only. Never add real secrets.

## Frontend source and delivery

The user authorized a SvelteKit 3 / Svelte 5 / TypeScript migration on
`codex/frontend-sveltekit`. `frontend/README.md` and `frontend/DEV_STATE.md`
describe its scope and evidence. `frontend` owns the sources; `npm run build`
produces `frontend/build` and installs `web/svelte`, which Go embeds. All three
Dockerfiles build this frontend before Go. `web/dist` is a historical QA reference,
not a delivery input. Some pages retain their JavaScript controllers as compiled
modules; do not claim every template is native Svelte. Preserve API contracts,
permissions, multi-server identity and data. Use the compatible stable versions
locked in `frontend/package-lock.json`; do not force incompatible peer versions.

## Canonical Stack

- Language: Go 1.26+
- Server: Standard library `net/http` with `embed.FS`
- Frontend: SvelteKit 3 / Svelte 5 / TypeScript, compiled page controllers, historical CSS and Chart.js; Go embeds `web/svelte`.
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
