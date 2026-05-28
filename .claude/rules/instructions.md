---
description: "Instructions and memory for AI agents - JellyTrack"
paths:
  - "."
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# JellyTrack - Instructions For AI Agents

Read this document before changing the project.

- The Jellyfin companion plugin is required. JellyTrack does not collect useful data without it.
- Docker Compose is the canonical install mode.
- Do not hallucinate the schema: verify `prisma/schema.prisma`.
- Do not hallucinate i18n keys: verify `messages/*.json`.
- Do not invent plugin contracts: verify `src/app/api/plugin/events/route.ts`.
- Do not commit, push, create branches, or merge without an explicit user request.
- `.env.example` contains placeholders only. Never add real secrets.

## Canonical Stack

- Framework: Next.js 16 App Router in `src/app/`
- Runtime: Node 24 in Docker
- Language: TypeScript strict
- Web auth: next-auth with Next proxy in `src/proxy.ts`
- ORM/DB: Prisma 7 + PostgreSQL
- Prisma CLI config: `prisma.config.ts`
- Prisma runtime adapter: `@prisma/adapter-pg`
- Cache/live state: Redis through ioredis
- UI: Tailwind + `src/components/ui/*`
- Charts: Recharts
- i18n: next-intl + `messages/*.json`

## Plugin Event Rules

Source of truth: `src/app/api/plugin/events/route.ts`.

- Canonical download event: `MediaDownloaded`.
- Accepted download aliases: `ItemDownloaded`, `DownloadCompleted`.
- Downloads create closed `PlaybackHistory` rows with `eventSource = "download"`, `playMethod = "Download"`, full `durationWatched`, and a `TelemetryEvent` with `eventType = "download"`.
- `PlaybackHistory.sourceEventId` deduplicates plugin retries per server through `@@unique([serverId, sourceEventId])`.
- Downloads always count as complete views, including music and short media, unless an excluded library filter rejects them.
- Plugin events must respect excluded libraries and reject malformed required user/media payloads.

## Completion Semantics

- Completion is cumulative by user + media across all playback history.
- A movie started on one day and finished later must become `completed`, not permanently `abandoned`.
- Date filters still scope period views and duration, but abandonment/partial/completed classification may use later reference history.
- Use `getCumulativeCompletionEntries` in `src/lib/mediaPolicy.ts` when classifying completion.

## Telemetry Semantics

- Seeks must expose ranges as `fromMs -> toMs`, not only event time.
- Replays are backward seek ranges and should be aggregated as watched-again passages.
- Audio/subtitle language periods are derived from initial playback metadata plus language change events until the next change or session end.
- Logs, media profile pages, stream telemetry APIs, exports, and backups should preserve download source, source event id, seek ranges, and language metadata.

## Prisma Summary

Key models:
- `Server`: Jellyfin server identity and connection settings.
- `User`: Jellyfin user identity, scoped by server.
- `Media`: Jellyfin item metadata, scoped by server.
- `PlaybackHistory`: playback/download rows, event source, source event id, telemetry counters.
- `TelemetryEvent`: pause/resume/seek/replay/audio/subtitle/speed/download events.
- `GlobalSettings`: app/plugin settings.
- `AdminAuditLog`, `SystemHealthState`, `SystemHealthEvent`: admin/security/health tracking.

After schema changes:
1. Add a migration in `prisma/migrations`.
2. Run `npx prisma generate`.
3. Update backup import/export paths if new persisted fields matter.

## Quality Gate

Before finalization when code changed:
1. Run `npm run test`.
2. Run `npm run check:i18n`.
3. Run `npm run lint`.
4. Run `npm run build`.
5. Run `npm outdated --json` and expect `{}` when dependencies were updated.

Any structural behavior change should update this file and `README.md`.
