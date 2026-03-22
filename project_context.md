# JellyTrack — Contexte projet & guide pour agents IA

IMPORTANT (pour agents IA) — lire entièrement ce document avant de proposer des modifications :
- Ne pas « halluciner » modèles de données, répertoires ou clés i18n. Toujours vérifier `prisma/schema.prisma`, `messages/*.json` et les fichiers existants sous `src/`.
- Respectez strictement les conventions et l'architecture décrites ci‑dessous.

## 1. Stack technique (résumé)
- Framework : `Next.js` (App Router, `src/app/`) — version utilisée : `16.x` (Next 16+ dans `package.json`).
- Langage : `TypeScript` (option `strict: true`).
- Base de données / ORM : `Prisma` (provider `postgresql`, `prisma/schema.prisma`).
- Auth : `next-auth` (provider Jellyfin + fallback LDAP personnalisé dans `src/lib/auth.ts`).
- Styling : `TailwindCSS` + composants `shadcn/ui` (primitives Radix dans `src/components/ui/`).
- Icônes : `lucide-react`.
- Graphiques : `recharts` (wrappés dans `src/components/charts/*`).
- i18n : `next-intl` — fichiers de traduction sous `messages/*.json` (namespaces : `common`, `dashboard`, `media`, `logs`, ...).

## 2. Diagramme de flux des données
```
[Jellyfin API] -> [Webhooks / Cron jobs] -> [Prisma DB (Postgres)] -> [Next.js (server actions, unstable_cache)] -> [Client UI]
```

## 3. Conventions de structure du dépôt (points clés)
- `src/app/*` : routes, layouts et pages (server components par défaut). Utilisez `use client` au début d'un fichier pour les composants client.
- `src/app/api/*` : endpoints API côté serveur (webhooks, exports, actions admin).
- `src/components/ui/*` : composants UI réutilisables (boutons, input, card) — éviter de dupliquer le style.
- `src/components/dashboard/*` : composants complexes, server-fetched.
- `src/components/charts/*` : wrappers pour `recharts` (toujours protéger par condition si données nulles).
- `src/lib/*` : utilitaires et wrappers (ex. `prisma.ts`, `jellyfin.ts`, `auth.ts`, `utils.ts`).
- `prisma/` : `schema.prisma` + migrations historiées.
- `messages/` : traductions JSON par locale (ex. `en.json`, `fr.json`).

Toujours réutiliser les composants existants sous `src/components/ui/` pour garantir une UX cohérente.

## 4. Schéma Prisma — référence canonique (extraits essentiels)
Vous devez RELIRE `prisma/schema.prisma` avant toute proposition qui touche aux données. Voici le résumé exact des modèles (noms et champs tels qu'ils apparaissent dans `schema.prisma`) :

- `model User` :
	- `id String @id @default(uuid())`
	- `jellyfinUserId String @unique`
	- `username String`
	- `isActive Boolean @default(true)`
	- `createdAt DateTime @default(now())`
	- `updatedAt DateTime @updatedAt`
	- relations : `playbackHistory PlaybackHistory[]`, `activeStreams ActiveStream[]`

- `model Media` :
	- `id String @id @default(uuid())`
	- `jellyfinMediaId String @unique`
	- `title String`
	- `type String` (ex. `Movie`, `Episode`, `Track`, `Audio`, `AudioBook`) — chaîne libre utilisée partout pour filtrer
	- `collectionType String?` (ex. `movies`, `tvshows`)
	- `libraryName String?`
	- `genres String[]`
	- `resolution String?` (ex. `4K`, `1080p`)
	- `durationMs BigInt?`, `size BigInt?`
	- `directors String[]`, `actors String[]`, `studios String[]`
	- `parentId String?` (Jellyfin ParentId pour fallback d'images)
	- `artist String?`, `dateAdded DateTime?`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
	- relations : `playbackHistory PlaybackHistory[]`, `activeStreams ActiveStream[]`
	- index : `type`, `collectionType`, `jellyfinMediaId`

- `model PlaybackHistory` : (historique/ligne de log)
	- `id String @id @default(uuid())`
	- `userId String?` (nullable — sessions anonymes possibles)
	- `mediaId String` (FK vers `Media.id`)
	- `playMethod String` (ex. `DirectPlay`, `Transcode`)
	- `clientName String?`, `deviceName String?`
	- `ipAddress String?`, `country String?`, `city String?`
	- `durationWatched Int @default(0)` (secondes)
	- `startedAt DateTime @default(now())`, `endedAt DateTime?`
	- `audioLanguage`, `audioCodec`, `subtitleLanguage`, `subtitleCodec` (nullable)
	- `pauseCount Int @default(0)`, `audioChanges Int @default(0)`, `subtitleChanges Int @default(0)`
	- relations : `user User?`, `media Media`, `telemetryEvents TelemetryEvent[]`
	- indexes : `userId`, `mediaId`, `startedAt`, composite `userId+startedAt`, `mediaId+startedAt`, `clientName`, `playMethod`

- `model TelemetryEvent` :
	- `id String @id @default(uuid())`, `playbackId String`, `eventType String`, `positionMs BigInt`, `metadata String?`, `createdAt DateTime @default(now())`
	- relation : `playback PlaybackHistory` (FK)
	- indexes : `playbackId`, `eventType`, `playbackId+eventType`

- `model ActiveStream` : (représente un flux en cours)
	- `id String @id @default(uuid())`
	- `sessionId String @unique` (Jellyfin Session ID)
	- `userId String`, `mediaId String`
	- `playMethod String`, `clientName String?`, `deviceName String?`, `ipAddress String?`, `country String?`, `city String?`
	- `videoCodec String?`, `audioCodec String?`, `transcodeFps Float?`, `bitrate Int?`
	- `audioLanguage`, `subtitleLanguage`, `subtitleCodec` (nullable)
	- `positionTicks BigInt?`, `startedAt DateTime @default(now())`, `lastPingAt DateTime @updatedAt`
	- relations : `user User`, `media Media`
	- index : `lastPingAt`

- `model GlobalSettings` : singleton `id = "global"` (réglages globaux)
	- champs pour webhooks, discord, quotas, `excludedLibraries String[]`, `libraryRules Json?`, `defaultLocale`, `timeFormat`, `pluginApiKey`, `pluginLastSeen`, etc.

- `model SystemHealthState` et `SystemHealthEvent` : stockent l'état du moniteur/sync/backup et les événements associés.

> Règles strictes :
- Ne PAS inventer de champs/relations non présents dans `schema.prisma`.
- Si vous devez modifier le schéma : demande explicite de l'utilisateur + plan de migration. Après modification, exécuter `npx prisma generate` et `npx prisma migrate` / `npx prisma db push` selon la procédure convenue.

## 5. Patterns d'usage et recommandations pratiques
- Requêtes Prisma : privilégier les champs indexés (`userId`, `mediaId`, `startedAt`, `clientName`, `playMethod`). Pour filtrer plusieurs types de media, utiliser :
	```ts
	where: { media: { type: { in: ['Movie','Episode'] } } }
	```
- Filtre par date : construire `startedAt` avec `gte`/`lte` (attention aux heures, utiliser `23:59:59.999` pour bornes inclusives).
- Données BigInt / Date :
	- `BigInt` peut nécessiter d'être serialisé en `string` pour l'envoi côté client (RSC/JSON). Exemple : `String(positionMs)`.
	- `DateTime` => utiliser `.toISOString()` pour transport dans JSON.
- Telemetry : `TelemetryEvent.metadata` est une chaîne JSON optionnelle (ne pas se fier à un schéma fixe sans vérification).
- ActiveStream : représente l'état « live » ; `lastPingAt` est mis à jour par webhooks/heartbeats. Ne pas dédupliquer logique d'active stream côté client.

## 6. i18n & messages
- Namespace : conserver les namespaces existants (`common`, `dashboard`, `media`, `logs`, etc.).
- Quand vous ajoutez une clé de traduction, ajouter la même clé dans tous les fichiers `messages/*.json` (toutes les locales). Les clefs manquantes provoquent des libellés non traduits.
- Utilisation :
	- Server components : `const tl = await getTranslations('logs')` et `tl('key')`.
	- Client components : `const t = useTranslations('logs')`.

## 7. UX / style et composants
- Toujours réutiliser les composants sous `src/components/ui/` pour préserver l'UX.
- Micro-interactions : `transition-all`, `hover:scale`, `group-hover:opacity-100`.
- Glassmorphism : `backdrop-blur-md` + `bg-zinc-900/50` selon les cartes principales.
- Charts : toujours envelopper `recharts` avec un rendu conditionnel pour éviter les crashs si données manquantes.

## 8. Variables d'environnement importantes
- `DATABASE_URL` (Prisma)
- `JELLYFIN_URL`, `JELLYFIN_API_KEY` (utilisés pour métadonnées Jellyfin dans `src/app/logs/page.tsx`)
- Autres : consulter `.env` et `src/lib/*` pour usages spécifiques.

## 9. Scripts utiles (depuis la racine du projet)
- `npm run dev` — lancement en dev
- `npm run build` — build de production (obligatoire avant finaliser une modification)
- `npm run start` — démarrer la version buildée
- `npx prisma generate` — régénère le client Prisma si le schéma change (à exécuter côté CI/dev après modifications de `schema.prisma`)

## 10. Checklist PR / tâches avant merge (guide pour agents)
1. Relire `prisma/schema.prisma` si la PR touche aux données.
2. Ajouter/mettre à jour les clés i18n dans `messages/*.json` pour toutes les locales.
3. Exécuter `npm run build` et corriger les erreurs TypeScript/Next.js.
4. Si modifications Prisma : fournir migration planifiée + `npx prisma generate` et tests DB (ou instructions pour `npx prisma db push`).
5. Vérifier l'UI via `npm run dev`, tester flux critiques (logs, exports, pages dashboard).
6. Mitiger les warnings Turbopack/NFT : éviter les `import` top-level de `fs`/`path` dans le code serveur, préférer des imports dynamiques (`await import('fs')`) ou utiliser `/*turbopackIgnore: true*/` pour les imports dynamiques (p.ex. import(/*turbopackIgnore: true*/ `../../messages/${locale}.json`). Re-relancer `npm run build` et vérifier les warnings.

## 11. Règles pour éviter les « hallucinations »
- Toujours vérifier :
	- `prisma/schema.prisma` pour la structure des données
	- `messages/*.json` pour les clefs de traduction
	- `src/` pour les composants et utilitaires existants
- Ne pas proposer de nouveaux champs, enums, ou relations sans mise à jour du `schema.prisma` et accord explicite.
- Quand vous citez des valeurs attendues (ex. `Media.type`), basez-vous sur l'utilisation dans le code (`src/`) et sur `schema.prisma` (le champ est libre — préférer la cohérence avec les valeurs déjà utilisées : `Movie`, `Episode`, `Audio`, `AudioBook`, `Track`, `Season`, `Series`, `MusicAlbum`).

---

Ce document a pour but d'être la source de vérité pour les agents IA qui travaillent sur ce dépôt. Si vous trouvez un élément manquant ici (nouvelle table, nouveau namespace i18n, nouveau pattern), ajoutez-le à ce fichier et exécutez `npm run build` pour valider l'intégration.

## 12. Modèle Logique de Données (MLD) — représentation SQL

But : fournir au niveau relationnel (tables, clés, types) un MLD clair dérivé de `prisma/schema.prisma` pour les opérations DBA, requêtes SQL et conception d'index.

Remarque sur les conventions : Prisma utilise des identifiants de type `String @id @default(uuid())`. Ci‑dessous les types Postgres usuels proposés (uuid, text, integer, bigint, timestamptz, jsonb, boolean). Adapter `DEFAULT` selon les extensions disponibles (`uuid_generate_v4()` ou `gen_random_uuid()`).

-- Table `users`
CREATE TABLE users (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	jellyfin_user_id text NOT NULL UNIQUE,
	username text NOT NULL,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table `media`
CREATE TABLE media (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	jellyfin_media_id text NOT NULL UNIQUE,
	title text NOT NULL,
	type text NOT NULL,
	collection_type text NULL,
	library_name text NULL,
	genres text[] NOT NULL DEFAULT '{}',
	resolution text NULL,
	duration_ms bigint NULL,
	size bigint NULL,
	directors text[] NOT NULL DEFAULT '{}',
	actors text[] NOT NULL DEFAULT '{}',
	studios text[] NOT NULL DEFAULT '{}',
	parent_id text NULL,
	artist text NULL,
	date_added timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_type ON media(type);
CREATE INDEX idx_media_collection_type ON media(collection_type);

-- Table `playback_history`
CREATE TABLE playback_history (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
	media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
	play_method text NOT NULL,
	client_name text NULL,
	device_name text NULL,
	ip_address text NULL,
	country text NULL,
	city text NULL,
	duration_watched integer NOT NULL DEFAULT 0,
	started_at timestamptz NOT NULL DEFAULT now(),
	ended_at timestamptz NULL,
	audio_language text NULL,
	audio_codec text NULL,
	subtitle_language text NULL,
	subtitle_codec text NULL,
	pause_count integer NOT NULL DEFAULT 0,
	audio_changes integer NOT NULL DEFAULT 0,
	subtitle_changes integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_playback_user ON playback_history(user_id);
CREATE INDEX idx_playback_media ON playback_history(media_id);
CREATE INDEX idx_playback_started_at ON playback_history(started_at);
CREATE INDEX idx_playback_user_started ON playback_history(user_id, started_at);
CREATE INDEX idx_playback_media_started ON playback_history(media_id, started_at);

-- Table `telemetry_event`
CREATE TABLE telemetry_event (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	playback_id uuid NOT NULL REFERENCES playback_history(id) ON DELETE CASCADE,
	event_type text NOT NULL,
	position_ms bigint NOT NULL,
	metadata jsonb NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telemetry_playback ON telemetry_event(playback_id);
CREATE INDEX idx_telemetry_event_type ON telemetry_event(event_type);
CREATE INDEX idx_telemetry_playback_event ON telemetry_event(playback_id, event_type);

-- Table `active_stream`
CREATE TABLE active_stream (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id text NOT NULL UNIQUE,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
	play_method text NOT NULL,
	client_name text NULL,
	device_name text NULL,
	ip_address text NULL,
	country text NULL,
	city text NULL,
	video_codec text NULL,
	audio_codec text NULL,
	transcode_fps real NULL,
	bitrate integer NULL,
	audio_language text NULL,
	subtitle_language text NULL,
	subtitle_codec text NULL,
	position_ticks bigint NULL,
	started_at timestamptz NOT NULL DEFAULT now(),
	last_ping_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_active_last_ping ON active_stream(last_ping_at);

-- Table `global_settings` (singleton)
CREATE TABLE global_settings (
	id text PRIMARY KEY DEFAULT 'global',
	discord_webhook_url text NULL,
	discord_alert_condition text NOT NULL DEFAULT 'ALL',
	discord_alerts_enabled boolean NOT NULL DEFAULT false,
	max_concurrent_transcodes integer NOT NULL DEFAULT 0,
	excluded_libraries text[] NOT NULL DEFAULT '{}',
	library_rules jsonb NULL,
	sync_cron_hour integer NOT NULL DEFAULT 3,
	sync_cron_minute integer NOT NULL DEFAULT 0,
	backup_cron_hour integer NOT NULL DEFAULT 3,
	backup_cron_minute integer NOT NULL DEFAULT 30,
	default_locale text NOT NULL DEFAULT 'fr',
	time_format text NOT NULL DEFAULT '24h',
	wrapped_visible boolean NOT NULL DEFAULT true,
	wrapped_period_enabled boolean NOT NULL DEFAULT true,
	wrapped_start_month integer NOT NULL DEFAULT 12,
	wrapped_start_day integer NOT NULL DEFAULT 1,
	wrapped_end_month integer NOT NULL DEFAULT 1,
	wrapped_end_day integer NOT NULL DEFAULT 31,
	plugin_api_key text NULL,
	plugin_last_seen timestamptz NULL,
	plugin_version text NULL,
	plugin_server_name text NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table `system_health_state` / `system_health_event`
CREATE TABLE system_health_state (
	id text PRIMARY KEY DEFAULT 'global',
	monitor jsonb NOT NULL,
	sync jsonb NOT NULL,
	backup jsonb NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE system_health_event (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	state_id text NOT NULL REFERENCES system_health_state(id) ON DELETE CASCADE,
	source text NOT NULL,
	kind text NOT NULL,
	message text NOT NULL,
	details jsonb NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_created_at ON system_health_event(created_at);
CREATE INDEX idx_health_source_created ON system_health_event(source, created_at);

### Remarques MLD
- Les relations 1→N : `media.playback_history`, `user.playback_history`, `playback_history.telemetry_event`.
- Choix de types : `position_ms` et `position_ticks` doivent rester `bigint` pour conserver précision des ticks.
- Pour les IDs UUID : choisir `uuid_generate_v4()` (extension `uuid-ossp`) ou `gen_random_uuid()` (extension `pgcrypto`).
- Conservation et purge : prévoir une purge/archivage de `telemetry_event` > X mois si taille DB élevée.

## 13. Détails Serveur & pipeline d'ingestion (résumé opérationnel)

Ces notes décrivent le flux serveur principal et les points à connaître pour debugging et évolution.

- Endpoints principaux :
	- `POST /api/plugin/events` — ingestion des webhooks du plugin Jellyfin (Heartbeats, PlaybackStart/Stop/Progress, LibraryChanged). Voir `src/app/api/plugin/events/route.ts`.
	- `GET /api/streams/telemetry?mediaId=...` — exports de télémétrie par média (admin). Voir `src/app/api/streams/telemetry/route.ts`.
	- `GET /api/logs/export` — export CSV des logs (filtrage côté serveur).
	- `GET /api/jellyfin/image` — proxy d'images Jellyfin pour affichage.

- Ingestion / logique principale (`/api/plugin/events`):
	1. Vérification API key (`pluginApiKey` dans `global_settings`).
	2. Upsert canonical user via `upsertCanonicalUser` : normalisation des ids Jellyfin, merge d'anciens ids, création si absent.
	3. Upsert canonical media via `upsertCanonicalMedia` : création/merge média, normalisation d'ID, stockage `durationMs` en `bigint` si fourni.
	4. PlaybackStart : tenter de réouvrir une session récente (fenêtre `MERGE_WINDOW_MS`), sinon créer `playback_history`; auto-close d'autres sessions ouvertes de l'utilisateur.
	5. PlaybackProgress : accumulateur de durée précis (clé Redis `dur:<playbackId>`), détection de pause/audio/subtitle changes, création d'entrées `telemetry_event` via `createMany` pour batch.
	6. PlaybackStop : finalise `duration_watched`, crée un event `stop` si position disponible, supprime clés Redis associées.
	7. ActiveStream : upsert sur `active_stream` (clé `sessionId`) pour état live; on stocke également un snapshot dans Redis sous `stream:<sessionId>` (TTL court, p.ex. 60s) pour les vues live.

- Redis — clés & TTL (convention observée dans le code) :
	- `stream:<sessionId>` — snapshot live (TTL ~60s)
	- `dur:<playbackId>` — durée accumulée (TTL ~86400)
	- `last_time:<playbackId>`, `last_tick:<playbackId>` — helpers pour accumulation
	- `start_pos:<playbackId>` — position initiale (TTL long)
	- `pause:<playbackId>` — marqueur pause (TTL ~3600)
	- `audio:<playbackId>`, `sub:<playbackId>` — derniers indices / metadata (TTL ~3600)
	- Locks : `lock:playback:<userId>:<mediaId>` — petit TTL (~5s) pour sérialiser création de sessions concurrentes

- Sérialisation / transport vers client (RSC/JSON)
	- BigInt (ex. `positionMs`) : le serveur convertit souvent en `string` (ex. `String(e.positionMs)`) pour éviter erreurs JSON. Le client doit `Number(...)` ou `BigInt(...)` selon usage.
	- Datetime : envoyer `.toISOString()` pour robustesse côté client.
	- Ex. `src/app/logs/page.tsx` : `safeLogs` convertit `positionMs` en `String(...)` et `createdAt` en ISO.

- Recommandations opérationnelles
	- Idempotence : les webhooks peuvent arriver en double ; les verrous Redis + recherche de sessions récentes limitent les doublons.
	- Indexation : les requêtes logs filtrent par `mediaId`, `userId`, `startedAt`, `clientName` — gardez ces index à jour.
	- Retention : prévoir job de purge/archivage pour `telemetry_event` si index et taille croissent trop.
	- Monitoring : enregistrer métriques d'ingestion (events/sec, latence DB, count des `createMany`), et erreurs de parsing du plugin.

## 14. Exemples de requêtes utiles
- Récupérer tous les events de télémétrie pour une session :
	SELECT * FROM telemetry_event WHERE playback_id = '<uuid>' ORDER BY position_ms ASC;

- Résumé par média (playback count, avg duration) :
	SELECT m.jellyfin_media_id, m.title, COUNT(ph.*) AS plays, AVG(ph.duration_watched) AS avg_dur
	FROM playback_history ph JOIN media m ON ph.media_id = m.id
	GROUP BY m.jellyfin_media_id, m.title ORDER BY plays DESC;

## 15. Notes pour les agents IA (procédure d'édition)
- Si vous proposez une modification du modèle (nouvelle table/champ), fournissez :
	1. Le changement Prisma (`schema.prisma`) précis.
	2. Le SQL de migration ou `npx prisma migrate` planifié.
	3. Les tests impactés (ex. endpoints d'ingestion) et un plan de roll-back.
- N'ajoutez pas de champs sensibles (API keys, secrets) ici : documentez simplement les noms d'env vars.

---

Si vous souhaitez que j'ajoute un diagramme ER Mermaid ou des scripts SQL de migration/archivage, dites-le et je l'ajoute dans ce fichier.

## 16. Modifications récentes (notes opérationnelles)

- Pages de paramètres : le fichier `src/app/settings/page.tsx` a été remplacé par une page d'aperçu qui renvoie vers des sous-pages dédiées : `Connexion Plugin` (`/settings/plugin`), `Planificateur de Tâches` (`/settings/scheduler`), `Notifications` (`/settings/notifications`), `Règles par bibliothèque` (`/settings/libraryRules`) et `Sauvegardes de Données` (`/settings/dataBackups`). Vérifier ces routes lors d'une QA visuelle.
- Language switcher (login) : `src/app/login/LoginLanguageSwitcher.tsx` utilise désormais des images de drapeaux (FlagCDN, ex. `https://flagcdn.com/w40/{iso}.png`) au lieu d'emojis — conserver la source `AVAILABLE_LOCALES` dans `src/i18n/locales.ts` pour la cohérence.
- Analyse média : `src/app/media/analysis/page.tsx` a été refactorée pour calculer des agrégats (total média, diversité de genres, durée moyenne, top directors, top libraries). Des clés i18n `media.*` ont été ajoutées — s'assurer qu'elles existent dans tous les fichiers `messages/*.json`.
- UI mineures : `src/app/logs/LogRow.tsx` a été ajusté pour enlever la bordure verticale par ligne (séparation maintenue au niveau de l'entête).
- Sauvegardes & bundler : pour réduire les warnings liés au traçage NFT de Turbopack, éviter les imports statiques top-level de `fs`/`path` dans le code serveur/route. Utiliser des imports dynamiques (`await import('fs')`) ou ajouter `/*turbopackIgnore: true*/` sur des imports dynamiques quand nécessaire. Fichiers notables modifiés : `src/lib/autoBackup.ts`, `src/app/api/backup/auto/*`, `src/lib/appStateStorage.ts`.
- Avertissement restant : une alerte non-bloquante Turbopack peut encore référencer `next.config.ts -> src/app/api/backup/auto/restore/route.ts`. Ce warning n'empêche pas la compilation mais peut être investigué si l'objectif est zéro warnings.
- i18n plugin : si des libellés liés au plugin changent, pensez aussi à mettre à jour `JellyTrack.Plugin/Localization/*.json` pour garder la cohérence entre l'application et le plugin.
- Refonte UI : Les filtres de `Bibliothèques` (Tous les Médias) ont été alignés sur ceux du dashboard (multi-sélection `excludeTypes`).
- Historique Utilisateur & Règles : `UserRecentMedia.tsx` utilise désormais `LogsListClient` pour un historique robuste et la gestion native des timelines (pauses, audio). La page paramètre `Règles par bibliothèque` utilise une UI avec curseurs visuels complets et traduction complète (`abandoned`, `partial`, `completed` inclus dans root `settings`).
- Graphiques d'anomalies (Santé des Logs) : Résolution d'un dysfonctionnement silencieux où les dates UTC des événements n'étaient pas correctement couplées à l'heure locale lors de la génération de l'axe temporel (corrigé via utilisation de `setUTCHours`/`getUTCDate` dans `logHealth.ts`). De plus, ajout du déclencheur `appendHealthEvent` dans la boucle d'erreurs de `sync.ts` afin que les échecs de synchronisation soient bien répertoriés. Le composant `HealthAnomalyCharts` utilise désormais la méthode `useTranslations('dashboard')` pour éviter tout terme en dur (hardcoded).
- Traduction Universelle : Les 10 langues supportées ont été synchronisées. Les clés pour les graphiques d'anomalies, les règles par bibliothèque et les recommandations IA sont désormais présentes et traduites partout, garantissant une cohérence globale du projet. Tous les fichiers JSON de traduction ont été normalisés à exactement 888 lignes pour une maintenance facilitée.
- Coopération UI & Bugs : Correction de la redirection brusque dans l'historique utilisateur (LogsListClient), réactivation de la recherche et des filtres dans "Tous les médias" (await searchParams), et harmonisation des clés de traduction (`rulesDesc` -> `libraryRulesDesc`).
- Unification des Bibliothèques : Amélioration de la résolution des noms de bibliothèques lors de la synchronisation (meilleure gestion des parents) et implémentation d'une normalisation systématique des noms dans les pages d'analyse et de collections. Les bibliothèques "fantômes" (ex: "tvshows") sont désormais regroupées et traduites correctement ("Séries TV"), évitant les doublons et les incohérences de comptage par rapport à l'interface Jellyfin.

Après ces types de changements, toujours exécuter `npm run build` pour valider la compilation et corriger les erreurs/avertissements avant de merger.

