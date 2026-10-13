# Validation Médias, Historiques et Dashboard

## Résultats finaux

- `165/165` contrôles navigateur réussis : 155 dans la suite principale et 10 interactions complémentaires. Aucune exception JavaScript non interceptée.
- 13 routes Go, les deux onglets Dashboard, les onglets système/historique et les modales associés testés ; 13 pages main rendues sans pageerror. Le Dashboard historique est réellement hydraté : bouton Modifier l'ordre et ses dix blocs visibles.
- `9/9` assets embarqués HTTP200, SHA-256 identique aux fichiers source testés.
- `go test ./...`, `go vet ./...`, build du serveur isolé, syntaxe Node des quatre fichiers JS modifiés et `git diff --check` : succès lors de l'intégration finale.
- `97` captures PNG livrées. Go : desktop1440, mobile390, thèmes sombre/clair ; pages clés FR/EN. Main : desktop/mobile sombre et onglets Analytics/Network desktop.

Résultats lisibles par machine : [suite Go](media-pages-validation/go-results.json), [interactions](media-pages-validation/interaction-results.json), [référence main](media-pages-validation/reference-results.json). Ces fichiers ont été générés depuis les exécutions réelles, avec leurs contrôles et données observées.

## Périmètre fonctionnel

La suite principale vérifie les routes/API et graphiques, catégories multiples, recherche et effacement, tri, pagination, collections et filtres, personnes/Unicode, détails/série/épisode, événements/modal, historique/colonnes/sauvegardes/export JSON, fichiers journaux/download/confirmations, PNG Newsletter, Wrapped/clavier/configuration/fermeture, chargement retardé, erreur503/retry, thèmes, traductions, anciens paramètres/navigation et restrictions d'un vrai utilisateur standard.

La suite complémentaire applique une période personnalisée, vérifie le titre historique Volume Temporel, clique une vraie tranche FR(aac) et constate l'égalité graphique22/historique22 sur cette fixture. Elle vérifie Wrapped après8s, sa pause pendant configuration, Escape, retour profil et nettoyage après navigation.

Tests Go nouveaux : familles et scopes serveur/utilisateur, recherche Unicode et pagination, vrai binge et absence de fausses suggestions, métadonnées Jellyfin et champs autorisés, Wrapped années/catégories/parents/heures, Newsletter et zapping/téléchargements, filtres/télémétrie/alertes historique, fichiers système et erreurs/suppression/troncature, commandes live et refus distant/collision de session, bande passante inconnue et pause enregistrée, complétion cumulée et égalité des buckets SQL, sessions courtes selon la page, arrondis après somme. Les tests existants d'identité homonyme, auth et paramètres restent inclus dans `go test ./...`.

## Captures comparatives

| Vue | Référence historique | Résultat Go |
|---|---|---|
| Dashboard | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-dashboard-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-dashboard-desktop-dark.png) |
| Analytics | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-dashboard-analytics-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-dashboard-analytics-desktop-dark.png) |
| Network | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-dashboard-network-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-dashboard-network-desktop-dark.png) |
| Ajouts récents | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-recent-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-recent-desktop-dark.png) |
| Catalogue | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-all-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-all-desktop-dark.png) |
| Top contenus | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-popular-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-popular-desktop-dark.png) |
| Collections | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-collections-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-collections-desktop-dark.png) |
| Analyses médias | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-analysis-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-analysis-desktop-dark.png) |
| Film | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-movie-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-qa-primary-movie-desktop-dark.png) |
| Série | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-series-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-qa-primary-series-desktop-dark.png) |
| Épisode | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-episode1-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-qa-primary-episode1-desktop-dark.png) |
| Artiste | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-media-artist-Artiste-QA-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-media-artist-Artiste-QA-desktop-dark.png) |
| Historique | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-logs-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-logs-desktop-dark.png) |
| Newsletter | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-newsletter-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-newsletter-desktop-dark.png) |
| Wrapped | [main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/main-wrapped-alice-desktop-dark.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-captures/go-wrapped-qa-primary-alice-desktop-dark.png) |

Les autres captures montrent les thèmes, tailles, dialogues et états d'interaction. L'export réel [Newsletter PNG](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/media-pages-validation/newsletter.png) provient du Canvas natif, pas d'une capture de la page.

## Isolation et provenance

Go3350 utilise `scratch/media-pages-qa/media-pages.db`,128médias,147lectures,36événements et2flux actifs synthétiques, deux serveurs loopback désactivés. Auth administrateur réelle, session standard signée et stockée ; aucune réponse métier remplacée dans les tests ordinaires. Les interceptions2000ms/503 sont limitées au test explicite de récupération.

Main3341 utilise l'archive ignorée de `main`, ses composants originaux, NextAuth isolé et un adaptateur Prisma de fixture exportée depuis cette même SQLite. Aucune modification des composants pour faire correspondre les captures. Le matcher, les relations, agrégats/groupBy/tri/pagination ont été adaptés aux vraies lignes de fixture ; le cache de données historique a été renommé de façon réversible après changement de fixture. Les premiers résultats devenus périmés ont été remplacés par la dernière exécution.

## Reproduction

À la racine du dépôt, dans PowerShell, avec Go, Python, Node et Playwright disponibles :

```powershell
python scripts/media-pages-qa/seed.py
python scripts/media-pages-qa/run-isolated.py
$env:PLAYWRIGHT_MODULE='C:\Users\Mael\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/media-pages-qa/browser.cjs
node scripts/media-pages-qa/interactions.cjs
python scripts/media-pages-qa/run-isolated.py --stop
```

Le lanceur refuse de rebâtir un serveur QA déjà enregistré. La commande `--stop` vérifie l'identité du processus. Ne pas pointer ces scripts vers une base de production. Ils utilisent des identifiants de test publics destinés uniquement à la fixture locale.

Pour main, l'archive et le runtime de comparaison préexistaient dans `scratch/navigation-qa/main-reference` ; leur préparation dépend des scripts et prérequis décrits dans [la QA des paramètres](../scripts/settings-admin-qa/README.md). Ensuite :

```powershell
python scripts/media-pages-qa/prepare-reference.py
python scripts/settings-admin-qa/run-isolated.py --reference
node scripts/media-pages-qa/reference-captures.cjs
python scripts/settings-admin-qa/run-isolated.py --reference --stop
python scripts/media-pages-qa/make-report.py
```

Si la fixture change, renommer le cache `scratch/navigation-qa/main-reference/.next/dev/cache/fetch-cache` après arrêt du seul runtime QA ; cela évite de comparer les anciens agrégats. Le runtime historique utilise Next16.4.0 disponible dans ce harness, contre16.3.7 dans main. Ce détail empêche une revendication de reproduction binaire identique.

## Limites

- Aucune connexion au Jellyfin/Discord de l'utilisateur. People/versions/repères sont vérifiés par HTTP local et contrôle de données autorisées ; images distantes/rotation réelle/envoi Discord restent à confirmer dans un environnement connecté. Les images absentes sont signalées, pas fabriquées.
- Main fixture ne reproduit pas Valkey, ses requêtes Prisma SQL brutes ni ses fichiers système réels. Certaines métriques externes, le live main et les dialogs système ne peuvent donc pas servir de preuve d'égalité de données. Go live, système et commandes sont vérifiés avec DB/fichiers/HTTP isolés.
- Les comparaisons visuelles confirment les sections, leur ordre, les contrôles et responsive observés. Canvas/Chart.js et SVG/Recharts produisent des ticks, légendes et courbes différents ; aucune identité pixel n'est revendiquée.
- FR/EN et thèmes testés ; langues restantes non parcourues une à une et fallback existant conservé. Certains libellés secondaires hérités demeurent français.
- PostgreSQL et comportement sous charge d'une grosse bibliothèque non exécutés. Les requêtes restent liées au driver existant, les agrégats sont bornés/streamés selon le contrat documenté ; aucun benchmark de performance n'est revendiqué.
