---
description: "Instructions and memory for AI agents - JellyTrack (all versions)"
paths:
  - "."
  - "src/**/*.ts"
---

# JellyTrack - Instructions & Memory for AI Agents (all versions)

IMPORTANT - read this document fully before any change.

- IMPORTANT - THE JELLYFIN PLUGIN IS REQUIRED: JellyTrack does not work without its companion plugin.
- The recommended and canonical install mode is Docker (`docker-compose.yml`).
- Do not hallucinate the data model: always verify `prisma/schema.prisma`.
- Do not hallucinate i18n keys: verify `messages/*.json`.
- Do not invent plugin contracts: verify `src/app/api/plugin/events/route.ts`.
- Do not `commit`, `push`, create branches, or `merge` without explicit user request.
- The `.env` file is public and versioned as an example: placeholders only (`CHANGE_ME_*`), never real secrets.

## 1. Canonical Tech Stack

- Framework: Next.js 16 App Router (`src/app/`)
- Language: TypeScript (strict)
- Web auth: next-auth with Next proxy (`src/proxy.ts`)
- ORM/DB: Prisma + PostgreSQL
- Cache/real time: Redis (ioredis)
- UI: Tailwind + components `src/components/ui/*`
- Charts: Recharts
- i18n: next-intl + `messages/*.json`

## 2. Security Architecture (reference, all versions)

### 2.1 Plugin API Key - Hash-at-Rest
Source: `src/lib/pluginKeyManager.ts` + `src/app/api/plugin/events/route.ts`
- The plugin key is stored as a versioned scrypt hash (`s1$...`).
- Any plugin settings change via the UI (`JellyfinServersSettings.tsx`) focuses on **generating** new keys. The UI no longer allows pasting a raw key to avoid human error and improve security.

### 2.2 Audit & Logs
Source: `src/lib/adminAudit.ts` + `src/app/logs/page.tsx`
- **Login Audit**: Each successful login is recorded via `writeAdminAuditLog` in `authOptions.ts`.
- **Log Filtering**: `monitor_ping` logs (heartbeats) are filtered at the Prisma query in `logs/page.tsx` to avoid UI noise. They remain stored in the DB but are hidden in the "System" tab by default.

### 2.3 Branding & Logo (reference, all versions)
- The official logo is `public/logo.svg`.
- **Optimization**: The logo is a "borderless" version (no extra margins) for maximum visibility as a favicon and app icon.
- For maximum reliability (avoid static file loading issues on the login page), the SVG code is **inlined** in `src/app/login/page.tsx` and `src/components/Sidebar.tsx`.
- **Note**: The logo must be present and visible on all main interfaces to reinforce the visual identity.

## 3. Working Tree (useful view)

- `src/app/*`: App Router pages/routes
- `src/app/api/*`: server APIs
- `src/proxy.ts`: global access policy
- `src/lib/*`: business logic (auth, sync, plugin key, SSRF/webhook, server registry)
- `src/components/ui/*`: UI primitives to reuse first
- `src/components/dashboard/*`: dashboard blocks
- `src/components/charts/*`: Recharts wrappers
- `prisma/schema.prisma`: source of truth for the model
- `messages/*.json`: multi-locale translations

## 4. Prisma - Canonical Summary (all versions)

Key models:
- `Server`: `id`, `jellyfinServerId`, `name`, `url`, `jellyfinApiKey`, `isActive`.
- `User`: `serverId`, `jellyfinUserId`, `username`, `lastActive`.
- `Media`: `serverId`, `jellyfinMediaId`, `type`, `collectionType`, `libraryName`.
- `PlaybackHistory`: `serverId`, `userId`, `mediaId`, `playMethod`, `startedAt`, `endedAt`.
- `AdminAuditLog`: history of sensitive actions (logins, settings changes).
- `SystemHealthEvent`: health events (sync, plugin connection). *Note: `monitor_ping` is the dominant type here.*

## 5. i18n - Mandatory Policy

- All UI strings must come from `messages/*.json`.
- The `logs.sortDateDesc` key is labeled "Trier" to optimize UI space in the sort selector.

## 6. Zero Tech Debt Quality Rules

Before finalization:
1. Check schema impact if data code changed.
2. Verify translations across all locales.
3. Run `npm run build`.
4. Verify the inlined logo is present and matches the optimized version.

---
This document is the AI agent reference for JellyTrack (all versions).
Any structural change must update this file.