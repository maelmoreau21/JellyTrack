# JellyTrack - Project Context & Architecture

**Description**: JellyTrack is a high-performance analytical wrapper and autonomous tracker ("Ultimate Dashboard 2.0") for Jellyfin. It pulls data directly from the Jellyfin server and provides highly granular statistics, user-specific tracking, seamless backups, and interactive data visualization.
**Current Version**: 2.0.0 (Phase 55 - Massive UX & Telemetry Revamp)

## Tech Stack
- Frontend/Backend: **Next.js 15+ (App Router, Server Components)**
- Caching & Real-time Storage: **Redis (ioredis)**
- DB & ORM: **PostgreSQL + Prisma** (Connection pooled natively)
- Styling: **TailwindCSS + Shadcn/UI + Lucide Icons**
- Data Visualization: **Recharts**
- Localization: **next-intl (FR, EN, DE, ES, IT, NL, PL, PT-BR, RU, ZH)**
- IP Geography: **geoip-country**

## Core Architectural Concepts

### Database Engine & Caching
The application uses Prisma alongside PostgreSQL. Critical query paths, especially analytics and log retrievals, are heavily indexed (e.g., `clientName`, `playMethod`, `jellyfinMediaId`). Live streams and dashboard metrics are aggressively cached using Redis to protect edge nodes (like Raspberry Pi) from querying overhead.

### NextAuth & RBAC
Authentication permits *all* Jellyfin users to log in smoothly. However, a specialized backend Middleware automatically enforces strict Role-Based Access Control (RBAC). 
- **Admins**: Granted full access to dashboard, system health, server settings, and raw logs. 
- **Standard Users**: Bound exclusively to `/users/[id]` paths where they view their localized content, playback preferences, language tracking interactively.

### Data Acquisition & Telemetry (The Sync Engine)
A master polling engine actively queries Jellyfin's `/Sessions` endpoint recursively under the scenes, dynamically mapping playback progress down to the nanosecond, and correctly categorizing media (identifying `VirtualFolders` locally avoiding ghost libraries).
- Telemetry runs through `ZAPPING_CONDITION` (<30s videos, <10s audio bounds) filtering background stream tests and noise out of dashboard calculations automatically.

### Importer Pipeline
Supports gigantic external server migrations seamlessly (Jellystat ~200MB JSON chunks, Playback Reporter TSV/CSV). Done natively via raw Blob streams chunking memory aggressively bypassing NodeJS `V8` payload bottlenecks.

### Interactive Components 
UI layouts adhere intensely to a premium dark-mode aesthetic. Top-tier metrics like Most Watched Actors, Genres, and User Drop-off metrics utilize interactive Recharts arrays supporting native clickthroughs and zero-state data crash prevention fallback structures.

---
*Note: This architectural document supersedes all previous historical changelogs. The environment prioritizes 100% stable performance and zero-clutter file structuring.*
