# Inventaire des routes historiques et actuelles

Référence `main` a59a286 ; HEAD courant `c4ed7495c3f420713bbaaabcc337dd47602506db`, incluant les corrections non commitées au 10 octobre 2026. Inventaire effectué sur source, sans nouveau navigateur. « Identique ou fidèle » signifie présence du chemin/méthode et dispatcher, pas identité complète du contrat, données ou rendu.

## Pages historiques : 36

| Route | Fichier historique | Dispatcher Go | Alias/destination | Parent/onglet | État source |
|---|---|---|---|---|---|
| /about | src/app/about/page.tsx | web/dist/assets/app.js:6029 | — | Pied de sidebar | Différence justifiée |
| /admin/cleanup | src/app/admin/cleanup/page.tsx | web/dist/assets/admin.js:74 | — | Administration | Identique ou fidèle |
| /admin/health | src/app/admin/health/page.tsx | web/dist/assets/admin.js:74 | — | Administration | Identique ou fidèle |
| /admin/log-health | src/app/admin/log-health/page.tsx | web/dist/assets/admin.js:74 | /admin/health | Administration | Identique ou fidèle |
| /admin/plugin-health | src/app/admin/plugin-health/page.tsx | web/dist/assets/admin.js:74 | /admin/health | Administration | Identique ou fidèle |
| /admin/server-compare | src/app/admin/server-compare/page.tsx | web/dist/assets/admin.js:74 | — | Administration | Identique ou fidèle |
| /login | src/app/login/page.tsx | web/dist/assets/app.js:6029 | — | Route directe | Identique ou fidèle |
| /logs | src/app/logs/page.tsx | web/dist/assets/app.js:6029 | — | Sidebar | Identique ou fidèle |
| /media/[id] | src/app/media/[id]/page.tsx | web/dist/assets/media-recovery.js:320 | — | Bibliothèque | Identique ou fidèle |
| /media/all | src/app/media/all/page.tsx | web/dist/assets/media-recovery.js:320 | — | Bibliothèque / 1 | Identique ou fidèle |
| /media/analysis | src/app/media/analysis/page.tsx | web/dist/assets/media-recovery.js:320 | — | Bibliothèque / 3 | Identique ou fidèle |
| /media/artist/[name] | src/app/media/artist/[name]/page.tsx | web/dist/assets/media-recovery.js:320 | — | Bibliothèque | Identique ou fidèle |
| /media/collections | src/app/media/collections/page.tsx | web/dist/assets/media-recovery.js:320 | — | Bibliothèque / 4 | Identique ou fidèle |
| /media | src/app/media/page.tsx | web/dist/assets/media-recovery.js:320 | /media/all | Bibliothèque | Identique ou fidèle |
| /media/popular | src/app/media/popular/page.tsx | web/dist/assets/media-recovery.js:320 | — | Bibliothèque / 2 | Identique ou fidèle |
| /newsletter | src/app/newsletter/page.tsx | web/dist/assets/app.js:6029 | — | Médias / route directe | Différence à corriger |
| / | src/app/page.tsx | web/dist/assets/app.js:6029 | — | Sidebar | Identique ou fidèle |
| /recent | src/app/recent/page.tsx | web/dist/assets/app.js:6029 | — | Sidebar | Identique ou fidèle |
| /settings/analytics | src/app/settings/analytics/page.tsx | web/dist/assets/settings.js:31 | /media/analysis | Paramètres | Identique ou fidèle |
| /settings/dataBackups | src/app/settings/dataBackups/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 6 | Identique ou fidèle |
| /settings/jellyfin | src/app/settings/jellyfin/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 1 | Identique ou fidèle |
| /settings/media | src/app/settings/media/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 4 | Identique ou fidèle |
| /settings/network | src/app/settings/network/page.tsx | web/dist/assets/settings.js:31 | /settings/jellyfin | Paramètres | Identique ou fidèle |
| /settings/notifications | src/app/settings/notifications/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 7 | Identique ou fidèle |
| /settings/overview | src/app/settings/overview/page.tsx | web/dist/assets/settings.js:31 | /settings/jellyfin | Paramètres | Identique ou fidèle |
| /settings | src/app/settings/page.tsx | web/dist/assets/settings.js:31 | /settings/jellyfin | Paramètres | Identique ou fidèle |
| /settings/plugin | src/app/settings/plugin/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres | Identique ou fidèle |
| /settings/plugin/security | src/app/settings/plugin/security/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 3 | Identique ou fidèle |
| /settings/scheduler | src/app/settings/scheduler/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 5 | Identique ou fidèle |
| /settings/scheduler/schedules | src/app/settings/scheduler/schedules/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres | Identique ou fidèle |
| /settings/scheduler/tasks | src/app/settings/scheduler/tasks/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres | Identique ou fidèle |
| /settings/sso | src/app/settings/sso/page.tsx | web/dist/assets/settings.js:31 | — | Paramètres / 2 | Identique ou fidèle |
| /setup | src/app/setup/page.tsx | web/dist/assets/app.js:6029 | — | Route directe | Différence justifiée |
| /users/[id] | src/app/users/[id]/page.tsx | web/dist/assets/app.js:6029 | — | Compte / Utilisateurs | Identique ou fidèle |
| /users | src/app/users/page.tsx | web/dist/assets/app.js:6029 | — | Sidebar | Identique ou fidèle |
| /wrapped/[userId] | src/app/wrapped/[userId]/page.tsx | web/dist/assets/app.js:6029 | — | Mon Wrapped | Identique ou fidèle |

Les onglets restent Jellyfin → SSO → Sécurité → Médias → Planificateur → Sauvegardes → Notifications ; Médias : Tous → Populaires → Analyse (admin) → Bibliothèques. Sidebar admin et standard source vérifiées dans `navigation-agent.md`.

## Chemins Go supplémentaires et candidats

| Chemin | Origine/parent | Traitement actuel |
|---|---|---|
| /settings/go-overview | Compléments Go | legacy Pages.settings(overview); explicit; web/dist/assets/settings.js:31 |
| /settings/go-network | Compléments Go | legacy Pages.settings(network); explicit; web/dist/assets/settings.js:31 |
| /admin/system-health | Compléments Go | legacy Pages.health(system); explicit; web/dist/assets/admin.js:74 |
| /admin/log-diagnostics | Compléments Go | legacy Pages.health(logs); explicit; web/dist/assets/admin.js:74 |
| /admin/plugin-diagnostics | Compléments Go | plugin-health renderer; explicit; web/dist/assets/admin.js:74 |
| /admin/maintenance | Compléments Go du nettoyage | legacy Pages.cleanup(); explicit; web/dist/assets/admin.js:74 |
| /wrapped | Raccourci direct | /wrapped/{current user id}; explicit_alias; web/dist/assets/app.js:6029 |
| /dashboard | Aucun lien/menu explicite | Admin: Pages.dashboard() via fallback; standard: profil; implicit_fallback; web/dist/assets/app.js:6029 |

`/charts` : aucune route dédiée dans le dispatcher ni lien actuel trouvé. Le fallback générique de la SPA rend le dashboard pour un chemin inconnu admin ; cela ne prouve pas une fonctionnalité Charts. `/dashboard` fonctionne par ce fallback, avec garde standard, sans branche ou lien dédiés. Les endpoints supplémentaires sont détaillés dans `routes.json.currentAdditionalApiRegistrations`.

## API historiques : 49 fichiers, 67 méthodes

65 méthodes historiques hors catchall NextAuth ont toutes une déclaration Go au même chemin et avec la même méthode. Aucun manque de registre API avéré. Cela ne garantit pas la fidélité des payloads, réponses, autorisations, données ou effets secondaires.

| Chemin historique | Méthodes exportées | Fichier main | Registre Go | État |
|---|---|---|---|---|
| /api/admin/auth/session-policy | GET, PATCH, POST | src/app/api/admin/auth/session-policy/route.ts | internal/api/handlers.go:90; internal/api/handlers.go:91; internal/api/handlers.go:92 | Identique ou fidèle |
| /api/admin/cleanup/delete-stale-movies | POST | src/app/api/admin/cleanup/delete-stale-movies/route.ts | internal/api/handlers.go:85 | Identique ou fidèle |
| /api/admin/consolidate-history | POST | src/app/api/admin/consolidate-history/route.ts | internal/api/handlers.go:132 | Identique ou fidèle |
| /api/admin/health | GET | src/app/api/admin/health/route.ts | internal/api/handlers.go:75 | Identique ou fidèle |
| /api/admin/integrity-cleanup | POST | src/app/api/admin/integrity-cleanup/route.ts | internal/api/handlers.go:133 | Identique ou fidèle |
| /api/admin/plugin/health | GET, POST | src/app/api/admin/plugin/health/route.ts | internal/api/handlers.go:102; internal/api/handlers.go:103 | Identique ou fidèle |
| /api/admin/security/audit | GET | src/app/api/admin/security/audit/route.ts | internal/api/handlers.go:77 | Identique ou fidèle |
| /api/admin/security/overview | GET | src/app/api/admin/security/overview/route.ts | internal/api/handlers.go:76 | Identique ou fidèle |
| /api/admin/security/smart-settings | GET, PATCH | src/app/api/admin/security/smart-settings/route.ts | internal/api/handlers.go:78; internal/api/handlers.go:79 | Identique ou fidèle |
| /api/admin/users/[id] | DELETE | src/app/api/admin/users/[id]/route.ts | internal/api/handlers.go:84 | Identique ou fidèle |
| /api/admin/users/duplicates | GET, POST | src/app/api/admin/users/duplicates/route.ts | internal/api/handlers.go:80; internal/api/handlers.go:81 | Identique ou fidèle |
| /api/admin/users/merge | POST | src/app/api/admin/users/merge/route.ts | internal/api/handlers.go:82 | Identique ou fidèle |
| /api/admin/users/sync-deleted | POST | src/app/api/admin/users/sync-deleted/route.ts | internal/api/handlers.go:83 | Identique ou fidèle |
| /api/auth/[...nextauth] | GET, POST | src/app/api/auth/[...nextauth]/route.ts | internal/auth/auth.go:388-434 (voir adaptation) | Différence justifiée |
| /api/backup/auto/delete | POST | src/app/api/backup/auto/delete/route.ts | internal/api/handlers.go:129 | Identique ou fidèle |
| /api/backup/auto/download | GET | src/app/api/backup/auto/download/route.ts | internal/api/handlers.go:127 | Identique ou fidèle |
| /api/backup/auto/restore | POST | src/app/api/backup/auto/restore/route.ts | internal/api/handlers.go:128 | Identique ou fidèle |
| /api/backup/auto | GET | src/app/api/backup/auto/route.ts | internal/api/handlers.go:125 | Identique ou fidèle |
| /api/backup/auto/trigger | POST | src/app/api/backup/auto/trigger/route.ts | internal/api/handlers.go:126 | Identique ou fidèle |
| /api/backup/export | GET | src/app/api/backup/export/route.ts | internal/api/handlers.go:123 | Identique ou fidèle |
| /api/backup/import | POST | src/app/api/backup/import/route.ts | internal/api/handlers.go:124 | Identique ou fidèle |
| /api/geo-stats | GET | src/app/api/geo-stats/route.ts | internal/api/handlers.go:109 | Identique ou fidèle |
| /api/hardware | GET | src/app/api/hardware/route.ts | internal/api/handlers.go:74 | Identique ou fidèle |
| /api/health | GET | src/app/api/health/route.ts | web/static.go:53 | Identique ou fidèle |
| /api/heatmap-detail | GET | src/app/api/heatmap-detail/route.ts | internal/api/handlers.go:110 | Identique ou fidèle |
| /api/jellyfin/image | GET | src/app/api/jellyfin/image/route.ts | internal/api/handlers.go:62 | Identique ou fidèle |
| /api/jellyfin/kill-stream | POST | src/app/api/jellyfin/kill-stream/route.ts | internal/api/handlers.go:113 | Identique ou fidèle |
| /api/jellyfin/send-message | POST | src/app/api/jellyfin/send-message/route.ts | internal/api/handlers.go:114 | Identique ou fidèle |
| /api/jellyfin/user-image | GET | src/app/api/jellyfin/user-image/route.ts | internal/api/handlers.go:63 | Identique ou fidèle |
| /api/logs/export | GET | src/app/api/logs/export/route.ts | internal/api/handlers.go:100 | Identique ou fidèle |
| /api/logs/system/download | GET | src/app/api/logs/system/download/route.ts | internal/api/handlers.go:99 | Identique ou fidèle |
| /api/logs/system | GET, DELETE | src/app/api/logs/system/route.ts | internal/api/handlers.go:97; internal/api/handlers.go:98 | Identique ou fidèle |
| /api/media/[id]/poster-rotator/rotate | POST | src/app/api/media/[id]/poster-rotator/rotate/route.ts | internal/api/handlers.go:101 | Identique ou fidèle |
| /api/metadata-audit | GET | src/app/api/metadata-audit/route.ts | internal/api/handlers.go:87 | Identique ou fidèle |
| /api/newsletter/discord-post | POST | src/app/api/newsletter/discord-post/route.ts | internal/api/handlers.go:96 | Identique ou fidèle |
| /api/plugin/api-key | GET, POST, DELETE | src/app/api/plugin/api-key/route.ts | internal/api/handlers.go:93; internal/api/handlers.go:94; internal/api/handlers.go:95 | Identique ou fidèle |
| /api/plugin/events | OPTIONS, GET, POST | src/app/api/plugin/events/route.ts | internal/plugin/events.go:77 | Identique ou fidèle |
| /api/predictions | GET | src/app/api/predictions/route.ts | internal/api/handlers.go:86 | Identique ou fidèle |
| /api/search | GET | src/app/api/search/route.ts | internal/api/handlers.go:60 | Identique ou fidèle |
| /api/settings/jellyfin-servers/plugin-key | POST | src/app/api/settings/jellyfin-servers/plugin-key/route.ts | internal/api/handlers.go:122 | Identique ou fidèle |
| /api/settings/jellyfin-servers | GET, POST, PATCH, DELETE | src/app/api/settings/jellyfin-servers/route.ts | internal/api/handlers.go:117; internal/api/handlers.go:118; internal/api/handlers.go:119; internal/api/handlers.go:120 | Identique ou fidèle |
| /api/settings | GET, POST | src/app/api/settings/route.ts | internal/api/handlers.go:115; internal/api/handlers.go:116 | Identique ou fidèle |
| /api/settings/sso | GET, PUT | src/app/api/settings/sso/route.ts | internal/api/handlers.go:88; internal/api/handlers.go:89 | Identique ou fidèle |
| /api/stats/deep | GET | src/app/api/stats/deep/route.ts | internal/api/handlers.go:105 | Identique ou fidèle |
| /api/streams | GET | src/app/api/streams/route.ts | internal/api/handlers.go:111 | Identique ou fidèle |
| /api/streams/telemetry | GET | src/app/api/streams/telemetry/route.ts | internal/api/handlers.go:112 | Identique ou fidèle |
| /api/sync | POST | src/app/api/sync/route.ts | internal/api/handlers.go:104 | Identique ou fidèle |
| /api/users/[id]/active-stream | GET | src/app/api/users/[id]/active-stream/route.ts | internal/api/handlers.go:51 | Identique ou fidèle |
| /api/webhook/jellyfin | GET, OPTIONS, POST | src/app/api/webhook/jellyfin/route.ts | internal/api/handlers.go:141; internal/api/handlers.go:149; internal/api/handlers.go:140 | Identique ou fidèle |

### Adaptation NextAuth → Go

Le catchall historique `/api/auth/[...nextauth]` exporte GET et POST. Go fournit explicitement GET `/api/auth/session`, `/api/auth/csrf`, `/api/auth/providers`, `/api/auth/me`, `/api/auth/options`, `/api/auth/status`, `/api/auth/sso/config`, `/api/auth/oidc/start`, `/api/auth/oidc/callback`, `/api/auth/callback/oidc`, `/api/auth/callback/sso`, et POST `/api/auth/login`, `/api/auth/logout`, `/api/auth/signout`. Le formulaire passe par login Go et les callbacks OIDC par le gestionnaire Go. Les cookies, JWT NextAuth et tous les sous-chemins internes du catchall ne sont pas interchangeables par simple égalité de route : cette migration est une différence architecturale documentée, pas une API historique manquante démontrée. Le retour `callbackUrl` par formulaire est corrigé et validé sur source ; le parcours OIDC complet demeure Non testé dans cet inventaire.

Les données auparavant rendues côté serveur Next (dashboard, médias, profils, newsletter, comparaison serveurs) disposent d’API Go supplémentaires ; absence de fichier route.ts historique ne signifie pas ajout d’une fonctionnalité inexistante. GET/POST/OPTIONS `/api/plugin/events` sont montés dans `web/static.go:59`, puis sélectionnés dans `internal/plugin/events.go:77-93`. L’inventaire compte les méthodes exportées explicitement ; HEAD implicite de Go/Next et middleware CORS global ne sont pas comptés comme exports historiques.

## Correctifs courants revérifiés sur source

- Standard /users -> own profile : corrected in source; web/dist/assets/app.js:6022.
- Unauthenticated route/query preserved via callbackUrl : corrected in source; web/dist/assets/app.js:6014.
- Form login destination constrained to local path : corrected in source; web/dist/assets/app.js:3996.
- Settings tab radius 12px : corrected in source; web/dist/assets/navigation.css:112.
- Standard profile frontend self guard : present in current source; web/dist/assets/profile.js:24.
- Standard profile backend ResolveAccount/self server scope : present in current source; internal/api/handlers.go:821.
- Newsletter standard lecture historical parity : unresolved; web/dist/assets/app.js:6022.

About et intro Wrapped : fichiers dédiés et modification ciblée présents ; preuves et limites dans `navigation-agent.md`. Newsletter reste inaccessible au rôle standard malgré lecture historique authentifiée autorisée : différence non corrigée. La préférence initiale FR / stockage local Go reste différente de la détection Accept-Language historique et doit rester documentée. Aucun nouveau test comportemental ou visuel effectué pour cet inventaire, aucun commit.

## Réutilisation

`routes.json` conserve les fichiers source, lignes du registre, méthodes, destinations, parents, contrôles et limites. Extraction automatisée ciblée des exports route.ts et des littéraux enregistrés Go ; 36 pages et 49 fichiers API contrôlés, aucun fichier produit modifié.
## Correction de consolidation finale

Le principal a restauré `/setup`→`/` après authentification et conservé l'assistant Go sous `/setup/go`, dans les Compléments Go. Il y a désormais9 chemins supplémentaires/candidats, pas8. `routes.json` et `PARITY_MATRIX.json` portent l'état final ; les positions de lignes ci-dessous reflètent l'inventaire source initial et peuvent avoir bougé après correction. Le tableau `/setup` initial est supersédé. `/settings/plugin` réutilise le composant Jellyfin sans redirection historique.

