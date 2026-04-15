---
description: "Instructions et memoire pour agents IA - JellyTrack v1.4.0"
paths:
  - "."
  - "src/**/*.ts"
---

# JellyTrack - Instructions & Memoire Agents IA (v1.4.0)

IMPORTANT - lire integralement ce document avant toute modification.

- Ne pas halluciner la structure de donnees: verifier systematiquement `prisma/schema.prisma`.
- Ne pas halluciner les cles i18n: verifier `messages/*.json`.
- Ne pas inventer de contrat plugin: verifier `src/app/api/plugin/events/route.ts`.
- Ne pas faire de `commit`, `push`, creation de branche ou `merge` sans demande explicite utilisateur.
- Le mode d'installation principal reste Docker (`docker-compose.yml`).
- Le fichier `.env` est public et versionne comme exemple: placeholders uniquement (`CHANGE_ME_*`), jamais de secrets reels.

## 1. Stack Technique Canonique

- Framework: Next.js 16 App Router (`src/app/`)
- Langage: TypeScript strict
- Auth web: next-auth avec proxy Next (`src/proxy.ts`)
- ORM/DB: Prisma + PostgreSQL
- Cache/temps reel: Redis (ioredis)
- UI: Tailwind + composants `src/components/ui/*`
- Graphiques: Recharts
- i18n: next-intl + fichiers `messages/*.json`

## 2. Architecture Securite v1.4.0 (reference)

### 2.1 Plugin API Key - Hash-at-Rest

Source: `src/lib/pluginKeyManager.ts` + `src/app/api/plugin/events/route.ts`

- La cle plugin n'est plus stockee en clair: hash scrypt versionne (`s1$...`) avec salt.
- Verification runtime: comparaison timing-safe entre cle brute recue et hash stocke.
- Mode strict hash-only: une valeur non-hash/mal formee est rejetee.
- Legacy plaintext: migration automatique vers hash a la lecture des settings.
- Rotation geree (courante + precedente + fenetre de grace).
- Option pepper: `PLUGIN_KEY_PEPPER`.

Regle de conception:
- Ne jamais reintroduire une persistance de cle brute en DB.
- Toute nouvelle route admin sur la cle doit conserver ce modele hash-only.

### 2.2 Auth plugin (transport)

Source: `src/app/api/plugin/events/route.ts`

- Le plugin peut envoyer la cle via:
  - `Authorization: Bearer <token>`
  - `X-Api-Key: <token>`
- Les 2 formats sont verifies.
- Les cles scopees sont supportees via prefixe `jts3.<serverIdBase64url>.<rawKey>` (`src/lib/pluginServerKey.ts`).
- Si la cle est scopee, le `serverId` du token doit matcher celui du payload (sinon 403).

### 2.3 Protection SSRF / Origine Webhook

Source: `src/app/api/webhook/jellyfin/route.ts`

- L'endpoint webhook refuse les payloads si `ALLOWED_JELLYFIN_HOSTS` est vide.
- Le host de `serverUrl` dans le payload est extrait et compare a une allowlist stricte.
- Si host absent/invalide/non autorise: 403.
- La taille du payload est cappee (`PLUGIN_EVENT_MAX_BYTES`).

### 2.4 Proxy Next 16

Source: `src/proxy.ts`

- Le proxy applique les regles d'autorisation pages/API.
- Les API ne sont pas redirigees en HTML vers `/login`; elles gerent leurs erreurs JSON dans leurs handlers.
- `api/plugin/events` est explicitement exclu du matcher proxy (endpoint machine-to-machine).

## 3. Arborescence de Travail (vue utile)

- `src/app/*`: pages/routes App Router
- `src/app/api/*`: APIs serveur
- `src/proxy.ts`: politique d'acces globale
- `src/lib/*`: logique metier (auth, sync, plugin key, SSRF/webhook, server registry)
- `src/components/ui/*`: primitives UI a reutiliser en priorite
- `src/components/dashboard/*`: blocs dashboard
- `src/components/charts/*`: wrappers recharts
- `prisma/schema.prisma`: source de verite du modele
- `messages/*.json`: traductions multi-locales

## 4. Prisma - Resume Canonique (v1.4.0)

Toujours relire `prisma/schema.prisma` avant toute modification data.

Modeles cles:

- `Server`
  - champs cle: `id`, `jellyfinServerId`, `name`, `url`, `jellyfinApiKey`, `allowAuthFallback`, `isActive`
  - relation parent multi-serveur pour users/media/history/events/streams

- `User`
  - champs cle: `serverId`, `jellyfinUserId`, `username`, `lastActive`
  - contrainte: `@@unique([jellyfinUserId, serverId])`

- `Media`
  - champs cle: `serverId`, `jellyfinMediaId`, `type`, `collectionType`, `libraryName`, `parentId`, `artist`
  - contrainte: `@@unique([jellyfinMediaId, serverId])`

- `PlaybackHistory`
  - champs cle: `serverId`, `userId`, `mediaId`, `playMethod`, `durationWatched`, `startedAt`, `endedAt`

- `TelemetryEvent`
  - champs cle: `serverId`, `playbackId`, `eventType`, `positionMs`

- `ActiveStream`
  - champs cle: `serverId`, `sessionId`, `userId`, `mediaId`, `lastPingAt`
  - contrainte: `@@unique([sessionId, serverId])`

- `GlobalSettings`
  - contient la gouvernance plugin key: `pluginApiKey` (hash), `pluginPreviousApiKey` (hash), expirations, rotation

- `AdminAuditLog`, `SystemHealthState`, `SystemHealthEvent`, `DailyStats`

Regles strictes:
- Ne jamais proposer un champ inexistant.
- Si schema change: demande explicite utilisateur + plan migration + regeneration Prisma.

## 5. Contrat Plugin Ingestion (App)

Source principale: `src/app/api/plugin/events/route.ts`

- Types d'evenements acceptes:
  - `Heartbeat`
  - `PlaybackStart`
  - `PlaybackProgress`
  - `PlaybackStop`
  - `LibraryChanged`
- `eventSchemaVersion` est obligatoire et doit etre supporte (actuellement v2 strict).
- Rate limiting pre-auth et post-auth.
- Taille payload limitee.
- Audit admin des echecs (401, 403, 413, schema invalide, etc.).

## 6. I18n - Politique Obligatoire

- Toute chaine UI doit venir de `messages/*.json`.
- Ajouter toute nouvelle cle dans toutes les locales.
- Utilisation:
  - server components: `getTranslations()`
  - client components: `useTranslations()`
- Scripts de controle disponibles sous `scripts/`.

## 7. Regles Qualite Zero Dette Technique

Avant finalisation:

1. Verifier les impacts schema si code data modifie.
2. Verifier les traductions sur toutes locales.
3. Executer `npm run build`.
4. Executer les tests utiles (`npm run test` si pertinent).
5. Verifier les endpoints critiques:
   - `api/plugin/events`
   - `api/webhook/jellyfin`
   - `api/settings/jellyfin-servers`
6. Verifier l'absence de secret et la conformite `.env` exemple.

## 8. Variables d'Environnement Sensibles

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `ADMIN_PASSWORD`
- `JELLYFIN_URL`
- `JELLYFIN_API_KEY`
- `JELLYFIN_WEBHOOK_SECRET`
- `PLUGIN_KEY_PEPPER`
- `ALLOWED_JELLYFIN_HOSTS`
- `PLUGIN_EVENT_MAX_BYTES`
- `JELLYTRACK_MODE`
- `JELLYFIN_SERVER_ID`
- `JELLYFIN_SERVER_NAME`

Regle:
- `.env` versionne = placeholders uniquement.

## 9. Commandes de Reference

- `docker compose up -d`
- `docker compose pull && docker compose up -d`
- `npm run dev`
- `npm run build`
- `npm run start`
- `npx prisma generate` (uniquement apres changement schema)

## 10. Anti-Hallucination Checklist

Toujours verifier avant proposition:

- `prisma/schema.prisma`
- `messages/*.json`
- `src/app/api/plugin/events/route.ts`
- `src/lib/pluginKeyManager.ts`
- `src/app/api/webhook/jellyfin/route.ts`
- `src/proxy.ts`

Si un doute persiste: lire le fichier, ne pas deviner.

---

Ce document est la reference agents IA pour JellyTrack v1.4.0.
Toute evolution structurelle (schema, securite, contrat plugin) doit mettre a jour ce fichier dans la meme PR.