<p align="center">
  <img src="web/dist/assets/logo.svg" width="108" alt="JellyTrack logo">
</p>

<h1 align="center">JellyTrack</h1>

<p align="center">
  <strong>Self-hosted Jellyfin analytics, live monitoring and detailed playback telemetry — powered by Go.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://go.dev/"><img alt="Go" src="https://img.shields.io/badge/backend-Go-00ADD8?logo=go&logoColor=white"></a>
  <a href="https://github.com/maelmoreau21/JellyTrack/tree/codex/frontend-recovery"><img alt="Go migration in progress" src="https://img.shields.io/badge/status-Go%20migration%20in%20progress-orange"></a>
</p>

> [!IMPORTANT]
> **Development branch:** This README describes the Go implementation on [`codex/frontend-recovery`](https://github.com/maelmoreau21/JellyTrack/tree/codex/frontend-recovery). The default `main` branch still contains the earlier application. The `VERSION` file declares `3.0.0`, but this does **not** mean that JellyTrack Go 3.0 has been released or validated for production. Historical UI parity and end-to-end integration testing are still being completed.

## Screenshots

These are screenshots of the **Go frontend**, taken with synthetic data during UI parity testing. They are not screenshots of a live production Jellyfin deployment. Select an image to see it at full resolution.

### Dashboard

[![JellyTrack Go dashboard](docs/parity-restoration/captures/go-final-dashboard-desktop-dark.png)](docs/parity-restoration/captures/go-final-dashboard-desktop-dark.png)

### Users and activity

[![JellyTrack Go users](docs/parity-restoration/captures/go-final-users-desktop-dark.png)](docs/parity-restoration/captures/go-final-users-desktop-dark.png)

### Media library

[![JellyTrack Go media library](docs/parity-restoration/captures/go-final-media-all-desktop-dark.png)](docs/parity-restoration/captures/go-final-media-all-desktop-dark.png)

### Playback history

[![JellyTrack Go playback history](docs/parity-restoration/captures/go-final-logs-desktop-dark.png)](docs/parity-restoration/captures/go-final-logs-desktop-dark.png)

### Jellyfin connection settings

[![JellyTrack Go Jellyfin settings](docs/parity-restoration/captures/go-final-settings-jellyfin-desktop-dark.png)](docs/parity-restoration/captures/go-final-settings-jellyfin-desktop-dark.png)

<details>
<summary>More screenshots — mobile, light theme, user profiles and system health</summary>

**Mobile dashboard**

![Mobile dashboard](docs/parity-restoration/captures/go-final-dashboard-mobile-dark.png)

**Light theme**

![Light dashboard](docs/parity-restoration/captures/go-final-dashboard-desktop-light.png)

**User profile**

![User profile](docs/parity-restoration/captures/go-final-users-alice-desktop-dark.png)

**Recently added**

![Recently added](docs/parity-restoration/captures/go-final-recent-desktop-dark.png)

**System health**

![System health](docs/parity-restoration/captures/go-final-admin-health-desktop-dark.png)

</details>

## Features

| Area | Capabilities |
| --- | --- |
| **Live sessions** | Follow active Jellyfin playback, devices, clients, direct play and transcoding, and supported administrative controls. |
| **Playback history** | Search, filter, inspect and export playback sessions, with event consolidation and detailed session views. |
| **Analytics** | Viewing activity, trends, popular content, time-of-day patterns, client usage, network and transcoding insights. |
| **Media library** | Browse and search movies, series, music and other supported media; explore media details and collections. |
| **Users** | User activity, individual profiles, statistics and Wrapped views where available. |
| **Advanced telemetry** | Plugin-assisted pause/resume, seek, playback progress and audio/subtitle changes when provided by the Jellyfin client and plugin. |
| **Multiple servers** | Connect and analyze multiple Jellyfin servers where supported by the deployment configuration. |
| **Administration** | System health, data cleanup, scheduling, backup and configuration views. |
| **Authentication** | Local administrator access and optional OpenID Connect (OIDC) SSO, including providers such as Authentik. |
| **Interface** | Responsive layout, light/dark themes and bundled translations. |

> [!NOTE]
> Features and data availability depend on the Jellyfin version, plugin compatibility and actual events received. The [parity audit](docs/FINAL_PARITY_AUDIT.md) documents what has been checked, what remains different and which tests were run using synthetic data.

## How it works

```text
Jellyfin server
   |
   | Jellyfin API + JellyTrack plugin events
   v
JellyTrack (Go application)
   |-- HTTP API, authentication and background tasks
   |-- Embedded HTML / CSS / vanilla JavaScript UI
   |-- SQLite OR PostgreSQL
   `-- Browser on port 3000 (default)
```

JellyTrack embeds its frontend and SQL migrations in the Go application, so **Node.js, Next.js, React and npm are not required at runtime**.

| Component | Implementation |
| --- | --- |
| Backend | Go (`internal/`) |
| Frontend | HTML, CSS and vanilla JavaScript (`web/dist/`) |
| Charts | Bundled Chart.js 4.5.1 |
| Embedded database | SQLite through `modernc.org/sqlite` (no CGO required) |
| External database | PostgreSQL through `pgx` |
| Database migrations | SQL in `migrations/sqlite/` and `migrations/postgres/` |
| Containers | Multi-stage Docker builds, with Alpine, distroless and scratch Dockerfiles |

JellyTrack supports **SQLite and PostgreSQL in the same application**. You choose the database in the deployment configuration; there is no need to remove one driver to use the other.

## Requirements

- A Jellyfin server accessible from the JellyTrack container or host.
- A Jellyfin API key.
- Docker with the Compose plugin, **or** a compatible Go toolchain for running from source.
- SQLite **or** a reachable PostgreSQL database, depending on the selected deployment.
- The [JellyTrack Jellyfin plugin](https://github.com/maelmoreau21/jellyfin-plugin-JellyTrack) for the additional playback and telemetry events it supports.

## Installation — Docker Compose

### 1. Get the Go development branch

```bash
git clone --branch codex/frontend-recovery --single-branch https://github.com/maelmoreau21/JellyTrack.git
cd JellyTrack
cp .env.example .env
```

Edit `.env` before starting. Replace all `CHANGE_ME_*` credentials, generate a strong `JELLYTRACK_SECRET`, and set `JELLYFIN_URL`, `JELLYFIN_API_KEY` and `JELLYTRACK_URL` for your environment. `http://jellyfin:8096` works only if that hostname resolves from the JellyTrack container; otherwise use an address reachable on your network.

**Build from this branch with `--build`.** The published GHCR `latest` tag does not necessarily contain this Go development branch.

### Option A — SQLite (no database server)

```bash
docker compose -f docker-compose.sqlite.yml up -d --build
```

The SQLite database is stored at `/data/jellytrack.db` by default, on a persistent Docker volume. Set `DATABASE_DRIVER=sqlite` if you run the Go binary directly. No PostgreSQL service or PostgreSQL password is required for this Compose variant.

### Option B — External PostgreSQL (including PostgreSQL 18)

If you **already run PostgreSQL externally**, use the dedicated Compose file. It does not start another PostgreSQL container.

Set the following in `.env`, using your actual PostgreSQL host, user and database (example values only):

```dotenv
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://jellytrack:YOUR_PASSWORD@postgres.example.lan:5432/jellytrack?sslmode=require
```

Your database server must accept connections from JellyTrack. Choose the `sslmode` supported by your PostgreSQL environment; do not use `sslmode=disable` over an untrusted network. URL-encode special characters in credentials used inside `DATABASE_URL`.

```bash
docker compose -f docker-compose.postgres-external.yml up -d --build
```

**Already on PostgreSQL 18?** No PostgreSQL *major-version* upgrade is needed. JellyTrack can still apply its own SQL schema migrations when the application is upgraded; back up the database first.

### Option C — Bundled PostgreSQL 18

The default Compose file includes its own PostgreSQL 18 container. Set a strong `POSTGRES_PASSWORD` in `.env`, then run:

```bash
docker compose up -d --build
```

This configuration persists PostgreSQL data under `/var/lib/postgresql`, following the PostgreSQL 18 image layout. **Do not change the image version or the storage layout of an existing database volume without a backup and an appropriate upgrade procedure.**

### 2. Check startup

The application listens on port `3000` by default (configurable using `APP_PORT` and `PORT`).

```bash
# Choose the same Compose file you used to start the application:
docker compose -f docker-compose.postgres-external.yml logs -f JellyTrack
```

For SQLite, replace the file with `docker-compose.sqlite.yml`; for bundled PostgreSQL, use `docker compose logs -f JellyTrack`.

Open `http://localhost:3000`, or your configured address and port. When deploying behind a reverse proxy, configure `JELLYTRACK_URL` with the public HTTPS address.

## Install the JellyTrack plugin in Jellyfin

The companion plugin supplies more detailed playback, session and library events.

1. Open **Jellyfin Dashboard → Plugins → Repositories**.
2. Add a community repository named `JellyTrack` with this URL:

   ```text
   https://raw.githubusercontent.com/maelmoreau21/jellyfin-plugin-JellyTrack/main/manifest.json
   ```
3. In the plugin catalog, install the package compatible with your Jellyfin version.
4. Restart Jellyfin, open the plugin settings, enter your **JellyTrack server URL** and the **plugin API key generated by JellyTrack**, and enable the plugin.
5. Use **Test connection** in the plugin settings.

Plugin source, supported packages and troubleshooting: **[jellyfin-plugin-JellyTrack](https://github.com/maelmoreau21/jellyfin-plugin-JellyTrack)**.

The plugin sends events to `POST /api/plugin/events`. Keep the authentication key private and make sure Jellyfin can reach the JellyTrack URL **from the Jellyfin server**, not just from your browser.

## Environment variables

See [`.env.example`](.env.example) for the complete list and current defaults.

| Variable | Purpose |
| --- | --- |
| `JELLYTRACK_URL` | Public URL for JellyTrack, used by redirects/integrations as applicable. |
| `JELLYTRACK_SECRET` | Secret used by the application; use a long random value. |
| `JELLYFIN_URL` / `JELLYFIN_API_KEY` | Jellyfin server URL and API key. |
| `DATABASE_DRIVER` | `sqlite` or `postgres`. |
| `DATABASE_PATH` | SQLite file path, normally `/data/jellytrack.db`. |
| `DATABASE_URL` | PostgreSQL connection string, useful for an external database. |
| `POSTGRES_*` / `DB_*` | Alternative PostgreSQL connection parameters supported by the application. |
| `JELLYFIN_WEBHOOK_SECRET` / `PLUGIN_KEY_PEPPER` | Secrets used by the event/plugin integration. |
| `OIDC_ENABLED`, `OIDC_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Optional OIDC single sign-on. |
| `OIDC_USER_GROUP`, `OIDC_ADMIN_GROUP` | Optional authorization/group mapping. |
| `JELLYTRACK_LOCAL_ADMIN_USER`, `JELLYTRACK_LOCAL_ADMIN_PASSWORD` | Optional local administrator account. |
| `PORT`, `APP_PORT`, `TZ` | Application port, published port and timezone. |
| `PUID`, `PGID` | Container user/group override in Compose. Ensure persistent volumes are writable by that identity. |

If using OIDC, configure the provider's issuer URL, client, scopes and groups, and register the callback URL:

```text
https://your-jellytrack-domain.example/api/auth/oidc/callback
```

Use HTTPS for any remotely exposed instance. Never commit `.env`, credentials, session cookies or database dumps.

## Docker image size and security

The project currently provides three build options:

```bash
# Default Alpine image
docker build -f Dockerfile -t jellytrack:alpine .

# Distroless variant
docker build -f Dockerfile.distroless -t jellytrack:distroless .

# Minimal scratch variant
docker build -f Dockerfile.scratch -t jellytrack:scratch .
```

These are **alternatives**, not three components to run together. The Go binary embeds the frontend and database drivers. The final image size depends primarily on the compiled binary and its embedded assets; a minimal runtime base alone does not guarantee a small final image.

Check the real footprint on your own platform:

```bash
docker image ls jellytrack
docker image inspect jellytrack:alpine --format '{{.Size}} bytes'
docker history jellytrack:alpine
```

Before choosing distroless or scratch for production, validate the healthcheck, HTTPS certificates, timezones, non-root permissions, database access and any required volumes. The Docker build context excludes `docs/`, including historical UI test screenshots.

## Development

The current Go development branch declares **Go 1.27.2** in `go.mod`.

```bash
go mod download
go mod verify
go test ./...
go vet ./...
go build ./...
```

Run locally with SQLite (POSIX shell):

```bash
DATABASE_DRIVER=sqlite DATABASE_PATH=./data/jellytrack.db go run .
```

For PowerShell, assign the environment variables with `$env:DATABASE_DRIVER` and `$env:DATABASE_PATH` before running `go run .`.

- [Frontend architecture](docs/FRONTEND_ARCHITECTURE.md)
- [UI parity audit and validation limitations](docs/FINAL_PARITY_AUDIT.md)
- [Plugin repository](https://github.com/maelmoreau21/jellyfin-plugin-JellyTrack)

## Login policy: Jellyfin local accounts and LDAP / Authentik

The backend enforces both methods independently of the login buttons:

- `JELLYFIN_AUTH_ENABLED=true` (default) allows classic Jellyfin login alongside SSO. Set it to `false` to disable classic login; emergency local administrator access remains available.
- `LDAP_SSO_ONLY=true` (default) requires LDAP accounts to use SSO and native Jellyfin accounts to use their password. Set it to `false` to allow both supported providers through either method; verified Jellyfin identity is still mandatory.
- The configured JellyTrack local administrator retains password recovery access.
- Unknown providers, disabled accounts, missing metadata, and metadata outages are denied. Disabling OIDC does not enable LDAP passwords. Pre-policy sessions require a fresh login.

Jellyfin must expose `Policy.AuthenticationProviderId` through its administrative API. Only the exact native provider `Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider` and LDAP provider `Jellyfin.Plugin.LDAP_Auth.LdapAuthenticationProviderPlugin` are supported. Jellyfin versions/plugins using other provider formats are refused until explicitly supported. Password authentication checks metadata before sending the password and again after authentication. A denial on the primary server cannot fall through to another server.

Configure each server's administrative Jellyfin API key in Settings / Jellyfin or `JELLYFIN_API_KEY` for the primary environment server. Register the server in JellyTrack before using SSO. LDAP users must already exist in Jellyfin.

SSO configuration is exclusively managed through environment variables. Legacy saved SSO settings are ignored and preserved; the former Settings / SSO page is removed and its write API returns 410. Supported variables: `OIDC_ENABLED`, `OIDC_ISSUER` (aliases, in order: `OIDC_URL`, `AUTHENTIK_URL`, `JELLYTRACK_AUTHENTIK_URL`), `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_USER_GROUP`, `OIDC_ADMIN_GROUP`, and `OIDC_AUTO_REDIRECT` (alias `OIDC_AUTO_LOGIN`). Use `OIDC_AUTO_REDIRECT=false` to present both login methods without automatically redirecting. Restart/recreate the application after changing its environment.

For mixed native Jellyfin / LDAP accounts:

```dotenv
OIDC_ENABLED=true
JELLYFIN_AUTH_ENABLED=true
LDAP_SSO_ONLY=true
OIDC_AUTO_REDIRECT=false
OIDC_URL=https://auth.example.com/application/o/jellytrack/
OIDC_CLIENT_ID=jellytrack
OIDC_CLIENT_SECRET=REPLACE_WITH_YOUR_SECRET
OIDC_USER_GROUP=
OIDC_ADMIN_GROUP=
```

With both groups empty, the verified Jellyfin `Policy.IsAdministrator` determines the SSO role. When either group is configured, OIDC token groups control access and roles: being a Jellyfin administrator does not bypass that explicit allowlist. Group names must match the groups actually emitted by the identity provider. Classic Jellyfin login uses Jellyfin permissions directly.

Authentik must issue an RS256-signed ID token containing the stable `sub` and two administrator-controlled claims:

- `jellyfin_server_id`: JellyTrack's internal server ID (`Server.id`, visible in the administrator server API), **not** Jellyfin's server ID.
- `jellyfin_user_id`: the actual Jellyfin user UUID for that LDAP account.

No username or email matching is used for SSO linkage. Do not let users set these claims through editable profiles, enrollment inputs, or untrusted upstream attributes. One safe mapping is an administrator-maintained dictionary keyed by the immutable Authentik user primary key, with values verified from Jellyfin:

```python
# Example: replace every identifier with the real administrator-verified value.
links = {
    "42": {
        "jellyfin_server_id": "REPLACE_WITH_JELLYTRACK_SERVER_ID",
        "jellyfin_user_id": "REPLACE_WITH_JELLYFIN_LDAP_USER_UUID",
    },
}
return links.get(str(request.user.pk), {})
```

Add this OAuth2/OIDC scope mapping to the Authentik provider with scope `profile` (already requested by JellyTrack), and include the claims in the ID token. Keep existing profile/group mappings. Unmapped identities are denied. See the official [Authentik property-mapping guide](https://docs.goauthentik.io/add-secure-apps/providers/property-mappings/) and [OIDC provider guide](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/).

The verified issuer, subject, method, server ID and Jellyfin user ID are retained in the session. Existing sessions do not recheck subsequent Jellyfin account/provider changes on every request: revoke all sessions in the security settings when changing account ownership, disabling accounts, or changing IdP mappings.

Local administrator recovery requires a strong `JELLYTRACK_LOCAL_ADMIN_PASSWORD`, `JELLYTRACK_LOCAL_ADMIN_USER`, and a random session secret of at least 32 characters in `JELLYTRACK_SECRET`. Use HTTPS. Failed credentials for the configured recovery account cannot fall through to Jellyfin.

## License

JellyTrack is licensed under the [MIT License](LICENSE).
