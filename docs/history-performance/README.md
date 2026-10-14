# Journaux : coût SQL et affichage

La base externe utilisée auparavant peut changer les temps observés, mais ces
mesures locales ne permettent pas d'attribuer la lenteur du serveur à un moteur
particulier. Le code actuel prend en charge PostgreSQL et SQLite. Le Compose
actuel utilise PostgreSQL par défaut ; changer de branche ne signifie donc pas
automatiquement passer à SQLite. Aucun changement de base de production effectué.
L'utilisateur a confirmé utiliser actuellement SQLite, après PostgreSQL externe.

## Navigateur

Chaque page contient 50 sessions et peut recevoir 200 événements par session.
Le tableau construisait aussi les chronologies de toutes les lignes cachées au
premier affichage. Il construit désormais chaque chronologie à sa première
ouverture, avec les données déjà reçues. Réouvrir une ligne conserve son contenu.
Les compteurs, filtres, données et exports restent identiques.

Fixture Chromium de 50 sessions avec 200 événements chacune :

| Mesure locale | Avant | Après |
| --- | ---: | ---: |
| Construction de la page | 294 ms | 53 ms |
| Éléments DOM | 72 292 | 1 342 |
| Chronologies construites avant ouverture | 50 | 0 |

Commande depuis `frontend` : `node scripts/history-performance.mjs`.
Le test vérifie l'identité du HTML de la chronologie ouverte, la réouverture et
l'accès aux détails au clavier. Les temps sont des observations locales, pas
une garantie sur le poste ou le serveur de l'utilisateur.

## SQL et index

- SQLite : les exclusions de bibliothèques sont lues une fois par requête,
  au lieu d'exécuter une recherche JSON corrélée pour chaque lecture comptée.
- Le compteur conserve tous les filtres ; la jointure utilisateurs est conservée
  lorsqu'un filtre la nécessite et évitée dans les autres cas.
- La télémétrie récupère directement les 200 événements les plus récents de
  chaque session affichée, avec un index adapté, au lieu de classer tous ses
  événements avant d'appliquer cette limite. La jointure de serveur reste imposée.
  Les exports au-delà de 500 sessions sont toujours traités par lots.
- La migration 009 ajoute des index pour le tri par durée et les événements.
  Sur SQLite, l'index de durée porte sur une expression utilisée par le tri pour
  éviter qu'il dégrade le plan du filtre de zapping. PostgreSQL utilise l'index
  normal correspondant. Aucune lecture ni événement supprimé.

Fixture SQLite locale de 100 000 lectures et 15 000 événements,
page administrateur de 50 sessions, plusieurs mesures successives :

| Réponse API complète | Avant | Après |
| --- | ---: | ---: |
| Tri par date | 282–354 ms | 248–260 ms |
| Tri par durée | 507–545 ms | 99–184 ms |
| Recherche de titre | 305–309 ms | 206–252 ms |

Ces durées comprennent le compteur exact, l'enrichissement et la sérialisation.
L'API retourne les mêmes données, y compris les détails de chronologie.
Commande : `go test ./internal/api -run 'TestHistoryLargeFixture|TestHistoryTelemetryLatestWindowAndServerBinding|TestHistoryExcludedLibraries' -count=1 -v`.

L'initialisation crée les nouveaux index au démarrage ; sur une grosse base,
ce premier démarrage peut prendre plus longtemps et les index occupent de l'espace.
Aucune modification de configuration de connexion ni migration vers PostgreSQL.
Les temps sur le NAS, son disque et ses données restent à mesurer après installation.
Le contrat PostgreSQL est présent mais non exécuté sans instance de test configurée.

## Transfert réseau

La réponse JSON réussie de `/api/history` est comprimée en gzip lorsque le
navigateur l'accepte. Cette page peut transporter près de 1 Mo de chronologie
pour 50 sessions ; réduire le travail SQL seul ne réduit pas ce transfert.
Le JSON décomprimé reste identique et conserve `Cache-Control: no-store`.
Les réponses d'authentification, erreurs, exports et flux live ne sont pas
comprimés par ce correctif. Aucun cache partagé de données personnelles ajouté.
Test : `go test ./web -run TestHistoryCompression -v`.

Fixture JSON de 10 000 événements aux positions et dates distinctes :
1 077 794 octets avant compression, 84 775 octets transférés. Le test compare
les octets décomprimés aux données originales et vérifie les réponses exclues.

## Validation finale

`go test ./...`, `go vet ./...` et `go build ./...` réussis. Build Svelte statique
réussi et test Chromium des chronologies réussi. Les tests SQL couvrent aussi
les filtres, la pagination, les exports au-delà de 500 sessions, les 200 derniers
événements avec égalité de dates, les exclusions de bibliothèque et la liaison
au serveur. Modifications locales seulement, sans publication d'image ni
suppression de données. Validation PostgreSQL réelle non effectuée.
