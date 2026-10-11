# Reprise ciblée navigation et Wrapped

Référence relue : `main`, composant Sidebar, Settings ClientLayout, MediaHeaderNav, LoginForm, ThemeToggle et WrappedClient. État initial : e3a669f. Agent réellement exécuté : navigation_parity. Aucun commit ni modification de main par cet agent.

## Constats revérifiés

- Sidebar : ordre, groupes, parents, rôles et condition multi-serveur concordent par source. Les sept onglets Paramètres et les quatre/trois onglets Médias concordent aussi.
- `/newsletter` : main ne contient pas d'onglet newsletter dans MediaHeaderNav. Go appelle déjà le même groupe de navigation sans onglet actif. Les deux statuts ouverts Position navigation/Menu parent ne prouvent donc pas un onglet manquant. La restriction de lecture standard est réelle et relève de la correction permissions centrale.
- Les défauts anciens callback connexion, redirection `/users` standard et rayon des onglets Paramètres sont déjà corrigés par e3a669f ; aucune nouvelle correction de ces points n'est revendiquée.
- Wrapped affiche des glyphes approximatifs à la place des icônes Lucide main. Ses titres, contrôles et dimensions d'icônes diffèrent. Le classement du panthéon utilise une étoile 48 px, les autres slides 64 px ; l'introduction utilise Play blanc.
- La configuration Wrapped présente TV avant Musique, contrairement à main. Le graphique des genres historique reste une liste simple dans Go ; cela doit rester ouvert jusqu'à restauration réelle, pas être clos sur présence des données.
- Login : l'icône locale KeyRound est approximative et l'icône de thème est inversée (main Sun en sombre / Moon en clair). La logique d'authentification n'est pas modifiée par cet agent.

## Code modifié

`web/dist/assets/navigation.js` fournit désormais les SVG nommés `play`, `clock`, `date`, `star`, `trending`, `headphones`, `book`, `share`, `chevronLeft`, `chevronRight`, `arrowLeft`, `arrowRight`, `lock`. Réutilisation du moteur d'icônes existant, aucune dépendance. Les autres SVG et les menus ne sont pas réécrits.

`web/dist/assets/wrapped-recovery.css` restaure dimensions, couleurs et marges des icônes, largeur et typographie historiques du contenu, alignement/couleurs/typo des contrôles, grille deux colonnes des types. Les gradients existants et le complément de personnalisation Go restent préservés.

Intégration centrale nécessaire avant validation complète : charger le CSS après profile.css ; remplacer les glyphes de chaque slide par un nom SVG et appeler JellyTrackNavigation.icon(slide.icon) dans le renderer ; remplacer flèches Unicode contrôles et close modal par SVG ; rétablir ordre Général, Movies, Music, TV, Books. Le principal est seul propriétaire app.js/app.css/index.html.

## Preuves et limites

`node --check web/dist/assets/navigation.js` : PASS. `git diff --check` : PASS (avertissements CRLF seulement sur fichiers appartenant aux autres agents). Les sources main ont été relues directement avec git show. Aucun navigateur, aucune capture après intégration et aucune comparaison visuelle directe effectués par cet agent. Les corrections visuelles nécessitent encore les captures et contrôles du principal/visual_validation ; ne pas transformer la vérification source en preuve de fidélité pixel.

Identifiants de reprise proposés : `wrapped-icons`, `wrapped-layout-controls`, `wrapped-type-order`, `login-theme-icons`. La matrice originale n'a pas été modifiée et son historique reste intact.

Mémoire utilisée comme orientation seulement : MEMORY.md lignes 18–26, contexte historique de navigation. Tous les constats sont revérifiés dans les sources actuelles.
