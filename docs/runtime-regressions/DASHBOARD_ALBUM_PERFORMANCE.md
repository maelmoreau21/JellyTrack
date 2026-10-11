# Tableau de bord, albums et synchronisation — 11 octobre 2026

Corrections locales dans le checkout actuel. Les modifications de politique de connexion déjà présentes ont été conservées. Aucun conteneur Docker utilisateur, secret ou base de production modifié ; seul le serveur de fixture 3350 a été reconstruit.

## Changements

- Carte de Fréquentation : carte sur toute la largeur de la grille ; conteneur en border-box, tableau sans largeur minimale de 600 px, tailles adaptées aux écrans étroits. Les 24 heures restent présentes et cliquables.
- Aujourd’hui : comparaison chronologique SQLite acceptant les dates avec espace et les dates ISO avec T. Deux lectures du jour aux deux formats sont comptées ; celle de la veille est exclue. Le jour reste défini en UTC comme les autres graphiques.
- Résolution : les événements plugin sans résolution ou avec Unknown conservent une valeur déjà connue. Une nouvelle résolution réelle peut toujours la remplacer. La synchronisation reconnaît désormais le 1440p et conserve les classes des vidéos recadrées. Les historiques auparavant écrasés ne sont pas reconstitués artificiellement ; une synchronisation pourra rafraîchir les métadonnées disponibles.
- Synchronisation : deux écritures UUID avec/sans tirets et différences de casse désignent le même serveur. L’identifiant enregistré et les références internes restent inchangés. Le refus d’un véritable changement de serveur et la protection des historiques restent actifs. Le test reprend l’identifiant cité dans le signalement.
- Journaux système : onglet, panneau, commandes et ancienne fonction d’interface supprimés. Les journaux de lectures et les sorties Docker sont conservés ; aucune suppression des fichiers existants ni des données d’audit.
- Médias : relation parent/enfant calculée via des jointures séparées pour identifiants internes et Jellyfin. La page détail limite son catalogue et ses agrégations à la hiérarchie reliée au média demandé, avec les mêmes filtres et permissions ; les sous-arbres des ancêtres sont conservés pour leurs statistiques.

## Validation

- go test ./..., go vet ./..., go build ./... : réussis. Tests Jellyfin revérifiés après ajout du cas 1440p. Les variantes nécessitant PostgreSQL sont ignorées faute de base de test configurée ; aucune validation PostgreSQL réelle revendiquée.
- Tests régression SQLite : compteur Aujourd’hui aux deux formats, résolution conservée après événements incomplets puis modifiée par une valeur réelle, UUID serveur avec/sans tirets, véritable changement de serveur toujours refusé.
- Grande bibliothèque isolée : 1 000 albums, 6 000 pistes et 6 000 lectures, deux formes de parentId, piste étrangère sur un autre serveur. Détail album HTTP 200, six pistes, six lectures, 720 000 ms et 160 kbps conformes aux données.
- Même fixture : calcul récursif global 52–56 ms avant / 38–42 ms avec les jointures séparées. Détail album 437 ms avant limitation à sa hiérarchie / 201 ms après. Ces relevés locaux ne démontrent ni un gain général ni les performances de production.
- dashboard-album-results.json : 24 contrôles navigateur, aucun échec ; matrice sans défilement horizontal à 320/390/768/1440 px dans les deux thèmes ; valeurs Aujourd’hui conformes à l’API (16 lectures et 8,7 h dans la fixture), onglet système absent, lectures présentes, album et pistes rendus ; aucune erreur JavaScript.
- core-runtime.json : 50 contrôles réussis, droits anonyme/utilisateur/admin, exports, graphiques et assets embarqués conformes aux sources. La première exécution utilisait une session de fixture identityVersion=1, devenue invalide avec les modifications de connexion préexistantes. Le générateur de fixture a été adapté à identityVersion=2 puis les contrôles ont été rejoués avec succès.
- Syntaxe app.js et history.js vérifiée ; git diff --check réussi. Captures attendance-* et album-runtime.png inspectables dans ce dossier.

## Limites

Le blocage de l’album utilisateur et le pic CPU n’ont pas été reproduits sur la fixture. Les optimisations et les chargements réussis ne suffisent pas à déclarer le problème de production résolu. L’erreur d’identité est corrigée lorsqu’elle vient du format UUID ; un véritable changement de serveur nécessite toujours un examen de la configuration. Les services Jellyfin des tests sont simulés. Aucun gain RSS/RAM mesuré ; les 50–75 Mo signalés ne permettent pas de conclure à une fuite ou à une amélioration. Les modifications doivent être intégrées à une image Docker avant d’apparaître sur l’instance utilisateur.
