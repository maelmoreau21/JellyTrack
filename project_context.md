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
- `src/components/dashboard/*` : composants complexes, server-fetched (`PredictionsPanel`, `HardwareMonitor`, etc.).
- `src/components/charts/*` : wrappers pour `recharts` (toujours protéger par condition si données nulles). Inclut `HeatmapDrillDown` (modal drill-down), `AttendanceHeatmap` (mobile-responsive).
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
	- champs pour webhooks, discord, quotas, `excludedLibraries String[]`, `defaultLocale`, `timeFormat`, `pluginApiKey`, `pluginLastSeen`, etc.

- `model SystemHealthState` et `SystemHealthEvent` : stockent l'état du moniteur/sync/backup et les événements associés.

- `model DailyStats` : (pré-agrégation pour performances dashboard)
	- `id String @id @default(uuid())`
	- `date DateTime` (date du jour agrégé)
	- `userId String?`, `libraryName String?`, `mediaType String?`
	- `totalPlays Int @default(0)`, `totalDuration Int @default(0)`, `uniqueUsers Int @default(0)`
	- `@@unique([date, userId, libraryName, mediaType])`
	- Usage : alimenté par `src/lib/dailyStatsAggregator.ts`, requêtable pour accélérer les vues dashboard sur de longues périodes.

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
	- `GET /api/predictions` — tendances IA et prédiction de charge (admin, cache Redis 1h).

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

	### Logs — format, colonnes et recommandations

	Notes opérationnelles (Logs / `playback_history` / affichage UI) :

	- Colonne `media` : afficher uniquement le titre canonique du média (`media.title`) et sa hiérarchie (Série - Saison). Ne plus inclure de métadonnées redondantes comme la résolution ou le mode de lecture, qui disposent de leurs propres colonnes.
	- Colonne `date` : affiche désormais la date condensée et l'heure sur deux lignes pour une meilleure lisibilité.
	- **Délimitation et Redimensionnement** :
		- Chaque colonne du tableau doit avoir une bordure verticale discrète (`border-r`) dans l'en-tête et le corps pour une lecture claire.
		- L'en-tête doit comporter un "resizer handle" visible (ligne verticale bleue lors du drag) permettant d'ajuster la largeur des colonnes.
		- La largeur des colonnes est persistée localement et via l'URL (`colsState`).
	- Colonne `resolution` : ajouter une colonne `resolution` aux exports et aux vues logs. Remonter la valeur depuis :
		- `media.resolution` (champ synchronisé lors du `sync`), ou
		- `active_stream` / snapshot live (si présent) pour refléter la résolution courante d'un flux actif.
		- Si ni l'un ni l'autre n'est disponible, normaliser à `SD`/`Unknown` selon la politique.
	- Bitrate / Qualité audio : éviter les doublons `Unknown`. La vue Logs doit prioriser :
		1. `active_stream.bitrate` (si présent) — afficher en `kbps` (ex: `320 kbps`).
		2. `telemetry_event` / metadata (si disponible) — fallback.
		3. Si aucune valeur, afficher `Unknown` UNE seule fois dans la colonne `audioQuality`.
	- Libellé musique dupliqué (`Unknown, Unknown`) : cela signale que deux champs (par ex. `audioCodec` et `bitrate`) étaient vides et affichés côte à côte. Solution : afficher les deux champs dans des colonnes distinctes (`audioCodec`, `audioBitrate`) ou n'afficher que `audioBitrate` sous forme lisible (`320 kbps`) et masquer les valeurs nulles.
	- Export CSV / API : mettre à jour `GET /api/logs/export` pour inclure `resolution`, `audioBitrate` et `audioCodec` dans l'export.

	Guides de debug rapides :

	- Vérifier les mappings dans le serveur : `src/app/logs/page.tsx` (assemblage `safeLogs`) et `src/app/logs/LogRow.tsx` (rendu des colonnes). S'assurer que `activeStream.bitrate` est propagé vers `safeLogs`.
	- Vérifier la table `active_stream` pour les sessions live :
		```sql
		SELECT session_id, media_id, bitrate, video_codec FROM active_stream WHERE last_ping_at > now() - interval '5 minutes';
		```
	- Pour analyser les `Unknown` en masse :
		```sql
		SELECT ph.id, ph.media_id, m.title, ph.audio_codec, ph.client_name
		FROM playback_history ph
		JOIN media m ON ph.media_id = m.id
		WHERE ph.audio_codec IS NULL OR ph.audio_codec = '' OR ph.bitrate IS NULL
		LIMIT 200;
		```

	- UI : proposer deux colonnes visibles dans l'UI Logs : `Resolution` et `Audio (kbps)` ; regrouper `player/application` dans `Client`.

	- Remontées utilisateurs : si vous voyez titres concaténés avec le client, rechercher transformations côté ingestion (plugin ou route d'ingestion) qui pourraient préfixer `media.title` par `clientName` — corriger `upsertCanonicalMedia` ou `safeLogs` mapping.

	---

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

    - **Refonte UI & Thèmes (Mars 2026)** :
        - **Mode Clair "Satin 2.0"** : Évolution vers une esthétique encore plus reposante. Luminosité abaissée (L=0.85), tons pastels plus sourds, et suppression totale des fonds blancs pur (#FFFFFF). Redéfinition du bouton de thème et des surfaces globales.
        - **Prévention Automatisée des Fuites de Thème** : Mise en place d'un "catch-all" CSS global dans `globals.css` qui intercepte les classes Tailwind `bg-white`, `bg-zinc-50/100/200` et `bg-slate-x` pour les adoucir automatiquement en mode clair, garantissant une cohérence visuelle sans modifier chaque composant individuellement.
        - **Mode Sombre Raffiné** : Correction des contrastes (tooltips sombres, hovers adaptés) et uniformisation des composants (Cleanup, Dashboard, Users).
        - **Standardisation Thématique** : Remplacement systématique des classes Tailwind "dures" (`bg-white`, `bg-zinc-900`) par des variables sémantiques (`app-surface`, `bg-card`).
        - **Correction "Détails par Collection"** : Résolution du bogue des bibliothèques vides via l'alignement sur `libraryName`.
        - **Optimisation des Journaux (Logs) :**
            - Nettoyage de la colonne Média : suppression des "Unknown" en cascade.
            - **Persistence du Bitrate** : Ajout du champ `bitrate` dans `PlaybackHistory` et capture lors des événements du plugin pour un historique complet.
            - **Synchronisation des Colonnes** : Correction du drag-and-drop des colonnes pour refléter l'ordre dans le corps du tableau.
            - Sécurisation de la colonne Résolution.
        - **Navigation & i18n** :
            - Restauration de l'onglet "Media Settings" dans les paramètres.
            - Correction des traductions françaises (remplacement des résidus d'allemand).
        - **Analyse Bibliothèque :**
            - Alignement des stats de qualité vidéo avec la liste des médias.
            - Propagation de la résolution maximale des épisodes vers la série parente.
    - Suppression des doublons de titres/descriptions ("Aperçu des statistiques approfondies").
    - Correction de la matrice des résolutions : utilise désormais `normalizeResolution` et agrège par entité parente unique (Films/Séries) pour correspondre aux filtres de la page "Tous les Médias".
    - Amélioration de la cohérence entre les statistiques affichées et les résultats de filtrage.

### Problèmes Courants & Solutions
- **Interactivité du Dashboard** : Les graphiques sont désormais cliquables et redirigent vers les logs filtrés. Suppression du mode "collapsible" sur les cartes pour une visibilité immédiate.
    - **Nettoyage Code & Types** : Résolution de nombreuses erreurs de lint (TypeScript, CSS) et suppression de fichiers obsolètes ou inutilisés.
- **Satin 2.0 Theme Refinement**: Transitioned to a matte, non-glaring light mode using HSL variables and a global "white-leakage" prevention rule in CSS.
- **Translation Parity**: Synchronized 10 translation files (`messages/*.json`) to have identical keys, item counts, and line counts (915 lines each).
- **Stability Audit**: Resolved regressions in core synchronization integration tests and resolution classification thresholds. Achieved 100% success rate on `npm run build` and `npm run test`.
- **Media Analysis**: Fixed Video Quality statistics and ensured resolution propagation from episodes to series.
- **Logs**: Fixed column synchronization and added bitrate persistence.
- **Episode Poster Aspect Ratio**: Fixed the issue where episode posters (typically 16:9) were being forced into a vertical 2:3 ratio, causing them to be cut off. Standardized with `aspect-video` for episodes across the UI.
- **Media Hierarchy & Breadcrumbs**: Improved navigation and visibility for episodes and tracks by displaying their ancestry (Series - Season, Artist - Album) prominently in the profile header and logs.
  - Standardized the separator as ` - ` throughout the UI.
	- Enhanced `getMediaSubtitle` in logs to handle recursive lookups and fallback metadata.
	- Logs: pour les médias musicaux, l'UI affiche désormais le bitrate en `kbps` (si connu) au lieu d'afficher "Unknown" pour la qualité.
	- Video Quality chart: added a `1440p` (QHD) bucket and made the resolution rows interactive — each row links to `/media/all?resolution=<bucket>` to inspect the matching items. Audio/media (albums/tracks) are excluded from video-quality counts to avoid polluting "Standard / Autre" with audio-only items.
	- Light theme redesign: complete refonte du mode clair vers une direction "Soft-Slate" — palette neutre et atténuée, accents teal/amber, moins d'éblouissement (moindre contraste blanc pur), et ajustements UI (cards, surfaces, tooltips, charts) pour une lecture plus confortable sur de longues sessions. Voir `src/app/globals.css` pour les variables CSS modifiées (`--background`, `--foreground`, `--card`, `--primary`, chart vars, etc.).
- **Améliorations de la Surveillance & Collections (Mars 2026)**:
    - **Synchronisation Précise**: Le processus de synchronisation (`sync.ts`) extrait désormais explicitement `RunTimeTicks` de Jellyfin, garantissant une mesure exacte de la durée totale des collections.
    - **Santé du Moniteur**: L'état du moniteur ("Last Success") est désormais mis à jour par TOUS les événements du plugin (PlaybackStart, Progress, Stop) en plus du Heartbeat, évitant l'affichage persistant de "Jamais" si le plugin est actif mais que le cron de heartbeat est lent.
    - **Règles de Complétion Dynamiques**: Les règles de complétion dans la Santé des Logs sont désormais basées sur les bibliothèques RÉELLEMENT présentes dans la base de données, éliminant les types génériques non pertinents.
    - **Normalisation UHD**: Les bibliothèques de type UHD (`seriesuhd`, `filmsuhd`) sont désormais correctement normalisées et traduites, résolvant les incohérences de nommage (ex: "SéRies UHD").
    - **Hiérarchie Médiale**: Amélioration de la navigation sur les pages de profil média avec des fils d'Ariane cliquables incluant l'Artiste pour la musique.
    - **Dédoublonnage des Collections**: Utilisation de `normalizeLibraryKey` pour fusionner les bibliothèques aux noms variés (ex: "Musique" vs "musique") dans une vue unique et cohérente.
    - **Refonte de la Santé des Logs (Mars 2026)**: Overhaul complet de la page `admin/log-health` avec un design premium, des cartes de statut plus claires et des graphiques d'anomalies (`HealthAnomalyCharts`) plus robustes. Suppression définitive de la configuration des "Règles de Complétion" obsolètes.
    - **Interactivité du Dashboard (Mars 2026)**:
        - Les graphiques du tableau de bord (`MonthlyWatchTimeChart`, `CategoryPieChart`, `PlatformDistributionChart`) sont désormais interactifs. Cliquer sur un segment ou une barre redirige automatiquement vers les logs filtrés correspondants (par type, client ou période).
        - **Synchronisation des Colonnes :** Correction du bug où le réordonnancement des colonnes (drag-and-drop) n'affectait que les en-têtes. Le composant `LogRow` a été refactorisé pour restituer dynamiquement les cellules dans l'ordre exact défini par l'utilisateur.
        - Suppression de la fonctionnalité de réduction/expansion des cartes (`CollapsibleCard`) sur tout le tableau de bord et dans les statistiques de bibliothèque pour garantir une visibilité totale et immédiate des données.

Après ces changements, toujours exécuter `npm run build` pour valider la compilation.

## 17. Dépannage — Import des Collections ("Détails par Collection")

Problème fréquent : sur la page **Détails par Collection** seules des collections vides (ou la pseudo‑collection "Collections") apparaissent, alors que votre Jellyfin comporte plusieurs bibliothèques avec du contenu.

Causes possibles et vérifications rapides :
- **Confusion sur les Clés** (Corrigé en Mars 2026) : Auparavant, l'application regroupait les médias par leur type générique (`tvshows`, `movies`). Si votre bibliothèque s'appelait "Séries TV", elle apparaissait vide car les données étaient cachées sous la clé masquée `tvshows`. Désormais, la priorité est donnée au nom réel (`libraryName`).
- Variables d'environnement manquantes : `JELLYFIN_URL` et `JELLYFIN_API_KEY` sont utilisées par `getSanitizedLibraryNames()` pour récupérer les VirtualFolders. Si elles manquent ou sont incorrectes, l'application retombe sur les noms présents en base de données ou sur des valeurs par défaut.
- Bibliothèques marquées comme "ghost" : `GHOST_LIBRARY_NAMES` contient des noms pseudo‑libraries (ex: `Collections`, `Movies`, `Music`). Elles ne sont désormais masquées QUE si elles sont réellement vides.

Étapes de diagnostic (commande / requêtes utiles) :
- Vérifier les env vars :
```
echo %JELLYFIN_URL%
echo %JELLYFIN_API_KEY%
```
- Tester l'API Jellyfin VirtualFolders (remplacez <JELLYFIN_URL> et <API_KEY>) :
```
curl -s -H "X-Emby-Token: <API_KEY>" "<JELLYFIN_URL>/Library/VirtualFolders" | jq '.'
```
- Vérifier les noms de bibliothèques stockés en base (via psql / Prisma) :
SQL:
```
SELECT DISTINCT library_name FROM media ORDER BY library_name;
SELECT library_name, COUNT(*) FROM media GROUP BY library_name ORDER BY COUNT DESC LIMIT 20;
```
- Vérifier `excludedLibraries` dans la table `global_settings` :
```
SELECT excluded_libraries FROM global_settings WHERE id = 'global';
```
- Vérifier s'il y a des `collectionType='boxsets'` (ignorés) :
```
SELECT collection_type, COUNT(*) FROM media GROUP BY collection_type;
```

Remèdes rapides :
- Si `JELLYFIN_URL`/`JELLYFIN_API_KEY` manquent, ajouter-les dans votre `.env` et re‑lancer la sync / redémarrer le serveur.
- Si des bibliothèques sont dans `excludedLibraries`, retirez‑les via UI Settings ou directement dans la table `global_settings` (attention en prod).
- Si la synchronisation n'a pas renseigné `libraryName` ou `collectionType`, relancer un `full sync` (voir scripts de synchronisation) pour forcer le remontée des métadonnées.
- Si votre VirtualFolder est de type `boxsets` et que vous souhaitez l'afficher, modifier `getSanitizedLibraryNames()` pour ne plus filtrer `CollectionType === 'boxsets'` (nécessite revue & build).

Si vous voulez, je peux :
- exécuter les requêtes SQL ci‑dessus (si vous me donnez accès à la DB ou à un dump),
- lancer localement un `curl` vers votre Jellyfin (si vous confirmez l'URL/API key),
- ou appliquer une petite PR pour afficher temporairement plus d'informations de debugging dans `CollectionsPage` (par ex. afficher `rawNames` et la taille détectée par bibliothèque).

## 18. Breadcrumbs / Remontée de la hiérarchie (Comportement attendu)

Objectif : permettre à l'utilisateur de "remonter" facilement la hiérarchie (Episode → Season → Series, Track → Album → Artist) depuis la page de détail d'un média, même si Jellyfin n'a pas fourni tous les parents dans son payload.

Comportement implémenté :
- La page de détail média (`src/app/media/[id]/page.tsx`) tente d'abord d'utiliser les métadonnées retournées par l'API Jellyfin (`SeriesId`, `SeasonId`, `AlbumId`, `AlbumArtist`).
- Si ces IDs ne sont pas présents, le serveur remonte la chaîne de `parentId` stockée localement dans la table `media` (champ `parentId` contient l'ID Jellyfin du parent). On effectue des recherches successives (`jellyfinMediaId = parentId`) jusqu'à atteindre la racine ou un cycle.
- Les ancêtres résolus sont exposés en fallback aux breadcrumbs et aux boutons de navigation rapide présents en haut de la page (links vers `/media/{jellyfinId}`).

Points d'attention et debugging :
- Si la synchronisation n'a pas importé les parents (champ `parentId` absent), la remontée ne pourra pas fonctionner — relancer un `full sync` résout souvent ce cas.
- Pour diagnostiquer, activez `DEBUG_COLLECTIONS=1` ou visitez `/media/collections?debugCollections=1` pour voir les `rawNames` et mappings.
- Les résolutions utilisent `jellyfinMediaId` comme clé ; si vous avez plusieurs entrées pour le même Jellyfin ID, corriger les doublons en base.

## 19. Checklist sécurité API
- **Toutes** les routes sous `src/app/api/` (sauf `plugin/events` qui valide via `pluginApiKey` et `auth/[...nextauth]`) **doivent** inclure `requireAdmin()` ou `getServerSession()` en tout premier appel.
- Pattern standard :
	```ts
	import { requireAdmin, isAuthError } from "@/lib/auth";
	export async function GET() {
		const auth = await requireAdmin();
		if (isAuthError(auth)) return auth;
		// ...
	}
	```
- Ne jamais ajouter de route API sans garde d'authentification.

## 20. Corrections UI (Round 2 — 2026-03-25)

### WorldMap
`src/components/dashboard/WorldMap.tsx` — anciennement des ellipses SVG pour les continents, remplacé par de vrais tracés `<path>` pour un rendu plus réaliste. Fond dégradé, grille lat/long en pointillés, équateur visible, compteurs de sessions dans les gros dots.

### AIRecommendations
- Composant `src/components/dashboard/AIRecommendations.tsx` accepte désormais un prop optionnel `userId`.
- Intégré dans la page profil utilisateur (`src/app/users/[id]/page.tsx`) pour permettre aux non-admins de voir les recommandations.
- API `src/app/api/recommendations/route.ts` accepte `?userId=` — admin peut voir tout, non-admin uniquement ses propres recs.

### Paramètres Média — Bibliothèques exclues
`src/app/settings/media/page.tsx` — toggle visuel pour exclure des bibliothèques des statistiques. Utilise `data.availableLibraries` de l'API `/api/settings`. Les bibliothèques exclues sont envoyées via `excludedLibraries` dans le POST.

### Scheduler boutons
`src/app/settings/scheduler/tasks/page.tsx` — les 3 boutons de tâche (Synchro Récente, Synchro Totale, Sauvegarde) ont `border border-{color}-400/50` pour un contour visible avec remplissage.

### Nettoyage de Printemps (Release Ready — 2026-03-25)
- **Suppression des composants obsolètes** : Retrait définitif de `AIRecommendations`, `WorldMap` (Carte des Connexions) et `MetadataAudit` du dashboard et des profils utilisateurs.
- **Optimisation Logicielle** : Suppression des fichiers `lib/recommendations.ts`, `api/recommendations/route.ts` et des clés i18n associées pour un projet plus léger et maintenable.
- **Harmonisation des Boutons** : Finalisation du style des boutons du planificateur (remplis, ombres portées, variantes dark mode explicites).
- **Correction Durée Musique** : Optimisation de l'accumulateur de durée (Redis) pour éviter les relevés à 0 min. Augmentation du seuil d'intervalle à 120s et ajout du segment final au `PlaybackStop`.
