# Audit frontend et parité JellyTrack Go

Audit statique du point de départ `origin/develop` (`f29ef0e`), comparé au code de `origin/main`, le 9 octobre 2026. Les lignes indiquées ci-dessous sont celles du point de départ, avant les corrections de cette branche. Ce document décrit les constats de l'audit ; la compilation ne constitue pas une validation visuelle et le rapport de livraison indique les corrections et validations effectuées.

## Constats prioritaires vérifiés

| Priorité | Cause | Preuve et conséquence | Correction requise |
| --- | --- | --- | --- |
| P0 | Contrat DOM/CSP | `web/static.go`, `securityHeaders`, impose `style-src 'self'` alors que `index.html` et les templates `app.js` utilisent des centaines d'attributs `style`. `script-src 'self'` bloque les attributs `onclick`/`onerror` du dashboard (ex. `app.js:1349`, `1631`, `1681`, `2249`). Le style et les actions live ne peuvent pas fonctionner comme écrits. | Autoriser uniquement les attributs de style nécessaires ; conserver l'interdiction des scripts inline et remplacer les événements HTML par des listeners. |
| P1 | Réponse API | `Pages.settings('jellyfin')`, `app.js:5239`, attend un tableau, puis appelle `.map`. `listServers`, `internal/api/handlers.go:1846`, émet `{servers:[...]}`. La page des serveurs échoue. La vue d'ensemble compte aussi zéro (`app.js:5205`). | Lire `response.servers` avec état vide/erreur. |
| P1 | Réponse API | YearlyHeatmap lit `hm.heatmapDataByType` (`app.js:2376`) ; `DashboardYearlyHeatmap` émet `dataByType` (`internal/stats/dashboard.go:98`). Tous les jours apparaissent vides malgré les lectures. | Utiliser le contrat `dataByType`. |
| P1 | Paramètres/périodes | `loadAllDashboard`, `app.js:1703`, n'envoie que `days=all`, pas `timeRange=all`. `dashboard` utilise `boundedInt(...,7,...)` ; « Tout » revient à 7 jours. Les onglets deep/granular/network envoient `1d`, `90d`, `365d`, `all`, mais `analytics.go` ne reconnaît que `7d` et `24h`, avec 30 jours par défaut. | Résolveur commun de plage, dates personnalisées et paramètres cohérents dans tous les onglets. |
| P1 | Filtre backend | Les fonctions `GetGranularAnalysis`, `GetNetworkAnalysis`, `GetDetailedDeepInsights` reçoivent `DashboardFilter.MediaType`, mais ne l'appliquent pas à leurs requêtes. | Appliquer le même filtre de famille média que le dashboard. |
| P1 | Gestion d'état/performance | Les trois intervals du dashboard (`app.js:3563`) sont nettoyés seulement au `popstate`. `Router.navigate` utilise `pushState` sans cet événement. Chaque retour au dashboard conserve les anciens timers. `ChartHelper` détruit seulement par ID lors d'un nouveau rendu et conserve les graphiques hors route. | Nettoyage explicite par route, annulation des requêtes, destruction globale des graphiques. |
| P1 | Fonctionnalité non migrée | `/logs`, `Pages.logs`, `app.js:5028`, ne montre que les journaux système admin. Dans `main`, `src/app/logs/page.tsx`, `LogFilters.tsx`, `LogRow.tsx`, `SessionModal.tsx` présentent les lectures filtrées et un onglet système. Les liens des graphiques `/logs?hour=...`, `dateFrom=...`, `dateTo=...` sont sans effet. | Restaurer historique de lectures, filtres, pagination, détails et télémétrie via `/api/history` et `/api/streams/telemetry`. |
| P1 | Fonctionnalité remplacée | `/recent`, `app.js:4107`, appelle `/api/history`. `main:src/app/recent/page.tsx` affiche les **ajouts récents du catalogue**, tri `dateAdded/createdAt`, films/séries/albums, filtres et pagination. | Restaurer les ajouts, garder les lectures dans `/logs`. |
| P1 | Réponse API sauvegarde | `Pages.settings('dataBackups')`, `app.js:5550`, utilise `id`, `filename`, `createdAt`, `sizeBytes`, et POST `{id}`. Les endpoints Go utilisent `fileName` pour download/restore/delete ; les structures de liste doivent être vérifiées. | Employer les noms réels, import/export avec format réel et erreurs visibles. |
| P1 | Permissions | `main:src/app/page.tsx` redirige les non-admin vers leur profil. Le dashboard Go est ouvert à tous les connectés, mais streams/hardware/health/analytics/predictions/serveurs sont admin. Les erreurs 403 sont absorbées. | Rétablir le comportement historique et les gardes des pages/actions. Les endpoints de données doivent aussi limiter les non-admin à leurs comptes. |
| P1 | Auth/gestion d'état | `Pages.login` initialise le mode local uniquement depuis `?local=1`, puis affiche le mode SSO si `!isLocalLogin`, sans vérifier `oidcEnabled`. Avec OIDC désactivé, le bouton principal mène au SSO inexistant au lieu du formulaire disponible. | Afficher le formulaire de connexion quand OIDC est désactivé et masquer le retour vers SSO. |
| P1 | Réponse API logs système | `getSystemLogs` renvoie `LogItem{action,actor,details,createdAt}` ; l'ancien `Pages.logs` attend `level,message,time/timestamp`. Il affiche donc des lignes vides ou incorrectes. | Afficher les champs réels de l'audit et les fichiers logs téléchargeables. |
| P2 | Données simulées | `hardware`, `internal/api/admin_handlers.go:28`, renvoie CPU/RAM à 0%, `totalGb` égal à `runtime.MemStats.Sys` (mémoire runtime Go), température -1. Le frontend appelle cela RAM machine et processeur. `Pages.health` attend aussi `hw.runtime.goroutines` absent. | Afficher honnêtement mémoire du processus et mesures indisponibles, ou collecter de vraies métriques hôte sans inventer de valeurs. |
| P2 | Scope drilldown | `heatmapDetail`, `handlers.go:728`, query date ou day/hour ne conserve pas les filtres serveur/type/période/bibliothèques du graphique ; day/hour utilise 30 jours fixes. | Propager et appliquer le même scope. |
| P2 | Dates/layout | Le calendrier annuel construit des dates locales puis utilise `toISOString()` UTC : Europe/Paris transforme minuit en date de la veille. Les boutons films/séries utilisent `Movie/Series` alors que le backend groupe par `collectionType` (`movies/tvshows`) ; il retombe sur le total, avec faux filtre. La requête annuelle ignore aussi exclusions/serveurs. | Construire le calendrier en UTC et utiliser des familles/types normalisés avec le bon scope. |
| P2 | Internationalisation | `Utils.formatDate`, `formatDateTime`, `formatNumber` utilisent seulement `fr-FR` ou `en-US`, même en allemand/chinois. Nombreux titres, descriptions, états et noms de mois/jours français codés directement. L'existence des 11 JSON ne garantit pas leur usage. | Utiliser la locale choisie et les traductions existantes ; auditer les nouvelles chaînes. |
| P2 | Gestion d'état/requêtes | Les pages asynchrones écrivent dans `main` après navigation sans annulation ni vérification de route. Des `.catch(()=>({}))` transforment 403/500 en faux états vides. | Annuler et différencier chargement/erreur/vide. |
| P2 | Recherche et médias | Les images de multiples pages utilisent uniquement l'ID Jellyfin sans serveur. Même ID partagé/multi-serveur peut sélectionner une mauvaise instance ; `/users` omet recherche/pagination et les métriques déjà fournies. | Propager l'identité serveur ; rétablir les contrôles sur les données API disponibles. |

## Inventaire des composants historiques

« Présent » signifie code de rendu et contrat identifié ; ce n'est pas une attestation de test navigateur.

| Composant demandé | Équivalent Go au point de départ | Écart vérifié |
| --- | --- | --- |
| DraggableDashboard | 10 blocs, ordre localStorage, boutons monter/descendre | Mode édition présent ; vérifier mobile et validation du contenu stocké. |
| CollapsibleCard | Cartes ordinaires | **Pas une régression** : `main:src/components/dashboard/CollapsibleCard.tsx` précise que le repli a été retiré à la demande de l'utilisateur. |
| ServerFilter | Boutons dashboard, sélection unique | Ancien multi-select persistant URL/cookie et utilisé hors dashboard. Go oublie le scope après navigation. |
| TimeRangeSelector | Pilules de durée | Dates custom absentes ; bouton Tout et périodes analytics cassés. Ancien `TimeRangeSelector.tsx` stocke timeRange/from/to dans l'URL. |
| SystemHealthWidgets | Barres/cards dashboard | API réelle disponible, 403 silencieux pour non-admin. L'état moniteur par défaut backend est optimiste si données absentes. |
| HardwareMonitor | Barre CPU/RAM/température | Données hôte non collectées, valeurs fictives à zéro ; mémoire runtime mal étiquetée. |
| PredictionsPanel | Panneau tendances et pics | `/api/predictions` réel mais filtre dashboard non propagé. |
| LiveStreamsPanel | Cartes/chronologie, détails techniques | Actions inline bloquées CSP ; données techniques affichées seulement si contrat les fournit. Double polling global/dashboard. |
| SendMessageModal | Formulaire et messages prédéfinis | CSP empêche ouverture et changement durée ; état par défaut 10s mais bouton 5s marqué actif. |
| UserActivityChart | Graphiques dashboard | Le profil utilisateur Go reste résumé + 20 lectures ; les anciens `UserActivity`, `UserStatsCharts`, `UserActiveStream` ne sont pas restaurés. |
| ActivityByHourChart | Histogramme 24h | Rendu présent, liens vers historique inexistant. |
| DayOfWeekChart | Histogramme 7j | Contrat `day/count` compatible ; labels français fixes. |
| CategoryPieChart | Doughnut de catégories | Rendu et données présents ; vérifier filtres/vides. |
| ClientCategoryChart | Barres horizontales | Contrat `category/count` présent. |
| PlatformDistributionChart | Doughnut plateformes | Contrat `name/value` présent. |
| CompletionRatioChart | Doughnut complétion | Contrat présent ; vérifier politique de complétion et données downloads. |
| MonthlyWatchTimeChart | Histogramme annuel, switch année | Contrat `month=année_index/hours` compatible ; lien ne borne pas fin du mois. |
| LibraryDailyPlaysChart | Courbes de catégories | Version Go utilise films/séries/musique/livres au lieu des bibliothèques nommées de `main`. Analytics granular fournit cependant vraies collections. |
| YearlyHeatmap | Calendrier/table | Contrat `dataByType` cassé ; `availableYears` non utilisé pour borner les contrôles. |
| AttendanceHeatmap | Grille 7x24 analytics | Rendu présent, cellules réelles `day/hour/views` ; drilldown ignore scope. |
| TranscodeHourlyChart | Aire empilée réseau | API réelle présente, mauvais timeRange/type ; tooltip wrapper réutilise heures pour des comptes. |
| MediaDropoffChart | Aucun dans `Pages.mediaDetail` | Main calcule 10 tranches de complétion + marqueurs durée depuis l'historique ; API détail Go n'émet pas ces agrégats. |
| TelemetryChart | Aucun dans `Pages.mediaDetail` | Main agrège pauses/audio/subtitles/seeks par jour. Endpoint existant `/api/streams/telemetry?mediaId=...` fournit sessions/événements utilisables. |
| MediaTimelineChart | Aucun dans `Pages.mediaDetail` | Main représente positions des événements et sessions, segments changements audio/sous-titres, seeks/replays/vitesse. Données brutes Go existent. |
| HealthAnomalyCharts | Aucun dans `Pages.health('logs')` | Main présente séries d'anomalies ; Go liste audit/erreurs, contrats de séries non migrés. |

## Navigation et autres pages

- Les routes historiques principales existent dans le dispatcher : dashboard, login/setup/about, users/profils/ wrapped, media/collections/popular/analysis/artist/détail, logs, settings, health/cleanup/server-compare.
- `/settings/network` redirige vers `/settings/jellyfin` dans `main` : cet alias n'est pas à remplacer par une fausse page réseau.
- `/settings/analytics` redirige également vers `/media/analysis` dans `main:src/app/settings/analytics/page.tsx` : cet alias est fidèle à l'ancienne version.
- Catalogue Go : recherche/type/tri/pagination existent ; interactions/réponses tardives, séries/saisons/épisodes, album/pistes et scope serveur restent à vérifier. Le détail média Go est très réduit : ne montre pas les enfants ni les trois familles de graphiques historiques.
- Wrapped : diaporama existant, mais limites et visibilité doivent être vérifiées contre la configuration et le calendrier historique.
- Administration/nettoyage : endpoints existent, mais contrats duplicates/merge, actions et permissions doivent être validés réellement avant utilisation destructive.
- SSO : `/api/auth/options` émet bien `oidc/autoRedirect/localAdmin`, compatibles avec le formulaire Go ; le flux Jellyfin/OIDC nécessite de vraies instances externes pour une validation bout à bout.

## Travail attribué au module historique

`web/dist/assets/history.js` ajoute un module vanilla isolé `window.JellyTrackHistory.mount({main,api,utils,i18n,signal,user})` à intégrer par le contrôleur principal. Il utilise les endpoints Go existants, les filtres/pagination backend, un export CSV de la page affichée, un dialog de détails et les événements réels par playback pour les admins. Il conserve un onglet système utilisant les champs audit réels et les téléchargements des fichiers logs. Les requêtes/événements sont liés au signal de la page, avec protection contre les réponses anciennes.

Limites à déclarer : colonnes personnalisables, presets/saved filters, filtres audio/sous-titres/résolution et timeline positionnelle graphique complète ne sont pas tous restaurés par ce module. L'export concerne la page visible, pas toutes les lignes de la base. La validation visuelle/integration du module est à effectuer après son intégration par l'agent principal.

Revue d'intégration indépendante : syntaxe de `app.js` modifié vérifiée ; contrats du bandeau lecture du profil et des tendances prédictives concordent avec le backend. Les moyennes horaires granular sont des totaux dans l'API, donc leur intitulé doit être corrigé ou leur calcul rétabli. Un titre vide ne doit pas devenir un lien accessible vide dans PredictionsPanel.

Contrôle syntaxique réalisé : `node --check web/dist/assets/history.js`, réussi. Aucune dépendance Node ou framework n'est ajoutée au build ou à l'exécution.
