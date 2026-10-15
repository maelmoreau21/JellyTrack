# Chargement des pages — vérification locale

## Optimisations du 15 octobre : temps complet et allocations

Les calculs communs aux catalogues, bibliothèques et fiches médias agrègent
désormais des colonnes étroites sans matérialiser les lignes complètes de
l'historique. SQLite utilise les identifiants médias autorisés pour ses recherches
indexées ; PostgreSQL conserve ses jointures. Les filtres de serveur, compte et
bibliothèque restent appliqués. Aucun index ni schéma n'est modifié.

Les six panneaux statistiques d'une fiche utilisent un seul regroupement SQL,
puis des agrégats en mémoire. L'analyse comportementale évite les sessions sans
signal et ne conserve plus un ensemble de tous les identifiants de lecture.
Les profils parcourent les résultats progressivement sans tableau de toutes les
sessions ni seconde copie pour le filtre serveur ; les genres ne sont plus
redécodés pour chaque lecture du même média.

Comparaison avec les fonctions exactes de `2e5ac06` sur les mêmes bases jetables :

| Cas | Avant | Après |
| --- | ---: | ---: |
| Fiche complète, 100 000 lectures, allocations/requête | 108,7 Mio | 25,4 Mio |
| Fiche complète, médiane de 3 appels alternés | 8,87 s | 4,90 s |
| Profil, 100 000 lectures, allocations/requête | 263,7 Mio | 126,6 Mio |
| Dashboard, 100 000 lectures, allocations/opération | 74,7 Mio | 51,8 Mio |
| Dashboard, moyenne de 3 opérations du benchmark | 2,39 s | 1,49 s |

Les réponses complètes avant/après ont été comparées : mêmes données pour les
fiches et profils, résultat dashboard identique. La fixture dashboard couvre
100 000 lectures réparties dans le temps ; la fixture média concentre 100 000
lectures sur dix pistes avec 15 000 événements. Les allocations sont le cumul
alloué pendant l'appel, pas le pic RAM ni la mémoire résidente du processus.
La charge Windows varie fortement : les trois appels média optimisés vont de
3,18 à 8,35 s et ceux d'avant de 8,75 à 9,71 s. Aucun gain de temps stable n'est
établi pour le profil ; son amélioration démontrée concerne la mémoire.
Les comparateurs temporaires ont été retirés ; les journaux locaux restent sous
`scratch/media-performance-qa/`. Ces chiffres ne mesurent pas le NAS/Jellyfin réel.

Mesure reproductible de la version courante :
`go test ./internal/stats -run '^$' -bench BenchmarkDashboardLargeHistory -benchtime=3x -benchmem`.

Le client évite la requête intermédiaire de compteurs sur les fiches : en-tête
local puis réponse complète optimisée. L'API `part=overview` reste compatible.
Les contrôles d'événements cachés sont construits à la première ouverture et
les observateurs/graphiques sont libérés en quittant une page média. Le contenu
final et les interactions restent identiques. L'intégration compare aussi le
contenu développé à la référence historique.

Le test `TestHistoryLargeFixture` mesure également catalogue, bibliothèques,
dashboard sans cache, historique et profils à 3 000 et 100 000 lectures. Sur la
fixture 3 000, les appels catalogue/bibliothèques prennent environ 20 ms, le
dashboard 67 ms et l'historique avec 10 000 événements visibles 209 ms. Ce dernier
conserve ses détails et son contrat ; aucun gain nouveau n'est revendiqué pour
cet endpoint dans ce lot. La pagination et la limite de 200 événements/session
restent en place.

Les tests de panneaux indépendants et de pics simultanés passent sur SQLite et
PostgreSQL, notamment langues NULL/vides, compteurs qui s'annulent, collisions
serveur et démarrage à la seconde exacte de fin d'une autre lecture.

Validation du lot : `go test ./...`, `go vet ./...`, `go build ./...`, Svelte
Check (0 erreur/avertissement), build embarqué, 34 parcours d'intégration et
4 scénarios progressifs réussis. Les tests PostgreSQL ciblés vérifient aussi le
compte personnel après optimisation. L'analyse compare les observateurs avant
et après navigation : seul l'observateur global de thème doit subsister.
Sur les 31 captures comparables à la référence (hors paramètres déjà redessinés),
les dimensions sont identiques : 20 images strictement identiques, 11 avec au
plus 28 pixels différents sur 1 296 000, sans déplacement de mise en page.
La tentative locale `-race` n'a pas pu démarrer : CGO est désactivé et aucun
compilateur C n'est disponible dans le PATH. Ce contrôle n'est pas compté comme
réussi ; la CI conserve son test race complet sur Linux.

## Albums et bibliothèques : chargement progressif

Les pages médias ne bloquent plus leur affichage sur le téléchargement de
Chart.js. Bibliothèques charge d'abord les groupes, volumes et nombres exacts
(`part=overview`), puis les classements et vignettes. Un album charge d'abord sa
fiche locale (`/api/media-metadata/:id?part=header`, sans appel Jellyfin distant
ni historique), puis les pistes, compteurs, l'historique paginé, les analyses et
graphiques dans la réponse complète optimisée. Le contrat complet sans `part`
reste identique. Les requêtes conservent les mêmes contrôles de bibliothèques,
d'identité et de serveur. Une erreur tardive conserve la fiche et propose de
réessayer ; quitter la page empêche une réponse tardive de remplacer la suivante.

Mesures historiques du 14 octobre, avant les optimisations du 15 octobre,
SQLite, un album de dix pistes (charge CPU variable) :

| Réponse | 3 000 lectures / 1 500 événements | 100 000 lectures / 15 000 événements |
| --- | ---: | ---: |
| Fiche locale album | 1,3 ms / 604 octets | 1,7 ms / 604 octets |
| Pistes et compteurs | 28 ms / 7 Ko | 2,1 s / 7 Ko |
| Réponse complète album | 199 ms / 342 Ko | 12 s / 450 Ko |
| Bibliothèques, aperçu | 1,5 ms | 1,3 ms |
| Bibliothèques, réponse complète | 14 ms | 1,2 s |

Le premier affichage n'attend donc plus les réponses lourdes. Ces temps sont
ceux des handlers sur une base jetable, hors authentification/réseau, sous charge
CPU variable ; ils ne garantissent pas un temps sur le serveur de l'utilisateur.
Les phases finales restent plus coûteuses sur l'album extrême. Les expériences
de changement du plan SQLite n'avaient pas été retenues dans ce premier lot.
Le lot du 15 octobre est détaillé ci-dessus.

Test normal : `go test ./internal/api -run TestProgressivePopularAlbumAndLibraries -count=1 -v`.
Charge extrême PowerShell :

```powershell
$env:JELLYTRACK_MEDIA_SCALE_QA='true'
go test ./internal/api -run TestProgressivePopularAlbumAndLibraries -count=1 -v
Remove-Item Env:JELLYTRACK_MEDIA_SCALE_QA
```

`npm run test:integration --prefix frontend` compare la présentation finale aux
pages historiques et bloque volontairement les réponses secondaires pour vérifier
la disponibilité du premier affichage, le réessai et l'annulation de navigation.
Les 34 routes et quatre scénarios progressifs passent. Avec ce serveur Go jetable,
le navigateur atteint le premier affichage utilisable en 346 ms pour les
bibliothèques et 499 ms pour l'album (fiche et compteurs disponibles alors que
la réponse d'activité reste volontairement bloquée dans l'ancien parcours). Ce sont des mesures de
fixture locale, distinctes des temps de handlers du tableau et du serveur réel.

## Mesures complémentaires du 14 octobre : historique et profils

L'utilisateur situe son volume probable à quelques milliers de lectures. La
fixture de 3 000 lectures représente donc mieux ce volume ; 100 000 constitue
un test de charge. Chaque fixture comporte aussi 15 000 événements de télémétrie,
dont les 200 plus récents par session sont conservés dans les réponses. Ce cas
est volontairement chargé, sans représenter une mesure de la base déployée.

Commande : `go test ./internal/api -run TestHistoryLargeFixture -count=1 -v`.

| API / sous-ensemble, dernière exécution locale | 3 000 lectures | 100 000 lectures |
| --- | ---: | ---: |
| Historique, page de 50 avec télémétrie | 48 ms | 186 ms |
| Historique, tri durée | 6 ms | 56 ms |
| Historique, recherche titre | 53 ms | 183 ms |
| Données de profil et son historique | 109 ms | 640 ms |
| Historique du profil seul | 105 ms | 154 ms |

Le profil transférant auparavant toutes les combinaisons client/codecs/types pour
construire des ensembles de filtres, cette requête utilise maintenant `DISTINCT`.
Sur deux observations comparables avec 100 000 lectures, l'historique du profil
passe de 613 à 419 ms et le profil complet de 1 482 à 1 163 ms. Les mesures du
tableau, effectuées ensuite avec moins de concurrence CPU, sont plus basses : ne
pas en déduire un gain garanti ou attribuer toute variation à la correction.
Les tests SQLite et PostgreSQL vérifient les options de toute l'identité autorisée,
même lorsque la page courante est filtrée et limitée, et excluent l'autre serveur.
Aucun cache ni changement des agrégats/permissions ajouté.

Lors des mesures décrites ci-dessous, le frontend livré était encore `web/dist`.
Depuis l'intégration SvelteKit, `web/static.go` embarque `web/svelte`, produit
depuis les sources `frontend`. Les optimisations historiques sont reprises dans
ses contrôleurs compilés. Voir `frontend/DEV_STATE.md` pour la validation actuelle.

## Frontend

La migration Svelte conservait les chaînes de chargement du client historique.
Changer de framework ne supprimait donc pas ces attentes réseau.

Corrections appliquées à `web/dist/assets/app.js` et au service i18n Svelte :

- Traductions et vérification de session démarrent ensemble ; le routeur attend
  toujours la session vérifiée avant d'ouvrir une page protégée.
- Le français est téléchargé une fois au démarrage, au lieu de deux fois.
- Les autres langues et le français de secours sont téléchargés en parallèle.
- Chart.js et le module de page sont téléchargés en parallèle.
- La liste des utilisateurs ne télécharge plus Chart.js : elle n'a aucun graphique.
- Le tableau de bord lance ses données sans attendre les options de serveurs.
  En mono-serveur, cette requête d'options n'est plus effectuée.
- L'annulation des requêtes de l'ancienne page lors d'une navigation est conservée.

### Mesures reproductibles

Depuis `frontend`, lancer `node scripts/loading-performance.mjs`.
Le test compare `HEAD:web/dist/assets/app.js` au fichier modifié, dans Chromium,
avec des API simulées et une latence imposée de 250 ms. Aucun compte réel,
fournisseur SSO ou base de production n'est utilisé.

Exécution locale du 14 octobre 2026 :

| Scénario | Avant | Après |
| --- | ---: | ---: |
| Premier affichage de À propos | 1 549 ms | 973 ms |
| Navigation vers les utilisateurs | 1 365 ms | 848 ms |
| Téléchargements du français | 2 | 1 |
| Téléchargements Chart.js pour les utilisateurs | 1 | 0 |

Le test impose également 750 ms sur les options du tableau de bord multi-serveur.
La requête de données démarre 4 ms après celle des options, sans attendre sa réponse.
Le scénario mono-serveur ne demande aucune option. Le scénario de navigation
rapide annule la requête utilisateurs et vérifie que sa réponse tardive ne peut
pas remplacer la page À propos.

Les temps absolus sont des observations, pas des seuils CI : la charge CPU locale
peut les modifier. Une répétition pendant les autres vérifications a donné
1 527 → 989 ms au démarrage et 873 → 901 ms pour la navigation utilisateurs :
le gain de cette dernière n'est donc pas constant dans ces observations.
Les assertions portent sur les requêtes supprimées, les
opérations concurrentes et l'annulation. Ces mesures ne démontrent pas le temps
de chargement sur le serveur de l'utilisateur ni la performance de sa base.

Validation complémentaire : syntaxe JavaScript valide, Svelte check sans erreur
ni avertissement et les 7 contrats runtime API réussis.

## Catalogue et base de données

Pour les tris titre/date sans filtre de résolution, la requête récursive développe
désormais les familles des éléments de la page demandée plutôt que toutes celles
du catalogue. Le catalogue autorisé complet reste disponible pour rechercher les
descendants. Les statistiques globales, filtres et permissions sont conservés.

Fixture SQLite de 3 000 titres et 3 000 lectures, une exécution locale :

| API catalogue | Avant | Après |
| --- | ---: | ---: |
| Films | 39 ms | 23 ms |
| Séries avec saisons et épisodes | 184 ms | 54 ms |

Commande : `go test ./internal/api -run 'TestCataloguePageWithThousandsOfItemsKeepsRealCounts|TestMediaRecoveryFamiliesScopesFiltersAndPagination|TestCatalogueLibraryAccess' -count=1 -v`.
Les tests vérifient aussi les descendants, la pagination, les filtres et les
statistiques personnelles d'un utilisateur ordinaire. Le dashboard avec 10 000
lectures mesure 106 ms sur la fixture ; cela ne mesure pas la base déployée.

## Transfert des fichiers

Les scripts, styles et traductions publics sont comprimés une fois au démarrage.
La réponse utilise gzip si le navigateur l'accepte et une empreinte ETag pour
éviter de renvoyer un fichier déjà reçu. Les noms historiques ne sont pas
empreintés : la revalidation reste obligatoire pour récupérer les mises à jour.
L'API privée, les flux live et les pages HTML sont exclus de ce cache.

| Fichier | Taille originale | Transfert gzip |
| --- | ---: | ---: |
| app.js | 291 080 octets | 62 384 octets |
| app.css | 107 777 octets | 18 678 octets |
| chart.min.js | 208 536 octets | 73 135 octets |

Commande : `go test ./web -run TestTextAssetsTransferAndRevalidation -v`.
Le test vérifie l'identité exacte après décompression, la revalidation 304,
les variantes avec et sans gzip, HEAD et les requêtes de plages d'octets.
Le middleware ajoute `duration_ms` aux journaux de requêtes afin de distinguer
une réponse API lente d'une attente de chargement dans le navigateur.

## Limites

Aucune image n'a été publiée, aucune base réelle n'a été modifiée et aucune mesure
de production n'a été effectuée. Les chiffres SQLite et Chromium ci-dessus sont
des mesures de fixtures. Le résultat sur PostgreSQL, le NAS, le réseau et Jellyfin
réels reste à mesurer après installation du correctif.

## Fiches média : métadonnées progressives

La fiche ne demande plus `metadata=true` dans sa requête de statistiques. Elle
présente les données locales immédiatement, puis appelle
`/api/media-metadata/{id}` avec les mêmes filtres de serveur. La réponse autorisée
enrichit uniquement la présentation : résumé, année, logo, arrière-plan,
distribution, versions et repères. Les graphiques, statistiques, contrôles de
chronologie et action du poster conservent leurs éléments et leurs interactions.
Une erreur du fournisseur conserve la fiche locale ; une navigation annule la
requête de métadonnées. Les erreurs de la requête initiale restent affichées.

Validation : depuis `frontend`, `node scripts/media-progressive.mjs` compare
la présentation finale à celle de `HEAD:web/dist/assets/media-recovery.js` avec
la même fixture enrichie. Le HTML normalisé du héros, distribution, versions et
repères est identique. Avec les métadonnées retardées de 1 seconde, les
statistiques apparaissent avant la réponse. Les tests vérifient le maintien des
éléments statistiques/graphiques et d'une chronologie développée, la rotation du
poster, la recherche d'une personne après enrichissement, le fournisseur hors
ligne et l'annulation lors d'une autre navigation. Les 3 scénarios réussissent.
Ces preuves utilisent des API simulées, sans serveur Jellyfin ni base réelle.

Validation finale du lot : `go test ./...`, `go vet ./...`, `go build ./...`,
Svelte Check (0 erreur/avertissement), build statique, 7 contrats runtime API,
8 scénarios dashboard sous CSP stricte et 3 scénarios média progressif réussis.
Le nouvel endpoint est testé à travers le routeur HTTP pour l'authentification,
et directement avec un fournisseur simulé pour l'isolation serveur/bibliothèque,
les champs retournés et l'absence de données privées. Diff-check réussi.
