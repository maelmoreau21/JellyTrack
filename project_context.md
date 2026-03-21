# JellyTrack - Project Context & Architecture Reference

> **FOR AI AGENTS (CRITICAL INSTRUCTION)**: Read this entire schema carefully before proposing backend/frontend implementations. Do not "hallucinate" directories, abstractions, or tools. Stick precisely to this explicit stack and data-flow model.

## 1. Core Technology Stack
- **Framework:** Next.js 14+ (App Router `src/app/`)
- **Language:** TypeScript (`strict: true`)
- **Backend/ORM:** Prisma (SQLite/PostgreSQL) - `schema.prisma`
- **Authentication:** NextAuth.js (Custom Jellyfin Credentials + LDAP fallback)
- **Styling framework:** TailwindCSS + Shadcn/UI (Radix primitives)
- **Icons:** `lucide-react`
- **Charts:** `recharts` (Responsive, animated charting)
- **i18n:** `next-intl` (Translation files stored in `messages/*.json`)

## 2. Global Architecture Pattern
JellyTrack operates as a satellite analytics platform for Jellyfin. It pulls data directly via Jellyfin's exposed REST API (`/Users`, `/Items`, `/Sessions`, `/PlaybackInfo`). 

### Data Flow Diagram
```
[Jellyfin API] -> [JellyTrack Webhooks/CRON] -> [Prisma DB] -> [Next.js Server Actions/unstable_cache] -> [Client UI]
```

### Folder Structure Convention
- `src/app/*`: Next.js App Router endpoints, Layouts, Pages.
- `src/app/api/*`: Webhook ingestion endpoints (receiving Jellyfin playstate).
- `src/components/ui/*`: Dumb Shadcn UI pieces (buttons, inputs, cards).
- `src/components/dashboard/*`: Complex server-fetched client dashboards.
- `src/components/charts/*`: Reusable Recharts wrappers (`StandardMetricsCharts.tsx`).
- `src/lib/*`: Core utilities (`prisma.ts`, `jellyfin.ts`, `auth.ts`, `utils.ts`).
- `prisma/`: Prisma schema and migration history.
- `messages/`: Locales (e.g. `fr.json`, `en.json`) strictly namespaced (e.g., `common`, `dashboard`, `media`, `logs`).

## 3. Database Schema Mastery (Prisma)
All AI agents must respect the current `schema.prisma` mapping. Do not invent non-existent relations.
- **User**: Maps one-to-one with a unique Jellyfin User ID. Tracks `jellyfinToken` and `role` (ADMIN vs USER).
- **PlaybackSession**: Represents an active or completed viewing activity. Contains `deviceId`, `clientName`, `duration`, and `isDirectPlay`.
- **MediaItem**: Centralizes Jellyfin IDs (movies, episodes, tracks). Includes `type`, `name`, `collectionId`.
- **LogEntry**: Immutable audit trail for system events (Logins, Syncs, Errors).

## 4. UI/UX "Premium" Design Rules
JellyTrack mandates an "Expert UX/UI". Features must not look like barebones templates.
- **Micro-interactions:** Elements must have `transition-all`, `hover:scale`, `group-hover:opacity-100`.
- **Styling depth:** Utilize `backdrop-blur-md` and `bg-zinc-900/50` for glassmorphic elements. 
- **Graceful degradation:** Recharts must wrap in conditional rendering to prevent `null` data crashes.
- **No Accordions for high-density data:** Use Grid Layouts (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) to elegantly display lists (e.g., Library Details, User Lists).
- **Responsive design is mandatory.**

## 5. Agent Workflow & Safety 
- Always execute `npm run build` to verify TypeScript compliance before completing a task.
- Check and update `messages/*.json` files for all hardcoded text strings using `next-intl` (`useTranslations()`). Do not leave hardcoded text in `.tsx` files if it can be translated.
- Any background sync/fetch job uses `unstable_cache` to throttle direct jellyfin API spamming. Cache revalidation must be considered.
- Never edit Prisma schemas without explicit user consent. If done, provide `npx prisma db push --accept-data-loss` logic safely.

**By respecting this context, AI agents are guaranteed to deliver highly stable, visually breathtaking Next.js modifications.**
