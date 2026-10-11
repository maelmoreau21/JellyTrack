# Audit visuel indépendant — visual_comparison

## Périmètre et preuves

- Référence : `main a59a286`, composants TSX originaux sous `scratch/navigation-qa/main-reference`, serveur Next isolé `localhost:3341`.
- Application : Go isolé `localhost:3350`, SQLite synthétique, connexion réelle `mediaadmin`.
- 36 modèles de routes historiques, concrétisés en 40 routes (film, série, épisode, album, livre pour `/media/[id]`). 40 routes capturées sur chaque application, 4 variantes par route : 1440×900 et 390×844, français, administrateur, sombre et clair. Soit 320 captures initiales.
- Données : export frais des six tables SQLite Go vers l'adaptateur synthétique Prisma, sans reseed Go. 4 utilisateurs, 2 serveurs, 128 médias, 147 lectures, 36 événements, 2 flux. SHA du fichier fixture dans `visual-results.json`. Les API Settings et certains agrégats du substitut Prisma ne produisent pas des données strictement équivalentes : limites détaillées ci-dessous.
- Intégrité : `visual-integrity.json` contient SHA normalisés LF de 145 fichiers TSX/CSS. 144 identiques à `main`. Seul `globals.css` change le périmètre de recherche Tailwind (`source(none)`, `@source ./`, `@source ../components`) pour compiler l'archive isolée. Aucun composant historique réécrit.
- Scripts : `visual-captures.cjs`, `visual-server-check.cjs`, `visual-settings-verify.cjs` sous `scripts/final-audit/`.
- Journaux initiaux : `visual-results.json` pour Main ; `visual-go-results.json` pour Go. Ils contiennent URL effective, erreurs, titres, contrôles géométriques, couleurs, graphiques montés, débordement du document et nom des captures.

## Comparaisons réellement vues

Les paires `captures/pair-<route>-desktop-dark.png` ont été ouvertes et regardées avec `view_image` pour : dashboard, recent, media-all, media-popular, media-collections, media-analysis, media-movie, media-series, media-episode1, media-album, media-book, media-artist-Artiste-QA, users, users-alice, logs, newsletter, wrapped-alice, about, settings-jellyfin, settings-sso, settings-plugin-security, settings-media, settings-scheduler, settings-scheduler-tasks, settings-scheduler-schedules, settings-dataBackups, settings-notifications, settings-plugin, admin-health, admin-server-compare, admin-cleanup, login et setup. Les sept autres routes sont des alias observés avec redirection identique vers l'une de ces pages.

Paires supplémentaires effectivement vues : `pair-users-mobile-dark.png`, `pair-media-all-mobile-dark.png`, `pair-media-movie-desktop-light.png`. Les autres variantes mobile/clair sont capturées et mesurées, **pas toutes examinées visuellement**. Les trois images Go source-preview Notifications, Sécurité et Tâches ont également été vues après les corrections ; elles sont identifiées `go-preview-*` et ne valent pas preuve d'un binaire reconstruit.

Les captures `fullPage` montrent principalement le premier écran parce que les applications utilisent un conteneur principal défilant. Les graphiques historiques différés sous la ligne de flottaison ne sont pas montés sans défilement : zéro SVG Recharts sur plusieurs premières captures. **Ces images ne prouvent pas la parité de tous les graphiques ni de toutes les sections inférieures.** Toutes les interactions, autres rôles et autres langues relèvent des tests complémentaires des autres agents.

## Matrice initiale par route

`Fidèle` ci-dessous porte sur le point indiqué, jamais sur toutes les dimensions non testées.

| Route Main | Route Go concrète / destination | État initial du premier écran | Constats |
|---|---|---|---|
| `/` | `/` | Différence à corriger | Filtres en chips contour, groupement KPI Santé absent, tailles KPI et titres différentes. Première capture Main encore cache d'avant recompilation fixture : ne pas comparer ses chiffres. |
| `/recent` | `/recent` | Différence à corriger | Marge verticale, dates, fallback poster et ordre visuel divergent ; ordre Main sous adaptateur à vérifier avant conclure sur les données. |
| `/media/all` | `/media/all` | Différence à corriger | Placeholder `[object Object]`, titre/marges, rangée serveur absente, tri ajouté, images fallback. |
| `/media/popular` | `/media/popular` | Différence à corriger | Titres, sous-titres, taille des cartes, badges/rangs, liste musique albums au lieu de pistes. |
| `/media/collections` | `/media/collections` | Différence à corriger | KPI 3 colonnes au lieu de 2 + Temps dessous ; 8 cartes serveur au lieu de 4 bibliothèques regroupées. |
| `/media/analysis` | `/media/analysis` | Différence à corriger | Trois sous-cartes Contenu Total supprimées, intitulés résolution abrégés, marges différentes. Graphiques inférieurs : non testés visuellement. |
| `/media/movie` | `/media/qa-primary-movie` | Différence à corriger | Fallback, infos ajoutées, sous-titres/iconographie KPI absents, durée formatée autrement. Chiffres 17 vues concordants. |
| `/media/series` | `/media/qa-primary-series` | Différence à corriger | Même dérive header/KPI, tableau saisons sans icônes ; agrégats détail 51 vues concordants. |
| `/media/episode1` | `/media/qa-primary-episode1` | Différence à corriger | Poster portrait Go au lieu de paysage historique, header nettement plus haut, liens hiérarchie moins colorés. |
| `/media/album` | `/media/qa-primary-album` | Différence à corriger | Poster et header, tableau pistes ajoute résolution ; titres détail 3 pistes concordants. |
| `/media/book` | `/media/qa-primary-book` | Différence à corriger | Fallback/header/KPI ; 16 vues concordantes. |
| `/media/artist/Artiste%20QA` | même route | Différence à corriger | Portrait rond plutôt que carré, titre 40px plutôt que 30px ; chiffres 2 albums/6 pistes/54 vues concordants. Traduction FR améliore des textes historiquement EN, à documenter comme adaptation. |
| `/users` | `/users` | Identique ou fidèle (desktop) | Titres x313/y163/20px sur les deux ; tableaux et données concordants. Mobile : pillules de filtre nowrap différentes des retours à la ligne historiques. |
| `/users/alice` | `/users/qa-primary-alice` | Différence à corriger / données non testées | Grille et statistiques fidèles ; Go montre un flux en pause absent Main à cause du substitut flux. Graphiques7 Main/5 Go montés : existence vérifiée, contenu et totalité sous écran non prouvés. |
| `/logs` | `/logs` | Différence à corriger | Tailles/espacements filtres, titres/icônes, arrangement du tableau. Main récupération client après erreur SSR `window is not defined`. |
| `/newsletter` | `/newsletter` | Différence à corriger | Même structure et 80h/147 lectures ; carte statistiques Go plus haute et podium plus bas, fallback différent. |
| `/wrapped/alice` | `/wrapped/qa-primary-alice` | Différence à corriger | Dégradé purple→black Main/blue Go, bouton personnaliser, Main1/18 vsGo1/16 slides : à traiter aussi fonctionnellement. |
| `/about` | `/about` | Différence à corriger | Hiérarchie/texte/page largement réinterprétés. Stack Go nécessaire mais ne justifie pas changer identité et sections historiques. |
| `/settings/jellyfin` | même route | Données non testées ; géométrie proche | Main substitut API retourne localhost1 serveur contre Go2 serveurs QA ; données settings incompatibles. En-tête principal quasiment identique. |
| `/settings/sso` | même route | Différence à corriger | Statut et Actualiser changent de position ; switches compact top-right remplacés blocs pleine largeur. Callback Go différent justifié par architecture. |
| `/settings/plugin/security` | même route | Différence à corriger | Padding supplémentaire x330/y136 contre288/103 ; switches télémétrie2 colonnes contre4. |
| `/settings/media` | même route | Différence à corriger | Exclusions2 colonnes historiques contre groupes série ; nouveau état serveur à préserver, forme historique à rétablir. |
| `/settings/scheduler` | même route | Différence à corriger | Run boutons sans fonds couleurs, icônes tâche absentes, badge intervalle réduit texte. |
| `/settings/scheduler/tasks` | même route | Différence à corriger | Même dérive tâches. |
| `/settings/scheduler/schedules` | même route | Différence à corriger | Save déplacé gauche→droite, rétention menu dans bloc plus haut. |
| `/settings/dataBackups` | même route | Différence à corriger | Nesting historique aplati, texte/icônes/bouton import violet perdu ; API ZIP à tester autre agent. |
| `/settings/notifications` | même route | Différence à corriger | Carte historique y120 ; Go y362 : margin:auto centre la page courte, Save déplacé à droite. |
| `/settings/plugin` | `/settings/jellyfin` | Différence justifiée (alias) / données non testées | Deux applications montrent Jellyfin ; même limite de données que route Jellyfin. |
| `/admin/health` | même route | Différence à corriger | Structure et compteurs proches ; tabs trop courts au lieu de largeur disponible, contrôles/iconographie moins fidèles. |
| `/admin/log-health` | `/admin/health` | Identique ou fidèle (redirection) | Alias redirige vers la santé historique sur les deux. Apparence de destination : voir santé. |
| `/admin/plugin-health` | `/admin/health` | Identique ou fidèle (redirection) | Même redirection historique. Le Go spécifique plugin reste une fonctionnalité nouvelle indépendante. |
| `/admin/server-compare` | même route | Différence à corriger | KPI/tableau de mêmes sections ; padding/hauteurs/couleur badges différents. Inventaire Go supplémentaire préservé. |
| `/admin/cleanup` | même route | Différence à corriger | Structure et110 doublons concordants, tabs compacts, empty-state remplace table vide historique, couleurs. |
| `/settings` | `/settings/jellyfin` | Identique ou fidèle (redirection) | Destination identique ; limite données settings. |
| `/settings/analytics` | `/media/analysis` | Identique ou fidèle (redirection) | Destination identique ; dérives analyse. |
| `/settings/network` | `/settings/jellyfin` | Identique ou fidèle (redirection) | Destination identique. |
| `/settings/overview` | `/settings/jellyfin` | Identique ou fidèle (redirection) | Destination identique. |
| `/media` | `/media/all` | Identique ou fidèle (redirection) | Destination identique. |
| `/login` | `/login` | Différence à corriger / mode différent | Local admin Go nouveau légitime ; carte/submit différents et Remember30 jours absent initialement. Auth historique serveur n'est pas exercé sur Jellyfin vivant. |
| `/setup` | `/setup` (Main→`/`) | Différence à corriger | Main déjà installé retourne dashboard, Go affiche wizard initial malgré base installée ; garde à revoir. |

## Corrections réalisées par cet agent

Uniquement `web/dist/assets/settings.css`, `settings.js`, `admin.css` ; aucun backend, migration ou permission changé.

1. Notifications : margin verticale automatique supprimée, carte ramenée y362→120 et bouton sauvegarde à gauche.
2. Sécurité : retirer padding desktop supplémentaire, h1 x330/y136→288/104 (historique288/103). Télémétrie switches4 colonnes desktop, mobile inchangé.
3. Tâches : icônes tâches et horloge, intervalles en pillules colorées, Run boutons remplis cyan/violet/vert/ambre/purple, hauteurs texte et gap proches historique ; feedback vide masqué. Contrôles/actions/données préservés.
4. Sous-pages tasks/schedules : largeur du conteneur rétablie, carte x304 correspond historique ; save schedules gauche.
5. Santé/nettoyage : listes d'onglets étendues au contenu, boutons répartis.

Validation source-preview : `visual-settings-preview.json`, **26/26** vérifications sur7 routes, desktop/mobile, absence d'erreur JS et dépassement du document, positions mesurées et palette. Les captures sont `go-preview-*` (assets source substitués aux assets embarqués seulement ; véritables API Go).

## Limites et résidus

- Toutes les routes présentes ne signifie pas toutes leurs interactions vérifiées. Cet agent n'a pas validé ACL ni effets de boutons.
- Pas de Jellyfin vivant, art posters volontairement absent. Le fallback fait partie de l'identité historique et a été comparé réellement.
- Les serveurs synthétiques désactivés expliquaient l'absence du filtre Go : contrôle HTTP réel `/api/navigation multiServer=true` mais `/api/media/server-options servers=[]`, SQL actif uniquement. Root a repris correction du fallback serveur historique.
- Référence Settings utilise un autre substitut d'API ; serveur unique localhost et configurations différentes. Aucune prétention de parité des données Settings.
- SSR utilisateurs/journaux Next : erreur `window is not defined` puis récupération client fonctionnelle ; ne pas attribuer ces erreurs au Go. Overlay développement Next visible (pas défaut Go).
- Thème clair obtenu en ajoutant/supprimant classe `dark` et media colorScheme pour isoler les styles. L'état interne du contrôle thème Next n'est pas actualisé par cette méthode : la mention Sombre persistante sur une image claire est une limite du banc de captures.
- La première capture dashboard Main cache partiellement ancien avant recompilation de la fixture ; capture setup redirigée dashboard ultérieure montre75 vues commeGo. Ne pas attribuer68→75 à une régression produit.
- SSO arrangement refresh/switches, backups nesting/importer, média détail sous-titres/icons/poster paysage, newsletter hauteur KPI, Wrapped palette/personnalisation/slides et artefacts inférieurs non inspectés restent à reprendre ou documenter explicitement.
- Aucun pourcentage global de fidélité démontré par ce sous-audit. Les40×4 captures constituent une couverture de capture, pas160 états de parité prouvés.

## Vérification finale embarquée

En attente du contrôle SHA/binaire final par le principal. Le rapport final sera complété avec captures `go-final-*`, `visual-final-results.json`, hashes HTTP/source et comparaisons réellement vues après correction. Les captures initiales demeurent séparées pour ne pas effacer les écarts constatés.

## Addendum de reprise : derniers résidus Settings corrigés

Ownership limité à `settings.js` et `settings.css`, sans changement backend, permissions, donnée enregistrée ni démarrage de binaire. Comparaison avec les captures Main déjà réellement vues et les composants originaux SSO, Média et Sauvegardes.

- **SSO** : état placé près du titre, Actualiser à droite du même en-tête ; switch Activer et Redirection auto dans les deux petits blocs du header Configuration. Les deux inputs restent explicitement associés à `form="settings-sso-config"` et sont toujours inclus dans `form.elements`, donc le payload sauvegardé conserve `enabled`/`autoRedirect`. Texte `Jellyfin Direct` et admin configuré sur une ligne rétablis. Callback Go conservé ; son label accessible est masqué visuellement comme l'input historique sans label dupliqué.
- **Sauvegardes** : valeurs KPI30px, unité Mo18px normale, horloge de dernière sauvegarde ; carte imbriquée Historique des sauvegardes avec header, tableau et empty-state centré. Importer reprend l'icône Upload, le bouton violet et le fichier/bouton sur la même ligne desktop ; label fichier reste accessible, champ ZIP et gestionnaire d'import inchangés. Sauvegarder maintenant reprend cyan sur les deux thèmes.
- **Exclusions Média** : deux cartes serveur desktop, URL serveur sous le nom, deux colonnes de bibliothèques par carte et badge Actif à droite du nom. Les clés `srvlib` et `aria-pressed` sont inchangées ; un clic sur une exclusion ne change aucune des sept autres. Le diagnostic serveur supplémentaire reste présent : le code historique contient également cette section conditionnelle, mais le substitut Settings Main initial ne fournit pas les mêmes diagnostics que Go, ce qui explique son absence sur la paire initiale.

`visual-settings-residuals-preview.json` : **26/26** assertions réussies, trois routes, sombre/clair, desktop/mobile ; aucune erreur JS ni débordement du document. Douze captures `go-preview-residual-*` disponibles. Les trois desktop sombre et trois mobile clair ont effectivement été ouvertes et examinées. L'alignement et les petites cartes restaurées ont été confrontés aux anciennes paires Main ; ce contrôle ne remplace pas un replay des opérations de sauvegarde/import.

Script `scripts/final-audit/visual-settings-residuals.cjs` : `VISUAL_SOURCE_PREVIEW=1` sert uniquement JS/CSS source pour ce banc avec véritables API Go et **aucune écriture API**. Sans ce flag, il teste les assets embarqués et écrit `visual-settings-residuals-after.json` avec captures `go-after-residual-*`. Le principal doit reconstruire le binaire et refaire ce contrôle natif ; les captures `go-final-*` prises avant cet addendum ne couvrent pas ces trois dernières corrections.

Résidus assumés : nuances de bordure/ombre et certaines petites marges, fixtures Settings incompatibles, contrôle SSO via serveur OIDC vivant non réalisé ; import/restauration de données relève du test backend principal. Aucun pourcentage de100% déclaré.
## Validation native finale du principal

Reconstruction après freeze des agents : `visual-final-results.json` contient40 parcours Go/160 captures finales sans erreur JavaScript ; `go-extras.json` confirme20 empreintes JS/CSS HTTP identiques aux sources. `visual-settings-after.json` :27/27 ; `visual-settings-residuals-after.json` :26/26. Les suites Settings/Admin natives relancées sont toutes réussies. Les attentes de revalidation native dans le rapport initial ci-dessous sont closes. Les données Settings et styles résiduels restent limités comme décrits dans `../FINAL_PARITY_AUDIT.md`. Les nouvelles captures `main-refresh-*` sont diagnostics : l'une expose un skeleton HMR, une autre un setup sans contenu ; elles ne sont pas ajoutées aux160 captures historiques comparatives validées initialement.

