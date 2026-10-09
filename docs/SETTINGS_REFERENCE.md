# Paramètres : référence historique vérifiée

Source : `git show main:<chemin>` (lecture seule), audit du 9 octobre 2026. Ce document décrit `main`, puis les écarts de Go **avant implémentation**. Une interface et un endpoint existants ne prouvent pas la sauvegarde ni l'application du réglage.

## Arborescence et conditions de navigation

`src/app/settings/layout.tsx` exige `session.user.isAdmin`, sinon redirection `/login`. `ClientLayout.tsx` affiche une seule barre horizontale défilante, sans nouveau groupe « Administration » :

| Ordre | Route | Clé traduite | Français historique | État actif |
|---|---|---|---|---|
| 1 | `/settings/jellyfin` | settings.jellyfinTitle | Jellyfin | exactement `/settings`, `/settings/jellyfin`, `/settings/plugin` |
| 2 | `/settings/sso` | settings.ssoTitle | SSO | préfixe route |
| 3 | `/settings/plugin/security` | settings.authSecurity | Sécurité | préfixe route |
| 4 | `/settings/media` | settings.mediaSettings | Paramètres Média | préfixe route |
| 5 | `/settings/scheduler` | settings.taskScheduler | Planificateur de Tâches | préfixe route |
| 6 | `/settings/dataBackups` | settings.dataBackups | Sauvegardes de Données | préfixe route |
| 7 | `/settings/notifications` | settings.notifications | Notifications | préfixe route |

Icônes respectivement Server, KeyRound, Shield, Clapperboard, CalendarClock, Database, Bell. Barre : gap 8 px, boutons px14/py8, rayon8, texte14 semi-gras, actifs fond primaire15%, bordure primaire30%, texte primaire gras; inactifs texte atténué avec hover muted. Conteneur global max1300px, padding16 mobile/32 desktop, espace16/24. Pas de titre générique supplémentaire au-dessus de chaque page.

```
main: Paramètres (sidebar admin seulement)
├── Jellyfin → serveur(s) → configuration Jellyfin + connexion plugin imbriquée
├── SSO → état → callback → configuration → groupes/rôles imbriqués
├── Auth/Sécurité → état plugin → télémétrie → seuils smart
├── Médias → exclusions/serveur → badges → règles/collection → résolution
├── Planificateur → tâches → plannings → Wrapped
├── Sauvegardes → résumé → historique/actions → import imbriqué
└── Notifications → activation Discord → champs conditionnels

Aliases main:
/settings → /settings/jellyfin (conserve query, premier élément des tableaux)
/settings/overview → /settings/jellyfin
/settings/network → /settings/jellyfin
/settings/analytics → /media/analysis
/settings/plugin = même composant que /settings/jellyfin
/settings/scheduler/tasks = vue des tâches seule
/settings/scheduler/schedules = plannings seuls
```

`scheduler/layout.tsx` ne rend **aucun sous-onglet**, car son tableau contient seulement une entrée et est masqué si longueur<=1. La page centrale compose dans l'ordre `tasks/page.tsx`, `schedules/page.tsx`, `WrappedSchedulerCard.tsx`; ne pas inventer des onglets tâches/plannings ni fusionner les routes directes. Sidebar `src/components/Sidebar.tsx` : Paramètres est après Journaux, avant Comparaison des serveurs; comparaison seulement en mode multi. Les anciennes traductions d'overview/network ne justifient pas de nouvelles pages historiques.

## Jellyfin et plugin : détail contractuel

Sources : jellyfin/page.tsx et plugin/page.tsx enveloppent tous deux `plugin/JellyfinServersSettings.tsx` (max1100px, padding16). Une grande surface avec titre `jellyfinServersTitle`, description `jellyfinServersDesc`, feedback refermable, puis un bloc par serveur.

Ordre dans un serveur : nom; badges principal/secondaire, Jellyfin connecté/hors ligne/clé manquante, plugin connecté/prêt/non configuré, version Jellyfin (avertissement si isLegacy); message de connexion + Modifier; trois champs nom/URL/clé API masquée (colonnes3/5/4 sur12 à lg, pile mobile); **sous-bloc Connexion plugin ({name})** avec heartbeat/version; URL plugin + Copier l'URL; clé plugin masquée + œil + Copier la clé; Régénérer la clé du serveur.

GET `/api/settings/jellyfin-servers` attend `{servers,isMultiMode,pluginKeyReady,pluginLastSeen,pluginVersion,pluginEndpointPath,pluginConnected}`. Chaque serveur fournit `{id,jellyfinServerId,name,url,isPrimary,hasApiKey,apiKeyMasked,allowAuthFallback,hasPluginKey,pluginKeyMasked,pluginApiKey?,connectionState,connectionMessage,version?,isLegacy?}`. Plugin « connecté » si hasPluginKey ET pluginConnected, « prêt » si clé seule. URL plugin = origin navigateur + pluginEndpointPath (`/api/plugin/events` par défaut).

Modifier : remplit nom/URL/fallback, laisse **clé API vide pour la conserver**, œil du champ password; checkbox fallback seulement si secondaire. PATCH même endpoint `{id,name:trim,url:trim,apiKey?:trim,allowAuthFallback}`. Annuler ferme; Enregistrer désactivé si saving ou nom/URL vides. Succès ferme/recharge les serveurs; erreur garde les valeurs et affiche le message serveur.

POST ajout `{name,url,apiKey,allowAuthFallback}` (fallback true initialement); formulaire secondaire affiché seulement `isMultiMode`; bouton permanent ouvre/masque; succès réinitialise/recharge. API historique valide URL HTTP(S), exclut metadata cloud, exige clé pour ajouter, sonde Jellyfin et vérifie identifiant réel du serveur. PATCH conserve clé si absente/vide, garde fallback false pour principal. Le composant autorise l'édition du principal même si une ancienne description du catalogue dit « verrouillé » : respecter le code exécuté et les priorités env réelles.

Clé plugin : POST `/api/settings/jellyfin-servers/plugin-key` `{id,jellyfinServerId,regenerate:false}` pour obtenir/deriver la clé lors de copie; `regenerate:true` seulement bouton de renouvellement. **Copier ne doit pas faire tourner la clé globale.** Réponse `{pluginApiKey}`; clé gardée en mémoire, visibilité activée lors de copie/renouvellement. Copier endpoint/clé accuse réception1800ms, clipboard avec textarea fallback. Aucun bouton suppression de serveur dans ce composant historique; préserver une éventuelle fonctionnalité Go séparément sans déplacer le formulaire. La fonction de génération globale `/api/plugin/api-key` existe dans ce fichier mais **n'a pas de contrôle rendu** : ne pas déduire une carte obligatoire de cette fonction morte.

## SSO / Authentik

Sources : sso/page.tsx et `SsoSettingsClient.tsx`. GET `/api/settings/sso`, spinner dédié jusqu'à chargement, erreur explicite.

Ordre : feedback; carte état `ssoSettings.title` avec badge Actif OIDC/Inactif Jellyfin + badge env prioritaire si au moins un override + Actualiser; trois résumés Mode d'authentification, Accès Administrateur Local (configuré + nom ou désactivé), Gestion des Groupes (filtrage ou accès libre); carte URI callback + copie; carte formulaire Configuration & Rôles SSO. Dans formulaire : switch enabled, switch autoRedirect; URL émetteur; clientId; secret password/œil; sous-groupe Groupes & Rôles SSO (userGroup puis adminGroup avec aides); message priorité env et sauvegarde au pied. Ne pas réduire à URL/clientId/secret.

Champs env individuellement désactivés via `isEnvControlled`; badges « Défini par Docker (.env) ». Valeurs effectives GET incluent enabled/url/clientId/hasClientSecret/clientSecretMasked/userGroup/adminGroup/tokenAlg/autoRedirect, origins, isEnvControlled, dbConfig, localAdminConfigured/localAdminUser/callbackPath. AutoRedirect true par défaut, tokenAlg RS256 non rendu en contrôle mais conservé. Callback = origin+callbackPath (`/api/auth/callback/oidc`), copie feedback2500ms.

PUT `{enabled,autoRedirect,url,clientId,clientSecret?,keepExistingSecret,userGroup,adminGroup,tokenAlg}`; masque contenant huit bullets → omit secret + keepExistingSecret true; secret inchangé et env prioritaires doivent survivre. Succès historique retourne configuration complète, repeuple formulaire/affiche succès; Go peut refetch GET. Historique API merge les valeurs absentes et force RS256. Maintenir accès admin local et droits groupes.

## Auth / sécurité du plugin

Source : plugin/security/page.tsx. En-tête Centre de sécurité/description, Retour plugin (`/settings/plugin`), Rafraîchir; puis feedback; carte État plugin (statut, serveur, version, dernier ping format locale); carte Précision de télémétrie plugin; carte Seuils Smart (anomalies). Aucun panneau gestion de sessions web rendu ici malgré traductions disponibles.

GET en parallèle `/api/admin/security/overview`, `/api/admin/security/smart-settings`, `/api/settings`. Sécurité overview attend `plugin:{serverName,version,lastSeen,connected}`. Télémétrie via pluginTelemetrySettings. Présélections Très précis/Équilibré/Trafic minimal changent valeurs localement et état actif; sauvegarde dédiée POST settings `{pluginTelemetrySettings}`.

| Champ télémétrie | Très précis défaut | Équilibré | Minimal | minimum UI |
|---|---:|---:|---:|---:|
| playingIntervalSeconds | 5 | 15 | 30 | 1 |
| pausedIntervalSeconds | 30 | 60 | 120 | 5 |
| staleSessionTimeoutSeconds | 90 | 180 | 300 | 30 |
| mergeWindowSeconds | 300 | 300 | 300 | 0 |
| seekThresholdSeconds | 20 | 20 | 20 | 5 |
| retryQueueSize | 500 | 500 | 250 | 10 |
| retryFlushBatchSize | 50 | 50 | 25 | 1 |

Ordre numérique exactement ci-dessus; ensuite switches trackPauseResume, trackSeek, trackAudioSubtitleChanges, trackSessionEnded tous true dans les trois presets. precisionProfile = very_precise/balanced/minimal. Changement numérique arrondi non négatif; backend doit valider les bornes. Grille1/2/4 colonnes responsive. Seuils smart ensuite : ipAttemptThreshold50 (1..10000), ipWindowMinutes60 (5..10080), newCountryGraceMinutes120 (1..1440); PATCH smart-settings `{thresholds:{...}}`; normalization planchers1/5/1, feedback et refresh.

## Médias

Sources : media/page.tsx, components/settings/ResolutionThresholds.tsx, lib/mediaPolicy.ts. Une seule grande carte avec sections imbriquées et footer Annuler (reload) / Sauvegarder. Ordre : titre/description, feedback, note syncRequired, Exclusions (aide + serverScopeHint → État serveurs → bibliothèques par serveur → règles héritées si présentes), Affichage des badges, Règles par bibliothèque, Seuils de résolution.

GET settings + jellyfin-servers en parallèle. Exclusions groupées/triées nom serveur puis bibliothèque, scopes `srvlib|<serverId>|<encodeURIComponent(libraryName)>`. Statut des serveurs (connecté/hors ligne/clé absente), URL, nombre bibliothèques, principal/secondaire, message. Boutons bibliothèque active/exclue changent état, rouge barré pour exclusion. Ne jamais mélanger les bibliothèques de même nom de deux serveurs. Anciennes exclusions globales sont associées à tous les scopes au nom normalisé correspondant; règles globales sans correspondance et scopes orphelins gardés, avec bouton retrait manuel uniquement. Save conserve les trois catégories sans perte.

Badges showLibraryMediaBadges true par défaut, aide spécifique. Règles dans l'ordre default/movies/tvshows/music/books/homevideos; chacune a switch completionEnabled et trois seuils Abandonné/Partiel/Terminé, inputs désactivés si switch off. Défauts enabled true, abandoned10/partial20/completed80, **music12/30/60**. Normalisation mediaPolicy : seuils clamp0..100 arrondis, completed>=1, partial<=completed-1 (puis>=1), abandoned<=partial-1 (puis>=0). Conserver les autres clés de bibliothèque déjà enregistrées (filmsuhd, seriesuhd, photos, livetv etc.) même si non exposées.

Résolutions dans l'ordre 480p(792×528),720p(1408×792),1080p(2112×1188),4K(4224×2376); chaque sous-bloc deux inputs maxWidth/maxHeight, grille1/2; valeurs non finies/<=0 remplacées par défaut à sauvegarde. POST `/api/settings` `{resolutionThresholds:{...résolutions,showLibraryMediaBadges,completionRules},excludedLibraries}`. **Go stocke aussi schedulerIntervals et smart seuils dans resolutionThresholds : préserver toutes les propriétés existantes lors d'édition.** Max1200px, pied boutons pleine largeur mobile, colonnes règles1/3.

## Planificateur

Sources : scheduler/page/layout/tasks/schedules/WrappedSchedulerCard, lib/schedulerIntervals.ts. Max1100px, spacing24; tasks et schedules routes directes restent accessibles et présentent uniquement leur module.

Tâches ordre : Synchronisation récente POST `/api/sync` `{mode:'recent'}`; Synchronisation complète même API mode full; Vérification d'intégrité POST `/api/admin/integrity-cleanup`; Tâche de sauvegarde POST `/api/backup/auto/trigger`; Consolidation de l'historique POST `/api/admin/consolidate-history`. Chacune description, intervalle lu settings, bouton Exécuter, loading/feedback propre. Consolidation affiche quotidien03:45 UTC. Couleurs boutons sky/violet/emerald/amber/purple. **Ne pas lancer integrity/consolidation pendant QA sur données utilisateur.**

Plannings ordre recentSyncEveryHours6 (1..24, pas1),fullSyncEveryHours48 (24..168, pas24; non-multiple remet48),integrityCheckEveryHours6 (1..168),backupEveryHours24 (1..168),logRetentionDays30 (choix7,14,30,60,90,180,365,0 illimité). Aides intervalle + exemple recommandation. GET settings.schedulerIntervals ou fallback resolutionThresholds.schedulerIntervals. POST settings `{schedulerIntervals}`; sauvegarde indépendante.

Wrapped ensuite : titre wrappedPeriod et description, switch wrappedPeriodEnabled true (disponibilité automatique) + aide; dates conditionnelles Ouverture12/1 et Fermeture1/31, mois1..12 et jours1..31 clamp; switch wrappedVisible true avec aide; Save indépendant POST settings `{wrappedVisible,wrappedPeriodEnabled,wrappedStartMonth,wrappedStartDay,wrappedEndMonth,wrappedEndDay}`. Le code historique ne valide pas la longueur réelle des mois; préserver les paramètres avec validation serveur correcte et ne pas prétendre qu'enregistrer planning prouve l'exécution.

## Sauvegardes

Source dataBackups/page.tsx. Grande carte max1200px : titre/description + Sauvegarder maintenant / Exporter; feedback; résumé nombre/taille totale MB/dernière; tableau Historique des sauvegardes; carte import **imbriquée dans grande carte**; aide backupManagementDesc.

GET `/api/backup/auto` `{backups:[{name,size,sizeMb,date,type?}]}`. Colonnes Date/Type/MB/Fichier/Actions; type auto si `type=='auto'` OU name commence JellyTrack-auto-, sinon manuel. Actions Télécharger, Restaurer, Supprimer; table scroll horizontal mobile. Download GET `/api/backup/auto/download?fileName=<encoded>` ouvre nouvel onglet. Restore/delete POST endpoints `/api/backup/auto/restore`, `/api/backup/auto/delete` `{fileName}` avec confirmation traduite; succès restore reload1200ms, delete refetch. Export GET `/api/backup/export`. Trigger POST `/api/backup/auto/trigger`, exige réponse HTTP ok ET success, refetch.

Import file accept zip; extension case-insensitive .zip, taille<=100MiB, fichier requis. POST `/api/backup/import` octet-stream ArrayBuffer; success reload1200ms, 413 explicite, disable importing. **Tester validation/rejet et annulation sans exécuter restore/import/delete sur les données réelles.**

## Notifications

Source notifications/page.tsx, max1100px une carte. Titre/description, feedback, switch discordAlertsEnabled false + aide. Seulement activé : URL webhook (input url, placeholder Discord); conditions ALL/TRANSCODE_ONLY/NEW_IP_ONLY (ordre, default ALL); maxConcurrentTranscodes0 (min0) + aide. Footer Save avec loading. GET settings, POST `{discordWebhookUrl,discordAlertCondition,discordAlertsEnabled,maxConcurrentTranscodes}`. Conserver webhook même si switch off. Historique n'offre pas bouton envoi-test; maintenir un Go existant séparément si pertinent.

## Composants, traductions, CSS réutilisés inspectés

Tous les fichiers de src/app/settings listés plus le seul `src/components/settings/ResolutionThresholds.tsx` inspectés. Réutilisation UI : card/input/button/switch/select/label/badge/table/skeleton dans src/components/ui; lib/utils pour cn; lucide-react pour icônes; next-intl pour namespaces settings/common/securitySettings/ssoSettings; mediaPolicy et schedulerIntervals pour données. Auth admin via layout/authOptions, Sidebar pour visibilité. `src/app/globals.css` définit app-surface/app-surface-soft/app-field/app-chip/app-chip-success avec variables thème et gradients sombres; rayon carte12, ombres légères claires/profondes sombres, bordures distinctes, champs hauteur36, focus visible3px, disabled50%, switch32px ×18px.

Catalogues historiques messages/{fr,en,de,es,it,nl,pl,pt-BR,ru,zh,fallback}.json; réutiliser les clés et textes de ces fichiers (manifest ci-dessous), pas du texte français dur. Certaines clés absentes fr sont fournies par fallback (notamment aides/labels serveur et médias). Le catalogue contient des sections périmées non rendues; code exécuté détermine la présence des sections.

## Écarts Go observés au début de l'audit (à revérifier après corrections)

- navigation.js restaure déjà sept onglets; app.js ajoute header générique et pages overview/network/plugin spécifiques supplémentaires.
- Jellyfin liste simplifiée et ajout/suppression, sans groupes historiques/statuts complets/edit. GET serveurs omet isPrimary, hasApiKey/apiKeyMasked, hasPluginKey/pluginKeyMasked, connectionState/message, plugin runtime et isMultiMode.
- rotateServerPluginKey ignore payload/regenerate et tourne **global** pluginApiKey même lors de simple copie : conflit majeur sécurité/parité.
- SSO formulaire réduit; updateSSO remplace blob sans merge/keepExistingSecret et retourne seulement success/autoRedirect : save masque peut détruire secret.
- Médias ordre renversé, six scopes règles réduits au défaut et mauvais defaults50/90; exclusions historiques orphelines perdues. availableLibraryScopes n'a que serverId/libraryName : enrichir côté interface avec serveurs + encoder key.
- updateSmartSettings écrase resolutionThresholds entier; getSmartSettings défaut IP10 contre historique50. Édition smart peut effacer scheduler/médias.
- schedulerIntervals persiste mais recherche internal/scheduler ne trouve aucune consommation : démontrer application runtime, pas seulement readback. GET omet default integrityCheckEveryHours.
- Plusieurs handlers updateSettings ignorent erreurs SQL individuellement; tests must reject failed saves rather than success false-positive.
- Sauvegardes APIs historiques déjà présentes, aucune nouvelle API nécessaire. Interfaces manquent structure historique/erreurs/confirmation selon page.

## Critères de validation à utiliser

Vérifier admin utilisateur/anonymous sur pages et API; route aliases/query/browser back; sept états actifs; responsive clair/sombre FR/EN; nesting/ordre; chargements/erreur de chaque GET; validations locales; sauvegardes non destructrices avec readback, secrets inchangés, propriétés settings indépendantes conservées. Copie plugin doit conserver clé globale et autres serveurs. Scheduler doit modifier exécution réelle. Annuler ne doit pas sauvegarder. Sauvegardes destructive actions : contrôle confirmation/annulation uniquement, ou fixtures isolées jetables explicites.

## Manifest des textes rendus (FR et fallback historique)

### src/app/settings/dataBackups/page.tsx
- `common.delete` : Supprimer
- `common.loading` : Chargement...
- `common.mb` : Mo
- `common.restore` : Restaurer
- `settings.actions` : Actions
- `settings.backingUp` : Sauvegarde en cours...
- `settings.backupAuto` : Automatique
- `settings.backupError` : Erreur lors de la création de la sauvegarde.
- `settings.backupHistory` : Historique des sauvegardes
- `settings.backupHistoryDesc` : Restaurez ou supprimez une sauvegarde existante.
- `settings.backupManagementDesc` : Exportez ou importez votre base de données JellyTrack.
- `settings.backupManual` : Manuelle
- `settings.backupNow` : Sauvegarder maintenant
- `settings.backupsCount` : Sauvegardes
- `settings.backupType` : Type
- `settings.confirmDeleteBackup` : Supprimer cette sauvegarde ?
- `settings.confirmRestoreBackup` : La restauration remplacera votre base actuelle. Continuer ?
- `settings.dataBackups` : Sauvegardes de Données
- `settings.dataBackupsDesc` : Historique des sauvegardes automatiques et manuelles.
- `settings.day` : Jour
- `settings.deleted` : Supprimé
- `settings.deleteError` : Erreur lors de la suppression de la sauvegarde.
- `settings.download` : Télécharger
- `settings.exportBackup` : Exporter le Backup
- `settings.file` : Fichier
- `settings.fileReadError` : Erreur lors de la lecture du fichier.
- `settings.importBackup` : Importer une sauvegarde
- `settings.importBackupDesc` : Sélectionnez un fichier d'archive ZIP (.zip) ou JSON (.json) depuis votre ordinateur pour restaurer votre base de données et vos paramètres.
- `settings.importing` : Importation en cours...
- `settings.invalidBackup` : Fichier de backup invalide.
- `settings.latestBackup` : Dernière sauvegarde
- `settings.noAutoBackups` : Aucune sauvegarde automatique trouvée.
- `settings.restoreError` : Erreur lors de la restauration de la sauvegarde.
- `settings.restoreSuccess` : Restauration réussie ! La page va recharger.
- `settings.totalSize` : Taille totale

### src/app/settings/media/page.tsx
- `common.active` : Actif
- `common.books` : Livres
- `common.homevideos` : Vidéos personnelles
- `common.loading` : Chargement...
- `common.movies` : Films
- `common.music` : Musique
- `common.tvshows` : Séries
- `settings.abandoned` : Abandonné
- `settings.cancel` : Annuler
- `settings.completed` : Terminé
- `settings.completionRulesDefault` : Règle par défaut (autres bibliothèques)
- `settings.completionRulesHint` : Ajustez les seuils pour définir quand une lecture est considérée comme passée, abandonnée, partielle ou terminée selon le type de bibliothèque.
- `settings.excludedLibrariesDesc` : Les bibliothèques désactivées ci-dessous seront exclues de toutes les statistiques du dashboard.
- `settings.excludedLibrariesTitle` : Bibliothèques exclues des statistiques
- `settings.legacyGlobalExclusionsTitle` : Exclusions globales
- `settings.legacyOrphanExclusionsTitle` : Exclusions serveur/bibliothèque indisponibles
- `settings.legacyRulesDesc` : Certaines exclusions anciennes n'ont pas pu être reliées automatiquement à un serveur+bibliothèque. Vous pouvez les retirer manuellement ci-dessous.
- `settings.legacyRulesTitle` : Règles héritées à vérifier
- `settings.libraryActiveState` : Active
- `settings.libraryBadgesDisplayDesc` : Affiche ou masque les badges de résolution, qualité série et bitrate dans l'onglet Bibliothèque.
- `settings.libraryBadgesDisplayTitle` : Affichage des badges en bibliothèque
- `settings.libraryBadgesToggleDesc` : Désactive cette option pour alléger visuellement les cartes.
- `settings.libraryBadgesToggleTitle` : Afficher les badges média
- `settings.libraryExcludedState` : Exclue
- `settings.libraryRules` : Règles par Bibliothèque
- `settings.libraryRulesDesc` : Gérez les seuils d'abandon et de complétion par bibliothèque. Vous pouvez désactiver le suivi de la complétion pour certaines bibliothèques (ex: Musique).
- `settings.mediaSettings` : Paramètres Média
- `settings.mediaSettingsDesc` : Gérez les seuils de résolution et les préférences d'affichage du contenu.
- `settings.noLibrariesFound` : Aucune bibliothèque trouvée. Lancez une synchronisation d'abord.
- `settings.noLibrariesFoundHint` : Vérifiez l'URL et la clé API Jellyfin de chaque serveur, puis rechargez la page.
- `settings.noteLabel` : Note
- `settings.partial` : Partiel
- `settings.removeExclusionLabel` : Retirer cette exclusion
- `settings.resolutionThresholds` : Seuils de Résolution
- `settings.resolutionThresholdsDesc` : Configurez comment JellyTrack catégorise la qualité vidéo. Si un fichier dépasse la largeur OU la hauteur d'un seuil, il est promu à la catégorie supérieure.
- `settings.savedSuccess` : Paramètres sauvegardés avec succès
- `settings.saveError` : Erreur lors de la sauvegarde des paramètres
- `settings.saveSettings` : Sauvegarder les paramètres
- `settings.saving` : Enregistrement...
- `settings.serverConnected` : Connecté
- `settings.serverDefaultName` : Serveur
- `settings.serverLibrariesDetected` : {count} bibliothèques détectées
- `settings.serverMissingUrl` : URL manquante
- `settings.serverNoApiKey` : Clé API manquante
- `settings.serverNoLibrariesDetected` : Aucune bibliothèque détectée pour ce serveur
- `settings.serverOffline` : Hors ligne / clé invalide
- `settings.serverPrimaryLabel` : serveur principal
- `settings.serverScopeHint` : Décochez une bibliothèque serveur par serveur. Deux bibliothèques portant le même nom sur des serveurs différents sont gérées séparément.
- `settings.serverSecondaryLabel` : serveur secondaire
- `settings.serverStatusTitle` : État des serveurs Jellyfin
- `settings.syncRequired` : Une synchronisation complète est requise pour appliquer ces changements.

### src/app/settings/notifications/page.tsx
- `common.networkError` : Erreur réseau.
- `common.saveError` : Erreur d'enregistrement.
- `common.saving` : Enregistrement...
- `settings.discordWebhookUrl` : URL Webhook Discord
- `settings.enableDiscord` : Activer les Webhooks Discord
- `settings.enableDiscordDesc` : Envoyer des notifications vers un salon Discord.
- `settings.maxConcurrentTranscodesDesc` : 0 = désactivé. Alerte si le nombre dépasse ce seuil.
- `settings.maxConcurrentTranscodesTitle` : Seuil de Transcodes Simultanés
- `settings.notifAll` : Notifier pour tous les événements
- `settings.notifConditions` : Conditions de notification
- `settings.notifications` : Notifications
- `settings.notificationsDesc` : Configurez où et quand vous souhaitez recevoir des alertes.
- `settings.notifNewIp` : Notifier lors d'une nouvelle adresse IP
- `settings.notifTranscode` : Notifier lors du transcodage
- `settings.savedSuccess` : Paramètres sauvegardés avec succès
- `settings.saveSettings` : Sauvegarder les paramètres

### src/app/settings/plugin/JellyfinServersSettings.tsx
- `settings.addServer` : Ajouter un serveur
- `settings.addServerError` : Erreur lors de l'ajout du serveur.
- `settings.addServerPermanentDesc` : Le bouton "Ajouter un serveur" reste disponible pour en ajouter autant que nécessaire.
- `settings.addThisServer` : Ajouter ce serveur
- `settings.allowAuthFallback` : Autoriser ce serveur en fallback d'authentification
- `settings.cancel` : Annuler
- `settings.clickToShow` : Cliquez sur l'oeil pour afficher
- `settings.copyKey` : Copier la clé
- `settings.copyKeyError` : Impossible de copier la clé plugin.
- `settings.copyUrl` : Copier l'URL
- `settings.deriveServerKey` : Régénérer la clé du serveur
- `settings.editServer` : Modifier le serveur
- `settings.hideAddForm` : Masquer l'ajout
- `settings.jellyfinConnected` : Jellyfin connecté
- `settings.jellyfinOffline` : Jellyfin hors ligne
- `settings.jellyfinServersDesc` : Gérez les instances Jellyfin associées à JellyTrack, configurez les clés d'API plugin et basculez entre les serveurs.
- `settings.jellyfinServersTitle` : Serveurs Jellyfin connectés
- `settings.keyCopied` : Clé copiée
- `settings.lastHeartbeat` : Dernier heartbeat plugin: {date}
- `settings.loadError` : Impossible de charger
- `settings.loadingServers` : Chargement des serveurs...
- `settings.missingApiKey` : Clé API manquante
- `settings.networkErrorAddServer` : Erreur réseau lors de l'ajout du serveur.
- `settings.networkErrorDeriveKey` : Erreur réseau lors de la récupération de la clé plugin.
- `settings.networkErrorFetchServers` : Erreur réseau lors du chargement des serveurs.
- `settings.networkErrorGenerateKey` : Erreur réseau lors de la génération de la clé.
- `settings.newSecondaryServer` : Nouveau serveur secondaire
- `settings.noServersConfigured` : Aucun serveur configuré.
- `settings.notConfigured` : non configurée
- `settings.pluginConnected` : Plugin connecté
- `settings.pluginConnectionFor` : Connexion plugin ({name})
- `settings.pluginKeyFetchError` : Impossible de récupérer la clé plugin.
- `settings.pluginKeyGeneratedSuccess` : Nouvelle clé d'API générée avec succès.
- `settings.pluginKeyGenerateError` : Impossible de générer la clé d'API du plugin.
- `settings.pluginNotConfigured` : Plugin non configuré
- `settings.pluginReady` : Plugin prêt
- `settings.pluginUrlLabel` : URL plugin
- `settings.primaryServerLabel` : Serveur principal
- `settings.saveServer` : Enregistrer les modifications
- `settings.secondaryServerLabel` : Serveur secondaire
- `settings.serverAddedSuccess` : Serveur ajouté.
- `settings.serverApiKeyHint` : Laissez vide pour conserver la clé actuelle.
- `settings.serverApiKeyLabel` : Clé d'API serveur
- `settings.serverNameLabel` : Nom du serveur
- `settings.serverPluginKeyDerived` : Clé API du serveur générée avec succès.
- `settings.serverPluginKeyDeriveError` : Impossible de dériver la clé plugin serveur.
- `settings.serverPluginKeyLabel` : Clé API plugin de ce serveur
- `settings.serverUpdatedSuccess` : Serveur Jellyfin mis à jour avec succès.
- `settings.serverUpdateError` : Erreur lors de la mise à jour du serveur.
- `settings.serverUrlLabel` : URL serveur
- `settings.urlCopied` : URL copiée

### src/app/settings/plugin/security/page.tsx
- `securitySettings.actionsLabel` : Actions
- `securitySettings.backToPlugin` : Retour plugin
- `securitySettings.ipAttemptThresholdLabel` : Tentatives IP (seuil)
- `securitySettings.ipWindowMinutesLabel` : Fenetre IP (minutes)
- `securitySettings.lastPingLabel` : Dernier ping
- `securitySettings.newCountryGraceMinutesLabel` : Nouveau pays (minutes)
- `securitySettings.offline` : Hors ligne
- `securitySettings.online` : En ligne
- `securitySettings.pluginStateDesc` : Connectivité et heartbeat
- `securitySettings.pluginStateTitle` : État plugin
- `securitySettings.refresh` : Rafraîchir
- `securitySettings.save` : Sauvegarder
- `securitySettings.saving` : Sauvegarde...
- `securitySettings.securityCenterDesc` : Indicateurs de clés plugin et journal d’audit de sécurité.
- `securitySettings.securityCenterTitle` : Centre de sécurité
- `securitySettings.securityLoadError` : Impossible de charger le centre de sécurité.
- `securitySettings.serverLabel` : Serveur
- `securitySettings.smartThresholdsDesc` : Reglages dynamiques utilises par les filtres smart d audit et la detection d anomalies.
- `securitySettings.smartThresholdsSaved` : Seuils smart sauvegardes.
- `securitySettings.smartThresholdsTitle` : Seuils Smart (anomalies)
- `securitySettings.statusLabel` : Statut
- `securitySettings.unknownError` : Erreur inconnue.
- `securitySettings.versionLabel` : Version
- `settings.pluginTelemetryDesc` : Profil très précis par défaut : transitions immédiates, progression fine en lecture et ralentissement automatique pendant les pauses.
- `settings.pluginTelemetryTitle` : Précision de télémétrie plugin
- `settings.telemetryMergeWindow` : Fusion reprise (s)
- `settings.telemetryPausedInterval` : Intervalle pause (s)
- `settings.telemetryPlayingInterval` : Intervalle lecture (s)
- `settings.telemetryRetryFlushBatchSize` : Flush retry max
- `settings.telemetryRetryQueueSize` : File retry max
- `settings.telemetrySave` : Sauvegarder la télémétrie
- `settings.telemetrySaved` : Réglages de télémétrie sauvegardés.
- `settings.telemetrySaveError` : Erreur lors de la sauvegarde des réglages de télémétrie.
- `settings.telemetrySeekThreshold` : Seuil de saut manuel (s)
- `settings.telemetryStaleSession` : Session inactive (s)

### src/app/settings/scheduler/WrappedSchedulerCard.tsx
- `common.networkError` : Erreur réseau.
- `common.saveError` : Erreur d'enregistrement.
- `common.saving` : Enregistrement...
- `settings.autoAvailability` : Activer la période de disponibilité automatique
- `settings.autoAvailabilityDesc` : Si activé, le Wrapped ne sera accessible qu'entre les dates définies ci-dessous.
- `settings.day` : Jour
- `settings.month` : Mois
- `settings.savedSuccess` : Paramètres sauvegardés avec succès
- `settings.saveSettings` : Sauvegarder les paramètres
- `settings.wrappedEnd` : Fermeture
- `settings.wrappedPeriod` : Période de disponibilité pour l'année en cours
- `settings.wrappedPeriodDesc` : Définit quand le Wrapped de l'année actuelle (2025+) devient accessible. Les années précédentes restent toujours consultables.
- `settings.wrappedStart` : Ouverture
- `settings.wrappedVisibilityDesc` : Afficher ou masquer le Wrapped dans la barre latérale et la navigation.
- `settings.wrappedVisibilityLabel` : Visibilité générale du Wrapped

### src/app/settings/scheduler/layout.tsx
- `settings.taskScheduler` : Planificateur de Tâches

### src/app/settings/scheduler/schedules/page.tsx
- `common.days` : jours
- `common.loading` : Chargement...
- `common.networkError` : Erreur réseau.
- `common.saveError` : Erreur d'enregistrement.
- `common.saving` : Enregistrement...
- `settings.backupTask` : Tâche de Sauvegarde
- `settings.cronSaved` : Plannings sauvegardés avec succès
- `settings.fullSync` : Synchro Totale
- `settings.integrityCheckTask` : Vérification d'intégrité
- `settings.logRetention` : Rétention des journaux système
- `settings.logRetentionHint` : Durée de conservation automatique des fichiers de journaux système avant rotation et suppression.
- `settings.recentSync` : Synchro Récente
- `settings.retentionUnlimited` : Conserver indéfiniment
- `settings.saveSchedules` : Sauvegarder les Plannings
- `settings.schedulerBackupIntervalHint` : Intervalle auto en heures (1-168)
- `settings.schedulerFullIntervalHint` : Intervalle auto en heures (24-168, multiple de 24)
- `settings.schedulerIntegrityIntervalHint` : Intervalle auto en heures (1-168)
- `settings.schedulerRecentIntervalHint` : Intervalle auto en heures (1-24)
- `settings.schedulerSchedulesDesc` : Planifiez chaque tâche automatiquement avec un intervalle en heures.
- `settings.schedulerSchedulesExample` : Exemple recommandé: Synchro récente 6h, Synchro totale 48h, Sauvegarde 24h.

### src/app/settings/scheduler/tasks/page.tsx
- `common.error` : Erreur.
- `common.networkError` : Erreur réseau.
- `common.run` : Lancer
- `common.running` : Exécution...
- `common.success` : Terminé.
- `settings.autoNightlyAt` : Sauvegarde auto nocturne à
- `settings.backupTask` : Tâche de Sauvegarde
- `settings.backupTaskDesc` : Tâche de sauvegarde automatique nocturne.
- `settings.consolidateHistoryTask` : Consolidation de l'historique
- `settings.consolidateHistoryTaskDesc` : Détecte et fusionne les micro-coupures et pauses pour assainir l'historique de lecture.
- `settings.dailyAtTime` : Tous les jours à {time}
- `settings.fullSync` : Synchro Totale
- `settings.fullSyncDesc` : Effectue une synchronisation complète de tous les métadonnées média. Cela peut prendre du temps.
- `settings.integrityCheckTask` : Vérification d'intégrité
- `settings.integrityCheckTaskDesc` : Détecte et clôture les sessions de lecture orphelines (coupures réseau ou crashs clients).
- `settings.recentSync` : Synchro Récente
- `settings.recentSyncDesc` : Synchroniser uniquement les éléments récents/modifiés.
- `settings.schedulerEveryHours` : Toutes les {hours} h
- `settings.taskScheduler` : Planificateur de Tâches
- `settings.taskSchedulerDesc` : Gérez les tâches automatiques de synchronisation et de sauvegarde.

### src/app/settings/sso/SsoSettingsClient.tsx
- `settings.copied` : Copié !
- `settings.copy` : Copier
- `ssoSettings.adminGroupHint` : Les membres de ce groupe obtiennent automatiquement les droits d'administration JellyTrack.
- `ssoSettings.adminGroupLabel` : Groupe Administrateurs (OIDC_ADMIN_GROUP)
- `ssoSettings.authMode` : Mode d'authentification
- `ssoSettings.autoRedirectLabel` : Redirection auto vers SSO
- `ssoSettings.autoRedirectNotice` : Connexion transparente
- `ssoSettings.clientIdLabel` : Identifiant Client (OIDC_CLIENT_ID)
- `ssoSettings.clientSecretLabel` : Secret Client (OIDC_CLIENT_SECRET)
- `ssoSettings.configured` : Configuré
- `ssoSettings.dbConfigurableNotice` : Enregistré en base de données
- `ssoSettings.descriptionActive` : L'authentification OpenID Connect est actuellement active comme fournisseur principal.
- `ssoSettings.descriptionInactive` : Le SSO est désactivé. L'authentification directe Jellyfin est actuellement utilisée.
- `ssoSettings.disabled` : Désactivé
- `ssoSettings.dockerEnvLocked` : Défini par Docker (.env)
- `ssoSettings.enableSsoLabel` : Activer l'authentification SSO
- `ssoSettings.envOverrideNotice` : Verrouillé par OIDC_ENABLED dans .env
- `ssoSettings.envPriorityBadge` : Variables Docker (.env) prioritaires
- `ssoSettings.groupsActive` : Filtrage par Rôles Actif
- `ssoSettings.groupsSupport` : Gestion des Groupes
- `ssoSettings.groupsTitle` : Groupes & Rôles SSO
- `ssoSettings.loadError` : Impossible de charger la configuration SSO.
- `ssoSettings.loading` : Chargement de la configuration SSO...
- `ssoSettings.localAdminAccess` : Accès Administrateur Local
- `ssoSettings.oidcUrlHint` : URL de découverte ou base de votre fournisseur OpenID Connect (ex: Authentik, Keycloak, Authelia).
- `ssoSettings.oidcUrlLabel` : URL de l'Émetteur / Découverte (OIDC_URL)
- `ssoSettings.openAccess` : Accès Libre (Tout Utilisateur SSO)
- `ssoSettings.redirectUriDesc` : Copiez et collez cette URL de redirection exacte dans votre fournisseur OIDC (Authentik, Keycloak, Authelia, etc.).
- `ssoSettings.redirectUriTitle` : URI de Redirection OAuth2 / OIDC (Callback URL)
- `ssoSettings.refresh` : Actualiser
- `ssoSettings.saveButton` : Enregistrer les réglages SSO
- `ssoSettings.saveError` : Erreur lors de l'enregistrement de la configuration SSO.
- `ssoSettings.saveSuccess` : Configuration SSO enregistrée avec succès.
- `ssoSettings.saving` : Enregistrement...
- `ssoSettings.ssoConfigFormDesc` : Modifiez les réglages SSO ci-dessous. Les variables définies dans votre docker-compose / .env restent toujours prioritaires.
- `ssoSettings.ssoConfigFormTitle` : Configuration & Rôles SSO
- `ssoSettings.statusActive` : Actif (OIDC)
- `ssoSettings.statusInactive` : Inactif (Jellyfin)
- `ssoSettings.title` : Authentification SSO
- `ssoSettings.userGroupHint` : Les membres de ce groupe sont autorisés à se connecter à JellyTrack en tant qu'utilisateurs.
- `ssoSettings.userGroupLabel` : Groupe Utilisateurs Standards (OIDC_USER_GROUP)

### src/components/settings/ResolutionThresholds.tsx
- `settings.maxHeight` : Hauteur Max (px)
- `settings.maxWidth` : Largeur Max (px)


