# Inventaire JellyTrack (phase 0)

État observé dans le dépôt existant au 7 octobre 2026. Ce document décrit le code actuellement présent; il ne constitue pas encore la spécification de la v3. Les entrées et sorties des routes ci-dessous sont résumées à partir des handlers. Les paramètres complets sont ceux lus par le handler (query, route, JSON, formulaire ou en-têtes); vérifier chaque schéma de validation au moment du portage.

## Points à valider avant la phase 1

- **Base externe :** choix confirmé et implémenté en phase 2 : SQLite est le mode autonome par défaut; une PostgreSQL externe reste disponible avec `DATABASE_DRIVER=postgres` et `DATABASE_URL`, sans service ajouté au compose. Elle doit être fournie et administrée séparément.
- **Versions stables :** les versions stables retenues à la phase 1 sont inscrites dans les fichiers de verrouillage de `/v3`; elles ont été vérifiées le 7 octobre 2026.
- Le futur contrat de sécurité décrit dans ta demande (notamment `/api/health` strictement minimal) est une exigence cible; l’implémentation actuelle expose un contrôle de santé détaillé réservé à l’administrateur.

## Données Prisma

11 modèles/tables déclarés dans `prisma/schema.prisma` :

| Table | Rôle et relations principales |
|---|---|
| `Server` | Serveurs Jellyfin configurés; parent des utilisateurs, médias, historiques, télémétries et flux. |
| `User` | Utilisateurs Jellyfin, actifs/inactifs et dernière activité; unique par serveur + identifiant Jellyfin. |
| `Media` | Catalogue (type, bibliothèque, genres, résolution, durée, taille, personnes, studio, parent, artiste, date d’ajout); unique par serveur + identifiant Jellyfin. |
| `PlaybackHistory` | Lecture et téléchargement, durée, client/appareil, IP/géolocalisation, langues/codecs, compteurs pause/seek/relecture/vitesse et déduplication `(serverId, sourceEventId)`. |
| `TelemetryEvent` | Événements associés à une lecture (pause, changement audio/sous-titre, seek, etc.), position et métadonnées JSON. |
| `ActiveStream` | Flux en direct Jellyfin, session, médias/utilisateur, codecs, transcodage, position, heartbeat et lien facultatif à l’historique. |
| `GlobalSettings` | Paramètres singleton: alertes Discord, bibliothèques exclues, planification, locale/format, Wrapped, clés/rotation plugin, sessions, résolution et SSO. |
| `AdminAuditLog` | Journal des actions administrateur. |
| `SystemHealthState` | État singleton JSON du moniteur, de la synchronisation et des sauvegardes. |
| `SystemHealthEvent` | Événements de santé reliés à l’état global. |
| `DailyStats` | Agrégats par jour, utilisateur, bibliothèque et type de média. |

Les tableaux Prisma (genres, réalisateurs, acteurs, studios, bibliothèques exclues) et colonnes JSON devront être représentés explicitement dans SQLite. Les relations utilisent principalement `onDelete: Cascade`; la relation ActiveStream→PlaybackHistory utilise `SetNull`. Le schéma contient déjà de nombreux index sur serveur, utilisateur, média, dates, types, événements et IP.

## Routes API présentes

49 fichiers `route.ts`. « Session » signifie session NextAuth; « admin » signifie session administrateur. Les mutations administratives passent généralement par `requireAdminMutation` (auth + vérification d’origine/CSRF). « plugin » signifie authentification de clé plugin dans le POST; GET/OPTIONS sont des diagnostics/interopérabilité. Les résumés de réponses omettent les codes d’erreur et détails de traduction.

| Méthode et chemin | Accès observé | Entrées principales → résultat |
|---|---|---|
| GET/PATCH/POST `/api/admin/auth/session-policy` | admin | lit ou modifie la politique de session/révocation; renvoie la politique et/ou le statut de modification. |
| POST `/api/admin/cleanup/delete-stale-movies` | admin | options de nettoyage en JSON; supprime médias/historiques obsolètes et renvoie le bilan. |
| POST `/api/admin/consolidate-history` | admin | options de consolidation; fusionne des lectures fragmentées et renvoie le bilan. |
| GET `/api/admin/health` | admin | aucun; diagnostic détaillé de l’application et de ses dépendances. |
| POST `/api/admin/integrity-cleanup` | admin | demande de nettoyage; supprime/corrige les sessions orphelines et renvoie le compte. |
| GET/POST `/api/admin/plugin/health` | admin | filtres de diagnostic ou action demandée; renvoie l’état/la santé plugin et résultats d’action. |
| GET `/api/admin/security/audit` | admin | paramètres de pagination/filtres; événements d’audit paginés. |
| GET `/api/admin/security/overview` | admin | aucun; résumé de l’état de sécurité. |
| GET/PATCH `/api/admin/security/smart-settings` | admin | réglages ou patch JSON; paramètres de seuils/intelligence de sécurité. |
| GET/POST `/api/admin/users/duplicates` | admin | GET aucun; POST demande de fusion/traitement; renvoie doublons ou résultat. |
| POST `/api/admin/users/merge` | admin | identifiants utilisateur source/cible et options; fusionne puis renvoie le résultat. |
| POST `/api/admin/users/sync-deleted` | admin | demande de synchronisation; synchronise les utilisateurs supprimés côté Jellyfin. |
| DELETE `/api/admin/users/{id}` | admin | id route; suppression/désactivation utilisateur et résultat. |
| GET `/api/auth/[...nextauth]` | flux NextAuth | paramètres OAuth/session; redirections ou données de session. |
| POST `/api/auth/[...nextauth]` | flux NextAuth | callback de connexion/déconnexion; cookie/réponse d’authentification. |
| GET `/api/backup/auto` | admin | aucun; liste des sauvegardes automatiques/manuelles (nom, taille, date). |
| POST `/api/backup/auto/delete` | admin | nom de sauvegarde JSON; suppression et statut. |
| GET `/api/backup/auto/download` | admin | nom de fichier en query; flux ZIP. |
| POST `/api/backup/auto/restore` | admin | sauvegarde sélectionnée; restaure et renvoie le statut. |
| POST `/api/backup/auto/trigger` | admin | demande de lancement; crée une sauvegarde et renvoie son nom/statut. |
| GET `/api/backup/export` | admin | aucun; export ZIP de sauvegarde. |
| POST `/api/backup/import` | admin | fichier ZIP multipart; valide/import et renvoie bilan/erreurs. |
| GET `/api/geo-stats` | admin | paramètres de période/serveurs; agrégats géographiques. |
| GET `/api/hardware` | admin | aucun; statistiques matérielles du serveur hôte. |
| GET `/api/health` | code actuel: détails admin, statut minimal sinon | aucun; état DB/Valkey/Jellyfin détaillé selon l’auth. Le contrat v3 demandé doit retourner uniquement `{"status":"ok"}` sans auth. |
| GET `/api/heatmap-detail` | admin | période, utilisateur et paramètres de sélection; détails d’activité de la carte thermique. |
| GET `/api/jellyfin/image` | session | paramètres serveur/média/type d’image; image relayée depuis Jellyfin. |
| POST `/api/jellyfin/kill-stream` | admin | session/flux à arrêter; commande envoyée à Jellyfin et résultat. |
| POST `/api/jellyfin/send-message` | admin | utilisateur/message JSON; envoie un message Jellyfin et renvoie le résultat. |
| GET `/api/jellyfin/user-image` | session | identifiant utilisateur/serveur; image de profil relayée. |
| GET `/api/logs/export` | admin | période/filtres; export de logs (CSV). |
| GET/DELETE `/api/logs/system` | admin | GET paramètres de page/filtres; liste paginée. DELETE filtres de suppression; résultat. |
| GET `/api/logs/system/download` | admin | type/période; téléchargement de logs système. |
| POST `/api/media/{id}/poster-rotator/rotate` | admin | id média et paramètres; demande à Jellyfin de faire tourner l’affiche et renvoie le statut. |
| GET `/api/metadata-audit` | admin | paramètres de filtres/page; incohérences de métadonnées. |
| POST `/api/newsletter/discord-post` | admin | contenu/paramètres de publication JSON; résultat du post Discord. |
| GET/POST/DELETE `/api/plugin/api-key` | admin | GET état de clé sans exposer le secret; POST rotation/génération; DELETE révocation; statut/clé affichable à la création. |
| OPTIONS `/api/plugin/events` | sans clé (CORS) | prérequête CORS; réponse vide 204. |
| GET `/api/plugin/events` | sans clé (diagnostic actuel) | aucun; confirme que l’endpoint accepte POST. |
| POST `/api/plugin/events` | clé plugin + limitation de débit | JSON d’événement, en-têtes d’auth, identité serveur, éventuellement `sourceEventId`; traite MediaDownloaded et lecture start/progress/stop, pause/reprise/seek, audio/sous-titres/vitesse, heartbeat; réponse succès/erreur. Les événements non-lecture sont dédupliqués par serveur + id source. |
| GET `/api/predictions` | admin | aucun/paramètres de période; prédictions analytiques. |
| GET `/api/search` | session | `q` (au moins 2 caractères); résultats médias/utilisateurs filtrés selon droits et bibliothèques exclues. |
| GET/POST `/api/settings` | admin | GET lit réglages; POST JSON validé (alertes, exclusion de bibliothèques, planification, langue, Wrapped, seuils, télémétrie); renvoie réglages/statut. |
| GET/POST/PATCH/DELETE `/api/settings/jellyfin-servers` | admin | liste ou CRUD de serveur (URL, nom, identifiant, clé, actif, fallback); réponse de configuration/validation. |
| POST `/api/settings/jellyfin-servers/plugin-key` | admin | serveur cible; génère/renouvelle clé plugin pour ce serveur. |
| GET/PUT `/api/settings/sso` | admin | lit ou enregistre configuration OIDC/SSO; paramètres/validation et résultat. |
| GET `/api/stats/deep` | admin | filtre serveurs; top réalisateurs, acteurs, studios. |
| GET `/api/streams` | admin | filtres/pagination; flux actifs. |
| GET `/api/streams/telemetry` | admin | filtres session/flux; données détaillées de télémétrie. |
| POST `/api/sync` | admin | options de synchronisation (récente/complète, serveurs); résultat du sync Jellyfin. |
| GET `/api/users/{id}/active-stream` | session dans le handler | id utilisateur; flux actif (accès à son propre compte ou règles admin à confirmer dans détail du code). |
| GET/OPTIONS `/api/webhook/jellyfin` | GET diagnostic sans clé; OPTIONS CORS | GET réutilise le diagnostic plugin; OPTIONS prérequête. |
| POST `/api/webhook/jellyfin` | validation de l’hôte annoncé contre `ALLOWED_JELLYFIN_HOSTS`; traitement partagé avec les événements plugin | événement Jellyfin JSON limité en taille; relayé vers le traitement plugin après validation d’hôte. Ce handler ne vérifie pas `JELLYFIN_WEBHOOK_SECRET`. |

Le handler plugin accepte aussi des aliases/cas de compatibilité (notamment identifiants/attributs Jellyfin en PascalCase et camelCase); le portage devra prendre `pluginEventHelpers.ts`, les tests de route, et les payloads du plugin C# comme référence complète.

## Pages du frontend

36 fichiers `page.tsx` (les pages suivantes peuvent également avoir des composants clients dédiés):

| Chemin | Contenu/fonction |
|---|---|
| `/` | Tableau de bord, indicateurs, analyses et flux en direct. |
| `/login` | Connexion, choix de langue et SSO/administrateur local selon configuration. |
| `/setup` | Configuration initiale. |
| `/about` | Version et informations de l’application. |
| `/recent` | Médias/lectures récents. |
| `/newsletter` | Vue de newsletter/partage. |
| `/users` | Liste et gestion des utilisateurs. |
| `/users/{id}` | Profil, statistiques, activité, flux et médias récents. |
| `/wrapped/{userId}` | Récapitulatif annuel Wrapped par utilisateur. |
| `/media` | Vue principale des médias. |
| `/media/all` | Catalogue complet et contrôles/filtrage. |
| `/media/analysis` | Analyse de médias. |
| `/media/collections` | Collections. |
| `/media/popular` | Médias populaires. |
| `/media/artist/{name}` | Médias par artiste. |
| `/media/{id}` | Détail média, chronologie, abandons, télémétrie et affiches. |
| `/logs` | Logs d’activité et logs système, filtres/export. |
| `/settings` | Accueil des réglages. |
| `/settings/overview` | Vue d’ensemble des réglages. |
| `/settings/analytics` | Paramètres analytiques. |
| `/settings/dataBackups` | Export, import, restauration et sauvegardes automatiques. |
| `/settings/jellyfin` | Configuration Jellyfin. |
| `/settings/media` | Politique et filtres médias. |
| `/settings/network` | Réglages réseau. |
| `/settings/notifications` | Alertes/notifications. |
| `/settings/plugin` | Connexion des serveurs et plugin Jellyfin. |
| `/settings/plugin/security` | Réglages de sécurité plugin. |
| `/settings/sso` | Réglages OIDC/SSO. |
| `/settings/scheduler` | Planification générale. |
| `/settings/scheduler/schedules` | Horaires et intervalles. |
| `/settings/scheduler/tasks` | Tâches planifiées. |
| `/admin/cleanup` | Nettoyage et entretien des données. |
| `/admin/health` | Santé système et fermetures récentes. |
| `/admin/log-health` | Santé des journaux. |
| `/admin/plugin-health` | Diagnostic/plugin, événements et configuration. |
| `/admin/server-compare` | Comparaison de serveurs Jellyfin. |

Composants de support notables: Sidebar, sélection de thème/langue/période, recherche, filtres enregistrés, fenêtres de session, graphiques Recharts (activité, tendances, répartition, chaleur, transcodage, utilisateurs, genres, complétion), contrôles d’administration, gestion des flux et composants UI Radix/shadcn. L’inventaire des composants se trouve sous `src/components/`, ainsi que dans les sous-dossiers des pages.

## Tâches planifiées et scripts

Tâches dans `src/server/cronManager.ts` (horaires exprimés via node-cron; certains commentaires indiquent UTC, sans que tout le code fixe explicitement un fuseau):

- Synchronisation Jellyfin récente, par défaut toutes les 6 h.
- Synchronisation complète, par défaut toutes les 48 h.
- Sauvegarde automatique, par défaut toutes les 24 h.
- Nettoyage d’intégrité des sessions orphelines, par défaut toutes les 6 h.
- Rétention des logs système tous les jours à 04:00; défaut 30 jours.
- Consolidation de l’historique chaque nuit à 03:45; fenêtre 60 minutes.
- Nettoyage initial des logs système lors de l’initialisation du planificateur.

Scripts disponibles:

- `scripts/retention.js`: supprime les `TelemetryEvent` plus anciens que `RETENTION_DAYS` (défaut 90).
- `scripts/consolidate_history.js`: consolidation des lectures par serveur/utilisateur/média; options `MERGE_WINDOW_MINUTES` (60) et `DRY_RUN`.
- `scripts/check_i18n_media.js`, `check_all_i18n.js`, `find_missing_translations.js`: vérification et comparaison des traductions.

`src/lib/cleanup.ts`, `autoBackup.ts`, `sessionConsolidation.ts`, `sync.ts`, `systemLogger.ts` apportent les opérations utilisées par les crons. La persistance exacte et les options de chacune doivent être reprises à leur portage.

## Variables d’environnement

Relevées dans `.env.example`, `docker-compose.yml`, `docker-entrypoint.sh`, `prisma.config.ts`, `next.config.ts` et les références à `process.env` dans `src/`. Les variables conditionnelles/compatibilité sont conservées ici, même si certaines ne sont pas dans `.env.example`.

- **Base actuelle PostgreSQL:** `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JELLYTRACK_DB_USER`, `JELLYTRACK_DB_PASSWORD`, `JELLYTRACK_DB_NAME`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_IP`, `POSTGRES_PORT`, `POSTGRES_DB`; `PRISMA_USE_STUB`, `JELLYTRACK_PRISMA_ACCEPT_DATA_LOSS`.
- **Cache:** `VALKEY_URL`, `REDIS_URL`, `VALKEY_IMAGE`, `REDIS_IMAGE`.
- **Application:** `TZ`, `PORT`, `JELLYTRACK_PORT`, `APP_PORT`, `JELLYTRACK_MODE`, `APP_VERSION`, `NODE_ENV`, `NODE_OPTIONS`, `ANALYZE`, `SKIP_INSTRUMENTATION`, `NEXT_PHASE`, `NEXT_RUNTIME`, `XDG_CACHE_HOME`, `LOG_DIR`, `LOG_LEVEL`, `LOG_MAX_FILE_SIZE_BYTES`, `IMAGE_CACHE_DIR`, `DEBUG_COLLECTIONS`.
- **URL/session/secrets:** `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `JELLYTRACK_SECRET`, `JELLYTRACK_URL`, `JELLYGATE_URL`, `AUTH_TRUSTED_ORIGIN`, `AUTH_TRUSTED_ORIGINS`, `AUTH_TRUSTED_HOSTS`, `ALLOW_MISSING_ORIGIN_FOR_MUTATIONS`, `ALLOW_FALLBACK_ADMIN`, `HOSTNAME`, `ALLOWED_HOSTS`, `TRUSTED_PROXY_HOPS`.
- **Jellyfin/plugin:** `JELLYFIN_URL`, `JELLYFIN_API_KEY`, `JELLYTRACK_JELLYFIN_API_KEY`, `JELLYFIN_SERVER_ID`, `JELLYFIN_SERVER_NAME`, `JELLYFIN_WEBHOOK_SECRET`, `JELLYTRACK_WEBHOOK_SECRET`, `PLUGIN_KEY_PEPPER`, `PLUGIN_KEY_PREVIOUS_PEPPERS`, `PLUGIN_EVENT_MAX_BYTES`, `PLUGIN_EVENT_RATE_LIMIT_MAX`, `PLUGIN_EVENT_RATE_LIMIT_WINDOW_SECONDS`, `PLUGIN_HEARTBEAT_TIMEOUT_SEC`, `PLUGIN_HEALTH_GAP_CRITICAL_SEC`, `PLUGIN_HEALTH_GAP_WARNING_SEC`, `PLUGIN_HEALTH_JITTER_CRITICAL_SEC`, `PLUGIN_HEALTH_JITTER_WARNING_SEC`, `ALLOWED_JELLYFIN_HOSTS`, `MERGE_WINDOW_MS`.
- **OIDC:** `OIDC_ENABLED`, `OIDC_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_USER_GROUP`, `OIDC_ADMIN_GROUP`, `OIDC_TOKEN_ALG`, `OIDC_AUTO_REDIRECT`, `OIDC_AUTO_LOGIN`, `OIDC_ALLOW_FUZZY_USER_MATCHING`, `AUTHENTIK_URL`, `JELLYTRACK_AUTHENTIK_URL`.
- **Admin local:** `JELLYTRACK_LOCAL_ADMIN_USER`, `JELLYTRACK_LOCAL_ADMIN_PASSWORD`, `JELLYGATE_LOCAL_ADMIN_USER`, `JELLYGATE_LOCAL_ADMIN_PASSWORD`.
- **Sauvegarde/import:** `BACKUP_DIR`, `BACKUP_IMPORT_MAX_BYTES`.
- **Rétention/consolidation:** `RETENTION_DAYS`, `MERGE_WINDOW_MINUTES`, `DRY_RUN`.
- **Docker:** `PUID`, `PGID`, `APP_PORT`.

`.env.example` contient les valeurs illustratives et variables à définir, mais les fichiers `.env` et `.env.local` présents dans le workspace ne sont pas lus ni copiés dans cet inventaire.

## Fonctionnalités observées à préserver

- Multi-serveurs Jellyfin (selon `JELLYTRACK_MODE`), synchronisation des catalogues et utilisateurs, activation/inactivation, liaison de comptes.
- Plugin Jellyfin : génération/rotation/révocation de clés, statut/heartbeat/version, ingestion d’événements de lecture, téléchargement et télémétrie; tolérance à des lectures fragmentées et déduplication des événements.
- Historique, sessions actives, sessions fusionnées, durées, pauses, sauts/relectures, vitesse, changements de pistes audio/sous-titres, transcodage, clients/appareils, IP/GeoIP.
- Règles des vues: téléchargements comptés comme vues complètes; cumul de complétion par utilisateur+média, y compris entre jours; exclusion des bibliothèques configurées; filtres de période sur vues et durées (exigences utilisateur à garantir dans la v3).
- Tableau de bord et analyses (période, utilisateur, serveur, média, genres, activité horaire/jour, heatmaps, tendances, prédictions, approfondissements, Wrapped).
- Catalogue/recherche, navigation média, détails/timeline, collections, popularité, artistes, posters/images Jellyfin.
- Administration: utilisateurs/doublons/fusion, santé système/plugin, audit sécurité, nettoyage, intégrité, consolidation, logs, comparaison serveurs.
- Paramètres: serveur(s), bibliothèques exclues, seuils résolution, langue/format horaire, notifications Discord, planification, réglages de sécurité, plugin, session, SSO.
- Authentification Jellyfin via NextAuth, OIDC avec groupes user/admin, connexion locale d’urgence si configurée.
- Sauvegardes ZIP manuelles/automatiques: export, import, téléchargement, suppression, restauration et planification.
- Internationalisation: fichiers `messages/*.json` (de, en, es, fallback, fr, it, nl, pl, pt-BR, ru, zh), sélecteurs de langue; thème; interface responsive.
- Relais d’actions vers Jellyfin: envoyer message utilisateur et arrêter un flux.

## Déploiement actuel

`docker-compose.yml` déploie l’application Next.js, PostgreSQL 17 et Valkey 8 (option Redis), avec volumes PostgreSQL/Valkey/sauvegardes, healthcheck `/api/health`, conteneur applicatif en lecture seule et réseau dédié. `docker-entrypoint.sh` reconstruit l’URL PostgreSQL depuis `DB_*`/`POSTGRES_*`, applique les migrations Prisma (ou `db push`), crée les répertoires d’exécution et lance `server.js`. Le script comporte actuellement un `chmod -R 777`, contraire à la règle de sécurité de la v3; le portage ne devra pas le reprendre. L’instance actuelle est donc dépendante de Node et PostgreSQL, et Valkey est présent par défaut.

## Limites de l’inventaire

Les routes sont recensées avec leurs méthodes, leurs contrôles d’accès et leurs grandes catégories d’entrées/sorties. Les schémas Zod, codes d’erreur et structures exhaustives de chaque payload restent définis dans les handlers/tests cités et seront transcrits comme contrats détaillés pendant les phases de conception/portage, après validation de cet inventaire. Le plugin C# et son dépôt ne sont pas dans ce dépôt; confirmer son contrat avec ses sources et les tests d’intégration avant d’implémenter le port Go.
