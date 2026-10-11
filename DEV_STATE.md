# JellyTrack — état de reprise, audit de parité du 10 octobre 2026

## Mise à jour du 11 octobre : bugs de fonctionnement

L’utilisateur considère maintenant la fidélité historique suffisante et demande de traiter les bugs de develop. Lot préparé sur `codex/frontend-recovery` depuis develop `0356455`, sans fusion automatique ni déploiement utilisateur. [Registre des 13 corrections, preuves et limites](docs/runtime-regressions/README.md). 84 contrôles navigateur réussis, tests Go/vet/build et syntaxe JS réussis. Restent la mesure de CPU/RAM sur l’instance réelle et l’examen des anciens orphelins ; aucune donnée historique n’a été supprimée pour faire baisser le compteur. Les constats de parité ci-dessous restent historiques.

Branche : `codex/frontend-recovery`. HEAD initial `c4ed7495c3f420713bbaaabcc337dd47602506db`, référence main `a59a28613e63e86106c61827167d355b47147f42`. Modifications locales seulement ; aucun commit/push/merge. La règle `.claude/rules/instructions.md` interdit ces actions sans demande explicite. Aucun déploiement ni donnée production changé.

## Source de vérité

- `docs/FINAL_PARITY_AUDIT.md` : rapport humain avec routes, corrections, réserves, agents et tests.
- `docs/final-audit/PARITY_MATRIX.json` :45 lignes,16 critères, cinq états et preuves ; ne pas convertir mécaniquement en pourcentage de fidélité.
- `docs/final-audit/TEST_RESULTS.json` et `SOURCE_SNAPSHOT.json` : résultats consolidés et SHA des sources.
- `docs/final-audit/captures/README.md` : captures main/Go et paires. Go initial, previews et Go final sont distincts. Les références utilisent les composants main et un adaptateur Prisma synthétique, pas une base historique native.

## Réalisé

Les cinq sous-agents demandés ont réellement travaillé : visual_comparison, navigation_comparison, functional_comparison, accessibility_responsive, regression_review. Rapports dans `docs/final-audit/*-agent.md`. Propriété des fichiers séparée pendant les corrections, puis freeze. Ne pas annoncer seulement les agents encore visibles dans l'inventaire des agents comme ceux effectivement utilisés.

Corrections : export filtré historique, Discord newsletter, alertes plugin/FPS, PosterRotator scoped, popularité pistes/Series, comptage collections, années Wrapped/heuristiques, callbacks/profil/remember/langue/setup, accessibilité et responsive logs, About et correctifs visuels dashboard/settings/médias/partage Wrapped. Go additions/API/données/migrations/permissions préservés. `/setup` historique redirige désormais `/`, assistant Go conservé `/setup/go`.

Tests frais : Go test/vet/build et JS/diff-check PASS ;686 assertions navigateur PASS,40 parcours Go/160 captures finales/0JSerror,20 assets JS/CSS servis identiques source. Survey responsive126 parcours/714 variantes et focused clavier ; la date du JSON fait autorité. Les preuves sont synthétiques, pas des tests de PostgreSQL, Jellyfin, OIDC ou Discord vivants.

## Réserves à conserver

Regroupement/normalisation de collections et noms fantômes encore différents ; newsletter standard interdite par permission Go conservée ; styles/fallbacks/densité résiduels, Wrapped et filtres utilisateurs mobile ; données Settings et plusieurs graphiques sous écran non comparables/intégralement inspectés. Ne pas prétendre100% de parité. Wrapped18 slides courantes confirmé, ancien16 non reproductible ; aucun exportPNG programmatique historique à restaurer.

## Reproduction

Depuis la racine, PowerShell :

```powershell
go test ./... -count=1 -timeout=120s
go vet ./...
go build ./...
git diff --check
$env:PYTHONUTF8 = '1'
python scripts/media-pages-qa/run-isolated.py
python scripts/final-audit/run-suite.py media
```

Les launchers utilisent les bases synthétiques `scratch/media-pages-qa`3350, `scratch/settings-admin-qa`3340, `scratch/users-qa`3330 et l’archive Next3341. Ils vérifient le PID/chemin avant arrêt et détachent les processus cachés. Seeder uniquement ces fixtures ; jamais `.env` ni base réelle. `run-suite.py` utilise le preload `robust-writes.cjs` pour les verrous Windows et détourne `REFERENCE_ROOT` afin de préserver la fixture comparative main. La suite users recalcule les pics de la fixture temporelle au lieu de figer un jour/une heure ; le test Go d’égalité reste inchangé.

Pour recréer le rapport après validations, `python scripts/final-audit/build-report.py`. Il assemble les preuves existantes, ne lance aucun test. Ne pas l’exécuter pendant des suites en cours. Les anciens répertoires QA suivis par Git sont restaurés après copie des preuves fraîches dans final-audit ; ne pas écraser une modification utilisateur lors d’une autre session.
