# Référence historique : historique, journaux système, sessions et flux

Audit initial du 10 octobre 2026. `main` lu uniquement via `git show`, commit `a59a28613e63e86106c61827167d355b47147f42`. Go initial : `codex/frontend-recovery`, HEAD `0c658f06e6e3894c9f8faf35eecf93b9e8c70e54`, avec modifications paramètres/administration existantes conservées. Les constats ci-dessous décrivent l'état **avant** cette restauration ; le résultat et les tests sont dans `LOGS_IMPLEMENTATION.md`.

## Sources et ordre exact

- Historique : `src/app/logs/page.tsx`, `LogSearchBar.tsx`, `LogFilters.tsx`, `ColumnToggle.tsx`, `LogsListClient.tsx`, `LogRow.tsx`, `src/components/SavedFilters.tsx`.
- Journaux système : `src/app/logs/SystemLogsListClient.tsx`, `src/app/api/logs/system/route.ts`, `src/app/api/logs/system/download/route.ts`.
- Sessions : `src/components/SessionModal.tsx` ; modal commun à l'historique et aux fiches utilisateur/média.
- Flux : `src/components/dashboard/LiveStreamsPanel.tsx`, `SendMessageModal.tsx`, `KillStreamButton.tsx`, `src/app/api/streams/route.ts`.
- Go : `web/dist/assets/history.js`, `app.js` (`renderLiveStreamsBlock`, `openSendMessageModal`, `confirmKillStream`), `internal/api/history_handlers.go`, `handlers.go` (`streams`, `streamsTelemetry`, `killStream`, `sendMessage`), `admin_handlers.go` (`getSystemLogs`, `clearSystemLogs`, `downloadSystemLogs`).
- Réutilisations Go existantes : `profile.js` contient colonnes/filtres sauvegardés/chronologie/modal ; `users_profile.go` contient données de session, sous-titres média et détection reconnexions. Aucun framework historique réintroduit.

Ordre Lectures : en-tête titre + sous-titre/count à gauche et onglets à droite → alertes intelligentes conditionnelles → carte recherche + sauvegardes + colonnes → séparation → filtre serveurs → masquer zappés / ouvrir filtres / réinitialiser / tri / rechercher / CSV+JSON → panneau avancé conditionnel (presets, types multiples, serveurs, client/audio/sous-titres/dates) → tableau → pagination.

Ordre Système : même en-tête/onglets → trois cartes (nombre de fichiers, espace disque, rétention/lien paramètres) → barre recherche fichier à gauche, actualiser/vider/télécharger journal actif à droite → retour succès/erreur → tableau de fichiers.

Ordre modal : titre média et sous-titre épisode/album → utilisateur et client → compteurs événements → titre chronologie/durée → piste regardée/repères → groupes d'événements détaillés horodatés avec Aller à/Copier → fermer.

Ordre flux : en-tête titre/point rouge/count/bande passante et bascule à droite si au moins 3 flux → zone scroll 300px → cartes si moins de 3 ou choix forcé, sinon chronologie. Carte : image/type → titre/édition → sous-titre → utilisateur/appareil → pistes audio/sous-titres → localisation → progression/pourcentage → badges méthode/AV1/pause et actions à droite.

## Matrice de comparaison initiale

| ID | Élément main, dans son emplacement historique | Go avant correction / correction requise |
|---|---|---|
| H01 | Titre Journaux avec icône ; nombre total dans sous-titre | Nombre sous les filtres ; remettre dans en-tête |
| H02 | Onglets Application/Système à droite de l'en-tête | Onglets sur ligne distincte ; remettre à droite, mobile retour ligne |
| H03 | Page réservée admin | Go ajoute historique personnel autorisé ; conserver son périmètre serveur/utilisateur |
| H04 | Alertes nouveaux pays/IP publiques au-dessus filtres | Absentes ; connecter aux vraies lectures et seuils persistés |
| H05 | IP d'alerte cliquable vers recherche | Absente ; recherche IP réelle nécessaire |
| H06 | Barre recherche pleine largeur dans carte | Formulaire grille avec recherche parmi champs ; restaurer barre |
| H07 | Recherche utilisateur/titre/IP/client | Go titre/utilisateur seulement malgré placeholder IP |
| H08 | Filtres sauvegardés à côté recherche | Absents ; utiliser `jellytrack-saved-filters`, nom/url/date, 10 max |
| H09 | Sélecteur colonnes à côté recherche | Absent ; minimum deux colonnes |
| H10 | Filtre serveurs sous séparation | Paramètre backend `servers` existe ; aucun contrôle page |
| H11 | Masquer zappés par défaut, action immédiate | Présent mais seulement soumis avec tout formulaire |
| H12 | Bouton filtres développe panneau avancé | Tous champs toujours exposés ; restaurer panneau |
| H13 | Réinitialiser tous filtres | Présent ; préserver colonnes personnalisées |
| H14 | Tri date desc/asc, durée desc/asc | Présent mais déplacé ; restaurer barre et action immédiate |
| H15 | Rechercher/Appliquer sur barre de contrôle | Présent, emplacement différent |
| H16 | Exports CSV et JSON côte à côte | CSV page courante seulement ; export JSON absent |
| H17 | Export des résultats filtrés avec mêmes critères | Ancien `/api/logs/export` Go ignore filtres/scoping ; utiliser `/api/history` autorisé paginé |
| H18 | Presets Tout, Transcodages, DirectPlay, 4K, Zappés | Absents ; requêtes réelles, remise page 1 |
| H19 | Types Tout/Movie/Episode/Audio/AudioBook multiples | Select unique, Book à la place AudioBook ; types multiples backend absents |
| H20 | Client/App filtre texte | Présent ; remettre panneau avancé |
| H21 | Audio codec ou langue | Absent frontend/backend malgré colonnes SQL existantes |
| H22 | Sous-titres codec ou langue | Absent frontend/backend malgré colonnes SQL existantes |
| H23 | Dates Depuis/Jusqu'au côte à côte | Présentes ; conserver validation dates |
| H24 | Filtre `resolution=4K` preset | Paramètre ignoré API historique |
| H25 | Deep links heure/jour/serveurs et conservation critères | Heure Go présente ; dates/serveurs existent, restaurer critère venant graphiques |
| H26 | Huit colonnes défaut : date,user,media,client,resolution,audioBitrate,status,duration | Sept fixes media,user,client,duration,status,date,détails |
| H27 | 16 colonnes disponibles | date,startedAt,endedAt,user,media,client,ip,country,status,resolution,audioBitrate,codecs,duration,pauseCount,audioChanges,subtitleChanges |
| H28 | Ordre/largeur colonnes drag et resize | Absents ; `jellytrack.logs.columns.v1`, `cols`, `colsState` |
| H29 | Date première cellule et chevron chronologie | Date presque dernière, aucune expansion |
| H30 | Utilisateur lien fiche | Présent |
| H31 | Média image/lien et sous-titre série/saison/album/artiste | Présent partiellement ; image standard, sous-titre bibliothèque/type |
| H32 | Pochettes audio carrées, épisodes 16:9 | Images 30×44 uniformes |
| H33 | Image scoped serveur/fallback parent | Serveur historique présent, fallback parent absent |
| H34 | Version/édition sous titre | Aucune version retournée ; récupérer metadata télémétrie existante |
| H35 | Client, résolution, débit audio | Client seul renvoyé ; résolution/bitrate SQL non exposés |
| H36 | IP et ville/pays configurables | Aucune donnée IP/pays dans réponse malgré SQL |
| H37 | Statut DirectPlay/Transcode/Download/reconnexion/pauses | Méthode seule ; autres champs absents |
| H38 | Codecs/langues audio et sous-titres | Absents de l'API et tableau |
| H39 | Durée avec statut actif vérifié | Durée seule ; endedAt absent ne suffit pas à conclure actif |
| H40 | Compteurs pause/audio/subtitle | Stockés mais non exposés |
| H41 | Lignes cliquables ouvrent SessionModal | Bouton Détails ajouté dans colonne distincte ; restaurer clic/Enter ligne |
| H42 | Chevron ouvre chronologie inline sans ouvrir modal | Absent |
| H43 | Watch party : même média, >=2 utilisateurs, fenêtre 5 min | Absent ; calculer sur vraies sessions page, inclure serveur dans identité |
| H44 | Tableau fixe / scroll horizontal / en-têtes uppercase / lignes alternées | Tableau générique ; restaurer style ciblé |
| H45 | Mobile titre média strip version/résolution/méthode/durée/client | Strip absent ; conserver scroll plutôt que retirer données |
| H46 | Pagination numérotée première/dernière/±2/ellipsis | Seulement précédent/numéro/suivant |
| H47 | 50 sessions/page | Présent |
| H48 | 200 derniers événements/session | API télémétrie séparée admin uniquement ; enrichir historique dans périmètre autorisé |
| H49 | État chargement/erreur/vide réel | Présent ; conserver absence donnée sans la fabriquer |
| S01 | Trois cartes nombre / taille / rétention | Absentes ; fichiers affichés comme liens avant tableau audit |
| S02 | Rétention persistée et lien `/settings/scheduler` | Valeur API fixée 30 ; lire `resolutionThresholds.schedulerIntervals.logRetentionDays` |
| S03 | Recherche fichiers | Absente |
| S04 | Actualiser fichiers avec état action | Absent ; chargement une seule fois par onglet |
| S05 | Vider avec confirmation/erreur | Présent ; backend ignore erreurs, suppression journal actif |
| S06 | Télécharger journal actif | Pas de bouton principal ; ancienne route sans `file` exporte CSV lectures |
| S07 | Tableau fichier/modifié/taille/lignes/actions | Remplacé par Action/Acteur/Message/Date SQL audit |
| S08 | Badge Principal Actif / Journal du jour | Absent ; API isCurrent existe, fileRole absent |
| S09 | `lineCount` et taille réelle | lineCount absent ; streaming count sans charger log entier |
| S10 | Télécharger par ligne avec retour succès/erreur | Liens seuls, téléchargement manquant renvoie CSV sans signal |
| S11 | Supprimer un fichier archivé avec confirmation | API existante mais aucun contrôle ; journal actif non supprimable |
| S12 | Tableau aucun fichier trouvé | Pas de vide fichiers explicite |
| S13 | Audit Go complémentaire, pagination réelle | Déjà ajouté Go ; conserver après tableau historique dans bloc distinct |
| M01 | Titre/sous-titre média, utilisateur/client | Modal Go titre + dl de champs ; restaurer historique d'abord |
| M02 | Sept compteurs pause/audio/sub/seek/replay/speed/stop | Absents |
| M03 | Durée totale média plutôt que durée regardée seulement | Pas de chronologie |
| M04 | Normalisation positions ticks/ms, bornes durée | Pas de piste ni repères |
| M05 | Regroupement événements tous 1500ms, priorité type | Simple tableau événements un à un |
| M06 | Couleurs/types pause,audio,subtitle,seek,replay,speed,download,stop | Tableau sans effets visuels |
| M07 | Progression regardée/piste temporelle/repères | Absente |
| M08 | Date réelle et metadata transitions from→to | Date/position seulement ; metadata ignorée |
| M09 | Aller au média `?t=secondes` et copier lien | Absents |
| M10 | Fermeture backdrop/fermer, mobile95%, desktop900px, max85vh | Dialog natif présent ; détails conservés dans section complémentaire |
| L01 | Count/bande passante réelle, point live pulsant | Présents mais API invente 6/12Mbps si bitrate absent |
| L02 | Cartes <3, chronologie >=3, bascule persistante page | Présents ; structure à vérifier visuellement |
| L03 | Zone contenu max300px scroll vertical | Présente à confirmer QA |
| L04 | Poll4s suspendu onglet caché et actualisation immédiate visible | Go poll5s et poll global simultané sans suspension |
| L05 | Image audio/épisode/film adaptées, lien carte entière | Image uniforme, titre pas cliquable en mode carte |
| L06 | Fallback image parent et `serverId` | Omis de la requête image Go live |
| L07 | Sous-titre série/saison/album/artiste + édition | Champs frontend partiels mais API ne les renvoie pas |
| L08 | Codec/langue/index audio et sous-titres, AV1 | SQL audio/langues/codecs stockés, API ne les expose pas ; indices non stockés |
| L09 | Pause réelle/pourcentage/badge | API `isPaused=false` fixe ; frontend force au moins3% même si0% |
| L10 | Message rapide/titre/texte/5s10s30s | UI presque présente ; API ignore timeoutMs et fixe10s |
| L11 | Message loading/error/success, validation texte vide | Présents partiellement ; HTTP Jellyfin non vérifié backend |
| L12 | Stop confirmation/rechargement succès | API supprime localement avant résultat et retourne succès même erreur |
| L13 | Commande ciblée serveur+session | SessionId seul et LIMIT1, collision multi-serveur possible |
| L14 | Traductions `liveStreams` + filtres serveur | Nombreuses chaînes FR et domaine dashboard à la place |

## Limites de référence

Le code établit les positions/structures/interactions ; il ne prouve pas à lui seul la fidélité des pixels. Aucun lancement de Next/React n'a été fait par `logs_reference`. Les captures et tests navigateur sont confiés à `visual_qa`.

Les numéros d'épisodes, pistes sélectionnées et éditions valkey/Jellyfin de `main` ne sont pas tous enregistrés par Go. Une donnée historique non stockée doit rester absente et être documentée ; aucun texte de remplacement ne doit simuler sa présence. Les libellés d'absence sont des états réels. Les supplémentaires Go (historique personnel, filtre heure/méthode/résolution explicite, journal audit SQL) restent distincts de la composition historique.
