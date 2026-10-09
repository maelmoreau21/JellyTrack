# Restauration des interfaces utilisateurs

Référence historique : `main`, `a59a28613e63e86106c61827167d355b47147f42`, identique à `origin/main` lors de l'intervention. Branche de travail : `codex/frontend-recovery`, à partir de `7b82d9a`, identique à sa dernière version distante. Aucun changement sur `main`, aucun commit ni push effectué.

## Comparaison élément par élément

| Composant historique | Position et contenu restaurés | Implémentation Go |
|---|---|---|
| `UsersManagementClient` : barre supérieure | Recherche nom/client à gauche, purge puis exports CSV/JSON à droite | `users.js`, `users.css` |
| Filtres utilisateurs | Sous la recherche : Tous, inactifs 30/90 jours, gros transcodeurs, sans activité | Même ordre, seuils historiques |
| Tableau utilisateurs | Carte unique : titre/compteur, huit colonnes, avatar 28 px, heures, sessions, DP/TC, client, activité, suppression | Remplace la grille simplifiée |
| Pagination utilisateurs | Sous le tableau, 25 lignes par page ; tous les résultats filtrés exportables | Chargement de toutes les pages API |
| Actions utilisateurs | Confirmation de suppression et bilan détaillé de purge | Endpoints administrateur existants |
| En-tête profil et `ProfileAvatar` | Avatar 72 px, titre « Profil : … », identifiant Jellyfin ; Wrapped à droite | `profile.js`, `profile.css` |
| `UserActiveStream` | Après l'en-tête, avant les cartes : titre, sous-titre, client/appareil/méthode, pause, progression | Endpoint existant enrichi |
| `UserInfo` | Temps avec pied dernière activité ; sessions et moyenne ; genres ; complétion ; pic ; série ; contenu unique et sous-comptes ; format ; média le plus vu sur deux colonnes ; client ; appareil | Statistiques de profil dans `/api/users/{id}` |
| `UserActivity` | Après les cartes, activité quotidienne sur 30 jours | Population complète, indépendante du filtre de zapping des cartes |
| `UserStatsCharts`, première rangée | Jour de semaine, anneau de complétion, heures | Graphiques dans le même ordre |
| `UserStatsCharts`, deuxième rangée | Genres à gauche, fiche technique à droite ; grand bloc client, Direct Play et débit | Complétion cumulative, Direct Play strict, débit normalisé |
| `UserRecentMedia` | Dernière section, historique complet paginé, recherche puis outils, filtres sous séparateur, tableau technique | Historique dans `/api/users/{id}`, 50 lignes/page |

La référence ne propose aucun tri interactif des colonnes de la liste utilisateurs. Son tri initial est le temps regardé décroissant. Le dialogue d'invitation présent dans le code historique n'a aucun déclencheur rendu : aucun bouton supplémentaire n'est ajouté.

## Contrats et périmètre

Les endpoints existants sont conservés. La liste inclut les comptes inactifs et sans lectures. Ses statistiques comptent les sessions d'au moins 60 secondes, avec une dernière activité absente lorsqu'aucune session ne satisfait ce seuil. Le choix du client favori applique le même seuil.

Les cartes du profil appliquent la politique historique de zapping, avec exemption des téléchargements. Les graphiques détaillés et l'activité quotidienne utilisent toutes les sessions. La complétion agrège les reprises d'un même média ; les seuils audio diffèrent des seuils vidéo. Les données manquantes ne produisent pas de durée ou de débit fictif.

La télémétrie conserve les 200 derniers événements par session, comme dans la référence. Les badges de reconnexion comparent des sessions distinctes du même compte, serveur et média sur la page courante, avec un écart maximal de 30 secondes ; une session sans fin ne suffit pas à créer ce badge.

Les nouveaux styles sont limités aux interfaces utilisateurs. L'application reste native Go avec ses ressources embarquées ; les outils Node/Python ci-dessous servent uniquement à la validation.

## Sous-agents réellement exécutés

| Sous-agent | Travail | Fichiers autorisés |
|---|---|---|
| `users_reference` | Audit historique en lecture seule | Aucune écriture |
| `users_api` | Données manquantes, accès, tests de régression | Handlers et tests Go utilisateurs/proxy avatars |
| `users_ui` | Liste utilisateurs | `web/dist/assets/users.js`, `users.css` |
| `profile_ui` | Profils et sous-sections | `web/dist/assets/profile.js`, `profile.css` |
| `users_qa` | Exécution navigateur, jeux de données, captures et comparaison | Scripts/preuves QA, copies historiques sous `scratch` |

La limite de concurrence est de quatre agents, coordinateur compris. Les cinq sous-agents ont été lancés en vagues successives. Le coordinateur est seul responsable des modifications partagées de `app.js`, `index.html` et de ce rapport.

## Conformité : quatre aspects distincts

| Aspect | Résultat | Preuves et limites |
|---|---|---|
| Structure | Restaurée pour la liste et toutes les sous-sections de profil | Ordre des sections et cartes, contenu complet des cartes, position des filtres, tailles d'avatars, grilles responsive, tableau et pagination comparés au code de `main` et aux captures |
| Apparence | Très proche ; fidélité partielle des graphiques et de quelques icônes | Sur desktop, recherche : 448 × 36 px ; tableau : 1118 × 480,5 px pour neuf comptes ; lignes : 49 px, identiques dans les mesures historiques et Go. Cartes du profil : rangées de 182, 150 et 146 px. Captures clair/sombre et mobile disponibles. Chart.js diffère encore de Recharts pour les axes, légendes, espacements internes et animations |
| Comportement | Restauré et testé, avec deux différences explicites | Recherche, filtres, tris d'historique, pagination, exports complets, colonnes et préférences historiques, popovers, sessions, liens et contrôle des rôles. La touche Entrée de la recherche reste dans le profil, alors que le composant historique redirigeait vers `/logs`. Les comptes standard restent limités à leur compte/serveur authentifié |
| Données | Calculs historiques restaurés pour les données présentes | Sessions significatives séparées des populations graphiques, reprises cumulées, seuils audio, favoris, activité, débit, dates et historique complet. Métadonnées techniques de sessions closes absentes du schéma Go non reconstituées |

## Classification des composants

### Fidèlement restaurés

- **Liste utilisateurs** : barre de recherche nom/client, purge et exports, cinq filtres rapides dans leur ordre, carte titre/compteur, tableau de huit colonnes, avatars et initiales, heures, sessions, Direct Play/transcodage, client favori, dernière activité, badge de compte orphelin, actions, liens, pagination de 25 lignes et état vide.
- **En-tête de profil** : avatar 72 px, nom et identifiant, bouton Wrapped avec contrôle de visibilité et largeur mobile historique.
- **Cartes `UserInfo`** : onze cartes lorsque le média le plus vu existe, dix sinon ; contenu secondaire, pied de dernière activité, moyenne par session, genres, complétion, pic jour/heure, série, détail du contenu unique, format, média le plus vu sur deux colonnes, client et appareil favoris.
- **Historique `UserRecentMedia`** : position, recherche, outils, filtre anti-zapping, filtres avancés, types dont livres audio, dates/client/résolution/méthode/pistes, tris, pagination de 50 lignes, exports de tous les résultats filtrés, seize colonnes disponibles, ordre et largeur persistants, formats historiques de stockage et URL des filtres sauvegardés.
- **Chargements et états vides** : huit lignes squelette de la liste ; en-tête et quatre blocs de profil de 250/300/320/500 px ; absence d'historique et métadonnées manquantes traitées explicitement.
- **Adaptation responsive** : deux colonnes de statistiques sur mobile, trois puis quatre sur desktop ; rangées de graphiques et défilement horizontal du tableau ; thèmes clair/sombre.

### Partiellement restaurés ou partiellement validés

- **`UserActivity` et `UserStatsCharts`** : cinq graphiques et fiche technique, données et hiérarchie restaurées ; rendu Chart.js proche mais pas identique à Recharts, certaines icônes approximatives.
- **Bandeau `UserActiveStream`** : emplacement, informations, progression, pause et rafraîchissement restaurés ; aucune lecture Jellyfin réelle utilisée pour la validation.
- **Sessions et chronologie** : ouverture, hiérarchie historique de la modale, durée réelle du média, ticks historiques, groupes de 1 500 ms, événements, métadonnées et liens temporels restaurés ; apparence exhaustive de tous les types d'événements non comparée par captures à la modale historique.
- **Avatars et affiches distants** : requêtes avec serveur et repli en initiales restaurés ; seules les situations sans serveur Jellyfin réel ont été capturées.
- **Badges techniques** : données conservées présentes dans l'API et badges de reconnexion restaurés ; certains champs historiques manquent pour les sessions closes.

### Non restaurés

- Valeurs historiques qui n'existent pas dans le schéma Go : codec vidéo des sessions closes, nom de version, raison de transcodage et indices saison/épisode/piste absents. L'interface conserve les emplacements et indique les valeurs manquantes ; aucun chiffre ou libellé n'est inventé.
- Identité pixel par pixel du moteur Recharts et de toutes ses animations.

Aucune sous-section visible demandée n'a été volontairement supprimée. Le dialogue d'invitation sans déclencheur historique n'est pas considéré comme une fonction visible à restaurer.

## Validation exécutée

- `go test ./...` : réussi sur tous les paquets, y compris les nouveaux tests de statistiques, historique, exports, portée compte/serveur, télémétrie, avatars et reconnexions à la frontière 30/31 secondes.
- `go vet ./...`, `go build ./...` et compilation du binaire final : réussis.
- Vérification syntaxique des trois fichiers JavaScript concernés et `git diff --check` : réussis.
- Binaire lancé depuis un dossier sans `web/dist` ni `dist` : HTML et cinq ressources JS/CSS répondent HTTP 200 et correspondent exactement aux fichiers finaux. Preuve : [embedded-assets.json](users-validation/embedded-assets.json).
- **109 contrôles navigateur Go réussis** : 23 contrôles de vues/liste, 40 de profils, 11 de pagination, 8 de Wrapped/thème, 12 de préférences historiques, 4 de livre audio et 11 de télémétrie. Résultats détaillés dans [go-browser-results.json](users-validation/go-browser-results.json), [profile-controls.json](users-validation/profile-controls.json), [list-pagination.json](users-validation/list-pagination.json), [wrapped-theme.json](users-validation/wrapped-theme.json), [historical-preferences.json](users-validation/historical-preferences.json), [audiobook.json](users-validation/audiobook.json) et [telemetry.json](users-validation/telemetry.json).
- Scénarios : connexion administrateur réelle, sessions standard réelles et autorisations de l'API, profil propre et alias, refus des autres comptes, compte vide, données partielles, 135 sessions sur trois pages, liste temporaire de 35 comptes, recherche/filtres/tris, exports, anciens réglages, clair/sombre, mobile de 390 px et accès au Wrapped activé/désactivé.
- Télémétrie réelle ajoutée dans SQLite puis retirée : pause/reprise groupées, saut de lecture avec ticks historiques, changement audio avec métadonnées imbriquées, changement de vitesse, cinq marqueurs en ligne et quatre dans la modale, liens ouvrant un nouvel onglet et copie effective de l'URL temporelle dans le presse-papiers.

Les suites temporaires restaurent leurs paramètres et retirent leurs fixtures supplémentaires. Les scripts reproductibles et l'adaptateur de référence sont livrés dans [scripts/users-qa](../scripts/users-qa/README.md). Aucun outil Node/Python n'est ajouté au produit Go.

La [galerie comparative](users-captures/README.md) contient 54 captures réelles, et le [rapport QA](users-validation/README.md) regroupe les preuves. Après validation, les serveurs de test Go et Next lancés pour cette intervention sont arrêtés.

## Limites de validation

La référence Next est exécutée dans une copie isolée de `main`, avec ses composants historiques et un adaptateur Prisma synthétique alimenté par les mêmes données de test. Aucune base de production ni serveur Jellyfin réel n'est utilisé. Le runtime disponible est Next 16.4.0, contre 16.3.7 dans le manifeste historique. La copie de validation adapte le stub Prisma, le chargement des polices et le périmètre de scan Tailwind ; les composants utilisateurs historiques restent inchangés.

Huit captures principales historiques sont produites. Les trois cas de liste présentent une erreur de rendu serveur récupérable `window is not defined`, puis basculent vers le rendu client : la référence ne passe donc pas sa suite sans erreur. Les erreurs d'images distantes sont également conservées dans [main-browser-results.json](users-validation/main-browser-results.json). Aucune erreur JavaScript de l'interface Go n'est relevée dans les scénarios testés.

Les captures comparent les vues principales et les sous-sections après défilement ; elles ne garantissent pas l'égalité de tous les pixels. PostgreSQL réel, de très gros volumes au-delà du jeu synthétique, les traductions autres que le français et les médias/images Jellyfin réels n'ont pas été validés en navigateur.

Les actions de suppression et de purge sont restaurées, mais leurs effets contre un serveur Jellyfin réel n'ont pas été exécutés en navigateur. Les contrôles navigateur utilisent Chromium ; ils ne certifient pas tous les autres navigateurs.

Pour un administrateur, les profils agrègent les comptes liés par nom canonique comme dans `main`. Pour un utilisateur standard, la portée compte/serveur de Go est conservée : cette restriction évite d'exposer un autre compte partageant le même nom. Les égalités de temps arrondi peuvent aussi produire un ordre différent de comptes à zéro heure ; la recherche SQL n'offre pas exactement toutes les règles de collation locale de JavaScript.

Les autres grandes sections, les migrations et la collecte plugin restent hors de cette intervention. Le lien Wrapped est restauré, pas le contenu de la page Wrapped elle-même.
