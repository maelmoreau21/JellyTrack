# Audit indépendant navigation_comparison

Référence : `main` a59a286. État audité : `codex/frontend-recovery` c4ed749. Audit source réalisé le 10 octobre 2026, avant les corrections du principal. Aucun AGENTS.md applicable trouvé dans le dépôt ou ses parents. Skill codex-token-saver lu : recherches ciblées, extraction unique de l'inventaire Git, comparaison des clés de menus en lot, aucune répétition des anciennes validations. Anciennes notes de navigation utilisées uniquement pour orienter les sources ; conclusions ci-dessous revérifiées sur les sources courantes.

## Portée réellement vérifiée

36 routes historiques trouvées avec `git ls-tree -r --name-only a59a286 src/app` et sélection des `page.tsx`. Présence des dispatchers Go contrôlée dans `app.js:6072-6158`, `media-recovery.js:319-332`, `settings.js:30-38,179-202`, `admin.js:73-80,1105-1120`.

Cet agent n'a pas effectué de comparaison de captures ni de test navigateur. Les états « Identique ou fidèle » du tableau concernent uniquement présence, parent, ordre et conditions de navigation établis par lecture du code. Apparence rendue, responsive exécuté, données et actions : **Non testé** par cet agent, à compléter avec les autres agents. Aucun pourcentage de parité visuelle revendiqué.

## Matrice exhaustive des routes historiques

Position sidebar admin : compte (si ID Jellyfin), Tableau de bord, Récemment ajoutés, Bibliothèque, Utilisateurs, Santé des journaux, Historique, Paramètres, Comparaison des serveurs (multi uniquement). Standard : compte, Bibliothèque, Récemment ajoutés, Mon Wrapped (si ID et visibilité/calendrier). Les clés i18n, plutôt que leur traduction FR seule, sont indiquées ci-dessous pour ne pas confondre les langues.

| Route historique | Parent/position historique | État navigation source | Observation |
|---|---|---|---|
| `/` | sidebar admin `dashboard`, premier après compte | Identique ou fidèle | Standard redirigé vers profil ; dispatcher dashboard |
| `/about` | pied sidebar, lien version | Identique ou fidèle | Tous utilisateurs authentifiés |
| `/login` | hors sidebar | Différence à corriger | Retour vers page demandée perdu dans Go |
| `/setup` | route directe | Différence justifiée | Bootstrap Go accessible hors session ; historique soumis au proxy auth |
| `/recent` | admin 2 ; standard 3 avec compte | Identique ou fidèle | Même clé `recentlyAdded`, Sparkles |
| `/users` | sidebar admin après Bibliothèque | Différence à corriger | Go redirige standard vers login ; historique vers son profil |
| `/users/[id]` | compte ou détail utilisateur | Identique ou fidèle | Compte construit depuis Jellyfin ID ; Go accepte aussi ID interne |
| `/wrapped/[userId]` | standard après Récemment ajoutés | Identique ou fidèle | Sidebar masquée, visibilité globale + fenêtre calendrier |
| `/logs` | sidebar admin après santé | Identique ou fidèle | Standard vers profil |
| `/newsletter` | route directe + onglets Médias | Différence à corriger | Go interdit standard ; historique autorise lecture authentifiée |
| `/media` | sidebar Bibliothèque | Identique ou fidèle | Redirection vers `/media/all`, query conservée |
| `/media/all` | Médias onglet 1 | Identique ou fidèle | Film, clé `allMedia` |
| `/media/popular` | Médias onglet 2 | Identique ou fidèle | Trophy, clé `popularTab` |
| `/media/analysis` | Médias onglet 3 admin uniquement | Identique ou fidèle | BarChart3, clé `deepAnalysisTitle` |
| `/media/collections` | Médias dernier onglet | Identique ou fidèle | Layers, clé `libraries` |
| `/media/[id]` | détail sous Médias, aucun onglet actif | Identique ou fidèle | Go `nav(s,'')` respecte état historique |
| `/media/artist/[name]` | détail artiste sous Médias | Identique ou fidèle | Aucun onglet actif, breadcrumb vers bibliothèque |
| `/settings` | sidebar Paramètres | Identique ou fidèle | Redirection vers Jellyfin, query conservée |
| `/settings/jellyfin` | Paramètres onglet 1 | Identique ou fidèle | Server, `jellyfinTitle` |
| `/settings/sso` | Paramètres onglet 2 | Identique ou fidèle | KeyRound, `ssoTitle` |
| `/settings/plugin/security` | Paramètres onglet 3 | Identique ou fidèle | Shield, `authSecurity` |
| `/settings/media` | Paramètres onglet 4 | Identique ou fidèle | Clapperboard, `mediaSettings` |
| `/settings/scheduler` | Paramètres onglet 5 | Identique ou fidèle | CalendarClock ; tâches puis horaires puis Wrapped |
| `/settings/scheduler/tasks` | accès direct, onglet scheduler actif | Identique ou fidèle | Go affiche tâches seules comme historique |
| `/settings/scheduler/schedules` | accès direct, onglet scheduler actif | Identique ou fidèle | Go affiche horaires seuls comme historique |
| `/settings/dataBackups` | Paramètres onglet 6 | Identique ou fidèle | Database, `dataBackups` |
| `/settings/notifications` | Paramètres onglet 7 | Identique ou fidèle | Bell, `notifications` |
| `/settings/plugin` | accès direct, onglet Jellyfin actif | Identique ou fidèle | Alias au même composant/écran serveurs |
| `/settings/overview` | alias direct vers Jellyfin | Identique ou fidèle | Même redirection |
| `/settings/network` | alias direct vers Jellyfin | Identique ou fidèle | Même redirection |
| `/settings/analytics` | alias direct vers Analyse médias | Identique ou fidèle | Même redirection |
| `/admin/health` | sidebar `logHealth` | Identique ou fidèle | Onglets nettoyage → sécurité → journaux |
| `/admin/cleanup` | accès direct / nettoyage intégré à santé | Différence justifiée | Accès supplémentaire sous Compléments Go, écran historique conservé |
| `/admin/log-health` | alias direct vers santé | Identique ou fidèle | Même redirection |
| `/admin/plugin-health` | alias direct vers santé | Identique ou fidèle | Même redirection |
| `/admin/server-compare` | dernier sidebar admin, mode multi | Identique ou fidèle | GitCompareArrows ; masqué en single, route directe conservée |

Les sept onglets Paramètres sont réservés à l'administration dans les deux architectures. L'onglet Analyse médias est réservé admin dans les deux. Les routes Médias restantes et About sont ouvertes aux sessions standard. Cet audit source ne confirme pas les permissions des données renvoyées pour tous IDs arbitraires.

## Preuves des menus et sous-menus

- `main:src/components/Sidebar.tsx:30-39,85-115` et Go `navigation.js:166-180` : mêmes clés, ordre et rôles. `main:Sidebar.tsx:289-325` / Go `navigation.js:62-64,201-215` : langue, thème, logout puis version/About.
- `main:src/app/settings/ClientLayout.tsx:12-55` / Go `navigation.js:238-245` : sept onglets identiques, mêmes règles actives pour Plugin/Jellyfin, SSO, Sécurité, Média, Scheduler, Backups, Notifications.
- `main:src/components/media/MediaHeaderNav.tsx:17-22` / Go `navigation.js:246-251` : quatre onglets admin, trois standard, même ordre.
- `main:src/app/settings/scheduler/layout.tsx` n'affiche aucun sous-menu supplémentaire (`tabs.length > 1` faux). Go ne rajoute pas de sous-menu, respecte les sous-routes directes avec `settings.js:193`.
- `main:src/app/layout.tsx:getWrappedVisibility` / Go `internal/api/navigation.go:12-67` : calcul calendrier reproduit, y compris ancrage année courante et fin à minuit. `/api/navigation` ne fournit que contexte public de présentation, sans configuration/secret admin.
- 21 clés de sidebar/onglets comparées sur les 10 langues (`fr,en,de,es,it,nl,pl,pt-BR,ru,zh`) : **210 comparaisons, aucune différence**. Ordre/code/labels des 10 langues correspondent à `main:src/i18n/locales.ts` et Go `navigation.js:47`. Les SVG reprennent les familles Lucide historiques ; aucune comparaison de pixels SVG effectuée.
- Dimensions structurales source sidebar : 256 px ouvert, 80 px fermé, mobile min(86vw,288px), entête 64 px desktop / 56 px mobile, mêmes valeurs historiques. Ne pas remplacer les rayons 12/16 px par les valeurs Tailwind par défaut : `main:globals.css` définit `--radius:.75rem`, `--radius-lg:var(--radius)`, `--radius-xl:calc(var(--radius)+4px)`.

## Régressions constatées avant correction

1. **Redirection `/users` standard erronée** : Go `app.js:6107-6110` navigate `/login`; historique `main:src/proxy.ts:91,165-175` envoie `/users/{jellyfinUserId}` si disponible. Correction transmise au principal.
2. **Destination de connexion perdue** : historique `main:src/proxy.ts:136-139` conserve route/query en `callbackUrl` ; `main:src/app/login/LoginForm.tsx:23,91-98,118-125` applique la destination validée. Go `app.js:6097-6099,3991-3995` oublie callback et revient à `/`. Corriger en conservant uniquement une destination locale validée, y compris query ; ne pas accepter URL externe.
3. **Rayon onglets Paramètres** : Go `navigation.css:112` force 8 px ; main `ClientLayout.tsx:70` utilise `rounded-lg`, soit 12 px selon `globals.css`. Correction minimale recommandée 8 → 12, sans déplacement ni réécriture.
4. **Lecture newsletter standard supprimée** : `main:src/proxy.ts:83-91` ne classe pas `/newsletter` admin ; `main:src/app/newsletter/page.tsx:13-30` lit les agrégats sans garde admin. Go `app.js:6111` interdit la page et `internal/api/handlers.go:130` protège GET avec les routes admin. La publication Discord reste admin dans les deux. Le principal doit qualifier les données agrégées avant de rouvrir la lecture ; ne pas déplacer les actions admin vers un accès standard par effet de bord.
5. **Langue initiale différente** : Go `app.js:17` choisit localStorage ou FR ; main défaut EN + détection Accept-Language (`src/i18n/locales.ts`, `src/proxy.ts:34-63`). Préférence/configuration Go à documenter ; ce n'est pas une preuve de manque de traductions.

## Routes Go supplémentaires et adaptations

Accès explicites sous Compléments Go (`navigation.js:189`) : `/settings/go-overview`, `/settings/go-network`, `/settings/plugin`, `/admin/system-health`, `/admin/cleanup`, `/admin/log-diagnostics`, `/admin/plugin-diagnostics`, `/newsletter`. Certaines existaient historiquement mais n'étaient pas dans la sidebar ; ce regroupement supplémentaire préserve l'ordre principal historique et rend les capacités Go accessibles. Les historiques `/admin/log-health` et `/admin/plugin-health` gardent leurs redirects ; les diagnostics Go disposent de nouveaux chemins pour éviter de réinterpréter ces aliases. `/admin/maintenance` est lié depuis le nettoyage (`admin.js:582,1105-1110`). `/wrapped` est un raccourci vers Wrapped du compte (`app.js:6081-6088`). Aucune suppression des extensions Go recommandée.

Adaptations architecturales justifiées : dispatch client sans Next, SVG Lucide embarqués, fonte Sora locale, contexte de navigation via API publique de présentation, résolution des identifiants internes et Jellyfin sur les pages de détail. Ces adaptations ne justifient pas de changer les textes, ordre, rôles ou rayons historiques.

## Vérification exécutée

`go test ./internal/api -run 'Navigation|WrappedVisible' -count=1` : **PASS**, package internal/api, 3.106 s. Cela couvre le contexte navigation/calendrier selon les tests existants, pas les interactions navigateur ni la parité de rendu. Aucun fichier de code modifié, aucun commit réalisé par cet agent. Le rapport décrit c4ed749 ; les corrections du principal doivent être vérifiées séparément.

Mémoire d'orientation utilisée : `MEMORY.md:18-26`, rollout `01a11f83-6c36-7e12-8b33-a97d9833977a`. Aucune conclusion héritée utilisée comme preuve actuelle.

## Correction ciblée supplémentaire : About et intro Wrapped

Après l'audit indépendant, le principal a explicitement autorisé cet agent à corriger About et les styles de l'introduction Wrapped. Captures **avant correction** réellement inspectées : `captures/pair-about-desktop-dark.png` et `captures/pair-wrapped-alice-desktop-dark.png`. About montrait un en-tête encadré et empilé, des textes marketing Go substitués aux fonctionnalités historiques et une grille de quatre technologies ; Wrapped montrait un gradient inversé et un bouton rectangulaire.

Fichiers modifiés : `web/dist/assets/about-recovery.js`, `about-recovery.css` (nouveaux), méthode `Pages.about` uniquement dans `app.js`, deux références assets dans `web/dist/index.html`, et styles ciblés intro Wrapped dans `profile.css`.

About retrouve l'ordre historique : logo et titre côte à côte, description, version configurée, liste de 11 fonctionnalités traduites et dans leur ordre historique, grille de six technologies, liens GitHub/Jellyfin et crédit open-source. Les noms et versions de la stack sont adaptés au code actuel : Go 1.26 (`go.mod`), HTML/JavaScript, SQLite/PostgreSQL, Chart.js (version du bundle), Go OIDC (`go-oidc v3.21.0`), Go Scheduler. Il serait trompeur de présenter Next.js/React/Prisma/Recharts/NextAuth/Node-Cron comme la stack courante. Les descriptions des adaptations Go existent ici en FR/EN ; les textes historiques utilisent les dix fichiers de traduction. Les capacités Go sont conservées en fin de page sous Compléments Go ; l'ancienne mention erronée « 11 langues » est corrigée en dix.

Wrapped : gradient d'introduction ciblé sur `.wrapped-theme-purple:has(.wrapped-customize)` (indigo 900 → purple 900 → noir), personnalisation en pill avec filtre, texte d'introduction 20 px et max-width 384 px selon `main:src/app/wrapped/[userId]/WrappedClient.tsx:156-175`. Le sélecteur exclut les slides de catégories et partage. Les autres éléments Wrapped restent hors portée de cette correction.

Vérifications : `node --check web/dist/assets/about-recovery.js` et `node --check web/dist/assets/app.js` **PASS**. Rendu du module dans Node VM pour FR/EN : liste historique complète, six cartes, crédit présent, version échappée, ancien en-tête supprimé **PASS**. Contrôle complémentaire Node VM des dix langues : ordre de chaque fonctionnalité historique et crédit **PASS**. Les corrections du principal de callback/profil dans `app.js` sont toujours présentes après la modification de la seule méthode About. Aucune nouvelle capture après correction produite par cet agent : le principal doit reconstruire/recapturer et ne doit pas présenter les anciennes captures comme preuve du rendu corrigé. Aucun commit réalisé par cet agent.
## Consolidation finale du principal

Les défauts source profil/callback/radius/langue sont corrigés et vérifiés dans `final-controls.json`. `/setup` retrouve désormais la redirection historique `/` avec garde auth ; l'assistant Go est conservé sous `/setup/go` dans les Compléments Go. L'inventaire structuré contient ce neuvième chemin additionnel. Les conclusions initiales ci-dessous sur setup/langue sont donc supersédées. Newsletter standard reste interdite pour préserver les permissions Go existantes ; ne pas la classer comme adaptation Go nécessaire. Wrapped est complété dans `wrapped-review.md` et son compteur natif18 est vérifié. Sources figées, aucun commit.

