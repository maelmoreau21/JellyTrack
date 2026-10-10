"""Summarize recorded results, rejecting incomplete or failing evidence."""
import hashlib, json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
results=root/'docs/media-pages-validation'
go=json.loads((results/'go-results.json').read_text(encoding='utf-8'))
extra=json.loads((results/'interaction-results.json').read_text(encoding='utf-8'))
reference=json.loads((results/'reference-results.json').read_text(encoding='utf-8'))
for name,report in [('Go',go),('Interactions',extra)]:
    assert report['checks'] and all(c['ok'] for c in report['checks']), name+' has failing checks'
    assert not report.get('fatal') and not report.get('pageErrors'), name+' is incomplete'
assert go.get('complete') and len(go['checks'])==155, 'Go suite did not reach all 155 checks'
assert len(extra['checks'])==10, 'Interaction suite did not reach all 10 checks'
assert len(reference['cases'])==13 and all(c['rendered'] and not c['errors'] for c in reference['cases'])
assert reference['cases'][0].get('overviewHydrated'), 'Historical overview not hydrated'
assets=go['embeddedAssets']
assert all(a['sha256']==a['source'] and a['status']==200 for a in assets)
assert len(assets)==9
assert all(a['source']==hashlib.sha256((root/'web/dist/assets'/a['file']).read_bytes()).hexdigest() for a in assets), 'Assets changed after browser validation'
captures=list((root/'docs/media-pages-captures').glob('*.png'))
total=len(go['checks'])+len(extra['checks'])
rows=[]
for label,old,new in [('Dashboard','dashboard','dashboard'),('Analytics','dashboard-analytics','dashboard-analytics'),('Network','dashboard-network','dashboard-network'),('Ajouts récents','recent','recent'),('Catalogue','media-all','media-all'),('Top contenus','media-popular','media-popular'),('Collections','media-collections','media-collections'),('Analyses médias','media-analysis','media-analysis'),('Film','media-movie','media-qa-primary-movie'),('Série','media-series','media-qa-primary-series'),('Épisode','media-episode1','media-qa-primary-episode1'),('Artiste','media-artist-Artiste-QA','media-artist-Artiste-QA'),('Historique','logs','logs'),('Newsletter','newsletter','newsletter'),('Wrapped','wrapped-alice','wrapped-qa-primary-alice')]:
    a='main-'+old+'-desktop-dark.png';b='go-'+new+'-desktop-dark.png'
    assert (root/'docs/media-pages-captures'/a).exists(),a
    assert (root/'docs/media-pages-captures'/b).exists(),b
    rows.append(f'| {label} | [main](media-pages-captures/{a}) | [Go](media-pages-captures/{b}) |')
doc=f'''# Validation Médias, Historiques et Dashboard

## Résultats finaux

- `{total}/{total}` contrôles navigateur réussis : {len(go['checks'])} dans la suite principale et {len(extra['checks'])} interactions complémentaires. Aucune exception JavaScript non interceptée.
- 13 routes Go, les deux onglets Dashboard, les onglets système/historique et les modales associés testés ; 13 pages main rendues sans pageerror. Le Dashboard historique est réellement hydraté : bouton Modifier l'ordre et ses dix blocs visibles.
- `{len(assets)}/{len(assets)}` assets embarqués HTTP200, SHA-256 identique aux fichiers source testés.
- `go test ./...`, `go vet ./...`, build du serveur isolé, syntaxe Node des quatre fichiers JS modifiés et `git diff --check` : succès lors de l'intégration finale.
- `{len(captures)}` captures PNG livrées. Go : desktop1440, mobile390, thèmes sombre/clair ; pages clés FR/EN. Main : desktop/mobile sombre et onglets Analytics/Network desktop.

Résultats lisibles par machine : [suite Go](media-pages-validation/go-results.json), [interactions](media-pages-validation/interaction-results.json), [référence main](media-pages-validation/reference-results.json). Ces fichiers ont été générés depuis les exécutions réelles, avec leurs contrôles et données observées.

## Périmètre fonctionnel

La suite principale vérifie les routes/API et graphiques, catégories multiples, recherche et effacement, tri, pagination, collections et filtres, personnes/Unicode, détails/série/épisode, événements/modal, historique/colonnes/sauvegardes/export JSON, fichiers journaux/download/confirmations, PNG Newsletter, Wrapped/clavier/configuration/fermeture, chargement retardé, erreur503/retry, thèmes, traductions, anciens paramètres/navigation et restrictions d'un vrai utilisateur standard.

La suite complémentaire applique une période personnalisée, vérifie le titre historique Volume Temporel, clique une vraie tranche FR(aac) et constate l'égalité graphique22/historique22 sur cette fixture. Elle vérifie Wrapped après8s, sa pause pendant configuration, Escape, retour profil et nettoyage après navigation.

Tests Go nouveaux : familles et scopes serveur/utilisateur, recherche Unicode et pagination, vrai binge et absence de fausses suggestions, métadonnées Jellyfin et champs autorisés, Wrapped années/catégories/parents/heures, Newsletter et zapping/téléchargements, filtres/télémétrie/alertes historique, fichiers système et erreurs/suppression/troncature, commandes live et refus distant/collision de session, bande passante inconnue et pause enregistrée, complétion cumulée et égalité des buckets SQL, sessions courtes selon la page, arrondis après somme. Les tests existants d'identité homonyme, auth et paramètres restent inclus dans `go test ./...`.

## Captures comparatives

| Vue | Référence historique | Résultat Go |
|---|---|---|
'''+'\n'.join(rows)+'''

Les autres captures montrent les thèmes, tailles, dialogues et états d'interaction. L'export réel [Newsletter PNG](media-pages-validation/newsletter.png) provient du Canvas natif, pas d'une capture de la page.

## Isolation et provenance

Go3350 utilise `scratch/media-pages-qa/media-pages.db`,128médias,147lectures,36événements et2flux actifs synthétiques, deux serveurs loopback désactivés. Auth administrateur réelle, session standard signée et stockée ; aucune réponse métier remplacée dans les tests ordinaires. Les interceptions2000ms/503 sont limitées au test explicite de récupération.

Main3341 utilise l'archive ignorée de `main`, ses composants originaux, NextAuth isolé et un adaptateur Prisma de fixture exportée depuis cette même SQLite. Aucune modification des composants pour faire correspondre les captures. Le matcher, les relations, agrégats/groupBy/tri/pagination ont été adaptés aux vraies lignes de fixture ; le cache de données historique a été renommé de façon réversible après changement de fixture. Les premiers résultats devenus périmés ont été remplacés par la dernière exécution.

## Reproduction

À la racine du dépôt, dans PowerShell, avec Go, Python, Node et Playwright disponibles :

```powershell
python scripts/media-pages-qa/seed.py
python scripts/media-pages-qa/run-isolated.py
$env:PLAYWRIGHT_MODULE='C:\\Users\\Mael\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright'
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

-Aucune connexion au Jellyfin/Discord de l'utilisateur. People/versions/repères sont vérifiés par HTTP local et contrôle de données autorisées ; images distantes/rotation réelle/envoi Discord restent à confirmer dans un environnement connecté. Les images absentes sont signalées, pas fabriquées.
-Main fixture ne reproduit pas Valkey, ses requêtes Prisma SQL brutes ni ses fichiers système réels. Certaines métriques externes, le live main et les dialogs système ne peuvent donc pas servir de preuve d'égalité de données. Go live, système et commandes sont vérifiés avec DB/fichiers/HTTP isolés.
-Les comparaisons visuelles confirment les sections, leur ordre, les contrôles et responsive observés. Canvas/Chart.js et SVG/Recharts produisent des ticks, légendes et courbes différents ; aucune identité pixel n'est revendiquée.
-FR/EN et thèmes testés ; langues restantes non parcourues une à une et fallback existant conservé. Certains libellés secondaires hérités demeurent français.
-PostgreSQL et comportement sous charge d'une grosse bibliothèque non exécutés. Les requêtes restent liées au driver existant, les agrégats sont bornés/streamés selon le contrat documenté ; aucun benchmark de performance n'est revendiqué.
'''
doc=doc.replace('\n-Aucune','\n- Aucune').replace('\n-Main','\n- Main').replace('\n-Les','\n- Les').replace('\n-FR','\n- FR').replace('\n-PostgreSQL','\n- PostgreSQL')
(root/'docs/MEDIA_PAGES_QA.md').write_text(doc,encoding='utf-8')
print(f'QA report: {total} passing checks, {len(reference["cases"])} main routes, {len(captures)} captures.')
