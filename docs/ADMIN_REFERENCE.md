# Administration : référence historique vérifiée

Référence en lecture seule : `main` = `a59a28613e63e86106c61827167d355b47147f42`, inspection du 9 octobre 2026. Ce document décrit le code historique, y compris ses libellés codés en dur et ses redirections. Les écarts Go ci-dessous décrivent le début de cette restauration, pas son résultat final.

## Arborescence et navigation exactes

```text
main
src/components/Sidebar.tsx
  Mon Compte (si identité Jellyfin)
  Tableau de bord
  Ajoutés récemment
  Bibliothèque
  Utilisateurs
  Santé [nav.logHealth] -> /admin/health
  Journaux -> /logs
  Paramètres -> /settings
  Comparaison de serveurs [nav.serverCompare] -> /admin/server-compare (mode multi)
src/app/admin/
  health/page.tsx : Santé & Hygiène du Serveur
    Nettoyage & Stockage [cleanup, onglet par défaut]
      Nettoyage Intelligent & Optimisation
      CleanupClient
        Médias Fantômes [ghosts, par défaut]
        Médias Abandonnés [abandoned]
        Doublons [duplicates]
    Sécurité & Anomalies [security]
      Détection d'Anomalies & Partage de Compte
      Santé du Plugin Jellyfin
        PluginHealthCenterClient embedded
    Moteur & Logs [logs]
      Moniteur / Lectures orphelines ouvertes / Valkey si activé
      Graphiques d'anomalies
      Lectures orphelines en cours / Fermetures auto récentes / Bibliothèques exclues
  log-health/page.tsx -> redirection /admin/health
  plugin-health/page.tsx -> redirection /admin/health
  cleanup/page.tsx : Assistant de Nettoyage -> même CleanupClient complet
  server-compare/page.tsx : Comparateur multi-serveurs
src/components/admin/
  HealthAnomalyCharts.tsx (seul composant du dossier)

Go au début de l'audit
web/dist/assets/navigation.js : healthPage => trois onglets historiques mais tableaux simplifiés
web/dist/assets/app.js : adminNav => cinq liens inventés ; health => blocs génériques
  /admin/health -> navigation.healthPage
  /admin/system-health -> health(system), fonctionnalité Go supplémentaire
  /admin/plugin-health -> health(plugin), fonctionnalité Go supplémentaire
  /admin/log-health -> health(logs), fonctionnalité Go supplémentaire
  /admin/server-compare -> serverCompare, tableau inventaire
  /admin/cleanup -> cleanup, maintenance utilisateurs plutôt que médias
internal/api/navigation_cleanup.go -> listes médias réelles mais contrat incomplet
```

**Il n'existe aucun layout admin historique**, aucun menu parent intitulé Administration et aucun menu séparé Santé des logs/Santé du plugin/Nettoyage dans la navigation principale. Conserver les entrées Go supplémentaires dans un emplacement secondaire déjà disponible ; ne pas les faire passer pour la hiérarchie historique.

Sidebar visible aux administrateurs (`session.user.isAdmin === true`). Les utilisateurs ordinaires voient leur compte, bibliothèque, ajouts et Wrapped si autorisé. Comparaison masquée en mode single. Page comparaison réellement utilisable seulement en mode `multi` avec au moins deux serveurs sélectionnables. Les liens actifs sont déterminés par pathname ; fermeture du tiroir mobile au changement de route ; réduction persistée dans `jellytrack_sidebar_collapsed`.

## Santé : composition, ordre et visibilité

Source : `main:src/app/admin/health/page.tsx` (tout le fichier).

Wrapper `max-w-7xl`, largeur complète, espacement vertical 24 px, padding 16 px mobile / 32 px desktop ; titre 24/30 px ; icône HeartPulse dans un carré 40 px arrondi.

Titre FR/EN : « Santé & Hygiène du Serveur » / « Server Health & Hygiene ». Sous-titre : « Diagnostics système, détection d'anomalies et optimisation du stockage » / « System diagnostics, anomaly detection, and storage optimization ».

Avant les onglets, quatre métriques dans cet ordre (2 colonnes mobile / 4 desktop) :

1. Sécurité & Anomalies : Optimal/Aucun partage suspect si aucune alerte ; sinon nombre d'alertes/Comportements suspects.
2. Espace Récupérable : somme des tailles des fantômes, unités B/KB/MB/GB/TB, sous-texte nombre de médias fantômes.
3. Médias Inachevés : nombre d'abandonnés, nombre de doublons si présents, sinon « Abandonnés < 25% ».
4. Moniteur de Flux : état traduit (`error`, `ok`, `running`) et nombre de lectures orphelines.

Onglets sous les métriques, ordre cleanup/security/logs, wrap mobile, badges seulement si fantômes/alertes > 0. Onglets locaux Radix : ils ne constituent pas trois nouvelles pages. Si l'on enrichit la navigation via URL pour gérer retour navigateur, préserver ces intitulés, cet ordre et le défaut cleanup.

Cleanup : titre « Nettoyage Intelligent & Optimisation », aide « Détectez et supprimez les fichiers jamais visionnés, abandonnés ou en doublon pour libérer de l'espace disque. », puis composant complet décrit ci-dessous.

Security : titre « Détection d'Anomalies & Partage de Compte ». Badge « Aucune anomalie détectée » ou nombre d'alertes actives. État vide vert : « Toutes les lectures sont sécurisées » et description détaillée. Sinon cartes 1/2 colonnes avec sévérité warning amber / critical rouge, titre, description, heure locale, icône UserX pour account_sharing et FileWarning autrement. Source `main:src/lib/anomalyDetector.ts:getActiveSecurityAnomalies` : utilisateurs avec au moins deux IP distinctes sur 24 h ; médias arrêtés en <= 15 s par au moins trois utilisateurs distincts sur 7 jours ; maximum 10 alertes. Les logs d'audit ne sont pas ces anomalies.

Ensuite « Santé du Plugin Jellyfin » et `PluginHealthCenterClient embedded`. En embedded, trois boutons et quatre cartes métriques seulement ; **pas** graphique heartbeat/seuils/échecs/télémétrie/export : ces blocs sont historiquement derrière `!embedded`.

Logs : cartes Moniteur puis Lectures orphelines ouvertes, puis DB sans Valkey et Clés Valkey orphelines uniquement si `snapshot.isValkeyEnabled !== false`. Moniteur affiche dernier poll localisé ou Jamais. Graphiques d'anomalies sur 14 jours ensuite. Dernière rangée trois colonnes desktop : lectures orphelines (titre média, utilisateur, bibliothèque, date, minutes ; liste max-height 400), fermetures auto récentes (sélecteur Afficher 5/10/20, défaut 5, événements triés date décroissante, icône par source monitor/sync/backup, message/kind/details/date), bibliothèques exclues (chips rouges ou état vide).

## Nettoyage : composant complet partagé

Sources : `main:src/app/admin/cleanup/CleanupClient.tsx`, `cleanup/page.tsx`, `src/lib/cleanupData.ts`, `src/lib/mediaPolicy.ts`.

Page autonome : titre `cleanup.title` = « Assistant de Nettoyage », wrapper max-width 1152 px, mêmes paddings 16/32 ; skeleton height 600 pendant Suspense. Reprend exactement le même composant que Santé.

Ordre du composant : quatre cartes métriques (Espace récupérable estimé / Médias Fantômes / Médias Abandonnés / Doublons détectés), trois sous-onglets, recommandation automatique éventuelle, barre recherche/période/taille/export, contenu de l'onglet actif.

État initial : sous-onglet ghosts ; période 30d ; pageSize 25 ; recherche vide ; trois filtres types = all ; abandonedSort = completion ; suggestions non ignorées. Recherche insensible casse et accents ; périodes all/30d/90d/180d/365d ; ghosts utilisent dateAdded ou createdAt, abandoned lastPlayed, doublons ne sont pas filtrés par période. Tailles pages 25/50/100 ; Précédent/Page x/y/Suivant et plage a-b/total. Recherche/période/taille réinitialisent les pages ghost/abandoned ; filtre et tri réinitialisent leur page respective.

Ghosts : titre `cleanup.ghostMedia` = « Médias Fantômes » ; aide `ghostDesc` : contenus ajoutés il y a plus de 30 jours jamais regardés. Filtres Tout/Films/Séries/Albums avec compteurs. Colonnes Titre/Type/Ajouté (date relative locale), badges et icônes Film/Tv/Music ; pas de lien historique sur le titre. État vide `noGhosts` ou `noSuggestedStaleMovies` si suggestion filtrée.

Abandoned : titre « Médias Abandonnés » ; aide historique mentionne 80%, mais calcul effectif via politiques de complétion, ne pas assimiler aide et critères. Filtres Tout/Films/Épisodes/Musique. Tri Complétion (plus faible d'abord) ou Dernière tentative (plus récente). Colonnes Titre/Type/Complétion Max/Dernière Tentative ; barre progression, pourcentage arrondi et labels Passé <10 / Tenté <25 / À moitié <50 / Presque autrement. Titres épisodes enrichis série/saison, audio enrichis album.

Duplicates : onglet « Doublons » ; titre « Doublons Détectés », aide « Médias présents en plusieurs exemplaires ou différentes résolutions (ex: 1080p et 4K) sur vos serveurs. ». Filtres Tout/Films/Séries ; colonnes Titre/Type/Résolution/Bibliothèque/Taille ; duplicateGroup près du titre, résolution Inconnue si absente, taille bytes formatée ; état vide « Aucun doublon détecté. Votre médiathèque est parfaitement organisée ! ». Ces textes sont codés en dur en français dans main, y compris en locale EN ; traduire peut améliorer Go mais signaler cet écart historique.

Export CSV/JSON : **toutes les lignes filtrées** de l'onglet actif, pas seulement la page. Fichiers `jellytrack_ghosts|abandoned|duplicates_YYYY-MM-DD.csv|json`. CSV protège les cellules contre injections (`escapeCsvCell`). Colonnes ghosts Title/Type/JellyfinId/Size/DateAdded ; abandoned Title/Type/JellyfinId/MaxCompletionPct/LastPlayed ; duplicates Title/Type/JellyfinId/Resolution/Library/Size. JSON = objets filtrés complets.

Recommandation : maximum 10 films ghosts de plus de 730 jours, anciens d'abord. Visible si count > 0 et non ignorée. Titre « Suggestion automatique » ; aide avec count/size ; actions Examiner la sélection / Supprimer maintenant / Ignorer. Examiner choisit ghosts, période all, type Movie, showSuggestedOnly true, page 1 ; badge « Filtre smart actif : films anciens jamais vus », bouton Fermer pour retirer ce filtre. Ignorer masque seulement en mémoire du composant.

Suppression : modal avec liste films/date relative/taille, total et avertissement irréversible. Champ demande `cleanup.deleteConfirmWord` = SUPPRIMER (FR), comparaison trim/case-insensitive. Bouton Annuler ; confirmer désactivé si mot invalide, zéro films ou opération en cours ; modal ne peut pas fermer en cours. Envoi `POST /api/admin/cleanup/delete-stale-movies` JSON `{mediaIds:[ids recommandés],confirmation:"DELETE"}`. Toasts 4.5 s succès nombre supprimé / échecs partiels / noop ; modal ferme puis rafraîchit les données seulement après réponse OK. Aucun test ne doit appeler une suppression réelle.

Contrat serveur historique : `requireAdminMutation` (admin + protections mutations), objet JSON obligatoire ; confirmation DELETE ; ids uniques non vides 1..25 ; chaque id doit être un Movie sans historique et dateAdded||createdAt <730 jours ; rejeter toute sélection invalide AVANT opération. Serveur actif configuré + clé du serveur cible (fallback clé environnement seulement prévu pour principal), DELETE Jellyfin `/Items/{jellyfinMediaId}` ; supprimer en DB seulement les items réellement supprimés par Jellyfin. Retour `{deletedCount,deletedIds,deletedTitles,failed:[{id,title,reason}]}` et audit `cleanup.stale_movies.delete_requested`. Pas de suppression globale de tous médias sans lectures.

## Plugin health : contrat et contrôles

Sources : `main:src/app/admin/plugin-health/PluginHealthCenterClient.tsx`, `src/app/api/admin/plugin/health/route.ts`.

Chargement GET `/api/admin/plugin/health`, cache no-store ; état loading + bouton refresh disabled/spinner ; erreur explicite HTTP ; actions POST `{action:"test_connection"}` ou `{action:"force_heartbeat",apiKey}`. Heartbeat manuel demande une clé par prompt, trim, refuse vide. API historique teste vraiment GET plugin events ; heartbeat passe un événement Heartbeat schema 3, pluginVersion manual-probe, identité serveur, users [] par le vrai handler POST avec Bearer fourni, puis audit. La réponse contient `ok,status,latencyMs,response?`. Un HTTP 200 enveloppant `ok:false` ne doit pas devenir un succès mensonger dans Go.

Cartes en ordre, 1/2/4 colonnes :

1. Connexion : statut online/offline, dernière activité locale, serveur, version Jellyfin, version plugin (badge v2 OK si 2.*, sinon Mise à jour requise), Schema.
2. Jitter heartbeat : Intervalle P50, Intervalle P95, Jitter P95 et badge, Écart actuel et badge.
3. Fiabilité d'ingestion : Taux de succès (24h), Échecs (24h), Non autorisé, Limite de débit.
4. Santé des flux en direct : Flux actifs, Transcodages, Flux inactifs, Débit moyen (kbps/Mbps normalisés).

Mode complet supplémentaire Go possible, s'il reste secondaire : titre Centre de santé du plugin/description ; Rafraîchir/Tester la connexion/Forcer un heartbeat/Exporter JSON diagnostic. Graphique Intervalles heartbeat (24h) et Seuils d'alerte (gap warning/critical min1, jitter warning/critical min.1 step.1, reset). Valeurs stockées **localement**, clé `plugin-health-thresholds-v2`, pas une fausse sauvegarde API. Défauts gap 600/900, jitter180/300 ; nombre positif, critical gap >= warning+1, jitter critical >= warning+.1. Severity >=critical/>=warning/ok ou N/A si null. Table Derniers échecs d'ingestion Quand/Action/IP ; métriques queue/retries/HTTP/progress/profile/playing-paused et note diagnostic. Ces blocs cachés dans Santé embedded ne doivent pas envahir son ordre historique.

Shape historique GET : generatedAt ; plugin `{connected,lastSeen,version,serverName,jellyfinVersion,schemaVersion,hasApiKey,endpoint}` ; heartbeat `{count24h,gapSec,intervalP50Sec,intervalP95Sec,jitterP95Sec,intervalSeries24h:[timestamp,intervalSec,jitterSec]}` ; thresholdDefaults `{gapWarningSec,gapCriticalSec,jitterWarningSec,jitterCriticalSec}` ; ingestion `{successEstimate24h,failureCount24h,unauthorized24h,rateLimited24h,invalidPayload24h,monitorErrors24h,successRate24h}` ; streams `{active,transcodes,stale,avgBitrateKbps}` ; pluginReportedMetrics `{queueDepth,retries,lastHttpCode,coalescedProgressEvents,note}` ; telemetrySettings ; recentFailures.

## Comparaison serveurs

Sources : `main:src/app/admin/server-compare/page.tsx`, `src/components/dashboard/ServerFilter.tsx`, `src/lib/serverScope.ts`, `src/lib/serverScope.server.ts`, `src/lib/selectableServers.ts`.

RequireAdmin ; si mode non multi ou <=1 serveur sélectionnable : carte titre `dashboard.multiServerComparator.title`, description disabled. Pas de classement générique substitué. Mode multi : wrapper max-width1400, titre Comparateur multi-serveurs + aide, barre scope global, quatre métriques Active streams / Plays (24h) (+ watch hours) / Plugin errors (24h) / Scope (+ URL/global selection fingerprint), puis Server ranking avec aide explicative.

Scope : boutons Tous + noms serveurs, sélection multiple via query `servers`; restore depuis cookie/global local si query absente ; changement router.push et conservation autres paramètres, scroll false ; retour navigateur retrouve la sélection. Options construites/dédupliquées via buildSelectableServerOptions ; ne pas utiliser tous serveurs bruts sans cette règle.

Classement score décroissant ; colonnes Server/Active/Transcodes/Avg bitrate/Plays (24h)/Heartbeat/Score. Ligne serveur : nom + barre charge normalisée maximum streams, Load index ; transcodes + stale sous-texte si >0 ; plays + heures une décimale ; badge heartbeat healthy <=120s / degraded <=600s / stale autrement, âge s/m/h. Textes internes historiquement anglais même en FR. Actifs/transcodes/bitrate = lastPingAt >=now-5min ; stale = plus vieux ; plays/heures = startedAt >=24h ; heartbeat = âge Server.updatedAt. Score arrondi `plays24h*.15 + active*2 - transcodes*1.5 - stale*3 - (gap>600?5:0)`. Erreurs plugin globales 24h = audit unauthorized/rate_limited/payload_too_large/invalid_payload/invalid_content_type.

## Traductions, thème et composants réutilisés

Catalogue inspecté : messages/fr.json ; clés identifiées par tous les imports et appels t/tc/tr dans fichiers audit. Langues historiques : fr/en/de/es/it/nl/pl/pt-BR/ru/zh. Résolution `src/i18n/request.ts` : cookie locale, x-detected-locale, Accept-Language, default en ; merge locale > fallback.json > en.json. Garder ce fallback, ne pas afficher les clés manquantes. Espaces clés : nav.logHealth/serverCompare/cleanup/pluginHealth, cleanup.*, pluginHealth.*, dashboard.* diagnostics, dashboard.multiServerComparator.*, common.previous/next/page/searchPlaceholder/cancel/close/all, timeRange.allTime/last30d. Quelques anciennes clés sont seulement fallback (exemple dashboard.running), inspecter fallback avant déclarer absentes.

Primitives inspectées : ui/card.tsx, ui/tabs.tsx, ui/table.tsx ; imports ui/button/input/label/select/dialog/badge/skeleton ; charts/ResponsiveContainerGuard ; lib/chartTheme.ts. Cartes arrondies 12px, py24, header/content px24, textes foreground/muted, surface/soft surface ; tableaux scroll horizontal (pas overflow viewport) et nowrap ; onglets Radix actifs fond card/nested, bordure, ring focus clavier, flèches/Home/End. `src/app/globals.css` définit app-surface, app-surface-soft, app-surface-nested, app-field, app-chip-success et metric-glow-* avec variantes dark. Ne pas remplacer par fonds noirs fixes ; prendre variables thèmes existantes.

HealthAnomalyCharts : safe nombres finis fallback0, graph hauteur360 ; si aucune valeur monitor/sync/backup/cleanup >0, état vide vert Aucune anomalie détectée. Area chart 14jours, légende/tooltip, séries ordre cleanup vert/#10b981, monitor cyan/#0ea5e9, sync amber/#f59e0b, backup rouge/#ef4444 ; opacité .16. syncSuccesses n'est pas tracé.

## Écarts backend Go à corriger avant de revendiquer la parité

Routes déjà présentes (`internal/api/handlers.go` table de routes) : GET cleanup/health/plugin-health/server-compare ; POST plugin-health/delete-stale-movies ; security overview/audit/settings ; fonctions supplémentaires user cleanup/consolidate/integrity. Réutiliser ces routes.

1. `internal/api/admin_handlers.go:adminHealth` retourne états/counts/exclusions, mais pas orphanPlaybacks/recentEvents/anomalyTimeline/securityAlerts. Le dernier poll est artificiellement now si aucun état ; le remplacer par inconnu réel. `main:src/lib/logHealth.ts` fournit 14jours SystemHealthEvent et 20 événements récents ; audits security distincts des anomalies.
2. `internal/api/admin_handlers.go:adminPluginHealth` simulate test_connection/force_heartbeat (`ok:true,status:200,latencyMs:1`) et déclare failure0/success100 ; à remplacer par vraie exécution et métriques. Manquent percentiles, jitter, erreurs audit, bitrate, version Jellyfin/schema/télémétrie. Pas de faux nombres de succès.
3. `internal/api/navigation_cleanup.go` fournit ghosts/abandoned/duplicates réels mais manque dateAdded, duplicateGroup, totalRecoverableSizeBytes, recommandations films anciens et les objets films du modal. Conserver critères politiques complétion, scope par serveur parents, titres enrichis. Créer l'enrichissement sans mélanger nettoyage utilisateurs.
4. `internal/api/admin_handlers.go:adminDeleteStaleMovies` ignore corps/confirmation et supprime tous les médias sans PlaybackHistory/ActiveStream en DB, sans Jellyfin. Incompatible et dangereux avec formulaire historique : corriger avant branchement.
5. `internal/api/handlers.go:serverCompare` retourne inventaire mediaCount/userCount/playsCount/activeStreams (all-time, aucun scope), pas 24h/transcodes/stale/bitrate/heartbeat/score/erreurs. Étendre via helper ou handler dédié à route identique.
6. `web/dist/assets/navigation.js:healthPage` remplace les formulaires par trois tableaux sommaires, security charge audit et non anomalies, logs utilise page generic system ; supprimer le wrapper simplifié quand nouveau module intégré. `Pages.adminNav` ne doit pas rester visible dans module historique.

## Permissions et vérifications de restauration

Pages health : non-admin vers /users/{jellyfinUserId} si identité, sinon /login ; cleanup/comparison vers /login. Redirections log/plugin sont historiques. Routes API exigent admin et mutations protégées origine/CSRF ; masquer un bouton ne remplace pas contrôle serveur. API auth actuelle Go à valider par middleware et tests HTTP complets.

Validation nécessaire : tous onglets principaux et imbriqués, défauts/ordre/texte ; métriques données réelles ; recherche accents, filtres types/périodes, tri, pagination, exports sans données hors filtre, modal confirmation/annuler/verrouillage/erreurs partielles via serveur Jellyfin de test seulement ; plugin succès/échec réel/clé invalide/refresh ; comparaison mode single/multi/scope URL/retour navigateur ; utilisateur non-admin ne reçoit données ni mutations ; desktop/mobile/light/dark/FR/EN ; images référence si disponibles. Aucune suppression réelle ni rotation/révocation de clés durant QA.

Audit de référence seul : aucune implémentation ni opération données exécutée par settings/admin_reference. Responsabilité de ce sous-agent : ce document uniquement.
