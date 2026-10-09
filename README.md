<p align="center">
  <img src="public/logo.svg" width="128" height="128" alt="JellyTrack Logo">
</p>

<h1 align="center">JellyTrack</h1>

<p align="center">
  <a href="https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml"><img src="https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml/badge.svg" alt="Docker Build"></a>
  <a href="https://ghcr.io/maelmoreau21/JellyTrack"><img src="https://img.shields.io/badge/GHCR-ghcr.io%2Fmaelmoreau21%2FJellyTrack-blue?logo=github" alt="GHCR Image"></a>
</p>

<p align="center">
  <strong>High-performance observability and analytics dashboard for Jellyfin: live sessions, unified history, downloads, and fine playback telemetry.</strong>
</p>

## Preview

### 📊 Main Dashboard
![JellyTrack Dashboard](public/screenshots/dashboard.png)

### 📈 Detailed Analytics
![JellyTrack Analytics](public/screenshots/analytics.png)

### 👥 Users & Activity
![JellyTrack Users](public/screenshots/users.png)

### 📜 Playback History & Telemetry
![JellyTrack Logs](public/screenshots/logs.png)

### ⚙️ Settings
![JellyTrack Settings](public/screenshots/settings.png)

---

> [!CAUTION]
> JellyTrack requires the companion Jellyfin plugin. Without it, JellyTrack cannot collect playback, download, seek, language, or telemetry events.
>
> Plugin repository: [Jellyfin.Plugin.JellyTrack](https://github.com/maelmoreau21/Jellyfin.Plugin.JellyTrack)

## Architecture

JellyTrack is built as a **100% autonomous Go application**:
- **Single Self-Contained Binary**: All web assets, styles, scripts, graphics, and SQL migrations are embedded directly via Go `embed.FS`.
- **Zero Runtime Dependencies**: No Node.js runtime, no package managers, and no external tool chains required at runtime.
- **Dual Database Support**: Native PostgreSQL (`pgx`) and standalone embedded SQLite (`modernc.org/sqlite`) with automatic schema migrations.
- **Lightweight Go Runtime**: A standalone Go binary serves the bundled frontend. Memory and image size depend on the platform and workload; the recovery audit measured 75.27 MiB working set on Windows with a small synthetic dataset. Linux/Docker measurements remain pending; see [the recovery report](docs/FRONTEND_RECOVERY_REPORT.md).

```text
JellyTrack/
├── cmd/
│   └── jellytrack/            # Production CLI entry point
├── internal/
│   ├── api/                   # REST API routes and business handlers
│   ├── auth/                  # Local auth & OIDC SSO sessions (PKCE)
│   ├── backup/                # Backup engine (SQL dumps & restoration)
│   ├── cleanup/               # Data retention & scheduled cleanup
│   ├── config/                # Environment configuration loader
│   ├── database/              # Dual database drivers & migration runner
│   ├── history/               # History aggregation & playback consolidation
│   ├── jellyfin/              # Jellyfin client & server synchronizer
│   ├── logging/               # System event logging & exports
│   ├── media/                 # Media library queries & metadata
│   ├── models/                # Shared domain types & structs
│   ├── plugin/                # Plugin webhook ingestion & event processing
│   ├── requestip/             # Trusted proxy & client IP extraction
│   ├── scheduler/             # Periodic background task worker
│   ├── security/              # SSRF protection, URL safety & audit logs
│   ├── settings/              # Settings & multi-server registry
│   ├── stats/                 # Aggregated telemetry & dashboard metrics
│   ├── telemetry/             # Active streams & fine telemetry
│   └── users/                 # User management & duplicate merging
├── web/
│   ├── static.go              # HTTP file server and SPA router (embed.FS)
│   └── dist/                  # Native HTML5, CSS, and Vanilla JS assets
├── migrations/                # Embedded SQL migration scripts (PostgreSQL & SQLite)
├── Dockerfile                 # Multi-stage lightweight Alpine build
├── docker-compose.yml         # Ready-to-use Compose configuration
└── main.go                    # Application root entry point
```

## What JellyTrack Tracks

- **Live sessions**: user, device, client, direct play / transcode, video codec (including AV1 / FFmpeg 8.1), bitrate, IP and GeoIP.
- **Multi-version & Cuts support**: identifies and badges specific editions (Extended cuts, Theatrical cuts, Black & White versions) and aggregates storage footprint across all media sources.
- **Resilient history consolidation**: pauses, buffers, and disconnections are automatically merged into clean sessions instead of fragmented clutter.
- **Playback history**: completed, partial, and abandoned media using cumulative user + media history.
- **Downloads**: a downloaded media item is counted as one complete view and full watched duration.
- **Fine telemetry**: pause/resume, seek ranges, replay ranges, playback speed changes, audio language changes, and subtitle language changes.
- **Behavior insights**: skipped passages are shown as `from -> to` ranges, and language periods are derived from initial language plus later changes.
- **Jellyfin 12+ native support**: native Books, AudioBooks & Comics libraries, server version detection, and automatic deleted-user cleanup.

## Docker Installation

The canonical deployment method is Docker Compose.

1. Copy the example environment:

```bash
cp .env.example .env
```

2. Edit `.env` and configure your credentials and Jellyfin server URL.

3. Start JellyTrack:

```bash
docker compose up -d
```

To build and run locally:

```bash
docker compose build
docker compose up -d
```

JellyTrack runs on `http://localhost:3000` by default.

## Jellyfin Plugin Configuration

1. In Jellyfin, navigate to **Dashboard > Plugins > Repositories**.
2. Add this repository URL:

```text
https://raw.githubusercontent.com/maelmoreau21/Jellyfin.Plugin.JellyTrack/main/manifest.json
```

3. Install the **JellyTrack** plugin and restart Jellyfin.
4. In JellyTrack, open **Settings > Jellyfin Connection**, generate a plugin key, then configure the endpoint and key in the Jellyfin plugin settings.

For Jellyfin 12.x / 12.1+, configure `JELLYFIN_API_KEY` in `.env`; JellyTrack uses the native `Authorization: MediaBrowser Token="..."` header.

## Plugin Event Contract

The plugin posts JSON events to:

```text
POST /api/plugin/events
```

The canonical download event format:

```json
{
  "event": "MediaDownloaded",
  "eventId": "stable-plugin-event-id",
  "observedAt": "2026-05-28T18:00:00.000Z",
  "user": { "id": "jellyfin-user-id", "username": "Mael" },
  "media": {
    "id": "jellyfin-item-id",
    "title": "Movie title",
    "type": "Movie",
    "durationMs": 7200000,
    "libraryName": "Films"
  }
}
```

Accepted download aliases are `ItemDownloaded` and `DownloadCompleted`. JellyTrack stores downloads with `eventSource = "download"`, `playMethod = "Download"`, full `durationWatched`, and a `TelemetryEvent` of type `download`. `sourceEventId` deduplicates plugin retries per server.

## Authentication & SSO

JellyTrack includes hardened **OpenID Connect (OIDC)** Single Sign-On (SSO) with **PKCE (Proof Key for Code Exchange — RFC 7636)** supporting **Authentik**, **Keycloak**, **Authelia**, etc.

### SSO Environment Variables

Configure the following variables in `.env`:

```bash
# Enable SSO OIDC
OIDC_ENABLED=true
OIDC_URL=https://authentik.example.com/application/o/jellytrack/
OIDC_CLIENT_ID=jellytrack
OIDC_CLIENT_SECRET=your_oidc_client_secret

# Group mapping (LDAP/SSO directory)
OIDC_USER_GROUP=jellyfin-users
OIDC_ADMIN_GROUP=jellyfin-admins

# Auto-redirect to IdP when visiting login page
OIDC_AUTO_REDIRECT=true

# Emergency Local Administrator Access (optional)
JELLYTRACK_LOCAL_ADMIN_USER=admin
JELLYTRACK_LOCAL_ADMIN_PASSWORD=your_emergency_strong_password
```

### Identity Provider (IdP) Setup

1. **Redirect URI**: Register `https://<your-jellytrack-domain>/api/auth/oidc/callback` in your IdP client.
2. **Scopes**: Ensure `openid`, `profile`, `email`, and `groups` are requested.
3. **PKCE**: JellyTrack automatically enforces SHA-256 PKCE (`code_challenge_method=S256`).
4. **User Reconciliation**: JellyTrack matches the canonical username (`preferred_username` or `username` claim) to the Jellyfin user.

## Local Development (Go)

Prerequisites: Go 1.26 or later.

```bash
# Run unit and integration tests
go test ./...

# Run static analysis
go vet ./...

# Build binary
go build -o jellytrack .

# Run application locally (defaults to SQLite if no POSTGRES_PASSWORD set)
go run .
```

To run against PostgreSQL:

```bash
DATABASE_DRIVER=postgres DATABASE_URL="postgres://JellyTrack:password@localhost:5432/JellyTrack?sslmode=disable" go run .
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
