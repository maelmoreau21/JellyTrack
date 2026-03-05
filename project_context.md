# JellyTulli - Project Context & Architecture

**Description** : JellyTulli (Jellyfin + Tautulli) est un wrapper analytique et un traceur autonome ("Ultimate Dashboard 2.0") pour Jellyfin.

## Tech Stack
- Frontend/Backend: **Next.js 15+ (App Router, Server Components)**
- Cache en temps réel: **Redis (ioredis)**
- DB et ORM: **PostgreSQL + Prisma**
- Styling: **TailwindCSS + Shadcn/UI + Lucide Icons**
- DataViz: **Recharts**
- IP Localization: **geoip-country**

## Phase 3 : Tautulli Ultimate Clone Capabilities
A massive analytical refactoring was introduced focusing on Data Context and Resilience on Edge Devices (Raspberry Pi).

1. **Dashboard Tab Layout (`page.tsx`)**:
  - Encapsulated by `Tabs` (Vue d'ensemble / Analyses Détaillées).
  - Heavy JS tasks partitioned within `<Suspense>` via `DeepInsights` and `GranularAnalysis`.
  
2. **Deep Insights (`DeepInsights.tsx`)**:
  - Leverages massive raw grouped data.
  - Computes `Top 5 Films`, `Top 5 Series`, `Top 5 Music`, `Top 5 Books`.
  - Determines top Playback Clients.
  - Stream Proportions visually handled via `StreamProportionsChart.tsx` (Direct vs. Transcode).

3. **Granular Analysis (`GranularAnalysis.tsx`)**:
  - 6 dedicated charts to handle grouped historical context using `StandardMetricsCharts` wrappers.
  - **Daily**: Raw Plays vs Collections ; Raw Durations vs Collections.
  - **Hourly Heatmap Equivalent**: Bar / Area grouping plays according to Hour (`00h` to `23h`).

4. **Dynamic Data Engine**:
  - Time Range Selector now contains a `React-Day-Picker` Custom scope.
  - Query endpoints and URL `searchParams` accept `?from=YYYY-MM-DD&to=YYYY-MM-DD`.

5. **Universal Security & Backups & External Migrations (`src/app/api/backup`)**:
  - Zero-Constraint JSON architecture backing up all `Users`, `Media`, `Settings`, and `Logs`.
  - Import leverages Prisma `$transaction` with a timeout of 60000ms. If one line is corrupted, the DB rolls back safely.
  - Integration of **Chunked File Migrations** from `Jellystat` (JSON) and the `Playback Reporting` plugin (CSV). The application handles these uploads via Buffers and streams to process massive imports iteratively (e.g., 500 records at a time), preventing OOM crashes on edge devices like Raspberry Pi.
  
6. **Autonomy Core (`src/server/monitor.ts`) & Docker Strategy**:
   - The heartbeat pulls from `$JELLYFIN_URL/Sessions` using the `JELLYFIN_URL` and `JELLYFIN_API_KEY` environment variables.
  - Build pipeline relies on `output: "standalone"` making it highly effective structurally.

7. **Security & Setup (Phase 5)**:
   - Jellyfin connection now configured via environment variables (`JELLYFIN_URL`, `JELLYFIN_API_KEY`) in `docker-compose.yml`. The Setup Wizard (`/setup`) was removed in Phase 31.
   - `GlobalSettings` database model only stores runtime-configurable settings (Discord webhooks, excludedLibraries).
  - Next.js Middleware protects all analytical routes. Local `signOut` directly routes to `/login` via JS to bypass strict callbackUrl environment constraints.

8. **Elite Features (Phase 6)**:
  - **Jellyfin Native Webhooks**: `/api/webhook/jellyfin` endpoint securely traps `PlaybackStart` events for real-time Discord Alerts without polling.
  - **Yearly Heatmap**: Github-style 365-day contribution chart tracking user activity density efficiently.
  - **Newsletter Generator**: `/newsletter` standalone responsive A4-sized report aggregating the month's biggest viewers and top videos with visually immersive backdrops.
  - **Draggable Dashboard**: Utilizes a persistent `localStorage` layout state and a React wrapper `DraggableDashboard` to rearrange Server Components instantly via up/down controls in the UI.

56. 9. **Elite Features: Wrapped, Clean-up & Advanced Stats (Phase 8)**:
57.   - **JellyTulli Wrapped**: `/wrapped/[userId]` portal dynamically calculating each user's year in review (Total Watch Time, Top 3 Media, Favorite Genre, Most Active Day). Presented in a modern Instagram/Spotify Story format.
58.   - **Administrator Clean-up Assistant**: `/admin/cleanup` routing featuring a Tabular Dashboard for detecting *Ghost Media* (added >30 days ago, 0 plays) and *Abandoned Media* (started but with <80% average completion rate).
59.   - **Granular Drop-off Stats**: Detailed Analytics tab now renders average completion rates per library (Movies, Series, Music).
60.   - **Peak Concurrent Streams KPI**: Dashboard natively plots historic `PlaybackHistory` overlap using timeline events to calculate the absolute peak concurrent stream load since database origin.
61. 
66.   - **Funnel segmentation**: Deep dive inside the UX by detecting behaviors like: Zapped (<10%), Tried (10-25%), Halfway (25-80%), Finished (>80%). Coupled with dynamic PieCharts for VF/VO and SRT breakdown.
67. 
68. 11. **Large File Support & Streaming Imports (Phase 10)**:
   - **Advanced Configuration**: Next.js `bodySizeLimit` increased to `500mb` via `experimental` settings to handle mass exports.
   - **TSV Support**: Playback Reporting migration now natively handles `.tsv` and `.csv` via automatic delimiter detection in PapaParse.
   - **Memory-Efficient Streaming**: Jellystat JSON import (up to 174MB+) rewritten using `stream-json` and `stream-chain`. Records are parsed one by one from the stream and processed in chunks of 200, preventing RAM exhaustion on edge devices like Raspberry Pi.

12. **Critical Bug Fixes (Phase 11)**:
   - **Jellystat Import 174MB Fix**: Server Actions also enforce the 10MB limit on the `/settings` page path in Docker. Reverted to a **Route Handler** (`/api/backup/import/jellystat`) with the client sending the raw `File` blob via `fetch()` with `Content-Type: application/octet-stream`. The Route Handler streams `req.body` directly into `stream-json` — zero buffering, no body parsing, no size limit. `serverExternalPackages: ['stream-json', 'stream-chain']` added to `next.config.ts` to ensure proper bundling. The Server Action file (`src/app/actions/import-jellystat.ts`) is kept as reference but no longer invoked.
   - **Playback Reporting TSV Fix**: The Playback Reporting TSV export has **no header row** — the first line is already data. PapaParse now uses `header: false` and the mapping is done by **column index**: `[0]:Date [1]:UserId [2]:ItemId [3]:ItemType [4]:ItemName [5]:PlayMethod [6]:ClientName [7]:DeviceName [8]:PlayDuration`. Diagnostic `console.log` logs the first row sample and column count. UI text updated from "CSV" to "TSV" throughout the settings page.
   - **Unknown User Fix**: Users imported from the TSV that don't exist locally are now created with username `"Utilisateur Supprimé"` instead of `"Unknown User"`. Their real name is resolved on the next Jellyfin sync.
   - **Logout Redirect Fix**: `signOut({ callbackUrl: '/login' })` replaced by `await signOut({ redirect: false })` followed by `window.location.href = '/login'`. This forces a pure JS redirect that always uses the current host, eliminating the `localhost:3000` redirect bug caused by NextAuth's `callbackUrl` resolution.

13. **UUID Normalization, Chunked Upload & Auto-Backups (Phase 12)**:
   - **UUID Normalization**: Playback Reporting TSV exports IDs without dashes (32 hex chars). A `normalizeUuid()` function now adds standard UUID dashes (8-4-4-4-12) before upsert, ensuring imported users correctly match existing Jellyfin users in the database.
   - **Logs CSS Overflow Fix**: Media title column in `/logs` now uses `max-w-[150px] md:max-w-[250px]` with `truncate` to prevent long titles from overflowing into adjacent columns.
   - **Chunked Upload (Jellystat 174MB)**: Client-side `File.slice()` splits the JSON into 5MB chunks sent sequentially to `/api/backup/import/jellystat/chunk`. Each chunk is saved to `/tmp/jellytulli-uploads/{uploadId}/`. A `/api/backup/import/jellystat/finalize` endpoint merges all chunks then pipes the merged file through `stream-json` for incremental DB import. Progress bar displayed in the UI (0-50% upload, 55-100% processing).
   - **Auto-Backup System**: `node-cron` task in `instrumentation.ts` triggers `performAutoBackup()` at 3:30 AM daily. The function (`src/lib/autoBackup.ts`) exports all Users, Media, PlaybackHistory and Settings to `/data/backups/jellytulli-auto-YYYY-MM-DD_HH-MM-SS.json`. Rolling rotation keeps only the 5 most recent files. A Docker named volume `jellytulli_backups` persists the backups across container rebuilds.
   - **Auto-Backup UI**: New card in `/settings` lists the 5 auto-backups with date, size, and a "Restaurer" button. Restore endpoint (`/api/backup/auto/restore`) reads the file from disk and replays it via Prisma `$transaction` with full cascade (delete → recreate all tables).

14. **DB Pool Fix, Jellystat Parser, RBAC & Extended Wrapped (Phase 13)**:
   - **Prisma Pool Exhaustion Fix**: The singleton pattern in `src/lib/prisma.ts` now assigns `globalThis.prismaGlobal = prisma` unconditionally (not just in development). This prevents "Too many clients already" errors in production Docker. Added `log: ['error']` in production and `['warn', 'error']` in development. `DATABASE_URL` in `docker-compose.yml` now includes `&connection_limit=5` to cap Prisma's pool size on Raspberry Pi.
   - **Jellystat JSON Auto-Detection**: Jellystat exports can be either a root-level JSON array `[...]` or an object like `{"jf_playback_activity": [...]}`. Both the direct import route (`/api/backup/import/jellystat`) and the chunked finalize route (`/api/backup/import/jellystat/finalize`) now auto-detect the structure by peeking at the first bytes. If the root is an object, `pick({ filter: detectedKey })` from `stream-json/filters/Pick` is injected into the pipeline before `streamArray()`. This fixes the "0 sessions imported" bug.
   - **Logs CSS Table-Fixed**: `<Table>` in `/logs` now uses `table-fixed` class with explicit column widths (`w-[130px]` Date, `w-[120px]` User, `w-[250px]` Media, etc.). Media cell uses `overflow-hidden` + `min-w-0` flex children for proper truncation.
   - **RBAC (Admin vs User)**: Jellyfin's `Policy.IsAdministrator` is no longer gate-checked at login — ALL Jellyfin users can now authenticate. The `isAdmin` boolean and `jellyfinUserId` are stored in the JWT via NextAuth `callbacks.jwt` and exposed on the session via `callbacks.session`. Type augmentation in `src/types/next-auth.d.ts`. The middleware (`src/middleware.ts`) checks `token.isAdmin`: admins access all routes, non-admins are restricted to `/wrapped/*` only and get redirected to `/wrapped/{jellyfinUserId}` if they try to access admin routes.
   - **Extended Wrapped Page**: The `/wrapped/[userId]` page now computes per-category breakdowns (Movies, Series, Music) with Top 3 media and total hours for each. Three new slides added to the story-style UI: "Le Grand Écran" (Films, red gradient), "Binge Watching" (Series, sky gradient), "La Bande Son" (Music, green gradient). Each slide shows category hours + ranked Top 3 with individual watch durations. The final share card also displays the category breakdown.

15. **Duck-Typing Parser, Tooltips & NextAuth RBAC (Phase 14)**:
   - **Jellystat Duck-Typing Parser**: The `streamArray()` + `pick()` approach was fragile — it required knowing the exact JSON structure. Replaced with `streamValues()` which emits EVERY value at any depth. A duck-typing function `isSessionObject()` checks if each value has `UserId` AND `ItemId` AND (`PlayDuration` OR `RunTimeTicks` OR `DateCreated`). Non-session values are silently skipped. Applied to both direct import (`/api/backup/import/jellystat`) and chunked finalize route. This guarantees import regardless of Jellystat's internal JSON key naming.
   - **Playback Reporting UUID Fix**: `normalizeUuid()` now lowercases the entire ID and validates it with `/^[0-9a-f]{32}$/` before inserting dashes. The variable is extracted and normalized IMMEDIATELY from `row[1]` before any Prisma call. A diagnostic log prints the before/after UUID for the first processed row.
   - **Logs Tooltip**: Added `title={log.media.title}` on the parent `<div>` wrapping the media cell in `/logs`. The native HTML `title` attribute displays the full media name on hover, complementing the CSS `truncate`.
   - **RBAC Session Fix**: `session.user.isAdmin` and `session.user.jellyfinUserId` are now exposed on `session.user` (not `session` root). Type declarations updated in `src/types/next-auth.d.ts` to extend `DefaultSession["user"]`.
   - **Dashboard Admin Guard**: `page.tsx` (Dashboard) now calls `getServerSession(authOptions)` and checks `session.user.isAdmin`. Non-admins are server-side redirected to `/wrapped/{jellyfinUserId}` via `redirect()`.
   - **API Route Protection**: Middleware now explicitly blocks non-admin access to `/api/sync`, `/api/backup`, `/api/hardware`, `/api/settings`, and `/api/admin/*` with a 403 JSON response.

16. **JSONStream Deep Scan, Ghost User Fix & Wrapped RBAC (Phase 15)**:
   - **JSONStream Deep Scan**: `stream-json` `streamValues()` emitted the entire root JSON as ONE value — it never recursed into nested objects, causing 0 sessions imported from Jellystat. Replaced with `JSONStream.parse('..')` which recursively emits every object/value at every depth. The `isSessionObject()` duck-typing filter is preserved. Applied to both direct import (`/api/backup/import/jellystat`) and chunked finalize route. Uses event-based `data`/`end` listeners with `pause()`/`resume()` for backpressure. `JSONStream` added to `serverExternalPackages` in `next.config.ts`. No `@types/JSONStream` exists — uses `require()` import.
   - **Ghost User Cleanup**: Playback Reporting import now runs a batch `updateMany` at the end of each import to fix all users with username `"Unknown User"` / `"Unknown"` → `"Utilisateur Supprimé"`. This retroactively fixes ghost users created before the Phase 11 naming fix.
   - **Wrapped Page RBAC Fix**: Sidebar (`Sidebar.tsx`) now hides on `/wrapped/*` paths (not just `/login`), giving non-admin users a clean fullscreen Wrapped experience. Middleware matcher broadened from `_next/static|_next/image` to `_next` to exclude ALL Next.js internal routes, preventing potential interference with RSC payloads and other internal fetches.

17. **JSON Case-Insensitive Parser, Local DB Fallback & User RBAC (Phase 16)**:
   - **Jellystat Case-Insensitive Duck-Typing**: Keys in Jellystat JSON exports vary wildly (`UserId`, `userId`, `user_id`). Both import routes now call `toLowerKeys(obj)` to normalize ALL keys to lowercase before testing `isSessionObject()` and before extracting field values in `processChunk()`. Condition: `lk.userid && (lk.itemid || lk.nowplayingitemid) && (lk.playduration || lk.runtimeticks)`. A diagnostic `console.log("Exemple d'objet trouvé:", Object.keys(obj))` logs the raw keys of the first scanned object for troubleshooting. Default username in Jellystat import changed from `"Unknown User"` to `"Utilisateur Supprimé"`.
   - **Ghost User Cleanup (All Import Routes)**: All three import routes (Jellystat direct, Jellystat finalize, Playback Reporting) now run `prisma.user.updateMany()` at completion to batch-rename users with `"Unknown User"` / `"Unknown"` → `"Utilisateur Supprimé"`.
   - **Local DB Username Fallback**: All display components (Logs, Users leaderboard, User detail, Dashboard top users, Wrapped) now strictly use `user.username || "Utilisateur Supprimé"` from the local Prisma database. No external Jellyfin API calls for username resolution. This ensures deleted Jellyfin users always display a meaningful name.
   - **Middleware RBAC Restructure**: Middleware changed from a whitelist model (only `/wrapped` + `/api/auth` allowed for non-admins) to a blacklist model. New structure: `PUBLIC_USER_PATHS` = `/wrapped`, `/api/auth`, `/api/jellyfin`; `ADMIN_API_PATHS` = `/api/sync`, `/api/backup`, `/api/hardware`, `/api/settings`, `/api/admin`; `ADMIN_PAGE_PATHS` = `/`, `/logs`, `/users`, `/media`, `/newsletter`, `/admin`, `/settings`. Non-admin users can now access any route not explicitly blocked, while admin pages redirect to `/wrapped/{id}` and admin APIs return 403.
   - **Wrapped Auto-Create User**: The `/wrapped/[userId]` Server Component now auto-creates the user in Prisma if they authenticated via Jellyfin but were never synced/imported. Uses `getServerSession()` to verify the requested userId matches the logged-in user before creating. This prevents 404 errors for newly-registered non-admin users accessing their Wrapped page.

18. **Watch Party, Network Dashboard & Pro Telemetry (Phase 17)**:
   - **Watch Party Detection**: `/logs` page now runs a `detectWatchParties()` algorithm after fetching PlaybackHistory. Groups sessions of the same media (same `mediaId`) started by different users within a 5-minute window. Each detected party renders a gradient banner row in the table with `🍿 Watch Party` badge showing the number of spectators and their usernames. Party member rows are visually marked with a violet left border and a `Users` icon next to the date. Custom `animate-pulse-slow` CSS animation (3s cycle) for the banner.
   - **Network Dashboard Tab**: New "Réseau" tab added to the Dashboard page alongside "Vue d'ensemble" and "Analyses Détaillées". Powered by a `NetworkAnalysis` async Server Component (`src/components/dashboard/NetworkAnalysis.tsx`) loaded via `<Suspense>`. Contains:
     - **Stats Row**: 4 KPI cards (Total Sessions, Transcode Rate %, DirectStream count, Transcoded Duration in hours).
     - **DirectPlay vs Transcode AreaChart**: `TranscodeHourlyChart` (`src/components/charts/TranscodeHourlyChart.tsx`) — stacked area chart showing DirectPlay/DirectStream/Transcode session counts by hour of day (00h-23h). Interactive legend toggling.
     - **Client Transcode Profile**: Horizontal bar chart showing transcode % per client application.
     - **"Table des Coupables"**: Top 10 most transcoded media with resolution badge, session count, total duration, inferred cause (Subtitle Burn-in, HD Audio unsupported, 4K resolution, Client compatibility), and the primary client responsible. Causes are inferred from `subtitleCodec` (burn-in codecs: ass/ssa/pgssub/dvdsub), `audioCodec` (heavy: truehd/dts/eac3/flac), and `Media.resolution`.
   - **Pro Telemetry (Deep Insights)**: Two new donut charts added to the "Analyses Détaillées" tab in `DeepInsights.tsx`:
     - **Resolution Matrix**: Joins `PlaybackHistory → Media.resolution` to show sessions by resolution (4K, 1080p, 720p, SD, Unknown). Top 6 values displayed.
     - **Device Ecosystem**: Groups `PlaybackHistory.deviceName` to display the top 8 physical playback devices (distinct from the existing `PlatformDistributionChart` which tracks `clientName`).

19. **Import Resilience, Jellystat Relaxed Scan & Wrapped RBAC (Phase 18)**:
   - **PlaybackHistory.userId Optional**: Schema changed `userId` from `String` (required) to `String?` (optional). `user` relation changed from `User` to `User?`. `onDelete: Cascade` preserved — deleting a User still removes their history, but orphan records (null userId) are allowed. Requires `npx prisma migrate dev` or `npx prisma db push`.
   - **Playback Reporting TSV: No Ghost Users**: `prisma.user.upsert()` replaced by `prisma.user.findUnique()`. If the UUID from TSV doesn't match any existing User, the PlaybackHistory is created with `userId: null` and `clientName` tagged with `"(Utilisateur Inconnu - TSV)"`. This prevents phantom User records from being created during import. De-duplication via `findFirst` still works with null userId.
   - **Dashboard Null Guard**: `topUsersAgg` groupBy query now includes `userId: { not: null }` filter to prevent null userId from breaking the subsequent `findUnique({ where: { id: agg.userId } })`.
   - **Jellystat Relaxed Scan**: `isSessionObject()` duck-typing in both direct import (`/api/backup/import/jellystat`) and chunked finalize route no longer requires `PlayDuration`, `RunTimeTicks`, or `DateCreated`. Simplified criterion: `hasUserId && hasItemId`. This captures sessions from Jellystat exports that omit activity duration fields. Sessions with 0 duration are imported with `durationWatched: 0`.
   - **Jellystat Detailed Logging**: Both Jellystat import routes now log: (1) keys of the first scanned object, (2) full JSON of the first matched session (truncated to 500 chars), (3) keys of up to 3 objects that have a `userId` field but were rejected (missing ItemId). This aids debugging when imports yield 0 sessions.
   - **Wrapped All-Time Fallback**: `/wrapped/[userId]` Server Component now falls back to all-time data when the current year filter yields 0 sessions. Applied to both the initial query and the auto-create re-fetch. Ensures non-admin users with only imported historical data see their Wrapped instead of an empty page.

20. **Brute-Force Imports, RBAC Fix & Media Profiler (Phase 19)**:
   - **Jellystat Brute-Force Regex**: JSONStream deep-scan parser entirely replaced. Both direct import (`/api/backup/import/jellystat`) and chunked finalize route now read the raw file as a UTF-8 string and use `RegExp.exec()` to find all `"UserId":"..."` occurrences. For each match, the enclosing `{...}` JSON object boundaries are found by scanning backward/forward for `{` and `}`. Field values (ItemId, UserName, ItemName, PlayDuration, DateCreated, PlayMethod, ClientName, DeviceName) are extracted via individual case-insensitive regex calls (`extractStr()`, `extractNum()`). Sessions without an ItemId are skipped. This approach handles 174MB single-line JSON files that crash traditional JSON parsers. `JSONStream`, `stream-json`, and `stream-chain` imports removed; `Readable` import removed from the direct route; `createReadStream` replaced by `readFileSync` in the finalize route.
   - **Middleware RBAC Overhaul**: Switched from a broad blacklist model blocking many routes for non-admins to a minimal restriction. `ADMIN_API_PATHS` reduced to `["/api/admin"]` only. `ADMIN_PAGE_PATHS` reduced to `["/admin", "/settings"]`. The `PUBLIC_USER_PATHS` concept removed entirely. Non-admin users can now access `/`, `/logs`, `/users`, `/media`, `/newsletter`, and all non-admin API routes. Pages like the Dashboard (`/`) have their own server-side `isAdmin` check and redirect.
   - **Username Display Consistency**: Newsletter page `topUser.name` fallback changed from `"Inconnu"` to `"Utilisateur Supprimé"` for consistency with all other display components.
   - **Media Profile Page (`/media/[id]`)**: New dynamic route analyzing a specific media item. Features:
     - **Header**: Title, Poster (via Jellyfin Image proxy), genres, resolution badge, duration, production year, and community rating fetched from Jellyfin `/Items/{id}` API. Overview/synopsis displayed with `line-clamp-5`.
     - **KPI Cards**: Total watch time (hours), total views (session count), average duration per session (minutes).
     - **Télémétrie & Drop-off**: `MediaDropoffChart` client component renders a Recharts BarChart with 10 buckets (0-10%, 10-20%, ..., 90-100%) showing session completion distribution. Color gradient from red (early drop-off) to green (completed). Based on `durationWatched / (media.durationMs / 1000)`.
     - **Historique Détaillé**: Full table of every playback session — user (linked to `/users/[jellyfinUserId]`), date, play method (DirectPlay/Transcode badge), audio language + codec, subtitle language + codec, and duration watched.
   - **Media Grid Navigation**: Media cards in `/media` now wrapped in `<Link>` to `/media/{jellyfinMediaId}`, making each card clickable to its profile page.

21. **Fix StoppedAt, Soft UUID Match, Unified Backups & Media Breadcrumbs (Phase 20)**:
   - **Jellystat Import endedAt Fix**: Both direct and chunked Jellystat brute-force import routes now compute `endedAt = new Date(startedAt.getTime() + duration * 1000)` when `duration > 0`. The `endedAt` field is written to both `create` and `update` Prisma calls. This prevents imported sessions from displaying "En cours" in the logs page — they now correctly show a calculated end time.
   - **TSV Soft UUID Matching**: The Playback Reporting TSV import route no longer does a strict `prisma.user.findUnique({ where: { jellyfinUserId } })`. Instead, all users are pre-loaded into an in-memory `Map` keyed by `jellyfinUserId.replace(/-/g, '').toLowerCase()` (dashless lowercase). The TSV row's raw UUID is also stripped of dashes and lowercased before lookup: `userMap.get(rawUserId.replace(/-/g, '').toLowerCase())`. This fixes UUID mismatches caused by casing or dash formatting differences between Playback Reporting exports and Jellyfin's stored format. `endedAt` is also computed for TSV imports using the same `startedAt + durationWatched * 1000` formula.
   - **Unified Backup Management UI**: The auto-backups card in `/settings` is now a centralized backup management section with: (1) "Sauvegarder maintenant" button triggering `/api/backup/auto/trigger` which calls `performAutoBackup()`, (2) per-backup "Supprimer" button calling `/api/backup/auto/delete` which removes the file from disk, (3) existing "Restaurer" button per backup. New API routes: `/api/backup/auto/trigger/route.ts` (POST — calls `performAutoBackup()`), `/api/backup/auto/delete/route.ts` (POST — `unlinkSync` with path traversal protection via `path.basename()`). The list auto-refreshes after manual trigger.
   - **Media Breadcrumb Navigation**: The `/media/[id]` page now fetches `SeriesId`, `SeriesName`, `SeasonId`, `SeasonName`, `AlbumId`, and `Album` from the Jellyfin `/Items/{id}` API response. A breadcrumb navigation bar replaces the simple "Retour" link: `Bibliothèque > Series Name > Season Name > Current Title` for episodes, `Bibliothèque > Album Name > Current Title` for tracks. Each breadcrumb segment links to `/media/{parentId}`, enabling hierarchical navigation through Series → Season → Episode or Album → Track.

22. **Force Insert TSV, Ticks Math & X-Forwarded IP (Phase 21)**:
   - **TSV Force-Insert Users**: Playback Reporting TSV import completely reworked. The soft UUID matching (pre-loaded `userMap` with dashless lookup) is removed. For every TSV row: (1) `rawId = row[1].toLowerCase().replace(/-/g, '')`, (2) `formattedUserId = rawId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')`, (3) `prisma.user.upsert({ where: { jellyfinUserId: formattedUserId }, create: { jellyfinUserId: formattedUserId, username: "Utilisateur Supprimé TSV" } })` — always executed before history insert. The returned `user.id` is used directly for `PlaybackHistory.userId`. No more conditional null userId. Rows with invalid UUIDs (< 32 hex chars) are skipped.
   - **Jellystat Ticks Math Fix**: Duration values in Jellystat exports are in .NET ticks (1 tick = 100ns, 10,000 ticks = 1ms). Both direct and chunked import routes now extract `PlayDuration` OR `RunTimeTicks` via `extractNum()`, then compute: `durationMs = rawTicks / 10000` (ticks → ms), `durationSeconds = Math.floor(durationMs / 1000)` for `durationWatched`, and `endedAt = new Date(startedAt.getTime() + durationMs)` when `durationMs > 0` (otherwise `endedAt = startedAt`). The old heuristic `if (duration > 10_000_000) duration /= 10_000_000` is removed.
   - **X-Forwarded-For IP Fix**: Webhook route (`/api/webhook/jellyfin`) now reads `x-forwarded-for` (first entry) and `x-real-ip` headers before falling back to the payload's `IpAddress`/`ClientIp`. A `resolveIp()` helper cleans IPv6-mapped addresses (`::ffff:`) and labels local/Docker IPs (`127.0.0.*`, `172.*`, `10.*`, `192.168.*`, `::1`) as `"Réseau Local (Docker/LAN)"` instead of storing false IPs. The Monitor's `cleanIpAddress()` function in `src/server/monitor.ts` receives the same local IP detection: returns `"Réseau Local (Docker/LAN)"` for all private/loopback ranges instead of `"127.0.0.1"`.

23. **Smart Upsert, Real IPs, Ticks Math Fix & Media Breadcrumbs (Phase 22)**:
   - **TSV Smart Upsert**: TSV import no longer blindly upserts every user with `"Utilisateur Supprimé TSV"`. For each formatted UUID: `findUnique({ where: { jellyfinUserId } })` first — if found, use the existing user (preserving their real username). Only `create` with `username: "Utilisateur Supprimé TSV"` if the user truly doesn't exist. This preserves real usernames for already-synced Jellyfin users.
   - **TSV IP Label**: TSV exports have no IP column. All TSV-imported PlaybackHistory records now explicitly set `ipAddress: "Inconnue (TSV)"` instead of leaving it null.
   - **Jellystat IP Extraction**: Both direct and chunked Jellystat import routes now extract IP from the JSON via `extractStr(window, "IPAddress", "ip_address", "ipaddress", "RemoteEndPoint", "remote_end_point")`. The raw IP is stored directly in `PlaybackHistory.ipAddress` — no `cleanIpAddress()` labeling applied during imports (preserving original data).
   - **Jellystat Ticks Math Correction**: Previous phase used `rawTicks / 10000` (100ns → ms) which was wrong. Jellyfin uses 1 second = 10,000,000 ticks. Now correctly: `durationSeconds = Math.floor(rawTicks / 10_000_000)`, `endedAt = new Date(startedAt.getTime() + durationSeconds * 1000)`. Fallback: `endedAt = startedAt` when duration is 0.
   - **Jellystat Date Keys Expanded**: The `extractStr` call for dates now also searches `PlayDate`, `play_date`, `playdate`, `time_played` in addition to existing `DateCreated`/`StartedAt` variants.
   - **Media Breadcrumbs AlbumArtist**: The `/media/[id]` breadcrumb navigation now also fetches `AlbumArtist` (or first entry of `AlbumArtists[]`) from the Jellyfin API. For audio tracks, the breadcrumb reads: `Bibliothèque > AlbumArtist > Album > Track`. AlbumArtist is displayed as plain text (not a link since it's not an item ID).

24. **Duration Fix, IP Profil, Strict Filters & Image Fallbacks (Phase 23)**:
   - **Jellystat Duration Smart Detection**: The raw value extracted by `extractNum()` for `PlayDuration`/`RunTimeTicks` may be in seconds (Jellystat) or in ticks (raw Jellyfin). Both direct and chunked import routes now apply smart detection: if `rawDuration > 10_000_000` → assume ticks and divide by 10M; otherwise keep as-is (already seconds). `extractNum()` regex updated to match float values (`[\d.]+` instead of `\d+`) using `parseFloat` + `Math.floor`.
   - **User Profile IP & Client Columns**: The `/users/[id]/UserRecentMedia.tsx` history table now displays separate **Client**, **Appareil** (Device), and **IP** columns instead of the combined "Appareil" column. The IP address is shown in monospace font. The grouped history aggregation also tracks `ipAddress` from the latest session.
   - **Library Type Strict Filtering**: The `/media` page `buildMediaFilter()` now excludes `Audio`, `Track`, and `MusicAlbum` types from the default "Tous" tab. Music only appears when explicitly selecting the "Musique" tab. The music filter also includes `MusicAlbum` type.
   - **FallbackImage Component Upgrade**: The `FallbackImage` client component (`src/components/FallbackImage.tsx`) now wraps Next.js `<Image>` internally (instead of raw `<img>`) with full support for `fill`, `width`/`height`, and `unoptimized` props. On error or undefined `src`, renders a `<Film>` icon placeholder. All poster `<Image>` calls across 4 pages (`page.tsx`, `media/page.tsx`, `media/[id]/page.tsx`, `users/[id]/UserRecentMedia.tsx`) replaced with `<FallbackImage>`, ensuring broken Jellyfin image URLs display a graceful fallback instead of a broken image.
   - **Breadcrumbs Verified**: The `/media/[id]` breadcrumb navigation from Phase 22 confirmed working correctly with `<nav>` + `<ChevronRight>` separators and `<Link>` components for Series/Season/Album hierarchy.

25. **V2 Refonte Massive — Télémétrie Pro & Clean-up (Phase 25)**:
   - **Import Code Purge**: All import routes (`/api/backup/import/jellystat/` directory tree incl. chunk + finalize, `/api/backup/import/playback-reporting/route.ts`) and the server action (`src/app/actions/import-jellystat.ts`) **deleted entirely**. Settings page (`/settings/page.tsx`) fully rewritten to remove all import UI (handlers, refs, file inputs, Migrations Externes card). `next.config.ts` `serverExternalPackages` emptied (was `['stream-json', 'stream-chain', 'JSONStream']`).
   - **Enhanced Sync with CollectionType**: `src/lib/sync.ts` now fetches `/Library/VirtualFolders` and `/UserViews` to build a `parentId → collectionType` mapping. Item types expanded to include `Audio,MusicAlbum`. Each media upsert now stores `collectionType` (string), `durationMs` (BigInt from RunTimeTicks/10000), and `parentId` (AlbumId ∥ SeasonId ∥ SeriesId ∥ ParentId).
   - **Strict Library Filtering**: `/media` page `buildMediaFilter()` now uses `collectionType` field (`"movies"`, `"tvshows"`, `"music"`) instead of `type` for library tab filtering. Default "Tous" tab shows all types. Music images use `parentId` fallback for album art.
   - **Image Fallback Chain**: `getJellyfinImageUrl()` accepts optional `fallbackId` parameter. The `/api/jellyfin/image` proxy tries the primary item ID first; if it fails and `fallbackId` is provided, retries with the fallback (e.g. parent album poster for audio tracks).
   - **Prisma Schema Updates**: `Media` model gains `parentId String?`. `PlaybackHistory` model gains `pauseCount Int @default(0)`, `audioChanges Int @default(0)`, `subtitleChanges Int @default(0)`.
   - **Webhook Telemetry Overhaul**: `PlaybackStop` handler computes real duration from `PositionTicks` (ticks/10M) with wall-clock fallback. New `PlaybackProgress` handler tracks: pause state transitions via Redis keys (`pause:{id}`), audio stream index changes via Redis keys (`audio:{id}`), subtitle stream index changes via Redis keys (`sub:{id}`). Increments `pauseCount`/`audioChanges`/`subtitleChanges` on PlaybackHistory accordingly.
   - **Enhanced Media Profile Page** (`/media/[id]/page.tsx`): Full rewrite with breadcrumbs (Series→Season→Episode / Artist→Album→Track), 6 KPI cards (total time, views, avg duration, pauses, audio changes, subtitle changes), 3-column layout (spectator list with user links, audio language distribution with progress bars, subtitle distribution with progress bars), drop-off chart, detailed history table with pause count column.
   - **Raw IP Visibility**: `cleanIpAddress()` in `src/server/monitor.ts` no longer masks local/Docker IPs as "Réseau Local (Docker/LAN)" — returns the raw cleaned IP. `resolveIp()` in the webhook route similarly stripped of local IP detection. Both now preserve raw IPs for full diagnostic visibility.
   - **Backup EACCES Fix**: `BACKUP_DIR` fallback changed from `"/data/backups"` to `path.join(process.cwd(), "backups")` in `src/lib/autoBackup.ts`, `/api/backup/auto/route.ts`, and `/api/backup/auto/restore/route.ts`. Prevents EACCES permission errors when running outside Docker where `/data/backups` doesn't exist.
   - **New Dashboard Charts**: Three new chart components added to the Dashboard "Vue d'ensemble" tab:
     - `MonthlyWatchTimeChart` (`src/components/charts/MonthlyWatchTimeChart.tsx`): Bar chart of watch hours per month over the last 12 months.
     - `CompletionRatioChart` (`src/components/charts/CompletionRatioChart.tsx`): Donut chart showing "Terminé" (≥80%), "Partiel" (20-80%), "Abandonné" (<20%) session ratio based on `durationWatched / media.durationMs`. 
     - `ClientCategoryChart` (`src/components/charts/ClientCategoryChart.tsx`): Horizontal bar chart categorizing clients into TV, Web, Mobile, Desktop, Autre via `categorizeClient()` heuristic.
   - All three charts integrated as a new dashboard block row with data computed inside `getDashboardMetrics()`.

26. **Library Grouping, Heatmap Fix, Telemetry Charts & PlaybackStop Hardening (Phase 26)**:
   - **Docker Backup EACCES Fix (Obj1)**: `docker-compose.yml` now sets `BACKUP_DIR=/data/backups` environment variable. `Dockerfile` now creates `/data/backups` with `mkdir -p` and `chown nextjs:nodejs` before switching to the `nextjs` user. This ensures the backup directory exists and has correct ownership in Docker, fixing the `EACCES: permission denied, mkdir '/app/backups'` error.
   - **Library Grouping — Series & Albums (Obj2)**: `src/app/media/page.tsx` completely reworked. The `buildMediaFilter()` now filters by `type` (not `collectionType`): "Films" tab → `Movie`, "Séries" tab → `Series`, "Musique" tab → `MusicAlbum`, "Tous" tab → `['Movie', 'Series', 'MusicAlbum']`. Individual Episodes, Audio tracks, and Seasons are excluded from the library grid. For Series, playback stats are aggregated via a 2-hop chain: `Season (parentId=SeriesId) → Episode (parentId=SeasonId)` with summed plays, duration, and DirectPlay counts. For Albums, Audio tracks with `parentId=AlbumId` are aggregated directly. Each card displays `childCount` (e.g. "42 épisodes" / "12 pistes"). A type badge (Série/Album) is overlaid on cards in the "Tous" tab.
   - **Sync Includes Season Type**: `src/lib/sync.ts` now fetches `Season` in `IncludeItemTypes` (`Movie,Series,Season,Episode,Audio,MusicAlbum`). Season items are stored with `type: "Season"` and `parentId` pointing to their parent Series. This enables the Episode→Season→Series aggregation chain used by the library grouping.
   - **Heatmap Full Year (Obj3)**: `src/components/charts/YearlyHeatmap.tsx` now imports `endOfYear` from date-fns and generates data from Jan 1 to Dec 31 (not just to today). Future dates get `count: 0, level: 0`, making all 12 month columns visible in `react-activity-calendar`.
   - **Episode→Series Quick Navigation (Obj4)**: `src/app/media/[id]/page.tsx` now renders prominent navigation buttons below the breadcrumb when viewing an Episode or Audio track. Buttons include "Voir la série : {seriesName}" (indigo), "Voir la saison" (violet), and "Voir l'album : {albumName}" (purple). New icons imported: `Tv`, `Music`, `Disc3` from lucide-react.
   - **Rename Labels + Telemetry Chart (Obj5)**: KPI card labels changed from "Chgts Audio" → "Changements Audio" and "Chgts Sous-titres" → "Changements Sous-titres". New `TelemetryChart` client component (`src/app/media/[id]/TelemetryChart.tsx`) using Recharts stacked BarChart showing pauses (yellow), audio changes (purple), and subtitle changes (cyan) per session date. Data is aggregated from `PlaybackHistory` entries grouped by `startedAt` date. The chart is displayed below the Drop-off chart when any telemetry data exists (`hasTelemetry` flag).
   - **PlaybackStop Detection Hardening (Obj6)**: (1) Webhook `PlaybackStop` handler now also deletes the `ActiveStream` record and its Redis key (`stream:{sessionId}`), preventing ghost sessions. Previously only the monitor handled ActiveStream cleanup. (2) Monitor Redis TTL increased from 30s to 60s to prevent premature key expiry during network hiccups. (3) Monitor now tracks telemetry (pause/audio/subtitle changes) for ongoing sessions via Redis state keys, matching the webhook's `PlaybackProgress` tracking — ensures telemetry is captured even when webhook events don't fire.

27. **BigInt Fix, Resolution Matrix, Dedup, Children Navigation & Short Music Logging (Phase 27)**:
   - **BigInt Backup Serialization Fix (Obj1)**: `JSON.stringify()` crashes when Prisma returns `BigInt` values (e.g. `Media.durationMs`, `ActiveStream.positionTicks`). Both `src/lib/autoBackup.ts` and `/api/backup/export/route.ts` now use a BigInt-safe replacer: `(key, val) => typeof val === 'bigint' ? val.toString() : val`. The import routes (`/api/backup/import/route.ts` and `/api/backup/auto/restore/route.ts`) now convert `durationMs` back to `BigInt()` when restoring media records. Auto-restore also preserves all fields (collectionType, genres, resolution, parentId, telemetry counters) that were previously dropped during restore.
   - **Resolution Matrix "Inconnu 100%" Fix (Obj2)**: Two-pronged fix: (1) `src/server/monitor.ts` now extracts video resolution from the live Jellyfin session's `NowPlayingItem.MediaStreams` (video stream Width → "4K"/"1080p"/"720p"/"SD") and writes it to the `Media.resolution` field via the existing `media.upsert()`. This fills in resolution for items that the bulk sync missed (Jellyfin sometimes omits `MediaSources` in large bulk queries). (2) `src/components/dashboard/DeepInsights.tsx` resolution chart now skips entries with `resolution: null` instead of counting them as "Inconnu". The "Inconnu" bucket only appears as a fallback when absolutely no resolution data exists.
   - **Duration Confusion & Duplicate Prevention (Obj3)**: (1) Webhook `PlaybackStop` now detects "fully watched" items: if `positionTicks >= runTimeTicks * 95%`, it uses `Math.min(ticksDuration, wallClockDuration)` to prevent logging the full media runtime when the user only rewatched part of it. (2) Monitor `PlaybackStart` block now checks for existing open PlaybackHistory (`endedAt: null`) for the same user+media before creating — duplicates are prevented even if both webhook and monitor fire simultaneously. (3) Monitor now detects **item changes within the same Jellyfin session** (e.g. auto-play next episode): compares the current `ItemId` against the previous one stored in Redis. When the item changes, the old PlaybackHistory is closed with proper duration and a new one is created for the new item.
   - **Short Music Track Logging (Obj5)**: Webhook `PlaybackStart` handler now creates a `PlaybackHistory` entry (with dedup guard: only if no open session exists for this user+media). Previously, only the monitor created PlaybackHistory on first detection — with 5s polling, tracks shorter than 5s could start and stop between polls and never be recorded. Now the webhook creates the entry immediately on `PlaybackStart`, and the webhook `PlaybackStop` or monitor stop handler properly closes it.
   - **Series→Seasons→Episodes / Album→Tracks Navigation (Obj4)**: `src/app/media/[id]/page.tsx` now renders a full children listing table when viewing a parent item (Series, Season, or MusicAlbum). Children are queried via `prisma.media.findMany({ where: { parentId: jellyfinMediaId } })`. The table displays: index, thumbnail + title (linked to child profile), type badge, resolution badge (hidden for music), session count, and total watch time. Each child row is clickable to navigate to its own profile page. KPI stats for parent items now aggregate playback data from all children (sum of sessions + duration), giving accurate totals for Series/Album-level statistics. New icons imported: `Play`, `Film`, `ListMusic` from lucide-react.

28. **Enriched Media Names, Progress Bar, Music UX & Telemetry Charts (Phase 28)**:
   - **Enriched Hierarchical Media Names (Obj1)**: Media titles now show full context everywhere. (1) `src/server/monitor.ts` enriches the Redis payload with `SeriesName`, `SeasonName`, `AlbumName`, `AlbumArtist`, `RunTimeTicks`, `IsPaused` extracted from `session.NowPlayingItem` and `session.PlayState`. (2) Dashboard live streams (`src/app/page.tsx`): `LiveStream` type extended with `mediaSubtitle`, `progressPercent`, `isPaused`. Redis parsing builds subtitles: "SeriesName — SeasonName" for TV episodes, "AlbumArtist — AlbumName" for music tracks. (3) Logs page (`src/app/logs/page.tsx`): Added 2-hop parent chain lookup via `Media.parentId` → `jellyfinMediaId`. `getMediaSubtitle()` helper returns "Series — Season" for episodes, parent title for seasons, album for tracks. Media cell shows subtitle below the title.
   - **Live Progress Bar + Pause Indicator (Obj4)**: Live stream cards now display a progress bar beneath the media info. Purple bar when playing, yellow when paused. Percentage calculated from `PlaybackPositionTicks / RunTimeTicks * 100`, clamped 0-100%. Paused streams display a ⏸ emoji indicator.
   - **Music-Adaptive Media Profile (Obj2)**: `src/app/media/[id]/page.tsx` uses `isMusic = ['Audio', 'MusicAlbum'].includes(media.type)` to conditionally hide irrelevant sections for music: (1) "Changements Audio" and "Changements Sous-titres" KPI cards hidden, (2) Subtitle language distribution card hidden, (3) Subtitle column removed from detailed history table, (4) Telemetry chart zeroes out audio/subtitle bars for music (pauses only), (5) KPI grid adjusts from 3 cols (films/series) to 4 cols (music, includes Pauses card).
   - **Telemetry as Visual Charts for Films/Series (Obj3)**: For non-music media, the 3 telemetry KPI number cards (Pauses, Changements Audio, Changements Sous-titres) are replaced by a "Résumé Télémétrie" visual card with horizontal progress bars. Each bar shows the metric proportional to the max, color-coded (yellow=pauses, purple=audio, cyan=subtitles) with icons and values. The existing per-session TelemetryChart stacked BarChart is preserved below.

36. **Dockerfile Secrets, Ghost Sessions Fix, Lectures par Bibliothèque (Phase 36)**:
   - **Dockerfile Secrets Fix**: Docker build warning `SecretsUsedInArgOrEnv: Do not use ARG or ENV instructions for sensitive data (ENV "NEXTAUTH_SECRET")` fixed. Changed `ENV DATABASE_URL` and `ENV NEXTAUTH_SECRET` from permanent `ENV` (persisted in image layers) to `ARG` (build-only, discarded after build). `npm run build` now receives the secret inline: `RUN NEXTAUTH_SECRET=${NEXTAUTH_SECRET} npm run build`. The secret is never baked into the final Docker image.
   - **Ghost "En cours" Sessions Fix**: Comprehensive 3-layer defense against phantom active sessions appearing when nothing is playing on Jellyfin:
     - **Layer 1 — Startup Cleanup Enhanced**: `startMonitoring()` now also flushes ALL orphan Redis `stream:*` keys (not just those matching DB records), and closes any `PlaybackHistory` entries with `endedAt: null` (capped at 24h max duration to prevent absurd values from crash scenarios).
     - **Layer 2 — Cross-Validation per Poll**: Every `pollJellyfinSessions()` call now compares ALL `ActiveStream` DB records against Jellyfin's current session IDs. Any DB record NOT present in Jellyfin's response is immediately cleaned (PlaybackHistory closed + ActiveStream deleted + Redis key removed). This replaces the old 2-minute stale threshold which left ghosts visible for up to 2 minutes.
     - **Layer 3 — Redis Orphan Cleanup**: After cross-validation, all Redis `stream:*` keys not matching a current Jellyfin session are deleted. This catches edge cases where Redis keys persist without DB records.
   - **Lectures par Bibliothèque Chart**: New `LibraryDailyPlaysChart` component (`src/components/charts/LibraryDailyPlaysChart.tsx`) — LineChart with one curve per library category (Films, Séries, Musique, Livres, Total) using distinct colors (blue, green, yellow, purple, gray). Interactive legend allows toggling curves on/off. Categories with 0 plays across the entire period are auto-hidden. `trendMap` in `getDashboardMetrics()` now tracks per-category play counts (`moviePlays`, `seriesPlays`, `musicPlays`, `booksPlays`) alongside existing volume hours. Chart added to "Vue d'ensemble" tab between "Volumes et Vues Historiques" and the Yearly Heatmap.

29. **Wrapped Enrichment, Backup Fix, Live Auto-Refresh, Image Fix & Clickable Stats (Phase 29)**:
   - **Wrapped Spotify-Style Enrichment (Obj1)**: `src/app/wrapped/[userId]/page.tsx` completely rewritten with enriched data computation. New data fields: `peakHour` (most active hour via hourCounts), `peakHourSessions` (count), `monthlyHours` (array of 12 months with name + hours), `topSeries` (aggregated from Episode→Season→Series via 2-hop parent chain), `topArtists` (aggregated from Audio→Album→Artist). `topMedia` changed from `string[]` to `{ title: string; seconds: number }[]` (top 5 instead of top 3). `topGenres` now returns top 5 with counts. `WrappedClient.tsx` rewritten with new sub-components: `RankedList` (proportional gradient bars), `MonthlyChart` (12-bar mini chart), `GenreChart` (horizontal colored bars). New slides: Monthly breakdown (bar chart + best month highlight), Peak hour (with session count), Top genres (genre n°1 + full chart), Top 5 all media (with duration bars), Top Series (conditional), Top Artists/Albums (conditional), Épisodes Favoris. Auto-advance changed from 6s to 8s. Bottom controls show `{current} / {total}` slide counter.
   - **Backup Deletion "Erreur réseau" Fix (Obj2)**: Root cause — `src/app/api/backup/auto/delete/route.ts` was completely missing (empty directory). Created the missing route with POST handler, `getServerSession` auth check, `path.basename()` for path traversal protection, filename validation (`jellytulli-auto-*.json`), `existsSync` + `unlinkSync` for deletion, proper error handling (400/401/404/500).
   - **Live Streams Auto-Refresh (Obj3)**: Dashboard "En Direct" section extracted from server-rendered `page.tsx` into a new `LiveStreamsPanel` client component (`src/components/dashboard/LiveStreamsPanel.tsx`). Component polls `/api/streams` every 10 seconds via `useEffect` + `setInterval`. New API route `src/app/api/streams/route.ts` reads Redis `stream:*` keys with the same enrichment logic (subtitles, progress, pause detection). Initial data passed as `initialStreams` / `initialBandwidth` props from server for SSR hydration. Unused imports (`FallbackImage`, `PlayCircle`, `getJellyfinImageUrl`) cleaned from `page.tsx`.
   - **DirectPlay Label Clarification (Obj4)**: KPI card renamed from "Efficacité DirectPlay" to "DirectPlay". Value now shows `{percent}% DP` with a small "DP" suffix. Description changed from "Contenus non transcodés (Période)" to "Lecture sans transcodage (Période)".
   - **Logs Image Fix (Obj5)**: `FallbackImage` in `src/app/logs/page.tsx` was missing `fill` and `className="object-cover"` props, causing images to not display or get cropped. Both props added. All other `FallbackImage` usages verified correct (UserRecentMedia, media pages, LiveStreamsPanel).
   - **Clickable Stats Drill-Down (Obj6)**: Category breakdown cards (Films, Séries, Musique, Livres) in the dashboard now wrap in `<Link>` to `/logs?type={Type}` with hover border animation. Logs page updated to accept `type` query parameter for filtering by media type, with an active filter badge and "Supprimer le filtre" link. Top Users ("Les Fidèles") now link to `/users/{jellyfinUserId}` profile pages with hover highlight. "Temps Global" KPI card now links to `/logs` page. `topUsers` data enriched with `jellyfinUserId` field from Prisma query.

30. **CI/CD Docker avec GitHub Actions ARM64 (Phase 30)**:
   - **GitHub Actions Workflow**: `.github/workflows/docker-publish.yml` created. Triggers on push to `main` and manual `workflow_dispatch`. Uses `docker/setup-qemu-action` for ARM64 emulation on x86 runners, `docker/setup-buildx-action` for multi-platform builds, `docker/login-action` for GHCR auth via `GITHUB_TOKEN`, `docker/metadata-action` for automatic tag generation (`latest` + short SHA), and `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`, `provenance: false` (fixes GHCR multi-arch manifest), and GitHub Actions cache (`cache-from/to: type=gha`). The image is pushed to `ghcr.io/<owner>/<repo>`.
   - **Docker Compose Refactored**: `docker-compose.yml` `build:` directive removed entirely. Replaced by `image: ghcr.io/maelmoreau21/jellytulli:latest` pointing to the pre-built GHCR image. Clear comments explain how to substitute the GitHub username. The Raspberry Pi no longer needs to build the image locally — `docker compose pull && docker compose up -d` is sufficient for updates.
   - **README.md Complete Rewrite**: Replaced the default Next.js boilerplate README with a comprehensive project documentation including: feature overview table, tech stack table, step-by-step installation guide (clone, configure env, docker compose up), architecture ASCII diagram (GitHub Actions → GHCR → Raspberry Pi → PostgreSQL/Redis → Jellyfin), Jellyfin webhook configuration instructions, update procedure (`docker compose pull`), local development setup, Docker volumes reference, and CI/CD badges (build status + GHCR link).

31. **Suppression du Setup Wizard — Configuration par Variables d'Environnement (Phase 31)**:
   - **Setup Wizard supprimé**: `src/app/setup/page.tsx` et `src/app/api/setup/route.ts` entièrement supprimés. Aucun wizard de configuration au premier démarrage — l'URL Jellyfin et la clé API sont désormais fournies exclusivement via les variables d'environnement `JELLYFIN_URL` et `JELLYFIN_API_KEY` dans `docker-compose.yml`.
   - **docker-compose.yml**: Deux nouvelles variables d'environnement ajoutées : `JELLYFIN_URL=http://jellyfin:8096` et `JELLYFIN_API_KEY=your-jellyfin-api-key`.
   - **Prisma Schema**: Champs `jellyfinUrl String?` et `jellyfinApiKey String?` retirés du modèle `GlobalSettings`. Le modèle ne conserve plus que les paramètres configurables à chaud (Discord, excludedLibraries).
   - **8 fichiers migrés vers `process.env`**: `src/app/api/auth/[...nextauth]/route.ts` (authentification Jellyfin), `src/lib/jellyfin.ts` (proxy images), `src/server/monitor.ts` (polling sessions), `src/lib/sync.ts` (synchronisation bibliothèque), `src/app/api/jellyfin/kill-stream/route.ts` (arrêt de flux), `src/app/media/[id]/page.tsx` (détails média), `src/app/login/page.tsx` (suppression du redirect /setup), `src/middleware.ts` (suppression de `api/setup|setup|` du matcher regex).
   - **Bug fix — PrismaClient anti-pattern**: `src/lib/jellyfin.ts` `fetchJellyfinImage()` créait un `new PrismaClient()` via `require('@prisma/client')` à chaque appel (fuite de connexions). Remplacé par `process.env.JELLYFIN_URL` / `process.env.JELLYFIN_API_KEY` — plus aucune dépendance Prisma dans ce fichier.
   - **Backup rétrocompatibilité**: `src/app/api/backup/import/route.ts` strip les champs `jellyfinUrl`/`jellyfinApiKey` des anciens backups JSON avant insertion (destructuration). `src/app/api/backup/auto/restore/route.ts` upsert nettoyé — ne restaure plus les champs Jellyfin supprimés.
   - **Imports nettoyés**: Imports `prisma` inutilisés retirés de `[...nextauth]/route.ts` et `kill-stream/route.ts`. Import `redirect` retiré de `login/page.tsx`.

32. **Tooltip Fix, Music Duration, Album Artwork & Adaptive Polling (Phase 32)**:
   - **Recharts Tooltip Visibility Fix**: ALL 17 chart files standardized with proper dark-theme tooltip styling: `contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#f4f4f5' }}`, `labelStyle={{ color: '#a1a1aa' }}`, `itemStyle={{ color: '#e4e4e7' }}`. Previously, many tooltips had black text on a dark background because Recharts defaults to `color: #000`. Files fixed: CompletionRatioChart, MonthlyWatchTimeChart, ClientCategoryChart, DashboardChart, PlatformDistributionChart, GenreDistributionChart, ActivityByHourChart, TranscodeHourlyChart, ComposedTrendChart, MediaDropoffChart, TelemetryChart, StandardMetricsCharts (4 instances), StackedMetricsCharts (2 instances), CategoryPieChart, StreamProportionsChart, UserActivityChart, VolumeAreaChart.
   - **Music Duration Bug Fix**: Monitor's `itemChanged` handler (music auto-play changing tracks within a Jellyfin session) was using `PlaybackPositionTicks` from the NEW track (just started, ~0 ticks) to compute the OLD track's duration — resulting in 0 min. Fixed to use wall clock time: `durationS = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)`.
   - **Music Album Artwork Fallback**: Full image fallback chain implemented for music tracks (which rarely have their own Primary image):
     - `src/server/monitor.ts`: Extracts `AlbumId`, `SeriesId`, `SeasonId` from `session.NowPlayingItem` and stores in Redis payload.
     - `src/app/api/streams/route.ts`: Passes `parentItemId: AlbumId || SeriesId || SeasonId` in API response.
     - `src/components/dashboard/LiveStreamsPanel.tsx`: `getImageUrl()` accepts optional `fallbackId`; image src passes `stream.parentItemId` as fallback.
     - `src/app/page.tsx` (SSR): Extracts `parentItemId` from Redis payload for hydration consistency.
     - `src/app/logs/page.tsx`: Image src now includes `&fallbackId=${log.media.parentId}` for music tracks (parentId = AlbumId from DB).
   - **Adaptive Monitor Polling**: Replaced fixed `setInterval(5000)` with self-scheduling `setTimeout` loop. `pollJellyfinSessions()` now returns `boolean` indicating active sessions. Interval: 1000ms with active sessions (real-time tracking), 5000ms when idle (resource-efficient). Constants: `POLL_INTERVAL_ACTIVE = 1000`, `POLL_INTERVAL_IDLE = 5000`. On error, falls back to idle interval.

33. **Docker PUID/PGID, Audio/Subtitle Fix, Monitor Reliability & /setup Redirect (Phase 33)**:
   - **Docker PUID/PGID Support**: Dockerfile installs `su-exec` and `shadow` for runtime UID/GID mapping. `USER nextjs` directive removed — container starts as root. `docker-entrypoint.sh` rewritten: reads `PUID`/`PGID` env vars (default 1001), uses `usermod`/`groupmod` to remap the `nextjs` user at runtime, fixes ownership of `/app` and `/data/backups`, then runs Prisma and Node.js via `su-exec $PUID:$PGID`. `docker-compose.yml` gains `PUID=1000` and `PGID=1000` environment variables.
   - **`/setup` Redirect Catch-All**: Created `src/app/setup/page.tsx` with `redirect("/")` to catch stale browser bookmarks, cached clients, or old Docker images that still reference the removed wizard. Prevents 404 on `/setup`.
   - **`serverExternalPackages` Fix**: Added `node-cron` and `geoip-country` to `next.config.ts` `serverExternalPackages`. These packages use platform-specific files (cron scheduler, binary GeoIP DB) that Next.js standalone output doesn't bundle automatically. Without this, the monitor and cron jobs silently fail in Docker.
   - **Audio/Subtitle Capture Fix**: Root cause — `AudioCodec` was extracted exclusively from `TranscodingInfo` (only populated for transcoded streams). For DirectPlay/DirectStream, audio codec was always null. Fix: Also extract audio codec from `NowPlayingItem.MediaStreams` using `PlayState.AudioStreamIndex`. New variable `AudioCodecFromStream` from MediaStreams, combined with `TranscodeAudioCodec` via fallback chain: `AudioCodec = AudioCodecFromStream || TranscodeAudioCodec`. Also improved: audio stream fallback now looks for `IsDefault` first; `DisplayTitle` used as language fallback when `Language` is null.
   - **Audio/Subtitle Progress Updates**: Previously, `audioLanguage`/`audioCodec`/`subtitleLanguage`/`subtitleCodec` were only written once on PlaybackHistory creation. If MediaStreams data wasn't available on the first poll (common), these fields stayed null forever. Fix: The telemetry tracking section (existing sessions) now also updates these 4 fields whenever they become available or change (user switches audio/subtitle track mid-playback).
   - **Live Streams Audio/Subtitle Display**: Redis payload enriched with `AudioLanguage`, `AudioCodec`, `SubtitleLanguage`, `SubtitleCodec`. Streams API (`/api/streams`) passes all 4 fields. `LiveStreamsPanel` interface updated; live stream cards now display audio language+codec and subtitle language+codec inline (e.g. "🔊 FRE (aac) • 💬 ENG (subrip)"). Dashboard SSR `LiveStream` type aligned with all new fields for hydration consistency.

34. **GHCR Auto-Publish, Dockerfile node-cron Fix & OCI Labels (Phase 34)**:
   - **Dockerfile `node-cron` manquant**: `node-cron` était listé dans `serverExternalPackages` (Next.js ne le bundle pas dans standalone) mais n'était jamais copié dans l'image Docker. Résultat : l'`instrumentation.ts` crashait silencieusement au runtime, le moniteur et les tâches cron ne démarraient jamais. Ajouté : `COPY --from=builder /app/node_modules/node-cron ./node_modules/node-cron`.
   - **OCI Labels**: Ajout de `org.opencontainers.image.source`, `org.opencontainers.image.description`, `org.opencontainers.image.licenses` au Dockerfile. Ces labels permettent à GHCR de lier automatiquement le package Docker au dépôt GitHub source, rendant la gestion des permissions et la visibilité plus simple.
   - **GHCR Package Public Automatique**: Nouvelle étape 7 dans `.github/workflows/docker-publish.yml` — après le push de l'image, un appel `curl` à l'API GitHub Packages (`PATCH /user/packages/container/{name}`) met automatiquement la visibilité du package sur `public`. Utilise `GITHUB_TOKEN` natif, pas de secret supplémentaire requis. Avec un message fallback si l'API échoue (première publication nécessite une action manuelle dans les paramètres GitHub).

35. **Top Séries Fix, Surveillance d'Activité, Planificateur de Tâches & Error Suppression (Phase 35)**:
   - **Top Séries Aggregation Fix**: `DeepInsights.tsx` showed individual episode names in "Top Séries" instead of series names. Rewrote the series categorization with a 2-hop parent chain resolution: Episode → Season (via `parentId`) → Series. Episodes are now aggregated by their parent Series title. The query fetches top 100 media (was 30) for better aggregation, resolves `parentId` and `jellyfinMediaId`, builds `seasonMap` and `seriesMap` lookup tables, then aggregates play counts and durations per series. Result: "Top Séries" now correctly shows "Game of Thrones" instead of "S01E05 - The Battle".
   - **Surveillance d'Activité (Activity Monitoring)**: New settings card in `/settings` page allowing real-time configuration of monitor polling intervals:
     - `monitorIntervalActive` (ms): polling frequency when sessions are active (default: 1000ms, min: 500ms)
     - `monitorIntervalIdle` (ms): polling frequency when idle (default: 5000ms, min: 1000ms)
     - Changes applied in real-time without server restart via `updateMonitorIntervals()` export from `monitor.ts`
     - Prisma schema: Added `monitorIntervalActive Int @default(1000)` and `monitorIntervalIdle Int @default(5000)` to `GlobalSettings`
     - Monitor loads initial values from DB on startup in `startMonitoring()`
     - Settings API (`/api/settings`) reads/writes the new fields and calls `updateMonitorIntervals()` on save
   - **Planificateur de Tâches (Task Scheduler)**: New settings card replacing the old "Synchronisation Jellyfin" card with 3 manually-triggerable tasks:
     - **Synchronisation du contenu récent**: Calls `/api/sync` with `mode: 'recent'` — syncs only media added in the last 7 days (uses Jellyfin `MinDateCreated` filter). Quick partial sync.
     - **Synchronisation complète avec Jellyfin**: Calls `/api/sync` with `mode: 'full'` — full sync of all users + media. Automatic via cron at 3:00 AM daily.
     - **Sauvegarde de JellyTulli**: Calls `/api/backup/auto/trigger` — full database backup. Automatic via cron at 3:30 AM daily.
     - Each task shows colored icon, description, schedule info, status feedback, and a "Lancer" trigger button.
   - **Sync Recent Mode**: `syncJellyfinLibrary()` in `src/lib/sync.ts` accepts optional `{ recentOnly: boolean }` parameter. When `recentOnly`, appends `&MinDateCreated={7daysAgo}&SortBy=DateCreated&SortOrder=Descending` to the Jellyfin Items query. `POST /api/sync` now reads `{ mode: 'recent' | 'full' }` from body.
   - **Monitor Error Suppression**: `scheduleNextPoll()` in `monitor.ts` now uses `POLL_INTERVAL_ERROR = 30s` backoff when Jellyfin is unreachable. Only first error logged with detail, then reminder every ~30 min. Recovery message logged when connection restored. Startup logs `JELLYFIN_URL` for debug visibility.
   - **Sync Error Clarity**: `sync.ts` catch block detects `ECONNREFUSED`/`fetch failed` and logs a clear French message: "Jellyfin injoignable — vérifiez JELLYFIN_URL" with Docker networking guidance.
   - **docker-compose.yml Comments**: Added inline comments explaining `JELLYFIN_URL` must be the real server IP (not localhost/127.0.0.1) when running in Docker.

37. **Top Analytics Fix, RBAC Non-Admin Dashboard, UX Features & Live Timeline (Phase 37)**:
   - **Top Séries Fix (DeepInsights.tsx)**: Root cause — the `getSeriesTitle()` fallback `|| media.title` was showing episode names when parent chain resolution failed because only parentIds from the top 100 episodes were loaded. Fix: preload ALL Season, Series, and MusicAlbum records upfront via 3 separate Prisma queries. `getSeriesTitle()` now resolves Episode → Season (via seasonMap) → Series (via seriesMap), with fallback to direct series lookup. Episodes with no resolved series are **excluded** from Top Séries instead of showing episode names. Query `take` increased from 100 to 200.
   - **Top Albums & Top Genres (DeepInsights.tsx)**: "Top Musiques" renamed to "Top Albums" — Audio tracks aggregated by album parent via `albumMap` lookup. New `topGenres` computation: aggregates plays/duration by genre across all media types via `genreAgg` Map. Returns top 10 genres with plays and duration. New "Top Genres" section with horizontal progress bars in 2-column grid, color-coded (blue for plays, orange for duration).
   - **RBAC Non-Admin Dashboard**: Non-admin users redirected from `/` to `/users/{jellyfinUserId}` (was `/wrapped/{id}`). User profile page (`/users/[id]`) gains RBAC guard: non-admins can only view their own profile (others redirected to own profile). 
   - **Sidebar Role-Based Navigation (Sidebar.tsx)**: Uses `useSession()` from `next-auth/react` via `AuthProvider` wrapper in layout. Admin nav: Dashboard, Récemment Ajouté, Bibliothèque, Logs, Utilisateurs, Nettoyage, Paramètres. Non-admin nav: Mon Profil (`/users/{id}`), Mon Wrapped (`/wrapped/{id}`). JellyTulli logo links to role-appropriate home. Global SearchBar component integrated in sidebar.
   - **AuthProvider (src/components/AuthProvider.tsx)**: New client component wrapping `<SessionProvider>` from `next-auth/react`. Layout.tsx updated to wrap content with AuthProvider for client-side session access.
   - **Middleware Updates**: `ADMIN_LIST_PATHS` expanded: `/users`, `/logs`, `/media`, `/newsletter`, `/recent`. Non-admin exact match on these paths redirects to `/users/{id}` (but sub-paths like `/users/[id]` remain accessible for own profile).
   - **Stats Aujourd'hui Banner (page.tsx)**: Compact banner above dashboard tabs showing real-time today stats: plays count, watch hours, and active users. Computed via separate `todayStart` query in `getDashboardMetrics()` regardless of selected timeRange. Icons: CalendarDays, PlayCircle, Clock, Users from lucide-react.
   - **Period Comparison Deltas (page.tsx)**: Extended `getDashboardMetrics()` with `totalPlays`, `playsGrowth`, `currentActiveUsers`, `activeUsersGrowth` metrics. New "Total Lectures" KPI card with growth indicator. "Pic de Charge" replaced by "Utilisateurs Actifs" KPI with period comparison delta (↑/↓ percentage). `userId` added to histories select for active users computation.
   - **Récemment Ajouté Page (/recent)**: New page showing recently added media ordered by `createdAt DESC`. Grid layout with poster, type badge, "NOUVEAU" badge for items < 7 days old, genres, play count. Tabs for Tous/Films/Séries/Musique filtering. Pagination. Admin-only (RBAC guard). Added to sidebar navigation with Sparkles icon.
   - **Recherche Globale**: New API route `/api/search?q=...` searching `Media.title` (parent-level: Movie, Series, MusicAlbum) and `User.username` (admin only). `SearchBar` client component in Sidebar with 300ms debounce, dropdown results grouped by Médias/Utilisateurs, type icons, close-on-click-outside. Non-admins see only media results.
   - **Refonte En Direct — Timeline View (LiveStreamsPanel.tsx)**: Dual display mode: card view for ≤2 streams, Gantt-style timeline for ≥3 streams. Timeline shows user avatar (initial), username, media title, play method badge (TC/DP), progress percentage, and colored horizontal progress bar. 8 distinct colors cycle across streams. Toggle button allows switching between views. Extracted `StreamCard` and `StreamTimeline` sub-components.

38. **Dashboard UX Overhaul, Chart Fixes & User Profile Enrichment (Phase 38)**:
   - **Series/Season Stats Fix (media/[id]/page.tsx)**: Root cause — Series children are Seasons (no playbackHistory). Fix: 2-hop grandchild query fetches Episodes via Season IDs. New `effectiveHistory` array merges direct + all descendant playbackHistory. All stat aggregations (telemetry, drop-off, timeline, users, languages) now use `effectiveHistory`. Detailed history table limited to `.slice(0, 200)`.
   - **User History Pagination (UserRecentMedia.tsx)**: Complete rewrite. Server-side Prisma pagination (50 items/page) via `historyPage` URL search param. 2-hop parent chain resolution (Episode → Season → Series, Audio → Album → Artist). Media titles are clickable `<Link>` to `/media/{id}`. Progress bar color-coded (green ≥80%, amber ≥40%, red <40%). Removed IP column and aggregation grouping — shows individual sessions.
   - **Enriched User Profile (UserInfo.tsx)**: Expanded from 6 to 11 stat cards. New stats: avg session duration (min), completion rate (%), peak activity (day + hour), best activity streak (consecutive days), unique content count breakdown (🎬/📺/🎵), most-watched media (title + session count + minutes, col-span-2). Prisma query now selects `startedAt`, `durationMs`, `jellyfinMediaId` for computations.
   - **ComposedTrendChart Improvement**: Height increased 300→400px. Area `fillOpacity` reduced 0.6→0.25 for better layer visibility. `totalViews` changed from gray `<Bar>` to dashed `<Line>` (stroke="#a1a1aa", strokeDasharray="6 3") for clarity.
   - **YearlyHeatmap Log Scale + Library Filters**: Color intensity switched from linear ratio to logarithmic scale (`Math.log(count+1)/Math.log(maxCount+1)`) with adjusted thresholds (0.3/0.55/0.8). New `dataByType` prop: HeatmapWrapper now fetches `collectionType`/`type` per session, builds per-library data sets. YearlyHeatmap shows pill-shaped filter buttons (All + per library type) with library-specific colors.
   - **LibraryDailyPlaysChart**: Height increased 300→350px. Container `overflow-hidden` added.
   - **AudioLanguage Codec Filter (GranularAnalysis.tsx)**: `isValidLang()` regex filter (`/^[A-Z]{2,3}$/`) excludes codec strings like "FLAC - STEREO", "AAC - 5.1" from audio language pie chart. Only valid ISO 639 codes pass through.
   - **StandardPieChart Fix**: `outerRadius` reduced 100→80, `cy` offset to 45%. Label truncation: names >12 chars get `…`. `fontSize={11}`. Added `<Legend>` component with zinc-300 text. Prevents label overflow on small containers.
   - **Abandon Segments Redesign (GranularAnalysis.tsx)**: Replaced `StandardBarChart` horizontal with custom progress bars (per-segment colored bars with percentage). Categories refined: <10% "Zappé", 10-50% "Abandonné", 50-80% "Presque", ≥80% "Terminé" (was: <10/10-25/25-80/80+).
   - **Worst Completion Interactive**: Replaced `StandardBarChart` with clickable `<a href="/media/{id}">` items. Each item shows: truncated title (hover:indigo), completion%, session count, color-coded progress bar. `mediaId` now tracked in `mediaDropMap` and returned to client.
   - **Responsive Chart Overflow**: Added `overflow-hidden` to all chart container `<div>` wrappers in `page.tsx`. Added `min-w-0` to grid containers (volumes, platforms rows). Prevents charts from overflowing card boundaries on language change or small viewports.
   - **Logs Column Toggle (ColumnToggle.tsx)**: New client component. 7 toggleable columns: date, user, media, clientIp, status, codecs, duration. State persisted via `cols` URL search param. Dropdown with checkboxes, minimum 2 columns enforced. Table `min-w` reduced from 1000px to 600px for better mobile.
   - **i18n Updates**: Added ~15 new keys across `userProfile` (completionRate, avgCompletion, avgPerSession, peakActivity, mostActiveTime, bestStreak, days, consecutiveDays, uniqueContent, mostWatched, dayNames), `charts` (all), `granular` (abandoned, almost), `logs` (columns, toggleColumns) namespaces in both fr.json and en.json.

---

## Phase Sécurité — Audit DevSecOps Complet

Audit de sécurité réalisé par un agent IA (rôle Ingénieur Cybersécurité Sénior) couvrant l'ensemble de la base de code. Toutes les vulnérabilités identifiées ont été corrigées.

### Fichiers créés
- **`src/lib/auth.ts`** — Helpers centralisés `requireAuth()` et `requireAdmin()` utilisant `getServerSession`. Fournit une couche defense-in-depth systématique pour toutes les routes API au-delà du middleware.
- **`src/lib/rateLimit.ts`** — Rate limiter Redis pour les tentatives de connexion. Bloque une IP après 5 échecs dans une fenêtre de 15 minutes. Fail-open si Redis est indisponible.

### 1. RBAC & Middleware (`middleware.ts`)
- **Avant** : Seul `/api/admin` était bloqué pour les non-admins côté middleware.
- **Après** : `ADMIN_API_PATHS` étendu pour bloquer `/api/settings`, `/api/sync`, `/api/backup`, `/api/streams`, `/api/hardware`, `/api/jellyfin/kill-stream` au niveau middleware.
- Double protection : middleware + checks explicites dans chaque route (defense-in-depth).

### 2. Admin Checks sur toutes les routes API
Routes ayant reçu un `requireAdmin()` explicite (9 routes) :
- `/api/settings` (GET + POST) — était ouvert à tous les utilisateurs authentifiés
- `/api/sync` (POST) — permettait à n'importe qui de déclencher une sync lourde (DoS)
- `/api/streams` (GET) — exposait les sessions de tous les utilisateurs (vie privée)
- `/api/hardware` (GET) — divulguait les métriques serveur
- `/api/backup/export` (GET) — **CRITIQUE** : permettait le téléchargement de toute la BDD (IPs, activités)
- `/api/backup/import` (POST) — **CRITIQUE** : permettait l'écrasement complet de la BDD
- `/api/backup/auto` (GET), `/auto/trigger` (POST), `/auto/restore` (POST), `/auto/delete` (POST)
- `/api/jellyfin/kill-stream` (POST) — IDOR : n'importe quel utilisateur pouvait tuer le stream de n'importe qui

### 3. Webhook Jellyfin — Authentification
- **Avant** : Endpoint `/api/webhook/jellyfin` totalement ouvert. N'importe qui pouvait injecter des utilisateurs, médias et historiques factices.
- **Après** : Authentification via `JELLYFIN_WEBHOOK_SECRET` (variable d'environnement). Supporte Bearer token (header `Authorization`) ou query param `?token=`. Rétro-compatible (log warning si non configuré). A configurer dans le plugin Webhook de Jellyfin.

### 4. IDOR Corrigé
- **`/api/jellyfin/kill-stream`** : Désormais admin-only (était accessible à tous les utilisateurs authentifiés).
- **`/wrapped/[userId]`** : Un non-admin ne peut plus voir le Wrapped d'un autre utilisateur. Vérification `sessionUserId !== userId` ajoutée.

### 5. SSRF & Validation d'entrées (`/api/settings`)
- **Discord Webhook URL** : Validée strictement — doit être HTTPS et pointer vers `discord.com` ou `discordapp.com` uniquement. Empêche l'injection d'URLs internes (SSRF vers `localhost`, `169.254.169.254`, etc.).
- **`discordAlertCondition`** : Validée contre une liste blanche (`ALL`, `TRANSCODE_ONLY`, `NEW_IP_ONLY`).
- **`monitorIntervalActive`** : Borné entre 500ms et 60000ms (empêche DoS par polling rapide).
- **`monitorIntervalIdle`** : Borné entre 1000ms et 300000ms.

### 6. Path Traversal (`/api/jellyfin/image`)
- **Avant** : Les paramètres `type`, `itemId`, `fallbackId` étaient injectés directement dans l'URL Jellyfin. `type=../../admin` = path traversal.
- **Après** : `type` validé contre une allowlist (`Primary`, `Thumb`, `Backdrop`, `Banner`, `Logo`, `Art`). `itemId` et `fallbackId` validés par regex UUID hex 32 chars. `encodeURIComponent` appliqué en plus.

### 7. Fuite de clé API Jellyfin
- **Avant** : `JELLYFIN_API_KEY` passée en query param (`?api_key=...`) dans les appels à l'API Jellyfin (`fetchJellyfinImage`, `kill-stream`). Risque de log par reverse proxies.
- **Après** : Clé transmise via le header `X-Emby-Token` (standard Jellyfin).

### 8. Rate Limiting Login (Brute Force Protection)
- **Avant** : Aucune protection contre le brute force. Tentatives illimitées à pleine vitesse.
- **Après** : Rate limiter Redis dans NextAuth `authorize()`. 5 tentatives max par IP dans une fenêtre de 15 minutes. Compteur réinitialisé après login réussi. IP extraite de `x-forwarded-for` / `x-real-ip`.

### 9. Session JWT
- **Avant** : `maxAge` = 30 jours. Un JWT compromis restait exploitable pendant 1 mois.
- **Après** : `maxAge` = 7 jours.

### 10. Validation fichiers backup
- `/api/backup/auto/restore` : Ajout de la validation du préfixe `jellytulli-auto-` et de l'extension `.json` (aligne avec `/auto/delete`).

### Résultats de l'audit (aucune action nécessaire)
- **Injections SQL** : Aucun `$queryRaw` / `$executeRaw` dans le code. Toutes les requêtes Prisma sont paramétrées ✅
- **XSS** : Aucun `dangerouslySetInnerHTML` dans aucun composant ✅
- **Data Leakage (schéma)** : Le modèle `User` Prisma ne contient pas de champs sensibles (pas de token/password stocké) ✅
- **Variables d'env** : Aucun `NEXT_PUBLIC_` contenant des secrets. Aucun secret exposé côté client ✅
- **Setup page** : Redirige vers `/`, aucune faille ✅

### Variable d'environnement à ajouter
```env
# Secret partagé pour authentifier les webhooks Jellyfin
# À configurer aussi dans le plugin Webhook de Jellyfin (header Authorization: Bearer <secret>)
JELLYFIN_WEBHOOK_SECRET=un-secret-long-et-aleatoire
```

---

## Phase i18n — Internationalisation Complète FR/EN avec next-intl

Conversion intégrale de l'interface utilisateur du français codé en dur vers un système d'internationalisation bilingue (FR/EN) utilisant **next-intl v4.8.3**.

### Architecture i18n
- **Framework** : `next-intl` v4.8.3 avec détection de locale par cookie (pas de préfixe URL)
- **Fichiers de traduction** : `messages/fr.json` et `messages/en.json` (~620+ clés chacun)
- **Configuration** : `src/i18n/request.ts` — lecture du cookie `locale` (défaut: `fr`), chargement dynamique des messages JSON
- **Plugin Next.js** : `createNextIntlPlugin` intégré dans `next.config.ts`
- **Provider** : `NextIntlClientProvider` dans `src/app/layout.tsx` avec `locale` et `messages` injectés côté serveur
- **Sélecteur de langue** : Composant `LanguageSwitcher` intégré dans la sidebar, écrit le cookie `locale` et recharge la page
- **Préférence utilisateur** : Champ `defaultLocale` dans `GlobalSettings` (Prisma) pour persister la langue par défaut

### Patterns de traduction
- **Server Components** : `const t = await getTranslations('namespace')` depuis `next-intl/server`
- **Client Components** : `const t = useTranslations('namespace')` depuis `next-intl`
- **Locale pour date-fns** : `getLocale()` / `useLocale()` → import dynamique `fr` ou `enUS` depuis `date-fns/locale`
- **Formatage riche** : `t.rich('key', { count, bold: (chunks) => <span className="...">{chunks}</span> })` pour les tags inline `<bold>`, `<accent>`
- **Tableaux** : next-intl ne supporte pas les arrays JSON → stockage en chaînes séparées par virgules (`"Lun,Mar,Mer,..."`) et `.split(',')` au runtime
- **Contrainte `unstable_cache`** : Les fonctions dans `unstable_cache` ne peuvent pas appeler `getTranslations`. Solution : utiliser des clés neutres (indices numériques, clés anglaises courtes) dans les données cachées, puis traduire post-cache au moment du rendu via `.map()`

### Namespaces de traduction (22 namespaces)
| Namespace | Fichiers couverts |
|---|---|
| `common` | Textes partagés (chargement, erreurs, périodes) |
| `nav` | Navigation sidebar |
| `search` | Barre de recherche globale |
| `timeRange` | Sélecteur de période temporelle |
| `dashboard` | page.tsx (KPIs, stats aujourd'hui, onglets, comparaisons) |
| `draggable` | DraggableDashboard.tsx |
| `hardware` | HardwareMonitor.tsx |
| `liveStreams` | LiveStreamsPanel.tsx |
| `killStream` | KillStreamButton.tsx |
| `deepInsights` | DeepInsights.tsx (Top Films/Séries/Albums/Genres) |
| `granular` | GranularAnalysis.tsx (6 graphiques détaillés) |
| `network` | NetworkAnalysis.tsx (réseau, transcode) |
| `charts` | 9 composants graphiques (PlatformDistribution, Genre, UserActivity, CategoryPie, MonthlyWatchTime, ComposedTrend, VolumeArea, LibraryDailyPlays, YearlyHeatmap) + CompletionRatio, StreamProportions |
| `settings` | settings/page.tsx |
| `logs` | logs/page.tsx, LogFilters.tsx |
| `media` | media/page.tsx (bibliothèque) |
| `mediaProfile` | media/[id]/page.tsx, MediaDropoffChart.tsx |
| `recent` | recent/page.tsx |
| `users` | users/page.tsx |
| `userProfile` | users/[id]/ (UserInfo, UserActivity, UserRecentMedia) |
| `login` | login/page.tsx, LoginForm.tsx |
| `newsletter` | newsletter/page.tsx |
| `about` | about/page.tsx |
| `cleanup` | admin/cleanup/page.tsx, CleanupClient.tsx |
| `wrapped` | wrapped/[userId]/page.tsx, WrappedClient.tsx (~65 clés: slides, navigation, partage) |

### Fichiers convertis (liste complète)
**Pages (Server Components)** :
- `src/app/page.tsx` — Dashboard principal (DAY_NAMES/MONTH_NAMES via indices numériques dans unstable_cache, traduction post-cache)
- `src/app/login/page.tsx` et `LoginForm.tsx`
- `src/app/settings/page.tsx`
- `src/app/logs/page.tsx` et `LogFilters.tsx`
- `src/app/media/page.tsx` et `src/app/media/[id]/page.tsx`
- `src/app/users/page.tsx` et `src/app/users/[id]/` (3 sous-composants)
- `src/app/recent/page.tsx`
- `src/app/newsletter/page.tsx`
- `src/app/admin/cleanup/page.tsx` et `CleanupClient.tsx`
- `src/app/wrapped/[userId]/page.tsx` et `WrappedClient.tsx`

**Composants Dashboard** :
- `src/components/dashboard/DeepInsights.tsx`
- `src/components/dashboard/GranularAnalysis.tsx`
- `src/components/dashboard/NetworkAnalysis.tsx`
- `src/components/dashboard/LiveStreamsPanel.tsx`
- `src/components/dashboard/HardwareMonitor.tsx`
- `src/components/dashboard/KillStreamButton.tsx`
- `src/components/dashboard/DraggableDashboard.tsx`

**Composants Graphiques** :
- `src/components/charts/PlatformDistributionChart.tsx`
- `src/components/charts/GenreDistributionChart.tsx`
- `src/components/charts/UserActivityChart.tsx`
- `src/components/charts/CategoryPieChart.tsx`
- `src/components/charts/MonthlyWatchTimeChart.tsx`
- `src/components/charts/ComposedTrendChart.tsx`
- `src/components/charts/VolumeAreaChart.tsx`
- `src/components/charts/LibraryDailyPlaysChart.tsx`
- `src/components/charts/YearlyHeatmap.tsx`
- `src/components/charts/CompletionRatioChart.tsx`
- `src/components/charts/StreamProportionsChart.tsx`
- `src/app/media/[id]/MediaDropoffChart.tsx`

**Composants UI** :
- `src/components/Navigation.tsx`
- `src/components/Sidebar.tsx`
- `src/components/SearchBar.tsx`
- `src/components/TimeRangeSelector.tsx`

### Problèmes techniques résolus
1. **`unstable_cache` + traductions** : Les données cachées utilisent des clés neutres (ex: jours = "0"-"6", mois = "0_24"-"11_24", complétion = "completed"/"partial"/"abandoned"), traduites après l'appel cache avec `DAY_NAMES[parseInt(d.day)]` et `MONTH_NAMES[monthIdx] + yearSuffix`
2. **Carte de couleurs dynamique** : `CompletionRatioChart` utilisait des noms français comme clés du map COLORS. Refactorisé avec `[t('completed')]: "#22c55e"` construit dynamiquement dans le composant
3. **`formatTooltipValue` hors composant** : Plusieurs charts avaient cette fonction définie hors du composant, empêchant l'accès à `useTranslations`. Déplacée à l'intérieur du corps du composant
4. **Fallback "Inconnu" dans unstable_cache** : Remplacé par "?" (chaîne neutre) car la traduction n'est pas disponible dans le contexte cache
5. **Arrays JSON non supportés** : `dayNames` et `monthNames` convertis de `["Lun","Mar",...]` en `"Lun,Mar,..."` avec `.split(',')` au runtime

### Strings backend non converties (priorité basse)
~40+ chaînes françaises restent dans les routes API serveur et le moniteur — ce sont des messages d'erreur/statut côté serveur non affichés dans l'UI principale :
- `src/middleware.ts` : "Accès réservé aux administrateurs"
- `src/lib/auth.ts` : messages d'erreur d'authentification
- `src/app/api/auth/[...nextauth]/route.ts` : messages de login
- `src/app/api/sync/route.ts` : messages de statut sync
- `src/app/api/webhook/jellyfin/route.ts` : traitement webhook
- `src/app/api/settings/route.ts` : validation des paramètres
- `src/app/api/backup/` : opérations de sauvegarde
- `src/server/monitor.ts` : embeds Discord
- `src/lib/sync.ts` : erreurs de synchronisation

---

## Phase 39 — Fix logs crash, filtres analytiques & enrichissement profil utilisateur

- **Crash page Logs (écran blanc / server-side exception) corrigé** : `src/app/logs/page.tsx` avait des accès non protégés à `log.media.*` sur des historiques orphelins (média supprimé/introuvable), provoquant un crash SSR. Ajout de garde-fous complets (`log.media?.*`), fallback visuel/texte pour médias inconnus, et neutralisation des watch parties sans `mediaId`.
- **Pagination Logs robuste** : la pagination conserve désormais `type` et `cols` dans l’URL, évitant les pertes de contexte de filtre/colonnes au changement de page.
- **Filtres Dashboard propagés à GranularAnalysis** : `src/components/dashboard/GranularAnalysis.tsx` applique maintenant réellement le filtre `type` (`movie`, `series`, `music`, `book`) dans la requête Prisma. Résultat : **Pires Taux de Complétion** et les autres graphes granulaires réagissent bien aux onglets `Tous / Films / Séries / Musique / Livres`.
- **Durée par Médiathèque corrigée** : `src/components/charts/StackedMetricsCharts.tsx` utilisait des `dataKey` string. Certaines bibliothèques (noms avec caractères spéciaux/points) cassaient la lecture Recharts. Passage à des accessors fonctionnels `dataKey={(entry) => entry[key] || 0}` pour `Bar` et `Area`.
- **Dashboard volume/history ajusté** :
   - Suppression de la série **Vues (Total)** dans `src/components/charts/ComposedTrendChart.tsx`.
   - Renommage FR : `Volumes et Vues Historiques` → `Volumes et Historiques` dans `messages/fr.json`.
   - Alignement EN : `Volume & Views History` → `Volume History` dans `messages/en.json`.
- **Profil utilisateur enrichi avec plus de graphiques** : nouveau composant `src/app/users/[id]/UserStatsCharts.tsx` ajouté à la page profil (`src/app/users/[id]/page.tsx`) avec :
   - Activité par jour de semaine (`DayOfWeekChart`)
   - Taux de complétion utilisateur (`CompletionRatioChart`)
- **Validation build** : `npm run build` OK après correctifs (compilation et génération des routes réussies). Warnings Redis non bloquants conservés.

### Addendum UX mobile (Phase 39.1)
- **Logs mobile lisibilité** : `src/app/logs/page.tsx` passe en mode table responsive avec colonnes secondaires masquées sur petits écrans (`clientIp`, `status`, `codecs`, `duration`) et résumé compact injecté dans la cellule média (méthode, client, durée).
- **Conservation des filtres** : `src/app/logs/LogFilters.tsx` préserve désormais les paramètres URL existants (`type`, `cols`, `page` etc.) lors des recherches et tris, évitant la perte de contexte utilisateur sur mobile.

### Addendum UX mobile fine (Phase 39.2)
- **Correctif runtime `LogFilters`** : ajout de `useSearchParams()` dans `src/app/logs/LogFilters.tsx` (la préservation des paramètres utilisait `searchParams` non initialisé).
- **Ergonomie tactile** : zones cliquables augmentées sur mobile (hauteur des champs/boutons filtres et bouton colonnes), menu colonnes élargi pour interaction doigt plus fiable (`src/app/logs/ColumnToggle.tsx`, `src/app/logs/LogFilters.tsx`).
- **Densité mobile optimisée** : paddings page/table ajustés, pagination wrap-friendly, typos réduites sur petits écrans, vignette média légèrement compactée (`src/app/logs/page.tsx`).

### Addendum UX global (Phase 39.3)
- **Déploiement mobile-first transversal** sur les pages principales : `dashboard`, `users`, `users/[id]`, `recent`, `settings`, `admin/cleanup`, `media/[id]`.
- **Layout harmonisé** : migration systématique des wrappers desktop-only (`p-8 pt-6`) vers un pattern responsive `p-4 md:p-8 pt-4 md:pt-6` + réduction de la densité (`space-y-4 md:space-y-6`) et titres `text-2xl md:text-3xl`.
- **Tableaux lisibles sur mobile** :
   - `users/page.tsx` : table leaderboard en `overflow-x-auto` avec `min-w`.
   - `users/[id]/UserRecentMedia.tsx` : colonnes secondaires masquées en mobile (`duration`, `client`, `device`, `method`) + résumé inline dans la cellule média.
   - `media/[id]/page.tsx` : tables enfants et historique détaillé rendues responsives (`min-w` + colonnes secondaires masquées selon breakpoint).
- **Navigation/contrôles mobiles** :
   - `recent/page.tsx` et `page.tsx` (dashboard) : en-têtes et tabs passent en disposition wrap/stack, largeur tabs adaptée (`w-full` en mobile), et badges/sections densifiés.
- **Validation** : build de production re-validé (`npm run build` OK) après la passe globale.

### Addendum i18n (Phase 39.4)
- **Audit de parité des locales** : vérification automatisée des clés `en/fr/nl/zh` (578 clés), aucun manque ni conflit de type.
- **Harmonisation wording post-chart** : suppression des mentions de vues dans les libellés NL/ZH de `dashboard.volumeHistory` et `dashboard.volumeHistoryDesc` pour refléter la série actuelle (heures de visionnage).
- **Validation syntaxe locale** : parsing de tous les fichiers `messages/*.json` (10/10 valides).

### Addendum i18n global (Phase 39.5)
- **Extension de l'harmonisation à toutes les locales restantes** : mise à jour de `de`, `es`, `it`, `pl`, `pt-BR`, `ru` sur `dashboard.volumeHistory` et `dashboard.volumeHistoryDesc`.
- **Objectif** : aligner le wording produit avec la réalité de la visualisation (trend d'heures de visionnage), sans référence aux vues totales.
- **Validation** : re-parsing complet des fichiers `messages/*.json` après patch (10/10 valides).

### Phase 40 — Stabilisation Logs, ouverture multi-langues & enrichissement stats profil
- **Logs crash hardening (`/logs`)** :
   - Ajout d'une normalisation sûre des dates (`toValidTimestamp`) pour ignorer les entrées malformées/invalides sans faire planter le SSR.
   - L'algorithme Watch Party devient tolérant aux données incomplètes (sessions sans `startedAt` valide exclues proprement).
   - Formatage date UI protégé (fallback `unknown` si date invalide) pour éviter les exceptions runtime pendant le rendu.
- **i18n robuste côté serveur** :
   - Nouvelle source centralisée des locales (`src/i18n/locales.ts`) avec whitelist.
   - `src/i18n/request.ts` valide désormais le cookie `locale` contre la whitelist et retombe sur `fr` par défaut (plus d'import dynamique sur locale invalide).
- **Sélecteur de langue étendu** :
   - `src/components/LanguageSwitcher.tsx` passe d'un toggle FR/EN à un sélecteur couvrant toutes les locales disponibles : `fr`, `en`, `de`, `es`, `it`, `nl`, `pl`, `pt-BR`, `ru`, `zh`.
- **Ajout fonctionnel stats profil utilisateur** :
   - `src/app/users/[id]/UserStatsCharts.tsx` enrichi avec un 3e graphe **Activité horaire** (`ActivityByHourChart`) en plus des graphes hebdomadaire et complétion.

### Phase 40.1 — Fix crash logs, complétion filtrée & hardware i18n
- **Fix crash page Logs (server-side exception BigInt)** :
  - Cause racine : `include: { media: true }` retournait `durationMs: BigInt?` qui ne se sérialise pas en RSC production.
  - Fix : remplacement par `include: { media: { select: { ... } } }` excluant le champ BigInt.
  - Ajout d'une couche `safeLogs` qui normalise les dates `Date → ISO string` avant le rendu, empêchant les plantages de sérialisation RSC.
  - Formatage des dates enveloppé dans `try/catch` individuel par ligne de log.
- **Exclusion des médias zappés du Taux de Complétion** :
  - Le donut `CompletionRatioChart` du dashboard exclut désormais les sessions < 10% (zappées).
  - Seuils : ≥ 80% = Terminé, 20-80% = Partiel, 10-20% = Abandonné, < 10% = ignoré.
- **Hardware Monitor entièrement traduit** :
  - Ajout des clés `hardware.cpuUsage` et `hardware.ram` (avec paramètre `{total}`) dans les 10 locales.
  - `HardwareMonitor.tsx` utilise `t('cpuUsage')` et `t('ram', { total })` au lieu de textes anglais codés en dur.
- **Validation** : build `npm run build` OK, 10/10 locales valides.

### Phase 40.2 — Fix crash logs (server/client boundary + TDZ) & npm update Docker
- **Problème 1** : `parseVisibleColumns()` exportée depuis `ColumnToggle.tsx` (`"use client"`) et appelée dans le Server Component `logs/page.tsx` → `Error: Attempted to call parseVisibleColumns() from the server`.
- **Fix** : duplication des constantes (`ALL_COLUMNS`, `Column`) dans chaque fichier. `parseVisibleColumns` inliné dans `page.tsx`. Aucun module partagé serveur/client.
- **Problème 2 (cause racine du crash)** : `const safeLogs` déclaré à la ligne ~237 mais utilisé dès la ligne ~143 (`safeLogs.forEach(...)`) → `ReferenceError: Cannot access 'S' before initialization` (TDZ — Temporal Dead Zone). La variable `S` en minifié est `safeLogs`.
- **Fix** : déplacement de la déclaration `safeLogs = logs.map(...)` juste après le `findMany()`, avant toute utilisation.
- **Dockerfile** : ajout `npm install -g npm@latest` dans le stage runner pour supprimer le warning npm.
- **docker-entrypoint.sh** : remplacement de `npx prisma` par `prisma` (installé globalement) pour éviter le warning npm au démarrage.
- **Validation** : build `npm run build` OK, toutes les routes générées.

### Phase 40.3 — Fix durée accumulée, sélecteur de langue, responsive mobile
- **Bug durée accumulée sur reprise de lecture** :
  - Cause racine : `positionTicks` de Jellyfin = position **absolue** dans le média (ex: 60 min dans un film), pas la durée de la session. Quand un utilisateur reprend à 30 min et regarde 30 min de plus, `positionTicks` = 60 min → le code enregistrait 60 min au lieu de 30 min.
  - Fix : formule `durationWatched = min(wallClockDuration, positionTicksDuration)` appliquée aux **5 endroits** :
    1. `monitor.ts` — nettoyage orphelins ActiveStream au démarrage
    2. `monitor.ts` — fermeture PlaybackHistory orphelins au démarrage
    3. `monitor.ts` — PlaybackStop (session disparue)
    4. `monitor.ts` — nettoyage sessions fantômes (cross-validation)
    5. `webhook/jellyfin/route.ts` — PlaybackStop webhook
  - Sécurité : `Math.max(0, Math.min(durationS, 86400))` pour borner entre 0 et 24h.
- **Sélecteur de langue custom dropdown** :
  - Remplacement du `<select>/<option>` natif (emojis drapeaux mal rendus sur Windows desktop) par un dropdown custom CSS avec des `<button>` qui affichent correctement les emoji drapeaux sur tous les OS/navigateurs.
  - Ouverture vers le haut (`bottom-full`) pour ne pas être coupé par le bas de la sidebar.
  - Fermeture automatique au clic extérieur.
- **Responsive mobile complet** :
  - `Sidebar.tsx` : sidebar cachée par défaut sur mobile (`-translate-x-full md:translate-x-0`), accessible via bouton hamburger dans un header mobile fixe (`h-14`). Animation slide-over 200ms avec overlay sombre. Fermeture automatique au changement de route.
  - `layout.tsx` : `pt-14 md:pt-0` sur `<main>` pour compenser le header mobile. Ajout `min-w-0` pour éviter les débordements.
  - Pages `media/page.tsx`, `media/loading.tsx`, `about/page.tsx` : padding responsive (`p-4 md:p-8`). Titres et tabs adaptés mobile (`text-2xl md:text-3xl`, `w-full sm:w-[400px]`).
- **Validation** : build `npm run build` OK (12.4s), toutes les routes générées.

### Phase 40.4 — DB host-mode fix, port configurable, language menu desktop & mobile polish
- **Fix DB `postgres:5432` en mode host** :
   - Cause racine : `docker-entrypoint.sh` construisait `DATABASE_URL` uniquement depuis `POSTGRES_*` avec fallback codé en dur `POSTGRES_IP=postgres`, donc en mode host l'app tentait toujours `postgres:5432` si `DATABASE_URL` n'était pas fourni.
   - Fix : support complet des aliases `DB_*` avec priorité : `DB_*` > `POSTGRES_*` > defaults.
      - Variables prises en charge : `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
      - `DATABASE_URL` auto-construit avec ces valeurs et log explicite de la cible DB.
- **Port applicatif configurable proprement** :
   - `docker-compose.yml` : mapping changé de `3000:3000` vers `${APP_PORT:-3000}:${PORT:-3000}`.
   - `PORT` devient configurable via `${PORT:-3000}` dans l'environnement.
   - `NEXTAUTH_URL` compose documenté pour refléter le port externe.
   - Fallback URL runtime dans `monitor.ts` et `webhook/jellyfin/route.ts` : `NEXTAUTH_URL || http://localhost:${PORT}` (plus de fallback hardcodé `:3000`).
- **Language switcher desktop corrigé/embelli** :
   - Refonte visuelle du dropdown (bouton + panel custom cohérents avec le thème de l'application, états selected/hover, chevron animé).
   - Ajout de la classe CSS `.emoji-flag` avec stack de polices emoji (`Segoe UI Emoji`, `Apple Color Emoji`, `Noto Color Emoji`) pour corriger l'affichage des drapeaux sur PC.
- **Ajustements mobile complémentaires** :
   - Sidebar mobile : largeur adaptée (`w-[86vw] max-w-72`), overlay z-index corrigé, ombre dédiée mobile.
   - Layout : utilisation de `100dvh` pour éviter les artefacts de viewport mobile, `overflow-x-hidden` global pour supprimer les débordements horizontaux.
   - Pages `newsletter` et `about` : hiérarchie typographique et paddings rendus responsive (`p-4 md:p-8`, tailles titres adaptées mobile).
- **Validation** : build `npm run build` OK (Next.js 16.1.6), toutes les routes générées.