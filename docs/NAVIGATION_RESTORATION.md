# Restauration de la navigation historique

Référence : `main`, commit `a59a28613e63e86106c61827167d355b47147f42`. Travail : `codex/frontend-recovery`, état initial `b00d986`. La branche `main` n'a pas été modifiée.

L'ancienne Sidebar est **plate**. Les hiérarchies historiques se trouvent dans le contenu : Bibliothèque, Paramètres, Santé puis Nettoyage. La restauration conserve cette distinction ; elle n'invente aucun sous-menu latéral Médias ou Planificateur.

## Matrice élément par élément

« Go avant » décrit le shell avant cette intervention. Les rangs admin supposent un compte Jellyfin lié ; sans compte lié, les autres liens remontent d'un rang. Les intitulés ci-dessous sont ceux du dictionnaire français de `main`.

| Ancien élément | Position historique | Parent / sous-menu | Visibilité | Comportement | État Go avant | Correction réalisée |
|---|---|---|---|---|---|---|
| Sidebar | Gauche, hauteur écran, 256 px | Shell | Hors pages Connexion et Wrapped | Défilement du corps, pied fixe | 270 px, organisation par sections | 256 px, même disposition générale |
| Sidebar réduite | Même place, 80 px | Shell | Desktop ; préférence persistée | Liens carrés 40 px, labels masqués | 76 px ; contrôles masqués | 80 px ; langue, recherche, version conservées |
| Logo JellyTrack | En-tête, 64 px | Shell | Sidebar visible | Admin → `/`, utilisateur → son compte, fallback → bibliothèque | Logo différent, destination `/` | SVG historique, destination selon identité |
| Réduire / agrandir | À droite du logo | En-tête | Desktop, dès 768 px | Chevron, clé `jellytrack_sidebar_collapsed` | Chevron et même clé, autres dimensions | Dimensions et intitulés `nav.collapseMenu/expandMenu` |
| Recherche ouverte | Corps, premier contrôle après en-tête | Sidebar | Tous connectés | Champ, résultats sous le champ | Bouton ouvrant une fenêtre centrale | Champ et liste sous le champ |
| Recherche réduite | Même rang, icône seule | Sidebar | Réduction active | Popup 320 px, gauche 76 px / haut 64 px, focus | Disparaissait | Popup et focus rétablis |
| Résultats Médias | Premier groupe de résultats | Recherche | Tous connectés | 2 caractères, délai 300 ms, lien `/media/{id}` | Fenêtre centrale, vignettes, délai 250 ms | Groupe et emplacement historiques ; API Go inchangée |
| Résultats Utilisateurs | Deuxième groupe de résultats | Recherche | Admin, selon réponse API | Lien `/users/{id}`, clic ferme et vide | Même API, autre présentation | Même groupe ; permissions API conservées |
| Effacer / fermer la recherche | Champ / clic extérieur | Recherche | Selon champ et popup | X, clic extérieur | Fermeture modale | Comportement du champ rétabli ; Échap et `/` Go conservés |
| Serveur de secours actif | Après recherche, avant liens | Corps | `authServerIsPrimary === false` et nom fourni | Texte avec nom ; triangle compact | Au-dessus de la recherche, disparu en réduit | Position et variante compacte rétablies |
| Mon Compte | Admin 1 / utilisateur 1 | Aucun | Identité Jellyfin liée | `/users/{jellyfinUserId}`, UserCircle | Section Mon Compte avec Profil et Wrapped | Premier lien unique `nav.myAccount` ; exception local-admin ci-dessous |
| Tableau de bord | Admin 2 | Aucun | Admin | `/`, LayoutDashboard | Dans Général, visible aux utilisateurs | Ordre et visibilité rétablis |
| Ajoutés récemment | Admin 3 / utilisateur 3 | Aucun | Connectés | `/recent`, Sparkles | Avant Bibliothèque pour tous | Ordre spécifique à chaque rôle |
| Bibliothèque | Admin 4 / utilisateur 2 | Aucun | Connectés | `/media`, Film | Parent Médias avec enfants latéraux | Lien simple ; onglets dans le contenu |
| Utilisateurs | Admin 5 | Aucun | Admin | `/users`, Users | Dans Général | Rang historique |
| Santé | Admin 6 | Aucun | Admin | `/admin/health`, HeartPulse | Groupe Administration après Journaux | Rang et intitulé historique |
| Journaux | Admin 7 | Aucun | Admin | `/logs`, ScrollText | Général ; accessible côté route utilisateur | Rang historique ; utilisateur redirigé vers son profil |
| Paramètres | Admin 8 | Aucun | Admin | `/settings`, Settings | Multiples liens et groupes dans Sidebar | Lien unique ; `/settings` redirige `/settings/jellyfin` en gardant la requête |
| Comparaison de serveurs | Admin 9 | Aucun | Admin **et** `JELLYTRACK_MODE=multi` | `/admin/server-compare`, GitCompareArrows | Tous administrateurs, indépendamment du mode | Mode exact fourni par `/api/navigation`, pas inféré du nombre de serveurs |
| Mon Wrapped | Utilisateur 4 | Aucun | Non-admin, identité, visibilité globale et période active | `/wrapped/{id}`, Gift | Dans section compte, toujours visible avec identité | Condition et rang historiques |
| État actif principal | Lien courant | Sidebar | Tous liens affichés | Chemin exact ou préfixe, `/` exact seulement ; fond et bordure primaire | Règles spécifiques divergentes | Règle de `Sidebar.tsx` ; `aria-current` ajouté |
| Tous les Médias | Contenu Bibliothèque, onglet 1 | Bibliothèque | Connectés | `/media/all`, Film | `/media`, plus doublon latéral | Destination et onglet historique |
| Populaires | Contenu Bibliothèque, onglet 2 | Bibliothèque | Connectés | `/media/popular`, Trophy | Onglet et doublon latéral | Ordre conservé, doublon supprimé |
| Analyse Profonde | Contenu Bibliothèque, onglet 3 | Bibliothèque | Admin | `/media/analysis`, BarChart3 | Onglet visible non-admin ; route refusée | Visibilité et icône corrigées |
| collections | Dernier onglet Bibliothèque | Bibliothèque | Connectés | `/media/collections`, Layers | Onglet et doublon latéral | Uniquement navigation de contenu |
| Jellyfin | Paramètres, onglet 1 | Paramètres | Admin | `/settings/jellyfin`, Server ; actif aussi `/settings/plugin` | Vue d'ensemble puis serveurs | Premier onglet historique |
| SSO | Paramètres, onglet 2 | Paramètres | Admin | `/settings/sso`, KeyRound | Après sauvegardes | Ordre restauré |
| Sécurité | Paramètres, onglet 3 | Paramètres | Admin | `/settings/plugin/security`, Shield | Après plugin | Ordre restauré |
| Paramètres Média | Paramètres, onglet 4 | Paramètres | Admin | `/settings/media`, Clapperboard | Troisième onglet | Ordre et intitulé restaurés |
| Planificateur de Tâches | Paramètres, onglet 5 | Paramètres | Admin | `/settings/scheduler`, CalendarClock | Dernier onglet, sous-liens latéraux | Ordre et parent historiques |
| Sauvegardes de Données | Paramètres, onglet 6 | Paramètres | Admin | `/settings/dataBackups`, Database | Cinquième onglet | Ordre restauré |
| Notifications | Paramètres, onglet 7 | Paramètres | Admin | `/settings/notifications`, Bell | Septième parmi dix | Dernier parmi sept ; intitulé traduit historique |
| Défilement des onglets Paramètres | Haut du contenu | Paramètres | Desktop et mobile | Horizontal, labels et icônes, état actif | Boutons qui se répartissent sur plusieurs lignes | Liens et défilement horizontal |
| Tâches manuelles | Première section Planificateur | Paramètres / Planificateur | Admin | Section dans la page | Sous-onglet séparé | Section empilée |
| Planification automatique | Deuxième section Planificateur | Paramètres / Planificateur | Admin | Formulaire dans la même page | Sous-onglet séparé | Section empilée ; routes directes Go conservées |
| Planification Wrapped | Troisième section Planificateur | Paramètres / Planificateur | Admin | Visibilité, période, début/fin, sauvegarde | Pas de carte correspondante | Carte légère utilisant POST `/api/settings` existant |
| Nettoyage & Stockage | Santé, onglet 1 par défaut | Santé | Admin | Contient sa propre navigation | Page séparée `/admin/cleanup` | Onglet et imbrication rétablis ; actions Go conservées en complément |
| Sécurité & Anomalies | Santé, onglet 2 | Santé | Admin | Panneau d'anomalies | Diagnostic séparé | Onglet utilisant les diagnostics disponibles |
| Moteur & Logs | Santé, onglet 3 | Santé | Admin | Panneau diagnostic | Diagnostic système séparé | Onglet utilisant le panneau Go existant |
| Compteurs Santé | À droite des deux premiers labels | Santé | Admin, compte > 0 | Badge médias fantômes / anomalies | Absents dans cette disposition | Badges conditionnels, données Go ; Eraser / ShieldAlert / Activity historiques |
| Médias Fantômes | Sous-onglet 1 par défaut | Santé / Nettoyage & Stockage | Admin | Tableau de médias sans lectures et anciens | Pas de navigation correspondante | Deuxième niveau rétabli, lecture seule `/api/admin/cleanup` |
| Médias Abandonnés | Sous-onglet 2 | Santé / Nettoyage & Stockage | Admin | Tableau, complétion cumulée par utilisateur | Pas de navigation correspondante | Deuxième niveau rétabli, lecture seule |
| Doublons | Sous-onglet 3 | Santé / Nettoyage & Stockage | Admin | Tableau de médias de titre normalisé commun | Seulement doublons utilisateurs dans Go | Catégorie médias rétablie ; fusion utilisateurs Go reste en complément |
| Vue d'ensemble / Analyses détaillées / Réseau | Tableau de bord, ordre 1/2/3 | Tableau de bord | Admin | Onglets internes | Déjà présents | Conservés |
| Application / Système | Journaux, ordre 1/2 | Journaux | Admin | Onglets ; `?tab=system` ouvre Système | Onglets présents, URL ignorée | Lecture et mise à jour du paramètre `tab` |
| Langue | Premier contrôle du pied | Pied | Sidebar visible | Dropdown vers le haut, dix langues, drapeaux, cookie un an | Select natif en bas après compte | Contrôle historique, drapeaux locaux, même ordre de langues |
| Langue réduite | Premier contrôle du pied, drapeau | Pied | Sidebar réduite | Popup gauche 76 px / bas 64 px, 224 px | Cachée | Contrôle et popup rétablis |
| Thème | Deuxième contrôle du pied | Pied | Sidebar visible | Sombre par défaut ; clair/sombre, Sun/Moon | Petit bouton à côté du compte | Carte verticale et état courant traduit |
| Déconnexion | Troisième contrôle du pied | Pied | Connectés | Session invalidée puis `/login?logout=1` | Petit bouton, destination `/login` | Carte / bouton compact, même destination, CSRF Go conservé |
| Version / À propos | Dernier élément du pied | Pied | Sidebar visible | `/about`, texte complet ou version seule | Masquée en réduction | Lien conservé dans les deux états, `APP_VERSION` |
| Barre mobile | Haut fixe 56 px | Shell mobile | Largeur < 768 px | Hamburger puis logo/nom | Seuil 900 px, recherche/flux/sync en barre | Seuil et contenu historiques |
| Tiroir mobile | Gauche, 86 vw / max 288 px | Shell mobile | Hamburger activé | Fond noir 60 %, X, fermer au changement de route | Max 270 px, contrôles déplacés | Dimensions, commande X, fermeture rétablies |
| Login | Plein écran | Route | `/login` | Sidebar et barre absentes | Shell masqué via styles login | Masquage explicite du shell |
| Wrapped | Plein écran | Route | `/wrapped*` | Sidebar absente, X retourne en arrière | Sidebar présente, pas de X | Masquage et commande retour rétablis |

## Compléments conservés

Un bloc « Compléments Go », fermé au départ, suit la liste historique pour les administrateurs : vue d'ensemble Go, configuration du plugin, réseau, diagnostic système Go, nettoyage Go, diagnostic des journaux Go, santé du plugin, newsletter, synchronisation rapide et compteur des flux. Ces fonctionnalités et leurs API existaient avant l'intervention. La route `/admin/system-health` est un accès supplémentaire au diagnostic système conservé.

Les alias directs `/settings/scheduler/tasks` et `/settings/scheduler/schedules` restent utilisables, avec le planificateur complet empilé. `/settings/network` reste une page Go accessible directement et dans les compléments : l'ancienne redirection erronée vers les serveurs a été retirée.

## Sources inspectées

- `src/components/Sidebar.tsx`, `src/app/layout.tsx`, `src/app/globals.css`.
- `src/components/{SearchBar,LanguageSwitcher,ThemeToggle,LogoutButton,ThemeProvider}.tsx`, `src/i18n/locales.ts`, dix dictionnaires `messages/*.json` et leurs clés `nav.*`.
- `src/components/media/MediaHeaderNav.tsx`.
- `src/app/settings/{layout,ClientLayout,page}.tsx`, toutes les destinations de paramètres, `scheduler/{layout,page,WrappedSchedulerCard}.tsx`, tâches et planification.
- `src/app/admin/health/page.tsx`, `admin/cleanup/CleanupClient.tsx`, pages diagnostic et comparaison ; il n'existe pas de `src/app/admin/layout.tsx` dans cette référence.
- `src/app/page.tsx`, `src/app/logs/page.tsx`, `src/app/wrapped/[userId]/WrappedClient.tsx`, `src/proxy.ts`, `src/lib/{authOptions,cleanupData,mediaPolicy}.ts`, `src/app/api/search/route.ts`.
- Go : `web/dist/index.html`, `assets/{app.js,app.css,history.js}`, dix dictionnaires, `internal/{api,auth,settings}`, protections des routes et identité serveur.

## Sous-agents exécutés

| Nom | Travail effectivement confié | Écritures |
|---|---|---|
| `navigation_reference` | Inventaire historique, CSS, routes, composants et hiérarchies | Aucune |
| `navigation_current` | Audit shell Go, JavaScript, CSS, dictionnaires, routes et moyens de test | Aucune |
| `navigation_permissions` | Audit indépendant des rôles, identité, secours, mono/multi et Wrapped | Aucune |
| `navigation_visual_qa` | Exécution navigateur, application historique isolée, scénarios et captures | Uniquement `scratch/navigation-qa` |

L'agent principal est le seul auteur des modifications de JavaScript/CSS de production.

## Écarts de contenu et cas particuliers

La restauration porte sur la navigation ; elle ne constitue pas une déclaration de parité de toutes les pages Go avec Next.

- Un administrateur local Go utilise l'identité technique `local-admin`, qui n'a pas de profil Jellyfin. Son lien Mon Compte reste masqué comme avant cette intervention. `main` affichait un lien vers ce faux profil dès qu'un identifiant était présent. Le cas d'un vrai administrateur Jellyfin conserve le premier lien Mon Compte.
- Le logo mobile d'un utilisateur sans identité pointe vers la bibliothèque ; le code historique produisait `/users/` dans ce cas. Ce lien incomplet n'est pas réintroduit.
- La politique de connexion Go autorise déjà un administrateur Jellyfin sur un serveur de secours, alors que `main` dépend aussi de `ALLOW_FALLBACK_ADMIN`. Cette politique backend antérieure n'a pas été modifiée ; la navigation utilise le rôle que Go fournit.
- Le contexte de navigation reproduit exactement le calendrier de `RootLayout`, y compris fin à minuit et ancrage sur l'année courante d'une période décembre–janvier. L'API Wrapped Go a son propre contrôle d'accès préexistant, dont la fin de journée diffère. Le lien et l'API ne sont donc pas annoncés comme une migration complète de Wrapped.
- Les tableaux Santé et les panneaux de diagnostic utilisent les données Go ; ils ne reproduisent pas tous les graphiques, filtres, sélections et opérations de nettoyage de l'ancienne page. Les catégories et leur imbrication sont restaurées ; les actions Go antérieures restent sur leur page complémentaire.
- Les pages hors navigation gardent leur présentation Go. Les captures comparent le shell, ses états et ses contrôles ; elles ne prouvent pas l'identité visuelle du contenu entier de l'application.

## Validation et captures

Les deux applications ont réellement été vues dans Chromium, à **1440 × 900** et **390 × 844**. [Galerie comparative](navigation-captures/README.md) : administrateur/utilisateur, sidebar ouverte/réduite, mobile fermé/ouvert. Les images admin Go avec identité Jellyfin ont la même liste que la référence ; les images ne prétendent pas reproduire les pages de contenu Go.

| Validation exécutée | Résultat | Preuve |
|---|---|---|
| `go test ./...` | Toutes les suites passent | Tests backend et intégration dans le dépôt |
| `go vet ./...` | Aucune anomalie | Exécution terminée avec code 0 |
| Syntaxe des trois JS modifiés ; `git diff --check` | Code 0 | Commandes ci-dessous |
| Suite navigateur Go, huit scénarios | **130 / 130**, zéro erreur console/HTTP | [go-results.json](navigation-validation/go-results.json) |
| Régressions ciblées : actifs, recherche réduite/asynchrone, requête système, médias, Wrapped, scroll, mobile, clavier des onglets Santé | **35 / 35**, zéro erreur JavaScript/console | [focused-results.json](navigation-validation/focused-results.json) |
| Historique Next, quatre scénarios réellement rendus | Admin/utilisateur × desktop/mobile, zéro erreur console | [reference-results.json](navigation-validation/reference-results.json) |
| Binaire Go lancé sans répertoire `web/dist` externe | Dix ressources/API servies, toutes HTTP 200 | [embedded-results.json](navigation-validation/embedded-results.json) |

Les mesures DOM finales concordent avec la référence pour les dimensions structurantes : sidebar 256 px / 80 px, entrée 42 px, pied desktop à y=633,594 px / hauteur 266,406 px, contrôle langue 63,703 px et déconnexion 46 px. [Mesures Go](navigation-validation/navigation-measurements.json).

**Conditions des tests :** base SQLite synthétique, deux serveurs désactivés, aucun serveur Jellyfin réel. L'authentification et la déconnexion Go utilisent une vraie session locale. Les variantes visuelles utilisateur/admin, secours, mono/multi et visibilité Wrapped interceptent uniquement `/api/auth/me` et `/api/navigation` ; elles ne sont pas des connexions Jellyfin/OIDC réelles. Les refus backend sont vérifiés séparément dans les tests Go avec une session effectivement rétrogradée au rôle utilisateur.

**Référence historique :** archive isolée de `main`, dépendances installées pour cette comparaison seulement, `PRISMA_USE_STUB=true`, JWT NextAuth synthétiques vérifiés après hydratation. La copie QA a un scanner Tailwind borné à `src/app` et `src/components` (`source(none)` et deux directives `@source`) pour éviter un blocage de compilation de l'archive imbriquée ; les règles visuelles et composants historiques sont conservés. Les vraies polices Sora sont mises en cache local avec le hook Next `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`. SWC a nécessité un cache local isolé et un lecteur temporaire Q:, retiré après la comparaison. Next a été arrêté ensuite.

**Non vérifié en exécution :** dans l'application historique, `/` et `/recent` ont dépassé 60 secondes pendant la compilation Next ; les autres anciennes pages n'ont donc pas toutes été ouvertes. [Erreurs exactes](navigation-validation/reference-routes.json). Leurs contrôles ont été comparés dans le code, élément par élément dans la matrice. Il n'existe pas de capture historique valide de Santé ou du Planificateur. Connexion Jellyfin/OIDC réelle, PostgreSQL, Docker et données réelles ne font pas partie de cette validation visuelle.

Contrôles Go ajoutés : contexte authentifié sans secrets, calendrier historique Wrapped, hiérarchies de nettoyage, lectures des enfants limitées à leur serveur, complétion cumulée et règles de bibliothèque, interdiction des nouvelles données administrateur aux utilisateurs ordinaires.

Commandes reproductibles : `go test ./...`, `go vet ./...`, `node --check web/dist/assets/app.js`, `node --check web/dist/assets/navigation.js`, `node --check web/dist/assets/history.js`, `git diff --check`. Node intervient uniquement dans les vérifications et l'exécution isolée de la référence historique ; le produit livré reste Go + HTML/CSS/JavaScript.

La police Sora et sa licence SIL OFL sont locales (`assets/sora-latin.woff2`, `assets/sora-OFL.txt`). Les tracés SVG Lucide historiques sont embarqués dans le module JavaScript avec leur [licence](../web/dist/assets/lucide-LICENSE.txt), sans dépendance React. Les dix drapeaux PNG de FlagCDN sont embarqués : aucun téléchargement de police ou de drapeau n'est nécessaire au runtime.

Les scripts de navigateur, leurs variables et l'initialisation de la base de test sont documentés dans [scripts/navigation-qa/README.md](../scripts/navigation-qa/README.md). Les preuves JSON et captures sont conservées dans le dépôt ; les bases, binaires, dépendances de test et serveurs temporaires ne sont pas livrés.
