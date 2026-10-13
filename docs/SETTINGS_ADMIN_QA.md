# Validation finale Paramètres et Administration

Validation finalisée le 10 octobre 2026, sur `codex/frontend-recovery`. Le sous-agent `settings_admin_qa` a créé et exécuté les suites ; l'agent principal a repris les derniers passages après son interruption par la limite d'usage.

## Résultats

| Suite | Résultat | Preuve |
|---|---|---|
| Navigation, assets embarqués, routes, FR/EN, thèmes, responsive, sessions réelles, droits, erreurs et historique | **160/160**, zéro erreur JavaScript | [go-results.json](settings-admin-validation/go-results.json) |
| Formulaires, sauvegardes réelles, relecture API/SQLite, secrets et retours d'erreur | **67/67**, zéro erreur JavaScript | [forms-results.json](settings-admin-validation/forms-results.json) |
| Administration : onglets/clavier, nettoyage, exports, confirmations, plugin et comparaison | **47/47**, zéro erreur JavaScript | [admin-results.json](settings-admin-validation/admin-results.json) |
| Conditions réelles en mode multi | **6/6** | [modes-multi.json](settings-admin-validation/modes-multi.json) |
| Conditions réelles en mode mono | **6/6** | [modes-single.json](settings-admin-validation/modes-single.json) |
| Rendu historique FR | **14/14**, zéro erreur JS ; un appel à la sonde plugin répond 500 | [reference-results.json](settings-admin-validation/reference-results.json) |
| Rendu historique EN | **5/5**, sans erreur JS/HTTP | [reference-en-results.json](settings-admin-validation/reference-en-results.json) |
| Tests Go des packages produit | Réussite | `go test ./internal/... ./web ./cmd/...` |
| Vérification statique Go | Réussite | `go vet ./internal/... ./web ./cmd/...` |
| Compilation du binaire avec assets finaux | Réussite ; hashes servis vérifiés | Lanceur QA et huit contrôles d'assets de `go-results.json` |
| Syntaxe JavaScript et vérification diff | Réussite | `node --check`, `git diff --check` |

Les 286 contrôles navigateur/API ci-dessus correspondent à 160 + 67 + 47 + 6 + 6 assertions ; ce total n'inclut pas les tests unitaires Go ni les 19 rendus historiques. Une relance des formulaires sans réinitialisation des fixtures avait inversé un toggle déjà enregistré. Après relance de `seed.py`, les 67 assertions passent. La procédure reproductible précise cette réinitialisation ; ce cas n'a pas été masqué dans le produit.

Dans la copie historique FR, `/api/admin/plugin/health` a répondu HTTP 500 pendant la comparaison des onglets Santé. Les quatorze pages ont rendu, mais ce passage ne prouve pas le fonctionnement de cette sonde historique. Les suites Go finales ne présentent aucune erreur JavaScript ; les probes Go sont vérifiés séparément par API et tests backend.

## Contrats effectivement vérifiés

- Sept onglets historiques, textes français exacts, états actifs, navigation FR/EN, clair/sombre, viewport mobile sans débordement, retours navigateur et redirections avec remplacement d'historique.
- Refus de lecture et de mutations pour une session utilisateur standard réelle ; menus administrateur masqués et routes directes protégées. Les identités et les rôles ne sont pas interceptés.
- Modification réelle de serveur, conservation de sa clé laissée vide, annulation sans requête, copie répétée de clé plugin stable.
- SSO : groupes enregistrés et relus, secret masqué conservé, configuration inactive maintenue pendant les tests.
- Médias : six groupes de complétion, quatre résolutions, dépendances, limites, exclusions par serveur sans toucher au serveur homonyme, propriétés et scopes orphelins conservés.
- Plannings et Wrapped : sauvegardes indépendantes, calendrier impossible refusé sans changement de base, sections enregistrées préservées. Les cinq tâches manuelles sont présentes ; toutes les opérations de maintenance ne sont pas lancées dans le navigateur. La consommation des plannings est couverte par les tests Go du scheduler.
- Discord : activation et dépendances, tous les champs enregistrés, désactivation sans effacer le webhook. Aucune livraison réelle ni chaîne complète d'alertes automatiques n'est revendiquée.
- Télémétrie et seuils Smart : presets, valeurs et événements enregistrés ; sections médias/plannings inchangées après modification Smart.
- Sauvegardes : création réelle, présence dans la liste, téléchargement ZIP valide, import invalide rejeté. Import/restauration/suppression valides annulés avant requête dans le navigateur ; roundtrip de configuration et tests de sauvegarde sur bases temporaires dans Go.
- Administration : métriques issues des fixtures, trois onglets Santé, trois catégories de nettoyage, clavier, pagination, recherche insensible aux accents, exports complets, protection CSV, détails, mot de confirmation et annulation sans suppression.
- Plugin : seuils locaux, remise à zéro, probe réel, export diagnostique ; heartbeat annulé dans le navigateur et testé avec un receiver synthétique réel dans Go.
- Comparaison : sélection mono/multiple, query préservée, retour arrière, classement limité au scope choisi. Conditions de visibilité et d'ajout de serveur testées dans les deux modes réels.
- Erreurs GET/POST injectées uniquement pour vérifier le comportement de l'interface ; un échec conserve la saisie, affiche une erreur, n'enregistre rien et permet de réessayer. Les suites de persistance utilisent les vraies API.

## Captures comparatives

Jellyfin, bureau sombre — référence puis Go :

![Jellyfin historique](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/settings-admin-captures/main-settings-jellyfin-desktop-dark.png)

![Jellyfin Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/settings-admin-captures/go-settings-jellyfin-desktop-dark.png)

Santé, mobile sombre — référence puis Go :

![Santé historique mobile](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/settings-admin-captures/main-admin-health-mobile-dark.png)

![Santé Go mobile](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/settings-admin-captures/go-admin-health-mobile-dark.png)

Les captures ont été inspectées : hiérarchie, placement des onglets et groupes ont été restaurés ; les jeux de données diffèrent. Quelques espacements, icônes, styles de champs et enveloppes d'onglets mobiles diffèrent encore. L'identité pixel à pixel n'est pas déclarée. Les autres captures FR/EN et clair/sombre sont disponibles dans `settings-admin-captures/`.

## Isolation et limites

Le serveur Go utilise exclusivement `scratch/settings-admin-qa/settings-admin.db`, des identités synthétiques et des serveurs désactivés sur loopback. La référence Next utilise une archive ignorée et un adaptateur Prisma synthétique. Aucune `.env` utilisateur n'est chargée et aucun déploiement Docker n'est remplacé. Les serveurs QA ont été arrêtés à la fin de la validation.

Les opérations destructrices backend testées emploient des bases temporaires et des serveurs HTTP de test. Aucune suppression, consolidation, restauration ou import n'a été lancé sur les données utilisateur. Pas de serveur PostgreSQL, fournisseur OIDC, webhook Discord ou plugin Jellyfin utilisateur utilisé pour une validation externe.

Les écarts fonctionnels complets et l'arborescence comparative sont dans [SETTINGS_ADMIN_RESTORATION.md](SETTINGS_ADMIN_RESTORATION.md). Les scripts et préconditions sont décrits dans [scripts/settings-admin-qa/README.md](../scripts/settings-admin-qa/README.md).
