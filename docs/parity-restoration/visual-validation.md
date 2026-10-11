# Validation visuelle de la restauration

La comparaison directe a utilisé les composants historiques de `main` sur `localhost:3341` et le binaire Go QA isolé sur `localhost:3350`. Les captures anciennes de `docs/final-audit/` ont été conservées. Les nouvelles preuves sont dans `docs/parity-restoration/captures/`.

## Environnements et données

- Le contrôle de 145 fichiers historiques TSX/CSS normalisés LF confirme que l'archive des composants est inchangée par rapport aux empreintes vérifiées contre `main`. La preuve est dans `visual-main-aligned-results.json`, champ `archiveIntegrity`.
- La référence emploie son adaptateur Prisma synthétique préexistant; Go utilise les vraies API et une SQLite QA isolée. Aucun remplacement de réponse navigateur ne couvre les fonctionnalités manquantes.
- Le JSON de référence a été aligné par export en lecture seule de la SQLite QA préexistante : 4 utilisateurs, 2 serveurs, 128 médias, 147 lectures, 36 événements et 2 flux. L'ancien JSON est sauvegardé dans `scratch/parity-restoration/qa-users-fixture-before-visual-align.json`.
- Empreinte du JSON aligné : `38d3696c43a4c0be6a20551fc8ebc130c9cd19927d0fe0085ca140c08e6e24cb`.
- Les données de configuration et les services externes ne sont pas intégralement comparables. Les posters, avatars, métadonnées Jellyfin externes, flux live main et métriques de services ne permettent pas une affirmation générale d'égalité des données.

## Preuves exécutées

| Preuve | Portée | Résultat |
|---|---|---|
| `visual-go-before-results.json` | 13 routes, 52 variantes avant intégration finale | Toutes rendues, aucune erreur JS ni débordement du document |
| `visual-main-results.json` | 13 routes, 52 variantes avant alignement temporel | Rendu; `/users` signale le fallback SSR historique `window is not defined` |
| `visual-main-aligned-results.json` | 11 routes, 44 variantes, même fixture exportée | Toutes rendues, aucune erreur JS; première capture dashboard encore affectée par le cache historique |
| `visual-main-stable-dashboard.json` | Dashboard après revalidation du cache `unstable_cache` de 60 secondes | Données dashboard égales à Go, hors flux live de référence |
| `visual-go-final-results.json` | 17 routes, 68 variantes sur le binaire intégré PID25620 | Toutes rendues, 0 erreur JS, 0 débordement global; 12 assets servis identiques aux sources au début de l'exécution |
| `visual-interactions-aligned-retry.json` | Main : 3 onglets dashboard, menus mobiles clair/sombre | 6 contrôles réussis; vrais graphiques visibles après attente de leur chargement |
| `visual-interactions-final.json` | Go : mêmes interactions | 6 contrôles réussis; 10/15/2 canvas sur vue d'ensemble/analyses/réseau; 0 erreur JS |
| `visual-profile-main.json` | Graphiques et historique profil sous le premier écran, clair/sombre | Captures directes comparées aux captures profil Go du sous-agent utilisateurs |
| `visual-wrapped-first-final.json` | 7 étapes Wrapped, desktop/mobile, clair/sombre, main/Go | 56 captures; comparer les titres/progressions, car le premier clic main a précédé la fin de l'hydratation |

Les captures utilisent 1440×900 et 390×844, locale française et thèmes clair/sombre. Les screenshots `*-chart.png` et `*-table.png` donnent des vues après défilement, car `fullPage` ne déroule pas tout le contenu d'un conteneur principal à défilement interne.

## Constats pour la matrice

- `/` — Textes : les libellés historiques du moniteur, du dernier poll, de la dernière synchro, de la dernière sauvegarde et du choix « Tout » sont restaurés dans les captures Go intégrées.
- `/` — Données : les captures stables main et Go donnent 76 lectures, 34% DirectPlay, 42,2h, 4 utilisateurs actifs; aujourd'hui 16 lectures, 8.7h et 4 utilisateurs; catégories 10 films, 30 séries/épisodes, 27 titres musicaux, 9 livres. Les différences initiales 67/36,4h provenaient du cache de référence; leurs preuves sont conservées, sans les utiliser comme verdict final.
- `/users/[id]` — Sections/Ordre : les 11 indicateurs et les groupes de graphiques, genres, fiche technique et historique sont présents dans le même ordre. Les histogrammes jour et heure et la répartition de complétion ont été inspectés réellement sous le premier écran.
- `/users` — Responsive : la page Go intégrée ne déborde pas globalement à 390px. Les contrôles fonctionnels du défilement horizontal du tableau sont dans la suite dédiée du sous-agent utilisateurs.
- `/logs` — Apparence/Tableaux : contrôle restauré des colonnes, dates courtes sur deux lignes, utilisateurs en lien cyan, posters et largeur de la table. Les dimensions et certaines icônes restent des différences de détail; aucune identité pixel par pixel n'est affirmée.
- `/media/collections` — Sections/Ordre : KPI volume/contenu/temps et cartes de collection ont été inspectés; certaines dernières corrections de filtres et d'icônes ont été effectuées après le binaire capturé dans `visual-go-final-results.json`. Une capture supplémentaire de ces corrections est requise avant de les attribuer à ce binaire.
- `/wrapped/[userId]` — Apparence : la comparaison des étapes montre l'anneau horloge historique absent dans le premier binaire intégré, remplacé alors par un nombre de jours; ce constat a été transmis au principal pour correction. Le bouton global de fermeture est réellement visible; son existence est contrôlée dans `index.html`/`navigation.js`, pas seulement dans `app.js`.

## Limites et différences conservées

Les graphiques Canvas/Chart.js et SVG/Recharts ont des orientations, légendes, grilles et détails de tracé différents. Les regroupements, valeurs et interactions ont des preuves ciblées; ces preuves ne certifient pas tous les pixels, tous les états combinatoires ni chaque infobulle.

Main normalise deux fois certains débits audio dans la page journaux; sur la fixture 12Mbps, il affiche 12kbps contre 12000kbps côté Go. Cette différence doit être décrite explicitement : réintroduire une erreur d'unité historique n'est pas une preuve de conformité des données.

Les premiers contrôles d'interactions main ont attendu trop peu longtemps : graphiques encore en placeholders et clic du menu mobile pendant hydratation, puis fermeture hors viewport. `visual-interactions-aligned.json` conserve cet échec. La nouvelle exécution `aligned-retry` attend les composants et valide les vrais menus/graphiques. Le fallback SSR historique `/users` est conservé comme limitation de référence.

Les corrections du code produit et le nombre de cellules clôturées sont détenus par le principal et les sous-agents propriétaires; ce rapport fournit des preuves indépendantes et ne transforme pas une route rendue en conformité visuelle générale.
