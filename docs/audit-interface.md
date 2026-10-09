# Audit interface, CSS et responsive — 9 octobre 2026

Agent 3. Périmètre des corrections : `web/dist/assets/app.css` uniquement. Aucune modification de `app.js`, `index.html`, des traductions ou des dépendances.

## Références réellement consultées

- `.claude/rules/instructions.md`, `docs/FRONTEND_ARCHITECTURE.md`.
- Frontend Go : feuille CSS entière, structure du shell HTML et gabarits JS des dashboards, flux, authentification et catalogue.
- Historique `origin/main` : `src/app/globals.css`, `src/components/Sidebar.tsx`, `src/components/TimeRangeSelector.tsx`, `src/components/dashboard/DraggableDashboard.tsx`.

Les surfaces, dégradés, couleurs de métriques, cartes et navigation existants reprennent déjà plusieurs choix de `main`. Ils sont conservés. Les affirmations d'accessibilité et de responsive du document d'architecture ne suffisent pas : les défauts suivants sont vérifiables dans les sélecteurs et dimensions du code.

## Problèmes et corrections

| Priorité | Cause et preuve | Correction et statut |
|---|---|---|
| P1 | `.dash-grid-2` imposait des colonnes d'au moins 420 px, `.analysis-grid-3` 320 px ; une fenêtre de 375 px ne peut pas les contenir avec les marges. D'autres grilles imposaient 200 à 280 px, y compris dans les cartes imbriquées. | **Corrigé CSS** : toutes les bornes `minmax(Npx, 1fr)` de cette feuille sont plafonnées à la largeur disponible avec `min(100%, Npx)` ; shell et cartes peuvent rétrécir. Les grilles inline de `app.js` ont été signalées au principal pour intégration séparée. |
| P1 | `.sidebar.collapsed + .main-wrapper` ne correspondait pas au HTML : `#sidebar-backdrop` est intercalé entre ces deux éléments. | **Corrigé** : combinateur de frère général `~`. La marge devient 76 px lorsque le menu est réduit. |
| P1 | Les règles `.sidebar.collapsed` s'appliquaient aussi sur mobile, masquant libellés et sous-menus lorsque la préférence desktop était mémorisée. Le footer conservait trois groupes horizontaux dans 76 px. | **Corrigé CSS** : réduction limitée au desktop, footer compact vertical. Sur mobile le tiroir garde ses libellés et une largeur plafonnée à 86 % de la fenêtre. |
| P1 | `.auth-wrapper` était fixe et `overflow:hidden` ; un formulaire plus haut que l'écran devenait inaccessible, particulièrement en paysage/mobile. | **Corrigé CSS** : défilement vertical, centrage sûr et conteneur sans compression. |
| P2 | Les modales fermées restaient dans l'ordre de navigation clavier : `opacity:0` et `pointer-events:none` ne masquent pas leurs contrôles au clavier. | **Corrigé CSS** : `visibility:hidden` fermé, visible ouvert. Corps réductible/défilant, hauteur bornée au viewport dynamique, footer adaptable. Gestion de focus JavaScript à vérifier séparément. |
| P2 | `.dashboard-tablist` et `.time-pills-bar` pouvaient élargir la page ; les filtres pouvaient se comprimer. | **Corrigé CSS** : largeur plafonnée, défilement horizontal et boutons sans compression. |
| P2 | Badges verts/ambre et certaines résolutions utilisaient des couleurs claires sur les surfaces claires ; texte blanc sur bouton danger rose en thème sombre. | **Corrigé CSS** : variantes de texte foncé en thème clair, texte sombre sur danger rose, bouton danger clair rouge foncé. Palette historique des surfaces conservée. |
| P2 | Absence de `color-scheme` : options des sélecteurs et contrôles natifs ne suivaient pas nécessairement le thème. Absence de style transversal de focus visible. | **Corrigé CSS** : schéma natif clair/sombre, outline clavier et style désactivé. |
| P2 | Les toasts avaient une largeur minimum de 280 px et des marges fixes ; les actions de flux et pagination ne se repliaient pas. | **Corrigé CSS** : toasts contenus, cartes de flux et paginations repliables sous 600 px. |
| P3 | Animations et transitions systématiques, sans respect de la préférence système de réduction des mouvements. | **Corrigé CSS** : média `prefers-reduced-motion`. |

## Validation

- `git diff --check -- web/dist/assets/app.css` : **réussi**.
- Contrôle statique final des blocs CSS : **649 ouvertures / 649 fermetures** après exclusion des commentaires, y compris les styles du module historique et les retouches du header mobile.
- Aucun outil frontend de construction ni dépendance ajouté.
- **Non testé visuellement par cet agent** : le navigateur est réservé au principal pour éviter les collisions de session. Les corrections de dimensions sont fondées sur le DOM/CSS réel, pas sur des captures.
- Les tests Go/build et les tests navigateur consolidés relèvent de la validation du principal. Une compilation Go ne valide pas ces comportements visuels.

## Parité et limites

**Partiellement corrigé** : ergonomie/responsive des composants Go existants. Le style conserve les couleurs et surfaces historiques, mais aucune fidélité pixel par pixel avec les anciennes captures n'est revendiquée.

**À traiter hors CSS** : dates personnalisées et propagation des filtres à toutes les API ; actions des flux ; modales techniques ; logique de navigation et permissions ; formulaires et erreurs réseau ; toutes les grilles et dimensions inline signalées au principal. Les références historiques confirment que le sélecteur de période stockait `timeRange`, `from`, `to` dans l'URL et que la réorganisation du dashboard conservait l'ordre localement. Ces contrats nécessitent une validation JavaScript/API, pas un remplacement décoratif.

**Non testé ici** : données Jellyfin réelles, graphiques interactifs, clavier complet des modales, toutes les langues, desktop/tablette/mobile en navigateur et consommation mémoire.

Retouches après intégration : header desktop/mobile réductible avec filtres repliables, styles dédiés à l'historique et son dialog natif, règle `[hidden] { display:none !important; }` pour respecter la visibilité des onglets et du bouton SSO. Le principal a ensuite vérifié le rendu mobile sans débordement et les parcours décrits dans le rapport consolidé.
