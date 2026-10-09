# Restauration Paramètres et Administration

Branche de travail : `codex/frontend-recovery`. Référence historique en lecture seule : `main`, commit `a59a28613e63e86106c61827167d355b47147f42`. Bilan finalisé le 10 octobre 2026.

Les interfaces utilisent des données Go réelles. Les sauvegardes des formulaires sont vérifiées par relecture ; une erreur HTTP ou une valeur non enregistrée reste une erreur visible. La présence d'un formulaire ne prouve pas, à elle seule, la parité de tous les traitements externes décrits dans les limites ci-dessous.

## Arborescence comparative

| Structure historique main | Structure restaurée Go |
|---|---|
| Sidebar : Paramètres → layout / ClientLayout | Sidebar : Paramètres → sept onglets dans le contenu |
| Jellyfin → cartes des serveurs → connexion plugin | `/settings/jellyfin` : mêmes groupes, modification, copie URL/clé, visibilité et renouvellement explicite |
| SSO → configuration → groupes et rôles | `/settings/sso` : résumés, callback, configuration, groupes, champs contrôlés par l'environnement |
| Sécurité → état plugin → télémétrie → seuils Smart | `/settings/plugin/security` : même succession et mêmes contrôles |
| Paramètres Média → diagnostics → exclusions → règles → résolutions | `/settings/media` : exclusions par serveur et bibliothèque, règles imbriquées, six catégories, quatre résolutions |
| Planificateur de Tâches → tâches → plannings → Wrapped | `/settings/scheduler` : sections empilées dans cet ordre ; `/tasks` et `/schedules` rendent leurs sections propres |
| Sauvegardes de Données → actions → résumés → historique → import | `/settings/dataBackups` : même structure, actions et confirmations |
| Notifications → activation Discord → champs conditionnels | `/settings/notifications` : webhook, condition et seuil de transcodages, enregistrement réel |
| Sidebar : Santé → quatre métriques → Nettoyage & Stockage | `/admin/health` → nettoyage imbriqué complet |
| Nettoyage → Médias Fantômes / Médias Abandonnés / Doublons | Même ordre, filtres, détails, sélection, pagination et exports |
| Santé → Sécurité & Anomalies → plugin embarqué | Anomalies réelles puis état plugin et contrôles embarqués |
| Santé → Moteur & Logs | Résumés, graphiques, lectures orphelines, fermetures et exclusions |
| `/admin/cleanup` → CleanupClient complet | Assistant de Nettoyage complet ; maintenance Go supplémentaire repliable |
| Sidebar : Comparaison de serveurs, seulement en mode multi | `/admin/server-compare` : sélection, métriques 24 h, graphiques et classement ; ancien inventaire Go secondaire |

Il n'existe pas de menu générique Administration ajouté à la hiérarchie historique. Les intitulés des sept onglets sont **Jellyfin**, **SSO**, **Sécurité**, **Paramètres Média**, **Planificateur de Tâches**, **Sauvegardes de Données**, **Notifications**. Les trois onglets Santé sont **Nettoyage & Stockage**, **Sécurité & Anomalies**, **Moteur & Logs**.

Les anciennes adresses gardent leurs comportements historiques : `/settings`, `/settings/overview` et `/settings/network` mènent à Jellyfin ; `/settings/analytics` mène à `/media/analysis` ; `/settings/plugin` rend les serveurs Jellyfin. `/admin/log-health` et `/admin/plugin-health` redirigent vers `/admin/health`. Les redirections remplacent l'entrée d'historique. La redirection racine Paramètres conserve sa query string.

Les fonctionnalités Go supplémentaires restent dans « Compléments Go » ou dans des groupes secondaires : `/settings/go-overview`, `/settings/go-network`, `/admin/system-health`, `/admin/log-diagnostics`, `/admin/plugin-diagnostics`, `/admin/maintenance`, inventaire de comparaison, langue/format horaire et politique des sessions longues. Les décisions sur les anciennes adresses remplacent celles décrites dans le rapport de navigation précédent.

## Intégration et données

- Modules d'interface : `web/dist/assets/settings.js`, `settings.css`, `admin.js`, `admin.css`. L'agent principal intègre leur chargement, le routeur, les styles partagés et les liens secondaires.
- Routes existantes vérifiées puis enrichies : sauvegarde partielle et atomique des réglages, fusion des propriétés non affichées, validation des types et valeurs, préservation des secrets SSO et Jellyfin laissés inchangés. Une erreur d'écriture ne produit pas de faux succès.
- Les clés plugin sont compatibles avec le receiver Go. Copier une clé serveur ne renouvelle pas la clé globale. Le renouvellement explicite garde le contrat historique et la période de grâce ; aucun hash stocké n'est présenté comme une clé utilisable.
- Les serveurs ont des probes réelles avec timeout et une identité Jellyfin réellement détectée à l'ajout. Le formulaire signale les erreurs de connexion.
- Les réglages SSO enregistrés sont lus par l'authentification ; les valeurs imposées dans l'environnement gardent leur priorité. Aucun login réel auprès d'Authentik n'a été exécuté.
- Le scheduler relit les plannings enregistrés pendant son exécution, sans redémarrage nécessaire. Le calendrier et les ancrages suivent le générateur historique, y compris son comportement particulier pour certains intervalles.
- Les sauvegardes incluent désormais les sections SSO, plugin, télémétrie, médias et plannings. Une restauration ancienne préserve les sections absentes du fichier. Des tests sur bases temporaires vérifient la conservation des secrets et de la configuration.
- Le nettoyage sélectionné vérifie tous les identifiants avant tout appel distant. La base n'est modifiée que pour les suppressions confirmées par Jellyfin. Ses tests de suppression utilisent exclusivement un serveur HTTP synthétique et des bases temporaires.
- Les probes et heartbeats administratifs utilisent le receiver réel. Les métriques inconnues restent absentes ou N/A, au lieu de produire des résultats fictifs.

## Validation et preuves

Les **286 contrôles navigateur/API passent**, sans erreur JavaScript : navigation 160, formulaires 67, administration 47, modes mono et multi 6 chacun. Tests Go, vérification statique et compilation passent également. Le détail des résultats se trouve dans [SETTINGS_ADMIN_QA.md](SETTINGS_ADMIN_QA.md), les rapports JSON dans `settings-admin-validation/` et les 79 captures dans `settings-admin-captures/`. Les scripts reproductibles sont dans `scripts/settings-admin-qa/`.

Les tests navigateur couvrent les onglets et sous-menus, états actifs, retour arrière, formulaires avec relecture API et SQLite, sauvegarde/refus/erreur, boutons, copie, chargement, retry, clavier, responsive, FR/EN, thèmes clair/sombre et rôles réels. Ils comparent aussi le hash des assets servis par le binaire avec les fichiers finaux.

Les captures historiques sont exécutées depuis une archive isolée de `main` avec un adaptateur Prisma synthétique ; elles ne consultent aucune base utilisateur. La référence de test utilise Next 16.4.0 alors que le manifeste historique demandait 16.3.7. Quatorze routes FR et cinq routes EN ont rendu sans erreur JavaScript ; un appel à la sonde plugin de la copie historique FR a répondu HTTP 500, limitation conservée dans le rapport. Les captures principales main/Go Jellyfin ont été inspectées : position des onglets et de la carte restaurée, même hiérarchie serveur/plugin ; leurs données synthétiques diffèrent.

Les tests Go couvrent les contrats API, erreurs de validation, transaction/rollback, préservation des secrets, résolution SSO, plannings dynamiques, rétention des logs uniquement dans un répertoire temporaire, configuration de sauvegarde et administration. Aucun nettoyage, import, restauration, suppression de serveur ou révocation de session n'a été exécuté sur les données utilisateur. Les confirmations destructrices du navigateur sont annulées avant requête.

## Écarts persistants et limites

1. **Notifications** : le formulaire, ses dépendances et sa sauvegarde sont restaurés. Le moteur Go ne possède pas encore toute la chaîne historique d'alertes Discord automatiques liée aux lectures, aux nouvelles IP et au nombre de transcodages. La livraison automatique n'est donc pas déclarée restaurée.
2. **Télémétrie du plugin** : profils, valeurs, événements et sauvegarde sont restaurés ; l'application de tous ces réglages par un plugin Jellyfin externe et la parité complète de fusion des reprises ne sont pas démontrées. Le receiver Go conserve ses traitements existants.
3. **Santé plugin** : le taux global de succès d'ingestion reste N/A faute de compteurs persistés exhaustifs. Les sondes, erreurs disponibles et métriques de heartbeat ne sont pas simulées.
4. **Services externes** : pas de validation avec un Jellyfin utilisateur, un fournisseur OIDC réel ou un webhook Discord réel. Connexions et suppressions testées seulement avec des serveurs HTTP synthétiques ; aucun appel destructif utilisateur.
5. **PostgreSQL** : les expressions sensibles ont des tests de génération/parsing ; aucune instance PostgreSQL réelle n'a été lancée. La validation d'exécution porte sur SQLite.
6. **Rendu** : composants reconstruits en HTML/JavaScript/CSS et Chart.js à partir du code historique. Les captures confirment la structure et les corrections visuelles ; elles ne prouvent pas une identité pixel à pixel avec React/Radix/Recharts. Quelques textes de doublons autrefois français en dur sont traduits en anglais dans Go.

## Sous-agents réellement exécutés

| Agent | Périmètre attribué | Livrable |
|---|---|---|
| `settings_reference` | Sources historiques settings, composants, styles, traductions et API ; lecture seule de main | [SETTINGS_REFERENCE.md](SETTINGS_REFERENCE.md) |
| `admin_reference` | Administration historique, hiérarchie, composants et comportements ; lecture seule de main | [ADMIN_REFERENCE.md](ADMIN_REFERENCE.md) |
| `settings_implementation` | Module et styles Paramètres | [SETTINGS_IMPLEMENTATION.md](SETTINGS_IMPLEMENTATION.md) |
| `admin_implementation` | Module et styles Administration, contrats backend administratifs et tests | [ADMIN_IMPLEMENTATION.md](ADMIN_IMPLEMENTATION.md) |
| `settings_admin_qa` | Bases/serveurs isolés, scripts, captures, permissions et tests navigateur | [SETTINGS_ADMIN_QA.md](SETTINGS_ADMIN_QA.md) |

Les fichiers ont été répartis avant l'implémentation. Les cinq agents ont réellement exécuté leur travail ; le dernier passage des agents administration et QA a atteint la limite d'usage. L'agent principal a repris la finalisation et les vérifications après leur interruption.

La skill `codex-token-saver` a servi à réutiliser les audits, borner les lectures, répartir les fichiers et conserver des rapports compacts. Aucun pourcentage d'économie de tokens n'est revendiqué.
