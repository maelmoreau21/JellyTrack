# JellyTrack — audit final de parité historique

Audit du 10 octobre 2026, `codex/frontend-recovery`, HEAD initial **c4ed7495c3f420713bbaaabcc337dd47602506db**, comparé à `main` **a59a28613e63e86106c61827167d355b47147f42**. Les corrections décrites sont locales, non commitées. [Empreintes des sources auditées](final-audit/SOURCE_SNAPSHOT.json).

Vérification GitHub en fin d’audit : `main` distant correspond exactement à cette référence. `codex/frontend-recovery` distant est `9835d85d6f7afd571a7896ed672e0afa68ddc9b5` ; la branche locale auditée possède trois commits antérieurs supplémentaires (`0c658f0`, `79f69db`, `c4ed749`) et aucun retard. Ces commits préexistaient à cet audit ; aucun push n’a été effectué. [Preuve des références distantes](final-audit/REMOTE_REFS.json).

**La parité reste partielle.** Toutes les routes historiques ont été inventoriées et leurs chemins exercés ; des régressions fonctionnelles importantes sont corrigées. Des différences visuelles, le regroupement des bibliothèques et une différence de permission restent ouverts. Aucun pourcentage global de fidélité n’est démontré : compter les routes ou les assertions ne mesure pas la fidélité de tous les écrans et comportements.

## 1. Routes comparées

**36 routes historiques**, **9 chemins Go supplémentaires ou candidats**, soit **45 lignes dans la matrice**. Les paramètres dynamiques sont comparés sur des identités correspondantes : `alice` ↔ `qa-primary-alice`, IDs Jellyfin ↔ IDs internes Go. Le détail média couvre film, série, épisode, album et livre ; le détail artiste utilise Artiste QA.

| Famille | Routes historiques exhaustives |
|---|---|
| Général | `/`, `/about`, `/login`, `/setup`, `/recent`, `/logs`, `/newsletter` |
| Médias | `/media`, `/media/all`, `/media/popular`, `/media/analysis`, `/media/collections`, `/media/[id]`, `/media/artist/[name]` |
| Utilisateurs | `/users`, `/users/[id]`, `/wrapped/[userId]` |
| Paramètres | `/settings`, `/settings/jellyfin`, `/settings/sso`, `/settings/plugin`, `/settings/plugin/security`, `/settings/media`, `/settings/scheduler`, `/settings/scheduler/tasks`, `/settings/scheduler/schedules`, `/settings/dataBackups`, `/settings/notifications`, `/settings/analytics`, `/settings/network`, `/settings/overview` |
| Administration | `/admin/health`, `/admin/log-health`, `/admin/plugin-health`, `/admin/server-compare`, `/admin/cleanup` |

Les chemins Go sont `/settings/go-overview`, `/settings/go-network`, `/admin/system-health`, `/admin/log-diagnostics`, `/admin/plugin-diagnostics`, `/admin/maintenance`, `/wrapped`, `/dashboard`, `/setup/go`. `/dashboard` est un fallback protégé, sans branche ni lien dédiés ; `/charts` n’est pas une route déclarée et n’est pas compté.

Navigation admin : compte → tableau de bord → récemment ajoutés → bibliothèque → utilisateurs → santé → journaux → paramètres → comparaison des serveurs en mode multi. Navigation standard : compte → bibliothèque → récemment ajoutés → Wrapped selon visibilité/calendrier. Onglets médias : Tous → Populaires → Analyse admin → Collections. Paramètres : Jellyfin → SSO → Sécurité → Médias → Planificateur → Sauvegardes → Notifications. Les compléments Go restent dans leur groupe distinct.

Les alias historiques sont vérifiés. `/settings/plugin` est un écran autonome qui réutilise les réglages Jellyfin, pas une redirection historique. `/setup` retrouve sa redirection vers `/` après la garde d’authentification ; l’assistant Go reste disponible sous `/setup/go`, avec les API et autorisations de mutation existantes.

API : **49 fichiers historiques, 67 méthodes exportées**, dont **65 méthodes hors NextAuth présentes dans le registre Go**. Les deux méthodes catchall NextAuth sont remplacées par les sessions/OIDC Go. L’inventaire ne prouve pas à lui seul l’équivalence de chaque payload ou effet externe. [Inventaire complet des pages et API](final-audit/ROUTES.md), [données structurées](final-audit/routes.json).

## 2. Matrice de contrôle

[Matrice lisible](final-audit/PARITY_MATRIX.md) · [CSV](final-audit/PARITY_MATRIX.csv) · [JSON avec preuves et réserves](final-audit/PARITY_MATRIX.json).

Chaque ligne contient les **16 critères demandés** : présence, position, parent, apparence, sections, ordre, textes, icônes, tableaux, graphiques, filtres, boutons, interactions, données, permissions, responsive. Les cinq états restent distincts : Identique ou fidèle ; Différence justifiée ; Différence à corriger ; Fonctionnalité manquante ; Non testé.

Sur720 cellules :372 fidèles,88 différences justifiées,63 différences à corriger,197 non testées/sans objet,0 fonctionnalité encore classée manquante parmi les constats validés. Ces cellules ne constituent pas un pourcentage global : chaque critère n’a ni le même poids ni le même nombre d’états possibles.

« Fidèle » peut établir une présence/absence identique dans les sources ou un comportement ciblé exécuté ; cela ne certifie pas toutes les variantes combinatoires. Les champs Données/Graphiques restent prudents lorsque la fixture ou le contrôle ne démontre pas leur équivalence. Pour les compléments sans équivalent historique, la comparaison historique est sans objet et est explicitement décrite ; leur fonctionnement courant a été contrôlé séparément.

## 3. Différences corrigées et bilan des régressions

| ID | Correction | Preuve principale |
|---|---|---|
| RR-01 | Export journaux : mêmes filtres que l’écran, CSV17 colonnes et JSON historiques, secondes, tous les résultats, pas de limite10 000 ni30 jours implicites ; fallback audio actif scoped ; protection CSV conservée | Tests `history_export_test.go`, téléchargement réel `final-controls.json` |
| RR-02 | Newsletter Discord : exclusions zapping, podium3 médias, top utilisateur par ID, heures arrondies et plage datée ; contenu personnalisé Go conservé | `newsletter_discord_test.go`, transport simulé |
| RR-03 | Réglages Discord du plugin retrouvent leur effet : ALL, TRANSCODE_ONLY, NEW_IP_ONLY, seuil de capacité strictement supérieur ; timeout/URL validés, rejeux sans double alerte | `notifications_test.go`, aucun envoi réel |
| RR-04 | FPS de transcodage ingérés sur start/progress, aliases acceptés et valeur conservée si champ absent | Tests plugin |
| RR-05 | Poster Rotator : body.serverId respecté, IDs UUID normalisés, bon serveur choisi, tous2xx acceptés et erreurs de pool reconnues | Deux serveurs HTTP de test, `poster_rotator_test.go` |
| F-01 | Popularité musique : top5 pistes Audio/Track ; classement albums Go préservé séparément | Six pistes de test, dont top5 uniquement |
| F-02 | Personnes populaires : métadonnées de Series pour les épisodes, résolution du parent dans le même serveur | Test avec IDs Jellyfin partagés entre serveurs |
| F-03 | Bibliothèques : noms vides/null et boxsets exclus, pistes préférées aux albums pour le comptage, breakdowns Go préservés ; KPI2 colonnes | Tests médias et captures |
| F-04 | Années Wrapped : intervalle continu jusqu’à l’année courante, années vides incluses | Test API Wrapped |
| F-05 | Suggestions : catégories/titres/raisons/badges/scores historiques restaurés, scores explicitement heuristiques ; demandes mesurées Go conservées | Tests analytics/médias |
| F-06 | Filtre serveurs : fallback historique vers tous les serveurs lorsque tous sont désactivés | `final_audit_test.go` |
| N-01 | `/users` standard renvoie au profil ; callback de connexion conserve chemin/query et rejette un retour externe | Sources main, contrôles navigateur réels |
| N-02 | Remember30 jours rétabli, champs login étiquetés, langue initiale cookie/navigateur avec préférence Go persistée prioritaire | `final-controls.json` |
| N-03 | Rayon historique des onglets paramètres ; redirection `/setup` restaurée, assistant Go préservé | CSS source, test natif |
| A-01 | `/logs` : le conteneur s’adapte à320/390/768/1440 ; le tableau conserve son défilement interne | Mesures et captures responsive |
| A-02 | Noms des dialogues profil/journaux/admin, confinement du focus mobile, Escape et retour du focus langue/menu | `accessibility-focused-final.json`, arbre accessible |
| V-01 | About : identité, ordre,11 fonctionnalités et6 cartes techniques restaurés ; pile Go/version réelle documentées | Captures main/Go et module About |
| V-02 | Dashboard : conteneurs filtres/KPI, tailles et imbrication plus fidèles | CSS et captures natives finales |
| V-03 | SSO : statut/Actualiser et switches à leur place, inputs toujours associés au formulaire ; sauvegardes : nesting, tailles et import violet |26 contrôles natifs résidus, formulaires réels |
| V-04 | Sécurité4 colonnes ; tâches : icônes/horloges/pillules/couleurs ; save gauche, Notifications haut de page ; onglets santé/nettoyage étendus |27 contrôles natifs géométrie et suites Settings |
| V-05 | Médias : textes populaires sans clés brutes/objets, rangs/médailles ; analyse3 sous-cartes et libellés qualité ; épisode paysage ; artiste carré160/titre30 ; KPI détail historiques |36 previews +2 ciblées, captures natives finales et suite médias |
| V-06 | Wrapped : dégradés des slides, introduction et carte de partage avec heure/jour/heures par catégorie ; copie Go conservée | Constructeur18 slides, preview et compteur natif1/18 |

Les doublons signalés par plusieurs agents sont réunis dans ces IDs. **Les cinq régressions RR validées ont une correction et des tests.** Aucun nouveau défaut fonctionnel n’est signalé par les suites finales ; cette absence observée n’est pas une preuve de couverture universelle.

L’ancien compteur Wrapped1/16 a été constaté sur une capture antérieure, puis n’a plus été reproduit. Les18 slides existent dans le constructeur et sur l’API Alice courante ; le navigateur final affiche1/18. Il n’est pas présenté comme deux fonctionnalités supprimées. Aucun bouton exportPNG historique ni slide langue préférée n’existe dans cette référence ; leur absence n’est pas une régression.

## 4. Différences restantes et raisons

| Surface | État | Raison précise / travail restant |
|---|---|---|
| Collections | Différence à corriger | Go conserve une carte par serveur+nom, au lieu du regroupement historique normalisé et des noms de bibliothèques fantômes. Restaurer ce regroupement exige de conserver le scoping et les breakdowns Go ; il n’a pas été remplacé sans preuve suffisante des cas de collision/exclusion.8 cartes QA contre4 main. |
| Newsletter standard | Différence à corriger | Main autorise la lecture standard, Go la réserve à l’admin. L’interdiction existante est conservée conformément à la demande de préserver les permissions. Ce n’est pas une nécessité architecturale démontrée. |
| Dashboard, catalogue, récents, journaux, newsletter, comparateur/nettoyage | Différence à corriger | Densité, détails d’espacement, certaines icônes/couleurs/fallbacks et tableau vide ne sont pas tous fidèles. Les captures finales exposent ces différences ; pas de réécriture globale pour masquer les résidus. |
| Détail média | Différence à corriger / justifiée pour champs Go | Poster fallback et en-tête restent différents. Les métadonnées supplémentaires Go conservées augmentent la hauteur : données nouvelles préservées, placement encore perfectible. |
| Profil/graphes | Non testé partiellement |5 graphiques Go présents et testés ;7 SVG dans la capture main ne prouvent pas automatiquement7 graphiques indépendants. Totalité des visualisations et flux sous écran non comparée intégralement. |
| Wrapped | Différence à corriger visuellement |Fonds et contenu restaurés ; forme de certaines icônes, alignement vertical et contrôles supplémentaires diffèrent encore. Les18 slides ne certifient pas chaque pixel ni chaque interaction de partage. |
| Utilisateurs mobile | Différence à corriger |Les filtres ne reviennent pas exactement à la ligne comme main ; pas de débordement document permanent dans les contrôles finaux. |
| Données Settings et certains états dashboard/profil | Non testé |L’adaptateur historique fournit d’autres configurations Settings ; le cache/SSR historique et les flux simulés empêchent une comparaison exacte de ces valeurs. |
| Services et déploiement réels | Non testé |Pas de Jellyfin, fournisseur OIDC, Discord ou Poster Rotator vivants ni PostgreSQL exécuté. Tests HTTP simulés/SQLite ; ni données production, ni migrations production, ni conteneur actif modifiés. |
| Accessibilité complète | Non testé |Clavier, focus, noms et géométrie contrôlés ; pas de certification WCAG, axe complet ou lecteur d’écran. |

Adaptations justifiées : Next/React/Prisma/NextAuth/Recharts/cron deviennent Go/embed/SQLite-PostgreSQL/sessions-OIDC/Chart.js/scheduler, sans modifier l’identité historique des pages ; IDs internes Go tout en conservant les IDs Jellyfin ; callback OIDC Go ; fonctions supplémentaires regroupées en Compléments Go. Les volumes/durées évitent le double comptage des parents. Les suggestions vides restent réellement vides au lieu d’exemples inventés. NEW_IP_ONLY exclut la lecture tout juste insérée pour reconnaître une première IP et évite les doublons de notification. Ces adaptations sont documentées et ne justifient pas les autres dérives visuelles.

## 5. Captures et conditions de comparaison

[Index des40 parcours comparatifs et des variantes](final-audit/captures/README.md). Référence et Go ont été démarrés : FR, rôle administrateur,1440×900 et390×844, sombre/clair. **160 captures main et160 captures Go finales**, plus captures initiales Go, previews, contrôles ciblés et compléments Go. Les paires ne montrent que le haut du viewport ; les captures originales fullPage restent disponibles.

Fixture comparable médias :4 utilisateurs,2 serveurs,128 médias,147 lectures,36 événements,2 flux. Même export synthétique côté adaptateur Prisma et SQLite Go ; paramètres Settings ne sont pas identiques. La référence utilise ses composants main :144/145 fichiers TSX/CSS identiques après normalisation des fins de ligne ; seul le chargement des sources Tailwind est adapté au banc. Version Next du banc16.4 contre16.3.7 historique. [Intégrité](final-audit/visual-integrity.json), [capture main](final-audit/visual-results.json), [capture Go finale](final-audit/visual-final-results.json).

Les cinq agents distinguent captures vues et contrôles source. Le principal a également ouvert des paires finales dashboard, SSO, analyse, About, épisode et Wrapped mobile. Les différences du haut de ces écrans ont réellement été examinées ; aucune prétention de comparaison complète de tous les graphiques ou toutes les slides hors écran.

Limites main visibles : erreur SSR `window is not defined` sur utilisateurs/journaux suivie d’un rendu client ; overlay développement ; dashboard initial cache/identité sidebar incomplets ; le pilotage de la classe `dark` ne synchronise pas toujours le texte interne du bouton thème Next. Elles sont signalées et ne sont pas imputées au Go. La capture dashboard main tardive de `/setup` et le DOM du rafraîchissement dashboard affichent75 lectures comme Go, contre68 sur la première capture. Les nouvelles images `main-refresh-*` exposent aussi une transition skeleton HMR et un setup sans contenu ; elles sont conservées comme diagnostics et ne sont pas revendiquées comme comparaisons stabilisées.

## 6. Tests et vérifications

[Résultats consolidés](final-audit/TEST_RESULTS.json), [journal Go](final-audit/go-test.txt), [empreintes natives de20 assets](final-audit/go-extras.json).

- `go test ./... -count=1 -timeout=120s` : **PASS** ; bases temporaires, contrats/ACL/CSRF, nouveaux tests export/Discord/plugin/PosterRotator/médias. Le parcours `./...` inclut également un paquet sans tests dans le scratch Next ignoré, sans incidence sur le résultat des paquets JellyTrack.
- `go vet ./...`, `go build ./...`, syntaxe de tous les JS embarqués et `git diff --check` : **PASS**. Les avertissements LF/CRLF Windows ne sont pas des erreurs de validation.
- Suites navigateur : médias155 + interactions10 ; utilisateurs109 ; Settings/Admin280 ; contrôles finaux et géométrie70 ; compléments/empreintes62 : **686 assertions,0 échec**. Les sous-comptes JSON font autorité ; la géométrie native de27 contrôles remplace le preview initial26.
- Accessibilité/responsive : **126 parcours,714 variantes**, admin/standard/anonyme,320/390/768/1440, sombre/clair pour les rôles connectés ;0 erreur JavaScript,0 échec de parcours,0 débordement permanent document/main constaté. Focus et dialogues ont aussi une revalidation ciblée.
- Captures finales Go :40 parcours rendus,0 erreur JavaScript. Les20 fichiers JS/CSS servis ont les mêmes SHA256 que les sources figées.

Les erreurs HTTP sont conservées dans les JSON : avatar404 de fixture sans image, Wrapped du local-admin404 sans historique, anonymes401 et restrictions403 attendues. Un200 de route n’est pas à lui seul une validation d’action ; les tableaux de contrats distinguent présence, effets simulés et services non testés. Les liens externes et tous les états combinatoires de chaque bouton n’ont pas fait l’objet d’un crawler exhaustif.

Échecs intermédiaires du banc : verrous Windows `UNKNOWN` sur JSON/PNG, attente `networkidle` sur une page avec polling, ancienne attente `/users`→login et pics horaires figés sur une fixture relative au temps. Écritures atomiques/retries bornés, attentes de vrais contrôles, correction de l’attente selon main et calcul indépendant depuis la fixture. Le test Go de départage des égalités est conservé. Les contrôles concernés ont été rejoués ; aucun échec n’a été supprimé du verdict sans explication.

## 7. Sous-agents réellement utilisés

La limite de concurrence est4 avec le principal : les cinq missions ont été lancées en plusieurs vagues. Une reprise interrompue par quota a été signalée ; les agents ont repris après disponibilité, et le principal a exécuté les validations natives finales.

| Nom exact | Mission et conclusion consolidée | Rapport |
|---|---|---|
| `visual_comparison` |40 parcours capturés, dérives de structure/espacement détectées ; correctifs Settings/Admin ciblés, dont SSO/Backups/Média. Données et intégrations non certifiées. |[rapport](final-audit/visual-agent.md) |
| `navigation_comparison` |36 pages, menus/onglets/aliases/permissions source ; défaut profil/callback et accès newsletter ; About/intro Wrapped corrigés puis carte/fonds.18 slides confirmées, pas2 slides manquantes prouvées. |[rapport](final-audit/navigation-agent.md), [Wrapped](final-audit/wrapped-review.md) |
| `functional_comparison` |Contrats/boutons/API source et tests Go ; musique pistes, metadata Series scoped, collections, heuristiques et années Wrapped corrigés. Regroupement bibliothèques restant. |[rapport](final-audit/functional-agent.md) |
| `accessibility_responsive` |Responsive/clavier/roles réels, logs/focus/dialogues ; faux positifs éliminés. Reprise sur défauts médias : analyse/détails/artistes/popularité corrigés, previews bornés. |[rapport](final-audit/accessibility-agent.md) |
| `regression_review` |Revue indépendante des fonctionnalités endommagées : cinq RR confirmées ; alertes plugin/FPS corrigés par cet agent, autres corrections par le principal. |[rapport](final-audit/regression-agent.md) |

## 8. Conservation et reproductibilité

Aucun remplacement de déploiement, aucune base utilisateur, aucune migration ou permission API modifiée. Serviteurs de test isolés dans `scratch/`, identifiants synthétiques ; notifications réelles désactivées. Les archives de QA précédentes du dépôt sont restaurées après copie des preuves fraîches dans `docs/final-audit/`.

Le workflow utilise `$codex-token-saver` : inventaires uniques partagés, lectures ciblées, tâches bornées et ownership de fichiers, preuves JSON réutilisées, reprise des seuls tests en échec puis validation du binaire figé. Aucun taux d’économie de tokens n’est annoncé sans mesure. Les scripts reproductibles se trouvent dans `scripts/final-audit/` ; les fixtures et runtimes locaux requis sont explicités par les launchers existants. [État de reprise](../DEV_STATE.md).

## 9. Commits

**0 commit,0 push,0 merge, aucune nouvelle branche.** La règle applicable [.claude/rules/instructions.md](../.claude/rules/instructions.md) dit : « Do not commit, push, create branches, or merge without an explicit user request. » La demande de lister les commits réalisés a été traitée comme une exigence de rapport, sans inventer une autorisation de commit. Les modifications et preuves sont disponibles dans le working tree de `codex/frontend-recovery` pour revue.
