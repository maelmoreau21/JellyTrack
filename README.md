<p align="center">
  <img src="public/logo.svg" width="128" height="128" alt="JellyTrack Logo">
</p>

<h1 align="center">JellyTrack</h1>

<p align="center">
  <a href="https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml"><img src="https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml/badge.svg" alt="Docker Build"></a>
  <a href="https://ghcr.io/maelmoreau21/JellyTrack"><img src="https://img.shields.io/badge/GHCR-ghcr.io%2Fmaelmoreau21%2FJellyTrack-blue?logo=github" alt="GHCR Image"></a>
</p>

<p align="center">
  <strong>Observability and analytics for Jellyfin: live sessions, enriched history, and playback metrics.</strong>
</p>

---

> [!CAUTION]
> ### 🚨 THE JELLYFIN PLUGIN IS REQUIRED
> JellyTrack **cannot** collect data without its companion plugin installed on your Jellyfin server.
>
> [👉 Click here to configure the plugin](https://github.com/maelmoreau21/Jellyfin.Plugin.JellyTrack)

---

## 🚀 Docker Installation

The repository already includes a complete `docker-compose.yml`. The recommended method is:

### 1. Configuration

```bash
cp .env.example .env
```

Edit `.env` and replace all `CHANGE_ME_*` values.

Important for Docker: if Jellyfin runs in another container or on another machine, `JELLYFIN_URL` must be reachable from the JellyTrack container. Avoid `127.0.0.1` unless Jellyfin is in the same container.

### 2. Start or update

```bash
docker compose pull
docker compose up -d
```

To test a local change before publishing the image:

```bash
docker build -t ghcr.io/maelmoreau21/jellytrack:latest .
docker compose up -d
```

### 3. Access

Go to `http://localhost:3000` and log in with your `ADMIN_PASSWORD`.

### Jellyfin 10.12 / 12 beta

JellyTrack uses the `Authorization: MediaBrowser Token="..."` header for recent Jellyfin versions. The old URL API key access (`?ApiKey=...`) has been removed.

1. Create an API key in Jellyfin: **Dashboard** > **Advanced** > **API Keys**.
2. Set `JELLYFIN_API_KEY` in `.env`.
3. Install or update the JellyTrack companion plugin.
4. In JellyTrack, go to **Settings** > **Jellyfin Connection**, generate the plugin key, then copy the plugin URL and key into the Jellyfin plugin configuration.

### Existing database / Prisma P3005 error

If the logs show `Error: P3005` and `The database schema is not empty`, the database already exists but does not include Prisma's migration history table. The container can now baseline the included migrations and then sync the schema without data loss by default.

If you want to start from scratch, remove the PostgreSQL volume carefully:

```bash
docker compose down
docker volume rm jellytrack_JellyTrack_pgdata
docker compose up -d
```

---

## 🌟 Features

- **Live Dashboard**: See who is watching what in real time (Direct Play vs Transcode, bitrate, etc.).
- **Enriched History**: Full technical details (codecs, subtitles, languages).
- **Stats & Trends**: Top users, most-watched media, activity charts.
- **System & Audit Logs**: Track synchronization health.
- **Security**: Jellyfin authentication, API key hashing, multi-server support.

---

## 🔌 Plugin Configuration

Once the server is installed, you must configure the plugin on your Jellyfin instance to start receiving data.

**Plugin repository:** [Jellyfin.Plugin.JellyTrack](https://github.com/maelmoreau21/Jellyfin.Plugin.JellyTrack)

1. In Jellyfin: **Dashboard** > **Plugins** > **Repositories**.
2. Repository URL: `https://raw.githubusercontent.com/maelmoreau21/Jellyfin.Plugin.JellyTrack/main/manifest.json`
3. Install the **JellyTrack** plugin from the catalog.

---

## 📄 License

Personal project — private use.
Built with Next.js, Prisma, Redis & lots of ☕
