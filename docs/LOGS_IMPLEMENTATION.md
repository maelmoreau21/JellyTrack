# Restauration Historique / Système / Sessions

Agent réel : `logs_reference`. Périmètre écrit exclusivement : `history.js`, nouveau `history-recovery.css`, `history_handlers.go`, `history_recovery.go`, `logs_recovery.go`, tests associés et les trois seules méthodes journaux de `admin_handlers.go`. Traductions supplémentaires `logs.system`/états FR/EN dans messages JSON. Les autres méthodes paramètres/administration déjà modifiées ont été préservées. Flux dans `app.js` et `handlers.go` appartiennent à `analytics_reference`/root.

## Matrice résultante

| Groupe audit | Résultat concret | Validation |
|---|---|---|
| H01–H02 | En-tête historique, sous-titre count, onglets à droite et retour ligne mobile | Source ; QA navigateur parent |
| H03 | Historique personnel Go conservé, scope serveur/utilisateur existant inchangé | Tests homonymes/self-scope existants passent |
| H04–H05 | Alertes nouveaux pays et IP publiques vraies, seuils persistés, clic IP | `TestHistoryAlertsUseStoredThresholdsExcludePrivateIPs` |
| H06–H15 | Recherche/colonnes/sauvegardes, serveur, barre toolbar/avancé/tri/presets, reset | Source ; QA navigateur parent |
| H16–H17 | CSV et JSON de toutes les pages réellement filtrées via API historique autorisée, 200/réponse | Filtres API testés ; export navigateur QA parent |
| H18–H25 | Types multiples, presets, client/audio/sub/dates/resolution, extras heure/méthode | `TestRecoveredHistoryFieldsFiltersTelemetryAndChartDrilldowns` |
| H26–H30,H35–H40 | 16 colonnes configurables, ordre/largeur persistés, vraie résolution/débit/codecs/IP/pays/compteurs/statut | Même test vérifie champs + fixture historique |
| H31–H34 | Image type/fallback serveur, sous-titres parents/artistes, édition depuis metadata télémétrie | Données disponibles ; limites ci-dessous |
| H41–H45 | Clic/Enter modal, chevron chronologie, watch party real 5min, tableau responsive | QA navigateur parent |
| H46–H49 | Pagination numérotée 50, 200 derniers événements/session via une requête window SQL, états vrais | Filtres/pagination et Node syntaxe passent |
| S01–S04 | Cartes nombre/taille/rétention, lien paramètres, recherche et actualiser | `TestRecoveredSystemFilesMetadataRetentionAndDownload` |
| S05–S12 | Fichiers tableau 5 colonnes/badges/lineCount/download/delete/clear avec erreurs réelles | Tests metadata/download/delete/long lines |
| S13 | Audit Go conservé après inventaire fichiers avec pagination propre | Source ; QA navigateur parent |
| M01–M10 | Modal historique : subtitle/user/compteurs/piste/repères/groupes1500ms/couleurs/metadata/liens/fermeture | Syntaxe Node ; QA navigateur parent |
| L01–L14 | Audit complet transmis à propriétaires root/analytics ; aucune modification concurrente | Rapport root/analytics et QA séparés |

API historique enrichie : durée média/lecture, dates, source téléchargement, client/appareil, IP/localisation, codecs/langues, bitrate normalisé, compteurs, actif réel, metadata événements ; réutilise `markProfileReconnections` et `profileMediaSubtitle`. Toutes les conditions SQL restent paramétrées. Les deep links Analytics `device`, `library`, `completion`, `excludeTypes`, `excludeLibs` sont maintenant effectifs, avec familles `movies`, `tvshows`, `music`, `books`. Les filtres de complétion ont été finalisés par l'intégrateur avec le helper partagé `internal/stats/parity.go` : progression cumulée utilisateur × serveur × média, seuils vidéo80/20/10% et musique60/30/12%, durée inconnue omise. Le filtre respecte `hideZapped` transmis par la page du graphique. Les liens de langues normalisées/codec et bibliothèques catégorisées sont effectifs ; la période du lien n'est plus effacée par le frontend.

API système : inventaire `.log` régulier sans symlink, métadonnées réelles et lignes comptées en streaming 64KiB, rétention persistée 0..365 ou défaut30. Téléchargement stream `ServeContent` texte, 404 réel si manquant, aucun CSV masquant une erreur. Suppression journal actif refusée ; vider tronque l'actif pour préserver handle du logger et retire archives, en signalant les erreurs. Les protections auth/CSRF de routage existantes sont conservées.

## Tests exécutés par cet agent

- `node --check web/dist/assets/history.js` : passé.
- `go test ./internal/api -run 'TestHistoryFiltersPaginationAndSelfScope|TestHomonymousUsersCannotCrossServerIdentityBoundary' -count=1` : passé (identités et filtrage/pagination préservés).
- `go test ./internal/api -run 'TestRecoveredHistory|TestHistoryAlerts|TestRecoveredSystem|TestRecoveredLog|TestLogCount' -count=1` : passé.
- Nouveaux tests : recherche IP et alias query, types multiples, audio/sub/4K, device/completion/exclusions, payload metadata/codecs/compteurs/débit ; alertes publiques vs privées et seuils stockés ; fichiers/lines/rétention/téléchargement réel/404/path invalide ; suppression actif refusée et clear par troncature ; lignes >64KiB correctement comptées.

## Différences et vérification restante

- Sous-titre épisode main `SxxExx` + metadata Jellyfin complète : Go rend les titres série/saison disponibles et artistes/albums ; numéros non stockés ne sont pas inventés. Les éditions sont montrées seulement lorsque metadata enregistrée les fournit.
- Main utilise valkey et métadonnées piste Jellyfin pour débit audio sélectionné. Go restitue le bitrate réellement stocké avec la normalisation existante du profil ; les anciennes lectures sans ce champ restent « — ».
- Les événements historiques suivent la même fenêtre de 200 derniers événements que main. Les compteurs stockés restent affichés pour les sessions plus longues. Le volume réel est borné par la page et non simulé.
- Les cartes globales alertes reproduisent la logique source de main : premiers pays dans une fenêtre configurable à partir de la première lecture, IP publiques dans période configurée. Le message historique mentionnant24h est conservé ; les seuils peuvent être personnalisés dans les paramètres.
- Le premier rendu HTML, filtres/pagination, responsive, thème clair/sombre, exports téléchargés, focus/modal/backdrop et captures main/Go doivent être consignés par `visual_qa` avant affirmation de parité visuelle. Cet agent ne revendique aucune capture navigateur.
- Tous les libellés existants passent par les traductions actuelles ; libellés fichiers et retours ajoutés FR/EN. Les autres langues suivent le fallback français déjà utilisé par l'application.

## Validation finale après intégration

Les contrôles navigateur, exports, modales, graphiques et responsive sont exécutés et consignés dans [MEDIA_PAGES_QA.md](MEDIA_PAGES_QA.md). Les limites ci-dessus portent sur les champs absents et les services externes, pas sur une absence de tests Go ou navigateur. Le rapport initial de cet agent a été complété par l'intégrateur après sa reprise des fichiers.
