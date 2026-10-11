# Audit indépendant functional_comparison

Référence `main` a59a286 ; Go initial c4ed749. Lecture du code courant et de `git show main:…`, sans checkout. Aucun AGENTS.md trouvé dans le dépôt ou ses parents. Les rapports précédents servent uniquement d'index : leurs résultats ne sont pas assimilés à une preuve de cette exécution. Aucune comparaison visuelle revendiquée.

## Couverture et limites

Toutes les routes historiques ci-dessous ont une entrée de route Go ou une redirection. « Fidèle source » signifie que les contrôles et le contrat correspondant sont présents au niveau code ; le navigateur, les pixels, le responsive et les services externes restent **Non testé par cet agent**. Une API 200 ne prouve pas une action complète.

| Routes | Contrôles / API inspectés | État fonctionnel source |
|---|---|---|
| `/` | familles multi-sélection, période/custom, scope serveurs, tabs, réorganisation, thermocarte, graphiques/drilldowns, flux cartes/timeline, message/arrêt, prédictions | Fidèle source essentiel ; runtime non testé |
| `/login` | login Jellyfin/local, SSO, remember-me, logout, identité persistée | Adaptation Go documentable (sessions/API auth remplacent NextAuth), tests Go |
| `/setup` | historique redirection `/` ; Go formulaire serveurs puis sync | Différence à documenter : wizard Go ajouté, aucune nécessité architecturale prouvée |
| `/about` | liens GitHub/Jellyfin, informations techniques | Différence justifiée pour stack/version Go ; identité/textes historiques non intégralement restaurés |
| `/recent` | serveur, parents, tri ajout, compteur, pagination40, badges/liens détail | Fidèle source essentiel |
| `/media` | alias catalogue | Présent ; navigation à vérifier |
| `/media/all` | multi-catégories, recherche/clear/debounce, serveur, genre/résolution, tris, pagination50, badges/descendants | Fidèle source essentiel ; règles de résolution héritées des descendants diffèrent volontairement du filtre brut historique |
| `/media/popular` | six classements, détails et liens personnes | **Différence à corriger** : top musique albums au lieu de pistes ; métadonnées épisode au lieu de série |
| `/media/collections` | KPI, bibliothèque/recherche, compte/types, leader/ajout, descendants | **Différence à corriger** : null/boxsets, comptes musique ; regroupement historique normalisé et noms fantômes partiels |
| `/media/analysis` | KPI catalogue/genres/qualité, binge30j, tendances, suggestions, modale personnes, deep | Présent ; **Différence à documenter/corriger** : scores/catégories de suggestions historiques remplacés par demande mesurée |
| `/media/[id]` | hiérarchie, enfants, people/versions via metadata, rotation poster admin, KPI/history/viewers/langues/complétion/télémétrie/filtres | Présent source, tests scope ; Jellyfin metadata réel non testé |
| `/media/artist/[name]` | hero/KPI/albums/pistes, pagination, liens | Fidèle source essentiel ; métadonnées live non testées |
| `/users` | recherche/filtres/inactivité/transcode, tri/pagination, exports, purge | Fidèle source essentiel, tests meaningful-sessions ; purge Jellyfin réel non testé |
| `/users/[id]` | profil/KPI/graphiques, flux actif, historique/filtres/colonnes/exports/préférences, permissions | Fidèle source essentiel ; tests scope et reconfiguration |
| `/wrapped/[userId]` | slides, années/type, timer8s, clavier/config, partage | Présent ; années avec données uniquement vs plage historique continue ; résumé share simplifié ; parité entière non revendiquée |
| `/newsletter` | 30j, top3 média/user, téléchargement image, Discord | Fidèle source essentiel ; envoi Discord réel non testé |
| `/logs` | historique/system tabs, recherche/filtres avancés, colonnes/saved/exports, modale session, logs fichiers/download/clear | Fidèle source essentiel ; tests Go filtrage, fichiers longs, échec suppression |
| `/settings`, `/settings/overview`, `/settings/network` | redirections Jellyfin | Fidèle source (alias dans settings/navigation), runtime non testé |
| `/settings/analytics` | redirection analyses | Fidèle source |
| `/settings/jellyfin` | serveurs/CRUD/fallback/secrets/plugin key | Fidèle source essentiel ; tests CRUD et secret preservation |
| `/settings/media` | exclusions/scopes, badges, complétion/seuils | Fidèle source essentiel ; tests updates partielles/rollback |
| `/settings/plugin` | redirection sécurité | Présent source |
| `/settings/plugin/security` | sessions/revoke, telemetry/presets, smart thresholds | Fidèle source essentiel ; tests transaction/RBAC |
| `/settings/sso` | champs/droits/env lock, secret conservé/callback | Adaptation callback Go documentable ; OIDC réel non testé |
| `/settings/notifications` | Discord, conditions, limite transcode, save | Fidèle source essentiel ; notifications live non testées |
| `/settings/scheduler`, `/settings/scheduler/tasks`, `/settings/scheduler/schedules` | cinq tâches, intervalle/retention, Wrapped window | Fidèle source essentiel ; sync long réelle non testée |
| `/settings/dataBackups` | create/export/history/download/restore/delete/import ZIP | Présent ; restauration production non testée |
| `/admin/health` | tabs health/security/duplicates/logs/anomalies + corrective actions | Présent ; tests données réelles et intégrité |
| `/admin/log-health` | diagnostic/filtrage/pagination | Présent source |
| `/admin/plugin-health` | probe/heartbeat/export, diagnostic | Présent ; receiver simulé testé, plugin réel non testé |
| `/admin/server-compare` | mode multi, scopes, tableau comparatif | Présent ; test scoping24h |
| `/admin/cleanup` | scope serveur, selection/date, confirmation mot, suppression Jellyfin | Présent ; test valide sélection entière/remote failure, suppression réelle non testée |

## Écarts prouvés avant corrections

- **F-POPULAR-MUSIC** : `main:src/app/media/popular/page.tsx` groupe `Audio/Track`, take5 ; `internal/api/media_recovery.go:756` utilise MusicAlbum. Corriger seulement le classement musique. Préserver les albums dans un champ additionnel compatible.
- **F-POPULAR-PEOPLE** : main calcule personnes films + Series parent des épisodes ; Go agrège les personnes du média joué, souvent vides sur Episode. Résoudre la Series dans le même serveur et agréger sa metadata pour les épisodes.
- **F-COLLECTIONS** : main ignore libraryName vide et collectionType boxsets et préfère le nombre de pistes aux albums quand disponibles ; Go inclut ces bibliothèques et compte albums. Corriger sans retirer les compteurs enfants Go. Le mécanisme historique des parents référencés exige lui aussi une ligne parent résolvable ; aucun bug de parent réellement absent n'est établi ici.
- **F-TASTE** : main `tasteInsights.ts` fournit catégorie/titre/raison/score heuristique (genre1 clamp70..99, genre2 clamp50..85, artiste92, fallback80). Go omet ces champs et remplace toute suggestion par « Demande mesurée ». L'absence d'exemples fabriqués en état vide est défendable et déjà testée ; enlever toute la logique historique n'est pas imposé par Go. Différence à documenter explicitement ou restaurer les heuristiques en les nommant score heuristique, sans présenter une probabilité.
- **F-COLLECTION-GROUP** : main normalise les bibliothèques et utilise les noms assainis/ghost library names. Go garde une carte par serveur+nom brut. Peut être utile au multiserveur mais adaptation à documenter, pas identité historique prouvée.
- **F-WRAPPED-YEARS** : main montre chaque année du plus ancien playback à l'année courante ; Go seulement années présentes. Écart vérifié source, aucun argument architectural nécessaire.

## Tests frais

Commande `go test -count=1 ./internal/api ./internal/stats ./internal/auth ./web` : quatre packages PASS (6.102s,3.046s,4.783s,4.898s). Bases temporaires SQLite et Jellyfin HTTP simulé ; aucun service ou donnée production modifié. Tests comprennent API montées/anonyme401/admin200/user403, CSRF403, révocation, isolation utilisateur/serveur, pagination/filtres, zapping, errors remote commandes, metadata whitelist, copies secrets, transactions et sauvegardes via autres packages non exécutés par cet agent.

Ce travail ne mesure aucun pourcentage global de fidélité, ne certifie aucun pixel, ne teste pas PostgreSQL/OIDC/Jellyfin/Discord réels et ne couvre pas tous les états combinatoires de chaque bouton. Correction des trois régressions médias confiée ensuite à cet agent par l'intégrateur ; résultats ajoutés ci-dessous après exécution.

## Corrections réalisées pendant cet audit

Propriétaire de `internal/api/media_recovery.go`, `media_recovery_test.go`, puis `analytics_recovery.go` et `analytics_recovery_test.go` sur années Wrapped uniquement. Aucun commit effectué par l'agent.

- F-POPULAR-MUSIC : `music` reprend les cinq pistes Audio/Track classées par lectures ; le classement albums Go reste disponible dans le champ compatible additionnel `musicAlbums`.
- F-POPULAR-PEOPLE : les lectures Episode créditent les métadonnées de leur Series résolue dans le même serveur ; les films conservent leurs propres métadonnées. Les rankings ne mélangent plus les métadonnées sparse des épisodes avec celles de la Series.
- F-COLLECTIONS : groupes null/vides/boxsets exclus ; comptage musique reprend pistes si présentes, sinon albums. Les données Go `albumCount`, `trackCount`, `ignoredCounts` préservent les comptes distincts.
- F-WRAPPED-YEARS : choix continu de l'année courante à la plus ancienne année de lecture, y compris années sans session. Test de données 2025 vérifie aussi l'année actuelle sans données.
- F-TASTE : champs category/title/reason/badge/scorePercent restaurés selon les heuristiques historiques et nommés `scoreKind=historical_heuristic`. Les demandes mesurées Go sont préservées dans `demandSuggestions` et les champs hours/plays des suggestions. Intégrateur prévenu de consommer ces champs dans le rendu frontend ; cet agent n'a pas édité le frontend. Le fallback Action/SF sans aucune donnée reste absent : différence justifiée afin de ne pas prétendre avoir mesuré une demande sans lectures.

Test de régression ajouté : six pistes du même album dont seulement top cinq visibles, ranking par lectures ; album toujours disponible ; Episode sans People mais Series renseignée ; autre serveur partageant le Jellyfin Series ID ; invalid/boxset media size exclus ; six pistes comptées au lieu d'un album, enfant breakdown intact. `go test -count=1 ./internal/api -run 'TestHistoricalPopular|TestMediaRecovery'` PASS 4.238s. `git diff --check` PASS (avertissements CRLF habituels seulement).

Commande finale ciblée `go test -count=1 -timeout=60s ./internal/api -run 'TestHistoricalPopular|TestMediaRecovery|TestWrappedRestores|TestAcquisitionSuggestions'` : PASS 11.509s. Nouveau test vérifie planchers/plafonds des scores dominants/tendance, score artiste92, immutable measured demand, intégration suggestions+demand et vrai état vide. Le lancement intermédiaire de tout le package API a échoué lors d'une édition simultanée de l'intégrateur (`monthlyDiscordPayload` pas encore ajouté) ; aucune assertion exécutée dans ce lancement, résultat non compté. L'intégrateur exécutera tests/vet/build globaux après consolidation.

Encore partiel : normalisation/groupement noms bibliothèques vs main ; comptes volume/durée des parents Series/Album (Go évite certaines sommes de parents, main additionne champs parents+enfants) ; rendu UI suggestions jusqu'à intégration frontend. Les filtres serveurs multi sont bien présents dans `media-recovery.js` via `serverFilter` et `/api/media/server-options` ; captures les montrant absents doivent vérifier mode/options/scopes runtime, leur absence sur une capture ne prouve pas fonction supprimée.
